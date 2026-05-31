// botconversa.js — VitaFlow Athena v4 — Arquitetura menu-driven com máquina de estados

const INFINITEPAY_TAG = 'vitaflowoficial';
const FIREBASE_URL    = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const GAS_URL         = 'https://script.google.com/macros/s/AKfycbxFlaN0FXFbpcC8HZ80sxnq383m5d-xTaj5cg72VcCdnYx47N_qKkiELFN5KAPmm_nb/exec';
const RECIBO_BASE     = 'https://melodious-pony-e4f4f5.netlify.app/recibo-auto.html';

// ── Tabela de fretes ──────────────────────────────────────────────────────────
const FRETES = {
  RJ:{PAC:45,SEDEX:60,Transp:70},  SP:{PAC:45,SEDEX:60,Transp:55},
  MG:{PAC:45,SEDEX:70,Transp:70},  ES:{PAC:45,SEDEX:70,Transp:70},
  DF:{PAC:45,SEDEX:60,Transp:72},  PR:{PAC:45,SEDEX:60,Transp:70},
  SC:{PAC:45,SEDEX:70,Transp:70},  RS:{PAC:45,SEDEX:70,Transp:100},
  GO:{PAC:45,SEDEX:70,Transp:76},  MS:{PAC:45,SEDEX:85,Transp:80},
  BA:{PAC:58,SEDEX:90,Transp:80},  MT:{PAC:58,SEDEX:90,Transp:75},
  CE:{PAC:72,SEDEX:105,Transp:80}, PA:{PAC:87,SEDEX:105,Transp:110},
  PE:{PAC:87,SEDEX:115,Transp:90}, TO:{PAC:87,SEDEX:105,Transp:110},
  MA:{PAC:100,SEDEX:125,Transp:90},PB:{PAC:100,SEDEX:125,Transp:100},
  RN:{PAC:100,SEDEX:125,Transp:100},PI:{PAC:100,SEDEX:125,Transp:110},
  AL:{PAC:100,SEDEX:125,Transp:90},SE:{PAC:100,SEDEX:125,Transp:90},
  AM:{PAC:100,SEDEX:125,Transp:110},RO:{PAC:100,SEDEX:110,Transp:170},
  AP:{PAC:100,SEDEX:125,Transp:120},RR:{PAC:130,SEDEX:110,Transp:null},
  AC:{PAC:130,SEDEX:110,Transp:150},
};

// ── Menus fixos ───────────────────────────────────────────────────────────────
const MENU_PRINCIPAL_BASE = `✨ *Olá! Bem-vindo à VitaFlow!* 🌿

Eu sou a *Athena* 🤖💊 — sua consultora virtual especializada em peptídeos, hormônios e suplementação avançada de alta performance.

Estou aqui para te ajudar a encontrar os melhores produtos, tirar dúvidas técnicas e garantir a melhor experiência de compra. Tudo com segurança, agilidade e os melhores preços! 💪🔥

*O que você procura hoje?*

1️⃣ Mais Vendidos 🔥
2️⃣ Peptídeos 💉
3️⃣ Hormônios 💪
4️⃣ GH ⚡
5️⃣ Produtos em Promoção 🏷️
6️⃣ Outros 📦
7️⃣ Buscar por Fabricante 🏭
8️⃣ Protocolo / Dúvidas técnicas 🔬
9️⃣ Rastrear meu pedido 📦`;

// Menu principal dinâmico (adiciona promoção relâmpago se houver)
function buildMenuPrincipal(promo) {
  let menu = MENU_PRINCIPAL_BASE;
  if (promo) {
    menu += `

🚨 *${promo.titulo}* — Digite *PROMO*`;
  }
  menu += `

_Digite o número da opção_`;
  return menu;
}

const MENU_PRINCIPAL = MENU_PRINCIPAL_BASE + `

_Digite o número da opção_`;

