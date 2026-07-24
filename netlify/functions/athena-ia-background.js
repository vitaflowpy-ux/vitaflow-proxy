// netlify/functions/athena-ia-background.js
// ── Cérebro de IA da Athena (ASSÍNCRONO) ──────────────────────────────────────
// Chamado pelo botconversa.js quando o cliente escreve algo que os menus NÃO entendem.
// Responde natural (Claude), ANCORADO no catálogo REAL (nada de inventar preço/estoque),
// e ENTREGA a resposta pelo BotConversa (API) — NÃO depende da janela síncrona do webhook,
// por isso NÃO dá timeout (é o que derrubava o galho de IA antigo).
//
// IMPORTANTE: o nome do arquivo TEM que terminar em "-background.js" pra rodar como
// Netlify Background Function (roda até ~15 min, sem o limite de ~10s do webhook normal).
//
// >>> RECURSOS: <<<
//   (1) Testa uma lista de modelos até um funcionar (resolve 404 de modelo).
//   (2) URL do BotConversa com "/webhook" (base correta).
//   (3) MEMÓRIA de conversa (nó `vitaflow_ia_hist/{phone}`): a IA lembra das últimas trocas.
//   (4) A IA ABRE A LISTA REAL DE PRODUTOS sozinha, sem o cliente digitar o nome.
//       Quando ela decide mostrar produtos, ela põe um marcador [[LISTA:colecao:termo]] no
//       fim da resposta; aqui a gente monta a lista de verdade (do cache), grava a sessão
//       como LISTA_PRODUTOS (pro botconversa.js continuar o fluxo: número → carrinho → pagamento)
//       e manda a fala + a lista numerada. O cliente só escolhe o número.

const BOTCONVERSA_KEY  = '8c9e69c3-3c9f-4f23-b480-be4a0de29640'; // confere com a chave do painel BotConversa
// CORRIGIDO: a base certa da API do BotConversa tem "/webhook" no fim (fonte: app oficial no Pipedream).
const BOTCONVERSA_BASE = 'https://backend.botconversa.com.br/api/v1/webhook';
const FIREBASE_URL     = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const FIREBASE_SECRET  = process.env.FIREBASE_SECRET || '';
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY;

// ── MEMÓRIA DE CONVERSA (ajuste fino aqui) ────────────────────────────────────
// HIST_MAX_MSGS: quantas mensagens (user+assistant) guardar. 16 = ~8 trocas.
// HIST_TTL_MS:   depois de quanto tempo sem falar a conversa "esfria" e começa do zero.
const HIST_MAX_MSGS = 16;
const HIST_TTL_MS   = 6 * 60 * 60 * 1000; // 6 horas

// Coleções válidas do catálogo (mesmas que o botconversa.js usa).
const COLECOES = ['emagrecedores','peptideos','hormonios','gh','outros','10-mais-vendidos'];

// Fallbacks caso o /v1/models não retorne nada. A env ATHENA_MODEL, se existir, entra na frente.
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

// ── Utilitários (mesma lógica do botconversa.js, pra a lista sair IDÊNTICA) ────
function norm(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ç/g,'c').trim();
}
function emojis(i){
  const e = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  return i < 10 ? e[i] : `${i+1}.`;
}
// Preço numérico de "nome|preco" (BR: "2.249,00" -> 2249). Sem preço vai pro FIM.
function precoDaLinha(l){
  const p = String(l).split('|')[1];
  if (!p) return Infinity;
  const n = parseFloat(p.trim().replace(/\./g,'').replace(',','.'));
  return isNaN(n) ? Infinity : n;
}
// Ordena do MENOR pro MAIOR preço — mesmo critério em formatarLista E parseProdutos, pra o
// número mostrado bater com o produto escolhido.
function ordenarPorPreco(linhas){
  return (linhas || []).slice().sort((a, b) => precoDaLinha(a) - precoDaLinha(b));
}
function formatarLista(linhas){
  const SEP = '\n┈┈┈┈┈┈┈┈┈┈\n';
  return ordenarPorPreco(linhas).map((l, i) => {
    const [nome, preco] = l.split('|');
    return preco ? `${emojis(i)} *${nome.trim()}* — R$ ${preco.trim()}` : `${emojis(i)} *${nome.trim()}*`;
  }).join(SEP);
}
function parseProdutos(linhas){
  return ordenarPorPreco(linhas).map(l => {
    const [nome, preco] = l.split('|');
    const precoNum = preco ? parseFloat(preco.replace(/\./g,'').replace(',','.')) : 0;
    return { nome: nome.trim(), preco: precoNum };
  });
}
// Divide texto longo em pedaços de no máx maxLen chars, quebrando ENTRE linhas.
// O WhatsApp recusa mensagem única muito grande — uma lista aberta pela IA pode estourar.
function partirMensagem(txt, maxLen){
  maxLen = maxLen || 3800;
  if (!txt || txt.length <= maxLen) return [txt || ''];
  const linhas = String(txt).split('\n');
  const partes = [];
  let buf = '';
  for (const ln of linhas){
    const cand = buf ? buf + '\n' + ln : ln;
    if (buf && cand.length > maxLen){ partes.push(buf); buf = ln; }
    else buf = cand;
  }
  if (buf) partes.push(buf);
  return partes;
}
function filtrarCache(dados, termos){
  const lista = Array.isArray(termos) ? termos : [termos];
  const resultados = new Set();
  lista.forEach(termo => {
    const palavras = norm(termo).split(/\s+/).filter(p => p.length > 2);
    if (!palavras.length) return;
    (dados||'').split('\n').filter(Boolean).forEach(linha => {
      const nomeProd = norm(linha.split('|')[0]);
      if (palavras.every(p => nomeProd.includes(p))) resultados.add(linha);
    });
  });
  return [...resultados];
}

