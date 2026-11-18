// ═══════════════════════════════════════════════════════════════════════════════
// BRAS PAY — Pix da VitaFlow (09/10/2026) · v2 (13/10/2026): INTERRUPTOR DO PIX · v3 (13/11/2026): INTERRUPTOR DA INFINITEPAY
// v4 (18/11/2026): PIX ALTERNATIVO (QR fixo) + USDT
//   Thiago: "alguns clientes estão tendo dificuldade de pagar com a chave pix gerada na hora… quero deixar essa chave como uma segunda
//   opção… não quero essa chave pix exposta" · "ele tem que conseguir resolver isso de forma simples e rapida" · USDT: "quero sim"
//   (se não tiver taxa, receber em reais; se tiver, em USDT; preço igual ao do Pix).
//   • POST {acao:'alternativo', referencia, valorCentavos, canal} → o "copia e cola" do QR FIXO da Bras Pay (o cartaz do portal, guardado
//     só no Netlify em BRASPAY_CARTAZ_BRCODE) já com o valor do pedido + alguns centavos únicos (1–49) para reconhecer o pagamento.
//     A chave nunca fica no site; só sai para um pedido, com limite de tentativas. Registro em vitaflow_braspay/alternativo/<dia>/<pedido>.
//   • Webhook com canal 'qr_estatico' (o QR fixo chega com referência da Bras Pay, "QR <apelido> <6 do E2E>", nunca o VF-…): procura o
//     pedido que pediu o alternativo com ESSE valor nas últimas 6 h. Achou UM → confirma no GAS como Pix (com o valor do pedido). Nenhum ou
//     mais de um → NÃO manda ao GAS (antes virava "pedido não existe na planilha"): Telegram com o link assinado "✅ é do pedido VF-…".
//   • USDT: POST {acao:'criar', meio:'usdt', rede:'Trc20'|'Bep20', referencia, valorCentavos} → cobrança USDT (endereço + valor em USDT,
//     cotação travada ~15 min). Confirma pelo mesmo webhook. Moeda do crédito: vitaflow_sync/pagamento_usdt.moedaCredito ('BRL' padrão).
//     GET ?ref=…&meio=usdt consulta. GET ?modo=1 devolve também usdt:{habilitado, redes} e alternativo:true|false.
// v3 (Thiago, 13/11/2026: "não quero utilizar mais a infinitepay… crie esse botão para eu desligar a infinitepay e deixar
//   'adormecida' pois se no futuro eu quiser usar, já estará pronta"): segundo interruptor, no Painel de Lucros, em
//   vitaflow_sync/pagamento_infinitepay = {ativo:true|false, em, por}.
//     • GET ?modo=1 passa a devolver também infinitepay:'ligada'|'desligada' (+ infEm). Quem lê: carrinho, Athena/Stella,
//       portal do revendedor, página de atacado e Orçamento — com 'desligada' eles escondem cartão/link/chave da InfinitePay.
//     • Nunca gravado = 'ligada' (nada muda até o Thiago desligar). Leitura do Firebase falhou = 'desligada' (o desejo dele).
//     • Com a InfinitePay desligada o Pix é SEMPRE Bras Pay: o ?modo=1 responde pix:'braspay' e a criação nunca recusa
//       com 'pix_na_infinitepay', mesmo que o interruptor do Pix tenha ficado em InfinitePay.
// v2: o Thiago troca no Painel de Lucros por onde o Pix do SITE, da ATHENA/STELLA e do PORTAL DO REVENDEDOR
//   é recebido: 'braspay' (padrão) ou 'infinitepay'. A posição fica no Firebase em vitaflow_sync/pagamento_pix
//   ({provedor, em, por}). Esta função:
//     • GET ?modo=1 → {ok, pix:'braspay'|'infinitepay', em} — o carrinho, a Athena e o portal perguntam aqui.
//     • no modo 'infinitepay' RECUSA criar Pix novo ({ok:false, erro:'pix_na_infinitepay'}), e quem chamou cai
//       no caminho da InfinitePay que já existia (trava de segurança para página antiga em cache).
//       EXCEÇÃO: referência do Orçamento (L-…) — lá o Thiago escolhe a chave na mão (pedido dele em 13/10).
//     • Pix que já foi gerado continua valendo: consulta (GET ?ref=) e webhook não olham o interruptor.
//     • Leitura do Firebase falhou → 'braspay' (o padrão de hoje).
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

