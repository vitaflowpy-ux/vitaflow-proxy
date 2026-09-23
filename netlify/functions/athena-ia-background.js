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
// Cada COMPANHIA do BotConversa tem sua PRÓPRIA API key. A Stella (VitaMK) usa uma key
// diferente da Athena; sem a key certa, a resposta da IA sai pela companhia errada e NÃO
// chega na conversa. O botconversa.js manda body.assistente ("Athena" ou "Stella").
const BOTCONVERSA_KEYS = {
  'Athena': '8c9e69c3-3c9f-4f23-b480-be4a0de29640',
  'Stella': 'ccad05d4-c30e-493c-89b6-74ae04480e53'
};
function keyDoAssistente(a){ return (a && BOTCONVERSA_KEYS[a]) ? BOTCONVERSA_KEYS[a] : BOTCONVERSA_KEY; }
// Troca "Athena" por "Stella" (ou outro nome) SÓ no texto que vai pro cliente, quando o
// assistente não é a Athena. As regras internas do prompt continuam falando "Athena".
function aplicarNomeAssistente(t, assistente){
  return (assistente && assistente !== 'Athena' && t) ? String(t).replace(/Athena/g, assistente) : t;
}
// CORRIGIDO: a base certa da API do BotConversa tem "/webhook" no fim (fonte: app oficial no Pipedream).
const BOTCONVERSA_BASE = 'https://backend.botconversa.com.br/api/v1/webhook';
const FIREBASE_URL     = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const FIREBASE_SECRET  = process.env.FIREBASE_SECRET || '';
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY;

// ── DESCRIÇÃO DE PRODUTO SOB DEMANDA (Athena/Stella leem a descrição da página só
// quando o cliente PERGUNTA um detalhe do produto — ex.: "quantos comprimidos vem?").
// Usa a Storefront API pública da loja (mesmo token do site). NÃO mexe no cache/proxy.
const STOREFRONT_TOKEN = 'b4b46a09460b7277f5d4625b9019daef';
const SHOP_GRAPHQL     = 'https://vitaflowoficial.com/api/2023-10/graphql.json';

// ── MEMÓRIA DE CONVERSA (ajuste fino aqui) ────────────────────────────────────
// HIST_MAX_MSGS: quantas mensagens (user+assistant) guardar. 16 = ~8 trocas.
// HIST_TTL_MS:   depois de quanto tempo sem falar a conversa "esfria" e começa do zero.
const HIST_MAX_MSGS = 16;
const HIST_TTL_MS   = 6 * 60 * 60 * 1000; // 6 horas

// Coleções válidas do catálogo (mesmas que o botconversa.js usa).
const COLECOES = ['emagrecedores','peptideos','hormonios','gh','estetica','farmacia','sarms','outros','10-mais-vendidos'];

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

// Detecta se a mensagem do cliente é uma PERGUNTA sobre DETALHE do produto (o que vem,
// quantos comprimidos, composição, apresentação...). NÃO conta pergunta de preço.
function ehPerguntaDetalheProduto(msg){
  var m = (msg || '').toString().toLowerCase();
  if (!m) return false;
  // Só gatilhos de DETALHE do produto. Pergunta só de preço NÃO casa aqui (o catálogo já responde),
  // porque nenhum dos gatilhos abaixo é sobre preço/valor/custo.
  return /quant[oa]s?\s+(?:comprimid|c[áa]psul|vem|contem|cont[ée]m|ml|ui|mg|frasco|ampola|vial|caneta|dose|unidade)|\bvem\b|\bcont[ée]m\b|composi[çc]|apresenta[çc]|especifica[çc]|\bvial\b|\bfrasco\b|\bampola\b|\bcomprimid|\bc[áa]psul|\bcaneta\b|do que (?:é|e) (?:feito|composto)|o que (?:vem|tem|é|e) (?:no|nesse|neste|nessa|nesta|dentro)|para que serve|pra que serve|posologi|como (?:usa|usar|aplica|aplicar|toma|tomar)|quantidade|dosagem|concentra[çc]/.test(m);
}

