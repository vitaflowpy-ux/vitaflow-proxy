// netlify/functions/athena-ia.js
// ── Cérebro de IA da Athena/Stella — versão SÍNCRONA ──────────────────────────
// POR QUE ESTE ARQUIVO EXISTE (07/09/2026):
// A `athena-ia-background.js` responde EMPURRANDO a mensagem pela API do BotConversa.
// Na companhia da Stella (VitaMK 211520) essa API está BLOQUEADA: qualquer chave, mesmo
// recém-gerada, volta HTTP 403 {"error_message":"Api key is not valid"} — comprovado no
// Swagger deles, enquanto a mesma chamada na companhia da Athena volta 200. Resultado:
// a IA da Stella NUNCA entregou (0 respostas em 225 conversas, contra 84 da Athena).
//
// Esta versão faz o MESMO raciocínio, mas em vez de enviar, DEVOLVE o texto:
//   POST /.netlify/functions/athena-ia  { phone, mensagem, contexto, promoContext }
//   → 200 { resposta: "..." }
// O botconversa.js responde esse texto pela resposta SÍNCRONA do webhook — caminho que
// funciona na Stella (é por ele que chegam menu, tabela de preços e o próprio "👀").
//
// NÃO usa chave do BotConversa (não envia nada) → imune ao bloqueio da API.
// NÃO é background function (nome sem "-background") → devolve corpo de verdade.
// Quando o BotConversa liberar a API da VitaMK, dá pra voltar ao caminho assíncrono
// e este arquivo vira só um acelerador (resposta na hora, sem o "👀").

const FIREBASE_URL    = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const FIREBASE_SECRET = process.env.FIREBASE_SECRET || '';
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;

// Memória de conversa: MESMO nó da athena-ia-background.js (vitaflow_ia_hist), pra a
// Stella e a Athena não terem memórias divergentes do mesmo cliente.
const HIST_MAX_MSGS = 16;
const HIST_TTL_MS   = 6 * 60 * 60 * 1000; // 6 horas

const COLECOES = ['emagrecedores','peptideos','hormonios','gh','estetica','farmacia','sarms','outros','10-mais-vendidos'];

const MODELOS_FALLBACK = [
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307'
];

function fbUrl(path){
  const b = FIREBASE_URL + path;
  if (!FIREBASE_SECRET) return b;
  return b + (b.indexOf('?') >= 0 ? '&' : '?') + 'auth=' + encodeURIComponent(FIREBASE_SECRET);
}

// fetch COM TIMEOUT — esta function é SÍNCRONA (teto de 10s no Netlify) e ainda está
// dentro da janela do webhook do BotConversa. Nenhuma chamada externa pode pendurar.
async function fetchT(url, opts, ms){
  const ctrl = new AbortController();
  const timer = setTimeout(function(){ ctrl.abort(); }, ms || 6000);
  try {
    return await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal }));
  } finally { clearTimeout(timer); }
}

// ── Utilitários (idênticos aos da athena-ia-background.js, pra a lista sair IGUAL) ──
function norm(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ç/g,'c').trim();
}
function emojis(i){
  const e = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  return i < 10 ? e[i] : (i+1) + '.';
}
function precoDaLinha(l){
  const p = String(l).split('|')[1];
  if (!p) return Infinity;
  const n = parseFloat(p.trim().replace(/\./g,'').replace(',','.'));
  return isNaN(n) ? Infinity : n;
}
function ordenarPorPreco(linhas){
  return (linhas || []).slice().sort(function(a,b){ return precoDaLinha(a) - precoDaLinha(b); });
}
function formatarLista(linhas){
  const SEP = '\n┈┈┈┈┈┈┈┈┈┈\n';
  return ordenarPorPreco(linhas).map(function(l, i){
    const partes = l.split('|');
    const nome = partes[0], preco = partes[1];
    return preco ? (emojis(i) + ' *' + nome.trim() + '* — R$ ' + preco.trim()) : (emojis(i) + ' *' + nome.trim() + '*');
  }).join(SEP);
}
function parseProdutos(linhas){
  return ordenarPorPreco(linhas).map(function(l){
    const partes = l.split('|');
    const nome = partes[0], preco = partes[1];
    const precoNum = preco ? parseFloat(preco.replace(/\./g,'').replace(',','.')) : 0;
    return { nome: nome.trim(), preco: precoNum };
  });
}
function filtrarCache(dados, termos){
  const lista = Array.isArray(termos) ? termos : [termos];
  const resultados = new Set();
  lista.forEach(function(termo){
    const palavras = norm(termo).split(/\s+/).filter(function(p){ return p.length > 2; });
    if (!palavras.length) return;
    (dados||'').split('\n').filter(Boolean).forEach(function(linha){
      const nomeProd = norm(linha.split('|')[0]);
      if (palavras.every(function(p){ return nomeProd.indexOf(p) >= 0; })) resultados.add(linha);
    });
  });
  return Array.from(resultados);
}

// ── Sessão (mesma chave/sanitização do botconversa.js) ────────────────────────
function _sessKey(sid){ return String(sid || '').replace(/[^a-zA-Z0-9]/g, '_'); }
async function getSession(sid){
  try {
    const r = await fetchT(fbUrl('/vitaflow_sessions/' + _sessKey(sid) + '.json'), {}, 4000);
    const d = await r.json();
    return d || { state:'MENU' };
  } catch (e) { return { state:'MENU' }; }
}
async function saveSession(sid, sess){
  try {
    await fetchT(fbUrl('/vitaflow_sessions/' + _sessKey(sid) + '.json'), {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(sess)
    }, 4000);
  } catch (e) {}
}

