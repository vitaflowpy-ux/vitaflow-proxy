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
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'gerar_numero', tipo: tipo || 'M' }),
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch(e) { data = { order_nsu: text.trim() }; }

    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
