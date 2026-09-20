/* grupo-vip-agenda.js — Agendador dos posts do Bot do Grupo VIP (19/09/2026) — v6 (20/09/2026)
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
 *                   repetir: ''|'horas'|'diario'|'semanal'|'dias', intervalo (horas),
 *                   dias [0..6] (0=domingo) e hora 'HH:MM' — so no modo 'dias',
 *                   ate (ms, 0 = sem fim), status, criado }
 *   repetir != '' -> depois de enviar, o post VOLTA pra fila na proxima ocorrencia em vez
 *   de virar 'enviado'. O campo 'vezes' conta os envios. Para quando passar do 'ate' ou
 *   quando apagarem no painel; sem 'ate', repete pra sempre.
 *   imagem = URL do CDN do Shopify (opcional). Tendo imagem, o post sai por /send-image
 *   com o texto como legenda; sem imagem, sai por /send-text.
 *   LIMITES DO WHATSAPP (v6, 20/09/2026): legenda de imagem = 1.024 caracteres, texto = 4.096.
 *   O que passa disso o WhatsApp CORTA em silencio (aconteceu com o post da VitaBeauty).
 *   Agora o texto e PARTIDO no fim de um paragrafo: imagem + primeira parte como legenda,
 *   o resto sai como mensagem(ns) de texto logo em seguida. Texto curto = 1 mensagem, igual antes.
 *
 * Janela de silencio: grupo_vip/config = { silencio: { ativo, de:'23:00', ate:'05:59' } }.
 * Post cuja hora cai dentro da janela so sai quando ela fechar — ver horarioEfetivo().
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

/* Limites do WhatsApp com folga (o oficial e 1.024 na legenda e 4.096 no texto; emoji conta
   2 no .length do JS, entao a folga cobre a diferenca de contagem). MESMOS numeros do painel
   (painel_grupo_vip.html, contador de caracteres) — mudar aqui, mudar la. */
var LIMITE_LEGENDA = 1000;
var LIMITE_TEXTO = 4000;

/* Onde cortar um texto que nao cabe em 'limite' caracteres, sem quebrar frase:
   1) no fim do ultimo paragrafo que couber (linha em branco ou linha so com o braille ⠀);
   2) senao, na ultima quebra de linha; 3) senao, no ultimo espaco; 4) senao, no limite seco.
   Nunca corta antes de 30% do limite, pra nao mandar uma legenda de 2 linhas e o resto solto. */
function pontoDeCorte(t, limite) {
  if (t.length <= limite) return t.length;
  var janela = t.slice(0, limite + 1);
  var minimo = Math.floor(limite * 0.3);
  var melhor = -1, m, re = /\n[ \t\u2800]*\n/g;
  while ((m = re.exec(janela)) !== null) { melhor = m.index; }
  if (melhor >= minimo) return melhor;
  var q = janela.lastIndexOf('\n'); if (q >= minimo) return q;
  var e = janela.lastIndexOf(' '); if (e >= minimo) return e;
  return limite;
}
/* Parte o texto em pedacos de ate 'limite', cada um comecando/terminando limpo. */
function partirTexto(texto, limite) {
  var partes = [], resto = String(texto || '');
  var guarda = 0;
  while (resto.length && guarda < 50) {
    guarda++;
    var idx = pontoDeCorte(resto, limite);
    var pedaco = resto.slice(0, idx).replace(/[\s\u2800]+$/, '');
    resto = resto.slice(idx).replace(/^[\s\u2800]+/, '');
    if (pedaco) partes.push(pedaco);
  }
  return partes;
}

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

/* ─────────────────── HORÁRIO DE BRASÍLIA ───────────────────
   A funcao roda em UTC na Netlify, mas "23h" e "segunda-feira" que o VitaFlow configura
   sao em horario de Brasilia. Tudo que envolve hora-do-dia ou dia-da-semana passa por aqui.
   LEITURA usa Intl (correto mesmo se o Brasil voltar a ter horario de verao).
   MONTAGEM usa +3 fixo — o Brasil nao tem horario de verao desde 2019. Se um dia voltar,
   estes dois pontos sao os unicos que precisam mudar.                                    */