// ── Sessão (mesma chave/sanitização do botconversa.js) ────────────────────────
function _sessKey(sid){ return String(sid || '').replace(/[^a-zA-Z0-9]/g, '_'); }
async function getSession(sid){
  try {
    const r = await fetch(fbUrl(`/vitaflow_sessions/${_sessKey(sid)}.json`));
    const d = await r.json();
    return d || { state:'MENU' };
  } catch { return { state:'MENU' }; }
}
async function saveSession(sid, sess){
  try {
    await fetch(fbUrl(`/vitaflow_sessions/${_sessKey(sid)}.json`), {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(sess)
    });
  } catch {}
}

// ── Histórico da conversa com a IA (memória curta) ────────────────────────────
function _histKey(phone){ return String(phone || '').replace(/[^a-zA-Z0-9]/g, '_'); }
async function lerHistorico(phone){
  try {
    const r = await fetch(fbUrl(`/vitaflow_ia_hist/${_histKey(phone)}.json`));
    const d = await r.json();
    if (!d || !Array.isArray(d.msgs)) return [];
    if (d.updated && (Date.now() - d.updated) > HIST_TTL_MS) return []; // conversa velha → começa limpo
    const limpo = d.msgs.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
    return limpo.slice(-HIST_MAX_MSGS);
  } catch { return []; }
}
async function salvarHistorico(phone, msgs){
  try {
    const cortado = (Array.isArray(msgs) ? msgs : []).slice(-HIST_MAX_MSGS);
    await fetch(fbUrl(`/vitaflow_ia_hist/${_histKey(phone)}.json`), {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ msgs: cortado, updated: Date.now() })
    });
  } catch {}
}

async function buscarCache(colecao){
  try {
    const r = await fetch(fbUrl(`/vitaflow_cache/colecoes/${colecao}.json`));
    const d = await r.json();
    return d && d.dados ? d.dados : '';
  } catch { return ''; }
}
async function buscarTodosCache(){
  const resultados = await Promise.all(COLECOES.map(c => buscarCache(c)));
  return resultados.join('\n');
}

// Monta um resumo do catálogo REAL (mesmas coleções que os menus usam) pra ancorar a IA.
async function catalogoResumo(){
  const parts = await Promise.all(COLECOES.map(async c => {
    const d = await buscarCache(c);
    return d ? ('## ' + c + '\n' + d) : '';
  }));
  let txt = parts.filter(Boolean).join('\n\n');
  if (txt.length > 20000) txt = txt.slice(0, 20000) + '\n…(catálogo truncado — pode haver MAIS produtos; confirme abrindo a lista real com o marcador)';
  return txt;
}

// Monta a lista REAL de produtos pra uma coleção+termo (o que a IA pede via marcador).
// Retorna { linhas, produtoLista } — linhas no formato "nome|preco" (pra formatar) e
// produtoLista no formato { nome, preco } (pro botconversa.js continuar o fluxo).
async function montarLista(colecao, termo){
  colecao = (colecao || '').toLowerCase().trim();
  termo = (termo || '').trim();
  let dados = '';
  if (colecao && COLECOES.indexOf(colecao) >= 0) dados = await buscarCache(colecao);
  let linhas;
  if (termo) {
    linhas = filtrarCache(dados, [termo]);
    if (!linhas.length) { // fallback: procura em TODAS as coleções se não achou na indicada
      const tudo = await buscarTodosCache();
      linhas = filtrarCache(tudo, [termo]);
    }
  } else {
    linhas = String(dados || '').split('\n').filter(Boolean);
  }
  const unicas = [...new Set(linhas)];
  return { linhas: unicas, produtoLista: parseProdutos(unicas) };
}

function normalizarPhone(raw){
  let d = (raw || '').replace(/\D/g, '');
  if (d.length <= 11) d = '55' + d;
  return d;
}

