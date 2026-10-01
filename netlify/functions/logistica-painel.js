'use strict';
/* =============================================================================
   logistica-painel.js — DADOS DO PAINEL DA LOGÍSTICA (VitaFlow)  ·  v1  ·  01/10/2026
   Netlify Function no repo vitaflow-proxy → netlify/functions/logistica-painel.js
   URL: https://vitaflow-proxy.netlify.app/.netlify/functions/logistica-painel

   O QUE FAZ (pedido do Thiago, 01/10: itens 4 e 5 do plano da logística)
     acao 'numeros' — NÚMEROS DA LOGÍSTICA: por estado (pago → entregue), por transportadora (postado → entregue +
                      ocorrências), por fornecedor (pago → postado) e a tendência mês a mês. Só agregados.
     acao 'atrasos' — pedidos PAGOS que passaram do prazo de POSTAGEM e ainda não foram postados (lista de cobrança
                      por fornecedor) + quantos e-mails de atraso cada cliente já recebeu.
     acao 'enviar_teste' — manda o e-mail de atraso (1º aviso, com os dados do 1º pedido atrasado) para o e-mail de
                      teste da configuração. Não conta como envio.
     GET ?defaults=1 — textos padrão do e-mail de atraso (sem login), pro painel mostrar na aba Textos.

   QUEM PODE: só admin. O painel manda o idToken do Firebase Auth; aqui ele é conferido lendo admins/<uid> com o
   próprio token (o Firebase recusa token falso/vencido) — o mesmo teste que o painel faz no login.

   O PRAZO É O MESMO DO RASTREIO: usa a tabela PRAZOS_ENTREGA e os dias úteis (feriados) da rastreio-consulta v3.
   Mudou o prazo → muda lá (e no GAS) — este arquivo não tem número de prazo próprio.

   LÊ: vitaflow_pedidos_hdr · vitaflow_pedidos · vitaflow_historico_status · vitaflow_sync/rastreio_eventos/<k>
       vitaflow_sync/logistica/{config,textos,email_atraso}
   GRAVA: nada (o envio de verdade fica na logistica-atrasos.js, agendada).
   Variáveis de ambiente: FIREBASE_SECRET (já existe) · BREVO_API_KEY (só pro e-mail; a mesma chave do Apps Script).
   ============================================================================= */
var R = require('./rastreio-consulta.js').lib;

var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var RAIZ = 'vitaflow_sync/logistica';
var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};
var LOGO = 'https://cdn.shopify.com/s/files/1/0777/9762/1945/files/vitaflow_no_bg_pro.png?v=1775266917';
var RASTREIO_URL = 'https://vitaflowoficial.com/pages/rastrear-pedido';
var DIA = 86400000;

function resp(obj, code) { return { statusCode: code || 200, headers: CORS, body: JSON.stringify(obj) }; }

/* ============================ textos do e-mail (editáveis no painel) ============================ */
var EMAIL_PADRAO = {
  email_atraso_assunto: 'Seu pedido {PEDIDO} ainda está em separação',
  email_atraso_1:
    'Olá, {NOME}!\n\n' +
    'Seu pedido {PEDIDO}, confirmado em {DATA}, ainda está em separação no estoque e passou do prazo de postagem que informamos (até {PRAZO_POSTAGEM} dias úteis). Pedimos desculpas pela espera.\n\n' +
    'Nossa equipe está acompanhando o seu pedido junto ao estoque. Assim que ele for postado, o código de rastreio aparece na página de rastreio.\n\n' +
    'Acompanhe em vitaflowoficial.com/pages/rastrear-pedido (use o número do pedido, o CPF ou o e-mail).\n\n' +
    'Se precisar, fale com a nossa logística pelo WhatsApp +44 7537 155718.\n\n' +
    'Equipe VitaFlow',
  email_atraso_lembrete:
    'Olá, {NOME}!\n\n' +
    'Seu pedido {PEDIDO} continua em separação no estoque ({DIAS} dias úteis desde a confirmação). Seguimos acompanhando e cobrando o envio.\n\n' +
    'Assim que ele for postado, o código de rastreio aparece em vitaflowoficial.com/pages/rastrear-pedido.\n\n' +
    'Se precisar, fale com a nossa logística pelo WhatsApp +44 7537 155718.\n\n' +
    'Equipe VitaFlow'
};
var EMAIL_CFG_PADRAO = { email_atraso_modo: 'desligado', email_atraso_max: 3, email_atraso_intervalo_du: 3, email_atraso_janela_dias: 45 };

