// netlify/functions/send-whatsapp.js
// Envia mensagem WhatsApp via BotConversa API (server-side, sem CORS)

const API_KEY = '8c9e69c3-3c9f-4f23-b480-be4a0de29640';
const BASE = 'https://backend.botconversa.com.br/api/v1';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { phone, nome, message } = body;
  if (!phone || !message) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'phone e message obrigatórios' }) };
  }

  try {
    // 1. Tenta buscar subscriber pelo telefone
    let subscriberId = null;

    const r1 = await fetch(`${BASE}/subscriber/get_by_phone/${encodeURIComponent(phone)}/`, {
      headers: { 'api-key': API_KEY }
    });

    if (r1.ok) {
      const s = await r1.json();
      subscriberId = s?.id || null;
    }

    // 2. Se não encontrou, cria novo subscriber
    if (!subscriberId) {
      const r2 = await fetch(`${BASE}/subscriber/`, {
        method: 'POST',
        headers: { 'api-key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, name: nome || 'Cliente' })
      });

      if (r2.ok) {
        const s = await r2.json();
        subscriberId = s?.id || null;
      } else {
        const errBody = await r2.text();
        console.error('Erro ao criar subscriber:', errBody);
        return { statusCode: 502, headers, body: JSON.stringify({ error: `Erro ao criar contato: ${errBody}` }) };
      }
    }

    if (!subscriberId) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Contato não encontrado e não foi possível criar.' }) };
    }

    // 3. Envia mensagem
    const r3 = await fetch(`${BASE}/subscriber/${subscriberId}/send_message/`, {
      method: 'POST',
      headers: { 'api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', value: message })
    });

    if (r3.ok) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, subscriberId }) };
    } else {
      const errBody = await r3.text();
      console.error('Erro ao enviar mensagem:', errBody);
      return { statusCode: 502, headers, body: JSON.stringify({ error: `Erro ao enviar: ${errBody}` }) };
    }

  } catch (e) {
    console.error('Exceção:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Erro interno: ${e.message}` }) };
  }
};
