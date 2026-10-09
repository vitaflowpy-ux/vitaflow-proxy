// ═══════════════════════════════════════════════════════════════════════════════
// BRAS PAY — Pix da VitaFlow (09/10/2026)
// Conta nova para RECEBER PIX. A InfinitePay continua com o cartão e como Pix reserva.
//
// O que esta função faz (uma URL só: /.netlify/functions/braspay):
//   1) POST {acao:'criar', referencia, valorCentavos, descricao?, expiraEmSegundos?, nova?}
//        → cria a cobrança Pix na Bras Pay e devolve o copia e cola (brCode) e o QR.
//        `referencia` = número do pedido (VF-…, L-…, R…). nova:true = referência nova
//        (`<pedido>~<sufixo>`), para gerar outro Pix do MESMO pedido depois que o 1º venceu.
//   2) GET ?ref=<referencia>  (ou POST {acao:'status', referencia})
//        → diz se já foi pago. Quando está PAGO, também avisa o GAS (reserva do webhook).
//   3) POST da Bras Pay com o header X-Brascambio-Signature (WEBHOOK)
//        → confere a assinatura (HMAC-SHA256 de "<t>.<corpo cru>" com o webhook secret),
//          responde 2xx rápido e, em `cobranca.paga`, confirma o pedido no GAS no MESMO
//          formato da InfinitePay ({order_nsu, capture_method:'pix', transaction_nsu, ...}).
//          O GAS não muda nada: planilha, e-mail, Athena (coleta de dados), cupom, sorteio e
//          revenda seguem o caminho de sempre. O webhook NÃO pode ir direto pro GAS: a Bras Pay
//          conta redirect como falha, e o Web App do GAS sempre responde com redirect.
//
// Variáveis de ambiente (Netlify → Site configuration → Environment variables) — o Thiago coloca:
//   BRASPAY_API_KEY          a chave da API (bc_live_…)  — NUNCA no código
//   BRASPAY_WEBHOOK_SECRET   o secret de assinatura (whsec_…) — NUNCA no código
//   (já existem) FIREBASE_SECRET, TELEGRAM_TOKEN
// ═══════════════════════════════════════════════════════════════════════════════
const crypto = require('crypto');

const BRASPAY_API   = 'https://api.braspay.com.py/api/v1/gateway/cobrancas';
const GAS_URL       = 'https://script.google.com/macros/s/AKfycbxFlaN0FXFbpcC8HZ80sxnq383m5d-xTaj5cg72VcCdnYx47N_qKkiELFN5KAPmm_nb/exec';
const FIREBASE_URL  = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const TELEGRAM_CHAT = '8660563352';
const TOLERANCIA_ASSINATURA_SEG = 600;   // anti-replay: a Bras Pay assina de novo a cada reentrega

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function resposta(code, obj) {
  return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify(obj) };
}

async function fetchT(url, opts, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, ms || 8000);
  try {
    return await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal }));
  } finally {
    clearTimeout(timer);
  }
}

function fbUrl(path) {
  const s = process.env.FIREBASE_SECRET || '';
  const base = FIREBASE_URL + path;
  return s ? base + (base.indexOf('?') >= 0 ? '&' : '?') + 'auth=' + encodeURIComponent(s) : base;
}
function chaveFb(v) { return String(v || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'x'; }

async function telegram(texto) {
  const tk = process.env.TELEGRAM_TOKEN || '';
  if (!tk) return;
  try {
    await fetchT('https://api.telegram.org/bot' + tk + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: texto })
    }, 4000);
  } catch (e) {}
}

function reais(cent) { return 'R$ ' + (Number(cent || 0) / 100).toFixed(2).replace('.', ','); }

// número do pedido a partir da referência: "VF-0910-S123~kq2" → "VF-0910-S123"
function pedidoDaRef(ref) { return String(ref || '').split('~')[0].trim(); }

function refValida(ref) { return /^[A-Za-z0-9][A-Za-z0-9_\-~.]{2,99}$/.test(String(ref || '')); }