function preencher(t, v) { return String(t || '').replace(/\{([A-Z_]+)\}/g, function (a, k) { return (v[k] != null) ? String(v[k]) : a; }); }
function escH(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* texto → HTML no padrão do e-mail "Pedido confirmado" (fundo cinza, cartão branco, logo no topo) */
function htmlEmail(texto) {
  var pars = String(texto || '').split(/\n{2,}/).map(function (p) {
    var h = escH(p).replace(/\n/g, '<br>').replace(/vitaflowoficial\.com\/pages\/rastrear-pedido/g,
      '<a href="' + RASTREIO_URL + '" style="color:#0280CD;font-weight:700">vitaflowoficial.com/pages/rastrear-pedido</a>');
    return '<p style="margin:0 0 14px;font-size:15px;color:#41506a;line-height:1.65">' + h + '</p>';
  }).join('');
  return '<div style="background:#eceff3;padding:20px 10px;font-family:Arial,Helvetica,sans-serif">' +
    '<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden">' +
    '<tr><td style="background:#0D1B2E;padding:24px 20px 20px;text-align:center">' +
    '<div style="height:4px;width:52px;margin:0 auto 14px;background:#F5A623;border-radius:2px"></div>' +
    '<img src="' + LOGO + '" alt="VitaFlow" width="170" style="display:inline-block;width:170px;max-width:60%;height:auto;border:0"></td></tr>' +
    '<tr><td style="padding:26px 22px 10px">' + pars + '</td></tr>' +
    '<tr><td style="padding:0 22px 24px"><a href="' + RASTREIO_URL + '" style="display:block;text-align:center;background:#F5A623;color:#0D1B2E;text-decoration:none;font-size:16px;font-weight:800;padding:15px 10px;border-radius:10px">&#128269; Rastrear pedido</a></td></tr>' +
    '</table></div>';
}

/* Brevo (API transacional) — a mesma conta/remetente do Apps Script */
async function enviarBrevo(para, nome, assunto, texto) {
  var chave = process.env.BREVO_API_KEY || '';
  if (!chave) return { ok: false, erro: 'falta a variável BREVO_API_KEY no Netlify' };
  try {
    var r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': chave, 'accept': 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'VitaFlow', email: 'contato@vitaflowoficial.com' },
        to: [{ email: para, name: nome || undefined }], subject: assunto, htmlContent: htmlEmail(texto), textContent: texto })
    });
    if (r.status >= 200 && r.status < 300) return { ok: true };
    return { ok: false, erro: 'Brevo HTTP ' + r.status + ' ' + String(await r.text()).slice(0, 200) };
  } catch (e) { return { ok: false, erro: 'Brevo: ' + e.message }; }
}

/* ============================ leitura dos pedidos ============================ */
var EXCECAO = { 'ENCAMINHADO PARA FISCALIZACAO': 1, 'DESTINATARIO AUSENTE': 1, 'ENDERECO INCORRETO': 1,
  'AREA COM DISTRIBUICAO': 1, 'PEDIDO EXTRAVIADO': 1, 'PEDIDO APREENDIDO': 1 };
var FINAL = { 'PEDIDO CANCELADO': 1, 'REEMBOLSO REALIZADO': 1 };
var ANTES_DE_POSTAR = { 'PEDIDO CONFIRMADO': 1, 'PAGO': 1, 'EM SEPARACAO': 1, 'DESPACHADO': 1 };