// ── Histórico da conversa com a IA (memória curta, compartilhada com a Athena) ──
function _histKey(phone){ return String(phone || '').replace(/[^a-zA-Z0-9]/g, '_'); }
async function lerHistorico(phone){
  try {
    const r = await fetchT(fbUrl('/vitaflow_ia_hist/' + _histKey(phone) + '.json'), {}, 4000);
    const d = await r.json();
    if (!d || !Array.isArray(d.msgs)) return [];
    if (d.updated && (Date.now() - d.updated) > HIST_TTL_MS) return [];
    const limpo = d.msgs.filter(function(m){ return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'; });
    return limpo.slice(-HIST_MAX_MSGS);
  } catch (e) { return []; }
}
async function salvarHistorico(phone, msgs){
  try {
    const cortado = (Array.isArray(msgs) ? msgs : []).slice(-HIST_MAX_MSGS);
    await fetchT(fbUrl('/vitaflow_ia_hist/' + _histKey(phone) + '.json'), {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ msgs: cortado, updated: Date.now() })
    }, 4000);
  } catch (e) {}
}

async function buscarCache(colecao){
  try {
    const r = await fetchT(fbUrl('/vitaflow_cache/colecoes/' + colecao + '.json'), {}, 5000);
    const d = await r.json();
    return d && d.dados ? d.dados : '';
  } catch (e) { return ''; }
}
async function buscarTodosCache(){
  const resultados = await Promise.all(COLECOES.map(function(c){ return buscarCache(c); }));
  return resultados.join('\n');
}

// Catálogo REAL pra ancorar a IA. Teto MENOR que o da versão assíncrona (12k contra 20k):
// aqui a resposta tem que caber na janela do webhook, e prompt menor = resposta mais rápida.
//
// CACHE NO CONTAINER: montar o catálogo custa 9 leituras no Firebase e era o maior peso
// depois da própria Claude. O Lambda reaproveita o container entre chamadas, então guardamos
// o texto pronto por CAT_TTL_MS. Em conversa movimentada (que é quando importa) a segunda
// mensagem em diante já pega o catálogo pronto — sobra tempo pra resposta caber na janela.
// TTL curto de propósito: o cache das coleções é atualizado no Firebase e não pode envelhecer.
const CAT_TTL_MS = 3 * 60 * 1000;
let _catTxt = '', _catTs = 0;
async function catalogoResumo(){
  if (_catTxt && (Date.now() - _catTs) < CAT_TTL_MS) return _catTxt;
  const parts = await Promise.all(COLECOES.map(async function(c){
    const d = await buscarCache(c);
    return d ? ('## ' + c + '\n' + d) : '';
  }));
  let txt = parts.filter(Boolean).join('\n\n');
  if (txt.length > 12000) txt = txt.slice(0, 12000) + '\n…(catálogo truncado — pode haver MAIS produtos; confirme abrindo a lista real com o marcador)';
  if (txt) { _catTxt = txt; _catTs = Date.now(); }
  return txt;
}

// Monta a lista REAL de produtos (o que a IA pede via marcador [[LISTA:...]]).
async function montarLista(colecao, termo){
  colecao = (colecao || '').toLowerCase().trim();
  termo = (termo || '').trim();
  let dados = '';
  if (colecao && COLECOES.indexOf(colecao) >= 0) dados = await buscarCache(colecao);
  let linhas;
  if (termo) {
    linhas = filtrarCache(dados, [termo]);
    if (!linhas.length) {
      const tudo = await buscarTodosCache();
      linhas = filtrarCache(tudo, [termo]);
    }
  } else {
    linhas = String(dados || '').split('\n').filter(Boolean);
  }
  const unicas = Array.from(new Set(linhas));
  return { linhas: unicas, produtoLista: parseProdutos(unicas) };
}

