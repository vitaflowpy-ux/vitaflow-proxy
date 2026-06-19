// botconversa.js — VitaFlow Athena v4.2 — menu-driven + Promoção Relâmpago + reconhecimento por texto

const INFINITEPAY_TAG = 'vitaflowoficial';
const FIREBASE_URL    = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const GAS_URL         = 'https://script.google.com/macros/s/AKfycbxFlaN0FXFbpcC8HZ80sxnq383m5d-xTaj5cg72VcCdnYx47N_qKkiELFN5KAPmm_nb/exec';
const RECIBO_BASE     = 'https://melodious-pony-e4f4f5.netlify.app/recibo-auto.html';

// ── Desconto Athena e Cupons ──────────────────────────────────────────────────
const DESCONTO_ATHENA_PCT = 3;

// ── PROMOÇÃO DO MOMENTO (editável) ───────────────────────────────────────────
// Para trocar a promoção no futuro, edite só este bloco.
// - Desconto por PRODUTO: liste os nomes EXATOS em `produtos`.
// - Desconto por COLEÇÃO: liste os handles em `colecoes` (ex: 'peptideos','emagrecedores').
// - Pode usar os dois ao mesmo tempo. Para desligar tudo: ativa:false.
const PROMO_PRODUTO = {
  ativa: false,
  pct: 10,
  validade: '',
  produtos: [],
  colecoes: [],
  titulo: '',
  linkProduto: '',
  linkGrupo: '',
};
function _normNomeProd(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim(); }
// um item do carrinho entra na promoção se casar por NOME (produtos) ou por COLEÇÃO (colecoes)
function ehProdutoPromo(item){
  if (!PROMO_PRODUTO.ativa) return false;
  const nome = typeof item === 'string' ? item : (item && item.nome);
  const colItem = (item && typeof item === 'object') ? (item.colecao || '') : '';
  const porNome = (PROMO_PRODUTO.produtos || []).some(p => _normNomeProd(p) === _normNomeProd(nome));
  const porColecao = colItem && (PROMO_PRODUTO.colecoes || []).indexOf(colItem) >= 0;
  return porNome || porColecao;
}
const FIRESTORE_PROJECT = 'pricehub-f0236';
const FIRESTORE_KEY = 'AIzaSyBxaI82P6OjCoPtBA-kNZZ0-F0RdjYdNhw';

const PROMO_RELAMPAGO = {
  ativa: true,
  titulo: 'PROMOÇÃO RELÂMPAGO — MyoMax Inibition™',
  link: 'https://vitaflowoficial.com/products/%F0%9F%94%A5-promocao-2duas-canetas-myomax-inibition-cjc-1295-hgh-frag-folistatin-%F0%9F%94%A5?_pos=2&_psq=Myomax&_ss=e&_v=1.0',
  produtos: [
    { nome: 'MyoMax Inibition™ — 2 Canetas 200 IU / 3 mL (Alluvi Healthcare)', de: 1598, por: 999 },
  ],
};
function promoAtiva() {
  return (PROMO_RELAMPAGO.ativa && PROMO_RELAMPAGO.produtos && PROMO_RELAMPAGO.produtos.length) ? PROMO_RELAMPAGO : null;
}
function reais(n) { return Number(n || 0).toLocaleString('pt-BR'); }

// ── PROMO_ANUNCIO: desligado (Namorados encerrado). A promoção atual é a PROMO_PRODUTO (opção 8). ──
const PROMO_ANUNCIO = { ativa: false };

// Anúncio da promoção do momento (opção 8): mostra o produto, o link do grupo VIP e o link do produto.
// O desconto NÃO é por fluxo — é aplicado por item no fechamento (ver fecharResumoNormal).
async function anunciarLancamento(session, sid) {
  await saveSession(sid, { ...session, state: 'PROMO_OFERECER' });
  const nomes = (PROMO_PRODUTO.produtos || []).join(', ');
  let msg = `${PROMO_PRODUTO.titulo}\n\n`;
  msg += `🔒 _Oferta exclusiva para membros do nosso grupo VIP._\n\n`;
  msg += `Chegou a *Retatrutida AQ 120mg da ZPHC* — a primeira da marca no formato *aquoso*! 💧\n\n`;
  msg += `Já vem *diluída de fábrica*, sem etapa de reconstituição: você abre e aplica. O kit traz *2 viais de 60mg*. 💉\n\n`;
  msg += `A fórmula usa estabilizadores específicos que mantêm o peptídeo íntegro no transporte e no armazenamento em temperatura ambiente. Produto autêntico, com *lacre holográfico* e *código de validação individual* em cada kit. ✅\n\n`;
  msg += `🎁 *${PROMO_PRODUTO.pct}% OFF até ${PROMO_PRODUTO.validade}!* O desconto é aplicado automaticamente nesse produto quando você fecha comigo. 🧡\n\n`;
  msg += `👀 *Ver o produto:*\n${PROMO_PRODUTO.linkProduto}\n\n`;
  msg += `📲 *Entre no nosso grupo VIP* (se ainda não for membro, é só entrar; se já for, é só seguir):\n${PROMO_PRODUTO.linkGrupo}\n\n`;
  msg += `Quer que eu já adicione no seu carrinho?\n\n1️⃣ Sim, quero a Retatrutida AQ\n2️⃣ Não, voltar ao menu`;
  return msg;
}

// ── Grupo VIP (WhatsApp + Telegram) ───────────────────────────────────────────
const GRUPO_WHATSAPP = 'https://chat.whatsapp.com/COklmK82NWu9zQkdALjchy';
const GRUPO_TELEGRAM = 'https://t.me/referencias_vitaflow';
function msgGrupoVip() {
  return `🎉 *GRUPOS VIP VITAFLOW* 🎉\n\n` +
    `Entra nos nossos grupos pra receber *promoções, novidades e ofertas exclusivas* em primeira mão! 🔥\n\n` +
    `📱 *Grupo no WhatsApp:*\n${GRUPO_WHATSAPP}\n\n` +
    `✈️ *Grupo no Telegram:*\n${GRUPO_TELEGRAM}\n\n` +
    `_Dica: entra nos dois pra não perder nada. 😉_\n\n` +
    `_Digite *menu* para voltar ao início._`;
}

// ── Atacado ───────────────────────────────────────────────────────────────────
const TABELA_ATACADO_URL = 'https://drive.google.com/file/d/1olhYj0OW1cL0Wk0kk6-fct89EJff_1Ip/view';
const WHATSAPP_ATACADO_1 = 'wa.me/5521998367319';
const WHATSAPP_ATACADO_2 = 'wa.me/447537155723';

const MSG_ATACADO = `*🏭 VENDAS NO ATACADO — VitaFlow*

Que ótimo seu interesse! Aqui estão as condições do nosso atacado:

💰 *Pedido mínimo:* R$ 3.000 por pedido
📋 *Exclusivo* para produtos da tabela de atacado (itens fora da tabela não entram nessa modalidade)
🔄 *Tabela atualizada diariamente* — os preços acompanham a flutuação do dólar, então valem para o dia da consulta
🚚 *Logística diferenciada:* despacho em até 5 dias úteis após a compensação do pagamento (garante o controle de qualidade e a embalagem adequada). Após a postagem, os prazos de entrega por região seguem os mesmos do varejo.

📥 *Baixe a tabela atualizada de hoje:*
${TABELA_ATACADO_URL}

⚠️ As vendas no atacado são feitas exclusivamente por um *consultor humano especializado* — eu (Athena) não processo esse tipo de pedido.

*Quer que eu te redirecione para um dos nossos consultores de atacado?*
1️⃣ Sim, quero falar com um consultor
2️⃣ Não, voltar ao menu`;

const MSG_ATACADO_CONTATOS = `*🏭 Consultores de Atacado — VitaFlow*

Fale agora com um dos nossos consultores especializados em atacado:

📲 ${WHATSAPP_ATACADO_1}
📲 ${WHATSAPP_ATACADO_2}

Tenha em mãos a tabela de atacado e a lista de produtos que deseja. 😊

_Digite *menu* para voltar ao início._`;

const MSG_PRAZO_VAREJO = `*📦 PRAZO DE POSTAGEM E ENTREGA — Varejo*

⏱️ *Despacho:* em até *48 horas úteis* após a confirmação do pagamento.

Após a postagem, os prazos estimados de entrega por região são:
🟢 *Sudeste:* 2 a 5 dias úteis
🔵 *Sul:* 3 a 5 dias úteis
🟠 *Centro-Oeste:* 4 a 6 dias úteis
🟡 *Nordeste:* 5 a 8 dias úteis
🔴 *Norte:* 7 a 10 dias úteis

_*Esses prazos são estimativas e podem variar conforme distância, condições climáticas e acesso rodoviário._`;

const MSG_PERGUNTA_TIPO_PRAZO = `📦 *Sobre prazo de entrega* — me diz qual o tipo da sua compra:

1️⃣ Compra normal (varejo)
2️⃣ Compra no atacado (pedido mínimo R$ 3.000)`;

// ── Tabela de fretes ──────────────────────────────────────────────────────────
const FRETES = {
  RJ:{PAC:45,SEDEX:60,Transp:70},  SP:{PAC:45,SEDEX:60,Transp:55},
  MG:{PAC:45,SEDEX:70,Transp:70},  ES:{PAC:45,SEDEX:70,Transp:70},
  DF:{PAC:45,SEDEX:60,Transp:72},  PR:{PAC:45,SEDEX:60,Transp:70},
  SC:{PAC:45,SEDEX:70,Transp:70},  RS:{PAC:45,SEDEX:70,Transp:100},
  GO:{PAC:45,SEDEX:70,Transp:76},  MS:{PAC:45,SEDEX:85,Transp:80},
  BA:{PAC:58,SEDEX:90,Transp:80},  MT:{PAC:58,SEDEX:90,Transp:75},
  CE:{PAC:72,SEDEX:105,Transp:80}, PA:{PAC:87,SEDEX:105,Transp:110},
  PE:{PAC:87,SEDEX:115,Transp:120},TO:{PAC:87,SEDEX:105,Transp:110},
  MA:{PAC:100,SEDEX:125,Transp:90},PB:{PAC:100,SEDEX:125,Transp:100},
  RN:{PAC:100,SEDEX:125,Transp:100},PI:{PAC:100,SEDEX:125,Transp:110},
  AL:{PAC:100,SEDEX:125,Transp:90},SE:{PAC:100,SEDEX:125,Transp:90},
  AM:{PAC:100,SEDEX:125,Transp:110},RO:{PAC:100,SEDEX:110,Transp:170},
  AP:{PAC:100,SEDEX:125,Transp:120},RR:{PAC:130,SEDEX:110,Transp:170},
  AC:{PAC:130,SEDEX:110,Transp:150},
};

// ── Menus fixos ───────────────────────────────────────────────────────────────
const MENU_PRINCIPAL_BASE = `✨ *Olá! Bem-vindo à VitaFlow!* 🌿

Eu sou a *Athena* 🤖💊 — sua consultora virtual especializada em peptídeos, hormônios e suplementação avançada de alta performance.

Estou aqui para te ajudar a encontrar os melhores produtos, tirar dúvidas técnicas e garantir a melhor experiência de compra. Tudo com segurança, agilidade e os melhores preços! 💪🔥

*O que você procura hoje?*

1️⃣ Mais Vendidos 🔥
2️⃣ Emagrecedores 💊
3️⃣ Peptídeos 💉
4️⃣ Hormônios 💪
5️⃣ GH ⚡
6️⃣ Outros (Botox, vitaminas e remédios em geral) 📦
7️⃣ Buscar por Fabricante 🏭
8️⃣ Promoções do momento 🔥
9️⃣ Protocolo / Dúvidas técnicas 🔬
🔟 Rastrear meu pedido 📦

📋 Digite *TABELA* para ver a lista completa de preços`;

function buildMenuPrincipal() {
  let menu = MENU_PRINCIPAL_BASE;
  const promo = promoAtiva();
  if (promo) {
    menu += `

🚨 *Temos promoções ativas no momento!* Digite *promo* ou escolha a *opção 8* para ver todas. ⚡`;
  } else {
    menu += `

🎁 *Sabia que comprando comigo você já ganha 3% de desconto em todos os produtos?* É um benefício exclusivo meu! _(Não acumula com cupom ou promoção — vale sempre o MAIOR desconto pra você 😉)_`;
  }
  menu += `

💬 *Dica:* você também pode digitar direto o *nome do produto* (ex.: retatrutida, stanozolol, gh) que eu já te mostro!

_Digite o número da opção_`;
  return menu;
}

const MENU_PRINCIPAL = MENU_PRINCIPAL_BASE + `

_Digite o número da opção_`;

const MENU_PEPTIDEOS = `*💊 PEPTÍDEOS*

1️⃣ BPC-157
2️⃣ TB-500
3️⃣ GHK-Cu
4️⃣ Klow
5️⃣ Glow
6️⃣ SS-31
7️⃣ MOTS-C
8️⃣ Ipamorelin
9️⃣ CJC-1295
🔟 PT-141
11. AOD-9604
12. CBL-514
13. Epitalon
14. NAD+
15. Tesamorelin
16. Outros peptídeos

_Digite o número, o *nome do produto* ou *menu* para voltar_

_Procurando Retatrutida, Tirzepatida ou Semaglutida? Estão em *Emagrecedores* (opção 2)._`;

const MENU_HORMONIOS = `*💉 HORMÔNIOS*

1️⃣ Enantato de Testosterona
2️⃣ Testosterona / Durateston (mix)
3️⃣ NPP (Nandrolona Fenilpropionato)
4️⃣ Trembolona
5️⃣ Boldenona
6️⃣ Stanozolol
7️⃣ Oxandrolona
8️⃣ Nandrolona (Deca)
9️⃣ Masteron
🔟 Primobolan
11. Dianabol
12. Hemogenin (Anadrol)
13. HCG
14. Anastrozol / Proviron
15. Clembuterol / T3
16. CutStack
17. Outros hormônios

_Digite o número, o *nome do produto* ou *menu* para voltar_`;

const MENU_FABRICANTES = `*🏭 BUSCAR POR FABRICANTE*

1️⃣ ZPHC
2️⃣ Veltrane
3️⃣ Landerlan
4️⃣ Muscle Labs
5️⃣ Alpha Pharma
6️⃣ Health Peptides
7️⃣ Alluvi Healthcare
8️⃣ Lipoless
9️⃣ Cooper Pharma
🔟 Neuroceptix
11. King Pharma
12. Synedica
13. NeoPeptides
14. Eurogold
15. Novax Pharmaceuticals
16. Bratva Labs
17. Outro fabricante (digitar nome)

_Digite o número, o *nome do produto* ou *menu* para voltar_`;

const MENU_TESTO = `*💉 TESTOSTERONA — qual éster você procura?*

1️⃣ Enantato
2️⃣ Cipionato
3️⃣ Durateston (blend)
4️⃣ Outras (Propionato, Suspensão, Undecanoato/Nebido)

_Digite o número ou *menu* para voltar ao início_`;

const MENU_BASE_ESTER = `1️⃣ Testosterona
2️⃣ Trembolona
3️⃣ Masteron
4️⃣ Nandrolona
5️⃣ Outras

_Digite o número ou *menu* para voltar ao início_`;