function transpNome(t) {
  var u = R.semAcentoUp(t);
  if (!u) return 'Sem transportadora';
  if (u.indexOf('J&T') >= 0 || /\bJT\b/.test(u) || u.indexOf('J T') >= 0) return 'J&T';
  if (u.indexOf('JADLOG') >= 0) return 'Jadlog';
  if (u.indexOf('LOGGI') >= 0) return 'Loggi';
  if (u.indexOf('TOTAL') >= 0) return 'Total Express';
  if (u.indexOf('SHOPEE') >= 0 || u.indexOf('SPX') >= 0) return 'Shopee';
  if (u.indexOf('CORREIO') >= 0 || u.indexOf('PAC') >= 0 || u.indexOf('SEDEX') >= 0) return 'Correios';
  return String(t).trim();
}
/* 1º fornecedor da coluna COMPRADO_FORNECEDORES ("Daniel MS | Respect" → Daniel) */
function fornNome(f) {
  var u = R.semAcentoUp(String(f || '').split(/\||\n|,/)[0]);
  if (!u) return 'Sem fornecedor';
  if (u.indexOf('DANIEL') >= 0) return 'Daniel';
  if (u.indexOf('RESPECT') >= 0) return 'Respect';
  if (u.indexOf('GEOVANNA') >= 0) return 'Geovanna';
  if (u.indexOf('CAMILA') >= 0) return 'Camila (atacado)';
  if (u.replace(/[^A-Z]/g, '').indexOf('VITAFLOW') === 0) return 'VitaFlow';
  if (u.indexOf('ROGER') >= 0) return 'Roger';
  var w = u.split(/\s+/)[0];
  return w.charAt(0) + w.slice(1).toLowerCase();
}

async function lerBase(comEmails) {
  var lidos = await Promise.all([
    R.fbGet('vitaflow_pedidos_hdr'), R.fbGet('vitaflow_pedidos'), R.fbGet('vitaflow_historico_status'),
    R.fbGetOu(RAIZ + '/config'), R.fbGetOu(RAIZ + '/textos'), comEmails ? R.fbGetOu(RAIZ + '/email_atraso') : Promise.resolve(null)
  ]);
  return { hdr: lidos[0] || [], esp: lidos[1] || {}, hist: lidos[2] || {}, cfg: lidos[3] || {}, txt: lidos[4] || {}, env: lidos[5] || {} };
}

