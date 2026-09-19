/* grupo-vip-agenda.js — Agendador dos posts do Bot do Grupo VIP (19/09/2026)
 *
 * Companheiro do grupo-vip.js. Enquanto o grupo-vip.js RESPONDE (webhook do Z-API),
 * este PUBLICA: de tempos em tempos olha a fila em vitaflow_sync/grupo_vip/agenda,
 * manda o que venceu e fixa no grupo se o post pedir.
 *
 * Quem chama: cron-job.org, a cada 15 min, com ?secret=<CRON_SECRET>.
 * NAO e funcao agendada da Netlify de proposito — todo o resto do ecossistema ja e
 * disparado pelo cron-job.org, e um lugar so pra olhar quando algo nao rodar.
 *
 * Quem enche a fila: painel_grupo_vip.html (aba Agenda), que grava
 *   agenda/<id> = { texto, imagem, quando (ms), fixar: ''|'24_hours'|'7_days'|'30_days',
 *                   status: 'pendente', criado }
 *   imagem = URL do CDN do Shopify (opcional). Tendo imagem, o post sai por /send-image
 *   com o texto como legenda; sem imagem, sai por /send-text.
 *
 * Variaveis de ambiente (projeto Netlify vitaflow-proxy):
 *   ZAPI_INSTANCE, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN, FIREBASE_SECRET, GRUPO_VIP_ID,
 *   TELEGRAM_TOKEN, TELEGRAM_CHAT, CRON_SECRET
 */

var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';

/* Mesmo no do grupo-vip.js. RAIZ e FILHO de vitaflow_sync de proposito: no novo de
   TOPO e negado pelas regras do RTDB — esta funcao passaria, porque usa o
   FIREBASE_SECRET, mas o painel escreve com o login do admin e seria recusado em
   silencio. */
var RAIZ = 'vitaflow_sync/grupo_vip';

var ZAPI_INSTANCE = process.env.ZAPI_INSTANCE || '';
var ZAPI_TOKEN = process.env.ZAPI_TOKEN || '';
var CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || '';
var FB_SECRET = process.env.FIREBASE_SECRET || '';
var GRUPO_VIP_ID = (process.env.GRUPO_VIP_ID || '').trim();
var TG_TOKEN = process.env.TELEGRAM_TOKEN || '';
var TG_CHAT = process.env.TELEGRAM_CHAT || '';
var CRON_SECRET = process.env.CRON_SECRET || '';

/* Quanto tempo depois da hora marcada um post ainda pode sair. Passou disso, ele e
   marcado 'expirado' e NAO vai. Sem esta trava, a funcao ficar 8h fora do ar faria o
   grupo receber a fila inteira de madrugada, de uma vez. */
var ATRASO_MAX_MIN = 180;

/* Teto por execucao. A cada 15 min ja da 12 posts/hora de capacidade, muito acima dos
   3-4 por dia combinados — e segura rajada se algo se acumular. */
var MAX_POR_VOLTA = 3;

/* Intervalo entre um envio e o proximo, pra nao mandar em rajada. */
var PAUSA_MS = 1500;

/* Um post que ficou 'enviando' mais que isso e considerado travado (a funcao morreu no
   meio) e volta pra fila. */
var TRAVA_ENVIANDO_MIN = 15;

function fbUrl(caminho) {
  return FB_BASE + '/' + caminho + '.json' + (FB_SECRET ? '?auth=' + FB_SECRET : '');
}

async function fbGet(caminho) {
  try {
    var r = await fetch(fbUrl(caminho));
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

/* PATCH em vez de PUT: mexe so nos campos passados e nao apaga o resto do registro. */
async function fbPatch(caminho, obj) {
  try {
    var r = await fetch(fbUrl(caminho), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj)
    });
    return r.ok;
  } catch (e) { return false; }
}

function zapiUrl(rota) {
  return 'https://api.z-api.io/instances/' + ZAPI_INSTANCE + '/token/' + ZAPI_TOKEN + '/' + rota;
}

