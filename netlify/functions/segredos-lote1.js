// segredos-lote1.js — TEMPORÁRIA (18/11/2026, script 93). Entrega ao SERVIDOR as variáveis do vitaflow-proxy que os robôs do Lote 1 usam
// (grupo-vip-agenda, logistica-bot abertura, logistica-atrasos): Telegram, Z-API (grupos e logística), IDs dos grupos e Brevo.
// Thiago (18/11): "vc ja sabe que não tem como copiar as chaves do netlify pq não aparecem! de seu jeito de mandar para lá".
// Mesmo caminho aprovado em 15/11 para a saída do Netlify: trava dupla igual à shopify-ponte — (1) só os IPs do servidor
// (x-nf-client-connection-ip, posto pelo Netlify) e (2) cabeçalho x-cron-secret = CRON_SECRET. Só POST. Nada é impresso nem vai para log.
// Para de funcionar sozinha em 19/11/2026 06:00 UTC e o Claude apaga o arquivo logo depois do script 93.
'use strict';
const crypto = require('crypto');
const IPS = ['65.21.253.40', '2a01:4f9:c01e:234::1'];
const VALE_ATE = Date.parse('2026-11-19T06:00:00Z');
const NOMES = ['TELEGRAM_TOKEN', 'TELEGRAM_CHAT', 'ZAPI_INSTANCE', 'ZAPI_TOKEN', 'ZAPI_CLIENT_TOKEN', 'GRUPO_VIP_ID', 'GRUPO_VIP2_ID',
               'LOG_ZAPI_INSTANCE', 'LOG_ZAPI_TOKEN', 'BREVO_API_KEY'];
const CAB = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
function igual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}
exports.handler = async (event) => {
  const nao = (c) => ({ statusCode: c, headers: CAB, body: JSON.stringify({ ok: false }) });
  if (Date.now() > VALE_ATE) return nao(410);
  if ((event && event.httpMethod) !== 'POST') return nao(405);
  const h = (event && event.headers) || {};
  const ip = String(h['x-nf-client-connection-ip'] || '').trim().toLowerCase();
  if (!ip || IPS.indexOf(ip) < 0) return nao(403);
  if (!process.env.CRON_SECRET || !igual(h['x-cron-secret'], process.env.CRON_SECRET)) return nao(403);
  const vars = {};
  NOMES.forEach((n) => { const v = process.env[n]; if (v != null && String(v).trim() !== '') vars[n] = String(v).trim(); });
  return { statusCode: 200, headers: CAB, body: JSON.stringify({ ok: true, vars, faltam: NOMES.filter((n) => !(n in vars)) }) };
};