// ── INTERRUPTOR DO PIX (v2) ──────────────────────────────────────────────────────
const MODO_PATH = '/vitaflow_sync/pagamento_pix.json';
async function lerModo() {
  try {
    const r = await fetchT(fbUrl(MODO_PATH), { method: 'GET' }, 3000);
    const d = r.ok ? await r.json() : null;
    return { pix: (d && d.provedor === 'infinitepay') ? 'infinitepay' : 'braspay', em: (d && d.em) || null };
  } catch (e) {
    return { pix: 'braspay', em: null, falhou: true };
  }
}
// ── INTERRUPTOR DA INFINITEPAY (v3) ────────────────────────────────────────────────
const INF_PATH = '/vitaflow_sync/pagamento_infinitepay.json';
async function lerInfinitePay() {
  try {
    const r = await fetchT(fbUrl(INF_PATH), { method: 'GET' }, 3000);
    if (!r.ok) return { ligada: false, em: null, falhou: true };
    const d = await r.json();
    if (d === null || d === undefined) return { ligada: true, em: null };          // nunca gravado: como era antes
    return { ligada: !(d && d.ativo === false), em: (d && d.em) || null };
  } catch (e) {
    return { ligada: false, em: null, falhou: true };
  }
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
  if (String(corpo.meio || '').toLowerCase() === 'usdt') return await criarUsdt(corpo, base, valor, key);   // v4
  // v2: interruptor do Pix (o Orçamento, L-…, fica de fora)
  if (!/^L-/i.test(base)) {
    const m = await lerModo();
    if (m.pix === 'infinitepay') {
      const inf = await lerInfinitePay();                                           // v3: InfinitePay desligada → o Pix é Bras Pay
      if (inf.ligada) return resposta(200, { ok: false, erro: 'pix_na_infinitepay' });
    }
  }
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
async function consultarRef(ref, meio) {
  const key = process.env.BRASPAY_API_KEY || '';
  if (!key) return { erro: 'sem_chave' };
  const r = await fetchT(BRASPAY_API + '?ref=' + encodeURIComponent(ref) + '&meio=' + (meio === 'usdt' ? 'usdt' : 'pix'), {
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
    braspay_ref: ref,
    braspay_meio: dados._meio === 'usdt' ? 'usdt' : (origem === 'alternativo' || origem === 'telegram' ? 'pix_alternativo' : 'pix')
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
    await telegram((dados._meio === 'usdt' ? '💰 USDT BRAS PAY recebido' : '💰 PIX BRAS PAY recebido') + '\n📦 Pedido: ' + pedido + '\n💵 ' + reais(valor) +
      (origem === 'consulta' ? '\n(confirmado pela consulta — o aviso da Bras Pay ainda não tinha chegado)' : '') +
      (origem === 'alternativo' ? '\n(Pix alternativo — QR fixo, reconhecido pelo valor)' : '') + (origem === 'telegram' ? '\n(Pix alternativo — confirmado por você no link)' : ''));
  }
  return resultado;
}


// ══ v4: USDT ═════════════════════════════════════════════════════════════════════
const USDT_REDES = { trc20: 'Trc20', bep20: 'Bep20' };
const USDT_CFG_PATH = '/vitaflow_sync/pagamento_usdt.json';
let _usdtCache = { t: 0, v: null };

// a parte da resposta da Bras Pay que vai para o navegador (endereço, valor, rede, validade) — nada além disso
function usdtPublico(u) {
  u = u || {};
  return { rede: u.rede || '', endereco: u.endereco || '', contrato: u.contrato || '', valorUsdt: String(u.valorUsdt || ''),
           validaAte: u.validaAte || '', confirmacoesMin: u.confirmacoesMin == null ? null : Number(u.confirmacoesMin),
           numConfirmacoes: u.numConfirmacoes == null ? null : Number(u.numConfirmacoes) };
}

// interruptor e moeda do crédito (Firebase): {ativo:false} esconde o USDT em todos os lugares · moedaCredito 'BRL' (padrão) | 'USDT'
async function lerConfigUsdt() {
  try {
    const r = await fetchT(fbUrl(USDT_CFG_PATH), { method: 'GET' }, 3000);
    const d = r.ok ? await r.json() : null;
    const mc = String((d && d.moedaCredito) || process.env.BRASPAY_USDT_CREDITO || 'BRL').toUpperCase();
    return { ativo: !(d && d.ativo === false), moedaCredito: ['BRL', 'USDT', 'USD'].indexOf(mc) >= 0 ? mc : 'BRL' };
  } catch (e) {
    return { ativo: true, moedaCredito: 'BRL', falhou: true };
  }
}

// a conta pode receber USDT agora? (GET /usdt/disponibilidade — guardado 10 min; falhou = não mostra o botão)
async function lerUsdt() {
  if (_usdtCache.v && Date.now() - _usdtCache.t < 600000) return _usdtCache.v;
  const key = process.env.BRASPAY_API_KEY || '';
  let v = { habilitado: false, redes: [] };
  if (key) {
    try {
      const r = await fetchT(BRASPAY_API.replace(/\/cobrancas$/, '/usdt/disponibilidade'), { method: 'GET', headers: { 'Authorization': 'Bearer ' + key } }, 2000);
      const d = r.ok ? await r.json() : null;
      if (d) v = { habilitado: !!d.habilitado, redes: (Array.isArray(d.redes) ? d.redes : []).map(function (x) {
        return { codigo: x.codigo, nome: x.nome, confirmacoesMin: x.confirmacoesMin }; }) };
    } catch (e) {}
  }
  _usdtCache = { t: Date.now(), v: v };
  return v;
}

async function criarUsdt(corpo, base, valor, key) {
  if (/^L-/i.test(base)) return resposta(400, { ok: false, erro: 'usdt_sem_orcamento' });
  const rede = USDT_REDES[String(corpo.rede || '').toLowerCase()];
  if (!rede) return resposta(400, { ok: false, erro: 'rede_invalida' });
  const cfg = await lerConfigUsdt();
  if (!cfg.ativo) return resposta(200, { ok: false, erro: 'usdt_desligado' });
  async function tentar(ref) {
    const r = await fetchT(BRASPAY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ meioPagamento: 'usdt', rede: rede, valorCentavos: valor, referenciaExterna: ref, moedaCredito: cfg.moedaCredito })
    }, 9000);
    let d = null;
    try { d = await r.json(); } catch (e) { d = null; }
    return { status: r.status, d: d || {} };
  }
  try {
    let ref = base + '~u' + Date.now().toString(36);
    let t = await tentar(ref);
    if (t.status === 409) { ref = base + '~u' + Date.now().toString(36) + 'b'; t = await tentar(ref); }
    if ((t.status === 200 || t.status === 201) && t.d && t.d.usdt && t.d.usdt.endereco) {
      return resposta(200, { ok: true, meio: 'usdt', id: t.d.id || '', referencia: ref, pedido: base, valorCentavos: Number(t.d.valorCentavos || valor),
                             taxaCentavos: t.d.taxaCentavos == null ? null : Number(t.d.taxaCentavos), moedaCredito: t.d.moedaCredito || cfg.moedaCredito,
                             qrCodeBase64: t.d.qrCodeBase64 || '', expiraEm: t.d.expiraEm || (t.d.usdt.validaAte || ''), status: t.d.status || 'pendente',
                             usdt: usdtPublico(t.d.usdt) });
    }
    const erro = (t.d && (t.d.erro || t.d.title || t.d.detail)) || ('http_' + t.status);
    return resposta(200, { ok: false, erro: String(erro).slice(0, 200), status: t.status });
  } catch (e) {
    return resposta(200, { ok: false, erro: e && e.name === 'AbortError' ? 'timeout' : 'falha_rede' });
  }
}