// ── 1) CRIAR COBRANÇA PIX ─────────────────────────────────────────────────────
async function criarCobranca(corpo) {
  const key = process.env.BRASPAY_API_KEY || '';
  if (!key) return resposta(503, { ok: false, erro: 'sem_chave' });
  const base = String(corpo.referencia || '').trim();
  const valor = Math.round(Number(corpo.valorCentavos || 0));
  if (!refValida(base) || base.indexOf('~') >= 0) return resposta(400, { ok: false, erro: 'referencia_invalida' });
  if (!(valor >= 100)) return resposta(400, { ok: false, erro: 'valor_invalido' });
  let exp = Math.round(Number(corpo.expiraEmSegundos || 1800));
  if (!(exp > 0)) exp = 1800;

  async function tentar(ref) {
    const r = await fetchT(BRASPAY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        meioPagamento: 'pix',
        valorCentavos: valor,
        referenciaExterna: ref,
        descricao: String(corpo.descricao || ('Pedido ' + base)).slice(0, 140),
        expiraEmSegundos: exp
      })
    }, 9000);
    let d = null;
    try { d = await r.json(); } catch (e) { d = null; }
    return { status: r.status, d: d || {} };
  }

  try {
    let ref = corpo.nova ? base + '~' + Date.now().toString(36) : base;
    let t = await tentar(ref);
    // 409 = a referência já foi usada (Pix vencido/pago) ou está pendente com OUTRO valor → referência nova
    if (t.status === 409) {
      ref = base + '~' + Date.now().toString(36);
      t = await tentar(ref);
    }
    if ((t.status === 200 || t.status === 201) && t.d && t.d.brCode) {
      return resposta(200, {
        ok: true, id: t.d.id || '', referencia: ref, pedido: base,
        brCode: t.d.brCode, qrCodeBase64: t.d.qrCodeBase64 || '',
        valorCentavos: Number(t.d.valorCentavos || valor), expiraEm: t.d.expiraEm || '', status: t.d.status || 'pendente'
      });
    }
    const erro = (t.d && (t.d.erro || t.d.title || t.d.detail)) || ('http_' + t.status);
    if (erro === 'limite_mensal_excedido') {
      await telegram('⚠️ BRAS PAY — limite mensal de Pix atingido.\nPedido ' + base + ' (' + reais(valor) + ') foi para a InfinitePay.\nAinda cabe neste mês: ' + reais(t.d.disponivelCentavos));
    }
    return resposta(200, { ok: false, erro: String(erro).slice(0, 200), status: t.status, disponivelCentavos: t.d.disponivelCentavos == null ? null : Number(t.d.disponivelCentavos) });
  } catch (e) {
    return resposta(200, { ok: false, erro: e && e.name === 'AbortError' ? 'timeout' : 'falha_rede' });
  }
}

// ── consulta na Bras Pay pela referência ──────────────────────────────────────
async function consultarRef(ref) {
  const key = process.env.BRASPAY_API_KEY || '';
  if (!key) return { erro: 'sem_chave' };
  const r = await fetchT(BRASPAY_API + '?ref=' + encodeURIComponent(ref) + '&meio=pix', {
    method: 'GET', headers: { 'Authorization': 'Bearer ' + key }
  }, 8000);
  if (r.status === 404) return { erro: 'nao_encontrada' };
  let d = null;
  try { d = await r.json(); } catch (e) { d = null; }
  if (!r.ok || !d) return { erro: 'http_' + r.status };
  if (Array.isArray(d)) d = d[0] || null;
  return d ? { cob: d } : { erro: 'nao_encontrada' };
}

// ── confirma no GAS (mesmo formato do webhook da InfinitePay) — uma vez por cobrança ──
// Devolve 'ok' | 'ja' | 'sem_resposta' (GAS recebeu mas demorou — ele termina sozinho) | 'falha'
async function confirmarNoGAS(dados, origem) {
  const id = String(dados.id || '');
  const ref = String(dados.referenciaExterna || '');
  const pedido = pedidoDaRef(ref);
  if (!id || !pedido) return 'falha';
  const k = chaveFb(id);
  try {
    const rj = await fetchT(fbUrl('/vitaflow_braspay/confirmados/' + k + '.json'), { method: 'GET' }, 4000);
    const ja = rj.ok ? await rj.json() : null;
    if (ja) return 'ja';
  } catch (e) {}
  const valor = Number(dados.valorCentavos || 0);
  const corpo = {
    order_nsu: pedido,
    paid_amount: valor,
    capture_method: 'pix',
    transaction_nsu: id,
    invoice_slug: String(dados.e2e || dados.codE2E || id),
    gateway: 'braspay',
    braspay_ref: ref
  };
  let resultado = 'falha';
  try {
    const r = await fetchT(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }, 8500);
    resultado = r.ok ? 'ok' : 'falha';
  } catch (e) {
    // timeout: o GAS já recebeu o POST e termina o processamento sozinho (e ignora repetição)
    resultado = (e && e.name === 'AbortError') ? 'sem_resposta' : 'falha';
  }
  if (resultado !== 'falha') {
    try {
      await fetchT(fbUrl('/vitaflow_braspay/confirmados/' + k + '.json'), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido: pedido, ref: ref, valor: valor, e2e: corpo.invoice_slug, origem: origem, gas: resultado, ts: Date.now() })
      }, 4000);
    } catch (e) {}
    await telegram('💰 PIX BRAS PAY recebido\n📦 Pedido: ' + pedido + '\n💵 ' + reais(valor) + (origem === 'consulta' ? '\n(confirmado pela consulta — o aviso da Bras Pay ainda não tinha chegado)' : ''));
  }
  return resultado;
}

