// netlify/functions/track-status.js  (hospedar no site vitaflow-proxy)
// Consulta o status atual de vários códigos no 17TRACK (gettrackinfo)
const API = 'https://api.17track.net/track/v2.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function extrairStatus(ti) {
  if (!ti) return { status: 'NotFound', last_event: '' };
  var status = (ti.latest_status && ti.latest_status.status) || 'InTransit';
  var lastEvent = '';
  if (ti.latest_event && ti.latest_event.description) {
    lastEvent = ti.latest_event.description;
  } else if (ti.tracking && ti.tracking.providers && ti.tracking.providers[0]
             && ti.tracking.providers[0].events && ti.tracking.providers[0].events[0]) {
    lastEvent = ti.tracking.providers[0].events[0].description || '';
  }
  return { status: status, last_event: lastEvent };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const TRACK_KEY = process.env.TRACK17_API_KEY;
  if (!TRACK_KEY) return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'TRACK17_API_KEY não configurada', results: [] }) };

  try {
    const { numbers } = JSON.parse(event.body || '{}');
    const lista = (numbers || []).filter(Boolean);
    if (!lista.length) return { statusCode: 200, headers: cors, body: JSON.stringify({ results: [] }) };

    // 17TRACK aceita até 40 por chamada
    const results = [];
    for (let i = 0; i < lista.length; i += 40) {
      const lote = lista.slice(i, i + 40).map(n => ({ number: n }));
      const resp = await fetch(API + '/gettrackinfo', {
        method: 'POST',
        headers: { '17token': TRACK_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(lote)
      });
      const data = await resp.json();
      const accepted = (data && data.data && data.data.accepted) || [];
      accepted.forEach(a => {
        const st = extrairStatus(a.track_info);
        results.push({ number: a.number, status: st.status, last_event: st.last_event });
      });
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ results }) };
  } catch (e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ error: e.message, results: [] }) };
  }
};