const MENU_PEPTIDEOS = `*💊 PEPTÍDEOS*

1️⃣ Retatrutida
2️⃣ Tirzepatida
3️⃣ Semaglutida
4️⃣ BPC-157
5️⃣ TB-500
6️⃣ GHK-Cu
7️⃣ Klow
8️⃣ Glow
9️⃣ SS-31
🔟 MOTS-C
11. Ipamorelin
12. CJC-1295
13. PT-141
14. AOD-9604
15. CBL-514
16. Epitalon
17. NAD+
18. Tesamorelin
19. Outros peptídeos

_Digite o número ou *menu* para voltar_`;

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

_Digite o número ou *menu* para voltar_`;

const MENU_FABRICANTES = `*🏭 BUSCAR POR FABRICANTE*

1️⃣ ZPHC
2️⃣ Veltrane
3️⃣ Landerlan
4️⃣ Muscle Labs
5️⃣ Alpha Pharma
6️⃣ XL Peptides
7️⃣ Health Peptides
8️⃣ Alluvi Healthcare
9️⃣ Lipoless
🔟 Cooper Pharma
11. Neuroceptix
12. King Pharma
13. Synedica
14. NeoPeptides
15. Eurogold
16. Novax Pharmaceuticals
17. Bratva Labs
18. Outro fabricante (digitar nome)

_Digite o número ou *menu* para voltar_`;

// ── System prompt exclusivo para protocolos ───────────────────────────────────
const PROTOCOLO_PROMPT = `Você é a Athena, especialista técnica da VitaFlow em peptídeos, hormônios e suplementação avançada.

Seu papel EXCLUSIVO é responder sobre protocolos, dosagens, mecanismos de ação, benefícios e cuidados de uso.

REGRAS:
- Português brasileiro informal e caloroso
- Informações detalhadas e precisas
- Use doses MÍNIMAS eficazes e explique quanto tempo o produto dura com essas doses
- Inclua sempre: "💡 Como qualquer suplemento avançado, o acompanhamento profissional potencializa os resultados."
- Ao final sempre diga: "Para ver produtos disponíveis, *digite menu*"
- NUNCA mencione preços, marcas ou produtos específicos do catálogo
- NUNCA use ## ou ### — use apenas *negrito*`;

// ── Utilitários ───────────────────────────────────────────────────────────────
function norm(s) {
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ç/g,'c').trim();
}

function emojis(i) {
  const e = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  return i < 10 ? e[i] : `${i+1}.`;
}

function formatarLista(linhas) {
  return linhas.map((l, i) => {
    const [nome, preco] = l.split('|');
    return preco
      ? `${emojis(i)} *${nome.trim()}* — R$ ${preco.trim()}`
      : `${emojis(i)} *${nome.trim()}*`;
  }).join('\n');
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

// ── Gera link do recibo ───────────────────────────────────────────────────────
function gerarLinkRecibo(orderNsu, nome, cpf, email, pagto, prod, qtd, precoProd, frete, total) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const params = [];
  params.push('pedido=' + encodeURIComponent(orderNsu));
  if (nome)  params.push('nome='  + encodeURIComponent(nome));
  if (cpf)   params.push('cpf='   + encodeURIComponent(cpf));
  if (email) params.push('email=' + encodeURIComponent(email));
  params.push('data='  + encodeURIComponent(hoje));
  params.push('pagto=' + encodeURIComponent(pagto));
  params.push('total=' + encodeURIComponent(total.toFixed(2)));

  const prods = [{ nome: prod + ' x' + qtd, quantidade: qtd, preco_unit: precoProd }];
  const prodsJson = JSON.stringify(prods);
  // btoa para base64 (Node.js)
  const prodsB64 = Buffer.from(encodeURIComponent(prodsJson)).toString('base64');
  params.push('produtos=' + prodsB64);

  if (frete) {
    params.push('frete=' + encodeURIComponent(frete.label));
    params.push('frete_v=' + encodeURIComponent(frete.valor.toFixed(2)));
  }

  return RECIBO_BASE + '?' + params.join('&');
}

// ── Firebase: sessão ──────────────────────────────────────────────────────────
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
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(sess)
    });
  } catch {}
}