// Busca a DESCRIÇÃO oficial da página do produto na Storefront API (sob demanda).
// Retorna blocos "• Título:\ndescrição" só dos produtos QUE TÊM descrição; '' se nenhum.
async function buscarDescricaoProduto(termo){
  try {
    var q = (termo || '').toString().replace(/["\\]/g, ' ').trim();
    if (!q) return '';
    var query = 'query($q:String!){ products(first:3, query:$q){ edges{ node{ title description } } } }';
    var r = await fetch(SHOP_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN
      },
      body: JSON.stringify({ query: query, variables: { q: q } })
    });
    var d = await r.json();
    var edges = (d && d.data && d.data.products && d.data.products.edges) || [];
    var blocos = [];
    for (var i = 0; i < edges.length; i++) {
      var n = edges[i].node || {};
      var desc = (n.description || '').toString().trim();
      if (desc) blocos.push('• ' + (n.title || '').trim() + ':\n' + desc);
    }
    return blocos.join('\n\n');
  } catch (e) { return ''; }
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

// ── Negrito do WhatsApp ───────────────────────────────────────────────────────
// O WhatsApp usa UM asterisco pra negrito (*assim*). O modelo às vezes escreve no padrão
// Markdown (**assim**) e o cliente vê os asteriscos literais na tela — já vazou pra cliente
// ("**MUITO!** A ZPHC é referência MÁXIMA…"). Normaliza no ÚNICO ponto por onde passa toda
// mensagem que esta function envia. Idêntica à do botconversa.js (mexeu num, mexe no outro).
function normalizarMarkdownWhats(t){
  if (!t) return t;
  return String(t)
    .replace(/\*\*\*([^*\n]+?)\*\*\*/g, '*$1*')   // ***x*** -> *x*
    .replace(/\*\*([^*\n]+?)\*\*/g, '*$1*')         // **x**   -> *x*
    .replace(/^\s{0,3}#{1,6}\s*(.+?)\s*$/gm, '*$1*'); // ## Titulo -> *Titulo*
}

// Empurra a mensagem pro cliente pela API do BotConversa (mesmo padrão do send-whatsapp.js).
// Retorna { ok, etapa, status, detalhe } pra gente saber EXATAMENTE onde travou.
// apiKey: key da companhia certa (Athena ou Stella). Sem ela, cai na key padrão (Athena).
async function enviarBotConversa(phone, message, apiKey){
  const KEY = apiKey || BOTCONVERSA_KEY;
  message = normalizarMarkdownWhats(message);   // **negrito** do Markdown -> *negrito* do WhatsApp
  const phoneNorm = normalizarPhone(phone);
  console.log('[IA] enviarBotConversa -> phone bruto:', phone, '| normalizado:', phoneNorm);
  try {
    let subId = null;

    const r1 = await fetch(`${BOTCONVERSA_BASE}/subscriber/get_by_phone/${phoneNorm}/`, { headers: { 'api-key': KEY } });
    const t1 = await r1.text();
    console.log('[IA] get_by_phone status:', r1.status, '| body:', t1.slice(0, 200));
    if (r1.ok) { try { subId = (JSON.parse(t1) || {}).id || null; } catch {} }

    if (!subId) {
      const r2 = await fetch(`${BOTCONVERSA_BASE}/subscriber/`, {
        method: 'POST', headers: { 'api-key': KEY, 'Content-Type': 'application/json' },
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
      method: 'POST', headers: { 'api-key': KEY, 'Content-Type': 'application/json' },
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
async function enviarLongo(phone, texto, apiKey){
  const partes = partirMensagem(texto, 3800);
  let ultimo = { ok:false, etapa:'vazio', status:0, detalhe:'nada a enviar' };
  for (const p of partes){
    if (p && p.trim()) ultimo = await enviarBotConversa(phone, p, apiKey);
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
- É IGUALMENTE PROIBIDO FINGIR que está CONSULTANDO um pedido, rastreio ou status de entrega. Você NÃO tem acesso a pedidos. NUNCA escreva "vou consultar seu pedido", "deixa eu verificar o status", "um momento, o sistema vai buscar", "já te trago o rastreio" — o cliente fica esperando uma consulta que NUNCA acontece (aconteceu em 17/09/2026: cliente ficou 6 minutos no vácuo). Se o cliente perguntar de pedido, entrega, rastreio, prazo de um pedido já feito ou "cadê meu produto", responda EXATAMENTE isto e nada mais sobre o pedido: "Me manda o *número do pedido* (começa com VF-), seu *CPF* ou o *e-mail* da compra que eu consulto o status na hora! 😊" — quando ele mandar esse dado, o SISTEMA faz a consulta de verdade.
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
- 🧠 SEU CONHECIMENTO DO MUNDO SOBRE PRODUTOS É IRRELEVANTE — VALE SÓ O CATÁLOGO. Você é um modelo de linguagem e "sabe" que existem dezenas de nootrópicos/peptídeos no mundo (Dihexa, P21, Cerebrolysin, Noopept, Semax variantes, NA-Semax-Amidate, Selank variantes, Melanotan, Oxitocina, EPO, etc.). ISSO NÃO IMPORTA AQUI. Se um produto NÃO aparece LITERALMENTE escrito no catálogo abaixo, para você ele NÃO EXISTE — é PROIBIDO citar o nome dele, nem como "opção", nem como "alternativa forte", nem "também tem". ANTES de escrever o nome de QUALQUER produto, confira que ele está escrito no catálogo. Ex.: se pra cognição o catálogo só mostra Semax e Selank, você recomenda SÓ Semax e Selank — NÃO acrescenta Dihexa, P21, Noopept da sua cabeça. Citar um produto e depois descobrir que "não temos" é o pior erro que você pode cometer — NUNCA faça isso.
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
// WhatsApp não renderiza # ## ### — se o modelo escapar e usar, converte pra *negrito* (ou tira o #).
function limparHeadersMd(txt){
  return String(txt || '').replace(/^\s{0,3}#{1,6}\s*(.+?)\s*$/gm, function(_, t){
    return /\*/.test(t) ? t : ('*' + t + '*');
  });
}

const PROTOCOLO_SYSTEM = `Você é a Athena, consultora da VitaFlow. O cliente ACABOU de comprar e já pagou — agora você entrega, como bônus de pós-venda, o PROTOCOLO COMPLETO dos produtos que ele levou. Caprica: é isso que faz o cliente confiar e voltar.

REGRAS:
- Português do Brasil, tom acolhedor e profissional. Aqui pode ser mais longo que o normal — é o protocolo completo.
- Para CADA produto comprado, traga de forma organizada: *objetivo/benefício*, *dose* recomendada (uma dose REALISTA de protocolo, com bom senso — nem a mínima só pra render mais, nem a máxima), *frequência*, *como aplicar/usar*, *duração do ciclo*, *cuidados* importantes e, quando fizer sentido, *pós-ciclo/TPC*.
- DURAÇÃO/RENDIMENTO DOS FRASCOS — MESMA REGRA da pré-venda (o número TEM que bater com o que a Athena disse ANTES da compra): duração (dias) = mg TOTAIS do frasco ÷ dose diária; se a dose for semanal, mg totais ÷ dose semanal (× 7 pra dias). Dose REALISTA e RAZOÁVEL — nem inflada (durar 1 ano), nem espremida (30 dias num frasco que rende mais). ÂNCORAS: Klow 80mg a 2mg/dia = ~40 dias; GHK-Cu 10mg = só ~5 a 10 dias (ciclo curto; existem 50mg e 100mg que rendem mais); SLU-PP-332 5mg oral na dose máxima dura só ~5 dias, então use dose menor pra render ~15 dias. Apresente como estimativa coerente.
- ⏱️ PRODUTOS DE BAIXA MILIGRAMAGEM: escolha uma dose que faça o frasco render PELO MENOS ~10 a 15 dias. NUNCA uma dose tão alta que o frasco dure só 3-5 dias (isso não é protocolo, é desperdício). Se, mesmo com dose razoável, o frasco ainda render pouco, avise e sugira com naturalidade a versão de miligramagem maior.
- 💉 TITULAÇÃO DE GLP-1 (Tirzepatida, Retatrutida, Semaglutida e emagrecedores injetáveis) — REGRA CERTA (não erre isso): é PROIBIDO montar aquela "escadinha" que sobe a dose toda semana até a dose MÁXIMA — ninguém faz assim na prática. O certo: começa na dose MÍNIMA e sobe SÓ até encontrar a DOSE IDEAL do cliente — aquela em que ele fica saciado e continua perdendo peso sem estagnar. Ao achar essa dose, MANTÉM nela até o fim do protocolo. Só volta a subir SE a perda de peso ESTAGNAR — aí progride de novo até a nova dose ideal, e mantém. Deixe isso claro pro cliente: o objetivo é a MENOR dose que funciona pra ele, não chegar na máxima.
- 📦 MONTE O PROTOCOLO COMPLETO E IDEAL independentemente da QUANTIDADE que o cliente comprou. Ex.: um frasco pequeno (retatrutida 15mg) rende pouco, mas mesmo assim monte o protocolo completo e correto (ex.: as 12 semanas). Se a quantidade comprada NÃO for suficiente pro protocolo completo, AVISE com clareza e simpatia ("a quantidade que você comprou dá pra ~X semanas; pra fechar o protocolo completo você vai precisar de mais um pouco") — mas entregue o protocolo ideal do mesmo jeito.
- 💪 HORMÔNIOS/ANABOLIZANTES — NÃO force sempre o modelo "ciclo + TPC". Hoje a MAIORIA usa BLAST & CRUISE: uma fase de *blast* (doses mais altas por um período) seguida de *cruise* (dose de manutenção, tipo TRT, sem sair do hormônio). Nesse modelo NÃO existe TPC — a pessoa não sai, ela só reduz pra dose de manutenção. Então apresente os DOIS caminhos quando fizer sentido: (a) *ciclo tradicional* com TPC no final (pra quem quer sair depois) e (b) *blast & cruise* (pra quem vai manter o uso) — e deixe claro que a TPC só entra no modelo de CICLO, no cruise não. Pergunte/deixe o cliente escolher o que combina com o objetivo dele; não empurre TPC como se fosse obrigatório pra todo mundo. Sempre reforçando, com naturalidade, o acompanhamento profissional.
- Se comprou mais de um produto, organize por produto e, se combinarem, explique como usar juntos.
- Use *negrito* (um asterisco de cada lado) pra destacar títulos. NUNCA use ## nem ###.
- Baseie-se em prática consolidada e responsável; NÃO invente. O que depender de avaliação individual, oriente procurar acompanhamento profissional. NÃO prometa cura nem milagre.
- 🧪 COMPOSIÇÃO DE BLENDS (Klow, Glow e QUALQUER mistura de vários peptídeos) — REGRA CRÍTICA (esse erro JÁ vazou pra cliente num grupo): é TERMINANTEMENTE PROIBIDO inventar/adivinhar quais peptídeos formam um blend. Use SOMENTE as composições confirmadas abaixo. Se um blend NÃO estiver listado aqui, NÃO liste componentes — descreva o produto pelo objetivo geral e PARE (jamais chute nomes de peptídeos). Composições confirmadas da VitaFlow: *Glow* = GHK-Cu + BPC-157 + TB-500; *Klow* = GHK-Cu + BPC-157 + TB-500 + KPV (é o Glow + o KPV). NUNCA diga que Klow ou Glow contêm AOD-9604, Tesamorelin, Ipamorelin ou qualquer coisa fora dessas listas.
- 🔒 TRAVA GERAL DE FATOS TÉCNICOS (vale pra TODO produto, não só blends): você NÃO tem acesso à internet e seu treino ERRA fatos de produto. Então, para COMPOSIÇÃO, "do que é feito", origem, marca-fabricante e afins: só afirme se estiver no CATÁLOGO ou na seção FICHAS TÉCNICAS que você recebe. Se NÃO tiver a informação confirmada, é PROIBIDO chutar — descreva o produto pelo OBJETIVO/uso geral e siga em frente, ou diga que confirma esse detalhe. Dose: use as âncoras deste prompt e o bom senso, sempre como ESTIMATIVA. Um chute apresentado como fato é o pior erro (já vazou pra cliente).
- 🚫 VALIDADE DA ÁGUA BACTERIOSTÁTICA (BAC): é PROIBIDO dizer que a BAC "dura só 28 dias", "vale 28 dias" ou tem validade curta — é desinformação antiga já superada (a BAC tem conservante e dura muito mais). NUNCA cite 28 dias (nem prazo curto) pra água bacteriostática. Se for falar de prazo de uso, fale APENAS do PRODUTO JÁ RECONSTITUÍDO/diluído (peptídeo + água), nunca da água em si.
- NÃO fale de preço nem de "comprar" (já foi comprado) e NUNCA mande pro site.
- Feche desejando bons resultados e se colocando à disposição pra dúvidas.`;

// ── FICHAS TÉCNICAS OFICIAIS (fonte da verdade p/ composição e "o que é") ──────
// A IA usa SÓ isto pra composição/componentes. Blends com composição TRAVADA.
// Doses = referência/estimativa. Editar aqui quando o Thiago revisar.
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

// ── BASE DO GERADOR DE PROTOCOLOS (23/09/2026) ──────────────────────────────────
// O protocolo pós-venda passa a usar a MESMA base do Gerador de Protocolos do site
// (gerador-protocolos-vitaflow.netlify.app) como fonte da verdade de dose, frequência,
// via, duração, horário, modo de uso e cuidados. A base é lida AO VIVO do gerador
// (uma substância, uma dose, um lugar: mexeu na base do gerador, a Athena acompanha).
//  - peptídeos/emagrecedores: `var BASE = [...]` dentro de /peptideos/ (trecho de dados,
//    de `var LOJA =` até `var ET =`, rodado isolado num vm — sem DOM);
//  - hormônios/GH: `VF.BASE_HORM` em /comum/base.js.
// Se a leitura falhar, o protocolo sai exatamente como antes (só com as regras do prompt).
// As TABELAS DE FRACIONAMENTO continuam as da Athena (FRAC_TABELAS no botconversa),
// anexadas no fim — a base só governa o texto do protocolo.
const vm = require('vm');
const GERADOR_SITE = 'https://gerador-protocolos-vitaflow.netlify.app';
let _baseGer = null, _baseGerEm = 0;
function _optTimeout(ms){ return (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? { signal: AbortSignal.timeout(ms) } : {}; }

async function carregarBaseGerador(){
  if (_baseGer && (Date.now() - _baseGerEm) < 60 * 60 * 1000) return _baseGer;
  const out = { pep: [], horm: [], ativoDe: null };
  try {
    const html = await (await fetch(GERADOR_SITE + '/peptideos/', _optTimeout(4000))).text();
    const i = html.indexOf('var LOJA ='), j = html.indexOf('var ET = {', i);
    if (i >= 0 && j > i) {
      const ctx = {}; vm.createContext(ctx);
      vm.runInContext(html.slice(i, j) + '\n;this.__B = BASE;', ctx, { timeout: 3000 });
      if (Array.isArray(ctx.__B)) out.pep = ctx.__B;
    }
  } catch (e) { console.log('[IA] base do gerador (peptídeos) não carregou:', e.message); }
  try {
    const js = await (await fetch(GERADOR_SITE + '/comum/base.js', _optTimeout(4000))).text();
    const ctx = {}; vm.createContext(ctx);
    vm.runInContext(js + '\n;this.__VF = VF;', ctx, { timeout: 3000 });
    if (ctx.__VF) { out.horm = ctx.__VF.BASE_HORM || []; out.ativoDe = ctx.__VF.ativoDe || null; }
  } catch (e) { console.log('[IA] base do gerador (hormônios) não carregou:', e.message); }
  console.log('[IA] base do gerador: peptídeos', out.pep.length, '| hormônios', out.horm.length);
  if (out.pep.length || out.horm.length) { _baseGer = out; _baseGerEm = Date.now(); }
  return out;
}

function _nb(s){ return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim(); }
// Marcas comerciais no catálogo → substância (confirmadas pelo VitaFlow em 23/09/2026; Semaglix = semaglutida).
const MARCAS_SUBSTANCIA = { tirzepatida: ['tg', 't g', 'tirzec', 'lipoland', 'lipoless', 'mounjaro', 't36', 'slimex', 'tirzedral', 'gluconex'],
                            semaglutida: ['semaglix'] };
function _chavesBase(s){
  const k = [];
  function add(t){ t = _nb(t); if (t && t.length >= 2 && k.indexOf(t) < 0) k.push(t); }
  add(String(s.id).replace(/_/g, ' '));
  add(s.nome);
  add(String(s.nome).split('(')[0]);
  const m = String(s.nome).match(/\(([^)]*)\)/); if (m) add(m[1]);
  if (s.busca) add(s.busca);
  (MARCAS_SUBSTANCIA[s.id] || []).forEach(add);
  return k;
}
// Produto do pedido → entrada da base (a chave mais longa que aparece como palavra inteira).
// Hormônio/GH existe nas DUAS bases (a de peptídeos tem entradas antigas de hormônio): quando
// a base hormonal reconhece o produto, ela vence — é a que tem faixa por sexo e as travas.
const CATS_HORM_NO_PEP = ['GH', 'Hormônio', 'Hormônio oral'];
// Casa por palavra inteira; chave de 5+ caracteres COM número ou espaço também casa SEM espaços
// ("IGF1 LR3" = "IGF-1 LR3", "SLUPP-332" = "SLU-PP-332", "Melanotan 2" = "melanotan2"),
// sempre começando no INÍCIO de uma palavra ("fenilpropionato" não casa "propionato").
// Devolve a posição onde casou (-1 = não casou).
function _posCompacto(n, kc){
  for (let p = 0; p < n.length - 1; p++) {
    if (n[p] === ' ' && n[p + 1] !== ' ' && n.slice(p + 1).replace(/ /g, '').indexOf(kc) === 0) return p;
  }
  return -1;
}
// Escolha: a substância citada PRIMEIRO no título vence ("Masteron Propionato" = Masteron,
// "Trembolona Enantato" = Trembolona); empate → a que cobre mais do título
// ("Stanozolol 50mg (Oleoso)" = o injetável). Forma escrita no título (oral × injetável)
// diferente da forma da base = não casa (a dose seria de outra apresentação).
const ESTERES_TESTO = ['enantato', 'cipionato', 'propionato', 'undecanoato'];
function _melhorEm(n, lista){
  let melhor = null, pos = Infinity, cob = 0;
  const diz = / oral /.test(n) ? 'oral' : (/ (injetavel|oleoso|inj) /.test(n) ? 'inj' : '');
  (lista || []).forEach(function(s){
    if (diz && s.forma && s.forma !== diz) return;
    let p0 = Infinity, c0 = 0;
    _chavesBase(s).forEach(function(k){
      const kc = k.replace(/ /g, '');
      let p = n.indexOf(' ' + k + ' ');
      if (p < 0 && kc.length >= 5 && /[ 0-9]/.test(k)) p = _posCompacto(n, kc);
      if (p >= 0) { if (p < p0) p0 = p; c0 += kc.length; }
    });
    if (p0 === Infinity) return;
    // Éster sozinho no meio do título é de OUTRA substância ("Trestolona Enantato"):
    // éster de testosterona só vale se abre o título ou se o título fala em testosterona.
    if (ESTERES_TESTO.indexOf(s.id) >= 0 && p0 > 0 && !/ (testosterona|test) /.test(n)) return;
    if (p0 < pos || (p0 === pos && c0 > cob)) { melhor = s; pos = p0; cob = c0; }
  });
  return melhor ? { s: melhor, tam: cob, pos: pos } : null;
}
// Produto com várias substâncias (Mix/Stack/"+") só casa com entrada que também é blend —
// senão a base daria a dose de UMA substância para um frasco com várias.
function _ehBlendBase(s){ return (s.contem && s.contem.length) || String(s.nome).indexOf('+') >= 0; }
function acharNaBase(produto, base){
  const n = ' ' + _nb(produto) + ' ';
  const h = _melhorEm(n, base.horm), p = _melhorEm(n, base.pep);
  let r = null;
  if (h && (!p || CATS_HORM_NO_PEP.indexOf(p.s.cat) >= 0 || h.tam >= p.tam)) r = { tipo: 'horm', s: h.s };
  else if (p) r = { tipo: 'pep', s: p.s };
  if (r && /( \+ | mix | stack | blend )/.test(n) && !_ehBlendBase(r.s)) return null;
  return r;
}
function _faixa(f){ return f ? (f.min + (f.max !== f.min ? '–' + f.max : '') + ' ' + f.un) : ''; }
function _linhaBase(a){
  const s = a.s, p = [];
  if (a.tipo === 'pep') {
    p.push('*' + s.nome + '* [' + (s.cat || 'peptídeo') + ']');
    if (s.dose) p.push('dose: ' + s.dose + (s.dose_mg ? ' (referência: ' + s.dose_mg + ' mg por aplicação)' : ''));
    if (s.freq) p.push('frequência: ' + s.freq);
    if (s.via) p.push('via: ' + s.via);
    if (s.ciclo) p.push('duração: ' + s.ciclo);
    if (s.horario) p.push('horário: ' + s.horario);
    if (s.como) p.push('como usar: ' + s.como);
    if (s.cuidados) p.push('cuidados: ' + s.cuidados);
    if (s.contem && s.contem.length) p.push('é um blend (contém: ' + s.contem.join(', ') + ')');
    if (s.fem === false) p.push('NÃO indicado para mulheres');
  } else {
    p.push('*' + s.nome + '* [hormônio · ' + (s.forma === 'oral' ? 'oral' : 'injetável') + ']');
    if (s.doseM) p.push('faixa masculina: ' + _faixa(s.doseM));
    p.push(s.doseF ? 'faixa feminina: ' + _faixa(s.doseF) : 'sem faixa feminina na base (para mulher, não informe dose desta substância)');
    if (s.doseTRT) p.push('dose de TRT/cruise: ' + _faixa(s.doseTRT));
    if (s.freq) p.push('frequência: ' + s.freq);
    if (s.ciclo) p.push('duração: ' + s.ciclo);
    if (s.meiaVida) p.push('meia-vida: ' + s.meiaVida);
    if (s.oral17aa) p.push('oral 17-alfa-alquilado (hepatotóxico — só um por vez)');
    if (s.familia === '19nor') p.push('derivado 19-nor (só um por ciclo)');
    if (s.nota) p.push('observação: ' + s.nota);
  }
  return '- ' + p.join(' · ');
}
// Mesmas travas do montador (hormônios: 19-nor 2+, 17aa 2+, mesma molécula; peptídeos:
// blend × componente / conflita, e dois análogos de GLP-1).
function conflitosBase(achados, base){
  const out = [];
  const h = achados.filter(function(a){ return a.tipo === 'horm'; }).map(function(a){ return a.s; });
  const p = achados.filter(function(a){ return a.tipo === 'pep'; }).map(function(a){ return a.s; });
  const nor = h.filter(function(s){ return s.familia === '19nor'; });
  const aa = h.filter(function(s){ return s.oral17aa; });
  if (nor.length >= 2) out.push(nor.map(function(s){ return s.nome; }).join(' + ') + ' (dois derivados 19-nor)');
  if (aa.length >= 2) out.push(aa.map(function(s){ return s.nome; }).join(' + ') + ' (dois orais 17-alfa-alquilados)');
  const porAtivo = {};
  h.forEach(function(s){ const a = base.ativoDe ? base.ativoDe(s.id) : s.id; (porAtivo[a] = porAtivo[a] || []).push(s.nome); });
  Object.keys(porAtivo).forEach(function(a){ if (porAtivo[a].length > 1) out.push(porAtivo[a].join(' + ') + ' (a mesma molécula: ' + a + ')'); });
  function partes(s){ return [s.id].concat(s.contem || []).concat(s.conflita || []); }
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
    const pa = partes(p[i]), pb = partes(p[j]);
    if (pa.some(function(x){ return pb.indexOf(x) >= 0; })) out.push(p[i].nome + ' + ' + p[j].nome + ' (mesma molécula ou blend que já contém a outra)');
    else if (p[i].cat === 'GLP-1' && p[j].cat === 'GLP-1') out.push(p[i].nome + ' + ' + p[j].nome + ' (dois análogos de GLP-1)');
  }
  return out;
}
// Conta ÚNICA de rendimento/duração — a MESMA na pré-venda e no protocolo (regra "antes e depois TÊM que bater").
// Hormônio usa o MÍNIMO da faixa, o mesmo ponto de partida do montador do gerador.
const REGRA_RENDIMENTO = 'CONTA DO RENDIMENTO/DURAÇÃO DO FRASCO (a mesma na pré-venda e no protocolo): peptídeo/emagrecedor = dose de referência da base na frequência da base; hormônio = MÍNIMO da faixa (masculina; feminina se for mulher) na frequência da base.';
// Bloco que entra no system prompt do protocolo pós-venda.
async function blocoBaseGerador(produtos, temTabela){
  const base = await carregarBaseGerador();
  if (!base.pep.length && !base.horm.length) return { texto: '', achados: [], semBase: produtos.slice(), conflitos: [] };
  const achados = [], vistos = {}, semBase = [];
  produtos.forEach(function(prod){
    const a = acharNaBase(prod, base);
    if (!a) { semBase.push(prod); return; }
    const k = a.tipo + ':' + a.s.id;
    if (!vistos[k]) { vistos[k] = true; achados.push(Object.assign({ produto: prod }, a)); }
  });
  const conflitos = conflitosBase(achados, base);
  let t = '';
  if (achados.length) {
    t += '\n\n=== BASE OFICIAL DO GERADOR DE PROTOCOLOS VITAFLOW (fonte da verdade p/ DOSE, frequência, via, duração, horário, modo de uso e cuidados) ===\n';
    t += 'Para os produtos abaixo, use ESTES valores. A dose fica DENTRO da faixa/referência da base. Onde a base e as âncoras deste prompt divergirem, vale a BASE. O que a base não trouxer, siga as regras gerais deste prompt. ' + REGRA_RENDIMENTO + '\n';
    t += achados.map(_linhaBase).join('\n');
  }
  if (semBase.length) t += '\n\nProdutos SEM entrada na base (siga as regras gerais deste prompt): ' + semBase.join(', ') + '.';
  if (conflitos.length) {
    t += '\n\n⛔ COMBINAÇÃO QUE NÃO ANDA JUNTA entre os produtos deste cliente: ' + conflitos.join('; ') + '.\n';
    t += 'NUNCA monte esses itens para uso no mesmo período. Monte o protocolo de cada um SEPARADAMENTE e diga ao cliente, com clareza, que eles NÃO devem ser usados juntos.';
  }
  if (temTabela) t += '\n\nTABELA DE FRACIONAMENTO: o sistema anexa a(s) tabela(s) oficial(is) no fim da mensagem. NÃO monte tabela de fracionamento/UI no texto — quando precisar, diga "veja a tabela de fracionamento no fim desta mensagem".';
  return { texto: t, achados: achados, semBase: semBase, conflitos: conflitos };
}

// ── DESCRIÇÃO SOB DEMANDA — de QUAIS produtos? (23/09/2026) ─────────────────────
// Bug de 23/09 (Hemogenin, "quantos comprimidos vem em cada?"): o termo de busca era o
// CONTEXTO inteiro ("O cliente está vendo AGORA esta lista…: A; B; C"). A busca da loja
// exige TODAS as palavras → voltava vazio → a IA dizia "não tenho essa informação", mesmo
// com a quantidade escrita na descrição. Agora:
//  - com lista aberta: pega os NOMES da lista; se a pergunta aponta um (número "o 6", marca,
//    mg…), lê só a descrição dele(s); se vale pra lista toda ("cada"), lê a de todos;
//  - sem lista: busca só pelas palavras de produto da mensagem (tira "quantos", "vem"…).
// Lê só o que foi perguntado (nada de carregar descrição do catálogo inteiro).
var PALAVRAS_PERGUNTA = ['quantos','quantas','quanto','quanta','comprimido','comprimidos','capsula','capsulas','vem','vêm','veem',
  'cada','um','uma','no','na','nos','nas','do','da','dos','das','de','em','o','a','os','as','e','ou','que','qual','quais','tem','tém',
  'contem','contém','frasco','frascos','ampola','ampolas','caneta','canetas','dose','doses','esse','essa','esses','essas','este',
  'esta','estes','estas','isso','isto','dele','dela','deles','delas','por','pra','para','com','sem','como','usa','usar','uso','toma',
  'tomar','aplica','aplicar','serve','composicao','apresentacao','quantidade','dosagem','concentracao','unidade','unidades','vial',
  'caixa','caixas','cartela','produto','produtos','me','fala','diz','sabe','voce','vc','ai','oi','ola','bom','dia','tarde','noite',
  'opcao','numero','item','ele','ela','eles','elas','vem','sao','é','e','tb','tambem','mais','menos','quero','saber','gostaria','pode',
  'dizer','informar','nele','nela','neles','nelas','dentro','vêm','feito','composto','posologia','especificacao','ml','ui','mcg'];
function _nd(s){ return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
var _PERG_ND = PALAVRAS_PERGUNTA.map(_nd);
// Nomes que o botconversa manda no contexto (contextoLista): lista aberta e carrinho.
function nomesDoContexto(contexto){
  var lista = [], carrinho = [];
  String(contexto || '').split('\n').forEach(function(l){
    var i = l.indexOf('): '), j = l.indexOf('CARRINHO: ');
    if (l.indexOf('vendo AGORA') >= 0 && i >= 0) {
      l.slice(i + 3).split(';').forEach(function(n){ n = n.trim(); if (n && lista.indexOf(n) < 0) lista.push(n); });
    } else if (j >= 0) {
      l.slice(j + 10).split('. NUNCA')[0].split(';').forEach(function(n){ n = n.trim(); if (n && carrinho.indexOf(n) < 0) carrinho.push(n); });
    }
  });
  return { lista: lista, carrinho: carrinho };
}
function _tokensUteis(txt){
  return _nd(txt).split(/[^a-z0-9]+/).filter(function(w){ return w.length >= 2 && _PERG_ND.indexOf(w) < 0; });
}
async function _produtosPorQuery(q, max){
  try {
    var query = 'query($q:String!,$n:Int!){ products(first:$n, query:$q){ edges{ node{ title description } } } }';
    var r = await fetch(SHOP_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN },
      body: JSON.stringify({ query: query, variables: { q: q, n: max || 3 } })
    });
    var d = await r.json();
    return ((d && d.data && d.data.products && d.data.products.edges) || []).map(function(e){ return e.node || {}; });
  } catch (e) { return []; }
}
function _porTitulo(nome){ return _produtosPorQuery('title:"' + String(nome).replace(/["\\]/g, ' ').trim() + '"', 1); }
// Pergunta de detalhe que vale pra VÁRIOS produtos ("quantos vem em cada?") — 23/09/2026.
var MULTI_DETALHE = '\nSe a pergunta vale para VÁRIOS produtos (ex.: "cada", "todos", "esses"), responda UM PRODUTO POR LINHA, na MESMA ORDEM e com o MESMO NÚMERO da lista que o cliente está vendo (o "Nº X da lista" vem antes de cada descrição acima), no formato: número, nome do produto e o dado perguntado. Para os que a descrição NÃO traz o dado, escreva "não consta na descrição". NÃO resuma, NÃO agrupe ("a maioria vem com…") e NÃO pule nenhum. Se um item não for do tipo perguntado (ex.: injetável quando perguntam comprimidos), diga o que ele é pela descrição.';
async function descricoesDaPergunta(mensagem, contexto){
  var ctx = nomesDoContexto(contexto);
  var nomes = ctx.lista.length ? ctx.lista : ctx.carrinho;
  var achados = [];
  if (nomes.length) {
    var alvo = [];
    // "o 6", "número 6", "do 6" (não confunde com "50mg", "60 comprimidos"…)
    var mNum = _nd(mensagem).match(/(?:^|\s)(?:o|a|numero|n[o°º]|opcao|item|do|da)\s*(\d{1,2})(?!\s*(?:mg|ml|ui|mcg|g\b|comp|cap|x\b|un))/);
    var n = mNum ? parseInt(mNum[1], 10) : 0;
    if (n >= 1 && n <= nomes.length) alvo = [nomes[n - 1]];
    else {
      // palavra que está em TODOS os nomes (ex.: "hemogenin") não escolhe ninguém; as outras
      // ("king", "25mg", "zphc"…) apontam o(s) produto(s) perguntado(s).
      var _tn = function(nm){ return ' ' + _nd(nm).replace(/[^a-z0-9]+/g, ' ') + ' '; };
      var tk = _tokensUteis(mensagem).filter(function(w){ return !nomes.every(function(nm){ return _tn(nm).indexOf(' ' + w + ' ') >= 0; }); });
      if (tk.length) {
        // fica com o(s) que casam MAIS palavras ("king pharma" = King, não Cooper Pharma)
        var pts = nomes.map(function(nm){ var t = _tn(nm); return tk.filter(function(w){ return t.indexOf(' ' + w + ' ') >= 0; }).length; });
        var maxp = Math.max.apply(null, pts);
        if (maxp > 0) alvo = nomes.filter(function(nm, i){ return pts[i] === maxp; });
        if (alvo.length === nomes.length) alvo = [];
      }
    }
    if (alvo.length) {
      var rs = await Promise.all(alvo.slice(0, 10).map(_porTitulo));
      rs.forEach(function(r){ if (r[0]) achados.push(r[0]); });
    } else {
      // pergunta vale pra lista toda ("cada"): se todos começam pela mesma palavra, uma busca só
      // pega a lista inteira (inclusive os que passam dos 10 nomes do contexto); senão, título a título.
      var prim = _nd(nomes[0]).split(/[^a-z0-9]+/).filter(Boolean)[0] || '';
      var todosComecam = prim.length >= 3 && nomes.every(function(nm){ return _nd(nm).split(/[^a-z0-9]+/).filter(Boolean)[0] === prim; });
      if (todosComecam) achados = await _produtosPorQuery('title:' + prim + '*', 30);
      // o que a busca por prefixo não trouxe (ou lista com nomes variados): título a título, até 15
      var _kk = function(t){ return _nd(t).replace(/[^a-z0-9]+/g, ' ').trim(); };
      var jaTem = {}; achados.forEach(function(p){ jaTem[_kk(p.title)] = true; });
      var faltam = nomes.filter(function(nm){ return !jaTem[_kk(nm)]; }).slice(0, 15);
      if (faltam.length) {
        var rs2 = await Promise.all(faltam.map(_porTitulo));
        rs2.forEach(function(r){ if (r[0]) achados.push(r[0]); });
      }
      // só o que está na lista que o cliente vê (a busca por prefixo pode trazer outros)
      var naLista = {}; nomes.forEach(function(nm){ naLista[_kk(nm)] = true; });
      var soLista = achados.filter(function(p){ return naLista[_kk(p.title)]; });
      if (soLista.length) achados = soLista;
    }
  } else {
    var tk2 = _tokensUteis(mensagem);
    if (tk2.length) achados = await _produtosPorQuery(tk2.join(' '), 3);
  }
  // Na ORDEM da lista que o cliente vê, com o NÚMERO dela (o que ele digita pra escolher).
  var _k = function(t){ return _nd(t).replace(/[^a-z0-9]+/g, ' ').trim(); };
  var posLista = {}; ctx.lista.forEach(function(nm, i){ posLista[_k(nm)] = i + 1; });
  achados = achados.map(function(p){ return { p: p, n: posLista[_k(p.title)] || 0 }; })
    .sort(function(a, b){ return (a.n || 999) - (b.n || 999); });
  var blocos = [], total = 0;
  achados.forEach(function(x){
    var p = x.p, desc = String(p.description || '').trim();
    if (!desc) desc = '(sem descrição cadastrada)';
    if (desc.length > 1500) desc = desc.slice(0, 1500) + '…';
    if (total + desc.length > 15000) return;
    total += desc.length;
    blocos.push('• ' + (x.n ? 'Nº ' + x.n + ' da lista — ' : '') + String(p.title || '').trim() + ':\n' + desc);
  });
  if (!blocos.some(function(b){ return b.indexOf('(sem descrição cadastrada)') < 0; })) return '';
  console.log('[IA] descrição sob demanda | nomes no contexto:', nomes.length, '| lidas:', blocos.length);
  return blocos.join('\n\n');
}

// ── PRÉ-VENDA lendo a MESMA base (23/09/2026) ────────────────────────────────────
// Produtos em conversa (lista aberta, carrinho ou citados na mensagem) → valores da base,
// pra estimativa de ANTES da compra bater com o protocolo de DEPOIS.
async function blocoBasePreVenda(mensagem, contexto){
  const base = await carregarBaseGerador();
  if (!base.pep.length && !base.horm.length) return '';
  const ctx = nomesDoContexto(contexto);
  const achados = [], vistos = {};
  // a mensagem pode citar mais de um produto ("a retatrutida e o klow"): testa cada pedaço também
  const pedacos = String(mensagem || '').split(/,|;| e | ou /i);
  ctx.lista.concat(ctx.carrinho).concat([mensagem]).concat(pedacos).forEach(function(c){
    const a = acharNaBase(c, base); if (!a) return;
    const k = a.tipo + ':' + a.s.id;
    if (!vistos[k]) { vistos[k] = true; achados.push(a); }
  });
  if (!achados.length) return '';
  return '\n\n=== BASE OFICIAL DO GERADOR DE PROTOCOLOS (a MESMA do protocolo pós-venda) ===\n' +
    'Quando falar de dose, frequência, duração ou quanto um frasco rende destes produtos, use ESTES valores — a estimativa de ANTES da compra tem que bater com o protocolo de DEPOIS. Onde a base e as âncoras deste prompt divergirem, vale a BASE. ' +
    REGRA_RENDIMENTO + ' A regra da CONSULTORIA continua: protocolo completo e personalizado só depois da compra.\n' +
    achados.slice(0, 8).map(_linhaBase).join('\n');
}

async function gerarProtocoloPosVenda(body){
  try {
    const phone = body.phone;
    const assistente = (body.assistente || 'Athena');
    const apiKey = keyDoAssistente(assistente);
    const produtos = Array.isArray(body.produtos) ? body.produtos.filter(Boolean) : [];
    console.log('[IA] PROTOCOLO pós-venda | phone:', phone, '| produtos:', produtos.join(' | '));
    if (!phone || !produtos.length) return { statusCode: 200, body: 'no-op' };
    const catalogo = await catalogoResumo();
    // Tabela(s) de fracionamento (resolvidas pelo botconversa e enviadas no payload) vão JUNTO, no fim.
    const _tabelas = String(body.tabelas || '').trim();
    // 23/09: base do Gerador de Protocolos = fonte da verdade de dose/frequência/duração/cuidados.
    let _base = { texto: '', achados: [], semBase: [], conflitos: [] };
    try { _base = await blocoBaseGerador(produtos, !!_tabelas); }
    catch (e) { console.log('[IA] base do gerador falhou (segue sem ela):', e.message); }
    console.log('[IA] PROTOCOLO base do gerador | na base:', _base.achados.map(function(a){ return a.produto + ' → ' + a.s.id; }).join(' | ') || '—',
                '| sem base:', _base.semBase.join(' | ') || '—', '| conflitos:', _base.conflitos.join(' | ') || '—');
    const sys = PROTOCOLO_SYSTEM + `\n\n=== FICHAS TÉCNICAS OFICIAIS (fonte da verdade p/ composição/o que é — use SÓ isto; NÃO invente) ===\n${FICHAS_TECNICAS}` + `\n\n=== CATÁLOGO (referência de nomes/formatos reais — NÃO invente fora disto) ===\n${catalogo}` + _base.texto;
    const pedido = `O cliente é cliente VitaFlow e tem: ${produtos.join(', ')}.\n\nMonte agora o PROTOCOLO COMPLETO e detalhado ${produtos.length > 1 ? 'de CADA um desses produtos, e explique como combiná-los quando fizer sentido' : 'desse produto'}, pronto pra enviar no WhatsApp. Entregue o protocolo INTEIRO, do começo ao fim, SEM cortar no meio. Use *negrito* pros títulos — NUNCA use # ## ###.`;
    // Limite dinâmico: quanto mais produtos, mais espaço (evita protocolo cortado). Teto 8000.
    const maxTok = Math.min(8000, 2200 + produtos.length * 1500);
    const pensado = await pensarComClaude(sys, pedido, [], maxTok);
    if (!pensado.texto) {
      console.log('[IA] PROTOCOLO: modelo não respondeu — nada enviado.');
      return { statusCode: 200, body: 'no-reply' };
    }
    let texto = `📋 *SEU PROTOCOLO VITAFLOW* 🌿\n_Guarde esta mensagem! Preparei um guia completo pra você aproveitar ao máximo o que comprou._\n\n` + limparHeadersMd(pensado.texto);
    if (_tabelas) texto += `\n\n━━━━━━━━━━━━━━━━━━━━\n\n💉 *TABELA(S) DE FRACIONAMENTO*\n\n` + _tabelas;
    const envio = await enviarLongo(phone, aplicarNomeAssistente(texto, assistente), apiKey);
    console.log('[IA] PROTOCOLO enviado:', JSON.stringify(envio));
    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    console.log('[IA] EXCEÇÃO gerarProtocoloPosVenda:', e.message);
    return { statusCode: 200, body: 'err:' + e.message };
  }
}

// ── VISÃO: cliente enviou uma IMAGEM (encaminhada pelo botconversa.js via body.imagemUrl) ──
// A Athena roda em Claude, que ENXERGA imagem. Baixamos a imagem, mandamos pro modelo (visão)
// e devolvemos a resposta pela API do BotConversa. Se não der pra baixar/entender, cai num
// fallback educado (nunca ignora, como acontecia antes — a mídia caía na saudação genérica).
async function _baixarImagem(url){
  try {
    if (!url) return null;
    const r = await fetch(url);
    if (!r.ok) { console.log('[IA] _baixarImagem status', r.status); return null; }
    const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
    const ab = await r.arrayBuffer();
    const b64 = Buffer.from(ab).toString('base64');
    if (!b64) return null;
    if (b64.length > 4800000) { console.log('[IA] imagem grande demais:', b64.length); return null; } // ~3.5MB de imagem
    const okTypes = ['image/jpeg','image/png','image/gif','image/webp'];
    const media = okTypes.indexOf(ct) >= 0 ? ct : 'image/jpeg';
    return { b64: b64, media: media };
  } catch (e) { console.log('[IA] _baixarImagem erro:', e.message); return null; }
}

const VISAO_SYSTEM = `Você é a Athena, consultora da VitaFlow (peptídeos, hormônios, emagrecedores, GH) no WhatsApp. O cliente ENVIOU UMA IMAGEM. Olhe a imagem e responda em português do Brasil, tom caloroso e humano, de 2 a 5 linhas, usando *negrito* (um asterisco de cada lado). NUNCA use # ## ###.
Casos comuns e como agir:
- Etiqueta/pacote/print de rastreio: diga o que dá pra ver (ex.: transportadora, código) e oriente rastrear em vitaflowoficial.com/pages/rastrear-pedido (com CPF, número do pedido ou e-mail). Se for problema na entrega, indique a logística: wa.me/447537155718.
- Print de produto/tabela/anúncio: ajude a identificar o produto e ofereça mostrar as opções ("quer que eu te mostre as opções? é só me dizer o nome 😊"). NUNCA invente preço.
- Comprovante/print de pagamento: agradeça e explique que a confirmação é AUTOMÁTICA — assim que o pagamento cair, você avisa aqui e segue com o envio. NUNCA confirme o pagamento por conta da imagem.
- Exame/documento de saúde: dê um panorama geral e reforce acompanhamento profissional; NÃO faça diagnóstico.
Regras de ouro: NUNCA invente dados (preço, código de rastreio, nome/estoque de produto). Se a imagem estiver ilegível ou você não entender, peça com gentileza pra descrever por texto.`;

async function chamarModeloVisao(modelo, sys, userContent, maxTokens){
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modelo, max_tokens: maxTokens || 500, system: sys, messages: [{ role: 'user', content: userContent }] })
    });
    const d = await r.json();
    if (r.status === 200 && d && d.content && d.content[0] && d.content[0].text) return d.content[0].text.trim();
    console.log('[IA] visao modelo', modelo, '-> status', r.status, '| erro:', d && d.error ? JSON.stringify(d.error).slice(0,160) : 'nenhum');
  } catch (e) { console.log('[IA] EXCEÇÃO visao', modelo, ':', e.message); }
  return null;
}

// Mesma descoberta de modelos do texto — todos os Claude 3/3.5 têm visão.
async function pensarComClaudeVisao(sys, userContent){
  const forcado = process.env.ATHENA_MODEL;
  if (forcado) { const t = await chamarModeloVisao(forcado, sys, userContent, 500); if (t) return { texto: t, modelo: forcado }; }
  const disponiveis = await modelosDisponiveis();
  const lista = montarCandidatos(disponiveis).filter(m => m !== forcado);
  for (const modelo of lista){ const t = await chamarModeloVisao(modelo, sys, userContent, 500); if (t) return { texto: t, modelo }; }
  return { texto: '', modelo: '' };
}

async function verImagem(body){
  try {
    const phone = body.phone;
    const assistente = (body.assistente || 'Athena');
    const apiKey = keyDoAssistente(assistente);
    if (!phone) return { statusCode: 200, body: 'no-op' };
    const legenda = (body.mensagem || '').toString().trim();
    console.log('[IA] VISÃO | phone:', phone, '| url:', String(body.imagemUrl || '').slice(0, 120), '| legenda:', legenda.slice(0, 80));
    const img = await _baixarImagem(body.imagemUrl);
    if (!img) {
      const msg = 'Recebi sua imagem, mas não consegui abrir ela aqui. 😕 Me conta *por texto* o que você precisa — e, se for sobre um pedido, me manda seu *CPF* ou o *número do pedido* que eu já te ajudo! 😊';
      await enviarBotConversa(phone, aplicarNomeAssistente(msg, assistente), apiKey);
      return { statusCode: 200, body: 'img-fail' };
    }
    const userContent = [
      { type: 'image', source: { type: 'base64', media_type: img.media, data: img.b64 } },
      { type: 'text', text: legenda ? ('Legenda que o cliente mandou junto: "' + legenda + '"') : 'O cliente enviou esta imagem, sem legenda. Ajude conforme o que você vê.' }
    ];
    const pensado = await pensarComClaudeVisao(VISAO_SYSTEM, userContent);
    const txt = pensado.texto || 'Recebi sua imagem! 😊 Me conta *por texto* como posso te ajudar que eu resolvo aqui mesmo.';
    const envio = await enviarLongo(phone, aplicarNomeAssistente(txt, assistente), apiKey);
    console.log('[IA] VISÃO enviada | modelo:', pensado.modelo || 'NENHUM', '| envio:', JSON.stringify(envio));
    return { statusCode: 200, body: 'ok-visao' };
  } catch (e) {
    console.log('[IA] EXCEÇÃO verImagem:', e.message);
    return { statusCode: 200, body: 'err:' + e.message };
  }
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const phone = body.phone;
    const assistente = (body.assistente || 'Athena');   // "Athena" ou "Stella"
    const apiKey = keyDoAssistente(assistente);          // key da companhia certa
    // Modo PROTOCOLO pós-venda: gera e envia o protocolo completo dos produtos comprados.
    if ((body.tipo || '') === 'protocolo') return await gerarProtocoloPosVenda(body);
    // Modo VISÃO: cliente enviou imagem (o botconversa.js manda a URL em body.imagemUrl).
    if (body.imagemUrl) return await verImagem(body);
    const mensagem = (body.mensagem || '').toString().trim();
    const promoContext = (body.promoContext || '').toString().trim(); // regras REAIS de promoção/desconto (vêm do botconversa.js)
    const contexto = (body.contexto || '').toString().trim(); // o que o cliente está VENDO agora (lista aberta)
    console.log('[IA] START | phone:', phone, '| assistente:', assistente, '| mensagem:', mensagem, '| contexto:', contexto ? 'sim' : 'nao');
    if (!phone || !mensagem) { console.log('[IA] no-op: faltou phone ou mensagem'); return { statusCode: 200, body: 'no-op' }; }

    // Memória: carrega o que já foi conversado com esse cliente.
    const historico = await lerHistorico(phone);

    const catalogo = await catalogoResumo();
    console.log('[IA] catalogo len:', catalogo.length, '| promoContext:', promoContext ? 'sim' : 'nao', '| histórico:', historico.length, '| ANTHROPIC_KEY presente:', !!ANTHROPIC_KEY);
    let sys = SYSTEM + `\n\n=== FICHAS TÉCNICAS OFICIAIS (fonte da verdade p/ composição/o que é — use SÓ isto; NÃO invente) ===\n${FICHAS_TECNICAS}` + `\n\n=== CATÁLOGO REAL (preços e disponibilidade de hoje) ===\n${catalogo}`;
    if (promoContext) {
      sys += `\n\n=== PROMOÇÕES E DESCONTOS (regras REAIS de hoje — use SOMENTE isto, NÃO invente promoção) ===\n${promoContext}`;
    }
    if (contexto) {
      sys += `\n\n=== CONTEXTO ATUAL DO CLIENTE (PRIORIDADE MÁXIMA) ===\n${contexto}\nResponda com base NESSE contexto atual. Se o histórico falar de outro produto/assunto, IGNORE — o cliente está tratando do que está acima AGORA.`;
    }

    // 23/09: pré-venda com a MESMA base do Gerador que o protocolo pós-venda usa.
    try { sys += await blocoBasePreVenda(mensagem, contexto); }
    catch (e) { console.log('[IA] base do gerador na pré-venda falhou (segue sem ela):', e.message); }

    // ── DESCRIÇÃO SOB DEMANDA: só quando o cliente PERGUNTA um detalhe do produto ──
    // Lê a descrição da página do produto na hora. Se o produto não tiver descrição,
    // a IA responde HONESTAMENTE que não tem essa info (NÃO promete confirmar, NÃO inventa).
    if (ehPerguntaDetalheProduto(mensagem)) {
      const descProd = await descricoesDaPergunta(mensagem, contexto);   // 23/09: só dos produtos perguntados
      console.log('[IA] pergunta de detalhe do produto | descrição encontrada:', descProd ? 'sim' : 'nao');
      if (descProd) {
        sys += `\n\n=== DESCRIÇÃO OFICIAL DO PRODUTO (da página da loja — use SÓ isto p/ responder o detalhe perguntado) ===\n${descProd}`;
        sys += `\n\n=== COMO RESPONDER ESTA PERGUNTA DE DETALHE ===\nResponda o que o cliente perguntou USANDO SOMENTE a descrição oficial acima. Se a descrição NÃO trouxer exatamente o dado perguntado, diga com honestidade que não consta essa informação. NUNCA invente quantidade, composição, dosagem ou qualquer dado. NÃO prometa "confirmar depois".` + MULTI_DETALHE;
      } else {
        sys += `\n\n=== PERGUNTA DE DETALHE SEM DESCRIÇÃO DISPONÍVEL ===\nO cliente perguntou um detalhe do produto, mas ESTE produto NÃO tem descrição cadastrada. Responda com honestidade que você não tem essa informação disponível. NÃO invente. NÃO prometa "vou confirmar" ou "já te confirmo" — apenas diga, de forma educada, que essa informação não está disponível.`;
      }
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
          const envio = await enviarLongo(phone, aplicarNomeAssistente(corpo, assistente), apiKey);
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
        const envio = await enviarLongo(phone, aplicarNomeAssistente(corpo, assistente), apiKey);
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
    const envio = await enviarLongo(phone, aplicarNomeAssistente(textoFinal, assistente), apiKey);
    console.log('[IA] RESULTADO ENVIO:', JSON.stringify(envio));
    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    console.log('[IA] EXCEÇÃO handler:', e.message);
    return { statusCode: 200, body: 'err:' + e.message };
  }
};
