// netlify/functions/send-whatsapp.js
const API_KEY = '8c9e69c3-3c9f-4f23-b480-be4a0de29640';
const BASE = 'https://backend.botconversa.com.br/api/v1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

function normalizarPhone(raw) {
  // Remove tudo que não é número
  let digits = (raw || '').replace(/\D/g, '');
  // Se vier com 55 na frente (ex: 5521998...) e tiver 12-13 dígitos, ok
  // Se vier sem 55 (ex: 21998...) e tiver 10-11 dígitos, adiciona 55
  if (digits.length <= 11) digits = '55' + digits;
  // BotConversa espera sem o +
  return digits;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const { phone, nome, message } = body;
  if (!phone || !message) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'phone e message obrigatórios' }) };
  }

  const phoneNorm = normalizarPhone(phone);
  console.log('Phone normalizado:', phoneNorm);

  try {
    // 1. Busca subscriber pelo telefone (sem +)
    let subscriberId = null;
    const r1 = await fetch(`${BASE}/subscriber/get_by_phone/${phoneNorm}/`, {
      headers: { 'api-key': API_KEY }
    });
    console.log('get_by_phone status:', r1.status);

    if (r1.ok) {
      const s = await r1.json();
      subscriberId = s?.id || null;
      console.log('Subscriber encontrado:', subscriberId);
    }

    // 2. Se não encontrou, cria
    if (!subscriberId) {
      const payload = { phone: phoneNorm, name: nome || 'Cliente' };
      console.log('Criando subscriber:', JSON.stringify(payload));

      const r2 = await fetch(`${BASE}/subscriber/`, {
        method: 'POST',
        headers: { 'api-key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const r2text = await r2.text();
      console.log('Criar subscriber status:', r2.status, '| body:', r2text);

      if (r2.ok) {
        try { subscriberId = JSON.parse(r2text)?.id || null; } catch {}
      } else {
        return {
          statusCode: 502, headers: CORS,
          body: JSON.stringify({ error: `Erro ao criar contato (${r2.status}): ${r2text}` })
        };
      }
    }

    if (!subscriberId) {
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Subscriber não encontrado e não foi possível criar.' }) };
    }

    // 3. Envia mensagem
    const r3 = await fetch(`${BASE}/subscriber/${subscriberId}/send_message/`, {
      method: 'POST',
      headers: { 'api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', value: message })
    });

    const r3text = await r3.text();
    console.log('send_message status:', r3.status, '| body:', r3text);

    if (r3.ok) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, subscriberId }) };
    } else {
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: `Erro ao enviar (${r3.status}): ${r3text}` }) };
    }

  } catch (e) {
    console.error('Exceção:', e.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: `Erro interno: ${e.message}` }) };
  }
};