async function deleteSession(sid) {
  try {
    const k = sid.replace(/[^a-zA-Z0-9]/g,'_');
    await fetch(`${FIREBASE_URL}/vitaflow_sessions/${k}.json`, { method:'DELETE' });
  } catch {}
}

// ── Firebase: promoção relâmpago ──────────────────────────────────────────────
async function carregarPromocaoAtiva() {
  try {
    const r = await fetch(`${FIREBASE_URL}/vitaflow_promocoes.json`);
    const data = await r.json();
    if (!data) return null;
    const hoje = new Date().toISOString().slice(0,10);
    const ativas = Object.values(data).filter(p =>
      p && p.ativo && (!p.inicio || p.inicio <= hoje) && (!p.fim || p.fim >= hoje)
    );
    return ativas.length ? ativas[0] : null;
  } catch { return null; }
}

// ── Firebase: cache de coleções ───────────────────────────────────────────────
async function buscarCache(colecao) {
  try {
    const r = await fetch(`${FIREBASE_URL}/vitaflow_cache/colecoes/${colecao}.json`);
    const d = await r.json();
    return d?.dados || '';
  } catch { return ''; }
}

async function buscarTodosCache() {
  const cols = ['peptideos','hormonios','gh','promocoes','outros','10-mais-vendidos'];
  const resultados = await Promise.all(cols.map(c => buscarCache(c)));
  return resultados.join('\n');
}

// ── Serviços externos ─────────────────────────────────────────────────────────
async function enviarTelegram(texto) {
  try {
    await fetch('https://api.telegram.org/bot8689592582:AAEjalaa2hDQxstUVhm45CG4aZd9OiDDRXY/sendMessage', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ chat_id:'8660563352', text: texto })
    });
  } catch {}
}

async function gerarLinkInfinitePay(produto, valor) {
  try {
    const r = await fetch('https://api.checkout.infinitepay.io/links', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        handle: INFINITEPAY_TAG,
        redirect_url: 'https://vitaflowoficial.com/pages/obrigado',
        items: [{ quantity:1, price: Math.round(valor*100), description: produto }]
      })
    });
    const d = await r.json();
    return d?.url || null;
  } catch { return null; }
}

async function gerarNumeroPedido() {
  try {
    const r = await fetch(GAS_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'gerar_numero', tipo:'A' })
    });
    const d = await r.json();
    return d.order_nsu || null;
  } catch { return null; }
}

async function salvarPedidoGAS(pedido) {
  try {
    await fetch(GAS_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(pedido)
    });
  } catch {}
}

