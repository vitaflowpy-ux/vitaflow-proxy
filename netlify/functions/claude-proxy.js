'use strict';
/* =============================================================================
   claude-proxy.js — IA DO SISTEMA DE COMPRAS (VitaFlow)  ·  v2  ·  19/11/2026
   v2 (19/11/2026 — Thiago: "ok, sem teto, pode fazer"; desenho revisto pelo GPT-6): a função respondia SEM LOGIN e repassava QUALQUER
     corpo para a API da Anthropic com a chave da VitaFlow (qualquer pessoa com o endereço usava a chave). Agora:
     · exige login (admin do Firebase ou painel único — ver login()); sem login = 401; login sem permissão = 403;
     · o corpo que vai para a Anthropic é MONTADO AQUI, só com o que o Compras usa: model (lista fechada), max_tokens (até 4.000) e
       messages (texto e imagem em base64). Nada de tools, stream, system ou campo desconhecido;
     · freio de chamadas por usuário; registro só com metadados (quem, modelo, status, ms) — sem token, pedido ou imagem.
   Quem chama: Sistema de Compras v90+ (➕ Novo pedido › Importar por IA; 🏷️ leitura de etiqueta por imagem), na página sozinha e
   dentro do painel único (v47+).
   CHAMADA: POST { tokenAdmin | (tokenPainel + apikey), model, max_tokens, messages }
   RESPOSTA: a da Anthropic, como sempre ({content:[…]} ou {error:{message}}).
   Variável de ambiente: ANTHROPIC_API_KEY (a mesma de antes).
   ============================================================================= */
var crypto = require('crypto');
var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var VFDB = 'https://api.vitaflowoficial.com';

/* ---- LOGIN (igual à função estoque v4) ----
   · página sozinha (Compras / Orçamento): tokenAdmin = idToken do Firebase Auth, conferido lendo admins/<uid> com o próprio token;
   · painel único: tokenPainel + apikey, conferidos no banco (/auth/v1/user); o "sim" vale 10 min;
   · rodando no SERVIDOR (executor funcoes_srv, que só existe lá): o executor já conferiu o login do painel e manda o e-mail no
     cabeçalho x-vf-painel-email. Esse cabeçalho só vale quando a variável FN_DIR existe (só o executor do servidor a cria) — no
     Netlify ele é ignorado.
   Devolve { quem } ou { status: 401 | 403 }. */
