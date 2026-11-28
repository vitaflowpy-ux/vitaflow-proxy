// netlify/functions/gerar-numero.js
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxFlaN0FXFbpcC8HZ80sxnq383m5d-xTaj5cg72VcCdnYx47N_qKkiELFN5KAPmm_nb/exec';

exports.handler = async function(event, context) {
  // Desabilita retry automático do Netlify
  context.callbackWaitsForEmptyEventLoop = false;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { tipo } = JSON.parse(event.body || '{}');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'gerar_numero', tipo: tipo || 'M' }),
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch(e) { data = null; }
    // 26/11/2026: antes, quando o Apps Script devolvia uma página de erro, o TEXTO DO ERRO saía como order_nsu com HTTP 200
    // (quem chamava usava aquilo como número do pedido). Agora só passa adiante um número de verdade; o resto é erro 502.
    if (!data || typeof data !== 'object' || Array.isArray(data)) data = { order_nsu: String(text || '').trim() };   // formato antigo: só o texto do número
    const numero = String(data.order_nsu || '').trim();
    if (!res.ok || !/^VF-\d{4}-[A-Z]X?\d{1,4}$/.test(numero)) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'o Apps Script não devolveu um número de pedido válido', status: res.status }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
