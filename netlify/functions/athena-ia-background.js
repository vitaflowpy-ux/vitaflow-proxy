// netlify/functions/athena-ia-background.js
// ── Cérebro de IA da Athena (ASSÍNCRONO) ──────────────────────────────────────
// Chamado pelo botconversa.js quando o cliente escreve algo que os menus NÃO entendem.
// Responde natural (Claude), ANCORADO no catálogo REAL (nada de inventar preço/estoque),
// e ENTREGA a resposta pelo BotConversa (API) — NÃO depende da janela síncrona do webhook,
// por isso NÃO dá timeout (é o que derrubava o galho de IA antigo).
//
// IMPORTANTE: o nome do arquivo TEM que terminar em "-background.js" pra rodar como
// Netlify Background Function (roda até ~15 min, sem o limite de ~10s do webhook normal).

const BOTCONVERSA_KEY  = '8c9e69c3-3c9f-4f23-b480-be4a0de29640'; // MESMA chave do send-whatsapp.js (conta atual)
const BOTCONVERSA_BASE = 'https://backend.botconversa.com.br/api/v1';
const FIREBASE_URL     = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const FIREBASE_SECRET  = process.env.FIREBASE_SECRET || '';
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY;
// Modelo do cérebro. Sonnet = mais inteligente; troque p/ um Haiku se quiser mais rápido/barato.
const MODEL            = process.env.ATHENA_MODEL || 'claude-sonnet-4-20250514';

function fbUrl(path){
  const b = FIREBASE_URL + path;
  if (!FIREBASE_SECRET) return b;
  return b + (b.indexOf('?') >= 0 ? '&' : '?') + 'auth=' + encodeURIComponent(FIREBASE_SECRET);
}

async function buscarCache(colecao){
  try {
    const r = await fetch(fbUrl(`/vitaflow_cache/colecoes/${colecao}.json`));
    const d = await r.json();
    return d && d.dados ? d.dados : '';
  } catch { return ''; }
}

// Monta um resumo do catálogo REAL (mesmas coleções que os menus usam) pra ancorar a IA.
async function catalogoResumo(){
  const cols = ['10-mais-vendidos','emagrecedores','peptideos','hormonios','gh','outros'];
  const parts = await Promise.all(cols.map(async c => {
    const d = await buscarCache(c);
    return d ? ('## ' + c + '\n' + d) : '';
  }));
  let txt = parts.filter(Boolean).join('\n\n');
  if (txt.length > 12000) txt = txt.slice(0, 12000) + '\n…(catálogo truncado)';
  return txt;
}

function normalizarPhone(raw){
  let d = (raw || '').replace(/\D/g, '');
  if (d.length <= 11) d = '55' + d;
  return d;
}

// Empurra a mensagem pro cliente pela API do BotConversa (mesmo padrão do send-whatsapp.js).
async function enviarBotConversa(phone, message){
  try {
    const phoneNorm = normalizarPhone(phone);
    let subId = null;
    const r1 = await fetch(`${BOTCONVERSA_BASE}/subscriber/get_by_phone/${phoneNorm}/`, { headers: { 'api-key': BOTCONVERSA_KEY } });
    if (r1.ok) { const s = await r1.json(); subId = (s && s.id) || null; }
    if (!subId) {
      const r2 = await fetch(`${BOTCONVERSA_BASE}/subscriber/`, {
        method: 'POST', headers: { 'api-key': BOTCONVERSA_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNorm, name: 'Cliente' })
      });
      if (r2.ok) { try { subId = (await r2.json()).id || null; } catch {} }
    }
    if (!subId) return false;
    const r3 = await fetch(`${BOTCONVERSA_BASE}/subscriber/${subId}/send_message/`, {
      method: 'POST', headers: { 'api-key': BOTCONVERSA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', value: message })
    });
    return r3.ok;
  } catch { return false; }
}

const SYSTEM = `Você é a Athena, consultora virtual da VitaFlow — loja de peptídeos, hormônios, emagrecedores, GH e performance, com entrega para todo o Brasil. Fala português do Brasil, tom caloroso, humano e direto — NADA robótico. Você responde qualquer pergunta do cliente da melhor forma possível, como uma vendedora experiente, simpática e persuasiva (sem forçar).

REGRAS DE OURO (NUNCA viole):
- Use SOMENTE o catálogo abaixo para dizer se um produto EXISTE e qual o PREÇO/disponibilidade. NUNCA invente preço, estoque, marca ou produto. Se não estiver no catálogo, diga que vai verificar e oriente a ver no site vitaflowoficial.com.
- NUNCA invente telefone, endereço, prazos ou dados da empresa.
- Categoria sensível (peptídeos/hormônios): pode falar de uso e benefícios de forma geral e responsável, mas NÃO prescreva, NÃO prometa cura e SEMPRE reforce a importância de acompanhamento profissional.
- Seja BREVE (é WhatsApp): 2 a 6 linhas. Use *negrito* (um asterisco de cada lado). NUNCA use ## nem ###.

COMO CONDUZIR PRA VENDA (natural, sem empurrar):
- Se o cliente se interessar por um produto, incentive a digitar o *nome do produto* (ex.: "manda *retatrutida* aqui que eu já te mostro as opções e os preços"). Assim o sistema abre a lista com preço e leva o cliente ao carrinho/checkout.
- Pra finalizar, rastrear pedido ou ver tudo: pode indicar digitar *menu*, ou o site vitaflowoficial.com.

PRAZOS OFICIAIS (use sempre "prazo estimado"): despacho em até 48h úteis após o pagamento; entrega estimada — Sudeste 2 a 5, Sul 3 a 5, Centro-Oeste 4 a 6, Nordeste 5 a 8, Norte 7 a 10 dias úteis. A Transportadora inclui seguro grátis; Correios (PAC/SEDEX) não têm seguro.`;

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const phone = body.phone;
    const mensagem = (body.mensagem || '').toString().trim();
    if (!phone || !mensagem) return { statusCode: 200, body: 'no-op' };

    const catalogo = await catalogoResumo();
    const sys = SYSTEM + `\n\n=== CATÁLOGO REAL (preços e disponibilidade de hoje) ===\n${catalogo}`;

    let reply = '';
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: 600, system: sys, messages: [{ role: 'user', content: mensagem }] })
      });
      const d = await r.json();
      reply = (d && d.content && d.content[0] && d.content[0].text) ? d.content[0].text.trim() : '';
    } catch (e) { reply = ''; }

    if (!reply) {
      reply = 'Deixa eu te ajudar melhor! 😊 Me diz o *nome do produto* que você procura (ex.: *retatrutida*, *bpc-157*, *stanozolol*) ou digite *menu* pra ver as categorias.';
    }

    await enviarBotConversa(phone, reply);
    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    return { statusCode: 200, body: 'err:' + e.message };
  }
};
