'use strict';
/* segredos-lote2.js — FUNÇÃO TEMPORÁRIA (proxy) · 18/11/2026 · script 95 (Lote 2: funções do painel único passam a rodar no servidor)
   Mesmo caminho da segredos-lote1 (aprovado em 15/11 e usado em 18/11): entrega ao SERVIDOR as variáveis que as funções do Lote 2 usam,
   para ninguém copiar chave à mão. Só responde a POST vindo do IP do servidor, com o x-cron-secret certo, e para sozinha na data abaixo.
   Não tem segredo nenhum escrito aqui. O Claude apaga esta função depois que o 95 rodar. */
var crypto = require('crypto');
var IPS = ['65.21.253.40', '2a01:4f9:c01e:234::1'];
var VENCE = Date.parse('2026-11-22T06:00:00Z');
var NOMES = ['ANTHROPIC_API_KEY', 'FIREBASE_SECRET', 'COMPRAS_KEY', 'FIRESTORE_KEY', 'RODADA_BOT_CHAVE', 'BREVO_API_KEY', 'LOG_ZAPI_INSTANCE', 'LOG_ZAPI_TOKEN', 'ZAPI_CLIENT_TOKEN', 'GDRIVE_FILE_ID', 'GDRIVE_SA_EMAIL', 'GDRIVE_SA_KEY', 'PUBLICAR_SECRET'];
function igual(a, b) {
  var x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
exports.handler = async function (event) {
  var H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  var h = event.headers || {};
  var ip = String(h['x-nf-client-connection-ip'] || '').trim();
  if (IPS.indexOf(ip) < 0) return { statusCode: 403, headers: H, body: '{"erro":"negado"}' };
  if (!igual(h['x-cron-secret'], process.env.CRON_SECRET)) return { statusCode: 403, headers: H, body: '{"erro":"negado"}' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: H, body: '{"erro":"use POST"}' };
  if (Date.now() > VENCE) return { statusCode: 410, headers: H, body: '{"erro":"vencida"}' };
  var v = {}, ausentes = [];
  NOMES.forEach(function (n) { var x = process.env[n]; if (x == null || x === '') ausentes.push(n); else v[n] = String(x); });
  return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, site: 'proxy', v: v, ausentes: ausentes }) };
};