// Empurra a mensagem pro cliente pela API do BotConversa (mesmo padrão do send-whatsapp.js).
// Retorna { ok, etapa, status, detalhe } pra gente saber EXATAMENTE onde travou.
async function enviarBotConversa(phone, message){
  const phoneNorm = normalizarPhone(phone);
  console.log('[IA] enviarBotConversa -> phone bruto:', phone, '| normalizado:', phoneNorm);
  try {
    let subId = null;

    const r1 = await fetch(`${BOTCONVERSA_BASE}/subscriber/get_by_phone/${phoneNorm}/`, { headers: { 'api-key': BOTCONVERSA_KEY } });
    const t1 = await r1.text();
    console.log('[IA] get_by_phone status:', r1.status, '| body:', t1.slice(0, 200));
    if (r1.ok) { try { subId = (JSON.parse(t1) || {}).id || null; } catch {} }

    if (!subId) {
      const r2 = await fetch(`${BOTCONVERSA_BASE}/subscriber/`, {
        method: 'POST', headers: { 'api-key': BOTCONVERSA_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNorm, name: 'Cliente' })
      });
      const t2 = await r2.text();
      console.log('[IA] criar subscriber status:', r2.status, '| body:', t2.slice(0, 200));
      if (r2.ok) { try { subId = (JSON.parse(t2) || {}).id || null; } catch {} }
    }

    if (!subId) {
      console.log('[IA] FALHOU: sem subscriberId (não achou e não criou contato).');
      return { ok:false, etapa:'lookup', status:0, detalhe:'sem subscriberId' };
    }
    console.log('[IA] subscriberId:', subId);

    const r3 = await fetch(`${BOTCONVERSA_BASE}/subscriber/${subId}/send_message/`, {
      method: 'POST', headers: { 'api-key': BOTCONVERSA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', value: message })
    });
    const t3 = await r3.text();
    console.log('[IA] send_message status:', r3.status, '| body:', t3.slice(0, 200));
    if (r3.ok) return { ok:true, etapa:'enviado', status:r3.status, detalhe:'ok' };
    return { ok:false, etapa:'send_message', status:r3.status, detalhe:t3.slice(0, 200) };

  } catch (e) {
    console.log('[IA] EXCEÇÃO enviarBotConversa:', e.message);
    return { ok:false, etapa:'excecao', status:0, detalhe:e.message };
  }
}

// Envia texto possivelmente grande em VÁRIAS mensagens (o WhatsApp recusa mensagem única enorme).
async function enviarLongo(phone, texto){
  const partes = partirMensagem(texto, 3800);
  let ultimo = { ok:false, etapa:'vazio', status:0, detalhe:'nada a enviar' };
  for (const p of partes){
    if (p && p.trim()) ultimo = await enviarBotConversa(phone, p);
  }
  return ultimo;
}

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