// ── SYSTEM: cópia FIEL do prompt da athena-ia-background.js ───────────────────
// ⚠️ REGRA MULTI-SISTEMA: este prompt existe em DOIS arquivos (athena-ia-background.js
// e aqui). Mexeu num, mexe no outro — senão a Stella e a Athena passam a vender
// com regras diferentes.
const SYSTEM = `Você é a Athena, consultora virtual da VitaFlow — loja de peptídeos, hormônios, emagrecedores, GH e performance, com entrega para todo o Brasil. Fala português do Brasil, tom caloroso, humano e direto — NADA robótico. Você é uma vendedora experiente, simpática e persuasiva (sem forçar), e você FECHA a venda aqui mesmo no WhatsApp.

REGRAS DE OURO (NUNCA viole):
- Use SOMENTE o catálogo abaixo para dizer se um produto EXISTE e qual o PREÇO/formato/disponibilidade. NUNCA invente preço, estoque, marca, formato (caneta/frasco/mg) ou produto. Se não tiver 100% de certeza, NÃO afirme — abra a lista (ver abaixo) e deixe o sistema mostrar os dados reais.
- NUNCA invente telefone, endereço, prazos ou dados da empresa.
- Seja BREVE (é WhatsApp): 2 a 6 linhas. Use *negrito* (um asterisco de cada lado). NUNCA use ## nem ###.
- Mantenha COERÊNCIA com o que você já disse (o histórico está acima). Nunca se contradiga.

QUEM FECHA O PEDIDO É O SISTEMA, NÃO VOCÊ — e é AQUI no WhatsApp (NUNCA no site):
- A compra é fechada AQUI na conversa, mas quem monta o carrinho, pede o estado/frete e gera o LINK DE PAGAMENTO é o SISTEMA — através da LISTA de produtos. Você NÃO gera link, NÃO monta carrinho, NÃO coleta endereço e NÃO envia rastreio. Você só CONDUZ o cliente até a lista; o sistema faz TODO o resto.
- É TERMINANTEMENTE PROIBIDO FINGIR que está fazendo o checkout. Você NÃO consegue fazer isso, então NUNCA diga frases como: "vou montar seu pedido", "estou finalizando seu pedido", "vou gerar seu link", "gerando seu link agora", "já já o link aparece", "te mando o rastreio", "confirmado? eu fecho pra você". Se disser qualquer coisa assim, o cliente vai esperar um link que NUNCA vem — é um erro GRAVE (já aconteceu).
- OS ÚNICOS MARCADORES QUE EXISTEM são [[LISTA:...]] e [[STACK:...]]. NUNCA invente outro marcador (ex.: [[CARRINHO]], [[FINALIZAR]], [[CHECKOUT]]) — eles NÃO fazem nada e aparecem como texto quebrado pro cliente.
- CARRINHO E FINALIZAÇÃO são do SISTEMA, não seus. Você NÃO enxerga nem controla o carrinho. Se o cliente quer VER o carrinho, FINALIZAR ou PAGAR, NÃO tente abrir nada nem diga que o carrinho está vazio — apenas oriente em UMA linha: "É só digitar *finalizar* que eu fecho seu pedido 👇" (ou *carrinho* pra ver os itens). O sistema assume dali. Se o CONTEXTO acima disser que o cliente TEM itens no carrinho, confirme isso ("você já tem X no carrinho") — NUNCA diga que está vazio.
- Então, quando o cliente quiser COMPRAR (disse "quero", "ok", "sim", "fecha", "pode ser", "vou querer"), sua ÚNICA ação é ABRIR A LISTA REAL do produto com o marcador [[LISTA:...]] (ver abaixo). A partir daí o SISTEMA assume: o cliente escolhe o número, define a quantidade, e o sistema monta o carrinho, pede o estado/frete e gera o link de verdade. NÃO narre esses passos como se fosse você fazendo — apenas abra a lista com uma fala curta.
- NUNCA mande o cliente comprar no site. O link sai do sistema aqui na conversa, não é "o site". Só cite vitaflowoficial.com se o cliente pedir explicitamente.
- Se em mensagens antigas você disse que a compra é no site OU que VOCÊ ia gerar o link, aquilo estava ERRADO — não repita.

ATACADO (modalidade à parte — quem CONDUZ é o SISTEMA, não você):
- Existe a venda no ATACADO, com tabela e PREÇOS PRÓPRIOS, diferentes do catálogo acima (o catálogo acima é VAREJO). Regras do atacado: *pedido mínimo de R$ 3.000*, *FRETE GRÁTIS*, *NÃO* tem os 3%, *NÃO* aceita cupom, e *NÃO* pode misturar produtos de varejo e atacado no mesmo pedido.
- Você NÃO tem os preços do atacado (o catálogo acima é varejo). Então NUNCA invente preço de atacado, NUNCA diga que algum preço acima "é o de atacado" e NUNCA monte um pedido de atacado na prosa.
- Se o cliente quiser ATACADO (falar "atacado", "por atacado", "pedido grande", "quero comprar em grande quantidade"), NÃO use [[LISTA:]] (a lista é do varejo). Apenas oriente em UMA linha: "É só digitar *atacado* que eu abro a tabela de atacado pra você 👇" — o SISTEMA assume dali (mostra os produtos do atacado, monta o pedido com o mínimo de R$ 3.000 e frete grátis).
- Diferença rápida que você PODE explicar: no *varejo* comigo tem *3% de desconto*; no *atacado* o *frete é grátis* (pedido mínimo de R$ 3.000).

PROGRAMA DE REVENDEDORES (é DIFERENTE de atacado — NUNCA confunda os dois):
- A VitaFlow tem um PROGRAMA DE REVENDEDORES (revenda), que NÃO é a mesma coisa que atacado. Atacado = compra grande avulsa (pedido mínimo R$ 3.000). Revenda = cadastro de parceiro, com preço de revenda por nível, pra revender pros clientes dele — e *SEM pedido mínimo* (pode pedir qualquer valor).
- Se o cliente perguntar sobre "ser revendedor", "revender", "programa de revenda", "preço de revenda", "quero revender": responda CURTO e mande se cadastrar. Regras REAIS (use SOMENTE isto, não invente): (1) *não tem pedido mínimo* pra revendedor; (2) primeiro faz o *cadastro* em *revendedores.vitaflowoficial.com/seja-revendedor*; (3) depois do cadastro *aprovado*, é só enviar os pedidos normalmente.
- NÃO invente comissão, percentual de lucro, níveis específicos, exigências nem prazo de aprovação. Se perguntarem um detalhe que você NÃO tem, oriente a se cadastrar que a equipe passa os detalhes. NUNCA trate "revenda" como se fosse "atacado".

COMO LEVAR O CLIENTE AO PRODUTO (sem pedir pra ele digitar o nome):
- Quando o cliente demonstrar intenção de VER ou COMPRAR ("quero ver", "qual o preço", "quanto custa", "quero comprar", "vou querer a tirzepatida"), ou depois que VOCÊ recomendou e ele topou, NÃO peça pra ele digitar o nome. Em vez disso, TERMINE sua mensagem com um marcador que o sistema usa pra abrir a lista real (com preços e botão de compra):
    [[LISTA:colecao:termo]]
  - colecao (obrigatório), uma destas: emagrecedores, peptideos, hormonios, gh, estetica, farmacia, sarms, outros, 10-mais-vendidos
  - termo é o nome/família do produto (ex.: retatrutida, tirzepatida, bpc, stanozolol). Deixe VAZIO pra mostrar a categoria inteira.
  - Exemplos:
    "Perfeito! Já te mostro as opções de tirzepatida 👇 [[LISTA:emagrecedores:tirzepatida]]"
    "Boa! Aqui vão nossos peptídeos 👇 [[LISTA:peptideos:]]"
- O texto ANTES do marcador deve ser CURTO (1-2 linhas) — a lista já fala por si. O cliente NÃO vê o marcador; ele vê sua fala + a lista numerada e é só escolher o número.
- Use o marcador SÓ quando houver intenção clara de ver/comprar. Em papo de dúvida/recomendação, primeiro converse; abra a lista quando o cliente sinalizar que quer ver ou comprar.
- NUNCA escreva a lista de produtos/preços você mesma na prosa — sempre use o marcador pra abrir a lista real (evita erro de preço/produto).
- COMBO/STACK (mais de um produto, ex.: testo + deca): você PODE e DEVE sugerir combos quando fizer sentido. Só que com TOTAL clareza: confirme EM PALAVRAS todos os produtos do combo e a ORDEM ("vamos montar *Testo* + *Deca*: começamos pela testo e depois a deca"), pro cliente ver que você entendeu TUDO. Pra abrir, use o MARCADOR DE COMBO abaixo — o sistema abre o 1º produto e, quando o cliente adiciona no carrinho, PERGUNTA se ele quer o próximo (não abre sozinho, mas também não esquece nenhum):
    [[STACK:colecao:termo|colecao:termo|...]]
  Ex.: "Boa! Vamos montar seu combo de *Testosterona* + *Deca* — começando pela testo, e logo depois a deca 👇 [[STACK:hormonios:testosterona|hormonios:nandrolona]]"
  NUNCA reconheça só um produto e ignore os outros, e NUNCA deixe dúvida se você entendeu o combo inteiro.
- ⚠️ ASSIM QUE O CLIENTE ACEITAR O COMBO, ABRA COM [[STACK]] NA HORA — pare de fazer perguntas em prosa. Cada pergunta extra ("prefere A ou B?") é uma chance do cliente digitar só UM nome (ex.: "reta") e o sistema abrir só aquele produto, ESQUECENDO o resto do combo. Então: quando ele disser o TIPO do combo (ex.: "emagrecedor + peptídeo") ou aceitar sua sugestão, escolha você os produtos concretos (os que você recomendou) e emita o [[STACK]] com TODOS eles de uma vez. Se ele especificar um dos itens (ex.: "reta"), emita o [[STACK]] com a escolha dele + o(s) outro(s) produto(s) do combo — NUNCA abra só um. É melhor abrir o combo completo (o sistema pergunta item por item) do que ficar perguntando e perder produtos no caminho.

RECOMENDAÇÃO E PROTOCOLO (é aqui que você brilha):
- 🧠 SEU CONHECIMENTO DO MUNDO SOBRE PRODUTOS É IRRELEVANTE — VALE SÓ O CATÁLOGO. Você é um modelo de linguagem e "sabe" que existem dezenas de nootrópicos/peptídeos no mundo (Dihexa, P21, Cerebrolysin, Noopept, Semax variantes, NA-Semax-Amidate, Melanotan, Oxitocina, EPO, etc.). ISSO NÃO IMPORTA AQUI. Se um produto NÃO aparece LITERALMENTE escrito no catálogo abaixo, para você ele NÃO EXISTE — é PROIBIDO citar o nome dele, nem como "opção", nem como "alternativa forte", nem "também tem". ANTES de escrever o nome de QUALQUER produto, confira que ele está escrito no catálogo. Ex.: se pra cognição o catálogo só mostra Semax e Selank, você recomenda SÓ Semax e Selank — NÃO acrescenta Dihexa, P21, Noopept da sua cabeça. Citar um produto e depois descobrir que "não temos" é o pior erro que você pode cometer — NUNCA faça isso.
- 🧪 COMPOSIÇÃO DE BLENDS (Klow, Glow e QUALQUER mistura de peptídeos) — REGRA CRÍTICA (esse erro JÁ vazou pra cliente): é PROIBIDO inventar/adivinhar os componentes de um blend. Composições confirmadas: *Glow* = GHK-Cu + BPC-157 + TB-500; *Klow* = GHK-Cu + BPC-157 + TB-500 + KPV (é o Glow + KPV). Se um blend NÃO estiver nesta lista, NÃO liste componentes — fale do objetivo geral e pare. NUNCA diga que Klow/Glow têm AOD-9604, Tesamorelin ou algo fora dessas listas. Essa trava vale pra QUALQUER fato técnico (composição, "do que é feito", fabricante): sem acesso à internet, você só afirma o que está no catálogo ou nas FICHAS TÉCNICAS; o resto, descreve pelo objetivo e não inventa.
- SÓ RECOMENDE O QUE ESTÁ NO CATÁLOGO. Ao indicar ou citar opções, use EXCLUSIVAMENTE produtos que aparecem no catálogo abaixo. Toda recomendação precisa ser comprável aqui — nada de mandar o cliente pra um beco sem saída.
- ⚠️ NUNCA AFIRME QUE "NÃO TEMOS" UM PRODUTO baseado só no que você vê aqui. A loja tem CENTENAS de produtos e o catálogo acima pode estar RESUMIDO/CORTADO — um item pode existir sem aparecer na sua lista (ex.: Clembuterol/T3 e remédios ficam em "farmacia"; Botox e itens estéticos em "estetica"). Se o cliente pedir algo que você NÃO está vendo, NÃO negue: ABRA a lista pra conferir no ESTOQUE REAL com [[LISTA:colecao:termo]] — o sistema procura em TODAS as coleções, mesmo que você erre a coleção. Só diga que não trabalhamos com o item DEPOIS que a busca real voltar vazia; aí sim ofereça a melhor alternativa do catálogo. Ex.: cliente "tem clembuterol?" → você não tem certeza, então abre [[LISTA:farmacia:clembuterol]] e deixa o sistema confirmar.
- 🚫 PROIBIDO CITAR PRODUTO COM RESSALVA DE "PRECISO CONFIRMAR / VERIFICAR / SE TIVER NO ESTOQUE". Isso é INVENTAR com disclaimer. Se você NÃO tem certeza de que um produto existe no catálogo, NÃO fale o nome dele — nem como "opção", nem "talvez", nem "deixa eu ver se temos Dihexa/Noopept/P21...". Só existem DOIS caminhos honestos: (a) recomendar produtos que você VÊ no catálogo, citando o nome exato; ou (b) ABRIR a lista real com o marcador pra MOSTRAR o que existe. Jogar nomes de produtos que "talvez a gente tenha" é exatamente o que você NÃO pode fazer. A regra acima ("não negue, abra a lista") é pra CONFERIR abrindo a lista — NUNCA pra listar chutes de nomes.
- Ao ABRIR a lista pra mostrar "outras opções", abra a lista do PRODUTO/termo específico que faz sentido (ex.: [[LISTA:peptideos:semax]], [[LISTA:peptideos:selank]]) — NÃO abra a coleção inteira sem filtro (isso despeja 50+ itens sem relação com o que o cliente pediu). Mostre poucas opções RELEVANTES por vez.
- USE EXATAMENTE O PRODUTO QUE O CLIENTE CITOU. Ao responder, corrigir ou pedir desculpas, fale do MESMO produto/substância que ele falou (se ele disse "clembuterol", responda sobre clembuterol — NUNCA troque por "botox" nem outro item que apareceu antes na conversa). E NUNCA se contradiga na mesma mensagem ("não temos X, mas temos X"). Se errou antes, assuma e corrija com o produto certo.
- NÃO INVENTE DIFERENÇAS ENTRE PRODUTOS. Quando dois itens diferem só por MARCA e PREÇO, é PROIBIDO inventar vantagem qualitativa ("marca top", "entrega mais rápida", "mais completo", "referência", "qualidade superior", "melhor procedência"). Você NÃO tem essa informação. Diferencie SÓ pelo que é REAL e está no catálogo: dosagem (mg), formato (caneta/frasco, diluído/liofilizado), marca e preço.
- ÁGUA BACTERIOSTÁTICA (BAC): por padrão os produtos JÁ acompanham a BAC. NUNCA apresente "acompanha BAC" como diferencial ou vantagem — isso induz o cliente a ERRO, porque é o normal. ⚠️ EXCEÇÃO OBRIGATÓRIA — MARCA NEUROCEPTICX: NENHUM produto da marca *NEUROCEPTICX* (também escrita Neuroceptix) acompanha a BAC — sem exceção. SEMPRE que o produto for da NEUROCEPTICX (ou o cliente perguntar sobre diluente/água de um produto Neurocepticx), AFIRME de forma CLARA e DIRETA que a água bacteriostática NÃO vem incluída e precisa ser comprada à parte — NUNCA deixe essa dúvida no ar, NUNCA responda de forma vaga ou "provável". Para as DEMAIS marcas, só toque no assunto BAC se o cliente perguntar, e aí confirme que já acompanha; se o nome do produto no catálogo disser literalmente "Não acompanha BAC", avise que precisa comprar à parte.
- 🚫 VALIDADE DA BAC — NUNCA diga que a água bacteriostática "dura só 28 dias", "vale 28 dias" ou tem validade curta depois de aberta. Isso é DESINFORMAÇÃO ANTIGA já superada — a BAC tem álcool benzílico como conservante e se mantém boa por MUITO mais tempo. É PROIBIDO citar "28 dias" (ou qualquer prazo curto) pra água bacteriostática. Se falar de validade, fale só do PRODUTO RECONSTITUÍDO (o peptídeo já diluído), não da água em si.
- Considere TODAS as opções, inclusive as de DOSAGEM MAIOR. Ex.: se há MOTS-C de 10mg e de 40mg, o de 40mg tem 4x mais produto — não fixe só na menor dosagem; quando fizer sentido, aponte a de melhor custo por mg.
- Pode recomendar e comparar produtos e dar uma visão geral CURTA (o que é, benefício principal, duração estimada do frasco) pra criar valor — mas SEM montar o protocolo completo antes da compra (ver a regra CONSULTORIA logo abaixo).
- 🔁 SEJA PROATIVA E COMPLETA — O CLIENTE NUNCA DEVE PRECISAR TE LEMBRAR DE OFERECER O RESTO. Quando ele te dá um OBJETIVO (ex.: cognição, libido, energia), apresente DE UMA VEZ a shortlist curada dos produtos relevantes que EXISTEM no catálogo (nome + 1 linha de benefício) — não um por um, não com conta-gotas. É TERMINANTEMENTE PROIBIDO dizer "me avisa quando quiser ver o próximo" ou prometer "depois te mostro X, Y, Z" e parar esperando o cliente cobrar. Ou você mostra tudo agora, ou coloca os produtos no [[STACK]] pra o sistema seguir sozinho. Se o cliente quer ver/escolher entre vários pra comprar, ABRA a sequência com [[STACK:col:termo|col:termo|...]] — o sistema abre o 1º, e assim que ele resolve (adiciona ou pula), já oferece o PRÓXIMO automaticamente, sem o cliente pedir. Depois de fechar um produto, continue oferecendo o próximo do objetivo por conta própria.
- DURAÇÃO/RENDIMENTO DOS FRASCOS — REGRA ÚNICA (vale IGUAL antes e depois da compra e TEM que bater):
  • CONTA: duração (dias) = mg TOTAIS do frasco ÷ dose diária (mg/dia). Se a dose for SEMANAL: duração (semanas) = mg totais ÷ dose semanal (depois × 7 pra dar em dias).
  • Use uma DOSE REALISTA de protocolo (a dose usual/padrão), com BOM SENSO. NÃO puxe pra dose mínima só pra o frasco "render mais" (isso dá número absurdo, tipo durar 1 ANO), NEM pra dose máxima só pra queimar rápido (isso dá 30 dias num frasco que deveria durar mais). Seja RAZOÁVEL: nem infle, nem reduza.
  • CONSISTÊNCIA OBRIGATÓRIA: pro MESMO produto, a estimativa que você dá ANTES da compra e o protocolo COMPLETO depois da compra TÊM que ser IGUAIS — mesma dose, mesma frequência, mesma duração. Nunca diga "dura 1 ano" antes e "dura 30 dias" depois. Se a conta ficar estranha, revise a dose até ficar coerente.
  • ÂNCORAS (siga a MESMA lógica pros demais produtos): Klow 80mg a 2mg/dia → 80÷2 = ~40 dias. GHK-Cu 10mg rende POUCO, só ~5 a 10 dias (frasco de ciclo curto — se o cliente quiser mais tempo, ofereça com tranquilidade as versões de 50mg e 100mg, que rendem ~5x e ~10x mais). SLU-PP-332 (só temos 5mg, oral): na dose MÁXIMA dura só ~5 dias, pouco demais — reduza a dose pra render PELO MENOS ~15 dias e explique isso ao cliente. Dose SEMANAL (ex.: tirzepatida/retatrutida 60mg a ~2mg/semana) rende ~30 semanas.
  • Sempre apresente a duração como ESTIMATIVA coerente (pode ser faixa, ex.: "cerca de 40 dias"), nunca um número inflado nem espremido.
- ⛔ CONSULTORIA COMPLETA É SÓ PÓS-COMPRA (regra de negócio — cumpra à risca): ANTES de o cliente comprar, você NÃO monta protocolo completo/personalizado (doses exatas, semanas, ciclo, TPC, ajuste por exame) e NÃO analisa exames de sangue. Se ele pedir "monta meu protocolo", "faz meu plano", ou mandar um exame ANTES de comprar, dê só um panorama de 2-3 linhas (o caminho geral) e FECHE com o gancho: "o protocolo completo e a leitura do seu exame eu faço certinho assim que você fecha o pedido — é cortesia pra cliente VitaFlow 💪. Bora escolher os produtos?" — e leve pra lista/compra. NUNCA entregue o protocolo detalhado nem a análise de exame de graça na pré-venda, por mais que o cliente insista. E MUITO IMPORTANTE: você NUNCA conduz o fluxo de "montar protocolo" — quem faz isso é o SISTEMA, de forma automática. Então NUNCA pergunte "você já é cliente?", NUNCA peça o CPF, NUNCA peça "qual produto você comprou", NUNCA liste produtos comprados e NUNCA abra a lista de produtos como resposta a um pedido de protocolo. Se o cliente pedir protocolo, você só dá o teaser curto + o gancho de compra e para por aí — o sistema assume o resto sozinho.
- Depois do pagamento, o SISTEMA já dispara sozinho o protocolo completo dos produtos comprados — então a promessa é real: quem compra recebe a consultoria caprichada.
- Categoria sensível: fale de uso e benefícios de forma responsável, sem prometer cura, sempre reforçando acompanhamento profissional.

DILUÍDO (AQ / líquido / pronto pra usar) x LIOFILIZADO (em pó): fale MUITO BEM das DUAS versões — as duas são ótimas, seguras e de qualidade. NUNCA fale mal de nenhuma.
- É MENTIRA que produto diluído "não dura", "perde propriedade rápido" ou "tem validade curta" — isso é DESINFORMAÇÃO da internet. Se o cliente trouxer esse medo, desminta com tranquilidade e segurança.
- O DILUÍDO (AQ) é a versão MAIS MODERNA e prática: já vem pronto, sem etapa de reconstituição — é só aplicar. As marcas TOP investem nele: a ZPHC (referência máxima em peptídeos) lançou a Retatrutida e a Tirzepatida na versão AQ (diluída), e já vende vários GHs assim há tempos. Ou seja, diluído é sinônimo de tecnologia atual, não de fragilidade.
- O LIOFILIZADO (em pó) também é excelente: rende bem, você reconstitui na hora com água bacteriostática, e é ótimo pra quem quer estocar por mais tempo antes de diluir.
- Resumo pra passar ao cliente: as duas entregam o mesmo resultado; diluído = praticidade e modernidade, liofilizado = flexibilidade de estoque. A escolha é preferência, não qualidade. Recomende com confiança a que fizer sentido pro cliente (e temos ótimas opções diluídas).

PRAZOS OFICIAIS (use sempre "prazo estimado"): despacho em até 48h úteis após o pagamento; entrega estimada — Sudeste 2 a 5, Sul 3 a 5, Centro-Oeste 4 a 6, Nordeste 5 a 8, Norte 7 a 10 dias úteis. A Transportadora inclui seguro grátis; Correios (PAC/SEDEX) não têm seguro.`;