var _painelVistos = {};
async function conferirAdmin(token) {
  token = String(token || '');
  var partes = token.split('.');
  if (partes.length !== 3) return { status: 401 };
  var uid = '';
  try { var pl = JSON.parse(Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); uid = pl.user_id || pl.sub || ''; } catch (e) { return { status: 401 }; }
  if (!uid || !/^[A-Za-z0-9]+$/.test(uid)) return { status: 401 };
  try {
    var r = await fetch(FB_BASE + '/admins/' + uid + '.json?auth=' + encodeURIComponent(token));
    if (!r.ok) return { status: 401 };
    return (await r.json()) === true ? { quem: 'admin:' + uid } : { status: 403 };
  } catch (e) { return { status: 401 }; }
}
async function conferirPainel(token, apikey) {
  token = String(token || ''); apikey = String(apikey || '');
  if (token.split('.').length !== 3 || apikey.split('.').length !== 3) return { status: 401 };
  var pl;
  try { pl = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return { status: 401 }; }
  if (!pl.sub) return { status: 401 };
  if (String(pl.role || '') !== 'authenticated') return { status: 403 };
  var exp = Number(pl.exp || 0) * 1000;
  if (exp && exp <= Date.now()) return { status: 401 };
  var k = crypto.createHash('sha256').update(token).digest('hex');
  var c = _painelVistos[k];
  if (c && c.ate > Date.now()) return { quem: 'painel:' + c.email };
  try {
    var ctrl = new AbortController(); var t = setTimeout(function () { ctrl.abort(); }, 8000);
    var r = await fetch(VFDB + '/auth/v1/user', { headers: { apikey: apikey, Authorization: 'Bearer ' + token }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return { status: 401 };
    var u = await r.json();
    var email = String(u && u.email || '').toLowerCase();
    if (!email) return { status: 401 };
    _painelVistos[k] = { email: email, ate: Math.min(Date.now() + 10 * 60 * 1000, exp || (Date.now() + 10 * 60 * 1000)) };
    return { quem: 'painel:' + email };
  } catch (e) { return { status: 401 }; }
}
async function login(event, d) {
  var hs = event.headers || {};
  var noServidor = String(hs['x-vf-painel-email'] || '').toLowerCase();
  if (process.env.FN_DIR && noServidor) return { quem: 'painel:' + noServidor };
  if (d && d.tokenPainel) return await conferirPainel(d.tokenPainel, d.apikey);
  if (d && d.tokenAdmin) return await conferirAdmin(d.tokenAdmin);
  return { status: 401 };
}
/* ---- freio simples por usuário (por instância da função): no máximo LIMITE_MIN chamadas por minuto ---- */
var _uso = {};
function passouDoLimite(quem) {
  var agora = Date.now(), l = (_uso[quem] || []).filter(function (t) { return agora - t < 60000; });
  if (l.length >= LIMITE_MIN) { _uso[quem] = l; return true; }
  l.push(agora); _uso[quem] = l;
  return false;
}

var MODELOS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929', 'claude-sonnet-4-6'];
var MAX_TOKENS = 4000, MAX_CORPO = 5800000, MAX_MSGS = 12, MAX_TEXTO = 200000, LIMITE_MIN = 40;
var MIDIAS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
var CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
function sai(status, obj) { return { statusCode: status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, CORS), body: typeof obj === 'string' ? obj : JSON.stringify(obj) }; }
function recusa(status, msg) { return sai(status, { error: { message: msg } }); }

/* monta as mensagens só com o que é aceito; devolve null se vier algo fora do combinado */
function limparMensagens(msgs) {
  if (!Array.isArray(msgs) || !msgs.length || msgs.length > MAX_MSGS) return null;
  var out = [], texto = 0;
  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i];
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return null;
    if (typeof m.content === 'string') { texto += m.content.length; out.push({ role: m.role, content: m.content }); continue; }
    if (!Array.isArray(m.content) || !m.content.length || m.content.length > 12) return null;
    var blocos = [];
    for (var j = 0; j < m.content.length; j++) {
      var b = m.content[j];
      if (b && b.type === 'text' && typeof b.text === 'string') { texto += b.text.length; blocos.push({ type: 'text', text: b.text }); }
      else if (b && b.type === 'image' && b.source && b.source.type === 'base64' && MIDIAS.indexOf(b.source.media_type) >= 0
               && typeof b.source.data === 'string' && b.source.data.length > 0 && /^[A-Za-z0-9+/=\r\n]+$/.test(b.source.data.slice(0, 2000))) {
        blocos.push({ type: 'image', source: { type: 'base64', media_type: b.source.media_type, data: b.source.data } });
      } else return null;
    }
    out.push({ role: m.role, content: blocos });
  }
  if (texto > MAX_TEXTO) return null;
  return out;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return recusa(405, 'use POST');
  var ini = Date.now(), bruto = String(event.body || '');
  if (bruto.length > MAX_CORPO) return recusa(413, 'pedido grande demais (a imagem passou do limite)');
  var d;
  try { d = JSON.parse(bruto || '{}'); } catch (e) { return recusa(400, 'corpo inválido'); }
  if (!d || typeof d !== 'object') return recusa(400, 'corpo inválido');
  var L = await login(event, d);
  if (!L.quem) return recusa(L.status === 403 ? 403 : 401, L.status === 403 ? 'seu login não tem permissão para usar a IA' : 'faça login de novo (atualize a página com F5)');
  if (passouDoLimite(L.quem)) return recusa(429, 'muitas chamadas em 1 minuto — espere um pouco');
  if (d.stream || d.tools || d.tool_choice) return recusa(400, 'pedido fora do combinado');
  var modelo = String(d.model || '');
  if (MODELOS.indexOf(modelo) < 0) return recusa(400, 'modelo fora da lista');
  var mt = parseInt(d.max_tokens, 10);
  if (!(mt >= 1)) return recusa(400, 'max_tokens inválido');
  if (mt > MAX_TOKENS) mt = MAX_TOKENS;
  var msgs = limparMensagens(d.messages);
  if (!msgs) return recusa(400, 'mensagens fora do combinado');
  if (!process.env.ANTHROPIC_API_KEY) return recusa(500, 'IA sem chave no servidor');
  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modelo, max_tokens: mt, messages: msgs })
    });
    var data = await response.text();
    console.log('claude-proxy', L.quem, modelo, response.status, (Date.now() - ini) + 'ms');
    return sai(response.status, data);
  } catch (err) {
    console.log('claude-proxy', L.quem, modelo, 'erro', (Date.now() - ini) + 'ms');
    return recusa(500, String(err && err.message || err));
  }
};