COMO LEVAR O CLIENTE AO PRODUTO (sem pedir pra ele digitar o nome):
- Quando o cliente demonstrar intenção de VER ou COMPRAR ("quero ver", "qual o preço", "quanto custa", "quero comprar", "vou querer a tirzepatida"), ou depois que VOCÊ recomendou e ele topou, NÃO peça pra ele digitar o nome. Em vez disso, TERMINE sua mensagem com um marcador que o sistema usa pra abrir a lista real (com preços e botão de compra):
    [[LISTA:colecao:termo]]
  - colecao (obrigatório), uma destas: emagrecedores, peptideos, hormonios, gh, outros, 10-mais-vendidos
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
- 🧠 SEU CONHECIMENTO DO MUNDO SOBRE PRODUTOS É IRRELEVANTE — VALE SÓ O CATÁLOGO. Você é um modelo de linguagem e "sabe" que existem dezenas de nootrópicos/peptídeos no mundo (Dihexa, P21, Cerebrolysin, Noopept, Semax variantes, NA-Semax-Amidate, Selank variantes, Melanotan, Oxitocina, EPO, etc.). ISSO NÃO IMPORTA AQUI. Se um produto NÃO aparece LITERALMENTE escrito no catálogo abaixo, para você ele NÃO EXISTE — é PROIBIDO citar o nome dele, nem como "opção", nem como "alternativa forte", nem "também tem". ANTES de escrever o nome de QUALQUER produto, confira que ele está escrito no catálogo. Ex.: se pra cognição o catálogo só mostra Semax e Selank, você recomenda SÓ Semax e Selank — NÃO acrescenta Dihexa, P21, Noopept da sua cabeça. Citar um produto e depois descobrir que "não temos" é o pior erro que você pode cometer — NUNCA faça isso.
- SÓ RECOMENDE O QUE ESTÁ NO CATÁLOGO. Ao indicar ou citar opções, use EXCLUSIVAMENTE produtos que aparecem no catálogo abaixo. Toda recomendação precisa ser comprável aqui — nada de mandar o cliente pra um beco sem saída.
- ⚠️ NUNCA AFIRME QUE "NÃO TEMOS" UM PRODUTO baseado só no que você vê aqui. A loja tem CENTENAS de produtos e o catálogo acima pode estar RESUMIDO/CORTADO — um item pode existir sem aparecer na sua lista (ex.: Clembuterol/T3 e vários outros ficam na coleção "outros"). Se o cliente pedir algo que você NÃO está vendo, NÃO negue: ABRA a lista pra conferir no ESTOQUE REAL com [[LISTA:colecao:termo]] — o sistema procura em TODAS as coleções, mesmo que você erre a coleção. Só diga que não trabalhamos com o item DEPOIS que a busca real voltar vazia; aí sim ofereça a melhor alternativa do catálogo. Ex.: cliente "tem clembuterol?" → você não tem certeza, então abre [[LISTA:outros:clembuterol]] e deixa o sistema confirmar.
- 🚫 PROIBIDO CITAR PRODUTO COM RESSALVA DE "PRECISO CONFIRMAR / VERIFICAR / SE TIVER NO ESTOQUE". Isso é INVENTAR com disclaimer. Se você NÃO tem certeza de que um produto existe no catálogo, NÃO fale o nome dele — nem como "opção", nem "talvez", nem "deixa eu ver se temos Dihexa/Noopept/P21...". Só existem DOIS caminhos honestos: (a) recomendar produtos que você VÊ no catálogo, citando o nome exato; ou (b) ABRIR a lista real com o marcador pra MOSTRAR o que existe. Jogar nomes de produtos que "talvez a gente tenha" é exatamente o que você NÃO pode fazer. A regra acima ("não negue, abra a lista") é pra CONFERIR abrindo a lista — NUNCA pra listar chutes de nomes.
- Ao ABRIR a lista pra mostrar "outras opções", abra a lista do PRODUTO/termo específico que faz sentido (ex.: [[LISTA:peptideos:semax]], [[LISTA:peptideos:selank]]) — NÃO abra a coleção inteira sem filtro (isso despeja 50+ itens sem relação com o que o cliente pediu). Mostre poucas opções RELEVANTES por vez.
- USE EXATAMENTE O PRODUTO QUE O CLIENTE CITOU. Ao responder, corrigir ou pedir desculpas, fale do MESMO produto/substância que ele falou (se ele disse "clembuterol", responda sobre clembuterol — NUNCA troque por "botox" nem outro item que apareceu antes na conversa). E NUNCA se contradiga na mesma mensagem ("não temos X, mas temos X"). Se errou antes, assuma e corrija com o produto certo.
- NÃO INVENTE DIFERENÇAS ENTRE PRODUTOS. Quando dois itens diferem só por MARCA e PREÇO, é PROIBIDO inventar vantagem qualitativa ("marca top", "entrega mais rápida", "mais completo", "referência", "qualidade superior", "melhor procedência"). Você NÃO tem essa informação. Diferencie SÓ pelo que é REAL e está no catálogo: dosagem (mg), formato (caneta/frasco, diluído/liofilizado), marca e preço.
- ÁGUA BACTERIOSTÁTICA (BAC): por padrão os produtos JÁ acompanham a BAC. NUNCA apresente "acompanha BAC" como diferencial ou vantagem — isso induz o cliente a ERRO, porque é o normal. A ÚNICA coisa que você pode dizer sobre BAC é AVISAR quando o produto NÃO acompanha, e SÓ quando o nome do produto no catálogo disser literalmente "Não acompanha BAC" (ex.: alguns da Neuroceptix) — aí você avisa que ele vai precisar comprar a água bacteriostática à parte. Fora esse caso, NÃO toque no assunto BAC.
- 🚫 VALIDADE DA BAC — NUNCA diga que a água bacteriostática "dura só 28 dias", "vale 28 dias" ou tem validade curta depois de aberta. Isso é DESINFORMAÇÃO ANTIGA já superada — a BAC tem álcool benzílico como conservante e se mantém boa por MUITO mais tempo. É PROIBIDO citar "28 dias" (ou qualquer prazo curto) pra água bacteriostática. Se falar de validade, fale só do PRODUTO RECONSTITUÍDO (o peptídeo já diluído), não da água em si.
- Considere TODAS as opções, inclusive as de DOSAGEM MAIOR. Ex.: se há MOTS-C de 10mg e de 40mg, o de 40mg tem 4x mais produto — não fixe só na menor dosagem; quando fizer sentido, aponte a de melhor custo por mg.
- Pode recomendar, comparar produtos e montar protocolo GENÉRICO (visão geral de uso, benefícios e duração) pra criar valor e confiança.
- 🔁 SEJA PROATIVA E COMPLETA — O CLIENTE NUNCA DEVE PRECISAR TE LEMBRAR DE OFERECER O RESTO. Quando ele te dá um OBJETIVO (ex.: cognição, libido, energia), apresente DE UMA VEZ a shortlist curada dos produtos relevantes que EXISTEM no catálogo (nome + 1 linha de benefício) — não um por um, não com conta-gotas. É TERMINANTEMENTE PROIBIDO dizer "me avisa quando quiser ver o próximo" ou prometer "depois te mostro X, Y, Z" e parar esperando o cliente cobrar. Ou você mostra tudo agora, ou coloca os produtos no [[STACK]] pra o sistema seguir sozinho. Se o cliente quer ver/escolher entre vários pra comprar, ABRA a sequência com [[STACK:col:termo|col:termo|...]] — o sistema abre o 1º, e assim que ele resolve (adiciona ou pula), já oferece o PRÓXIMO automaticamente, sem o cliente pedir. Depois de fechar um produto, continue oferecendo o próximo do objetivo por conta própria.
- DURAÇÃO/RENDIMENTO DOS FRASCOS — REGRA ÚNICA (vale IGUAL antes e depois da compra e TEM que bater):
  • CONTA: duração (dias) = mg TOTAIS do frasco ÷ dose diária (mg/dia). Se a dose for SEMANAL: duração (semanas) = mg totais ÷ dose semanal (depois × 7 pra dar em dias).
  • Use uma DOSE REALISTA de protocolo (a dose usual/padrão), com BOM SENSO. NÃO puxe pra dose mínima só pra o frasco "render mais" (isso dá número absurdo, tipo durar 1 ANO), NEM pra dose máxima só pra queimar rápido (isso dá 30 dias num frasco que deveria durar mais). Seja RAZOÁVEL: nem infle, nem reduza.
  • CONSISTÊNCIA OBRIGATÓRIA: pro MESMO produto, a estimativa que você dá ANTES da compra e o protocolo COMPLETO depois da compra TÊM que ser IGUAIS — mesma dose, mesma frequência, mesma duração. Nunca diga "dura 1 ano" antes e "dura 30 dias" depois. Se a conta ficar estranha, revise a dose até ficar coerente.
  • ÂNCORAS (siga a MESMA lógica pros demais produtos): Klow 80mg a 2mg/dia → 80÷2 = ~40 dias. GHK-Cu 10mg rende POUCO, só ~5 a 10 dias (frasco de ciclo curto — se o cliente quiser mais tempo, ofereça com tranquilidade as versões de 50mg e 100mg, que rendem ~5x e ~10x mais). SLU-PP-332 (só temos 5mg, oral): na dose MÁXIMA dura só ~5 dias, pouco demais — reduza a dose pra render PELO MENOS ~15 dias e explique isso ao cliente. Dose SEMANAL (ex.: tirzepatida/retatrutida 60mg a ~2mg/semana) rende ~30 semanas.
  • Sempre apresente a duração como ESTIMATIVA coerente (pode ser faixa, ex.: "cerca de 40 dias"), nunca um número inflado nem espremido.
