'use strict';
/* =============================================================================
   painel-firebase.js — O FIREBASE PARA O PAINEL ÚNICO (VitaFlow)  ·  v1  ·  02/11/2026
   Netlify Function no repo vitaflow-proxy → netlify/functions/painel-firebase.js
   URL: https://vitaflow-proxy.netlify.app/.netlify/functions/painel-firebase

   POR QUE EXISTE: o Sistema de Compras (v64t) passou a rodar DENTRO do painel único (bloco 28). Lá o login é o do
   painel (JWT do banco novo), não o do Firebase Auth — e a página do painel não leva segredo nenhum. Esta função
   confere o login do painel e repassa a leitura/gravação ao Firebase com o segredo do servidor, nos MESMOS nós que o
   Compras sempre usou. Assim o Compras do painel e o Compras antigo (compras-vitaflow.netlify.app) gravam no mesmo
   lugar, na hora, e o GAS / Painel de Dados / Lucros / Athena continuam lendo o que sempre leram.

   CHAMADA: POST { tokenPainel, apikey, op:'GET'|'PUT'|'PATCH'|'DELETE', path:'vitaflow_compras/VF-…', query?, val? }
     · tokenPainel = JWT do login do painel (role authenticated); apikey = a chave pública (anon) do painel.
       Conferido em https://api.vitaflowoficial.com/auth/v1/user (o banco recusa token falso/vencido). Guarda o "sim" 10 min.
     · path: só nós da lista (LER / GRAVAR abaixo). Nunca admins, nunca a raiz.
     · query: só shallow / orderBy / startAt / endAt / equalTo / limitToFirst / limitToLast / print.
   RESPOSTA: { ok:true, status:200, data:<o que o Firebase devolveu> }  ·  erro: { ok:false, status, erro }
     Resposta grande (> 1 MB) vai comprimida (gzip + base64) — o navegador descomprime sozinho.

   Variáveis de ambiente (Netlify → vitaflow-proxy): FIREBASE_SECRET (já existe). Nada novo.
   ============================================================================= */

var zlib = require('zlib');
var crypto = require('crypto');

var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var FB_SECRET = process.env.FIREBASE_SECRET || '';
var VFDB = 'https://api.vitaflowoficial.com';
var LIMITE_PEDIDO = 5800000;     /* a Netlify corta corpo acima de 6 MB */
var COMPRIMIR_ACIMA = 1000000;

/* Nós que o Compras LÊ (qualquer filho) */
var LER = ['vitaflow_compras', 'vitaflow_compras_snapshots', 'vitaflow_compras_notas', 'vitaflow_compras_backup',
  'vitaflow_diario_compras', 'vitaflow_diario', 'vitaflow_diario_texto', 'vitaflow_diario_texto_em', 'vitaflow_lucro_diario',
  'vitaflow_sync', 'vitaflow_radar', 'vitaflow_atacado', 'vitaflow_cache_respect', 'vitaflow_cache_daniel', 'vitaflow_cache_daniel_fretes_feitos',
  'vitaflow_pedidos', 'vitaflow_pedidos_hdr', 'vitaflow_historico_status'];
/* Nós que o Compras GRAVA (PUT/PATCH/DELETE) — exatamente os que o compras_v64t.html grava */
var GRAVAR = ['vitaflow_compras', 'vitaflow_compras_snapshots', 'vitaflow_compras_notas', 'vitaflow_compras_backup',
  'vitaflow_diario_compras', 'vitaflow_diario', 'vitaflow_diario_texto', 'vitaflow_diario_texto_em', 'vitaflow_lucro_diario',
  'vitaflow_cache_daniel_fretes_feitos', 'vitaflow_atacado/tabela_fornecedor',
  'vitaflow_sync/preferencia_fornecedor', 'vitaflow_sync/pjc_lotes', 'vitaflow_sync/fornecedores_pausa', 'vitaflow_sync/fornecedores_custom', 'vitaflow_sync/lucro_pedidos'];
var QUERY_OK = ['shallow', 'orderBy', 'startAt', 'endAt', 'equalTo', 'limitToFirst', 'limitToLast', 'print'];

