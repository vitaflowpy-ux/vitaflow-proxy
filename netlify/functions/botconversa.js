// botconversa.js — VitaFlow Athena v4 — Arquitetura menu-driven com máquina de estados

const INFINITEPAY_TAG = 'vitaflowoficial';
const FIREBASE_URL    = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const GAS_URL         = 'https://script.google.com/macros/s/AKfycbxFlaN0FXFbpcC8HZ80sxnq383m5d-xTaj5cg72VcCdnYx47N_qKkiELFN5KAPmm_nb/exec';
const RECIBO_BASE     = 'https://melodious-pony-e4f4f5.netlify.app/recibo-auto.html';

// ── Atacado ───────────────────────────────────────────────────────────────────
const TABELA_ATACADO_URL = 'https://drive.google.com/file/d/1olhYj0OW1cL0Wk0kk6-fct89EJff_1Ip/view';
const WHATSAPP_ATACADO_1 = 'wa.me/5521998018028';
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

🚨 *${promo.titulo}*
🔥 ${promo.desconto_pct ? promo.desconto_pct + '% de desconto aplicado automaticamente no link de pagamento — sem cupom, sem complicação!' : promo.descricao || ''}
👉 Digite *PROMO* para saber mais ou escolha um produto abaixo e o desconto já vem incluído!`;
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

// ── Carrinho: helpers ─────────────────────────────────────────────────────────
function totalCarrinho(carrinho) {
  return (carrinho || []).reduce((acc, item) => acc + (item.preco * item.qtd), 0);
}

function resumoCarrinho(carrinho) {
  return (carrinho || []).map(item =>
    `📦 *${item.nome}*\n    ${item.qtd}x — R$ ${item.preco.toFixed(2).replace('.',',')} un. = R$ ${(item.preco*item.qtd).toFixed(2).replace('.',',')}`
  ).join('\n');
}

// ── Gera link do recibo (carrinho com múltiplos itens) ─────────────────────────
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

  const prods = (carrinho || []).map(item => ({
    nome: item.nome + ' x' + item.qtd, quantidade: item.qtd, preco_unit: item.preco
  }));
  const prodsJson = JSON.stringify(prods);
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

async function gerarLinkInfinitePay(carrinho, valorFrete, orderNsu, descontoPct) {
  try {
    const items = (carrinho || []).map(item => {
      let precoUnit = item.preco;
      if (descontoPct) precoUnit = item.preco * (1 - descontoPct/100);
      return { quantity: item.qtd, price: Math.round(precoUnit*100), description: 'Suplemento Alimentar' };
    });
    if (valorFrete && valorFrete > 0) {
      items.push({ quantity:1, price: Math.round(valorFrete*100), description: 'Frete' });
    }
    const payload = {
      handle: INFINITEPAY_TAG,
      redirect_url: 'https://vitaflowoficial.com/pages/obrigado',
      webhook_url: GAS_URL,
      items
    };
    if (orderNsu) payload.order_nsu = orderNsu;

    const r = await fetch('https://api.checkout.infinitepay.io/links', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
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

// ── Extração de dados do cliente via IA (igual ao Importar IA do Radar) ────────
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
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:600, messages:[{ role:'user', content: prompt }] })
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
  } catch(e) {
    console.error('EXTRAIR IA ERRO:', e.message);
    return null;
  }
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

    console.log('MSG:', mensagem, '| SID:', sid, '| TYPE:', body.type, '| BODY_KEYS:', Object.keys(body).join(','));
    if (body.type || body.mediaUrl || body.media_url || body.url || body.fileUrl) console.log('MIDIA DETECTADA:', JSON.stringify(body));

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

    // ── Atalho global: ATACADO ────────────────────────────────────────────────
    const ehAtacado = ["atacado","revenda","revender","mayoreo","por atacado","compra grande","grande quantidade","tabela de atacado"].some(p => n.includes(p));
    if (ehAtacado && !["AGUARDAR_COMPROVANTE","COLETA_DADOS"].includes(state)) {
      await saveSession(sid, { ...session, state:'ATACADO' });
      return respond(MSG_ATACADO);
    }

    // ── Atalho global: PRAZO de entrega ───────────────────────────────────────
    // (prazo é pergunta informativa — separado do cálculo de frete e da venda)
    const ehPerguntaPrazo = ["prazo","quanto tempo","quantos dias","demora","chega em","tempo de entrega","prazo de entrega","prazo de postagem"].some(p => n.includes(p));
    if (ehPerguntaPrazo && !["ESTADO","FRETE","AGUARDAR_COMPROVANTE","COLETA_DADOS","CARRINHO","ATACADO","PRAZO_TIPO"].includes(state)) {
      // Se já mencionou atacado na mesma frase, manda pro fluxo de atacado
      if (ehAtacado) {
        await saveSession(sid, { ...session, state:'ATACADO' });
        return respond(MSG_ATACADO);
      }
      // Senão, pergunta se é varejo ou atacado
      await saveSession(sid, { ...session, state:'PRAZO_TIPO' });
      return respond(MSG_PERGUNTA_TIPO_PRAZO);
    }

    // ── Atalho global para frete (cálculo de valor) ───────────────────────────
    // Opção B: mostra o frete e oferece escolher produto — NUNCA gera pedido vazio
    const ehPerguntaFrete = ["frete","transportadora","pac","sedex","valor do envio","custo do envio","quanto e o frete","quanto fica o frete"].some(p => n.includes(p));
    if (ehPerguntaFrete && !["ESTADO","FRETE","AGUARDAR_COMPROVANTE","COLETA_DADOS","CARRINHO","ATACADO","PRAZO_TIPO","FRETE_AVULSO"].includes(state)) {
      await saveSession(sid, { ...session, state:"FRETE_AVULSO" });
      return respond("🚚 *Consultar frete*\n\nMe diz o seu estado (sigla) que eu calculo na hora!\nExemplo: RJ, SP, MG, DF, BA...");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ATACADO (resposta ao redirecionamento)
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'ATACADO') {
      if (num === 1) {
        await enviarTelegram(`🏭 CLIENTE QUER ATACADO\n📱 ${sid}\n💬 Redirecionado para consultores de atacado`);
        await saveSession(sid, { state:'MENU' });
        return respond(MSG_ATACADO_CONTATOS);
      }
      if (num === 2) {
        await saveSession(sid, { state:'MENU' });
        return respond('Sem problema! 😊\n\n' + MENU_PRINCIPAL);
      }
      return respond('Digite *1* para falar com um consultor de atacado ou *2* para voltar ao menu:');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRAZO_TIPO (cliente escolhe varejo ou atacado)
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'PRAZO_TIPO') {
      if (num === 1) {
        await saveSession(sid, { state:'MENU' });
        return respond(MSG_PRAZO_VAREJO + '\n\n_Digite *menu* para ver nossos produtos._');
      }
      if (num === 2) {
        await saveSession(sid, { ...session, state:'ATACADO' });
        return respond(MSG_ATACADO);
      }
      return respond('Digite *1* para compra normal (varejo) ou *2* para atacado:');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FRETE_AVULSO (consulta de frete sem produto — Opção B)
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'FRETE_AVULSO') {
      const uf = mensagem.trim().toUpperCase().replace(/[^A-Z]/g,'').slice(0,2);
      const opts = getFreteOpcoes(uf);
      if (!opts) return respond(`Estado *${uf || mensagem}* não reconhecido.\nDigite a sigla do seu estado (ex: RJ, SP, MG):`);
      const freteStr = opts.map((o) => `• *${o.label}* — R$ ${o.valor.toFixed(2).replace('.',',')}`).join('\n');
      await saveSession(sid, { state:'MENU' });
      return respond(
        `🚚 *Opções de frete para ${uf}:*\n\n${freteStr}\n\n` +
        `💡 Recomendamos a *Transportadora* — inclui seguro grátis contra apreensão e extravio.\n\n` +
        `Quer escolher um produto para comprar? É só digitar *menu* e navegar pelas categorias! 😊`
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MENU PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'MENU') {

      if (num === 1) {
        const dados = await buscarCache('10-mais-vendidos');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*🔥 MAIS VENDIDOS*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }

      if (num === 2) {
        await saveSession(sid, { ...session, state:'PEPTIDEOS' });
        return respond(MENU_PEPTIDEOS);
      }

      if (num === 3) {
        await saveSession(sid, { ...session, state:'HORMONIOS' });
        return respond(MENU_HORMONIOS);
      }

      if (num === 4) {
        const dados = await buscarCache('gh');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*⚡ GH*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }

      if (num === 5) {
        const dados = await buscarCache('promocoes');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhuma promoção ativa no momento. *Digite menu* para voltar.');
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*🔥 PROMOÇÕES*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }

      if (num === 6) {
        const dados = await buscarCache('outros');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
        return respond(`*📦 OUTROS*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*`);
      }

      if (num === 7) {
        await saveSession(sid, { ...session, state:'FABRICANTES' });
        return respond(MENU_FABRICANTES);
      }

      if (num === 8) {
        await saveSession(sid, { ...session, state:'PROTOCOLO', historico:[] });
        return respond('*🔬 PROTOCOLO / DÚVIDAS TÉCNICAS*\n\nSobre qual produto ou objetivo você tem dúvida?\n\n_Digite *menu* a qualquer momento para voltar_');
      }

      if (num === 9) {
        return respond('*📦 RASTREAR PEDIDO*\n\nNosso setor de logística te atende diretamente!\n\n👉 wa.me/447537155718\n\nInforme: número do pedido, CPF e nome completo. Eles resolvem rapidinho! 💪');
      }

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
        1: ['retatrutida'], 2: ['tirzepatida'], 3: ['semaglutida'],
        4: ['bpc-157', 'bpc157'], 5: ['tb-500', 'tb500'], 6: ['ghk-cu', 'ghkcu'],
        7: ['klow'], 8: ['glow'], 9: ['ss-31', 'ss31'], 10: ['mots-c', 'motsc'],
        11: ['ipamorelin'], 12: ['cjc-1295', 'cjc1295'], 13: ['pt-141', 'pt141'],
        14: ['aod-9604', 'aod9604'], 15: ['cbl-514', 'cbl514'], 16: ['epitalon'],
        17: ['nad'], 18: ['tesamorelin'],
      };

      if (mapa[num]) {
        const dados = await buscarCache('peptideos');
        const linhas = filtrarCache(dados, mapa[num]);
        if (!linhas.length) return respond(`Produto não disponível no momento.\n\n${MENU_PEPTIDEOS}`);
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
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
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
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
        if (num === 2) linhas = linhas.filter(l => !norm(l).includes('enantato'));
        if (!linhas.length) return respond(`Produto não disponível no momento.\n\n${MENU_HORMONIOS}`);
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
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
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(linhas) });
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
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(unicas) });
        return respond(`*${fabMap[num].toUpperCase()}*\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*`);
      }

      if (num === 18) {
        await saveSession(sid, { ...session, state:'BUSCA_LIVRE' });
        return respond('Digite o nome do fabricante que procura:');
      }

      return respond('Opção inválida.\n\n' + MENU_FABRICANTES);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BUSCA LIVRE
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'BUSCA_LIVRE') {
      if (!mensagem || mensagem.length < 2) return respond('Por favor, digite o nome do fabricante:');
      const tudo = await buscarTodosCache();
      const linhas = filtrarCache(tudo, mensagem);
      const unicas = [...new Set(linhas)];
      if (!unicas.length) return respond(`Nenhum produto de *${mensagem}* encontrado.\n\n${MENU_FABRICANTES}`);
      await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', produtoLista: parseProdutos(unicas) });
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
    // QUANTIDADE → adiciona ao carrinho
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'QUANTIDADE') {
      if (!num || num < 1 || num > 99) return respond('Por favor, informe uma quantidade válida (1 a 99):');
      const prod = session.produtoSelecionado || {};
      const carrinho = session.carrinho || [];
      carrinho.push({ nome: prod.nome, preco: prod.preco, qtd: num });

      const subtotal = totalCarrinho(carrinho);
      await saveSession(sid, { ...session, state:'CARRINHO', carrinho });
      return respond(
        `✅ Adicionado ao carrinho:\n📦 *${prod.nome}* x${num}\n\n` +
        `🛒 *Seu carrinho* (${carrinho.length} ${carrinho.length>1?'itens':'item'}):\n` +
        `${resumoCarrinho(carrinho)}\n\n` +
        `💰 *Subtotal: R$ ${subtotal.toFixed(2).replace('.',',')}*\n_(frete calculado no fechamento)_\n\n` +
        `*O que deseja fazer?*\n1️⃣ Adicionar mais produtos\n2️⃣ Finalizar compra`
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CARRINHO (adicionar mais ou finalizar)
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'CARRINHO') {
      if (num === 1) {
        // Volta ao menu principal para escolher mais produtos (mantém o carrinho)
        const promo = await carregarPromocaoAtiva();
        await saveSession(sid, { ...session, state:'MENU' });
        return respond('🛒 Seu carrinho está guardado! Escolha mais produtos:\n\n' + buildMenuPrincipal(promo));
      }
      if (num === 2) {
        await saveSession(sid, { ...session, state:'ESTADO' });
        return respond(`*De qual estado você é?*\nExemplo: RJ, SP, MG, DF, BA...`);
      }
      return respond('Digite *1* para adicionar mais produtos ou *2* para finalizar a compra:');
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
      const carrinho = session.carrinho || [];
      // Trava: nunca prosseguir com carrinho vazio
      if (!carrinho.length) {
        await saveSession(sid, { state:'MENU' });
        return respond('Seu carrinho está vazio! 🛒\n\nEscolha um produto primeiro:\n\n' + MENU_PRINCIPAL);
      }
      const totalProd = totalCarrinho(carrinho);
      const total     = totalProd + frete.valor;

      const promoResumo = await carregarPromocaoAtiva();
      let totalComDesconto = total;
      let linhaDesconto = '';
      if (promoResumo && promoResumo.desconto_pct) {
        const descPct = parseFloat(promoResumo.desconto_pct);
        const descValor = totalProd * (descPct / 100);
        totalComDesconto = totalProd - descValor + frete.valor;
        linhaDesconto = `\n🔥 *${promoResumo.titulo}* (-${descPct}%): -R$ ${descValor.toFixed(2).replace('.',',')}`;
      }

      const resumo =
        `*📋 RESUMO DO PEDIDO*\n\n` +
        `${resumoCarrinho(carrinho)}\n\n` +
        `    Subtotal: R$ ${totalProd.toFixed(2).replace('.',',')}\n\n` +
        `🚚 Frete *${frete.label}* — ${session.estadoCliente}: R$ ${frete.valor.toFixed(2).replace('.',',')}` +
        linhaDesconto +
        `\n\n💰 *Total: R$ ${totalComDesconto.toFixed(2).replace('.',',')}*\n\n` +
        `*Confirma?*\n1️⃣ Sim, quero comprar!\n2️⃣ Não, voltar ao menu`;

      await saveSession(sid, { ...session, state:'CONFIRMAR', freteSelecionado: frete, totalProd, total: totalComDesconto });
      return respond(resumo);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIRMAR PEDIDO
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'CONFIRMAR') {
      if (num === 2) {
        await deleteSession(sid);
        return respond('Tudo bem! Quando quiser, estou aqui. 😊\n\n' + MENU_PRINCIPAL);
      }
      if (num === 1) {
        const carrinho = session.carrinho || [];
        // Trava: nunca gerar pedido com carrinho vazio
        if (!carrinho.length) {
          await saveSession(sid, { state:'MENU' });
          return respond('Seu carrinho está vazio! 🛒\n\nEscolha um produto primeiro:\n\n' + MENU_PRINCIPAL);
        }
        const frete = session.freteSelecionado || {};
        const uf    = session.estadoCliente || '';

        const promo = await carregarPromocaoAtiva();
        const descPct = (promo && promo.desconto_pct) ? parseFloat(promo.desconto_pct) : 0;
        let totalProdFinal = session.totalProd;
        let totalFinal = session.total;
        let infoDesconto = '';
        if (descPct) {
          const descValor = session.totalProd * (descPct / 100);
          totalProdFinal = session.totalProd - descValor;
          totalFinal = totalProdFinal + frete.valor;
          infoDesconto = `\n🔥 *${promo.titulo}* (-${descPct}%): -R$ ${descValor.toFixed(2).replace('.',',')}\n💰 *Total com desconto: R$ ${totalFinal.toFixed(2).replace('.',',')}*`;
        }

        const orderNsu = await gerarNumeroPedido();
        const link = await gerarLinkInfinitePay(carrinho, frete.valor, orderNsu, descPct);

        // Salva pedido pendente no Firebase
        try {
          const pKey = `pending_${sid.replace(/[^a-zA-Z0-9]/g,'_')}`;
          await fetch(`${FIREBASE_URL}/vitaflow_pending_orders/${pKey}.json`, {
            method:'PUT', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              phone: sid, order_nsu: orderNsu,
              produto: carrinho.map(i => `${i.nome} x${i.qtd}`).join(' | '),
              quantidade: carrinho.reduce((a,i)=>a+i.qtd,0),
              frete: frete.label, estado: uf, valor: totalFinal, ts: Date.now()
            })
          });
        } catch {}

        const itensTxt = carrinho.map(i => `🛒 ${i.nome} x${i.qtd}`).join('\n');
        await enviarTelegram(
          `🟡 *PEDIDO EM ABERTO (Athena)*\n\n` +
          `📦 ${orderNsu || '—'}\n${itensTxt}\n` +
          `🚚 ${frete.label} — ${uf}\n` +
          `💰 R$ ${totalFinal.toFixed(2).replace('.',',')}\n` +
          `📱 ${sid}\n\n` +
          `⏳ Link gerado. Aguardando pagamento/confirmação do cliente.`
        );

        try {
          await fetch(GAS_URL, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              action: 'alerta_pedido_aberto', order_nsu: orderNsu,
              produto: carrinho.map(i => `${i.nome} x${i.qtd}`).join(' | '),
              quantidade: carrinho.reduce((a,i)=>a+i.qtd,0),
              frete: frete.label, estado: uf,
              valor: totalFinal.toFixed(2).replace('.',','), phone: sid
            })
          });
        } catch {}

        await saveSession(sid, { ...session, state:'AGUARDAR_COMPROVANTE', total: totalFinal, orderNsu });
        return respond(link
          ? `✅ *Pedido gerado!*${infoDesconto}\n\n💳 *Link de pagamento:*\n${link}\n\n📸 Após pagar:\n1️⃣ Envie o print ou foto do comprovante\n2️⃣ Digite *SIM* para eu confirmar seu pedido!`
          : `Acesse vitaflowoficial.com para finalizar seu pedido.`
        );
      }
      return respond('Digite *1* para confirmar ou *2* para voltar ao menu:');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // AGUARDAR COMPROVANTE
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'AGUARDAR_COMPROVANTE') {
      const palavrasPag = ['paguei','pix feito','fiz o pix','transferi','pago','pix realizado','comprovante','ja paguei','ja transferi','sim','yes','fiz','realizei','confirmado','feito','ok','okay'];
      const ehMidiaBC = !!(body.type || body.mediaUrl || body.media_url || body.fileUrl || body.url || body.arquivo || body.file || body.caption !== undefined);
      const ehUrlImagem = !!(mensagem && mensagem.match(/https?:\/\/[^\s]+(jpg|jpeg|png|gif|pdf|mp4|webp|ogg|opus)/i));
      const ehPagamento = ehMidiaBC || ehUrlImagem || palavrasPag.some(p => n.includes(p));
      if (ehPagamento) {
        await saveSession(sid, { ...session, state:'COLETA_DADOS', coleta:{} });
        return respond(
          `✅ *Pagamento recebido! Obrigado!* 🎉\n\n` +
          `Agora preciso dos seus dados para o envio.\n` +
          `*Envie tudo de uma vez neste formato:*\n\n` +
          `Nome: \nCPF: \nTelefone: \nEmail: \nRua e número: \nComplemento: \nBairro: \nCidade: \nEstado: \nCEP: `
        );
      }
      const carrinhoPend = session.carrinho || [];
      const totalPend = session.total || 0;
      return respond(
        `⏳ Você ainda tem um pedido em aberto!\n\n` +
        `${resumoCarrinho(carrinhoPend)}\n` +
        `💰 *R$ ${totalPend.toFixed(2).replace(".",",")}*\n\n` +
        `Seu link de pagamento ainda está ativo! Após pagar:\n1️⃣ Envie o print ou foto do comprovante\n2️⃣ Digite *SIM* para eu liberar o envio! 🚀\n\n` +
        `Se quiser cancelar e começar do zero, digite *menu*. 😊`
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COLETA DE DADOS
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'COLETA_DADOS') {
      const dados = await extrairDadosIA(mensagem) || {};
      const coleta = { ...(session.coleta||{}), ...dados };
      const obrigatorios = ['nome','cpf','telefone','endereco','bairro','cidade','estado','cep'];
      const faltam = obrigatorios.filter(c => !coleta[c] || coleta[c].length < 2);

      if (faltam.length > 0) {
        await saveSession(sid, { ...session, coleta });
        const nomesCampos = { nome:'Nome completo', cpf:'CPF', telefone:'Telefone', email:'E-mail', endereco:'Rua e número', bairro:'Bairro', cidade:'Cidade', estado:'Estado', cep:'CEP' };
        return respond(`Faltam alguns dados:\n${faltam.map(f => '• '+nomesCampos[f]).join('\n')}\n\nPor favor, me envie esses dados que faltam. 😊`);
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
        `🧾 *Seu recibo:*\n${linkRecibo}\n\n` +
        `🔍 *Rastreie seu pedido em tempo real:*\nvitaflowoficial.com/pages/rastrear-pedido\n\n` +
        `Use qualquer uma dessas informações para rastrear:\n` +
        `• *Número do pedido:* ${num_pedido||''}\n` +
        (coleta.cpf ? `• *CPF:* ${coleta.cpf}\n` : '') +
        (coleta.email ? `• *E-mail:* ${coleta.email}\n` : '');

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
          body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1500, system: PROTOCOLO_PROMPT, messages: hist })
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
            const promo = await carregarPromocaoAtiva();
            const avisoPromo = promo && promo.desconto_pct
              ? `\n🔥 *${promo.titulo}* — ${promo.desconto_pct}% de desconto aplicado automaticamente no link!\n`
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