- Deixe claro, com educação, que o PROTOCOLO COMPLETO e personalizado (doses exatas, ciclo, cuidados) você envia logo APÓS a confirmação da compra — use isso como incentivo pra fechar.
- Categoria sensível: fale de uso e benefícios de forma responsável, sem prometer cura, sempre reforçando acompanhamento profissional.

DILUÍDO (AQ / líquido / pronto pra usar) x LIOFILIZADO (em pó): fale MUITO BEM das DUAS versões — as duas são ótimas, seguras e de qualidade. NUNCA fale mal de nenhuma.
- É MENTIRA que produto diluído "não dura", "perde propriedade rápido" ou "tem validade curta" — isso é DESINFORMAÇÃO da internet. Se o cliente trouxer esse medo, desminta com tranquilidade e segurança.
- O DILUÍDO (AQ) é a versão MAIS MODERNA e prática: já vem pronto, sem etapa de reconstituição — é só aplicar. As marcas TOP investem nele: a ZPHC (referência máxima em peptídeos) lançou a Retatrutida e a Tirzepatida na versão AQ (diluída), e já vende vários GHs assim há tempos. Ou seja, diluído é sinônimo de tecnologia atual, não de fragilidade.
- O LIOFILIZADO (em pó) também é excelente: rende bem, você reconstitui na hora com água bacteriostática, e é ótimo pra quem quer estocar por mais tempo antes de diluir.
- Resumo pra passar ao cliente: as duas entregam o mesmo resultado; diluído = praticidade e modernidade, liofilizado = flexibilidade de estoque. A escolha é preferência, não qualidade. Recomende com confiança a que fizer sentido pro cliente (e temos ótimas opções diluídas).