// ── ENTREGA 3 — RECONHECIMENTO DE PRODUTO POR TEXTO ───────────────────────────
// Específico ANTES do genérico (GHK-Cu/HGH Frag antes de GH). canonico=claro (direto);
// apelidos=gíria/erro (confirma antes). Ésteres sozinhos => pergunta a base.
const DICT_PRODUTOS = [
  { label:'Retatrutida', tipo:'lista', colecao:'emagrecedores', filtro:['retatrutida'],
    canonico:['retatrutida'], apelidos:['retra','retras','reta','retratutida','retatrutdia','retatrutina'] },
  { label:'Tirzepatida', tipo:'lista', colecao:'emagrecedores', filtro:['tirzepatida'],
    canonico:['tirzepatida','mounjaro','zepbound'], apelidos:['tirze','tirza','tirzepatda','tirzepatina'] },
  { label:'Semaglutida', tipo:'lista', colecao:'emagrecedores', filtro:['semaglutida'],
    canonico:['semaglutida','ozempic','wegovy'], apelidos:['sema','semaglutda','semaglutina'] },
  { label:'Saxenda', tipo:'saxenda', colecao:'emagrecedores', filtro:[],
    canonico:['saxenda','liraglutida'], apelidos:[] },
  { label:'GHK-Cu', tipo:'lista', colecao:'peptideos', filtro:['ghk'],
    canonico:['ghk-cu','ghkcu','ghk'], apelidos:[] },
  { label:'HGH Frag 176-191', tipo:'lista', colecao:'peptideos', filtro:['frag'],
    canonico:['hgh frag','hgh fragment','frag 176','frag176','176-191'], apelidos:['frag'] },
  { label:'GH', tipo:'categoria', colecao:'gh', filtro:[],
    canonico:['hgh','somatropina','hormonio do crescimento','hormonio de crescimento'], apelidos:['gh'] },
  { label:'BPC-157', tipo:'lista', colecao:'peptideos', filtro:['bpc'],
    canonico:['bpc-157','bpc157','bpc'], apelidos:[] },
  { label:'TB-500', tipo:'lista', colecao:'peptideos', filtro:['tb-500','tb500'],
    canonico:['tb-500','tb500'], apelidos:['tb'] },
  { label:'Ipamorelin', tipo:'lista', colecao:'peptideos', filtro:['ipamorelin'],
    canonico:['ipamorelin'], apelidos:['ipa','ipamo'] },
  { label:'CJC-1295', tipo:'lista', colecao:'peptideos', filtro:['cjc'],
    canonico:['cjc-1295','cjc1295','cjc'], apelidos:[] },
  { label:'Klow', tipo:'lista', colecao:'peptideos', filtro:['klow'], canonico:['klow'], apelidos:[] },
  { label:'Glow', tipo:'lista', colecao:'peptideos', filtro:['glow'], canonico:['glow'], apelidos:[] },
  { label:'SS-31', tipo:'lista', colecao:'peptideos', filtro:['ss-31','ss31'], canonico:['ss-31','ss31'], apelidos:[] },
  { label:'MOTS-C', tipo:'lista', colecao:'peptideos', filtro:['mots-c','motsc'], canonico:['mots-c','motsc'], apelidos:['mots'] },
  { label:'PT-141', tipo:'lista', colecao:'peptideos', filtro:['pt-141','pt141'], canonico:['pt-141','pt141','pt 141'], apelidos:['bremelanotide'] },
  { label:'AOD-9604', tipo:'lista', colecao:'peptideos', filtro:['aod-9604','aod9604','aod'], canonico:['aod-9604','aod9604','aod'], apelidos:[] },
  { label:'CBL-514', tipo:'lista', colecao:'peptideos', filtro:['cbl-514','cbl514','cbl'], canonico:['cbl-514','cbl514','cbl'], apelidos:[] },
  { label:'Epitalon', tipo:'lista', colecao:'peptideos', filtro:['epitalon'], canonico:['epitalon','epithalon'], apelidos:[] },
  { label:'NAD+', tipo:'lista', colecao:'peptideos', filtro:['nad'], canonico:['nad+','nad'], apelidos:[] },
  { label:'Tesamorelin', tipo:'lista', colecao:'peptideos', filtro:['tesamorelin'], canonico:['tesamorelin','tesamorelina'], apelidos:['tesa','tesamorelim','tezamorelin'] },
  { label:'Água Bacteriostática', tipo:'busca_tudo', colecao:'', filtro:['bacteriostatica'],
    canonico:['agua bacteriostatica','bacteriostatica','agua bac'], apelidos:['bac'] },
  { label:'Testosterona', tipo:'submenu_testo', colecao:'hormonios', filtro:['testosterona'],
    canonico:['testosterona'], apelidos:['testo','tt','dura','durateston'] },
  { label:'Enantato', tipo:'ester', ester:'enantato', colecao:'hormonios', filtro:[], canonico:['enantato'], apelidos:['enan'] },
  { label:'Cipionato', tipo:'ester', ester:'cipionato', colecao:'hormonios', filtro:[], canonico:['cipionato'], apelidos:['cipio'] },
  { label:'Propionato', tipo:'ester', ester:'propionato', colecao:'hormonios', filtro:[], canonico:['propionato'], apelidos:['propio'] },
  { label:'Acetato', tipo:'ester', ester:'acetato', colecao:'hormonios', filtro:[], canonico:['acetato'], apelidos:[] },
  { label:'Fenilpropionato', tipo:'ester', ester:'fenilpropionato', colecao:'hormonios', filtro:[], canonico:['fenilpropionato'], apelidos:[] },
  { label:'Undecanoato', tipo:'ester', ester:'undecanoato', colecao:'hormonios', filtro:[], canonico:['undecanoato'], apelidos:[] },
  { label:'Decanoato', tipo:'ester', ester:'decanoato', colecao:'hormonios', filtro:[], canonico:['decanoato'], apelidos:[] },
  { label:'Trembolona', tipo:'lista', colecao:'hormonios', filtro:['trembolona'], canonico:['trembolona','parabolan'], apelidos:['trembo','tren'] },
  { label:'Nandrolona (Deca)', tipo:'lista', colecao:'hormonios', filtro:['nandrolona'], canonico:['nandrolona','deca-durabolin','deca durabolin','durabolin'], apelidos:['deca'] },
  { label:'NPP', tipo:'lista', colecao:'hormonios', filtro:['npp','fenilpropionato'], canonico:['npp'], apelidos:[] },
  { label:'Stanozolol', tipo:'lista', colecao:'hormonios', filtro:['stanozolol'], canonico:['stanozolol','winstrol'], apelidos:['stano','wins','estano'] },
  { label:'Oxandrolona', tipo:'lista', colecao:'hormonios', filtro:['oxandrolona'], canonico:['oxandrolona','anavar'], apelidos:['oxa','oxan'] },
  { label:'Masteron', tipo:'lista', colecao:'hormonios', filtro:['masteron','drostanolona'], canonico:['masteron','drostanolona'], apelidos:['maste','master'] },
  { label:'Boldenona', tipo:'lista', colecao:'hormonios', filtro:['boldenona'], canonico:['boldenona','equipoise'], apelidos:['bold'] },
  { label:'Primobolan', tipo:'lista', colecao:'hormonios', filtro:['primobolan','metenolona'], canonico:['primobolan','metenolona'], apelidos:['primo'] },
  { label:'Hemogenin (Anadrol)', tipo:'lista', colecao:'hormonios', filtro:['hemogenin','oximetolona'], canonico:['hemogenin','anadrol','oximetolona'], apelidos:['hemo'] },
  { label:'Dianabol', tipo:'lista', colecao:'hormonios', filtro:['dianabol','metandienona'], canonico:['dianabol','metandienona','bombadrol'], apelidos:['dbol','diana'] },
  { label:'Clembuterol', tipo:'lista', colecao:'hormonios', filtro:['clembuterol'], canonico:['clembuterol'], apelidos:['clen','clembu'] },
  { label:'HCG', tipo:'lista', colecao:'hormonios', filtro:['hcg'], canonico:['hcg'], apelidos:[] },
  { label:'Anastrozol / Proviron', tipo:'lista', colecao:'hormonios', filtro:['anastrozol','proviron'], canonico:['anastrozol','proviron','arimidex'], apelidos:[] },
  { label:'CutStack', tipo:'lista', colecao:'hormonios', filtro:['cutstack'], canonico:['cutstack','cut stack'], apelidos:[] },
  { label:'Botox', tipo:'lista', colecao:'outros', filtro:['botox'], canonico:['botox','toxina botulinica'], apelidos:['bota'] },
];

// diferem por no máximo 1 edição (substituição/inserção/remoção) — pega erros como "tesamorelim" vs "tesamorelin"
function _diff1(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, diffs = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diffs > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else { i++; j++; }
  }
  if (i < la || j < lb) diffs++;
  return diffs <= 1;
}
function termoBate(termo, nMsg) {
  const t = norm(termo);
  if (!t) return false;
  if (nMsg === t) return true;
  const palavras = nMsg.split(/[^a-z0-9+]+/).filter(Boolean);
  if (palavras.includes(t)) return true;
  if (t.length >= 4 && nMsg.includes(t)) return true;
  // ignora espaço/hífen dos dois lados: "Pt 141" ~ "pt-141" ~ "pt141"
  const tCompacto = t.replace(/[-\s]/g, '');
  const msgCompacto = nMsg.replace(/[-\s]/g, '');
  if (tCompacto.length >= 4 && msgCompacto.includes(tCompacto)) return true;
  // grafia aproximada (1 letra) — só para termos longos, evita falso positivo
  if (t.length >= 6) {
    if (palavras.some(p => _diff1(p, t))) return true;
    if (tCompacto.length >= 6 && palavras.some(p => _diff1(p.replace(/[-]/g, ''), tCompacto))) return true;
  }
  return false;
}

function reconhecerProduto(nMsg) {
  if (!nMsg) return null;
  for (const e of DICT_PRODUTOS) {
    if ((e.canonico || []).some(t => termoBate(t, nMsg))) return { entry: e, modo: 'canonico' };
  }
  for (const e of DICT_PRODUTOS) {
    if ((e.apelidos || []).some(t => termoBate(t, nMsg))) return { entry: e, modo: 'apelido' };
  }
  return null;
}

// ── Detecção de intenção de RASTREIO (CPF, nº de pedido, e-mail, palavra) ──────
// Número de pedido VitaFlow: VF-DDMM-XNNN (ex.: VF-0806-A003). Aceita variações de espaço/traço.
function ehNumeroPedido(msg) {
  const t = (msg || '').toUpperCase().replace(/\s/g,'');
  return /VF-?\d{3,4}-?[A-Z]?\d{2,4}/.test(t);
}
function ehCPFsolto(msg) {
  const d = (msg || '').replace(/\D/g,'');
  // 11 dígitos e a mensagem é "majoritariamente" esse número (não um endereço com vários números)
  if (d.length !== 11) return false;
  const resto = (msg || '').replace(/[\d.\-\s/]/g,'').trim();
  return resto.length <= 4; // tolera "cpf" antes do número
}
function ehIntencaoRastreio(nMsg, msgOriginal) {
  const palavras = ['rastrear','rastreamento','rastreio','cade meu pedido','cadê meu pedido','meu pedido','onde esta meu pedido','onde está meu pedido','status do pedido','status do meu pedido','acompanhar pedido','codigo de rastreio'];
  if (palavras.some(p => nMsg.includes(norm(p)))) return true;
  if (ehNumeroPedido(msgOriginal)) return true;
  if (ehCPFsolto(msgOriginal)) return true;
  return false;
}

// Executa o rastreio direto (mesma lógica do estado RASTREAR), a partir de qualquer estado.
async function fazerRastreio(termo, respond) {
  const pedidos = await consultarStatusGAS((termo || '').trim());
  if (!pedidos.length) {
    return respond(`🔍 Não encontrei nenhum pedido com *esse dado*.\n\nConfere o *número do pedido*, *CPF* ou *e-mail* da compra e me manda de novo. 😊\n\n📞 Se preferir, fale com a logística: 👉 wa.me/447537155718\n_Ou digite *menu* para voltar._`);
  }
  if (pedidos.length === 1) {
    return respond(statusBloco(pedidos[0].pedido, pedidos[0].status) + RASTREIO_RODAPE);
  }
  const blocos = pedidos.map(p => statusBloco(p.pedido, p.status)).join('\n\n');
  return respond(`Encontrei *${pedidos.length} pedidos* no seu cadastro:\n\n${blocos}` + RASTREIO_RODAPE);
}

function filtrarEster(dados, ester, base) {
  const ne = norm(ester);
  const baseMap = {
    testosterona: ['testosterona','testo','dura','durateston','sustanon','sust'],
    trembolona:   ['trembolona','tren','trembo','parabolan'],
    masteron:     ['masteron','drostanolona'],
    nandrolona:   ['nandrolona','deca','npp','durabolin'],
  };
  let lines = dados.split('\n').filter(Boolean).filter(l => norm(l).includes(ne));
  if (base === 'outras') return [...new Set(lines)];
  const keys = baseMap[base] || [base];
  const outras = Object.entries(baseMap).filter(([k]) => k !== base).flatMap(([,v]) => v);
  let res = lines.filter(l => { const nl = norm(l); return keys.some(k => nl.includes(k)); });
  if (base === 'testosterona') {
    const puros = lines.filter(l => {
      const nl = norm(l);
      return !outras.some(o => nl.includes(o)) && !keys.some(k => nl.includes(k));
    });
    res = [...new Set(res.concat(puros))];
  }
  return [...new Set(res)];
}

async function resolverReconhecido(session, sid, e, respond) {
  e = e || {};
  if (e.tipo === 'submenu_testo') {
    await saveSession(sid, { ...session, state:'SUBMENU_TESTO', errosSeguidos:0, pendenteRec:null });
    return respond(MENU_TESTO);
  }
  if (e.tipo === 'ester') {
    await saveSession(sid, { ...session, state:'ESTER_BASE', pendenteEster: e.ester, errosSeguidos:0, pendenteRec:null });
    return respond(`*${(e.ester||'').toUpperCase()} de quê?* 💉\n\nEsse éster existe em várias bases. Qual você procura?\n\n${MENU_BASE_ESTER}`);
  }
  if (e.tipo === 'saxenda') {
    const dados = await buscarCache('emagrecedores');
    const unicas = [...new Set(filtrarCache(dados, ['semaglutida','tirzepatida','retatrutida']))];
    if (!unicas.length) {
      await saveSession(sid, { ...session, state:'MENU', errosSeguidos:0, pendenteRec:null });
      return respond('No momento não trabalhamos com *Saxenda*, mas temos ótimas alternativas para emagrecimento! 😊\n\nDigite *menu* e escolha *Emagrecedores* (opção 2).');
    }
    await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(unicas), errosSeguidos:0, pendenteRec:null });
    return respond(`Não trabalhamos com *Saxenda*, mas tenho opções ainda mais procuradas para emagrecimento! 🔥\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*`);
  }
  let dados;
  if (e.tipo === 'busca_tudo') dados = await buscarTodosCache();
  else dados = await buscarCache(e.colecao);
  let linhas;
  if (e.tipo === 'categoria' || !e.filtro || !e.filtro.length) {
    linhas = dados.split('\n').filter(Boolean);
  } else {
    linhas = filtrarCache(dados, e.filtro);
  }
  const unicas = [...new Set(linhas)];
  if (!unicas.length) {
    await saveSession(sid, { ...session, state:'MENU', errosSeguidos:0, pendenteRec:null });
    return respond(`*${e.label}* não está disponível no momento. 😕\n\nDigite *menu* para ver as outras opções.`);
  }
  await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(unicas), errosSeguidos:0, pendenteRec:null });
  return respond(`*${(e.label||'').toUpperCase()}*\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*`);
}

