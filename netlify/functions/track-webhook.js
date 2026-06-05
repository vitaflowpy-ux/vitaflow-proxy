// netlify/functions/track-webhook.js  (hospedar no site vitaflow-proxy)
// Recebe o push do 17TRACK quando o status muda e repassa ao GAS no formato que ele já entende
// (GAS dispara email + Telegram via o handler TRACKING_UPDATED já existente).
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxFlaN0FXFbpcC8HZ80sxnq383m5d-xTaj5cg72VcCdnYx47N_qKkiELFN5KAPmm_nb/exec';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function statusDe(ti) {
  if (ti && ti.latest_status && ti.latest_status.status) return ti.latest_status.status;
  return 'InTransit';
}
function eventoDe(ti) {
  if (!ti) return '';
  if (ti.latest_event && ti.latest_event.description) return ti.latest_event.description;
  if (ti.tracking && ti.tracking.providers && ti.tracking.providers[0]
      && ti.tracking.providers[0].events && ti.tracking.providers[0].events[0]) {
    return ti.tracking.providers[0].events[0].description || '';
  }
  return '';
}

// Normaliza qualquer formato do push do 17TRACK numa lista de itens simples
function normalizar(body) {
  const itens = [];
  const data = body && body.data;
  let arr = [];
  if (Array.isArray(data)) arr = data;
  else if (data && Array.isArray(data.accepted)) arr = data.accepted;
  else if (data && data.number) arr = [data];
  arr.forEach(it => {
    const ti = it.track_info || it;
    itens.push({
      number: it.number || '',
      tag: it.tag || it.number || '',
      status: statusDe(ti),
      last_event: eventoDe(ti)
    });
  });
  return itens;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 200, headers: cors, body: 'ok' };

  try {
    const body = JSON.parse(event.body || '{}');
    const itens = normalizar(body);

    if (itens.length) {
      // Repassa ao GAS no formato esperado pelo handler TRACKING_UPDATED já existente
      const payload = {
        event: 'TRACKING_UPDATED',
        data: {
          accepted: itens.map(i => ({
            number: i.number,
            tag: i.tag,
            latest_status: { status: i.status },
            tracking: { providers: [{ events: [{ description: i.last_event }] }] }
          }))
        }
      };
      await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    // 17TRACK espera 200 rápido
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