PRAZOS OFICIAIS (use sempre "prazo estimado"): despacho em até 48h úteis após o pagamento; entrega estimada — Sudeste 2 a 5, Sul 3 a 5, Centro-Oeste 4 a 6, Nordeste 5 a 8, Norte 7 a 10 dias úteis. A Transportadora inclui seguro grátis; Correios (PAC/SEDEX) não têm seguro.`;

// Pergunta pra própria API da Anthropic QUAIS modelos essa chave pode usar (resolve o 404 de vez).
async function modelosDisponiveis(){
  try {
    const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' }
    });
    const d = await r.json();
    if (d && Array.isArray(d.data)) {
      const ids = d.data.map(m => m.id);
      console.log('[IA] /v1/models status:', r.status, '| DISPONÍVEIS:', ids.join(', ') || '(lista vazia)');
      return ids;
    }
    console.log('[IA] /v1/models status:', r.status, '| resposta:', JSON.stringify(d).slice(0, 300));
    return [];
  } catch (e) {
    console.log('[IA] EXCEÇÃO /v1/models:', e.message);
    return [];
  }
}

// Monta a ordem de preferência: env forçada > Sonnet disponível > Haiku disponível > resto > fallbacks.
function montarCandidatos(disponiveis){
  const cand = [];
  if (process.env.ATHENA_MODEL) cand.push(process.env.ATHENA_MODEL);
  const sonnets = disponiveis.filter(m => /sonnet/i.test(m));
  const haikus  = disponiveis.filter(m => /haiku/i.test(m));
  const resto   = disponiveis.filter(m => !/sonnet/i.test(m) && !/haiku/i.test(m));
  cand.push(...sonnets, ...haikus, ...resto, ...MODELOS_FALLBACK);
  return cand.filter((m, i) => m && cand.indexOf(m) === i); // tira duplicados, mantém ordem
}

// Chama UM modelo. Retorna o texto (ou null se falhar). maxTokens: 600 padrão (protocolo usa mais).
async function chamarModelo(modelo, sys, mensagens, maxTokens){
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modelo, max_tokens: maxTokens || 600, system: sys, messages: mensagens })
    });
    const d = await r.json();
    const erro = d && d.error ? JSON.stringify(d.error).slice(0,160) : 'nenhum';
    console.log('[IA] modelo', modelo, '-> status', r.status, '| erro:', erro);
    if (r.status === 200 && d && d.content && d.content[0] && d.content[0].text) return d.content[0].text.trim();
  } catch (e) {
    console.log('[IA] EXCEÇÃO modelo', modelo, ':', e.message);
  }
  return null;
}

// Chama a Claude com memória. Se ATHENA_MODEL estiver setado, tenta ELE primeiro (RÁPIDO,
// sem consultar /v1/models). Só descobre/varre a lista de modelos se o primeiro falhar —
// é isso que tirava a lentidão (a IA testava modelo por modelo a cada mensagem).
async function pensarComClaude(sys, mensagem, historico, maxTokens){
  const previas = Array.isArray(historico) ? historico : [];
  const mensagens = previas.concat([{ role: 'user', content: mensagem }]);
  console.log('[IA] histórico enviado:', previas.length, 'msgs anteriores + a atual');
  const forcado = process.env.ATHENA_MODEL;
  // 1) caminho rápido: modelo forçado pela env
  if (forcado) {
    const t = await chamarModelo(forcado, sys, mensagens, maxTokens);
    if (t) return { texto: t, modelo: forcado };
    console.log('[IA] ATHENA_MODEL falhou — caindo pro fallback de descoberta de modelos.');
  }
  // 2) fallback: descobre os modelos disponíveis e tenta na ordem de preferência
  const disponiveis = await modelosDisponiveis();
  const lista = montarCandidatos(disponiveis).filter(m => m !== forcado);
  console.log('[IA] ordem de tentativa (fallback):', lista.join(', '));
  for (const modelo of lista){
    const t = await chamarModelo(modelo, sys, mensagens, maxTokens);
    if (t) return { texto: t, modelo };
  }
  return { texto: '', modelo: '' };
}

// ── PROTOCOLO PÓS-VENDA ───────────────────────────────────────────────────────
const PROTOCOLO_SYSTEM = `Você é a Athena, consultora da VitaFlow. O cliente ACABOU de comprar e já pagou — agora você entrega, como bônus de pós-venda, o PROTOCOLO COMPLETO dos produtos que ele levou. Caprica: é isso que faz o cliente confiar e voltar.