async function tratarTextoLivre(session, sid, nMsg, menuStr, respond) {
  const rec = reconhecerProduto(nMsg);
  if (rec) {
    const temCarrinho = (session.carrinho || []).length > 0;
    // Se o cliente tem carrinho e pede outro produto, pergunta antes (carrinho fica salvo).
    if (temCarrinho) {
      const e = rec.entry;
      await saveSession(sid, {
        ...session, errosSeguidos:0, state:'CONFIRMAR_VER_PRODUTO',
        pendenteRec: { label:e.label, tipo:e.tipo, colecao:e.colecao, filtro:e.filtro||[], ester:e.ester||'' }
      });
      return respond(`Quer ver *${e.label}*? Seu carrinho fica salvo. 🛒\n\n1️⃣ Sim, ver ${e.label}\n2️⃣ Não, continuar de onde parei`);
    }
    if (rec.modo === 'canonico') {
      return await resolverReconhecido(session, sid, rec.entry, respond);
    }
    const e = rec.entry;
    await saveSession(sid, {
      ...session, errosSeguidos:0, state:'CONFIRMAR_PRODUTO',
      pendenteRec: { label:e.label, tipo:e.tipo, colecao:e.colecao, filtro:e.filtro||[], ester:e.ester||'' }
    });
    return respond(`Você quis dizer *${e.label}*? 🤔\n\n1️⃣ Sim\n2️⃣ Não`);
  }
  // Não reconheceu: NÃO reseta pro menu — mantém o contexto atual e re-mostra a tela onde está.
  await saveSession(sid, { ...session, errosSeguidos: (session.errosSeguidos || 0) + 1 });
  return respond(`Hmm, não encontrei esse item por aqui. 🤔\n\nVocê pode escolher um *número* da lista, digitar o *nome do produto* (ex.: retatrutida, stanozolol, gh), *atendimento* para falar com uma pessoa ou *menu* para voltar ao início.\n\n${menuStr}`);
}

// ── System prompt exclusivo para protocolos ───────────────────────────────────
const PROTOCOLO_PROMPT = `Você é a Athena, consultora especialista da VitaFlow em peptídeos, hormônios e suplementação avançada. Você é uma vendedora brilhante: técnica, apaixonada pelo que faz e extremamente persuasiva — sem ser chata ou forçada.

Seu papel é responder sobre protocolos, dosagens, mecanismos de ação, benefícios e cuidados de uso, E SEMPRE converter esse interesse em venda.

REGRAS TÉCNICAS:
- Português brasileiro informal e caloroso
- Informações detalhadas e precisas
- Use doses MÍNIMAS eficazes e explique quanto tempo o produto dura com essas doses
- NUNCA use ## ou ### — use apenas *negrito*
- NUNCA mencione preços (você não tem acesso a eles)

REGRAS ABSOLUTAS — NUNCA VIOLE:
- NUNCA invente telefone, endereço, contato ou qualquer dado da empresa
- NUNCA invente prazos — use SEMPRE os prazos oficiais abaixo
- NUNCA invente produtos, marcas, disponibilidade ou estoque
- Se não souber algo, diga que não tem essa informação e oriente a digitar *menu*

FRETE E PRAZOS (use SEMPRE "prazo estimado" ao mencionar entrega):
- Despacho: até 48 horas úteis após confirmação do pagamento
- Prazos estimados de entrega por região (dias úteis, contados a partir do despacho):
  Sudeste: 2 a 5 dias úteis | Sul: 3 a 5 dias úteis | Centro-Oeste: 4 a 6 dias úteis
  Nordeste: 5 a 8 dias úteis | Norte: 7 a 10 dias úteis
- Transportadoras disponíveis: Jadlog, J&T Express e Loggi
- Modalidades: PAC, SEDEX (Correios) e Transportadora
- Recomende sempre a Transportadora — inclui seguro grátis contra apreensão e extravio
- Correios (PAC/SEDEX) NÃO possuem seguro

REGRA DE OURO — SEMPRE ao final de cada resposta:
1. Inclua: "💡 Como qualquer suplemento avançado, o acompanhamento profissional potencializa os resultados."
2. Faça uma transição persuasiva para a compra, destacando urgência ou benefício único
3. Termine com exatamente este bloco (substitua NOME_DO_PRODUTO pelo produto discutido):

---PRODUTOS---
NOME_DO_PRODUTO
---FIM---

Exemplos de transições persuasivas (varie, não repita sempre a mesma):
- "Esse é exatamente o tipo de resultado que nossos clientes estão tendo. Quer dar esse passo agora?"
- "Temos opções disponíveis com entrega para todo o Brasil. Que tal aproveitar?"
- "Muita gente que pergunta sobre esse protocolo acaba se surpreendendo com os resultados em poucas semanas. Quer começar?"
- "A janela de oportunidade para resultados reais é agora. Posso te mostrar o que temos disponível?"`;

// ── Utilitários ───────────────────────────────────────────────────────────────
function norm(s) {
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ç/g,'c').trim();
}
function emojis(i) {
  const e = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  return i < 10 ? e[i] : `${i+1}.`;
}
function formatarLista(linhas) {
  const SEP = '\n┈┈┈┈┈┈┈┈┈┈\n';
  return linhas.map((l, i) => {
    const [nome, preco] = l.split('|');
    return preco ? `${emojis(i)} *${nome.trim()}* — R$ ${preco.trim()}` : `${emojis(i)} *${nome.trim()}*`;
  }).join(SEP);
}
function parseProdutos(linhas) {
  return linhas.map(l => {
    const [nome, preco] = l.split('|');
    const precoNum = preco ? parseFloat(preco.replace(/\./g,'').replace(',','.')) : 0;
    return { nome: nome.trim(), preco: precoNum };
  });
}
function filtrarCache(dados, termos) {
  const lista = Array.isArray(termos) ? termos : [termos];
  const resultados = new Set();
  lista.forEach(termo => {
    const palavras = norm(termo).split(/\s+/).filter(p => p.length > 2);
    if (!palavras.length) return;
    dados.split('\n').filter(Boolean).forEach(linha => {
      const nomeProd = norm(linha.split('|')[0]);
      if (palavras.every(p => nomeProd.includes(p))) resultados.add(linha);
    });
  });
  return [...resultados];
}
function getFreteOpcoes(uf) {
  const f = FRETES[uf.toUpperCase()];
  if (!f) return null;
  const opts = [];
  if (f.PAC)   opts.push({ label: 'PAC',           valor: f.PAC });
  if (f.SEDEX) opts.push({ label: 'SEDEX',          valor: f.SEDEX });
  if (f.Transp)opts.push({ label: 'Transportadora', valor: f.Transp });
  return opts.length ? opts : null;
}
function totalCarrinho(carrinho) {
  return (carrinho || []).reduce((acc, item) => acc + (item.preco * item.qtd), 0);
}
function resumoCarrinho(carrinho) {
  return (carrinho || []).map(item =>
    `📦 *${item.nome}*\n    ${item.qtd}x — R$ ${item.preco.toFixed(2).replace('.',',')} un. = R$ ${(item.preco*item.qtd).toFixed(2).replace('.',',')}`
  ).join('\n');
}
function msgCarrinhoMenu(carrinho) {
  const subtotal = totalCarrinho(carrinho);
  return `🛒 *Seu carrinho* (${carrinho.length} ${carrinho.length>1?'itens':'item'}):\n${resumoCarrinho(carrinho)}\n\n` +
    `💰 *Subtotal: R$ ${subtotal.toFixed(2).replace('.',',')}*\n_(frete calculado no fechamento)_\n\n` +
    `*O que deseja fazer?*\n1️⃣ Adicionar mais produtos\n2️⃣ Finalizar compra\n3️⃣ Remover um produto`;
}
function msgRemoverItem(carrinho) {
  const linhas = (carrinho || []).map((it, i) => `${emojis(i)} *${it.nome}* x${it.qtd}`).join('\n');
  return `🗑️ *Qual produto você quer remover?*\n\n${linhas}\n\n_Digite o número do item, ou *menu* para voltar._`;
}
const REM_INTENT = ['tirar','retirar','remover','excluir','apagar','tira produto','remove produto'];

// ── Rastreio de pedido (status da coluna F) ───────────────────────────────────
const STATUS_INFO = {
  'aguardando pagamento':              { emoji:'⏳',  exp:'O pedido foi gerado mas o pagamento ainda não foi confirmado.' },
  'pedido confirmado':                 { emoji:'✅',  exp:'Seu pedido foi recebido e o pagamento confirmado. Em breve iniciaremos a separação.' },
  'em separacao':                      { emoji:'📦',  exp:'Estamos preparando os produtos do seu pedido com controle de qualidade rigoroso.' },
  'despachado':                        { emoji:'🚚',  exp:'Seu pedido foi entregue à transportadora.' },
  'postado':                           { emoji:'📮',  exp:'Seu pedido saiu da sede da transportadora e está a caminho.' },
  'em transferencia':                  { emoji:'🔄',  exp:'Seu pedido está em trânsito entre unidades a caminho da sua cidade.' },
  'chegou a unidade de destino':       { emoji:'📍',  exp:'Seu pedido chegou à unidade de distribuição na sua cidade. A entrega será realizada em breve.' },
  'em separacao no centro logistico':  { emoji:'🏢',  exp:'Seu pedido está sendo processado no centro logístico para sair para entrega.' },
  'saiu para entrega':                 { emoji:'🛵',  exp:'Seu pedido está com o entregador e será entregue hoje. Fique atento!' },
  'entregue':                          { emoji:'💚',  exp:'Pedido entregue com sucesso! Esperamos que aproveite seus produtos.' },
  'encaminhado para fiscalizacao':     { emoji:'🔎',  exp:'O pedido passa por verificação de rotina pela fiscalização.' },
  'fiscalizacao finalizada':           { emoji:'✔️',  exp:'A verificação foi concluída e o pedido segue seu fluxo normal.' },
  'destinatario ausente':              { emoji:'🚪',  exp:'O entregador passou no endereço mas não encontrou ninguém. Nova tentativa será feita.' },
  'endereco incorreto':                { emoji:'📌',  exp:'Houve um problema com o endereço de entrega; é preciso confirmar os dados.' },
  'area com distribuicao':             { emoji:'🗺️',  exp:'A região tem particularidade na distribuição; verificando a melhor forma de entrega.' },
  'pedido extraviado':                 { emoji:'⚠️',  exp:'O pedido foi extraviado durante o transporte.' },
  'pedido apreendido':                 { emoji:'🚫',  exp:'O pedido foi retido/apreendido.' },
  'reembolso realizado':               { emoji:'💸',  exp:'O reembolso do pedido foi efetuado.' },
  'pedido cancelado':                  { emoji:'❌',  exp:'O pedido foi cancelado.' },
};
function statusBloco(pedido, statusTexto) {
  const info = STATUS_INFO[norm(statusTexto)];
  const emoji = info ? info.emoji : '📦';
  const exp = info ? `\n_${info.exp}_` : '';
  return `📦 *Pedido ${pedido}*\n${emoji} *${statusTexto || '—'}*${exp}`;
}
const RASTREIO_RODAPE =
  `\n\n_Quer consultar outro? É só mandar o número do pedido, CPF ou e-mail._\n` +
  `📞 Para mais informações sobre seu pedido, fale com a logística: 👉 wa.me/447537155718\n` +
  `_Ou digite *menu* para voltar ao início._`;
async function consultarStatusGAS(termo) {
  try {
    const r = await fetch(GAS_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'consultar_status', termo })
    });
    const d = await r.json();
    return (d && d.success && Array.isArray(d.pedidos)) ? d.pedidos : [];
  } catch { return []; }
}
function listaPromoMsg(promo) {
  const linhas = promo.produtos.map((p,i) =>
    `${emojis(i)} *${p.nome}* — ~de R$ ${reais(p.de)}~ por *R$ ${reais(p.por)}*`
  ).join('\n');
  return `⚡ *${promo.titulo}* — exclusiva comigo (Athena) e enquanto durarem os estoques! 🔥\n\n` +
    `${linhas}\n\n👉 Detalhes: ${promo.link}\n\n*Digite o número do produto para comprar*, ou *menu* para voltar ao início.`;
}
async function abrirPromo(session, sid) {
  const promo = promoAtiva();
  if (!promo) return null;
  await saveSession(sid, {
    ...session, state: 'LISTA_PRODUTOS', fluxoPromo: true, descontoPromoPct: 0,
    promoTitulo: promo.titulo, produtoLista: promo.produtos.map(p => ({ nome: p.nome, preco: p.por })),
  });
  return listaPromoMsg(promo);
}
function gerarLinkRecibo(orderNsu, nome, cpf, email, pagto, carrinho, frete, total) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const params = [];
  params.push('pedido=' + encodeURIComponent(orderNsu));
  if (nome)  params.push('nome='  + encodeURIComponent(nome));
  if (cpf)   params.push('cpf='   + encodeURIComponent(cpf));
  if (email) params.push('email=' + encodeURIComponent(email));
  params.push('data='  + encodeURIComponent(hoje));
  params.push('pagto=' + encodeURIComponent(pagto));
  params.push('total=' + encodeURIComponent(total.toFixed(2)));
  const prods = (carrinho || []).map(item => ({ nome: item.nome + ' x' + item.qtd, quantidade: item.qtd, preco_unit: item.preco }));
  const prodsB64 = Buffer.from(encodeURIComponent(JSON.stringify(prods))).toString('base64');
  params.push('produtos=' + prodsB64);
  if (frete) { params.push('frete=' + encodeURIComponent(frete.label)); params.push('frete_v=' + encodeURIComponent(frete.valor.toFixed(2))); }
  return RECIBO_BASE + '?' + params.join('&');
}
async function getSession(sid) {
  try {
    const k = sid.replace(/[^a-zA-Z0-9]/g,'_');
    const r = await fetch(`${FIREBASE_URL}/vitaflow_sessions/${k}.json`);
    const d = await r.json();
    return d || { state:'MENU' };
  } catch { return { state:'MENU' }; }
}
async function saveSession(sid, sess) {
  try {
    const k = sid.replace(/[^a-zA-Z0-9]/g,'_');
    await fetch(`${FIREBASE_URL}/vitaflow_sessions/${k}.json`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(sess)
    });
  } catch {}
}
async function deleteSession(sid) {
  try {
    const k = sid.replace(/[^a-zA-Z0-9]/g,'_');
    await fetch(`${FIREBASE_URL}/vitaflow_sessions/${k}.json`, { method:'DELETE' });
  } catch {}
}