/* um pedido do espelho → dados de tempo (ts em ms) */
function montarPedidos(base) {
  var hd = (base.hdr || []).map(function (h) { return String(h || '').trim().toUpperCase(); });
  var cT = hd.indexOf('TRANSPORTADORA'), cR = hd.indexOf('CODIGO_RASTREIO'); if (cR < 0) cR = hd.indexOf('CODIGO RASTREIO');
  var cF = hd.indexOf('COMPRADO_FORNECEDORES');
  var out = [];
  Object.keys(base.esp).forEach(function (k) {
    var l = base.esp[k];
    if (!l || typeof l !== 'object' || !l[0]) return;
    var b = R.baseDaLinha(l, cT, cR, cF);
    var st = R.semAcentoUp(b.status);
    var objH = base.hist[R.histKey(b.pedido)] || null, evs = [];
    if (objH && typeof objH === 'object') {
      evs = Object.keys(objH).map(function (x) { return objH[x]; }).filter(function (e) { return e && e.status && e.ts; })
        .sort(function (a, z) { return a.ts - z.ts; });
    }
    var tConf = 0, tPost = 0, tEnt = 0, oco = false, extr = false, apre = false;
    evs.forEach(function (e) {
      var su = R.semAcentoUp(e.status), o = R.ETAPA_ORDEM.hasOwnProperty(su) ? R.ETAPA_ORDEM[su] : -1;
      if (!tConf && su.indexOf('CONFIRMADO') >= 0) tConf = e.ts;
      if (!tPost && o >= 4) tPost = e.ts;
      if (!tEnt && su === 'ENTREGUE') tEnt = e.ts;
      if (EXCECAO[su]) oco = true;
      if (su === 'PEDIDO EXTRAVIADO') extr = true;
      if (su === 'PEDIDO APREENDIDO') apre = true;
    });
    if (EXCECAO[st]) oco = true;
    if (st === 'PEDIDO EXTRAVIADO') extr = true;
    if (st === 'PEDIDO APREENDIDO') apre = true;
    if (!tConf) { var md = String(b.data || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (md) tConf = new Date(md[3] + '-' + md[2] + '-' + md[1] + 'T12:00:00-03:00').getTime(); }
    var atacado = /VF-\d{4}-W/i.test(b.pedido) || R.semAcentoUp(b._forn).indexOf('CAMILA') >= 0;
    out.push({ k: R.histKey(b.pedido), pedido: b.pedido, nome: b.nome, email: String(l[2] || '').trim(), uf: b.estado, cidade: b.cidade,
      status: b.status, st: st, naoPagou: R.naoPagou(b.status, l[12]), final: !!FINAL[st], data: b.data,
      transp: transpNome(b.transportadora), transpTxt: b.transportadora, codigo: b._rast, forn: fornNome(b._forn), fornTxt: b._forn,
      atacado: atacado, tConf: tConf, tPost: tPost, tEnt: tEnt, oco: oco, extr: extr, apre: apre });
  });
  return out;
}

function faixaUF(uf) {
  var P = R.PRAZOS_ENTREGA;
  return (P.estados && P.estados[uf]) || P.regioes[R.UF_REGIAO[uf] || ''] || null;
}
function postDU(p) { return p.atacado ? R.PRAZOS_ENTREGA.atacado_postagem_du : R.PRAZOS_ENTREGA.varejo_postagem_du; }

/* ============================ NÚMEROS ============================ */
function estat(arr) {
  if (!arr.length) return { n: 0 };
  var s = arr.slice().sort(function (a, b) { return a - b; });
  var q = function (p) { return s[Math.max(0, Math.ceil(p * s.length) - 1)]; };
  return { n: s.length, mediana: q(0.5), p90: q(0.9) };
}
function pct(a, b) { return b ? Math.round(1000 * a / b) / 10 : null; }
function mesBR(ts) { return R.diaBR(ts).slice(0, 7); }

function calcularNumeros(peds, dias, agora) {
  agora = agora || Date.now();
  var ini = agora - dias * DIA;
  var validos = peds.filter(function (p) { return !p.naoPagou && !p.final && p.tConf; });
  var noPeriodo = validos.filter(function (p) { return p.tConf >= ini && p.tConf <= agora; });

  var G = { uf: {}, tr: {}, fo: {} };
  function g(tab, chave) { return tab[chave] || (tab[chave] = { dias: [], noPrazo: 0, base: 0, total: 0, oco: 0, extr: 0, apre: 0 }); }
  var postT = [], entT = [], totalNoPrazo = 0, totalEnt = 0;
  noPeriodo.forEach(function (p) {
    var fx = faixaUF(p.uf), pd = postDU(p);
    var dPost = (p.tPost && p.tPost >= p.tConf) ? R.duEntre(p.tConf, p.tPost) : null;
    var dEnt = (p.tEnt && p.tPost && p.tEnt >= p.tPost) ? R.duEntre(p.tPost, p.tEnt) : null;
    var dTot = (p.tEnt && p.tEnt >= p.tConf) ? R.duEntre(p.tConf, p.tEnt) : null;
    /* estado: pago → entregue */
    if (p.uf) {
      var a = g(G.uf, p.uf); a.total++;
      if (dTot != null) { a.dias.push(dTot); a.base++; if (fx && dTot <= pd + fx[1]) a.noPrazo++; }
    }
    /* transportadora: postado → entregue + ocorrências */
    if (p.tPost || p.transp !== 'Sem transportadora') {
      var t = g(G.tr, p.transp); t.total++;
      if (p.oco) t.oco++; if (p.extr) t.extr++; if (p.apre) t.apre++;
      if (dEnt != null) { t.dias.push(dEnt); t.base++; if (fx && dEnt <= fx[1]) t.noPrazo++; }
    }
    /* fornecedor: pago → postado */
    var f = g(G.fo, p.forn); f.total++;
    if (dPost != null) { f.dias.push(dPost); f.base++; if (dPost <= pd) f.noPrazo++; }
    if (dPost != null) postT.push(dPost);
    if (dTot != null) { entT.push(dTot); totalEnt++; if (fx && dTot <= pd + fx[1]) totalNoPrazo++; }
  });
  function lista(tab, extra) {
    return Object.keys(tab).map(function (k) {
      var x = tab[k], e = estat(x.dias), o = { nome: k, pedidos: x.total, base: x.base, mediana: e.mediana, p90: e.p90, no_prazo_pct: pct(x.noPrazo, x.base) };
      if (extra) { o.ocorrencias = x.oco; o.ocorrencias_pct = pct(x.oco, x.total); o.extravios = x.extr; o.apreensoes = x.apre; }
      return o;
    }).sort(function (a, b) { return b.pedidos - a.pedidos; });
  }
  var porUF = lista(G.uf).map(function (o) { var fx = faixaUF(o.nome); o.prazo_entrega = fx ? fx[0] + ' a ' + fx[1] : ''; return o; });

  /* tendência: últimos 6 meses (mês da confirmação) */
  var meses = [], d0 = new Date(agora);
  for (var i = 5; i >= 0; i--) {
    var dm = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - i, 15));
    meses.push(dm.getUTCFullYear() + '-' + ('0' + (dm.getUTCMonth() + 1)).slice(-2));
  }
  var M = {}; meses.forEach(function (m) { M[m] = { ped: 0, post: [], tot: [], noPrazo: 0, baseEnt: 0, oco: 0 }; });
  validos.forEach(function (p) {
    var m = M[mesBR(p.tConf)]; if (!m) return;
    var fx = faixaUF(p.uf), pd = postDU(p);
    m.ped++; if (p.oco) m.oco++;
    if (p.tPost && p.tPost >= p.tConf) m.post.push(R.duEntre(p.tConf, p.tPost));
    if (p.tEnt && p.tEnt >= p.tConf) { var dt = R.duEntre(p.tConf, p.tEnt); m.tot.push(dt); m.baseEnt++; if (fx && dt <= pd + fx[1]) m.noPrazo++; }
  });
  var mensal = meses.map(function (k) {
    var m = M[k];
    return { mes: k, pedidos: m.ped, mediana_postagem: estat(m.post).mediana, mediana_total: estat(m.tot).mediana,
      entregues: m.baseEnt, no_prazo_pct: pct(m.noPrazo, m.baseEnt), ocorrencias_pct: pct(m.oco, m.ped) };
  });

  var eP = estat(postT), eT = estat(entT);
  return {
    periodo_dias: dias, gerado_ts: agora,
    resumo: { pedidos: noPeriodo.length, postados: postT.length, entregues: totalEnt,
      mediana_postagem: eP.mediana, p90_postagem: eP.p90, mediana_total: eT.mediana, p90_total: eT.p90,
      no_prazo_pct: pct(totalNoPrazo, totalEnt) },
    por_uf: porUF, por_transportadora: lista(G.tr, true), por_fornecedor: lista(G.fo), mensal: mensal,
    prazos: { postagem_varejo: R.PRAZOS_ENTREGA.varejo_postagem_du, postagem_atacado: R.PRAZOS_ENTREGA.atacado_postagem_du }
  };
}