// ── 2) STATUS ─────────────────────────────────────────────────────────────────
async function status(ref) {
  if (!refValida(ref)) return resposta(400, { ok: false, erro: 'referencia_invalida' });
  try {
    const c = await consultarRef(ref);
    if (c.erro) return resposta(200, { ok: false, erro: c.erro });
    const cob = c.cob;
    const st = String(cob.status || '').toLowerCase();
    if (st === 'pago') {
      await confirmarNoGAS({ id: cob.id, referenciaExterna: cob.referenciaExterna || ref, valorCentavos: cob.valorCentavos, e2e: cob.codE2E }, 'consulta');
    }
    return resposta(200, { ok: true, status: st, id: cob.id || '', referencia: cob.referenciaExterna || ref, expiraEm: cob.expiraEm || '', pedido: pedidoDaRef(cob.referenciaExterna || ref) });
  } catch (e) {
    return resposta(200, { ok: false, erro: e && e.name === 'AbortError' ? 'timeout' : 'falha_rede' });
  }
}

// ── 3) WEBHOOK ────────────────────────────────────────────────────────────────
function assinaturaOk(corpoCru, header, secret) {
  if (!header || !secret) return false;
  const partes = {};
  String(header).split(',').forEach(function (p) {
    const i = p.indexOf('=');
    if (i > 0) partes[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  const t = Number(partes.t);
  if (!t || !partes.v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > TOLERANCIA_ASSINATURA_SEG) return false;
  const esperado = crypto.createHmac('sha256', secret).update(partes.t + '.' + corpoCru, 'utf8').digest('hex');
  const a = Buffer.from(esperado, 'utf8'), b = Buffer.from(String(partes.v1), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function webhook(event, header) {
  const secret = process.env.BRASPAY_WEBHOOK_SECRET || '';
  if (!secret) return resposta(503, { ok: false, erro: 'sem_secret' });   // a Bras Pay reenvia depois
  const corpoCru = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : String(event.body || '');
  if (!assinaturaOk(corpoCru, header, secret)) return resposta(401, { ok: false, erro: 'assinatura' });
  let ev = null;
  try { ev = JSON.parse(corpoCru); } catch (e) { return resposta(200, { ok: true, ignorado: 'json' }); }
  const tipo = String(ev.tipo || '');
  const dados = ev.dados || {};

  if (tipo === 'cobranca.paga') {
    if (!dados.referenciaExterna) {
      // pagamento de algo que não foi criado por nós (sem referência): só avisa
      await telegram('ℹ️ BRAS PAY — pagamento sem referência de pedido: ' + reais(dados.valorCentavos));
      return resposta(200, { ok: true });
    }
    const r = await confirmarNoGAS(dados, 'webhook');
    // falha de rede ANTES de o GAS receber → 500 para a Bras Pay reenviar
    if (r === 'falha') return resposta(500, { ok: false, erro: 'gas' });
    return resposta(200, { ok: true, gas: r });
  }
  if (tipo === 'transferencia.recebida') {
    await telegram('ℹ️ BRAS PAY — Pix recebido direto na conta (fora de cobrança): ' + reais(dados.valorCentavos));
  }
  // expirada, cancelada etc.: nada a fazer
  return resposta(200, { ok: true });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  const h = event.headers || {};
  const assinatura = h['x-brascambio-signature'] || h['X-Brascambio-Signature'] || '';
  if (event.httpMethod === 'POST' && assinatura) return await webhook(event, assinatura);

  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};
    if (q.ref) return await status(String(q.ref));
    return resposta(200, { ok: true, servico: 'braspay', pronto: !!process.env.BRASPAY_API_KEY, webhook: !!process.env.BRASPAY_WEBHOOK_SECRET });
  }
  if (event.httpMethod !== 'POST') return resposta(405, { ok: false, erro: 'metodo' });

  let corpo = {};
  try {
    const txt = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '{}');
    corpo = JSON.parse(txt || '{}');
  } catch (e) { return resposta(400, { ok: false, erro: 'json' }); }
  if (corpo.acao === 'criar') return await criarCobranca(corpo);
  if (corpo.acao === 'status') return await status(String(corpo.referencia || ''));
  return resposta(400, { ok: false, erro: 'acao' });
};