var DIAS_SIGLA = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function partesBRT(ms) {
  try {
    var f = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short'
    });
    var o = {};
    f.formatToParts(new Date(ms)).forEach(function (x) { o[x.type] = x.value; });
    return {
      ano: Number(o.year), mes: Number(o.month), dia: Number(o.day),
      hora: Number(o.hour) % 24, minuto: Number(o.minute),
      dow: DIAS_SIGLA[o.weekday]
    };
  } catch (e) {
    /* Sem ICU completo o Intl falha. Cai no -3 fixo. */
    var d = new Date(Number(ms) - 3 * 3600000);
    return {
      ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate(),
      hora: d.getUTCHours(), minuto: d.getUTCMinutes(), dow: d.getUTCDay()
    };
  }
}

/* Monta o ms de uma data/hora de Brasilia. mes e 1..12. */
function msBRT(ano, mes, dia, hora, minuto) {
  return Date.UTC(ano, mes - 1, dia, Number(hora) + 3, Number(minuto) || 0, 0, 0);
}

function hhmmParaMin(hhmm) {
  var m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return -1;
  var h = Number(m[1]), mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return -1;
  return h * 60 + mi;
}

/* ─────────────────── JANELA DE SILÊNCIO ───────────────────
   Configurada em grupo_vip/config = { silencio: { ativo, de:'23:00', ate:'05:59' } }.
   Trata a virada do dia: 23:00-05:59 e "de >= ate", entao vale fora do intervalo normal. */
function dentroDoSilencio(ms, cfg) {
  var sil = cfg && cfg.silencio;
  if (!sil || !sil.ativo) return false;
  var de = hhmmParaMin(sil.de), ate = hhmmParaMin(sil.ate);
  if (de < 0 || ate < 0 || de === ate) return false;
  var p = partesBRT(ms), agoraMin = p.hora * 60 + p.minuto;
  if (de < ate) return agoraMin >= de && agoraMin <= ate;   /* mesmo dia, ex 13:00-15:00 */
  return agoraMin >= de || agoraMin <= ate;                 /* vira o dia, ex 23:00-05:59 */
}

/* Primeiro instante DEPOIS da janela: o minuto seguinte ao 'ate'. */
function fimDoSilencio(ms, cfg) {
  var sil = cfg && cfg.silencio;
  var ate = hhmmParaMin(sil && sil.ate);
  if (ate < 0) return ms;
  var alvoMin = (ate + 1) % 1440;
  var p = partesBRT(ms);
  var candidato = msBRT(p.ano, p.mes, p.dia, Math.floor(alvoMin / 60), alvoMin % 60);
  if (candidato <= ms) candidato += 24 * 3600000;   /* ja passou hoje -> amanha */
  return candidato;
}

/* Hora em que o post PODE sair. Cai dentro do silencio -> empurra pro fim da janela.
   NAO mexe no 'quando' gravado: assim o post recorrente mantem o horario que o VitaFlow
   escolheu em vez de ir escorregando um pouco a cada dia. */
function horarioEfetivo(quando, cfg) {
  var q = Number(quando) || 0;
  if (!q) return 0;
  return dentroDoSilencio(q, cfg) ? fimDoSilencio(q, cfg) : q;
}

/* Proxima ocorrencia de um post que se repete. Devolve 0 quando o post nao se repete.
   O 'while' e essencial: se o agendador ficou fora do ar, somar UM passo pode cair no
   passado e o post dispararia varias vezes seguidas pra "recuperar o atraso" — um post de
   2 em 2h com a funcao 1 dia fora sairia 12 vezes de enfiada no grupo. Avanca ate o futuro. */
function proximaVez(quando, repetir, intervalo, agora, ate, dias, hora) {
  var limiteAte = Number(ate) || 0;

  /* Dias da semana: procura o proximo dia marcado, no horario escolhido, depois de 'agora'.
     Varre 8 dias — sempre cai num dia marcado se a lista nao estiver vazia. */
  if (repetir === 'dias') {
    var lista = (dias || []).map(Number).filter(function (d) { return d >= 0 && d <= 6; });
    if (!lista.length) return 0;
    var hm = hhmmParaMin(hora);
    if (hm < 0) return 0;
    var base = partesBRT(agora), k;
    for (k = 0; k <= 8; k++) {
      var t = msBRT(base.ano, base.mes, base.dia + k, Math.floor(hm / 60), hm % 60);
      if (t <= agora) continue;
      if (lista.indexOf(partesBRT(t).dow) < 0) continue;
      if (limiteAte && t > limiteAte) return 0;
      return t;
    }
    return 0;
  }

  var passo = 0;
  if (repetir === 'horas')        passo = Math.min(168, Math.max(1, Number(intervalo) || 1)) * 3600000;
  else if (repetir === 'diario')  passo = 24 * 3600000;
  else if (repetir === 'semanal') passo = 7 * 24 * 3600000;
  if (!passo) return 0;
  var prox = Number(quando) + passo;
  while (prox <= agora) prox += passo;
  /* 'ate' e o fim da repeticao (23:59:59 do dia escolhido no painel). Passou dele, devolve 0
     e quem chamou encerra o post como 'enviado' em vez de reagendar. Vazio = pra sempre. */
  if (limiteAte && prox > limiteAte) return 0;
  return prox;
}