/* ============================ ATRASOS NA POSTAGEM ============================ */
async function calcularAtrasos(base, peds, agora) {
  agora = agora || Date.now();
  var cfg = Object.assign({}, EMAIL_CFG_PADRAO, base.cfg || {});
  var janela = Math.max(7, Number(cfg.email_atraso_janela_dias) || 45);
  var cand = peds.filter(function (p) {
    return ANTES_DE_POSTAR[p.st] && !p.naoPagou && p.tConf && !p.tPost && p.tConf >= agora - janela * DIA &&
      R.duEntre(p.tConf, agora) > postDU(p);
  });
  /* leitura real da transportadora = já foi postado (o status da planilha só não andou) */
  var evos = await Promise.all(cand.map(function (p) { return R.fbGetOu('vitaflow_sync/rastreio_eventos/' + p.k); }));
  var lista = [];
  cand.forEach(function (p, i) {
    var evo = evos[i];
    if (evo && evo.cod && p.codigo && String(evo.cod).replace(/\.0$/, '') !== String(p.codigo).replace(/\.0$/, '')) evo = null;
    if (evo && evo.primeira) return;
    var pd = postDU(p), dias = R.duEntre(p.tConf, agora), env = (base.env || {})[p.k] || {};
    lista.push({ k: p.k, pedido: p.pedido, nome: p.nome, email: p.email, uf: p.uf, cidade: p.cidade, data: p.data, status: p.status,
      fornecedor: p.forn, fornecedor_txt: p.fornTxt, transportadora: p.transpTxt, codigo: p.codigo, atacado: p.atacado,
      dias: dias, prazo_postagem: pd, postagem_ate: R.ddmm(R.somaDU(p.tConf, pd)), conf_ts: p.tConf,
      emails: Number(env.n) || 0, email_ultimo: Number(env.ultimo) || 0 });
  });
  lista.sort(function (a, b) { return b.dias - a.dias; });
  return lista;
}