// ── Handler principal ─────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'Content-Type',
    'Content-Type':'application/json',
  };

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

    console.log('MSG:', mensagem, '| SID:', sid, '| TYPE:', body.type);

    // ── Atalhos globais ───────────────────────────────────────────────────────
    const saudacoes = ['ola','olá','oi','oii','opa','eai','e ai','bom dia','boa tarde','boa noite','hi','hello','tudo bem','tudo bom'];
    const ehSaudacaoOuMenu = n === 'menu' || n === 'inicio' || n === 'voltar' || n === 'start' || saudacoes.some(s => n === s || n.startsWith(s+' ') || n.startsWith(s+'!'));

    if (ehSaudacaoOuMenu) {
      const promo = await carregarPromocaoAtiva();
      await saveSession(sid, { state:'MENU' });
      return respond(buildMenuPrincipal(promo));
    }

    // ── Atalho para atendente humano (sempre disponível) ──────────────────────
    if (['atendente','humano','vendedor','pessoa real','falar com alguem','falar com pessoa'].some(p => n.includes(p))) {
      await enviarTelegram(`🔔 CLIENTE QUER HUMANO\n📱 ${sid}\n💬 ${mensagem}`);
      await deleteSession(sid);
      return transferir('Vou te transferir para um atendente agora! 😊 Aguarde um momento.');
    }

    const session = await getSession(sid);
    const state = session.state || 'MENU';

    // ═══════════════════════════════════════════════════════════════════════════
    // MENU PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'MENU') {

      if (num === 1) {
        const dados = await buscarCache('10-mais-vendidos');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
        await saveSession(sid, { state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*🔥 MAIS VENDIDOS*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }

      if (num === 2) {
        await saveSession(sid, { state:'PEPTIDEOS' });
        return respond(MENU_PEPTIDEOS);
      }

      if (num === 3) {
        await saveSession(sid, { state:'HORMONIOS' });
        return respond(MENU_HORMONIOS);
      }

      if (num === 4) {
        const dados = await buscarCache('gh');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
        await saveSession(sid, { state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*⚡ GH*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }

      if (num === 5) {
        const dados = await buscarCache('promocoes');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhuma promoção ativa no momento. *Digite menu* para voltar.');
        await saveSession(sid, { state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*🔥 PROMOÇÕES*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }

      if (num === 6) {
        const dados = await buscarCache('outros');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
        await saveSession(sid, { state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*📦 OUTROS*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }

      if (num === 7) {
        await saveSession(sid, { state:'FABRICANTES' });
        return respond(MENU_FABRICANTES);
      }

      if (num === 8) {
        await saveSession(sid, { state:'PROTOCOLO', historico:[] });
        return respond('*🔬 PROTOCOLO / DÚVIDAS TÉCNICAS*\n\nSobre qual produto ou objetivo você tem dúvida?\n\n_Digite *menu* a qualquer momento para voltar_');
      }

      if (num === 9) {
        return respond('*📦 RASTREAR PEDIDO*\n\nNosso setor de logística te atende diretamente!\n\n👉 wa.me/447537155718\n\nInforme: número do pedido, CPF e nome completo. Eles resolvem rapidinho! 💪');
      }

      // Atalho PROMO
      if (n === 'promo' || n === 'promocao' || n.includes('promocao relampago') || n.includes('promoção')) {
        const promo = await carregarPromocaoAtiva();
        if (!promo) return respond('Não há promoção relâmpago ativa no momento. 😊\n\nVeja nossa coleção de promoções permanentes digitando *5*.\n\n_Digite *menu* para voltar_');
        return respond(`🚨 *${promo.titulo}*\n\n${promo.descricao}\n\n_Digite *menu* para ver nossos produtos_`);
      }

      const promo = await carregarPromocaoAtiva();
      return respond('Opção inválida.\n\n' + buildMenuPrincipal(promo));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PEPTÍDEOS
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'PEPTIDEOS') {
      const mapa = {
        1: ['retatrutida'],
        2: ['tirzepatida'],
        3: ['semaglutida'],
        4: ['bpc-157', 'bpc157'],
        5: ['tb-500', 'tb500'],
        6: ['ghk-cu', 'ghkcu'],
        7: ['klow'],
        8: ['glow'],
        9: ['ss-31', 'ss31'],
        10: ['mots-c', 'motsc'],
        11: ['ipamorelin'],
        12: ['cjc-1295', 'cjc1295'],
        13: ['pt-141', 'pt141'],
        14: ['aod-9604', 'aod9604'],
        15: ['cbl-514', 'cbl514'],
        16: ['epitalon'],
        17: ['nad'],
        18: ['tesamorelin'],
      };

      if (mapa[num]) {
        const dados = await buscarCache('peptideos');
        const linhas = filtrarCache(dados, mapa[num]);
        if (!linhas.length) return respond(`Produto não disponível no momento.\n\n${MENU_PEPTIDEOS}`);
        await saveSession(sid, { state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*${mapa[num][0].toUpperCase()}*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }

      if (num === 19) {
        const dados = await buscarCache('peptideos');
        const todosTermos = Object.values(mapa).flat();
        const linhas = dados.split('\n').filter(Boolean).filter(l => {
          const nProd = norm(l.split('|')[0]);
          return !todosTermos.some(t => nProd.includes(norm(t)));
        });
        if (!linhas.length) return respond(`Nenhum outro peptídeo encontrado.\n\n${MENU_PEPTIDEOS}`);
        await saveSession(sid, { state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*OUTROS PEPTÍDEOS*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }

      return respond('Opção inválida.\n\n' + MENU_PEPTIDEOS);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HORMÔNIOS
    // ═══════════════════════════════════════════════════════════════════════════
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

        if (num === 2) {
          linhas = linhas.filter(l => !norm(l).includes('enantato'));
        }

        if (!linhas.length) return respond(`Produto não disponível no momento.\n\n${MENU_HORMONIOS}`);
        await saveSession(sid, { state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*${label}*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }

      if (num === 17) {
        const dados = await buscarCache('hormonios');
        const todosTermos = Object.values(mapa).flatMap(m => m.termos);
        const linhas = dados.split('\n').filter(Boolean).filter(l => {
          const nProd = norm(l.split('|')[0]);
          return !todosTermos.some(t => nProd.includes(norm(t)));
        });
        if (!linhas.length) return respond(`Nenhum outro hormônio encontrado.\n\n${MENU_HORMONIOS}`);
        await saveSession(sid, { state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*OUTROS HORMÔNIOS*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }

      return respond('Opção inválida.\n\n' + MENU_HORMONIOS);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FABRICANTES
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'FABRICANTES') {
      const fabMap = {
        1:'zphc', 2:'veltrane', 3:'landerlan', 4:'muscle labs', 5:'alpha pharma',
        6:'xl peptides', 7:'health peptides', 8:'alluvi', 9:'lipoless',
        10:'cooper pharma', 11:'neuroceptix', 12:'king pharma', 13:'synedica',
        14:'neopeptides', 15:'eurogold', 16:'novax', 17:'bratva',
      };

      if (fabMap[num]) {
        const tudo = await buscarTodosCache();
        const linhas = filtrarCache(tudo, fabMap[num]);
        const unicas = [...new Set(linhas)];
        if (!unicas.length) return respond(`Nenhum produto de *${fabMap[num]}* disponível.\n\n${MENU_FABRICANTES}`);
        await saveSession(sid, { state:'LISTA_PRODUTOS', produtoLista: parseProdutos(unicas) });
        return respond(`*${fabMap[num].toUpperCase()}*\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*`);
      }

      if (num === 18) {
        await saveSession(sid, { state:'BUSCA_LIVRE' });
        return respond('Digite o nome do fabricante que procura:');
      }

      return respond('Opção inválida.\n\n' + MENU_FABRICANTES);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BUSCA LIVRE (fabricante digitado)
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'BUSCA_LIVRE') {
      if (!mensagem || mensagem.length < 2) return respond('Por favor, digite o nome do fabricante:');
      const tudo = await buscarTodosCache();
      const linhas = filtrarCache(tudo, mensagem);
      const unicas = [...new Set(linhas)];
      if (!unicas.length) return respond(`Nenhum produto de *${mensagem}* encontrado.\n\n${MENU_FABRICANTES}`);
      await saveSession(sid, { state:'LISTA_PRODUTOS', produtoLista: parseProdutos(unicas) });
      return respond(`*${mensagem.toUpperCase()}*\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LISTA DE PRODUTOS (seleção)
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'LISTA_PRODUTOS') {
      const lista = session.produtoLista || [];
      if (!num || num < 1 || num > lista.length) {
        return respond(`Digite um número entre 1 e ${lista.length}.\n\nOu *menu* para voltar.`);
      }
      const prod = lista[num - 1];
      await saveSession(sid, { ...session, state:'QUANTIDADE', produtoSelecionado: prod });
      return respond(`Você escolheu:\n📦 *${prod.nome}*\n💰 R$ ${prod.preco.toFixed(2).replace('.',',')}\n\n*Quantas unidades deseja?*\n_(Digite o número)_`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // QUANTIDADE
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'QUANTIDADE') {
      if (!num || num < 1 || num > 99) return respond('Por favor, informe uma quantidade válida (1 a 99):');
      await saveSession(sid, { ...session, state:'ESTADO', quantidade: num });
      return respond(`*De qual estado você é?*\nExemplo: RJ, SP, MG, DF, BA...`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ESTADO (para calcular frete)
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'ESTADO') {
      const uf = mensagem.trim().toUpperCase().replace(/[^A-Z]/g,'').slice(0,2);
      const opts = getFreteOpcoes(uf);
      if (!opts) return respond(`Estado *${uf || mensagem}* não reconhecido.\nDigite a sigla do seu estado (ex: RJ, SP, MG):`);
      const freteStr = opts.map((o, i) => `${emojis(i)} *${o.label}* — R$ ${o.valor.toFixed(2).replace('.',',')}`).join('\n');
      await saveSession(sid, { ...session, state:'FRETE', estadoCliente: uf, freteOpcoes: opts });
      return respond(`*Opções de frete para ${uf}:*\n\n${freteStr}\n\n💡 Recomendamos a *Transportadora* — inclui seguro grátis contra apreensão e extravio.\n\n*Digite o número:*`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FRETE (seleção de modalidade)
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'FRETE') {
      const opts = session.freteOpcoes || [];
      if (!num || num < 1 || num > opts.length) return respond(`Digite 1, 2 ou 3 para escolher o frete:`);
      const frete = opts[num - 1];
      const prod  = session.produtoSelecionado || {};
      const qtd   = session.quantidade || 1;
      const totalProd = prod.preco * qtd;
      const total     = totalProd + frete.valor;

      const resumo =
        `*📋 RESUMO DO PEDIDO*\n\n` +
        `📦 *${prod.nome}*\n` +
        `    ${qtd}x — R$ ${prod.preco.toFixed(2).replace('.',',')} un.\n` +
        `    Subtotal: R$ ${totalProd.toFixed(2).replace('.',',')}\n\n` +
        `🚚 Frete *${frete.label}* — ${session.estadoCliente}: R$ ${frete.valor.toFixed(2).replace('.',',')}\n\n` +
        `💰 *Total: R$ ${total.toFixed(2).replace('.',',')}*\n\n` +
        `*Confirma?*\n1️⃣ Sim, quero comprar!\n2️⃣ Não, voltar ao menu`;

      await saveSession(sid, { ...session, state:'CONFIRMAR', freteSelecionado: frete, totalProd, total });
      return respond(resumo);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIRMAR PEDIDO
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'CONFIRMAR') {
      if (num === 2) {
        await saveSession(sid, { state:'MENU' });
        return respond('Tudo bem! Quando quiser, estou aqui. 😊\n\n' + MENU_PRINCIPAL);
      }
      if (num === 1) {
        const prod  = session.produtoSelecionado || {};
        const qtd   = session.quantidade || 1;
        const frete = session.freteSelecionado || {};
        const uf    = session.estadoCliente || '';

        const promo = await carregarPromocaoAtiva();
        let totalFinal = session.total;
        let infoDesconto = '';
        if (promo && promo.desconto_pct) {
          const descPct = parseFloat(promo.desconto_pct);
          const descValor = session.totalProd * (descPct / 100);
          totalFinal = session.totalProd - descValor + frete.valor;
          infoDesconto = `\n🔥 *${promo.titulo}* (-${descPct}%): -R$ ${descValor.toFixed(2).replace('.',',')}\n💰 *Total com desconto: R$ ${totalFinal.toFixed(2).replace('.',',')}*`;
        }

        const desc  = `${prod.nome} x${qtd} + Frete ${frete.label} — ${uf}`;
        const link  = await gerarLinkInfinitePay(desc, totalFinal);

        try {
          const pKey = `pending_${sid.replace(/[^a-zA-Z0-9]/g,'_')}`;
          await fetch(`${FIREBASE_URL}/vitaflow_pending_orders/${pKey}.json`, {
            method:'PUT', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ phone:sid, produto:desc, valor:session.total, ts:Date.now() })
          });
        } catch {}

        await saveSession(sid, { ...session, state:'AGUARDAR_COMPROVANTE', total: totalFinal });
        return respond(link
          ? `✅ *Pedido gerado!*${infoDesconto}\n\n💳 *Link de pagamento:*\n${link}\n\n📸 Após pagar, me envie o comprovante!\n_(print ou foto)_`
          : `Acesse vitaflowoficial.com para finalizar seu pedido.`
        );
      }
      return respond('Digite *1* para confirmar ou *2* para voltar ao menu:');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // AGUARDAR COMPROVANTE
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'AGUARDAR_COMPROVANTE') {
      const palavrasPag = ['paguei','pix feito','fiz o pix','transferi','pago','pix realizado','comprovante','ja paguei','ja transferi'];
      const ehPagamento = ehMidia || palavrasPag.some(p => n.includes(p));
      if (ehPagamento) {
        await saveSession(sid, { ...session, state:'COLETA_DADOS', coleta:{} });
        return respond(
          `✅ *Pagamento recebido! Obrigado!* 🎉\n\n` +
          `Agora preciso dos seus dados para o envio.\n` +
          `*Envie tudo de uma vez neste formato:*\n\n` +
          `Nome: \nCPF: \nTelefone: \nEmail: \nRua e número: \nComplemento: \nBairro: \nCidade: \nEstado: \nCEP: `
        );
      }
      return respond(`Aguardando seu comprovante de pagamento! 📸\n\nEnvie o print ou foto após pagar.`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COLETA DE DADOS
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'COLETA_DADOS') {
      const linhas = mensagem.split('\n').map(l => l.trim()).filter(Boolean);
      const dados  = {};
      linhas.forEach(l => {
        const nl = norm(l);
        const val = l.split(':').slice(1).join(':').trim();
        if (!val) return;
        if (nl.startsWith('nome'))        dados.nome        = val;
        else if (nl.startsWith('cpf'))    dados.cpf         = val;
        else if (nl.startsWith('tel'))    dados.telefone    = val;
        else if (nl.startsWith('email') || nl.startsWith('e-mail')) dados.email = val;
        else if (nl.startsWith('rua') || nl.startsWith('endereco') || nl.startsWith('end')) dados.endereco = val;
        else if (nl.startsWith('comp'))   dados.complemento = val;
        else if (nl.startsWith('bairro')) dados.bairro      = val;
        else if (nl.startsWith('cidade')) dados.cidade      = val;
        else if (nl.startsWith('estado') || nl.startsWith('uf')) dados.estado = val;
        else if (nl.startsWith('cep'))    dados.cep         = val;
      });

      const coleta = { ...(session.coleta||{}), ...dados };
      const obrigatorios = ['nome','cpf','telefone','endereco','bairro','cidade','estado','cep'];
      const faltam = obrigatorios.filter(c => !coleta[c] || coleta[c].length < 2);

      if (faltam.length > 0) {
        await saveSession(sid, { ...session, coleta });
        const nomesCampos = { nome:'Nome completo', cpf:'CPF', telefone:'Telefone', email:'E-mail', endereco:'Rua e número', bairro:'Bairro', cidade:'Cidade', estado:'Estado', cep:'CEP' };
        return respond(`Faltam alguns dados:\n${faltam.map(f => '• '+nomesCampos[f]).join('\n')}\n\nPor favor, informe:`);
      }

      // Todos os dados coletados → salvar pedido
      const prod     = session.produtoSelecionado || {};
      const qtd      = session.quantidade || 1;
      const frete    = session.freteSelecionado || {};
      const total    = session.total || 0;
      const num_pedido = await gerarNumeroPedido();

      if (num_pedido) {
        await salvarPedidoGAS({
          order_nsu: num_pedido,
          paid_amount: Math.round(total * 100),
          capture_method: 'whatsapp_athena',
          customer: { name: coleta.nome, email: (coleta.email||'nao_informado').toLowerCase(), phone_number: coleta.telefone, document: coleta.cpf },
          address: { street: coleta.endereco, number: '', complement: coleta.complemento||'', neighborhood: coleta.bairro, city: coleta.cidade, state: coleta.estado, cep: coleta.cep },
          items: [
            { description: `${prod.nome} x${qtd}`, quantity: qtd,  price: Math.round(prod.preco * 100) },
            { description: `Frete ${frete.label} — ${session.estadoCliente}`, quantity: 1, price: Math.round(frete.valor * 100) }
          ]
        });
        await enviarTelegram(
          `🤖 *VENDA ATHENA!*\n\n📦 ${num_pedido}\n👤 ${coleta.nome}\n🪪 ${coleta.cpf}\n📱 ${coleta.telefone}\n📧 ${coleta.email||'—'}\n🏠 ${coleta.endereco}${coleta.complemento?', '+coleta.complemento:''}, ${coleta.bairro}, ${coleta.cidade}-${coleta.estado}, ${coleta.cep}\n🛒 ${prod.nome} x${qtd}\n🚚 ${frete.label} ${session.estadoCliente}\n💰 R$ ${total.toFixed(2)}\n📱 ${sid}`
        );
      }

      // ── Gera link do recibo ───────────────────────────────────────────────
      const linkRecibo = gerarLinkRecibo(
        num_pedido || 'VF-A',
        coleta.nome,
        coleta.cpf,
        coleta.email || '',
        'WhatsApp / Athena',
        prod.nome,
        qtd,
        prod.preco,
        frete,
        total
      );

      // ── Mensagem 1: confirmação + recibo + rastreamento ───────────────────
      const primeiroNome = (coleta.nome || '').split(' ')[0];
      const msg1 =
        `✅ *Pedido ${num_pedido||''} confirmado!*\n\n` +
        `Olá, *${primeiroNome}*! Obrigada pela confiança na VitaFlow! 🧡\n\n` +
        `📦 *${prod.nome}* x${qtd}\n` +
        `🚚 ${frete.label} — ${session.estadoCliente}\n` +
        `💰 R$ ${total.toFixed(2).replace('.',',')}\n\n` +
        `🧾 *Seu recibo:*\n${linkRecibo}\n\n` +
        `🔍 *Rastreie seu pedido em tempo real:*\nvitaflowoficial.com/pages/rastrear-pedido\n\n` +
        `Use qualquer uma dessas informações para rastrear:\n` +
        `• *Número do pedido:* ${num_pedido||''}\n` +
        (coleta.cpf ? `• *CPF:* ${coleta.cpf}\n` : '') +
        (coleta.email ? `• *E-mail:* ${coleta.email}\n` : '');

      // ── Mensagem 2: aviso de filmar a abertura ────────────────────────────
      const msg2 =
        `⚠️ *AVISO IMPORTANTE — VITAFLOW* ⚠️\n\n` +
        `Antes de receber seu pedido, leia com atenção. Essas instruções são essenciais para te ajudarmos em qualquer situação. 🙏\n\n` +
        `📹 *1. FILME A ABERTURA DA EMBALAGEM*\n` +
        `Ao receber, grave um vídeo contínuo e sem cortes — desde a embalagem fechada até retirar todos os itens.\n\n` +
        `✅ Mostre a caixa fechada antes de abrir\n` +
        `✅ Não pause nem corte o vídeo\n` +
        `✅ Filme todos os produtos ao retirar da caixa\n\n` +
        `❗ Sem o vídeo não conseguimos abrir reclamação junto à transportadora.\n\n` +
        `📍 *2. ENDEREÇO E ALGUÉM PARA RECEBER*\n` +
        `Deve haver uma pessoa disponível para receber pessoalmente. Não solicite deixar o pacote sem ninguém.\n\n` +
        `💬 Qualquer problema, fale com a gente pelo WhatsApp imediatamente e envie o vídeo da abertura.\n\n` +
        `— *Equipe VitaFlow* 🧡`;

      await deleteSession(sid);
      return respond(msg1, msg2);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROTOCOLO (única parte com IA)
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'PROTOCOLO') {
      const hist = (session.historico || []).slice(-8);
      hist.push({ role:'user', content: mensagem });
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' },
          body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1500, system: PROTOCOLO_PROMPT, messages: hist })
        });
        const d = await r.json();
        if (d.error || !d.content) throw new Error('Claude error');
        const reply = d.content[0].text || '';
        hist.push({ role:'assistant', content: reply });
        await saveSession(sid, { state:'PROTOCOLO', historico: hist });
        return respond(reply);
      } catch(e) {
        console.error('PROTOCOLO ERRO:', e.message);
        await saveSession(sid, { state:'PROTOCOLO', historico: hist });
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