REGRAS:
- Português do Brasil, tom acolhedor e profissional. Aqui pode ser mais longo que o normal — é o protocolo completo.
- Para CADA produto comprado, traga de forma organizada: *objetivo/benefício*, *dose* recomendada (uma dose REALISTA de protocolo, com bom senso — nem a mínima só pra render mais, nem a máxima), *frequência*, *como aplicar/usar*, *duração do ciclo*, *cuidados* importantes e, quando fizer sentido, *pós-ciclo/TPC*.
- DURAÇÃO/RENDIMENTO DOS FRASCOS — MESMA REGRA da pré-venda (o número TEM que bater com o que a Athena disse ANTES da compra): duração (dias) = mg TOTAIS do frasco ÷ dose diária; se a dose for semanal, mg totais ÷ dose semanal (× 7 pra dias). Dose REALISTA e RAZOÁVEL — nem inflada (durar 1 ano), nem espremida (30 dias num frasco que rende mais). ÂNCORAS: Klow 80mg a 2mg/dia = ~40 dias; GHK-Cu 10mg = só ~5 a 10 dias (ciclo curto; existem 50mg e 100mg que rendem mais); SLU-PP-332 5mg oral na dose máxima dura só ~5 dias, então use dose menor pra render ~15 dias. Apresente como estimativa coerente.
- Se comprou mais de um produto, organize por produto e, se combinarem, explique como usar juntos.
- Use *negrito* (um asterisco de cada lado) pra destacar títulos. NUNCA use ## nem ###.
- Baseie-se em prática consolidada e responsável; NÃO invente. O que depender de avaliação individual, oriente procurar acompanhamento profissional. NÃO prometa cura nem milagre.
- 🚫 VALIDADE DA ÁGUA BACTERIOSTÁTICA (BAC): é PROIBIDO dizer que a BAC "dura só 28 dias", "vale 28 dias" ou tem validade curta — é desinformação antiga já superada (a BAC tem conservante e dura muito mais). NUNCA cite 28 dias (nem prazo curto) pra água bacteriostática. Se for falar de prazo de uso, fale APENAS do PRODUTO JÁ RECONSTITUÍDO/diluído (peptídeo + água), nunca da água em si.
- NÃO fale de preço nem de "comprar" (já foi comprado) e NUNCA mande pro site.
- Feche desejando bons resultados e se colocando à disposição pra dúvidas.`;

async function gerarProtocoloPosVenda(body){
  try {
    const phone = body.phone;
    const produtos = Array.isArray(body.produtos) ? body.produtos.filter(Boolean) : [];
    console.log('[IA] PROTOCOLO pós-venda | phone:', phone, '| produtos:', produtos.join(' | '));
    if (!phone || !produtos.length) return { statusCode: 200, body: 'no-op' };
    const catalogo = await catalogoResumo();
    const sys = PROTOCOLO_SYSTEM + `\n\n=== CATÁLOGO (referência de nomes/formatos reais — NÃO invente fora disto) ===\n${catalogo}`;
    const pedido = `O cliente acabou de comprar: ${produtos.join(', ')}.\n\nMonte agora o PROTOCOLO COMPLETO e detalhado de CADA um desses produtos, pronto pra enviar no WhatsApp.`;
    const pensado = await pensarComClaude(sys, pedido, [], 1500);
    if (!pensado.texto) {
      console.log('[IA] PROTOCOLO: modelo não respondeu — nada enviado.');
      return { statusCode: 200, body: 'no-reply' };
    }
    const texto = `📋 *SEU PROTOCOLO VITAFLOW* 🌿\n_Guarde esta mensagem! Preparei um guia completo pra você aproveitar ao máximo o que comprou._\n\n` + pensado.texto;
    const envio = await enviarLongo(phone, texto);
    console.log('[IA] PROTOCOLO enviado:', JSON.stringify(envio));
    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    console.log('[IA] EXCEÇÃO gerarProtocoloPosVenda:', e.message);
    return { statusCode: 200, body: 'err:' + e.message };
  }
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const phone = body.phone;
    // Modo PROTOCOLO pós-venda: gera e envia o protocolo completo dos produtos comprados.
    if ((body.tipo || '') === 'protocolo') return await gerarProtocoloPosVenda(body);
    const mensagem = (body.mensagem || '').toString().trim();
    const promoContext = (body.promoContext || '').toString().trim(); // regras REAIS de promoção/desconto (vêm do botconversa.js)
    const contexto = (body.contexto || '').toString().trim(); // o que o cliente está VENDO agora (lista aberta)
    console.log('[IA] START | phone:', phone, '| mensagem:', mensagem, '| contexto:', contexto ? 'sim' : 'nao');
    if (!phone || !mensagem) { console.log('[IA] no-op: faltou phone ou mensagem'); return { statusCode: 200, body: 'no-op' }; }

    // Memória: carrega o que já foi conversado com esse cliente.
    const historico = await lerHistorico(phone);

    const catalogo = await catalogoResumo();
    console.log('[IA] catalogo len:', catalogo.length, '| promoContext:', promoContext ? 'sim' : 'nao', '| histórico:', historico.length, '| ANTHROPIC_KEY presente:', !!ANTHROPIC_KEY);
    let sys = SYSTEM + `\n\n=== CATÁLOGO REAL (preços e disponibilidade de hoje) ===\n${catalogo}`;
    if (promoContext) {
      sys += `\n\n=== PROMOÇÕES E DESCONTOS (regras REAIS de hoje — use SOMENTE isto, NÃO invente promoção) ===\n${promoContext}`;
    }
    if (contexto) {
      sys += `\n\n=== CONTEXTO ATUAL DO CLIENTE (PRIORIDADE MÁXIMA) ===\n${contexto}\nResponda com base NESSE contexto atual. Se o histórico falar de outro produto/assunto, IGNORE — o cliente está tratando do que está acima AGORA.`;
    }

    const pensado = await pensarComClaude(sys, mensagem, historico);
    let reply = pensado.texto;
    console.log('[IA] modelo que funcionou:', pensado.modelo || 'NENHUM');

    if (!reply) {
      console.log('[IA] reply vazio -> usando texto reserva (Claude não respondeu).');
      reply = 'Deixa eu te ajudar melhor! 😊 Me conta o que você procura (ex.: emagrecer, ganhar massa, um produto específico) que eu já te mostro as opções com preço.';
    } else {
      console.log('[IA] reply da Claude OK (', reply.length, 'chars ):', reply.slice(0, 120));
    }

    // Limpa qualquer marcador do texto (o cliente NUNCA vê o marcador).
    const replyLimpo = reply.replace(/\[\[\s*(LISTA|STACK)\s*:[^\]]*\]\]/gi, '').trim();

    // ── COMBO/STACK: [[STACK:col:termo|col:termo|...]] — abre o 1º e enfileira o resto ──
    // O botconversa.js pergunta (não abre sozinho) se quer o próximo, ao adicionar no carrinho.
    const mStack = reply.match(/\[\[\s*STACK\s*:\s*([^\]]+?)\s*\]\]/i);
    if (mStack) {
      const partes = mStack[1].split('|').map(s => {
        const idx = s.indexOf(':');
        const col = (idx >= 0 ? s.slice(0, idx) : s).trim().toLowerCase();
        const termo = (idx >= 0 ? s.slice(idx + 1) : '').trim();
        return { colecao: col, termo };
      }).filter(p => p.colecao || p.termo);
      if (partes.length) {
        const primeiro = partes[0];
        const abertura = await montarLista(primeiro.colecao, primeiro.termo);
        if (abertura && abertura.linhas.length) {
          const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
          const fila = partes.slice(1).map(p => ({
            label: cap(p.termo || p.colecao), tipo: 'lista', colecao: p.colecao,
            filtro: p.termo ? [p.termo] : [], ester: ''
          }));
          const sessAtual = await getSession(phone);
          await saveSession(phone, { ...sessAtual, state:'LISTA_PRODUTOS', produtoLista: abertura.produtoLista, stackFila: fila, errosSeguidos:0 });
          const corpo = (replyLimpo ? replyLimpo + '\n\n' : '') + formatarLista(abertura.linhas) + '\n\n*Digite o número do produto:*';
          await salvarHistorico(phone, historico.concat([
            { role:'user', content: mensagem },
            { role:'assistant', content: replyLimpo || '(abriu combo)' }
          ]));
          const envio = await enviarLongo(phone, corpo);
          console.log('[IA] RESULTADO ENVIO (stack):', JSON.stringify(envio));
          return { statusCode: 200, body: 'ok' };
        }
      }
      console.log('[IA] marcador STACK sem resultados — segue fluxo normal.');
    }

    // ── LISTA simples: [[LISTA:colecao:termo]] ──
    const mLista = reply.match(/\[\[\s*LISTA\s*:\s*([a-z0-9\-]*)\s*:\s*([^\]]*?)\s*\]\]/i);
    if (mLista) {
      const colecao = mLista[1] || '';
      const termo = mLista[2] || '';
      console.log('[IA] marcador LISTA -> colecao:', colecao, '| termo:', termo);
      const abertura = await montarLista(colecao, termo);
      if (abertura && abertura.linhas.length) {
        // grava a sessão como LISTA_PRODUTOS pro botconversa.js continuar (número → carrinho → pagamento)
        const sessAtual = await getSession(phone);
        await saveSession(phone, { ...sessAtual, state:'LISTA_PRODUTOS', produtoLista: abertura.produtoLista, errosSeguidos:0 });
        const corpo = (replyLimpo ? replyLimpo + '\n\n' : '') + formatarLista(abertura.linhas) + '\n\n*Digite o número do produto:*';
        // guarda no histórico só a FALA (não a lista gigante)
        await salvarHistorico(phone, historico.concat([
          { role:'user', content: mensagem },
          { role:'assistant', content: replyLimpo || `(abriu a lista de ${termo || colecao})` }
        ]));
        const envio = await enviarLongo(phone, corpo);
        console.log('[IA] RESULTADO ENVIO (lista):', JSON.stringify(envio));
        return { statusCode: 200, body: 'ok' };
      }
      console.log('[IA] marcador LISTA sem resultados — envia só a fala.');
    }

    // ── Fluxo normal (sem abrir lista) ──
    const textoFinal = replyLimpo || reply;
    await salvarHistorico(phone, historico.concat([
      { role:'user', content: mensagem },
      { role:'assistant', content: textoFinal }
    ]));
    const envio = await enviarLongo(phone, textoFinal);
    console.log('[IA] RESULTADO ENVIO:', JSON.stringify(envio));
    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    console.log('[IA] EXCEÇÃO handler:', e.message);
    return { statusCode: 200, body: 'err:' + e.message };
  }
};