/* quem recebe e-mail hoje (1º aviso ou lembrete) */
function decidirEnvio(a, cfg, agora) {
  var max = Math.max(1, Number(cfg.email_atraso_max) || 3), inter = Math.max(1, Number(cfg.email_atraso_intervalo_du) || 3);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(a.email || ''))) return null;
  if (!a.emails) return 'primeiro';
  if (a.emails >= max) return null;
  if (a.email_ultimo && R.duEntre(a.email_ultimo, agora) >= inter) return 'lembrete';
  return null;
}
function montarEmail(a, tipo, txt) {
  var T = Object.assign({}, EMAIL_PADRAO);
  Object.keys(EMAIL_PADRAO).forEach(function (k) { if (txt && txt[k] && String(txt[k]).trim()) T[k] = String(txt[k]); });
  var v = { NOME: String(a.nome || '').split(' ')[0] || 'cliente', PEDIDO: a.pedido, DATA: a.data, DIAS: a.dias, PRAZO_POSTAGEM: a.prazo_postagem };
  return { assunto: preencher(T.email_atraso_assunto, v), texto: preencher(tipo === 'lembrete' ? T.email_atraso_lembrete : T.email_atraso_1, v) };
}

/* ============================ login (só admin) ============================ */
async function conferirAdmin(token) {
  token = String(token || '');
  var partes = token.split('.');
  if (partes.length !== 3) return null;
  var uid = '';
  try { var pl = JSON.parse(Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); uid = pl.user_id || pl.sub || ''; } catch (e) { return null; }
  if (!uid || !/^[A-Za-z0-9]+$/.test(uid)) return null;
  try {
    var r = await fetch(FB_BASE + '/admins/' + uid + '.json?auth=' + encodeURIComponent(token));
    if (!r.ok) return null;
    return (await r.json()) === true ? uid : null;
  } catch (e) { return null; }
}

