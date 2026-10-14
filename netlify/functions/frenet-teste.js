'use strict';
/* =============================================================================
   frenet-teste.js — TESTE da API da Frenet para rastreio (VitaFlow) · v1 · 14/10/2026
   Pedido do Thiago (14/10): ver se a Frenet rastreia os nossos envios (Loggi, J&T, Jadlog) pela API, sem a Onlog.
   SÓ LEITURA: lista os serviços da conta e consulta o rastreio de um código. Não grava nada em lugar nenhum.
   O token da Frenet fica na variável FRENET_TOKEN do Netlify (o Thiago guardou); nunca sai desta função.
   Quem pode chamar: só admin (mesmo login de admin do painel da logística — idToken do Firebase conferido em admins/<uid>).
   Ações (POST JSON):
     { acao: 'servicos' }                                         → GET  /shipping/info
     { acao: 'rastrear', codigo: '...', servico: '...', cpf? }    → POST /tracking/trackinginfo
   ============================================================================= */
var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var BASES = ['https://api.frenet.com.br', 'http://api.frenet.com.br'];
var CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

function resp(obj, cod) { return { statusCode: cod || 200, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CORS), body: JSON.stringify(obj) }; }

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

async function frenet(metodo, caminho, corpo) {
  var tk = process.env.FRENET_TOKEN || '';
  if (!tk) return { ok: false, erro: 'falta a variável FRENET_TOKEN no Netlify (ou o site ainda não foi publicado de novo depois de criá-la)' };
  var ultimoErro = '';
  for (var i = 0; i < BASES.length; i++) {
    try {
      var r = await fetch(BASES[i] + caminho, {
        method: metodo,
        headers: Object.assign({ 'token': tk, 'Accept': 'application/json' }, corpo ? { 'Content-Type': 'application/json' } : {}),
        body: corpo ? JSON.stringify(corpo) : undefined
      });
      var txt = await r.text();
      var j = null; try { j = JSON.parse(txt); } catch (e) { j = null; }
      return { ok: r.ok, http: r.status, base: BASES[i].split(':')[0], resposta: j !== null ? j : txt.slice(0, 3000) };
    } catch (e) { ultimoErro = String(e && e.message || e); }
  }
  return { ok: false, erro: 'não consegui falar com a Frenet: ' + ultimoErro };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return resp({ ok: false, erro: 'use POST' }, 405);
  var d = {};
  try { d = JSON.parse(event.body || '{}') || {}; } catch (e) { d = {}; }
  var cab = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  var uid = await conferirAdmin(String(cab).replace(/^Bearer\s+/i, '') || d.idToken);
  if (!uid) return resp({ ok: false, erro: 'só admin' }, 401);
  var acao = String(d.acao || '');
  if (acao === 'servicos') return resp(await frenet('GET', '/shipping/info'));
  if (acao === 'rastrear') {
    var codigo = String(d.codigo || '').trim().toUpperCase();
    var servico = String(d.servico || '').trim();
    if (!/^[A-Z0-9]{8,40}$/.test(codigo)) return resp({ ok: false, erro: 'código inválido' }, 400);
    if (!servico || servico.length > 60) return resp({ ok: false, erro: 'informe o código do serviço (servico)' }, 400);
    var corpo = { ShippingServiceCode: servico, TrackingNumber: codigo };
    var cpf = String(d.cpf || '').replace(/\D/g, '');
    if (cpf.length === 11 || cpf.length === 14) corpo.RecipientDocument = cpf;
    return resp(await frenet('POST', '/tracking/trackinginfo', corpo));
  }
  return resp({ ok: false, erro: 'ação desconhecida' }, 400);
};