/* Decide o que fazer com cada post. Separado do envio pra poder ser testado sozinho. */
function triar(agenda, agora, cfg) {
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
    if (!quando) continue;

    /* Post novo no modo "dias da semana" nasce com quando = agora, so como ponto de
       partida: o painel NAO calcula a primeira ocorrencia (o fuso do navegador nao e
       confiavel) — quem calcula e daqui, em horario de Brasilia. Enquanto a flag
       'alinhar' existir o post nao envia nada, so e realinhado. Por isso ele tambem
       nao pode expirar na regra dos 180 min. */
    if (p.alinhar) { vencidos.push({ id: id, p: p }); continue; }

    /* Horario EFETIVO: se a hora marcada cai na janela de silencio, o post so pode sair
       quando a janela fechar. O atraso tambem passa a ser medido a partir dai — senao um
       post das 23:30 com silencio ate 05:59 chegaria as 06:00 ja "7h atrasado" e morreria
       na regra dos 180 min, que existe pra outra coisa. */
    var efetivo = horarioEfetivo(quando, cfg);
    if (efetivo > agora) continue;

    if (agora - efetivo > ATRASO_MAX_MIN * 60000) { expirados.push({ id: id, p: p }); continue; }
    vencidos.push({ id: id, p: p });
  }
  /* Mais antigo primeiro, pra sair na ordem em que foi agendado. */
  vencidos.sort(function (a, b) {
    return horarioEfetivo(a.p.quando, cfg) - horarioEfetivo(b.p.quando, cfg);
  });
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
  var cfg = await fbGet(RAIZ + '/config');
  var agenda = await fbGet(RAIZ + '/agenda');
  var t = triar(agenda, agora, cfg);

  /* Expirados: nao manda nada. Post que SE REPETE nao morre por causa de uma ocorrencia
     perdida — pula pra proxima e continua na fila. */
  var i;
  for (i = 0; i < t.expirados.length; i++) {
    var ex = t.expirados[i];
    var proxEx = proximaVez(ex.p.quando, ex.p.repetir, ex.p.intervalo, agora, ex.p.ate, ex.p.dias, ex.p.hora);
    if (proxEx) {
      await fbPatch(RAIZ + '/agenda/' + ex.id, {
        status: 'pendente',
        quando: proxEx,
        erro: 'ocorrencia de ' + new Date(Number(ex.p.quando)).toISOString() + ' passou de ' +
              ATRASO_MAX_MIN + ' min e foi pulada',
        lock: null
      });
      continue;
    }
    await fbPatch(RAIZ + '/agenda/' + ex.id, {
      status: 'expirado',
      erro: 'passou de ' + ATRASO_MAX_MIN + ' min da hora marcada — nao enviado',
      fechado_em: agora
    });
    await telegram('⏰ Post do Grupo VIP EXPIROU (nao foi enviado)\n\nMarcado para: ' +
      new Date(Number(ex.p.quando)).toISOString() + '\nTexto: ' + String(ex.p.texto || '(so imagem)').slice(0, 120));
  }

  /* ─────────── REALINHAMENTO (modo "dias da semana") ───────────
     Estes posts NAO enviam nada nesta volta: so recebem a primeira ocorrencia de
     verdade. Fica fora do lote de envio pra nao gastar o MAX_POR_VOLTA. */
  var alinhados = 0, paraEnviar = [];
  for (i = 0; i < t.vencidos.length; i++) {
    var v = t.vencidos[i];
    if (!v.p.alinhar) { paraEnviar.push(v); continue; }
    var primeira = proximaVez(agora, 'dias', 0, agora, v.p.ate, v.p.dias, v.p.hora);
    if (primeira) {
      await fbPatch(RAIZ + '/agenda/' + v.id, {
        status: 'pendente', quando: primeira, alinhar: null, erro: '', lock: null
      });
    } else {
      await fbPatch(RAIZ + '/agenda/' + v.id, {
        status: 'expirado', alinhar: null, fechado_em: agora,
        erro: 'nenhum dia da semana valido dentro do "repetir ate" — nada foi agendado'
      });
    }
    alinhados++;
  }

  var lote = paraEnviar.slice(0, MAX_POR_VOLTA);
  var enviados = 0, falhas = 0, detalhes = [];

  for (i = 0; i < lote.length; i++) {
    var item = lote[i], id = item.id, post = item.p;

    /* Marca ANTES de enviar. Se a funcao morrer no meio do envio, o post fica em
       'enviando' e so volta pra fila depois de TRAVA_ENVIANDO_MIN — repetir um post no
       grupo e pior do que atrasar. */
    await fbPatch(RAIZ + '/agenda/' + id, { status: 'enviando', lock: Date.now() });

    try {
      /* v6: respeita os limites do WhatsApp. Com imagem: legenda = 1a parte (ate LIMITE_LEGENDA,
         cortada no fim de um paragrafo) e o resto vai como texto em seguida. Sem imagem: texto
         partido em pedacos de ate LIMITE_TEXTO. O messageId (pro pin) e SEMPRE o do 1o envio. */
      var textoPost = String(post.texto || '');
      var messageId = '', continuacao = [];
      if (post.imagem) {
        var legendaPartes = partirTexto(textoPost, LIMITE_LEGENDA);
        var legenda = legendaPartes.length ? legendaPartes[0] : '';
        var sobra = textoPost.slice(textoPost.indexOf(legenda) + legenda.length).replace(/^[\s\u2800]+/, '');
        messageId = await enviarImagem(String(post.imagem), legenda);
        if (sobra) continuacao = partirTexto(sobra, LIMITE_TEXTO);
      } else {
        var textoPartes = partirTexto(textoPost, LIMITE_TEXTO);
        messageId = await enviarTexto(textoPartes.length ? textoPartes[0] : textoPost);
        continuacao = textoPartes.slice(1);
      }
      var partes = 1;
      for (var c = 0; c < continuacao.length; c++) {
        await dormir(PAUSA_MS);
        await enviarTexto(continuacao[c]);
        partes++;
      }
      var aviso = partes > 1 ? ('saiu em ' + partes + ' mensagens (limite do WhatsApp)') : '';
      if (post.fixar) {
        var erroPin = await fixar(messageId, String(post.fixar));
        if (erroPin) {
          aviso = (aviso ? aviso + ' · ' : '') + 'enviado, mas nao fixou: ' + erroPin;
          await telegram('📌 Post do Grupo VIP foi enviado mas NAO fixou.\n' + erroPin +
            '\n(o numero do bot e admin do grupo?)');
        }
      }
      var vezes = Number(post.vezes || 0) + 1;
      var prox = proximaVez(post.quando, post.repetir, post.intervalo, Date.now(), post.ate, post.dias, post.hora);
      if (prox) {
        /* Volta pra fila na proxima ocorrencia. NAO some da agenda — so para quando o
           VitaFlow apagar o post no painel. */
        await fbPatch(RAIZ + '/agenda/' + id, {
          status: 'pendente',
          quando: prox,
          enviado_em: Date.now(),
          messageId: messageId || '',
          aviso: aviso,
          partes: partes,
          vezes: vezes,
          erro: '',
          lock: null
        });
      } else {
        await fbPatch(RAIZ + '/agenda/' + id, {
          status: 'enviado',
          enviado_em: Date.now(),
          messageId: messageId || '',
          aviso: aviso,
          partes: partes,
          vezes: vezes,
          lock: null
        });
      }
      enviados++;
      detalhes.push({ id: id, ok: true, aviso: aviso, partes: partes, repete: !!prox, proxima: prox || null });
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
      silencioAgora: dentroDoSilencio(agora, cfg),
      vencidos: t.vencidos.length,
      enviados: enviados,
      falhas: falhas,
      expirados: t.expirados.length,
      alinhados: alinhados,
      naFila: Math.max(0, paraEnviar.length - lote.length),
      detalhes: detalhes
    })
  };
};

/* Exportado so pro teste automatizado. Nao usado em producao. */
exports._triar = triar;
exports._proximaVez = proximaVez;
exports._partesBRT = partesBRT;
exports._msBRT = msBRT;
exports._dentroDoSilencio = dentroDoSilencio;
exports._fimDoSilencio = fimDoSilencio;
exports._horarioEfetivo = horarioEfetivo;