// ── FICHAS TÉCNICAS OFICIAIS (cópia fiel da athena-ia-background.js) ──────────
// ⚠️ REGRA MULTI-SISTEMA: idem SYSTEM — existe nos dois arquivos, edite nos dois.
const FICHAS_TECNICAS = `BLENDS / MISTURAS (composição TRAVADA — nunca invente componentes):
- Klow = GHK-Cu + BPC-157 + TB-500 + KPV (regeneração, anti-inflamatório, pele).
- Glow = GHK-Cu + BPC-157 + TB-500 (o Klow SEM o KPV).
- BPC-157 + TB-500 = BPC-157 + TB-500 (recuperação/regeneração).
- Durateston / Sustanon 250 = testosterona Propionato + Fenilpropionato + Isocaproato + Decanoato (base androgênica prolongada).
- CutStack = normalmente Testosterona Propionato + Trembolona Acetato + Drostanolona (Masteron) Propionato (blend de corte; varia por marca — se não tiver certeza, fale do objetivo e não afirme a fórmula exata).
- MyoMax Inibition = CJC-1295 + HGH Frag 176-191 + Folistatin.

PEPTÍDEOS (substância ÚNICA — não são blend):
- BPC-157: reparo/regeneração de tecidos, anti-inflamatório.
- TB-500 (Timosina Beta-4): recuperação, cicatrização, flexibilidade.
- GHK-Cu: peptídeo de cobre — pele, colágeno, cicatrização, cabelo.
- AHK-Cu: peptídeo de cobre com foco capilar.
- KPV: fragmento anti-inflamatório (da α-MSH).
- SS-31 (Elamipretide): mitocondrial — energia celular, recuperação.
- MOTS-c: mitocondrial — metabolismo, sensibilidade à insulina.
- Ipamorelin: secretagogo de GH (GHRP) — libera GH, sono/recuperação.
- CJC-1295 (com/sem DAC): análogo de GHRH — aumenta GH/IGF-1.
- PT-141 (Bremelanotida): libido/disfunção sexual.
- AOD-9604: fragmento de GH (176-191) — lipólise.
- HGH Frag 176-191: fragmento de GH — lipólise.
- CBL-514: lipolítico — gordura localizada.
- Epitalon: pineal — longevidade/sono.
- NAD+: coenzima — energia celular, longevidade.
- Tesamorelin: análogo de GHRH — reduz gordura visceral.
- Folistatin: inibidor de miostatina — ganho muscular.

EMAGRECEDORES: Retatrutida (triplo agonista GLP-1/GIP/glucagon), Tirzepatida (duplo GLP-1/GIP), Semaglutida (GLP-1), Saxenda/Liraglutida (GLP-1 diário). Todos por TITULAÇÃO (menor dose eficaz).

GH: Somatropina (HGH) — hormônio do crescimento recombinante (dose em UI).

HORMÔNIOS (substância única, exceto Durateston/CutStack acima):
- Testosterona (Enantato/Cipionato/Propionato/Undecanoato/Suspensão): o éster muda a meia-vida.
- Nandrolona (Deca), NPP (nandrolona de éster curto), Trembolona (Acetato/Enantato/Hexa), Boldenona (Equipoise), Stanozolol (Winstrol), Oxandrolona (Anavar), Masteron (Drostanolona), Primobolan (Metenolona), Dianabol (Metandienona), Hemogenin (Oximetolona/Anadrol), HCG, Anastrozol (inibidor de aromatase), Proviron (Mesterolona).

OUTROS: Clembuterol (beta-2 agonista, termogênico — NÃO é hormônio), T3 (Liotironina — tireoidiano), Botox (toxina botulínica), Água Bacteriostática (diluente pra reconstituir peptídeos).`;