// ── ENTREGA 4: Negociação ─────────────────────────────────────────────────────
const NEGOCIACAO_PCT_TOTAL = 5; // teto total (3% Athena + 2% extra). Nunca sobre valor já descontado.
async function lerPending(sid) {
  try {
    const pKey = `pending_${sid.replace(/[^a-zA-Z0-9]/g,'_')}`;
    const r = await fetch(`${FIREBASE_URL}/vitaflow_pending_orders/${pKey}.json`);
    const d = await r.json();
    return d ? { pKey, ...d } : null;
  } catch { return null; }
}
async function salvarPendingMerge(pKey, patch) {
  try {
    await fetch(`${FIREBASE_URL}/vitaflow_pending_orders/${pKey}.json`, {
      method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch)
    });
  } catch {}
}
async function validarCupom(codigo, subtotalProdutos) {
  try {
    const cod = (codigo || '').trim().toUpperCase();
    if (!cod) return { ok:false, motivo:'Código vazio.' };
    const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/cupons_vitaflow?key=${FIRESTORE_KEY}&pageSize=200`;
    const resp = await fetch(url);
    if (!resp.ok) return { ok:false, motivo:'Erro ao consultar cupom.' };
    const data = await resp.json();
    const docs = data.documents || [];
    let found = null;
    for (const doc of docs) {
      const f = doc.fields || {};
      if ((f.codigo && f.codigo.stringValue || '').toUpperCase() === cod) { found = { id: doc.name.split('/').pop(), fields: f }; break; }
    }
    if (!found) return { ok:false, motivo:'Cupom inválido ou não encontrado.' };
    const f = found.fields;
    const ativo = f.ativo ? f.ativo.booleanValue : true;
    const tipo = f.tipo ? f.tipo.stringValue : 'pct';
    const valor = parseFloat(f.valor ? (f.valor.doubleValue || f.valor.integerValue || 0) : 0);
    const maxDesc = parseFloat(f.maxDesc ? (f.maxDesc.doubleValue || f.maxDesc.integerValue || 0) : 0);
    const minPed = parseFloat(f.minPedido ? (f.minPedido.doubleValue || f.minPedido.integerValue || 0) : 0);
    const tipoVal = f.tipoVal ? f.tipoVal.stringValue : 'sempre';
    const maxUsos = parseInt(f.maxUsos ? (f.maxUsos.integerValue || 0) : 0);
    const usosAtual = parseInt(f.usosAtual ? (f.usosAtual.integerValue || 0) : 0);
    const expiraStr = f.expira && f.expira.timestampValue ? f.expira.timestampValue : null;
    if (!ativo) return { ok:false, motivo:'Este cupom está inativo.' };
    if (tipoVal === 'prazo' && expiraStr && new Date(expiraStr) < new Date()) return { ok:false, motivo:'Este cupom expirou.' };
    if (tipoVal === 'unico' && usosAtual >= 1) return { ok:false, motivo:'Este cupom já foi utilizado.' };
    if (tipoVal === 'usos' && maxUsos > 0 && usosAtual >= maxUsos) return { ok:false, motivo:'Este cupom atingiu o limite de usos.' };
    if (minPed > 0 && subtotalProdutos < minPed) return { ok:false, motivo:`Pedido mínimo de R$ ${minPed.toFixed(2).replace('.',',')} para este cupom.` };
    let descontoReais = 0;
    if (tipo === 'pct') { descontoReais = subtotalProdutos * (valor/100); if (maxDesc > 0) descontoReais = Math.min(descontoReais, maxDesc); }
    else { descontoReais = Math.min(valor, subtotalProdutos); }
    const descTxt = tipo === 'pct' ? `${valor}% off` : `R$ ${valor.toFixed(2).replace('.',',')} off`;
    return { ok:true, docId: found.id, descontoReais, descTxt, codigo: cod,
             tipo, pct: valor, maxDesc, valorFixo: valor };
  } catch { return { ok:false, motivo:'Erro ao verificar cupom. Tente novamente.' }; }
}
async function incrementarUsoCupom(docId) {
  if (!docId) return;
  try {
    const getUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/cupons_vitaflow/${docId}?key=${FIRESTORE_KEY}`;
    const docResp = await fetch(getUrl);
    const docData = await docResp.json();
    const usosAnt = parseInt((docData.fields && docData.fields.usosAtual && docData.fields.usosAtual.integerValue) || 0);
    const patchUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/cupons_vitaflow/${docId}?key=${FIRESTORE_KEY}&updateMask.fieldPaths=usosAtual`;
    await fetch(patchUrl, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fields: { usosAtual: { integerValue: usosAnt + 1 } } }) });
  } catch {}
}
async function fecharResumoNormal(session, sid, cupomResultado, respond) {
  const carrinho = session.carrinho || [];
  const frete = session.freteSelecionado || {};
  const totalProd = session.totalProd || carrinho.reduce((s,i)=>s+i.preco*i.qtd,0);

  // ── DESCONTO POR ITEM ──
  // Retatrutida (promo): sempre 10% sobre ela. Demais itens: maior entre 3% Athena e cupom.
  const itensPromo = carrinho.filter(i => ehProdutoPromo(i));
  const itensNormais = carrinho.filter(i => !ehProdutoPromo(i));
  const totalPromo = itensPromo.reduce((s,i)=>s+i.preco*i.qtd,0);
  const totalNormais = itensNormais.reduce((s,i)=>s+i.preco*i.qtd,0);

  // desconto da promo (10% só na Retatrutida)
  const descPromoProduto = totalPromo * (PROMO_PRODUTO.pct / 100);

  // nos demais itens: 3% Athena vs cupom (vale o maior) — cupom incide só sobre os itens normais
  const descAthenaNormais = totalNormais * (DESCONTO_ATHENA_PCT / 100);
  let descCupomNormais = 0;
  if (cupomResultado && cupomResultado.ok && totalNormais > 0) {
    if (cupomResultado.tipo === 'pct') {
      descCupomNormais = totalNormais * (cupomResultado.pct/100);
      if (cupomResultado.maxDesc > 0) descCupomNormais = Math.min(descCupomNormais, cupomResultado.maxDesc);
    } else {
      descCupomNormais = Math.min(cupomResultado.valorFixo || cupomResultado.descontoReais || 0, totalNormais);
    }
  }
  let descNormais = descAthenaNormais;
  let labelNormais = `Desconto Athena (-${DESCONTO_ATHENA_PCT}%)`;
  let cupomDocId = null, cupomCodigo = null;
  if (descCupomNormais > descAthenaNormais) {
    descNormais = descCupomNormais;
    labelNormais = `Cupom ${cupomResultado.codigo} (${cupomResultado.descTxt})`;
    cupomDocId = cupomResultado.docId;
    cupomCodigo = cupomResultado.codigo;
  }

  const descontoReais = descPromoProduto + descNormais;
  const totalComDesconto = totalProd - descontoReais + (frete.valor || 0);

  let linhasDesc = '';
  if (descPromoProduto > 0) {
    linhasDesc += `🔥 *Lançamento Retatrutida (-${PROMO_PRODUTO.pct}%)*: -R$ ${descPromoProduto.toFixed(2).replace('.',',')}\n`;
  }
  if (descNormais > 0) {
    linhasDesc += `🏷️ ${labelNormais}${itensPromo.length ? ' _(demais itens)_' : ''}: -R$ ${descNormais.toFixed(2).replace('.',',')}\n`;
  }
  const linhaCupomInfo = (descCupomNormais > 0 && descCupomNormais <= descAthenaNormais)
    ? `\n_(Seu cupom daria R$ ${descCupomNormais.toFixed(2).replace('.',',')} nos demais itens, mas o desconto Athena de 3% é maior e foi aplicado!)_` : '';
  const linhaConviteCupom = (!cupomDocId && totalNormais > 0)
    ? `\n\n_Se você já tem um cupom, é só digitar o código agora._` : '';

  const resumo =
    `*📋 RESUMO DO PEDIDO*\n\n${resumoCarrinho(carrinho)}\n\n` +
    `    Subtotal: R$ ${totalProd.toFixed(2).replace('.',',')}\n\n` +
    `🚚 Frete *${frete.label}* — ${session.estadoCliente}: R$ ${frete.valor.toFixed(2).replace('.',',')}\n` +
    linhasDesc + linhaCupomInfo +
    `\n💰 *Total: R$ ${totalComDesconto.toFixed(2).replace('.',',')}*\n\n*Confirma?*\n1️⃣ Sim, quero comprar!\n2️⃣ Não, voltar ao menu` +
    linhaConviteCupom;
  await saveSession(sid, {
    ...session, state:'CONFIRMAR', freteSelecionado: frete, totalProd,
    descontoReais, descontoLabel: (descPromoProduto>0?`Lançamento Retatrutida + `:'') + labelNormais,
    total: totalComDesconto,
    descontoTipo: cupomDocId ? 'cupom' : 'athena', cupomDocId, cupomCodigo
  });
  return respond(resumo);
}
async function buscarCache(colecao) {
  try {
    const r = await fetch(`${FIREBASE_URL}/vitaflow_cache/colecoes/${colecao}.json`);
    const d = await r.json();
    return d?.dados || '';
  } catch { return ''; }
}
async function buscarTodosCache() {
  const cols = ['peptideos','hormonios','gh','emagrecedores','outros','10-mais-vendidos'];
  const resultados = await Promise.all(cols.map(c => buscarCache(c)));
  return resultados.join('\n');
}
async function enviarTelegram(texto) {
  try {
    await fetch('https://api.telegram.org/bot8689592582:AAEjalaa2hDQxstUVhm45CG4aZd9OiDDRXY/sendMessage', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chat_id:'8660563352', text: texto })
    });
  } catch {}
}
async function gerarLinkInfinitePay(carrinho, valorFrete, orderNsu, descontoReais) {
  try {
    const subtotalBruto = (carrinho || []).reduce((s,i) => s + i.preco * i.qtd, 0);
    const desc = descontoReais || 0;
    let descRestante = Math.round(desc * 100);
    const arr = carrinho || [];
    const items = arr.map((item, idx) => {
      let precoCent = Math.round(item.preco * 100);
      if (desc > 0 && subtotalBruto > 0) {
        const proporcao = (item.preco * item.qtd) / subtotalBruto;
        const descItemCent = idx === arr.length - 1 ? descRestante : Math.round(desc * 100 * proporcao);
        descRestante -= descItemCent;
        const descUnit = Math.floor(descItemCent / item.qtd);
        precoCent = Math.max(1, precoCent - descUnit);
      }
      return { quantity: item.qtd, price: precoCent, description: 'Suplemento Alimentar' };
    });
    if (valorFrete && valorFrete > 0) items.push({ quantity:1, price: Math.round(valorFrete*100), description: 'Frete' });
    const payload = { handle: INFINITEPAY_TAG, redirect_url: 'https://vitaflowoficial.com/pages/obrigado', webhook_url: GAS_URL, items };
    if (orderNsu) payload.order_nsu = orderNsu;
    const r = await fetch('https://api.checkout.infinitepay.io/links', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    const d = await r.json();
    return d?.url || null;
  } catch { return null; }
}
async function gerarNumeroPedido() {
  try {
    const r = await fetch(GAS_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'gerar_numero', tipo:'A' }) });
    const d = await r.json();
    return d.order_nsu || null;
  } catch { return null; }
}
async function salvarPedidoGAS(pedido) {
  try {
    await fetch(GAS_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(pedido) });
  } catch {}
}
// Leitor determinístico de reserva — funciona mesmo se a IA falhar.
// Detecta CPF (11 dígitos), CEP (8 dígitos / 00000-000), telefone (10-11 díg.), email,
// estado (sigla UF) e mapeia as linhas de texto restantes para nome/endereço/bairro/cidade.
const _UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const _UF_NOME = {
  acre:'AC', alagoas:'AL', amapa:'AP', amazonas:'AM', bahia:'BA', ceara:'CE', 'distrito federal':'DF',
  'espirito santo':'ES', goias:'GO', maranhao:'MA', 'mato grosso':'MT', 'mato grosso do sul':'MS',
  'minas gerais':'MG', para:'PA', paraiba:'PB', parana:'PR', pernambuco:'PE', piaui:'PI',
  'rio de janeiro':'RJ', 'rio grande do norte':'RN', 'rio grande do sul':'RS', rondonia:'RO',
  roraima:'RR', 'santa catarina':'SC', 'sao paulo':'SP', sergipe:'SE', tocantins:'TO'
};
function extrairDadosRegex(texto) {
  const out = {};
  if (!texto) return out;
  const original = String(texto);

  // ── ETAPA 1: extração por RÓTULOS (formato que a própria Athena pede) ──────
  // Mapeia variações de rótulo para o campo. Cada linha "Rótulo: valor" é casada aqui.
  const ROTULOS = [
    { campo:'nome',        re:/^\s*nome\s*(completo)?\s*[:\-]\s*(.+)$/i },
    { campo:'cpf',         re:/^\s*(cpf|documento|doc)\s*[:\-]\s*(.+)$/i },
    { campo:'telefone',    re:/^\s*(telefone|tel|celular|cel|whats|whatsapp|fone)\s*[:\-]\s*(.+)$/i },
    { campo:'email',       re:/^\s*(email|e-mail|e mail)\s*[:\-]\s*(.+)$/i },
    { campo:'endereco',    re:/^\s*(rua e numero|rua e número|endereco|endereço|rua|logradouro|av|avenida)\s*[:\-]\s*(.+)$/i },
    { campo:'complemento', re:/^\s*(complemento|compl|obs|observacao|observação|referencia|referência)\s*[:\-]\s*(.+)$/i },
    { campo:'bairro',      re:/^\s*(bairro)\s*[:\-]\s*(.+)$/i },
    { campo:'cidade',      re:/^\s*(cidade|municipio|município)\s*[:\-]\s*(.+)$/i },
    { campo:'estado',      re:/^\s*(estado|uf)\s*[:\-]\s*(.+)$/i },
    { campo:'cep',         re:/^\s*(cep)\s*[:\-]\s*(.+)$/i },
  ];
  const linhasOrig = original.split(/\r?\n/);
  const linhasSemRotulo = [];
  for (const linha of linhasOrig) {
    let casou = false;
    for (const r of ROTULOS) {
      const m = linha.match(r.re);
      if (m) {
        const valor = (m[m.length - 1] || '').trim();
        // só preenche se houver valor real depois do rótulo e o campo ainda não foi pego
        if (valor && valor.replace(/[\s:.-]/g,'').length >= 1 && !out[r.campo]) {
          if (r.campo === 'cpf')        out.cpf = valor.replace(/\D/g,'') || valor.trim();
          else if (r.campo === 'cep')   out.cep = valor.replace(/\D/g,'') || valor.trim();
          else if (r.campo === 'telefone') out.telefone = valor.replace(/\D/g,'') || valor.trim();
          else if (r.campo === 'email') out.email = valor.toLowerCase();
          else if (r.campo === 'estado') {
            const nn = norm(valor).replace(/[^a-z ]/g,'').trim();
            if (_UF_NOME[nn]) out.estado = _UF_NOME[nn];
            else { const up = valor.toUpperCase().replace(/[^A-Z]/g,'').slice(0,2); if (up.length===2 && _UFS.includes(up)) out.estado = up; else out.estado = valor.trim(); }
          }
          else out[r.campo] = valor;
        }
        casou = true;
        break;
      }
    }
    if (!casou) linhasSemRotulo.push(linha);
  }
  // sanitiza valores que ainda têm dígitos onde não deveriam (cpf/tel/cep só números)
  if (out.cpf && /\D/.test(out.cpf))  out.cpf = out.cpf.replace(/\D/g,'') || out.cpf;
  if (out.cep && /\D/.test(out.cep))  out.cep = out.cep.replace(/\D/g,'') || out.cep;
  if (out.telefone && /\D/.test(out.telefone)) out.telefone = out.telefone.replace(/\D/g,'') || out.telefone;

  // ── ETAPA 2: heurística no que SOBROU (texto sem rótulos) ──────────────────
  let resto = linhasSemRotulo.join('\n');

  // email
  if (!out.email) { const mEmail = resto.match(/[\w.+-]+@[\w-]+\.[\w.-]+/); if (mEmail) { out.email = mEmail[0].toLowerCase(); resto = resto.replace(mEmail[0], ' '); } }

  // CEP (00000-000 ou 8 dígitos)
  if (!out.cep) { const mCep = resto.match(/\b\d{5}-?\d{3}\b/); if (mCep) { out.cep = mCep[0].replace(/\D/g,''); resto = resto.replace(mCep[0], ' '); } }

  // CPF (11 dígitos, com ou sem máscara)
  if (!out.cpf) {
    const soDigitos = resto.replace(/[^\d]/g, ' ');
    const mCpf = (resto.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/) || []);
    if (mCpf[0]) { out.cpf = mCpf[0].replace(/\D/g,''); resto = resto.replace(mCpf[0], ' '); }
    else {
      const blocos = soDigitos.split(/\s+/).filter(Boolean);
      const cpfCand = blocos.find(b => b.length === 11);
      if (cpfCand) { out.cpf = cpfCand; resto = resto.replace(cpfCand, ' '); }
    }
  }

  // telefone (10 ou 11 dígitos) — depois do CPF pra não confundir
  if (!out.telefone) {
    const blocos2 = resto.replace(/[^\d]/g,' ').split(/\s+/).filter(Boolean);
    const telCand = blocos2.find(b => b.length === 10 || b.length === 11);
    if (telCand) { out.telefone = telCand; resto = resto.replace(telCand, ' '); }
    else {
      const mTel = resto.match(/\(?\d{2}\)?\s*9?\s*\d{4}[-\s]?\d{4}/);
      if (mTel) { out.telefone = mTel[0].replace(/\D/g,''); resto = resto.replace(mTel[0], ' '); }
    }
  }

  // linhas de texto restantes (sem os números já consumidos)
  let linhas = resto.split(/\n|,/).map(l => l.replace(/\s+/g,' ').trim()).filter(l => l && l.replace(/\d/g,'').trim().length >= 2);

  // estado: por sigla ou por nome
  if (!out.estado) {
    for (let i = 0; i < linhas.length; i++) {
      const ln = norm(linhas[i]).replace(/[^a-z ]/g,'').trim();
      if (_UF_NOME[ln]) { out.estado = _UF_NOME[ln]; linhas.splice(i,1); break; }
      const up = linhas[i].toUpperCase().replace(/[^A-Z]/g,'');
      if (up.length === 2 && _UFS.includes(up)) { out.estado = up; linhas.splice(i,1); break; }
    }
  }

  // endereço: a linha que tem número de rua (dígitos no meio do texto)
  if (!out.endereco) {
    let idxEnd = linhas.findIndex(l => /\d/.test(l) && /[a-zA-Z]{3,}/.test(l));
    if (idxEnd >= 0) { out.endereco = linhas[idxEnd]; linhas.splice(idxEnd, 1); }
  }

  // complemento (obs/apto/bloco/casa/loja)
  if (!out.complemento) {
    let idxComp = linhas.findIndex(l => /\b(ap|apto|apartamento|bloco|bl|casa|fundos|loja|obs|complemento|entregar)\b/i.test(norm(l)));
    if (idxComp >= 0) { out.complemento = linhas[idxComp]; linhas.splice(idxComp, 1); }
  }

  // sobra: nome (primeira linha “de gente”), depois bairro, depois cidade
  const sobra = linhas.filter(Boolean);
  if (sobra.length) {
    if (!out.nome) {
      let idxNome = sobra.findIndex(l => !/\d/.test(l) && l.trim().split(/\s+/).length >= 2);
      if (idxNome < 0) idxNome = 0;
      out.nome = sobra[idxNome]; sobra.splice(idxNome, 1);
    }
    if (!out.bairro && sobra[0]) { out.bairro = sobra.shift(); }
    if (!out.cidade && sobra[0]) { out.cidade = sobra.shift(); }
  }

  // normaliza estado se veio por extenso pela etapa de rótulo
  if (out.estado && out.estado.length > 2) {
    const nn = norm(out.estado).replace(/[^a-z ]/g,'').trim();
    if (_UF_NOME[nn]) out.estado = _UF_NOME[nn];
    else { const up = out.estado.toUpperCase().replace(/[^A-Z]/g,'').slice(0,2); if (up.length===2 && _UFS.includes(up)) out.estado = up; }
  }
  return out;
}

async function extrairDadosIA(texto) {
  try {
    const prompt = `Extraia os dados de cadastro do cliente do texto abaixo e retorne APENAS um objeto JSON válido, sem nenhum texto antes ou depois, sem markdown.

Campos a extrair (use string vazia se não encontrar):
- nome: nome completo da pessoa
- cpf: CPF (apenas números ou formatado)
- telefone: telefone/celular com DDD
- email: e-mail
- endereco: rua e número juntos
- complemento: complemento (casa, apto, bloco). Se for "Casa" ou similar, mantenha
- bairro: bairro
- cidade: cidade
- estado: sigla do estado (2 letras, ex: RJ, SP)
- cep: CEP

Texto do cliente:
"""
${texto}
"""

Retorne SOMENTE o JSON no formato:
{"nome":"","cpf":"","telefone":"","email":"","endereco":"","complemento":"","bairro":"","cidade":"","estado":"","cep":""}`;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:600, messages:[{ role:'user', content: prompt }] })
    });
    const d = await r.json();
    if (d.error || !d.content) return null;
    const raw = d.content[0].text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.estado) parsed.estado = parsed.estado.toUpperCase().replace(/[^A-Z]/g,'').slice(0,2);
    Object.keys(parsed).forEach(k => { if (!parsed[k] || String(parsed[k]).trim().length < 1) delete parsed[k]; });
    return parsed;
  } catch(e) { console.error('EXTRAIR IA ERRO:', e.message); return null; }
}

// ── Handler principal ─────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type', 'Content-Type':'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' };
  if (event.httpMethod !== 'POST')    return { statusCode:405, headers, body: JSON.stringify({error:'Method not allowed'}) };
  const respond = (r, r2='', r3='') => ({ statusCode:200, headers, body: JSON.stringify({ resposta:r, resposta2:r2, resposta3:r3, transferir:false }) });
  const transferir = (r) => ({ statusCode:200, headers, body: JSON.stringify({ resposta:r, resposta2:'', resposta3:'', transferir:true }) });

  try {
    const body = JSON.parse(event.body || '{}');
    const mensagem = (body.mensagem || body.message || body.texto || '').trim();
    const rawId = body.phone || body.subscriber_id || 'default';
    const sid = rawId.replace(/\D/g,'').replace(/^0+/,'').replace(/^55(\d{10,11})$/,'55$1') || rawId;
    const n = norm(mensagem);
    const num = parseInt(n);
    const ehMidia = ['image','video','document','audio','sticker'].includes(body.type);

    console.log('MSG:', mensagem, '| SID:', sid, '| TYPE:', body.type, '| BODY_KEYS:', Object.keys(body).join(','));
    if (body.type || body.mediaUrl || body.media_url || body.url || body.fileUrl) console.log('MIDIA DETECTADA:', JSON.stringify(body));

    const session = await getSession(sid);
    const state = session.state || 'MENU';

    const ehPromo = n.includes('promo') || n.includes('namorados');
    if (ehPromo && !['AGUARDAR_COMPROVANTE','COLETA_DADOS'].includes(state)) {
      const msg = await abrirPromo(session, sid);     // se a Relâmpago for reativada, ela tem prioridade
      if (msg) return respond(msg);
      if (PROMO_PRODUTO.ativa) return respond(await anunciarLancamento(session, sid));
      await saveSession(sid, { state:'MENU' });
      return respond('No momento não temos promoção ativa. 😊\n\n' + buildMenuPrincipal());
    }

    const saudacoes = ['ola','olá','oi','oii','opa','eai','e ai','bom dia','boa tarde','boa noite','hi','hello','tudo bem','tudo bom'];
    const ehSaudacaoOuMenu = n === 'menu' || n === 'inicio' || n === 'voltar' || n === 'start' || saudacoes.some(s => n === s || n.startsWith(s+' ') || n.startsWith(s+'!'));
    // COLETA_DADOS = pedido JÁ PAGO. Não deixa cair no menu por saudação; só sai com "menu" explícito.
    if (ehSaudacaoOuMenu && state === 'COLETA_DADOS' && n !== 'menu') {
      return respond('Seu pedido já está *pago e garantido*! 🧡 Só preciso dos dados de envio pra concluir.\n\nMe manda em linhas separadas: nome, CPF, telefone, rua e número, bairro, cidade, estado e CEP. 😊');
    }
    if (ehSaudacaoOuMenu) {
      await saveSession(sid, { state:'MENU' });
      return respond(buildMenuPrincipal());
    }

    const palavrasHumano = ['atendente','atendimento','humano','vendedor','pessoa real','falar com alguem','falar com pessoa','falar com atendimento','quero atendimento','suporte','reclamacao','reclamar'];
    // Em estados críticos (carrinho/pedido pago) NÃO apaga a sessão — escala mas preserva o pedido.
    const estadoCritico = ['CARRINHO','ESTADO','FRETE','PERGUNTA_CUPOM','INFORMAR_CUPOM','CONFIRMAR','AGUARDAR_COMPROVANTE','COLETA_DADOS'].includes(state);
    if (palavrasHumano.some(p => n.includes(p))) {
      await enviarTelegram(`🔔 CLIENTE QUER HUMANO\n📱 ${sid}\n📍 Estado: ${state}\n💬 ${mensagem}`);
      if (!estadoCritico) await deleteSession(sid);
      return transferir(estadoCritico
        ? 'Vou chamar um atendente pra te ajudar! 😊 Fica tranquilo que *seu pedido continua salvo* aqui comigo. Aguarde um momento.'
        : 'Vou te transferir para um atendente agora! 😊 Aguarde um momento.');
    }

    // ── NEGOCIAÇÃO (Entrega 4): reclamou do preço → libera teto de 5% (só quem entrou com os 3% Athena) ──
    const palavrasNegoc = ['caro','ta caro','muito caro','salgado','ta salgado','preco alto','mais barato','abaixa','abaixar','baixa o preco','desconto','condicao','melhora o preco','faz por menos','ta puxado','pesado no bolso','sem condicao'];
    if (palavrasNegoc.some(p => n.includes(p)) && state !== 'COLETA_DADOS') {
      const pend = await lerPending(sid);
      if (pend && pend.descontoTipo === 'athena' && !pend.negociado) {
        const carrinho = pend.carrinho || [];
        const frete = pend.freteSelecionado || {};
        const totalProd = carrinho.reduce((s,i)=>s + i.preco*i.qtd, 0);
        if (totalProd > 0) {
          const novoDesc = totalProd * (NEGOCIACAO_PCT_TOTAL/100); // 5% sobre o subtotal ORIGINAL
          const novoTotal = totalProd - novoDesc + (frete.valor||0);
          const novoLink = await gerarLinkInfinitePay(carrinho, frete.valor, pend.order_nsu, novoDesc);
          const lbl = `Desconto especial (-${NEGOCIACAO_PCT_TOTAL}%)`;
          await salvarPendingMerge(pend.pKey, { negociado:true, descontoReais:novoDesc, descontoLabel:lbl, total:novoTotal, link: novoLink || pend.link || '' });
          await saveSession(sid, { ...session, state:'AGUARDAR_COMPROVANTE', carrinho, freteSelecionado:frete, estadoCliente: pend.estado || session.estadoCliente, total:novoTotal, descontoReais:novoDesc, descontoLabel:lbl, descontoTipo:'athena', orderNsu:pend.order_nsu, cupomDocId:null, cupomCodigo:null });
          await enviarTelegram(`🤝 *NEGOCIAÇÃO (Athena)*\n📦 ${pend.order_nsu||'—'}\n📱 ${sid}\n💸 Desconto especial ${NEGOCIACAO_PCT_TOTAL}% → R$ ${novoTotal.toFixed(2).replace('.',',')}`);
          return respond(
            `Olha, vou fazer uma condição ESPECIAL pra você fechar agora comigo! 🤝\n\n` +
            `Consegui liberar *${NEGOCIACAO_PCT_TOTAL}% de desconto* — o máximo que posso dar — no seu pedido:\n\n` +
            `${resumoCarrinho(carrinho)}\n` +
            `🚚 ${frete.label||'Frete'} — ${pend.estado||''}\n` +
            `🏷️ ${lbl}\n` +
            `💰 *Novo total: R$ ${novoTotal.toFixed(2).replace('.',',')}*\n\n` +
            (novoLink ? `💳 *Link atualizado com o desconto:*\n${novoLink}\n\n` : '') +
            `_Assim que você pagar, *eu confirmo automaticamente aqui* e já sigo com seu envio — não precisa enviar comprovante._ 🚀`
          );
        }
      }
      // sem pedido elegível (cupom maior, promoção, ou já negociado) → segue o fluxo normal
    }

    // ── Grupo VIP (WhatsApp/Telegram) ── reconhece pergunta sobre grupo/comunidade ──
    const ehGrupo = (n.includes('grupo') || n.includes('comunidade') || n.includes('vip') || n.includes('telegram') ||
      (n.includes('whats') && (n.includes('grupo') || n.includes('vip') || n.includes('comunidade'))))
      && !['AGUARDAR_COMPROVANTE','COLETA_DADOS'].includes(state);
    if (ehGrupo) {
      return respond(msgGrupoVip());
    }

    // ── RASTREIO universal ── cliente manda CPF, nº de pedido ou pede rastreio em QUALQUER menu ──
    // Trava: nunca em estados de pagamento. E não rouba número simples de menu (1-2 dígitos puros).
    const ehNumeroSimplesMenu = /^\d{1,2}$/.test(n.trim());
    if (!['AGUARDAR_COMPROVANTE','COLETA_DADOS','RASTREAR','PROTOCOLO'].includes(state)
        && !ehNumeroSimplesMenu
        && ehIntencaoRastreio(n, mensagem)) {
      // Se só pediu "rastrear" sem informar o dado, leva ao estado RASTREAR pedindo o dado.
      if (!ehNumeroPedido(mensagem) && !ehCPFsolto(mensagem) && !mensagem.includes('@')) {
        await saveSession(sid, { ...session, state:'RASTREAR' });
        return respond(`*📦 RASTREAR MEU PEDIDO*\n\nMe envia o *número do pedido*, seu *CPF* ou o *e-mail* da compra que eu consulto o status pra você na hora! 😊\n\n_Digite *menu* para voltar._`);
      }
      // Já mandou o dado (CPF/pedido/email) → rastreia direto, sem perder o estado de compra.
      return await fazerRastreio(mensagem, respond);
    }

    const ehAtacado = ["atacado","revenda","revender","mayoreo","por atacado","compra grande","grande quantidade","tabela de atacado"].some(p => n.includes(p));
    if (ehAtacado && !["AGUARDAR_COMPROVANTE","COLETA_DADOS"].includes(state)) {
      await saveSession(sid, { ...session, state:'ATACADO' });
      return respond(MSG_ATACADO);
    }

    const ehTabela = ["tabela","lista de preco","lista de preços","catalogo","catálogo","tabela de preco","tabela de preços","lista completa","ver precos","ver preços"].some(p => n.includes(p));
    if (ehTabela && !ehAtacado && !["AGUARDAR_COMPROVANTE","COLETA_DADOS"].includes(state)) {
      await saveSession(sid, { state:'MENU' });
      return respond('📋 *Tabela de Preços VitaFlow*\n\nVeja nossa lista completa de produtos, preços e disponibilidade em tempo real, sempre atualizada:\n\n👉 vitaflowoficial.com/pages/tabela\n\nVocê também pode comprar direto pelo site ou continuar comigo aqui. 😊\n\n_Digite *menu* para navegar pelas categorias._');
    }

    const ehPerguntaPrazo = ["prazo","quanto tempo","quantos dias","demora","chega em","tempo de entrega","prazo de entrega","prazo de postagem"].some(p => n.includes(p));
    if (ehPerguntaPrazo && !["ESTADO","FRETE","AGUARDAR_COMPROVANTE","COLETA_DADOS","CARRINHO","ATACADO","PRAZO_TIPO"].includes(state)) {
      if (ehAtacado) { await saveSession(sid, { ...session, state:'ATACADO' }); return respond(MSG_ATACADO); }
      await saveSession(sid, { ...session, state:'PRAZO_TIPO' });
      return respond(MSG_PERGUNTA_TIPO_PRAZO);
    }

    const ehPerguntaFrete = ["frete","transportadora","pac","sedex","valor do envio","custo do envio","quanto e o frete","quanto fica o frete"].some(p => n.includes(p));
    if (ehPerguntaFrete && !["ESTADO","FRETE","AGUARDAR_COMPROVANTE","COLETA_DADOS","CARRINHO","ATACADO","PRAZO_TIPO","FRETE_AVULSO"].includes(state)) {
      await saveSession(sid, { ...session, state:"FRETE_AVULSO" });
      return respond("🚚 *Consultar frete*\n\nMe diz o seu estado (sigla) que eu calculo na hora!\nExemplo: RJ, SP, MG, DF, BA...");
    }

    if (state === 'ATACADO') {
      if (num === 1) { await enviarTelegram(`🏭 CLIENTE QUER ATACADO\n📱 ${sid}\n💬 Redirecionado para consultores de atacado`); await saveSession(sid, { state:'MENU' }); return respond(MSG_ATACADO_CONTATOS); }
      if (num === 2) { await saveSession(sid, { state:'MENU' }); return respond('Sem problema! 😊\n\n' + MENU_PRINCIPAL); }
      return respond('Digite *1* para falar com um consultor de atacado ou *2* para voltar ao menu:');
    }

    if (state === 'PRAZO_TIPO') {
      if (num === 1) { await saveSession(sid, { state:'MENU' }); return respond(MSG_PRAZO_VAREJO + '\n\n_Digite *menu* para ver nossos produtos._'); }
      if (num === 2) { await saveSession(sid, { ...session, state:'ATACADO' }); return respond(MSG_ATACADO); }
      return respond('Digite *1* para compra normal (varejo) ou *2* para atacado:');
    }

    if (state === 'FRETE_AVULSO') {
      const uf = mensagem.trim().toUpperCase().replace(/[^A-Z]/g,'').slice(0,2);
      const opts = getFreteOpcoes(uf);
      if (!opts) return respond(`Estado *${uf || mensagem}* não reconhecido.\nDigite a sigla do seu estado (ex: RJ, SP, MG):`);
      const freteStr = opts.map((o) => `• *${o.label}* — R$ ${o.valor.toFixed(2).replace('.',',')}`).join('\n');
      await saveSession(sid, { state:'MENU' });
      return respond(`🚚 *Opções de frete para ${uf}:*\n\n${freteStr}\n\n💡 Recomendamos a *Transportadora* — inclui seguro grátis contra apreensão e extravio.\n\nQuer escolher um produto para comprar? É só digitar *menu* e navegar pelas categorias! 😊`);
    }

    if (state === 'MENU') {
      if (num === 1) {
        const dados = await buscarCache('10-mais-vendidos');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*🔥 MAIS VENDIDOS*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }
      if (num === 2) {
        const dados = await buscarCache('emagrecedores');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*💊 EMAGRECEDORES*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }
      if (num === 3) { await saveSession(sid, { ...session, state:'PEPTIDEOS' }); return respond(MENU_PEPTIDEOS); }
      if (num === 4) { await saveSession(sid, { ...session, state:'HORMONIOS' }); return respond(MENU_HORMONIOS); }
      if (num === 5) {
        const dados = await buscarCache('gh');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*⚡ GH*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }
      if (num === 6) {
        const dados = await buscarCache('outros');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*📦 OUTROS (Botox, vitaminas e remédios em geral)*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }
      if (num === 7) { await saveSession(sid, { ...session, state:'FABRICANTES' }); return respond(MENU_FABRICANTES); }
      if (num === 8) {
        const temRelampago = promoAtiva();
        const temProduto = PROMO_PRODUTO.ativa;
        // Duas promoções ativas: mostra menu intermediário
        if (temRelampago && true /* Copa sempre ativa */) {
          await saveSession(sid, { ...session, state:'MENU_PROMOCOES' });
          return respond(
            `🔥 *Temos 2 promoções ativas no momento!* 🔥\n\n` +
            `1️⃣ *Promoção Relâmpago — MyoMax Inibition™*\n` +
            `   🖊️ 2 canetas por R$999 (de R$1.598)\n\n` +
            `2️⃣ *Copa do Mundo — Desconto por gols do Brasil* ⚽\n` +
            `   1 gol = 5% · 2 gols = 10% · 3+ gols = 15% OFF\n\n` +
            `⚠️ _As promoções não são acumulativas._\n\n` +
            `Qual você quer conhecer?`
          );
        }
        if (temRelampago) { const msg = await abrirPromo(session, sid); if (msg) return respond(msg); }
        if (temProduto) return respond(await anunciarLancamento(session, sid));
        return respond('No momento não temos promoção ativa. 😊\n\n_Digite *menu* para ver as categorias._');
      }
      if (num === 9) { await saveSession(sid, { ...session, state:'PROTOCOLO', historico:[] }); return respond('*🔬 PROTOCOLO / DÚVIDAS TÉCNICAS*\n\nSobre qual produto ou objetivo você tem dúvida?\n\n_Digite *menu* a qualquer momento para voltar_'); }
      if (num === 10) {
        await saveSession(sid, { ...session, state:'RASTREAR' });
        return respond(`*📦 RASTREAR MEU PEDIDO*\n\nMe envia o *número do pedido*, seu *CPF* ou o *e-mail* da compra que eu consulto o status pra você na hora! 😊\n\n_(Pode digitar do jeito que for: com pontos, sem pontos, com traço... eu entendo.)_\n\n_Digite *menu* para voltar._`);
      }
      return await tratarTextoLivre(session, sid, n, buildMenuPrincipal(), respond);
    }

    if (state === 'RASTREAR') {
      const termo = (mensagem || '').trim();
      const alnum = termo.replace(/[^a-zA-Z0-9@]/g, '');
      if (alnum.length < 2) {
        return respond(`Hmm, isso não parece um número de pedido, CPF ou e-mail. 🤔\n\nMe manda o *número do pedido*, o *CPF* (11 dígitos) ou o *e-mail* da compra.\n\n_Ou digite *menu* para voltar._`);
      }
      const pedidos = await consultarStatusGAS(termo);
      if (!pedidos.length) {
        return respond(`🔍 Não encontrei nenhum pedido com *esse dado*.\n\nConfere se digitou certo o *número do pedido*, *CPF* ou *e-mail* da compra e me manda de novo. 😊\n\n📞 Se preferir, fale com a logística: 👉 wa.me/447537155718\n_Ou digite *menu* para voltar._`);
      }
      if (pedidos.length === 1) {
        return respond(statusBloco(pedidos[0].pedido, pedidos[0].status) + RASTREIO_RODAPE);
      }
      const blocos = pedidos.map(p => statusBloco(p.pedido, p.status)).join('\n\n');
      return respond(`Encontrei *${pedidos.length} pedidos* no seu cadastro:\n\n${blocos}` + RASTREIO_RODAPE);
    }

    if (state === 'MENU_PROMOCOES') {
      if (num === 1) {
        // MyoMax — fluxo normal
        const msg = await abrirPromo(session, sid);
        if (msg) return respond(msg);
        await saveSession(sid, { ...session, state:'MENU' });
        return respond('Promoção não disponível no momento. 😊\n\n_Digite *menu* para voltar._');
      }
      if (num === 2) {
        // Copa do Mundo
        await saveSession(sid, { ...session, state:'COPA_CUPOM' });
        return respond(
          `⚽ *PROMOÇÃO COPA DO MUNDO* 🇧🇷\n\n` +
          `A cada gol do Brasil você ganha desconto em qualquer produto:\n\n` +
          `⚽ 1 gol → *5% OFF*\n` +
          `⚽⚽ 2 gols → *10% OFF*\n` +
          `⚽⚽⚽ 3 gols ou mais → *15% OFF*\n\n` +
          `O cupom é divulgado nos grupos imediatamente após o apito final — ou após o 3º gol do Brasil na partida.\n\n` +
          `🗓️ *Próximos jogos:*\n` +
          `⚽ Brasil x Haiti — 19/06 (Sex) às 21h30\n` +
          `⚽ Escócia x Brasil — 24/06 (Qua) às 19h\n\n` +
          `Você já tem o cupom da promoção?\n\n1️⃣ Sim, tenho o cupom!\n2️⃣ Não tenho cupom`
        );
      }
      return respond('Digite *1* para MyoMax ou *2* para Copa do Mundo:');
    }

    if (state === 'COPA_CUPOM') {
      const r = n.trim().toLowerCase();
      const sim = num === 1 || r === 'sim' || r === 's';
      const nao = num === 2 || r === 'nao' || r === 'não' || r === 'n';
      if (sim) {
        // Tem cupom — pede o código
        await saveSession(sid, { ...session, state:'INFORMAR_CUPOM' });
        return respond('Ótimo! 🎉 Digite o *código do cupom* que eu já aplico no seu pedido:');
      }
      if (nao) {
        // Não tem cupom — manda links dos grupos
        await saveSession(sid, { ...session, state:'MENU' });
        return respond(
          `Sem problema! 😊\n\n` +
          `⚠️ *Atenção:* o cupom desta promoção *só existe nos dias de jogo do Brasil* e é válido por *apenas 2 horas* após o apito final — ou imediatamente após o 3º gol do Brasil na partida.\n\n` +
          `Fora desse período não há cupom ativo para esta promoção.\n\n` +
          `Para não perder, entre nos nossos grupos e fique de olho na divulgação:\n\n` +
          `📱 *Grupo VIP (WhatsApp):*\nhttps://chat.whatsapp.com/COklmK82NWu9zQkdALjchy\n\n` +
          `✈️ *Referências (Telegram):*\nhttps://t.me/referencias_vitaflow\n\n` +
          `_Digite *menu* para voltar ao início._`
        );
      }
      return respond('Digite *1* se tem cupom ou *2* se não tem:');
    }

    if (state === 'PROMO_OFERECER') {
      const r = n.trim().toLowerCase();
      const sim = num === 1 || r === 'sim' || r === 's';
      const nao = num === 2 || r === 'nao' || r === 'não' || r === 'n';
      if (nao) {
        await saveSession(sid, { ...session, state:'MENU' });
        return respond('Sem problema! 😊\n\n' + buildMenuPrincipal());
      }
      if (sim) {
        // busca o produto exato da promoção (preço real do cache) e leva para a quantidade
        const nomePromo = (PROMO_PRODUTO.produtos || [])[0] || '';
        const dados = await buscarCache('emagrecedores');
        const linhas = String(dados || '').split('\n').filter(Boolean);
        const lista = parseProdutos(linhas);
        const achado = lista.find(p => _normNomeProd(p.nome) === _normNomeProd(nomePromo))
                    || lista.find(p => _normNomeProd(p.nome).includes('retatrutida') && _normNomeProd(p.nome).includes('120') && _normNomeProd(p.nome).includes('aq'));
        if (!achado || !achado.preco) {
          await saveSession(sid, { ...session, state:'MENU' });
          return respond('Opa, não consegui localizar o preço desse produto agora. 😅 Você encontra ele em *Emagrecedores* (opção 2) ou pelo link que te enviei.\n\n_Digite *menu* para voltar._');
        }
        await saveSession(sid, { ...session, state:'QUANTIDADE', produtoSelecionado: { nome: achado.nome, preco: achado.preco, colecao: 'emagrecedores' } });
        return respond(`Ótima escolha! 🔥\n📦 *${achado.nome}*\n💰 R$ ${achado.preco.toFixed(2).replace('.',',')}\n_(já com seu desconto de ${PROMO_PRODUTO.pct}% aplicado no fechamento)_\n\n*Quantas unidades você quer?*\n_(Digite o número)_`);
      }
      return respond('Digite *1* para Sim ou *2* para Não. 😊');
    }

    if (state === 'CONFIRMAR_PRODUTO') {
      if (num === 1) { const e = session.pendenteRec || {}; return await resolverReconhecido({ ...session, pendenteRec:null, errosSeguidos:0 }, sid, e, respond); }
      if (num === 2) { await saveSession(sid, { ...session, state:'MENU', pendenteRec:null, errosSeguidos:0 }); return respond('Sem problema! 😊 Me diz o que você procura ou escolha uma opção:\n\n' + buildMenuPrincipal()); }
      return respond('Digite *1* para Sim ou *2* para Não:');
    }

    if (state === 'CONFIRMAR_VER_PRODUTO') {
      // Cliente tinha carrinho e pediu outro produto. 1 = ver o produto (carrinho preservado). 2 = volta ao carrinho.
      if (num === 1) { const e = session.pendenteRec || {}; return await resolverReconhecido({ ...session, pendenteRec:null, errosSeguidos:0 }, sid, e, respond); }
      if (num === 2) {
        const carrinho = session.carrinho || [];
        await saveSession(sid, { ...session, state:'CARRINHO', pendenteRec:null, errosSeguidos:0 });
        return respond(`Beleza, voltando pro seu carrinho! 🛒\n\n${msgCarrinhoMenu(carrinho)}`);
      }
      return respond(`Digite *1* para ver o produto ou *2* para continuar de onde parou:`);
    }

    if (state === 'SUBMENU_TESTO') {
      const dados = await buscarCache('hormonios');
      let filtro, label;
      let excluir = ['masteron','drostanolona','trembolona','tren','nandrolona','deca','boldenona','primobolan','metenolona'];
      if (num === 1)      { filtro=['enantato'];   label='ENANTATO DE TESTOSTERONA'; }
      else if (num === 2) { filtro=['cipionato'];  label='CIPIONATO DE TESTOSTERONA'; }
      else if (num === 3) { filtro=['durateston']; label='DURATESTON (BLEND)'; excluir=[]; }
      else if (num === 4) { filtro=['propionato','suspensao','undecanoato','nebido']; label='OUTRAS TESTOSTERONAS'; }
      else return await tratarTextoLivre(session, sid, n, MENU_TESTO, respond);
      let linhas = filtrarCache(dados, filtro);
      if (excluir.length) linhas = linhas.filter(l => { const nl = norm(l); return !excluir.some(x => nl.includes(x)); });
      const unicas = [...new Set(linhas)];
      if (!unicas.length) return respond(`Nenhum *${label}* disponível no momento. 😕\n\n${MENU_TESTO}`);
      await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(unicas), errosSeguidos:0 });
      return respond(`*${label}*\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*`);
    }

    if (state === 'ESTER_BASE') {
      const ester = session.pendenteEster || '';
      const baseMapNum = { 1:'testosterona', 2:'trembolona', 3:'masteron', 4:'nandrolona', 5:'outras' };
      const base = baseMapNum[num];
      if (!base) return await tratarTextoLivre(session, sid, n, `*${(ester||'').toUpperCase()} de quê?*\n\n${MENU_BASE_ESTER}`, respond);
      const dados = await buscarCache('hormonios');
      const unicas = filtrarEster(dados, ester, base);
      const baseLabel = base.charAt(0).toUpperCase() + base.slice(1);
      if (!unicas.length) return respond(`Não encontrei *${ester} de ${baseLabel}* disponível no momento. 😕\n\nQuer tentar outra base?\n\n${MENU_BASE_ESTER}`);
      await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(unicas), pendenteEster:null, errosSeguidos:0 });
      return respond(`*${ester.toUpperCase()} DE ${baseLabel.toUpperCase()}*\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*`);
    }

    if (state === 'PEPTIDEOS') {
      const mapa = {
        1: ['bpc-157', 'bpc157'], 2: ['tb-500', 'tb500'], 3: ['ghk-cu', 'ghkcu'],
        4: ['klow'], 5: ['glow'], 6: ['ss-31', 'ss31'], 7: ['mots-c', 'motsc'],
        8: ['ipamorelin'], 9: ['cjc-1295', 'cjc1295'], 10: ['pt-141', 'pt141'],
        11: ['aod-9604', 'aod9604'], 12: ['cbl-514', 'cbl514'], 13: ['epitalon'],
        14: ['nad'], 15: ['tesamorelin'],
      };
      if (mapa[num]) {
        const dados = await buscarCache('peptideos');
        const linhas = filtrarCache(dados, mapa[num]);
        if (!linhas.length) return respond(`Produto não disponível no momento.\n\n${MENU_PEPTIDEOS}`);
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*${mapa[num][0].toUpperCase()}*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }
      if (num === 16) {
        const dados = await buscarCache('peptideos');
        const todosTermos = Object.values(mapa).flat().concat(['retatrutida','tirzepatida','semaglutida']);
        const linhas = dados.split('\n').filter(Boolean).filter(l => { const nProd = norm(l.split('|')[0]); return !todosTermos.some(t => nProd.includes(norm(t))); });
        if (!linhas.length) return respond(`Nenhum outro peptídeo encontrado.\n\n${MENU_PEPTIDEOS}`);
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*OUTROS PEPTÍDEOS*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }
      return await tratarTextoLivre(session, sid, n, MENU_PEPTIDEOS, respond);
    }

    if (state === 'HORMONIOS') {
      const mapa = {
        1:  { termos:['enantato','testosterona'], label:'ENANTATO DE TESTOSTERONA' },
        2:  { termos:['testosterona'],             label:'TESTOSTERONA / DURATESTON' },
        3:  { termos:['npp','fenilpropionato'],    label:'NPP' },
        4:  { termos:['trembolona'],               label:'TREMBOLONA' },
        5:  { termos:['boldenona'],                label:'BOLDENONA' },
        6:  { termos:['stanozolol'],               label:'STANOZOLOL' },
        7:  { termos:['oxandrolona'],              label:'OXANDROLONA' },
        8:  { termos:['nandrolona'],               label:'NANDROLONA (DECA)' },
        9:  { termos:['masteron','drostanolona'],  label:'MASTERON' },
        10: { termos:['primobolan','metenolona'],  label:'PRIMOBOLAN' },
        11: { termos:['dianabol','metandienona'],  label:'DIANABOL' },
        12: { termos:['hemogenin','oximetolona'],  label:'HEMOGENIN (ANADROL)' },
        13: { termos:['hcg'],                      label:'HCG' },
        14: { termos:['anastrozol','proviron'],    label:'ANASTROZOL / PROVIRON' },
        15: { termos:['clembuterol','t3'],         label:'CLEMBUTEROL / T3' },
        16: { termos:['cutstack'],                 label:'CUTSTACK' },
      };
      if (mapa[num]) {
        const { termos, label } = mapa[num];
        const dados = await buscarCache('hormonios');
        let linhas = filtrarCache(dados, termos);
        if (num === 2) linhas = linhas.filter(l => !norm(l).includes('enantato'));
        if (!linhas.length) return respond(`Produto não disponível no momento.\n\n${MENU_HORMONIOS}`);
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*${label}*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }
      if (num === 17) {
        const dados = await buscarCache('hormonios');
        const todosTermos = Object.values(mapa).flatMap(m => m.termos);
        const linhas = dados.split('\n').filter(Boolean).filter(l => { const nProd = norm(l.split('|')[0]); return !todosTermos.some(t => nProd.includes(norm(t))); });
        if (!linhas.length) return respond(`Nenhum outro hormônio encontrado.\n\n${MENU_HORMONIOS}`);
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*OUTROS HORMÔNIOS*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }
      return await tratarTextoLivre(session, sid, n, MENU_HORMONIOS, respond);
    }

    if (state === 'FABRICANTES') {
      const fabMap = {
        1:'zphc', 2:'veltrane', 3:'landerlan', 4:'muscle labs', 5:'alpha pharma',
        6:'health peptides', 7:'alluvi', 8:'lipoless', 9:'cooper pharma',
        10:'neuroceptix', 11:'king pharma', 12:'synedica', 13:'neopeptides',
        14:'eurogold', 15:'novax', 16:'bratva',
      };
      if (fabMap[num]) {
        const tudo = await buscarTodosCache();
        const linhas = filtrarCache(tudo, fabMap[num]);
        const unicas = [...new Set(linhas)];
        if (!unicas.length) return respond(`Nenhum produto de *${fabMap[num]}* disponível.\n\n${MENU_FABRICANTES}`);
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(unicas) });
        return respond(`*${fabMap[num].toUpperCase()}*\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*`);
      }
      if (num === 17) { await saveSession(sid, { ...session, state:'BUSCA_LIVRE' }); return respond('Digite o nome do fabricante que procura:'); }
      return await tratarTextoLivre(session, sid, n, MENU_FABRICANTES, respond);
    }

    if (state === 'BUSCA_LIVRE') {
      if (!mensagem || mensagem.length < 2) return respond('Por favor, digite o nome do fabricante:');
      const tudo = await buscarTodosCache();
      const linhas = filtrarCache(tudo, mensagem);
      const unicas = [...new Set(linhas)];
      if (!unicas.length) return respond(`Nenhum produto de *${mensagem}* encontrado.\n\n${MENU_FABRICANTES}`);
      await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(unicas) });
      return respond(`*${mensagem.toUpperCase()}*\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*`);
    }

    if (state === 'LISTA_PRODUTOS') {
      const lista = session.produtoLista || [];
      if (!num || num < 1 || num > lista.length) return respond(`Digite um número entre 1 e ${lista.length}.\n\nOu *menu* para voltar.`);
      const prod = lista[num - 1];
      await saveSession(sid, { ...session, state:'QUANTIDADE', produtoSelecionado: prod });
      return respond(`Você escolheu:\n📦 *${prod.nome}*\n💰 R$ ${prod.preco.toFixed(2).replace('.',',')}\n\n*Quantas unidades deseja?*\n_(Digite o número)_`);
    }

    if (state === 'QUANTIDADE') {
      if (!num || num < 1 || num > 99) return respond('Por favor, informe uma quantidade válida (1 a 99):');
      const prod = session.produtoSelecionado || {};
      const carrinho = session.carrinho || [];
      carrinho.push({ nome: prod.nome, preco: prod.preco, qtd: num, colecao: prod.colecao || session.colecaoAtual || '' });
      const subtotal = totalCarrinho(carrinho);
      await saveSession(sid, { ...session, state:'CARRINHO', carrinho });
      return respond(`✅ Adicionado ao carrinho:\n📦 *${prod.nome}* x${num}\n\n${msgCarrinhoMenu(carrinho)}`);
    }

    if (state === 'CARRINHO') {
      const carrinho = session.carrinho || [];
      if (num === 1) { await saveSession(sid, { ...session, state:'MENU' }); return respond('🛒 Seu carrinho está guardado! Escolha mais produtos:\n\n' + buildMenuPrincipal()); }
      if (num === 2) { await saveSession(sid, { ...session, state:'ESTADO' }); return respond(`*De qual estado você é?*\nExemplo: RJ, SP, MG, DF, BA...`); }
      if (num === 3 || REM_INTENT.some(p => n.includes(p))) {
        if (!carrinho.length) { await saveSession(sid, { ...session, state:'MENU' }); return respond('Seu carrinho está vazio. 🛒\n\n' + buildMenuPrincipal()); }
        await saveSession(sid, { ...session, state:'REMOVER_ITEM' });
        return respond(msgRemoverItem(carrinho));
      }
      // Se foi um número fora de 1-3, reforça as opções. Se foi texto, tenta entender (produto, etc.).
      if (num && num >= 1) return respond('Digite *1* para adicionar mais, *2* para finalizar ou *3* para remover um produto:');
      return await tratarTextoLivre(session, sid, n, msgCarrinhoMenu(carrinho), respond);
    }

    if (state === 'REMOVER_ITEM') {
      const carrinho = session.carrinho || [];
      if (!carrinho.length) { await saveSession(sid, { ...session, state:'MENU' }); return respond('Seu carrinho está vazio. 🛒\n\n' + buildMenuPrincipal()); }
      if (!num || num < 1 || num > carrinho.length) return respond(`Digite um número entre 1 e ${carrinho.length} para remover, ou *menu* para voltar.\n\n${msgRemoverItem(carrinho)}`);
      const removido = carrinho.splice(num - 1, 1)[0];
      if (!carrinho.length) {
        await saveSession(sid, { ...session, state:'MENU', carrinho: [] });
        return respond(`🗑️ *${removido.nome}* removido. Seu carrinho ficou vazio.\n\nEscolha um produto pra continuar:\n\n` + buildMenuPrincipal());
      }
      await saveSession(sid, { ...session, state:'CARRINHO', carrinho });
      return respond(`🗑️ *${removido.nome}* removido!\n\n${msgCarrinhoMenu(carrinho)}`);
    }

    if (state === 'ESTADO') {
      if (REM_INTENT.some(p => n.includes(p)) && (session.carrinho || []).length) {
        await saveSession(sid, { ...session, state:'REMOVER_ITEM' });
        return respond(msgRemoverItem(session.carrinho));
      }
      const uf = mensagem.trim().toUpperCase().replace(/[^A-Z]/g,'').slice(0,2);
      const opts = getFreteOpcoes(uf);
      if (!opts) return respond(`Estado *${uf || mensagem}* não reconhecido.\nDigite a sigla do seu estado (ex: RJ, SP, MG):`);
      const freteStr = opts.map((o, i) => `${emojis(i)} *${o.label}* — R$ ${o.valor.toFixed(2).replace('.',',')}`).join('\n');
      await saveSession(sid, { ...session, state:'FRETE', estadoCliente: uf, freteOpcoes: opts });
      return respond(`*Opções de frete para ${uf}:*\n\n${freteStr}\n\n💡 Recomendamos a *Transportadora* — inclui seguro grátis contra apreensão e extravio.\n\n*Digite o número:*`);
    }

    if (state === 'FRETE') {
      if (REM_INTENT.some(p => n.includes(p)) && (session.carrinho || []).length) {
        await saveSession(sid, { ...session, state:'REMOVER_ITEM' });
        return respond(msgRemoverItem(session.carrinho));
      }
      const opts = session.freteOpcoes || [];
      if (!num || num < 1 || num > opts.length) return respond(`Digite 1, 2 ou 3 para escolher o frete:`);
      const frete = opts[num - 1];
      const carrinho = session.carrinho || [];
      if (!carrinho.length) { await saveSession(sid, { state:'MENU' }); return respond('Seu carrinho está vazio! 🛒\n\nEscolha um produto primeiro:\n\n' + MENU_PRINCIPAL); }
      const totalProd = totalCarrinho(carrinho);
      if (session.fluxoPromo) {
        const descPct = session.descontoPromoPct || 0;
        const descValor = totalProd * (descPct / 100);
        const totalComDesconto = totalProd - descValor + frete.valor;
        const resumo =
          `*📋 RESUMO DO PEDIDO*\n\n${resumoCarrinho(carrinho)}\n\n` +
          `    Subtotal: R$ ${totalProd.toFixed(2).replace('.',',')}\n\n` +
          `🚚 Frete *${frete.label}* — ${session.estadoCliente}: R$ ${frete.valor.toFixed(2).replace('.',',')}\n` +
          `🔥 *${session.promoTitulo||'Promoção Relâmpago'}* — preços promocionais já aplicados` +
          (descPct ? `\n🏷️ Desconto extra (-${descPct}%): -R$ ${descValor.toFixed(2).replace('.',',')}` : '') +
          `\n\n💰 *Total: R$ ${totalComDesconto.toFixed(2).replace('.',',')}*\n\n*Confirma?*\n1️⃣ Sim, quero comprar!\n2️⃣ Não, voltar ao menu`;
        await saveSession(sid, { ...session, state:'CONFIRMAR', freteSelecionado: frete, totalProd, descontoReais: descValor, total: totalComDesconto, descontoTipo:'promo' });
        return respond(resumo);
      }
      // Opção B: aplica os 3% e mostra o resumo direto; o cupom fica como convite discreto no resumo
      return await fecharResumoNormal({ ...session, freteSelecionado: frete, totalProd }, sid, null, respond);
    }

    if (state === 'PERGUNTA_CUPOM') {
      if (num === 1) { await saveSession(sid, { ...session, state:'INFORMAR_CUPOM' }); return respond('Digite o *código do cupom*:'); }
      if (num === 2) { return await fecharResumoNormal(session, sid, null, respond); }
      return respond('Digite *1* se tem cupom ou *2* para seguir sem cupom:');
    }

    if (state === 'INFORMAR_CUPOM') {
      const carrinho = session.carrinho || [];
      const totalProd = session.totalProd || totalCarrinho(carrinho);
      const resultado = await validarCupom(mensagem, totalProd);
      if (!resultado.ok) return respond(`❌ ${resultado.motivo}\n\nDigite outro código ou *menu* para recomeçar.\n_Ou digite *2* para seguir sem cupom._`);
      return await fecharResumoNormal(session, sid, resultado, respond);
    }

    if (state === 'CONFIRMAR') {
      if (num === 2) { await deleteSession(sid); return respond('Tudo bem! Quando quiser, estou aqui. 😊\n\n' + MENU_PRINCIPAL); }
      if (num === 1) {
        const carrinho = session.carrinho || [];
        if (!carrinho.length) { await saveSession(sid, { state:'MENU' }); return respond('Seu carrinho está vazio! 🛒\n\nEscolha um produto primeiro:\n\n' + MENU_PRINCIPAL); }
        const frete = session.freteSelecionado || {};
        const uf    = session.estadoCliente || '';
        const descontoReais = session.descontoReais || 0;
        const totalFinal = session.total;
        let infoDesconto = '';
        if (descontoReais > 0) {
          const lbl = session.descontoLabel || (session.descontoTipo === 'promo' ? (session.promoTitulo||'Promoção') : 'Desconto');
          infoDesconto = `\n🏷️ ${lbl}: -R$ ${descontoReais.toFixed(2).replace('.',',')}\n💰 *Total: R$ ${totalFinal.toFixed(2).replace('.',',')}*`;
        }
        const orderNsu = await gerarNumeroPedido();
        const link = await gerarLinkInfinitePay(carrinho, frete.valor, orderNsu, descontoReais);
        try {
          const pKey = `pending_${sid.replace(/[^a-zA-Z0-9]/g,'_')}`;
          await fetch(`${FIREBASE_URL}/vitaflow_pending_orders/${pKey}.json`, {
            method:'PUT', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              phone: sid, order_nsu: orderNsu,
              produto: carrinho.map(i => `${i.nome} x${i.qtd}`).join(' | '),
              quantidade: carrinho.reduce((a,i)=>a+i.qtd,0),
              frete: frete.label, estado: uf, valor: totalFinal, ts: Date.now(),
              carrinho: carrinho, freteSelecionado: frete, estadoCliente: uf, total: totalFinal,
              descontoReais: descontoReais, descontoLabel: session.descontoLabel || '',
              descontoTipo: session.descontoTipo || '', cupomDocId: session.cupomDocId || null,
              cupomCodigo: session.cupomCodigo || null, link: link || ''
            })
          });
        } catch {}
        const itensTxt = carrinho.map(i => `🛒 ${i.nome} x${i.qtd}`).join('\n');
        await enviarTelegram(`🟡 *PEDIDO EM ABERTO (Athena)*\n\n📦 ${orderNsu || '—'}\n${itensTxt}\n🚚 ${frete.label} — ${uf}\n💰 R$ ${totalFinal.toFixed(2).replace('.',',')}\n📱 ${sid}\n\n⏳ Link gerado. Aguardando pagamento/confirmação do cliente.`);
        try {
          await fetch(GAS_URL, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ action: 'alerta_pedido_aberto', order_nsu: orderNsu,
              produto: carrinho.map(i => `${i.nome} x${i.qtd}`).join(' | '),
              quantidade: carrinho.reduce((a,i)=>a+i.qtd,0), frete: frete.label, estado: uf,
              valor: totalFinal.toFixed(2).replace('.',','), phone: sid })
          });
        } catch {}
        await saveSession(sid, { ...session, state:'AGUARDAR_COMPROVANTE', total: totalFinal, orderNsu, cupomDocId: session.cupomDocId || null, cupomCodigo: session.cupomCodigo || null });
        return respond(link
          ? `✅ *Pedido gerado!*${infoDesconto}\n\n💳 *Link de pagamento:*\n${link}\n\n_Assim que você concluir o pagamento, *eu confirmo automaticamente aqui* — não precisa enviar comprovante nem avisar._ 😊\n\nEm seguida eu já te chamo pra pegar os dados de envio. 🚀`
          : `Acesse vitaflowoficial.com para finalizar seu pedido.`);
      }
      // Opção B: cliente pode digitar um código de cupom aqui (não em promoção/negociação)
      if (mensagem && mensagem.trim().length >= 3 && session.descontoTipo !== 'promo' && session.descontoTipo !== 'namorados') {
        const totalProd = session.totalProd || totalCarrinho(session.carrinho || []);
        const resultado = await validarCupom(mensagem, totalProd);
        if (resultado.ok) {
          if (resultado.descontoReais > (session.descontoReais || 0)) {
            return await fecharResumoNormal({ ...session, cupomDocId:null, cupomCodigo:null }, sid, resultado, respond);
          }
          return respond(`Seu cupom *${resultado.codigo}* daria R$ ${resultado.descontoReais.toFixed(2).replace('.',',')}, mas o desconto de 3% que já apliquei é maior 😉\n\nDigite *1* para confirmar ou *2* para voltar ao menu.`);
        }
        return respond(`❌ ${resultado.motivo}\n\nDigite *1* para confirmar com o desconto atual, ou *2* para voltar ao menu.`);
      }
      return respond('Digite *1* para confirmar ou *2* para voltar ao menu:');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // AGUARDAR COMPROVANTE
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'AGUARDAR_COMPROVANTE') {
      // ⚠️ REGRA CRÍTICA: a Athena NUNCA confirma pagamento por palavra do cliente nem por comprovante.
      // Somente o webhook real da InfinitePay (via GAS) confirma o pagamento e muda o estado para COLETA_DADOS.
      // Aqui, o cliente que diz "paguei"/manda print apenas recebe acolhimento. Se insistir 2+ vezes, aciona suporte humano.
      const palavrasPag = ['paguei','pix feito','fiz o pix','transferi','pago','pix realizado','comprovante','ja paguei','ja transferi','sim','yes','realizei','confirmado','feito','ok','okay','comprei','finalizei'];
      const ehMidiaBC = !!(body.type || body.mediaUrl || body.media_url || body.fileUrl || body.url || body.arquivo || body.file || body.caption !== undefined);
      const ehUrlImagem = !!(mensagem && mensagem.match(/https?:\/\/[^\s]+(jpg|jpeg|png|gif|pdf|mp4|webp|ogg|opus)/i));
      const dizQuePagou = ehMidiaBC || ehUrlImagem || palavrasPag.some(p => n.includes(p));

      const carrinhoPend = session.carrinho || [];
      const totalPend = session.total || 0;

      if (dizQuePagou) {
        const insist = (session.insistPagou || 0) + 1;
        if (insist >= 2) {
          // Insistiu 2+ vezes sem o webhook ter confirmado → aciona suporte humano, mas mantém o pedido.
          await enviarTelegram(
            `🔔 *CLIENTE DIZ QUE PAGOU — sem confirmação do webhook*\n` +
            `📦 ${session.orderNsu || '—'}\n📱 ${sid}\n💰 R$ ${totalPend.toFixed(2).replace('.',',')}\n` +
            `O cliente afirma ter pago ${insist}x e a InfinitePay ainda não confirmou. Verificar manualmente.`
          );
          await saveSession(sid, { ...session, insistPagou: insist });
          return respond(
            `Entendi! 🧡 Já *avisei nossa equipe* pra verificar seu pagamento manualmente — em instantes alguém te dá retorno por aqui.\n\n` +
            `Pode ficar tranquilo: *seu pedido está guardado* e o link continua válido. Assim que o pagamento for localizado, eu sigo com seu envio na hora. 😊`
          );
        }
        await saveSession(sid, { ...session, insistPagou: insist });
        return respond(
          `Recebido! 🧡 Assim que o pagamento cair, a *confirmação chega aqui automaticamente* e eu já sigo com seu envio — você não precisa enviar comprovante nem avisar.\n\n` +
          `Se você já pagou e em alguns minutinhos eu não confirmar, é só me mandar *"paguei"* de novo que eu *aciono um atendente* pra verificar pra você. 😊\n\n` +
          `_(Seu pedido está guardado e o link continua válido.)_`
        );
      }

      // Mensagem padrão de pedido em aberto (não fala em "digite SIM" — só o pagamento confirma)
      return respond(
        `⏳ Você tem um pedido em aberto aguardando pagamento:\n\n` +
        `${resumoCarrinho(carrinhoPend)}\n` +
        `💰 *R$ ${totalPend.toFixed(2).replace(".",",")}*\n\n` +
        `É só concluir o pagamento pelo seu link — assim que cair, *eu confirmo automaticamente aqui* e já pego seus dados de envio. 🚀\n\n` +
        `Se quiser cancelar e começar do zero, digite *menu*. 😊`
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COLETA DE DADOS
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'COLETA_DADOS') {
      // Combina IA + leitor determinístico (regex). A IA preenche; o regex cobre o que faltar.
      const dadosIA = await extrairDadosIA(mensagem) || {};
      const dadosRegex = extrairDadosRegex(mensagem) || {};
      const dadosNovos = { ...dadosRegex, ...dadosIA }; // IA tem prioridade quando preencheu
      const coleta = { ...(session.coleta||{}) };
      Object.keys(dadosNovos).forEach(k => { const v = dadosNovos[k]; if (v && String(v).trim().length >= 1 && !coleta[k]) coleta[k] = v; });
      if (coleta.estado) coleta.estado = String(coleta.estado).toUpperCase().replace(/[^A-Z]/g,'').slice(0,2);
      const obrigatorios = ['nome','cpf','telefone','endereco','bairro','cidade','estado','cep'];
      const faltam = obrigatorios.filter(c => !coleta[c] || String(coleta[c]).length < 2);

      if (faltam.length > 0) {
        const tentativas = (session.coletaTentativas || 0) + 1;
        // TRAVA: pedido já pago nunca volta ao menu. Após 3 tentativas, escala pra humano e mantém o pedido.
        if (tentativas >= 3) {
          await enviarTelegram(
            `⚠️ *COLETA TRAVADA — pedido PAGO* (precisa de atendimento humano)\n` +
            `📦 ${session.orderNsu || '—'}\n📱 ${sid}\n` +
            `Faltando: ${faltam.join(', ')}\n` +
            `Dados captados: ${JSON.stringify(coleta)}\n` +
            `Última mensagem do cliente: ${mensagem}`
          );
          await saveSession(sid, { ...session, coleta, coletaTentativas: tentativas });
          return respond(
            `Obrigada! 🙏 Já recebi parte dos seus dados. Vou pedir pra um atendente *finalizar seu envio* com você pra não ter erro — seu *pedido está pago e garantido*. 😊\n\n` +
            `Se quiser, pode reenviar os dados que faltam neste formato que eu também tento de novo:\n` +
            `Nome: \nCPF: \nTelefone: \nRua e número: \nBairro: \nCidade: \nEstado: \nCEP: `
          );
        }
        await saveSession(sid, { ...session, coleta, coletaTentativas: tentativas });
        const nomesCampos = { nome:'Nome completo', cpf:'CPF', telefone:'Telefone', email:'E-mail', endereco:'Rua e número', bairro:'Bairro', cidade:'Cidade', estado:'Estado', cep:'CEP' };
        return respond(
          `Quase lá! 😊 Só preciso confirmar:\n${faltam.map(f => '• '+nomesCampos[f]).join('\n')}\n\n` +
          `Pode me mandar tudo junto, em linhas separadas (não precisa dos rótulos):\n` +
          `_Ex.: João da Silva / 000.000.000-00 / (11) 99999-9999 / Rua X 123 / Centro / São Paulo / SP / 00000-000_`
        );
      }

      const carrinho = session.carrinho || [];
      const frete    = session.freteSelecionado || {};
      const total    = session.total || 0;
      const num_pedido = session.orderNsu || await gerarNumeroPedido();

      if (num_pedido) {
        const items = carrinho.map(i => ({
          description: `${i.nome} x${i.qtd}`, quantity: i.qtd, price: Math.round(i.preco * 100)
        }));
        items.push({ description: `Frete ${frete.label} — ${session.estadoCliente}`, quantity: 1, price: Math.round(frete.valor * 100) });

        await salvarPedidoGAS({
          order_nsu: num_pedido,
          paid_amount: Math.round(total * 100),
          capture_method: 'whatsapp_athena',
          customer: { name: coleta.nome, email: (coleta.email||'nao_informado').toLowerCase(), phone_number: coleta.telefone, document: coleta.cpf },
          address: { street: coleta.endereco, number: '', complement: coleta.complemento||'', neighborhood: coleta.bairro, city: coleta.cidade, state: coleta.estado, cep: coleta.cep },
          items
        });

        const itensTxt = carrinho.map(i => `🛒 ${i.nome} x${i.qtd}`).join('\n');
        await enviarTelegram(
          `🤖 *VENDA ATHENA!*\n\n📦 ${num_pedido}\n👤 ${coleta.nome}\n🪪 ${coleta.cpf}\n📱 ${coleta.telefone}\n📧 ${coleta.email||'—'}\n🏠 ${coleta.endereco}${coleta.complemento?', '+coleta.complemento:''}, ${coleta.bairro}, ${coleta.cidade}-${coleta.estado}, ${coleta.cep}\n${itensTxt}\n🚚 ${frete.label} ${session.estadoCliente}\n💰 R$ ${total.toFixed(2)}\n📱 ${sid}`
        );
      }

      const linkRecibo = gerarLinkRecibo(
        num_pedido || 'VF-A', coleta.nome, coleta.cpf, coleta.email || '',
        'WhatsApp / Athena', carrinho, frete, total
      );

      const primeiroNome = (coleta.nome || '').split(' ')[0];
      const msg1 =
        `✅ *Pedido ${num_pedido||''} confirmado!*\n\n` +
        `Olá, *${primeiroNome}*! Obrigada pela confiança na VitaFlow! 🧡\n\n` +
        `${resumoCarrinho(carrinho)}\n` +
        `🚚 ${frete.label} — ${session.estadoCliente}\n` +
        `💰 R$ ${total.toFixed(2).replace('.',',')}\n\n` +
        `🧾 *Seu recibo completo:*\n${linkRecibo}\n\n` +
        `⏱️ *Prazo de postagem:* até 48 horas úteis após a confirmação do pagamento.\n\n` +
        `📦 *Prazos de entrega por região (após a postagem):*\n` +
        `• Sudeste: 2 a 5 dias úteis\n` +
        `• Sul: 3 a 5 dias úteis\n` +
        `• Centro-Oeste: 4 a 6 dias úteis\n` +
        `• Nordeste: 5 a 8 dias úteis\n` +
        `• Norte: 7 a 10 dias úteis\n` +
        `_*Estimativas, podem variar conforme distância e condições._\n\n` +
        `🔍 *Rastreie seu pedido em tempo real:*\nvitaflowoficial.com/pages/rastrear-pedido\n` +
        `Use qualquer uma dessas informações para rastrear:\n` +
        `• *Número do pedido:* ${num_pedido||''}\n` +
        (coleta.cpf ? `• *CPF:* ${coleta.cpf}\n` : '') +
        (coleta.email ? `• *E-mail:* ${coleta.email}\n` : '') +
        `\n📲 *Entre nos nossos grupos oficiais!*\n` +
        `Fique por dentro de promoções, lançamentos e avisos em primeira mão:\n` +
        `💬 Grupo VIP no WhatsApp: ${GRUPO_WHATSAPP}\n` +
        `✈️ Referências no Telegram: ${GRUPO_TELEGRAM}`;

      const msg2 =
        `🚨 *IMPORTANTE — LEIA ATÉ O FINAL* 🚨\n\n` +
        `⚠️ *AVISO IMPORTANTE — VITAFLOW* ⚠️\n\n` +
        `Antes de receber seu pedido, leia com atenção. Essas instruções são essenciais para te ajudarmos em qualquer situação. 🙏\n\n` +
        `📹 *1. FILME A ABERTURA DA EMBALAGEM*\n` +
        `Ao receber sua encomenda, grave um vídeo contínuo e sem cortes — desde a embalagem fechada até retirar todos os itens.\nIsso é obrigatório para qualquer tipo de reclamação.\n\n` +
        `✅ Mostre a caixa fechada antes de abrir\n` +
        `✅ Não pause nem corte o vídeo em nenhum momento\n` +
        `✅ Filme todos os produtos ao retirar da caixa\n\n` +
        `❗ Sem o vídeo, não conseguimos abrir reclamação junto à transportadora e não teremos como te ajudar.\n` +
        `📌 Por quê? Já identificamos casos em que entregadores retiraram produtos da caixa e a lacram novamente de forma perfeita, sem deixar vestígio. O vídeo é a única prova possível nesses casos.\n\n` +
        `📍 *2. ENDEREÇO COMPLETO E ALGUÉM PARA RECEBER*\n` +
        `Informe seu endereço com todos os detalhes: rua, número, complemento, bloco, apartamento, bairro e ponto de referência.\nE, obrigatoriamente, deve haver uma pessoa disponível no local para receber o pedido pessoalmente.\n\n` +
        `✅ Confira todos os dados antes de finalizar o pedido\n` +
        `✅ Garanta que haverá alguém no endereço no dia da entrega\n` +
        `❌ Não solicite deixar o pacote sem ninguém para receber. Já tivemos casos em que o cliente pediu isso e depois alegou não ter recebido — porém a transportadora apresentou comprovante de entrega. Nesse caso, não temos como ajudar.\n\n` +
        `💬 Teve algum problema? Fale com a gente pelo WhatsApp assim que identificar qualquer divergência e envie o vídeo da abertura junto com os detalhes do pedido. Faremos tudo ao nosso alcance para resolver! 💪\n\n` +
        `— *Equipe VitaFlow* 🧡`;

      // Incrementa uso do cupom SOMENTE agora (pedido confirmado)
      if (session.cupomDocId) {
        await incrementarUsoCupom(session.cupomDocId);
      }

      await deleteSession(sid);
      return respond(msg1, msg2);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROTOCOLO (única parte com IA)
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'PROTOCOLO') {
      if (num && num >= 1 && session.listaProtocolo && num <= session.listaProtocolo.length) {
        const prod = session.listaProtocolo[num - 1];
        await saveSession(sid, { ...session, state:'QUANTIDADE', produtoSelecionado: prod });
        return respond(`Você escolheu:\n📦 *${prod.nome}*\n💰 R$ ${prod.preco.toFixed(2).replace('.',',')}\n\n*Quantas unidades deseja?*\n_(Digite o número)_`);
      }

      const hist = (session.historico || []).slice(-8);
      hist.push({ role:'user', content: mensagem });
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' },
          body: JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:1500, system: PROTOCOLO_PROMPT, messages: hist })
        });
        const d = await r.json();
        if (d.error || !d.content) throw new Error('Claude error');
        let reply = d.content[0].text || '';

        let msgProdutos = '';
        const matchProd = reply.match(/---PRODUTOS---([\s\S]*?)---FIM---/);
        if (matchProd) {
          const nomeProduto = matchProd[1].trim();
          reply = reply.replace(/---PRODUTOS---([\s\S]*?)---FIM---/, '').trim();

          const tudo = await buscarTodosCache();
          const termos = nomeProduto.toLowerCase().split(/[\s\/,+]+/).filter(p => p.length > 2);
          const linhas = filtrarCache(tudo, termos.slice(0, 2));
          const unicas = [...new Set(linhas)].slice(0, 10);

          if (unicas.length) {
            const promo = promoAtiva();
            const avisoPromo = promo
              ? `\n🔥 *${promo.titulo}* ativa! Digite *promo* pra ver as ofertas.\n`
              : '';
            msgProdutos =
              `🛒 *Produtos disponíveis — ${nomeProduto.toUpperCase()}:*\n${avisoPromo}\n` +
              formatarLista(unicas) +
              `\n\n*Digite o número para comprar ou *menu* para ver todas as categorias.*`;

            await saveSession(sid, {
              ...session,
              state: 'PROTOCOLO',
              historico: hist.concat([{ role:'assistant', content: reply }]),
              listaProtocolo: parseProdutos(unicas)
            });
          } else {
            msgProdutos = `🛒 Para ver todos os produtos disponíveis, *digite menu*.`;
            await saveSession(sid, { ...session, state:'PROTOCOLO', historico: hist.concat([{ role:'assistant', content: reply }]) });
          }
        } else {
          hist.push({ role:'assistant', content: reply });
          await saveSession(sid, { ...session, state:'PROTOCOLO', historico: hist });
        }

        return respond(reply, msgProdutos);

      } catch(e) {
        console.error('PROTOCOLO ERRO:', e.message);
        await saveSession(sid, { ...session, state:'PROTOCOLO', historico: hist });
        return respond('Desculpe o delay! 😊 Pode repetir sua pergunta?\n\nOu *menu* para voltar.');
      }
    }

    // Fallback
    await saveSession(sid, { state:'MENU' });
    return respond(MENU_PRINCIPAL);

  } catch(err) {
    console.error('ERRO GERAL:', err);
    return respond('Desculpe o delay! 😊 Digite *menu* para começar.');
  }
};
