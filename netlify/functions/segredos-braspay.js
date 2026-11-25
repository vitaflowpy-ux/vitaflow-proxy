'use strict';
/* segredos-braspay.js — FUNÇÃO TEMPORÁRIA (proxy) · 25/11/2026 · script 146 (Lote 3: a Bras Pay passa a rodar também no servidor)
   Mesmo caminho da segredos-lote1 e da segredos-lote2 (aprovado em 15/11, usado em 18/11): entrega ao SERVIDOR as chaves da Bras Pay que
   já estão no Netlify, para ninguém copiar chave à mão — o portal da Bras Pay e o Netlify não mostram mais os valores, e trocar o segredo
   do aviso derrubaria o Pix do site. Só responde a POST vindo do IP do servidor, com o x-cron-secret certo, e para sozinha na data abaixo.
   Não tem segredo nenhum escrito aqui. É apagada depois que o 146 rodar. */
var crypto = require('crypto');
var IPS = ['65.21.253.40', '2a01:4f9:c01e:234::1'];
var VENCE = Date.parse('2026-11-27T06:00:00Z');
var NOMES = ['BRASPAY_API_KEY', 'BRASPAY_WEBHOOK_SECRET', 'BRASPAY_USDT_CREDITO', 'BRASPAY_CARTAZ_BRCODE'];
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