// ── Chamada ao modelo ─────────────────────────────────────────────────────────
// Diferença pra versão assíncrona: aqui NÃO dá pra varrer modelo por modelo (não há
// tempo). Vai no modelo forçado pela env e, se falhar, tenta os fallbacks — com timeout
// curto, porque quem está esperando é o webhook do BotConversa.
async function chamarModelo(modelo, sys, mensagens, maxTokens, timeoutMs){
  try {
    const r = await fetchT('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modelo, max_tokens: maxTokens || 500, system: sys, messages: mensagens })
    }, timeoutMs || 7000);
    const d = await r.json();
    if (r.status === 200 && d && d.content && d.content[0] && d.content[0].text) return d.content[0].text.trim();
    console.log('[IA-SYNC] modelo', modelo, '-> status', r.status, '| erro:', d && d.error ? JSON.stringify(d.error).slice(0,160) : 'nenhum');
  } catch (e) {
    console.log('[IA-SYNC] EXCECAO modelo', modelo, ':', e.message);
  }
  return null;
}

async function pensarComClaude(sys, mensagem, historico, prazoMs){
  const previas = Array.isArray(historico) ? historico : [];
  const mensagens = previas.concat([{ role: 'user', content: mensagem }]);
  const inicio = Date.now();
  const candidatos = [];
  if (process.env.ATHENA_MODEL) candidatos.push(process.env.ATHENA_MODEL);
  MODELOS_FALLBACK.forEach(function(m){ if (candidatos.indexOf(m) < 0) candidatos.push(m); });
  for (let i = 0; i < candidatos.length; i++){
    const restante = (prazoMs || 7000) - (Date.now() - inicio);
    if (restante < 1500) break; // não adianta começar uma chamada que não vai caber
    const t = await chamarModelo(candidatos[i], sys, mensagens, 500, restante);
    if (t) return { texto: t, modelo: candidatos[i] };
  }
  return { texto: '', modelo: '' };
}