// ══ v4: PIX ALTERNATIVO (QR fixo do portal + valor do pedido) ═══════════════════════
// BR Code (EMV): TLV "id(2) tamanho(2) valor". O 54 é o valor; o 63 é o CRC16-CCITT (0x1021, início 0xFFFF) de tudo + "6304".
function crc16(txt) {
  let crc = 0xFFFF;
  const b = Buffer.from(txt, 'utf8');
  for (let i = 0; i < b.length; i++) {
    crc ^= b[i] << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function tlvLer(txt) {
  const out = []; let i = 0;
  while (i < txt.length) {
    const id = txt.substr(i, 2), n = parseInt(txt.substr(i + 2, 2), 10);
    if (!/^\d\d$/.test(id) || isNaN(n) || i + 4 + n > txt.length) return null;
    out.push({ id: id, v: txt.substr(i + 4, n) }); i += 4 + n;
  }
  return out;
}
function brcodeComValor(brcode, centavos) {
  const t = tlvLer(String(brcode || '').trim());
  if (!t || !t.length || t[0].id !== '00') return null;
  const semCrc = t.filter(function (x) { return x.id !== '63' && x.id !== '54'; });
  const v = (Number(centavos) / 100).toFixed(2);
  semCrc.push({ id: '54', v: v });
  semCrc.sort(function (a, b) { return Number(a.id) - Number(b.id); });            // ordem do padrão: …53, 54, 58, 59, 60, 62
  const corpo = semCrc.map(function (x) { return x.id + String(x.v.length).padStart(2, '0') + x.v; }).join('') + '6304';
  return corpo + crc16(corpo);
}
function brcodeValido(brcode) {
  const s = String(brcode || '');
  return s.length > 8 && s.slice(-8, -4) === '6304' && crc16(s.slice(0, -4)) === s.slice(-4).toUpperCase();
}

function diaBRT(ms) { return new Date((ms || Date.now()) - 3 * 3600000).toISOString().slice(0, 10); }
const ALT_JANELA_MS = 6 * 3600000;          // o pagamento no QR fixo é do pedido que pediu o alternativo nas últimas 6 h
const ALT_MAX_TENTATIVAS = 6;

async function fbGet(path) {
  const r = await fetchT(fbUrl(path), { method: 'GET' }, 4000);
  if (!r.ok) throw new Error('firebase_' + r.status);
  return await r.json();
}
async function fbPut(path, v, metodo) {
  const r = await fetchT(fbUrl(path), { method: metodo || 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }, 4000);
  if (!r.ok) throw new Error('firebase_' + r.status);
}
async function alternativosRecentes() {
  const hoje = diaBRT(), ontem = diaBRT(Date.now() - 86400000), out = [];
  for (const dia of [ontem, hoje]) {
    const d = await fbGet('/vitaflow_braspay/alternativo/' + dia + '.json');
    for (const k in (d || {})) if (d[k] && typeof d[k] === 'object') out.push(Object.assign({ _dia: dia, _k: k }, d[k]));
  }
  return out;
}

async function alternativo(corpo, ip) {
  const cartaz = String(process.env.BRASPAY_CARTAZ_BRCODE || '').trim();
  if (!cartaz || !brcodeValido(cartaz)) return resposta(200, { ok: false, erro: 'alternativo_indisponivel' });
  const pedido = String(corpo.referencia || '').trim().split('~')[0];
  const valor = Math.round(Number(corpo.valorCentavos || 0));
  if (!refValida(pedido) || /^L-/i.test(pedido)) return resposta(400, { ok: false, erro: 'referencia_invalida' });
  if (!(valor >= 100 && valor <= 5000000)) return resposta(400, { ok: false, erro: 'valor_invalido' });
  const canal = ['site', 'athena', 'portal'].indexOf(corpo.canal) >= 0 ? corpo.canal : 'site';
  try {
    const lista = await alternativosRecentes();
    const agora = Date.now();
    const meu = lista.filter(function (x) { return x.pedido === pedido && !x.pago && agora - Number(x.ts || 0) < ALT_JANELA_MS; })[0];
    let rec;
    if (meu && Number(meu.valor) === valor) {
      if (Number(meu.tentativas || 0) >= ALT_MAX_TENTATIVAS) return resposta(429, { ok: false, erro: 'muitas_tentativas' });
      rec = meu; rec.tentativas = Number(meu.tentativas || 0) + 1;
    } else {
      const usados = {};
      lista.forEach(function (x) { if (!x.pago && agora - Number(x.ts || 0) < ALT_JANELA_MS && x.pedido !== pedido) usados[Number(x.valorUnico)] = 1; });
      let extra = 0;
      for (let k = 1; k <= 49; k++) { if (!usados[valor + k]) { extra = k; break; } }
      if (!extra) return resposta(200, { ok: false, erro: 'tente_em_instantes' });
      rec = { pedido: pedido, valor: valor, valorUnico: valor + extra, ts: agora, canal: canal, tentativas: 1, _dia: diaBRT(agora), _k: chaveFb(pedido) };
    }
    rec.ultimoEm = agora; rec.ip = String(ip || '').slice(0, 45); rec.motivo = String(corpo.motivo || '').slice(0, 80); rec.banco = String(corpo.banco || '').slice(0, 60);
    const grava = Object.assign({}, rec); delete grava._dia; delete grava._k;
    await fbPut('/vitaflow_braspay/alternativo/' + rec._dia + '/' + rec._k + '.json', grava);
    const br = brcodeComValor(cartaz, rec.valorUnico);
    if (!br) return resposta(200, { ok: false, erro: 'alternativo_indisponivel' });
    return resposta(200, { ok: true, pedido: pedido, valorCentavos: rec.valorUnico, valorPedidoCentavos: valor, brCode: br, recebedor: 'Bras Serviços' });
  } catch (e) {
    return resposta(200, { ok: false, erro: e && e.name === 'AbortError' ? 'timeout' : 'falha' });
  }
}

// link assinado do Telegram ("✅ é do pedido VF-…") — HMAC com o segredo do webhook, vale 72 h, usa o id da cobrança (uma vez só)
function assinarVinculo(p, c, v, x) {
  return crypto.createHmac('sha256', process.env.BRASPAY_WEBHOOK_SECRET || '').update(['vincular', p, c, v, x].join('|'), 'utf8').digest('hex').slice(0, 32);
}
function linkVinculo(pedido, cobId, valor) {
  const x = Date.now() + 72 * 3600000;
  return 'https://vitaflow-proxy.netlify.app/.netlify/functions/braspay?vincular=1&p=' + encodeURIComponent(pedido) + '&c=' + encodeURIComponent(cobId) +
    '&v=' + valor + '&x=' + x + '&s=' + assinarVinculo(pedido, cobId, valor, x);
}
function paginaSimples(titulo, texto) {
  return { statusCode: 200, headers: Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, CORS),
           body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + titulo + '</title>' +
                 '<body style="font-family:system-ui,sans-serif;padding:24px;max-width:520px;margin:auto"><h2>' + titulo + '</h2><p>' + texto + '</p></body>' };
}
async function vincular(q) {
  const p = String(q.p || ''), c = String(q.c || ''), v = String(q.v || ''), x = String(q.x || ''), sg = String(q.s || '');
  if (!process.env.BRASPAY_WEBHOOK_SECRET || !refValida(p) || !c || !/^\d+$/.test(v) || !/^\d+$/.test(x)) return paginaSimples('Link inválido', 'Confira o link do Telegram.');
  const ok = sg.length === 32 && crypto.timingSafeEqual(Buffer.from(sg), Buffer.from(assinarVinculo(p, c, v, x)));
  if (!ok) return paginaSimples('Link inválido', 'A assinatura não confere.');
  if (Date.now() > Number(x)) return paginaSimples('Link vencido', 'Libere esse pedido pelo Painel de Dados.');
  const r = await confirmarNoGAS({ id: c, referenciaExterna: pedidoDaRef(p) + '~alt', valorCentavos: Number(v), e2e: c }, 'telegram');
  await marcarAlternativoPago(pedidoDaRef(p), c);
  if (r === 'ja') return paginaSimples('Já estava confirmado', 'Esse pagamento já foi lançado em um pedido. Nada foi feito de novo.');
  if (r === 'falha') return paginaSimples('Não consegui confirmar', 'A planilha não respondeu. Toque no link de novo em 1 minuto.');
  return paginaSimples('✅ Pedido ' + pedidoDaRef(p) + ' confirmado', 'Pagamento de ' + reais(v) + ' lançado como Pix. O cliente recebe o e-mail de sempre.');
}
async function marcarAlternativoPago(pedido, cobId) {
  try {
    const lista = await alternativosRecentes();
    for (const x of lista) if (x.pedido === pedido && !x.pago) await fbPut('/vitaflow_braspay/alternativo/' + x._dia + '/' + x._k + '.json', { pago: true, cobranca: cobId, pagoEm: Date.now() }, 'PATCH');
  } catch (e) {}
}

// v4: o cliente pagou o Pix gerado DEPOIS de já ter pago o alternativo → avisa (devolução é com o dono)
async function avisoPagoDuasVezes(pedido, valor) {
  try {
    const lista = await alternativosRecentes();
    if (lista.some(function (x) { return x.pedido === pedido && x.pago; })) {
      await telegram('⚠️ PEDIDO PAGO 2× — ' + pedido + '\nCaiu o Pix gerado (' + reais(valor) + ') e o Pix alternativo já tinha sido pago. Veja a devolução no portal da Bras Pay.');
    }
  } catch (e) {}
}
// a tela do Pix (site/portal) pergunta se o alternativo daquele pedido já caiu
async function statusAlternativo(pedido) {
  if (!refValida(pedido)) return resposta(400, { ok: false, erro: 'referencia_invalida' });
  try {
    const lista = await alternativosRecentes();
    const x = lista.filter(function (y) { return y.pedido === pedido; }).sort(function (a, b) { return Number(b.ts || 0) - Number(a.ts || 0); })[0];
    return resposta(200, { ok: true, pedido: pedido, pedido_alternativo: !!x, pago: !!(x && x.pago), cobranca: (x && x.cobranca) || '' });
  } catch (e) {
    return resposta(200, { ok: false, erro: 'falha' });
  }
}

// pagamento no QR fixo: de qual pedido é?
async function pagamentoQrFixo(dados) {
  const valor = Number(dados.valorCentavos || 0);
  const pagoMs = Date.parse(dados.pagoEm || '') || Date.now();
  let lista = [];
  try { lista = await alternativosRecentes(); } catch (e) { return 'falha'; }
  const naJanela = lista.filter(function (x) { return !x.pago && pagoMs - Number(x.ts || 0) < ALT_JANELA_MS && pagoMs - Number(x.ts || 0) > -600000; });
  let cand = naJanela.filter(function (x) { return Number(x.valorUnico) === valor; });
  // o cliente digitou o total do pedido sem os centavos únicos: só vale se for UM pedido com esse total exato
  if (!cand.length) cand = naJanela.filter(function (x) { return Number(x.valor) === valor; });
  if (cand.length === 1 && /^TESTE/i.test(String(cand[0].pedido))) {        // teste de R$ 1,00 do dono: não vai à planilha
    const c = cand[0];
    try { await fbPut('/vitaflow_braspay/alternativo/' + c._dia + '/' + c._k + '.json', { pago: true, cobranca: dados.id || '', pagoEm: pagoMs }, 'PATCH'); } catch (e) {}
    await telegram('✅ TESTE DO PIX ALTERNATIVO OK\nPagamento de ' + reais(valor) + ' no QR fixo reconhecido sozinho como ' + c.pedido +
                   ' (referência da Bras Pay: ' + (dados.referenciaExterna || '—') + ').\nNada foi lançado na planilha.');
    return 'teste';
  }
  if (cand.length === 1) {
    const c = cand[0];
    const r = await confirmarNoGAS({ id: dados.id, referenciaExterna: c.pedido + '~alt', valorCentavos: Number(c.valor), e2e: dados.e2e }, 'alternativo');
    if (r !== 'falha') {
      try { await fbPut('/vitaflow_braspay/alternativo/' + c._dia + '/' + c._k + '.json', { pago: true, cobranca: dados.id || '', pagoEm: pagoMs }, 'PATCH'); } catch (e) {}
    }
    return r;
  }
  // nenhum ou mais de um: não manda ao GAS (antes virava "pedido não existe na planilha") — o dono escolhe pelo link
  const L = ['⚠️ PIX NO QR FIXO — ' + reais(valor) + (dados.referenciaExterna ? ' (' + dados.referenciaExterna + ')' : '')];
  if (!cand.length) {
    L.push('Não achei pedido que pediu o Pix alternativo com esse valor.', 'Se for de um cliente seu, libere no Painel de Dados.');
  } else {
    L.push('Mais de um pedido com esse valor. É de qual?');
    cand.slice(0, 5).forEach(function (c) { L.push('✅ ' + c.pedido + ' (' + reais(c.valor) + '): ' + linkVinculo(c.pedido, dados.id || ('e2e-' + (dados.e2e || pagoMs)), c.valor)); });
  }
  await telegram(L.join('\n'));
  return 'aviso';
}

// ── 2) STATUS ─────────────────────────────────────────────────────────────────
async function status(ref, meio) {
  if (!refValida(ref)) return resposta(400, { ok: false, erro: 'referencia_invalida' });
  try {
    const c = await consultarRef(ref, meio);
    if (c.erro) return resposta(200, { ok: false, erro: c.erro });
    const cob = c.cob;
    const st = String(cob.status || '').toLowerCase();
    if (st === 'pago') {
      await confirmarNoGAS({ id: cob.id, referenciaExterna: cob.referenciaExterna || ref, valorCentavos: cob.valorCentavos, e2e: cob.codE2E, _meio: meio === 'usdt' ? 'usdt' : undefined }, 'consulta');
    }
    return resposta(200, { ok: true, status: st, id: cob.id || '', referencia: cob.referenciaExterna || ref, expiraEm: cob.expiraEm || '', pedido: pedidoDaRef(cob.referenciaExterna || ref),
      usdt: cob.usdt ? usdtPublico(cob.usdt) : undefined });
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
    // v4: QR fixo (cartaz do portal) — a referência é da Bras Pay, nunca o pedido: casa pelo Pix alternativo
    if (String(ev.canal || '') === 'qr_estatico' || /^QR /.test(String(dados.referenciaExterna || ''))) {
      const ra = await pagamentoQrFixo(dados);
      if (ra === 'falha') return resposta(500, { ok: false, erro: 'alternativo' });
      return resposta(200, { ok: true, alternativo: ra });
    }
    if (String(ev.meioPagamento || ev.meio || '') === 'usdt') dados._meio = 'usdt';
    if (!dados.referenciaExterna) {
      // pagamento de algo que não foi criado por nós (sem referência): só avisa
      await telegram('ℹ️ BRAS PAY — pagamento sem referência de pedido: ' + reais(dados.valorCentavos));
      return resposta(200, { ok: true });
    }
    const r = await confirmarNoGAS(dados, 'webhook');
    // falha de rede ANTES de o GAS receber → 500 para a Bras Pay reenviar
    if (r === 'falha') return resposta(500, { ok: false, erro: 'gas' });
    if (r === 'ok') await avisoPagoDuasVezes(pedidoDaRef(dados.referenciaExterna), dados.valorCentavos);
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
    if (q.vincular) return await vincular(q);
    if (q.alt) return await statusAlternativo(String(q.alt).trim());
    if (q.ref) return await status(String(q.ref), String(q.meio || '').toLowerCase());
    if (q.modo) {
      const par = await Promise.all([lerModo(), lerInfinitePay(), lerUsdt(), lerConfigUsdt()]);
      const m = par[0], inf = par[1], u = par[2], uc = par[3];
      const cartaz = String(process.env.BRASPAY_CARTAZ_BRCODE || '').trim();
      return { statusCode: 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, CORS), body: JSON.stringify({
        ok: true, pix: inf.ligada ? m.pix : 'braspay', em: m.em, infinitepay: inf.ligada ? 'ligada' : 'desligada', infEm: inf.em,
        alternativo: !!(cartaz && brcodeValido(cartaz)), usdt: { habilitado: !!(u.habilitado && uc.ativo), redes: u.habilitado && uc.ativo ? u.redes : [] } }) };
    }
    return resposta(200, { ok: true, servico: 'braspay', versao: 'v4', pronto: !!process.env.BRASPAY_API_KEY, webhook: !!process.env.BRASPAY_WEBHOOK_SECRET,
                           alternativo: !!String(process.env.BRASPAY_CARTAZ_BRCODE || '').trim() });
  }
  if (event.httpMethod !== 'POST') return resposta(405, { ok: false, erro: 'metodo' });

  let corpo = {};
  try {
    const txt = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '{}');
    corpo = JSON.parse(txt || '{}');
  } catch (e) { return resposta(400, { ok: false, erro: 'json' }); }
  if (corpo.acao === 'criar') return await criarCobranca(corpo);
  if (corpo.acao === 'status') return await status(String(corpo.referencia || ''), String(corpo.meio || '').toLowerCase());
  if (corpo.acao === 'alternativo') return await alternativo(corpo, h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0]);
  return resposta(400, { ok: false, erro: 'acao' });
};