function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function telegram(texto) {
  if (!TG_TOKEN || !TG_CHAT) return false;
  try {
    await fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: texto })
    });
    return true;
  } catch (e) { return false; }
}

/* Envia e devolve o messageId, que o pin precisa. */
async function enviarTexto(texto) {
  var r = await fetch(zapiUrl('send-text'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': CLIENT_TOKEN },
    body: JSON.stringify({ phone: GRUPO_VIP_ID, message: texto })
  });
  var corpo = null;
  try { corpo = await r.json(); } catch (e) { corpo = null; }
  if (!r.ok) {
    throw new Error('Z-API send-text HTTP ' + r.status + ' ' + JSON.stringify(corpo));
  }
  return (corpo && (corpo.messageId || corpo.id)) || '';
}

/* Post com imagem sai por /send-image, com o texto como LEGENDA. A imagem e uma URL
   do CDN do Shopify, subida pelo painel via atacado-imagem-upload — no Firebase fica
   so a URL. Devolve o messageId, igual ao texto, pro pin funcionar do mesmo jeito. */
async function enviarImagem(urlImagem, legenda) {
  var r = await fetch(zapiUrl('send-image'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': CLIENT_TOKEN },
    body: JSON.stringify({ phone: GRUPO_VIP_ID, image: urlImagem, caption: legenda || '' })
  });
  var corpo = null;
  try { corpo = await r.json(); } catch (e) { corpo = null; }
  if (!r.ok) {
    throw new Error('Z-API send-image HTTP ' + r.status + ' ' + JSON.stringify(corpo));
  }
  return (corpo && (corpo.messageId || corpo.id)) || '';
}

/* Fixar e OPCIONAL: se falhar, o post ja foi e nao vamos reenviar por causa disso.
   Retorna o motivo da falha (string) ou '' se deu certo. */
async function fixar(messageId, duracao) {
  if (!messageId) return 'sem messageId no retorno do envio';
  try {
    var r = await fetch(zapiUrl('pin-message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': CLIENT_TOKEN },
      body: JSON.stringify({
        phone: GRUPO_VIP_ID,
        messageId: messageId,
        messageAction: 'pin',
        pinMessageDuration: duracao
      })
    });
    if (!r.ok) return 'HTTP ' + r.status;
    return '';
  } catch (e) { return e.message; }
}

/* Decide o que fazer com cada post. Separado do envio pra poder ser testado sozinho. */
function triar(agenda, agora) {
  var vencidos = [], expirados = [], ids = Object.keys(agenda || {});
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i], p = agenda[id];
    /* Post pode ser so imagem (a legenda fica vazia) ou so texto. Sem nenhum dos dois, ignora. */
    if (!p || typeof p !== 'object' || (!p.texto && !p.imagem)) continue;

    var st = String(p.status || 'pendente');

    /* Post travado em 'enviando' (a funcao morreu no meio) volta pra fila. */
    if (st === 'enviando') {
      var desde = Number(p.lock || 0);
      if (agora - desde < TRAVA_ENVIANDO_MIN * 60000) continue;
    } else if (st !== 'pendente') {
      continue;
    }

    var quando = Number(p.quando || 0);
    if (!quando || quando > agora) continue;

    if (agora - quando > ATRASO_MAX_MIN * 60000) { expirados.push({ id: id, p: p }); continue; }
    vencidos.push({ id: id, p: p });
  }
  /* Mais antigo primeiro, pra sair na ordem em que foi agendado. */
  vencidos.sort(function (a, b) { return Number(a.p.quando) - Number(b.p.quando); });
  return { vencidos: vencidos, expirados: expirados };
}