/* cache da instância quente (5 min) — os números não mudam a cada clique */
var _cache = {};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  var q = event.queryStringParameters || {};
  if (event.httpMethod === 'GET' && q.defaults) return resp({ textos: EMAIL_PADRAO, config: EMAIL_CFG_PADRAO, brevo: !!process.env.BREVO_API_KEY });
  if (event.httpMethod !== 'POST') return resp({ ok: false, erro: 'use POST' }, 405);
  var d = {};
  try { d = JSON.parse(event.body || '{}') || {}; } catch (e) { d = {}; }
  if (!(await conferirAdmin(d.token))) return resp({ ok: false, erro: 'sem permissão (faça login de novo)' }, 401);
  try {
    var acao = String(d.acao || ''), agora = Date.now();
    if (acao === 'numeros') {
      var dias = [30, 60, 90, 180, 365].indexOf(Number(d.dias)) >= 0 ? Number(d.dias) : 90;
      var ck = 'n' + dias;
      if (!d.forcar && _cache[ck] && agora - _cache[ck].t < 300000) return resp({ ok: true, numeros: _cache[ck].v, cache: true });
      var base = await lerBase(false);
      var v = calcularNumeros(montarPedidos(base), dias, agora);
      _cache[ck] = { t: agora, v: v };
      return resp({ ok: true, numeros: v });
    }
    if (acao === 'atrasos' || acao === 'enviar_teste') {
      var b2 = await lerBase(true);
      var lista = await calcularAtrasos(b2, montarPedidos(b2), agora);
      var cfg = Object.assign({}, EMAIL_CFG_PADRAO, b2.cfg || {});
      if (acao === 'atrasos') {
        lista.forEach(function (a) { a.recebe_hoje = decidirEnvio(a, cfg, agora); });
        return resp({ ok: true, atrasos: lista, gerado_ts: agora, brevo: !!process.env.BREVO_API_KEY,
          config: { modo: cfg.email_atraso_modo, teste: cfg.email_atraso_teste || '', max: cfg.email_atraso_max, intervalo_du: cfg.email_atraso_intervalo_du, janela_dias: cfg.email_atraso_janela_dias } });
      }
      var para = String(cfg.email_atraso_teste || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(para)) return resp({ ok: false, erro: 'Preencha o e-mail de teste na aba Atrasos e salve.' });
      /* exemplo = o 1º atrasado que tem e-mail (senão, um pedido fictício) */
      var ex = lista.filter(function (a) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(a.email || '')); })[0] ||
        { nome: 'Cliente Exemplo', pedido: 'VF-0110-S001', data: '01/10/2026', dias: 5, prazo_postagem: 3 };
      var tipo = d.tipo === 'lembrete' ? 'lembrete' : 'primeiro';
      var m = montarEmail(ex, tipo, b2.txt);
      var r = await enviarBrevo(para, '', '[TESTE] ' + m.assunto, m.texto);
      return resp(r.ok ? { ok: true, enviado_para: para, pedido_exemplo: ex.pedido } : { ok: false, erro: r.erro });
    }
    return resp({ ok: false, erro: 'acao desconhecida' }, 400);
  } catch (e) {
    console.error('[logistica-painel] ' + (e && e.message || e));
    return resp({ ok: false, erro: String(e && e.message || e) }, 500);
  }
};

/* usado pela logistica-atrasos.js (agendada) e pelos testes */
exports.lib = { lerBase: lerBase, montarPedidos: montarPedidos, calcularNumeros: calcularNumeros, calcularAtrasos: calcularAtrasos,
  decidirEnvio: decidirEnvio, montarEmail: montarEmail, enviarBrevo: enviarBrevo, htmlEmail: htmlEmail, conferirAdmin: conferirAdmin,
  EMAIL_PADRAO: EMAIL_PADRAO, EMAIL_CFG_PADRAO: EMAIL_CFG_PADRAO, transpNome: transpNome, fornNome: fornNome, RAIZ: RAIZ };