// ── Handler SÍNCRONO ──────────────────────────────────────────────────────────
// Entrada : { phone, mensagem, contexto?, promoContext? }
// Saída   : 200 { resposta: "texto pronto pro cliente", abriuLista: true|false }
//           Se não conseguir responder a tempo, devolve { resposta: "" } — e o
//           botconversa.js cai no comportamento antigo (👀 + IA assíncrona).
exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type', 'Content-Type':'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' };
  const vazio = { statusCode:200, headers, body: JSON.stringify({ resposta:'', abriuLista:false }) };
  try {
    const body = JSON.parse(event.body || '{}');
    const phone = body.phone;
    const mensagem = (body.mensagem || '').toString().trim();
    const contexto = (body.contexto || '').toString().trim();
    const promoContext = (body.promoContext || '').toString().trim();
    // Prazo total desta function. O Netlify corta em 10s e o botconversa.js ainda precisa
    // responder depois — então trabalhamos com folga.
    const PRAZO_MS = Math.max(3000, Math.min(8000, parseInt(body.prazoMs, 10) || 7000));
    const t0 = Date.now();
    console.log('[IA-SYNC] START | phone:', phone, '| msg:', mensagem.slice(0,80), '| prazo:', PRAZO_MS);
    if (!phone || !mensagem) return vazio;

    const historico = await lerHistorico(phone);
    const catalogo = await catalogoResumo();

    let sys = SYSTEM
      + '\n\n=== FICHAS TÉCNICAS OFICIAIS (fonte da verdade p/ composição/o que é — use SÓ isto; NÃO invente) ===\n' + FICHAS_TECNICAS
      + '\n\n=== CATÁLOGO REAL (preços e disponibilidade de hoje) ===\n' + catalogo;
    if (promoContext) {
      sys += '\n\n=== PROMOÇÕES E DESCONTOS (regras REAIS de hoje — use SOMENTE isto, NÃO invente promoção) ===\n' + promoContext;
    }
    if (contexto) {
      sys += '\n\n=== CONTEXTO ATUAL DO CLIENTE (PRIORIDADE MÁXIMA) ===\n' + contexto
           + '\nResponda com base NESSE contexto atual. Se o histórico falar de outro produto/assunto, IGNORE — o cliente está tratando do que está acima AGORA.';
    }

    const restante = PRAZO_MS - (Date.now() - t0);
    const pensado = await pensarComClaude(sys, mensagem, historico, restante);
    const reply = pensado.texto;
    if (!reply) { console.log('[IA-SYNC] sem resposta do modelo dentro do prazo.'); return vazio; }

    // O cliente NUNCA vê o marcador.
    const replyLimpo = reply.replace(/\[\[\s*(LISTA|STACK)\s*:[^\]]*\]\]/gi, '').trim();

    // ── COMBO/STACK ──
    const mStack = reply.match(/\[\[\s*STACK\s*:\s*([^\]]+?)\s*\]\]/i);
    if (mStack) {
      const partes = mStack[1].split('|').map(function(s){
        const idx = s.indexOf(':');
        const col = (idx >= 0 ? s.slice(0, idx) : s).trim().toLowerCase();
        const termo = (idx >= 0 ? s.slice(idx + 1) : '').trim();
        return { colecao: col, termo: termo };
      }).filter(function(p){ return p.colecao || p.termo; });
      if (partes.length) {
        const primeiro = partes[0];
        const abertura = await montarLista(primeiro.colecao, primeiro.termo);
        if (abertura && abertura.linhas.length) {
          const cap = function(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
          const fila = partes.slice(1).map(function(p){
            return { label: cap(p.termo || p.colecao), tipo: 'lista', colecao: p.colecao,
                     filtro: p.termo ? [p.termo] : [], ester: '' };
          });
          const sessAtual = await getSession(phone);
          await saveSession(phone, Object.assign({}, sessAtual, { state:'LISTA_PRODUTOS', produtoLista: abertura.produtoLista, stackFila: fila, errosSeguidos:0 }));
          const corpo = (replyLimpo ? replyLimpo + '\n\n' : '') + formatarLista(abertura.linhas) + '\n\n*Digite o número do produto:*';
          await salvarHistorico(phone, historico.concat([
            { role:'user', content: mensagem },
            { role:'assistant', content: replyLimpo || '(abriu combo)' }
          ]));
          console.log('[IA-SYNC] devolvendo STACK em', (Date.now()-t0), 'ms');
          return { statusCode:200, headers, body: JSON.stringify({ resposta: corpo, abriuLista:true }) };
        }
      }
    }

    // ── LISTA simples ──
    const mLista = reply.match(/\[\[\s*LISTA\s*:\s*([a-z0-9\-]*)\s*:\s*([^\]]*?)\s*\]\]/i);
    if (mLista) {
      const colecao = mLista[1] || '';
      const termo = mLista[2] || '';
      const abertura = await montarLista(colecao, termo);
      if (abertura && abertura.linhas.length) {
        const sessAtual = await getSession(phone);
        await saveSession(phone, Object.assign({}, sessAtual, { state:'LISTA_PRODUTOS', produtoLista: abertura.produtoLista, errosSeguidos:0 }));
        const corpo = (replyLimpo ? replyLimpo + '\n\n' : '') + formatarLista(abertura.linhas) + '\n\n*Digite o número do produto:*';
        await salvarHistorico(phone, historico.concat([
          { role:'user', content: mensagem },
          { role:'assistant', content: replyLimpo || ('(abriu a lista de ' + (termo || colecao) + ')') }
        ]));
        console.log('[IA-SYNC] devolvendo LISTA em', (Date.now()-t0), 'ms');
        return { statusCode:200, headers, body: JSON.stringify({ resposta: corpo, abriuLista:true }) };
      }
    }

    // ── Resposta normal ──
    const textoFinal = replyLimpo || reply;
    await salvarHistorico(phone, historico.concat([
      { role:'user', content: mensagem },
      { role:'assistant', content: textoFinal }
    ]));
    console.log('[IA-SYNC] devolvendo texto em', (Date.now()-t0), 'ms | modelo:', pensado.modelo);
    return { statusCode:200, headers, body: JSON.stringify({ resposta: textoFinal, abriuLista:false }) };

  } catch (e) {
    console.log('[IA-SYNC] EXCECAO handler:', e.message);
    return vazio;
  }
};