exports.handler = async function (event) {
  var q = (event && event.queryStringParameters) || {};
  var headers = { 'Content-Type': 'application/json; charset=utf-8' };

  /* Falha fechada: sem CRON_SECRET configurado a funcao nao roda. Melhor nao publicar
     do que deixar qualquer um disparar post no grupo. */
  if (!CRON_SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, erro: 'CRON_SECRET nao configurada' }) };
  }
  var enviado = q.secret || (event.headers && event.headers['x-cron-secret']) || '';
  if (enviado !== CRON_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, erro: 'nao_autorizado' }) };
  }
  if (!GRUPO_VIP_ID) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, erro: 'GRUPO_VIP_ID vazia' }) };
  }
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, erro: 'Z-API nao configurada' }) };
  }

  var agora = Date.now();
  var agenda = await fbGet(RAIZ + '/agenda');
  var t = triar(agenda, agora);

  /* Expirados primeiro: so marca, nao manda nada. */
  var i;
  for (i = 0; i < t.expirados.length; i++) {
    var ex = t.expirados[i];
    await fbPatch(RAIZ + '/agenda/' + ex.id, {
      status: 'expirado',
      erro: 'passou de ' + ATRASO_MAX_MIN + ' min da hora marcada — nao enviado',
      fechado_em: agora
    });
    await telegram('⏰ Post do Grupo VIP EXPIROU (nao foi enviado)\n\nMarcado para: ' +
      new Date(Number(ex.p.quando)).toISOString() + '\nTexto: ' + String(ex.p.texto).slice(0, 120));
  }

  var lote = t.vencidos.slice(0, MAX_POR_VOLTA);
  var enviados = 0, falhas = 0, detalhes = [];

  for (i = 0; i < lote.length; i++) {
    var item = lote[i], id = item.id, post = item.p;

    /* Marca ANTES de enviar. Se a funcao morrer no meio do envio, o post fica em
       'enviando' e so volta pra fila depois de TRAVA_ENVIANDO_MIN — repetir um post no
       grupo e pior do que atrasar. */
    await fbPatch(RAIZ + '/agenda/' + id, { status: 'enviando', lock: Date.now() });

    try {
      var messageId = post.imagem
        ? await enviarImagem(String(post.imagem), String(post.texto || ''))
        : await enviarTexto(String(post.texto));
      var aviso = '';
      if (post.fixar) {
        var erroPin = await fixar(messageId, String(post.fixar));
        if (erroPin) {
          aviso = 'enviado, mas nao fixou: ' + erroPin;
          await telegram('📌 Post do Grupo VIP foi enviado mas NAO fixou.\n' + erroPin +
            '\n(o numero do bot e admin do grupo?)');
        }
      }
      await fbPatch(RAIZ + '/agenda/' + id, {
        status: 'enviado',
        enviado_em: Date.now(),
        messageId: messageId || '',
        aviso: aviso,
        lock: null
      });
      enviados++;
      detalhes.push({ id: id, ok: true, aviso: aviso });
    } catch (e) {
      var tent = Number(post.tentativas || 0) + 1;
      var desiste = tent >= 3;
      await fbPatch(RAIZ + '/agenda/' + id, {
        status: desiste ? 'falhou' : 'pendente',
        tentativas: tent,
        erro: String(e.message).slice(0, 300),
        lock: null
      });
      falhas++;
      detalhes.push({ id: id, ok: false, tentativa: tent, erro: String(e.message).slice(0, 200) });
      await telegram('❌ Post do Grupo VIP falhou (tentativa ' + tent + (desiste ? ', DESISTINDO' : '') +
        ')\n\n' + String(e.message).slice(0, 300));
    }

    if (i < lote.length - 1) await dormir(PAUSA_MS);
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      hora: new Date(agora).toISOString(),
      vencidos: t.vencidos.length,
      enviados: enviados,
      falhas: falhas,
      expirados: t.expirados.length,
      naFila: Math.max(0, t.vencidos.length - lote.length),
      detalhes: detalhes
    })
  };
};

/* Exportado so pro teste automatizado. Nao usado em producao. */
exports._triar = triar;