var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function resp(obj, http) {
  var corpo = JSON.stringify(obj);
  if (corpo.length > COMPRIMIR_ACIMA) {
    return { statusCode: http || 200, headers: Object.assign({}, CORS, { 'Content-Encoding': 'gzip' }), body: zlib.gzipSync(Buffer.from(corpo, 'utf8')).toString('base64'), isBase64Encoded: true };
  }
  return { statusCode: http || 200, headers: CORS, body: corpo };
}
function erro(status, msg) { return resp({ ok: false, status: status, erro: msg }, status === 401 ? 401 : 200); }

/* login do painel: JWT do banco novo (role authenticated), conferido no próprio banco; guarda o "sim" por 10 min */
var _vistos = {};
async function conferirPainel(token, apikey) {
  token = String(token || ''); apikey = String(apikey || '');
  if (token.split('.').length !== 3 || apikey.split('.').length !== 3) return '';
  var pl;
  try { pl = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return ''; }
  if (String(pl.role || '') !== 'authenticated' || !pl.sub) return '';
  var exp = Number(pl.exp || 0) * 1000;
  if (exp && exp <= Date.now()) return '';
  var k = crypto.createHash('sha256').update(token).digest('hex');
  var c = _vistos[k];
  if (c && c.ate > Date.now()) return c.email;
  try {
    var ctrl = new AbortController(); var t = setTimeout(function () { ctrl.abort(); }, 8000);
    var r = await fetch(VFDB + '/auth/v1/user', { headers: { apikey: apikey, Authorization: 'Bearer ' + token }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return '';
    var u = await r.json();
    var email = String(u && u.email || '');
    if (!email) return '';
    _vistos[k] = { email: email, ate: Math.min(Date.now() + 10 * 60 * 1000, exp || (Date.now() + 10 * 60 * 1000)) };
    return email;
  } catch (e) { return ''; }
}

function caminhoOk(path, lista) {
  if (!path || path.length > 400) return false;
  if (!/^[A-Za-z0-9_\-\.~:@ ]+(\/[A-Za-z0-9_\-\.~:@ ]+)*$/.test(path)) return false;
  if (path.indexOf('..') >= 0 || path.indexOf('.json') >= 0) return false;
  return lista.some(function (p) { return path === p || path.indexOf(p + '/') === 0; });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return erro(405, 'use POST');
  if (!FB_SECRET) return erro(500, 'variável FIREBASE_SECRET faltando');
  var d = {};
  try { d = JSON.parse(event.body || '{}') || {}; } catch (e) { d = {}; }
  var op = String(d.op || 'GET').toUpperCase();
  var path = String(d.path || '').replace(/^\/+|\/+$/g, '');
  if (['GET', 'PUT', 'PATCH', 'DELETE'].indexOf(op) < 0) return erro(400, 'op inválida');
  if (!caminhoOk(path, op === 'GET' ? LER : GRAVAR)) return erro(403, 'nó não permitido: ' + path.slice(0, 80));
  var email = await conferirPainel(d.tokenPainel, d.apikey);
  if (!email) return erro(401, 'nao_autorizado');
  var qs = ['auth=' + encodeURIComponent(FB_SECRET)];
  if (d.query && typeof d.query === 'object') {
    Object.keys(d.query).forEach(function (k) { if (QUERY_OK.indexOf(k) >= 0) qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(d.query[k]))); });
  }
  var url = FB_BASE + '/' + path.split('/').map(encodeURIComponent).join('/') + '.json?' + qs.join('&');
  var opts = { method: op, headers: {} };
  if (op === 'PUT' || op === 'PATCH') {
    if (d.val === undefined) return erro(400, 'sem valor');
    var corpo = JSON.stringify(d.val === undefined ? null : d.val);
    if (corpo.length > LIMITE_PEDIDO) return erro(413, 'valor grande demais para gravar por aqui (' + corpo.length + ' bytes)');
    opts.headers['Content-Type'] = 'application/json'; opts.body = corpo;
  }
  var ctrl = new AbortController(); var tm = setTimeout(function () { ctrl.abort(); }, 25000); opts.signal = ctrl.signal;
  try {
    var r = await fetch(url, opts);
    clearTimeout(tm);
    var txt = await r.text();
    var data = null;
    try { data = txt === '' ? null : JSON.parse(txt); } catch (e) { data = txt; }
    if (!r.ok) return resp({ ok: false, status: r.status, erro: (data && data.error) || ('firebase ' + r.status) });
    return resp({ ok: true, status: r.status, data: data, por: email });
  } catch (e) {
    clearTimeout(tm);
    return erro(502, 'erro: ' + String(e && e.message || e));
  }
};
