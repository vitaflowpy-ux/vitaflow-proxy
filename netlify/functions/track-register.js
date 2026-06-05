// netlify/functions/track-register.js  (hospedar no site vitaflow-proxy)
// Registra um código de rastreio no 17TRACK (auto-detecta a transportadora pelo número)
const API = 'https://api.17track.net/track/v2.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };

  const TRACK_KEY = process.env.TRACK17_API_KEY;
  if (!TRACK_KEY) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: 'TRACK17_API_KEY não configurada no Netlify' }) };

  try {
    const { number, order_id, carrier, param } = JSON.parse(event.body || '{}');
    if (!number) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: 'Número de rastreio vazio' }) };

    // Se o painel mandou a transportadora, usamos o código dela; senão, auto-detecção pelo número
    const item = { number: number, tag: order_id || '' };
    if (carrier) item.carrier = Number(carrier);
    // Algumas transportadoras (ex.: J&T Express BR) exigem CPF/CNPJ do destinatário como 'param'
    if (param) item.param = String(param);

    const resp = await fetch(API + '/register', {
      method: 'POST',
      headers: { '17token': TRACK_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify([item])
    });

    const data = await resp.json();
    const accepted = (data && data.data && data.data.accepted) || [];
    const rejected = (data && data.data && data.data.rejected) || [];

    if (accepted.length > 0) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, carrier: accepted[0].carrier || null }) };
    }

    const errCode = rejected[0] && rejected[0].error && rejected[0].error.code;
    const errMsg  = (rejected[0] && rejected[0].error && rejected[0].error.message) || ('Resposta 17TRACK: ' + JSON.stringify(data));
    // -18019901 = já estava registrado.
    // Se temos CPF (param) ou transportadora (carrier) para gravar, ATUALIZA via /changeinfo
    // (o /register ignora dados novos de um código já existente — por isso o CPF não "ia" antes).
    if (errCode === -18019901) {
      if (param || carrier) {
        const changeItem = { number: number };
        if (carrier) changeItem.carrier = Number(carrier);
        if (param) changeItem.param = String(param);
        try {
          const respC = await fetch(API + '/changeinfo', {
            method: 'POST',
            headers: { '17token': TRACK_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify([changeItem])
          });
          const dataC = await respC.json();
          const acceptedC = (dataC && dataC.data && dataC.data.accepted) || [];
          if (acceptedC.length > 0) {
            return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, updated: true }) };
          }
          const errC = (dataC && dataC.data && dataC.data.rejected && dataC.data.rejected[0] && dataC.data.rejected[0].error) || {};
          // se o changeinfo também recusar, devolve a info pra diagnóstico
          return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, already_registered: true, update_failed: errC.message || true }) };
        } catch (eC) {
          return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, already_registered: true, update_error: eC.message }) };
        }
      }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, already_registered: true }) };
    }
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: errMsg, code: errCode }) };

  } catch (e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
