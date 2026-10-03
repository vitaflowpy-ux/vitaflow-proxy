'use strict';
/* =============================================================================
   logistica-bot.js — BOT DA LOGÍSTICA NO WHATSAPP (VitaFlow)  ·  v9  ·  02/10/2026
   v9 (ordem do Thiago, 02/10: "pode retirar o modo teste do bot, deixe apenas ligado ou desligado"): o bot só tem dois
       modos — 'ligado' (atende todo mundo) e 'desligado' (não responde ninguém). Saíram o modo 'teste' e a lista de números
       de teste. Config antiga com modo 'teste' (ou qualquer valor estranho) vale como DESLIGADO — nunca liga sozinho.
       O WhatsApp que recebe os avisos de protocolo (ana_whatsapp) é sempre ignorado como cliente (antes a lista de teste
       abria exceção).
   v8 (ordem do Thiago, 01-02/10: "o bot avisa a mesma coisa que está na página de rastreio"): o cartão do pedido e a opção 1
       (rastreio) mostram o MESMO AVISO que a página mostra para aquele pedido (campo `aviso` da rastreio-consulta v7 — textos
       do Thiago, sem mudar uma palavra; só negrito/itálico do WhatsApp e uma frase por linha). Com o aviso 1 ou 2 (pedido
       marcado como Postado pela logística, sem leitura da transportadora) some a frase "o código aparece assim que a
       transportadora fizer a primeira leitura", que dizia outra coisa. Sem o campo (reserva do GAS) nada muda.
   v7 (Thiago, 01/10): (1) COMANDO #bot — quando a logística manda "#bot" pelo celular numa conversa em que o bot está
       calado, o bot VOLTA NA HORA naquela conversa (sem esperar as 6 h). Só vale vindo do celular da logística (fromMe):
       se o CLIENTE escrever #bot, é uma mensagem qualquer — não reativa nada. (2) LISTA "BOT CALADO": cada silêncio fica
       anotado em vitaflow_sync/logistica/silencio/<telefone> (até quando, desde quando, nome, pedido) pro painel mostrar
       TODAS as conversas em silêncio com o botão "Devolver ao bot" (antes só dava pelo cartão do protocolo).
       (3) Origem 'CP' = Campinas/SP (fornecedora VitaFlow — rastreio-consulta v5) no "Sai de:" do cartão.
   v6 (OK do Thiago, 01/10): (1) UMA MENSAGEM POR VEZ por conversa — trava em vitaflow_sync/logistica/travas/<tel>
       (gravação condicional com ETag; some sozinha em 25 s). No teste de 01/10 o vídeo (que a Z-API só repassa
       depois de baixar, ~1 min para 7 MB) e o "Enviei" chegaram no MESMO segundo e foram processados juntos.
       (2) Aviso no pedido do vídeo (op6_pedir e op6_falta_video): vídeo pesado leva 1–2 min para chegar.
   v5 (pedidos do Thiago depois do teste de 01/10): (1) PRODUTOS do cartão um por linha, no formato do WhatsApp
       ("• 1x Nome · R$ 1.049,00"), em vez da linha corrida do pedido; (2) o número do protocolo do dia começa em
       011 (LOG-DDMM-011, 012…), não mais em 001 — o contador do Firebase continua igual (1, 2, 3…), só soma 10.
   v4: se NENHUMA mensagem do bot foi entregue (Z-API recusou/fora do ar), a conversa VOLTA ao ponto em que estava.
       Caso real 30/09: com o token errado, o 1º "Teste" gravou "esperando o pedido" sem as boas-vindas chegarem;
       no 2º "Teste" o cliente recebeu direto o "preciso localizar o pedido". Protocolo aberto nunca é desfeito.
   v3: o reconhecimento de pedido/CPF virou um BLOCO ÚNICO, igual na Athena (v81) e na página de rastreio (v5).
       Corrige a contingência (VF-DDMM-SX0930 perdia o zero) e, sem "VF", a letra tem que vir grudada no número.
   v2: reconhece número do pedido e CPF escritos de qualquer jeito (ver "identificação" abaixo);
       pede o dia/mês quando vem só o final do número; avisa CPF que não confere e número sem a letra;
       texto da opção 5 (entregue há menos de 48 h) reescrito.
   Netlify Function no repo vitaflow-proxy → netlify/functions/logistica-bot.js
   Webhook "Ao receber" da instância Z-API `logistica` (+44 7537 155718) aponta pra cá,
   com "Notificar as enviadas por mim também" LIGADO e "Ignorar mensagens de grupos" LIGADO.

   PLANO APROVADO: claude/plano_logistica_bot_rastreio_2026-09-29.md (blindagem do atendimento humano)
   + ajustes do Thiago em 30/09/2026 (menu de 6 opções, "entregue" 48 h, troca de produto por fornecedor).

   O QUE FAZ
   - Identifica o pedido (número VF-..., CPF ou e-mail) e mostra o CARTÃO do pedido + MENU fixo:
       1 Rastreio completo · 2 Prazo estimado · 3 Atrasado ou parado · 4 Alterar meu pedido
       5 Consta entregue, mas não recebi · 6 Recebi com problema
     O menu é FIXO de propósito: se o status estiver errado (ex.: "entregue" cedo demais), o cliente
     ainda consegue escolher a opção certa.
   - Humano (Ana Clara) SÓ nestes 5 casos — o bot abre o protocolo LOG-DDMM-NNN:
       a) atraso: passou do prazo estimado da etapa (prazo.fora do consultar_status) — abre sozinho na opção 3
       b) exceção da transportadora (ausente, endereço incorreto, fiscalização, área com distribuição,
          extraviado, apreendido) — abre sozinho na opção 3
       c) alteração de pedido: dados de entrega só ANTES de postar; produtos: Daniel até postar,
          os demais fornecedores só no MESMO DIA da compra (vitaflow_compras/<pedido>/grupos/<forn>/compradoEm)
       d) consta entregue e não recebeu: só depois de 48 h do registro de entrega e com o cliente
          confirmando que conferiu portaria/vizinhos/caixa de correio
       e) recebeu com problema: só com descrição + VÍDEO DA ABERTURA
   - TRAVAS: sem pedido identificado não há humano · 1 protocolo aberto por pedido · áudio recebe
     resposta padrão · fora do horário o protocolo vai pra fila (aviso à Ana na abertura) · nada de
     opção "outro assunto" (compra/produto → Athena).
   - SILÊNCIO: quando alguém responde À MÃO pelo celular da logística (fromMe que não foi o bot),
     o bot fica calado naquela conversa por 6 h (config). O protocolo aberto passa a "em atendimento".
   - MODO (v9): 'ligado' atende todo mundo; 'desligado' não responde ninguém. (O modo teste saiu na v9.)
   - EXCEÇÕES (v10, ordem do Thiago, 03/10/2026): número cadastrado na aba 🚫 Exceções do painel NÃO tem bot nenhum —
     sem menu, sem protocolo, sem aviso, sem silêncio, sem #bot. A logística recebe e conversa à mão. O bot lê SÓ a
     chave daquele número (nunca o nó inteiro). Se a leitura falhar, segue como número comum.
   - Textos e config no Firebase (vitaflow_sync/logistica/textos e /config), editáveis no painel da
     logística. Os padrões abaixo só valem enquanto o nó não existir. GET ?defaults=1 devolve os padrões.

   ONDE GRAVA (RTDB pricehub-f0236) — FILHO de vitaflow_sync de propósito (nó de topo é negado ao painel):
     vitaflow_sync/logistica/config                   modo (ligado/desligado), WhatsApp da Ana, horário...
     vitaflow_sync/logistica/textos/<chave>           textos editados no painel
     vitaflow_sync/logistica/conversas/<telefone>     estado da conversa (PATCH, nunca PUT)
     vitaflow_sync/logistica/protocolos/<aaaammdd-NNN> protocolo (id LOG-DDMM-NNN)
     vitaflow_sync/logistica/por_pedido/<pedido>      protocolo aberto daquele pedido (trava 1 por pedido)
     vitaflow_sync/logistica/seq/<aaaammdd>           contador do dia (ETag / if-match)
     vitaflow_sync/logistica/fila_aviso/<chave>       protocolos abertos fora do horário (aviso na abertura)
     vitaflow_sync/logistica/silencio/<telefone>      (v7) conversas com o bot calado — espelho pro painel
     vitaflow_sync/logistica/excecoes/<numero>        (v10) SÓ LÊ — números sem bot (grava o painel; chave = chaveNumero)
   LÊ: rastreio-consulta (função deste site) → GAS consultar_status (reserva) · vitaflow_compras/<pedido>

   VARIÁVEIS DE AMBIENTE (Netlify vitaflow-proxy)
     LOG_ZAPI_INSTANCE   id da instância Z-API "logistica"            (NOVA)
     LOG_ZAPI_TOKEN      token da instância "logistica"                (NOVA)
     ZAPI_CLIENT_TOKEN   token de segurança da CONTA Z-API (já existe — mesma conta do grupo-vip)
     FIREBASE_SECRET     (já existe)     TELEGRAM_TOKEN / TELEGRAM_CHAT (já existem — cópia pro Thiago)
     CRON_SECRET         (já existe)     cron-job.org a cada 15 min: GET ?acao=abertura&secret=<CRON_SECRET>
   ============================================================================= */

var VERSAO = 'v10';
var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var RAIZ = 'vitaflow_sync/logistica';

var ZAPI_INSTANCE = process.env.LOG_ZAPI_INSTANCE || '';
var ZAPI_TOKEN = process.env.LOG_ZAPI_TOKEN || '';
var CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || '';
var FB_SECRET = process.env.FIREBASE_SECRET || '';
var TG_TOKEN = process.env.TELEGRAM_TOKEN || '';
var TG_CHAT = process.env.TELEGRAM_CHAT || '';
var CRON_SECRET = process.env.CRON_SECRET || '';

/* consulta: primeiro a função rápida (pré-cálculo no Firebase), depois o GAS (mesma ordem da Athena v80) */
var RASTREIO_URL = 'https://vitaflow-proxy.netlify.app/.netlify/functions/rastreio-consulta';
var GAS_URL = 'https://script.google.com/macros/s/AKfycbxFlaN0FXFbpcC8HZ80sxnq383m5d-xTaj5cg72VcCdnYx47N_qKkiELFN5KAPmm_nb/exec';
var PAGINA_RASTREIO = 'vitaflowoficial.com/pages/rastrear-pedido';

var MIN = 60000, HORA = 3600000, DIA = 86400000;

/* ------------------------------------------------------------------ config padrão
   Vale enquanto vitaflow_sync/logistica/config não existir (ou faltar a chave).          */
var CFG_PADRAO = {
  modo: 'desligado',                   /* v9: 'ligado' | 'desligado' (o modo teste saiu) */
  ana_whatsapp: '447537155723',        /* recebe o aviso de protocolo novo */
  painel_url: '',                      /* link do painel da logística (vai no aviso) */
  silencio_horas: 6,                   /* bot calado depois de resposta humana */
  espera_entregue_horas: 48,           /* "consta entregue": espera antes de abrir protocolo */
  fornecedores_flex: 'DANIEL',         /* troca de produto até POSTAR (os outros: só no dia da compra) */
  horario: { semana: { de: '08:00', ate: '18:00' }, sabado: { de: '09:00', ate: '14:00' } }
};

/* ------------------------------------------------------------------ helpers */
function soDigitos(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
function chaveFb(s) { return String(s || '').replace(/[.#$\[\]\/@]/g, '_'); }
function semAcento(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function up(s) { return semAcento(s).toUpperCase().trim(); }
function low(s) { return semAcento(s).toLowerCase().trim(); }

/* Celular brasileiro: o WhatsApp às vezes entrega o número SEM o 9 depois do DDD
   (55 21 9836-7319 em vez de 55 21 99836-7319). Comparar pelo DDD + 8 últimos dígitos. */
function chaveNumero(n) {
  var d = soDigitos(n);
  if (d.indexOf('55') === 0 && (d.length === 12 || d.length === 13)) return '55' + d.substr(2, 2) + d.slice(-8);
  return d;
}
function numeroNaLista(numero, lista) {
  var k = chaveNumero(numero);
  if (!k || !lista) return false;
  var nums = Array.isArray(lista) ? lista : Object.keys(lista);
  for (var i = 0; i < nums.length; i++) if (nums[i] && chaveNumero(nums[i]) === k) return true;
  return false;
}

function fbUrl(caminho, extra) {
  return FB_BASE + '/' + caminho + '.json?' + (FB_SECRET ? 'auth=' + encodeURIComponent(FB_SECRET) : '') + (extra ? '&' + extra : '');
}

async function fetchT(url, opts, ms) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, ms || 6000);
  try { return await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal })); }
  finally { clearTimeout(t); }
}

async function fbGet(caminho) {
  try {
    var r = await fetchT(fbUrl(caminho), {}, 5000);
    if (!r.ok) { console.error('[logistica] fbGet ' + caminho + ' HTTP ' + r.status); return null; }
    return await r.json();
  } catch (e) { console.error('[logistica] fbGet ' + caminho + ': ' + e.message); return null; }
}
async function fbEscreve(caminho, valor, metodo) {
  try {
    var r = await fetchT(fbUrl(caminho), {
      method: metodo || 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valor)
    }, 5000);
    if (!r.ok) { console.error('[logistica] ' + (metodo || 'PUT') + ' ' + caminho + ' HTTP ' + r.status); return false; }
    return true;
  } catch (e) { console.error('[logistica] ' + (metodo || 'PUT') + ' ' + caminho + ': ' + e.message); return false; }
}
/* true = existe · false = não existe · null = não deu pra saber (erro) — nunca confundir erro com "vazio" */
async function fbExiste(caminho) {
  try {
    var r = await fetchT(fbUrl(caminho, 'shallow=true'), {}, 5000);
    if (!r.ok) return null;
    var txt = await r.text();
    return !(txt === '' || txt === 'null');
  } catch (e) { return null; }
}
function fbPut(c, v) { return fbEscreve(c, v, 'PUT'); }
/* v10: número na lista de exceções do painel = nada de bot. Lê só a chave do número. */
async function ehExcecao(phone) {
  var ke = chaveFb(chaveNumero(phone));
  if (!ke) return false;
  return !!(await fbGet(RAIZ + '/excecoes/' + ke));
}
function fbPatch(c, v) { return fbEscreve(c, v, 'PATCH'); }
async function fbDelete(caminho) {
  try { var r = await fetchT(fbUrl(caminho), { method: 'DELETE' }, 5000); return r.ok; }
  catch (e) { return false; }
}

/* Contador com trava do Firebase (ETag / if-match) — mesmo esquema do numero-pedido.js.
   Dois protocolos ao mesmo tempo NUNCA pegam o mesmo número. */
async function proximoDoContador(caminho) {
  for (var i = 0; i < 15; i++) {
    var r = await fetchT(fbUrl(caminho), { headers: { 'X-Firebase-ETag': 'true' } }, 5000);
    if (!r.ok) throw new Error('contador get ' + r.status);
    var etag = r.headers.get('etag') || r.headers.get('ETag');
    var txt = await r.text();
    var atual = (txt === '' || txt === 'null') ? 0 : (Number(JSON.parse(txt)) || 0);
    var novo = atual + 1;
    var w = await fetchT(fbUrl(caminho), {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'if-match': etag }, body: JSON.stringify(novo)
    }, 5000);
    if (w.status === 412) continue;
    if (!w.ok) throw new Error('contador put ' + w.status);
    return novo;
  }
  throw new Error('contador disputado demais');
}

/* v6: UMA MENSAGEM POR VEZ por conversa. Vídeo + texto chegando no mesmo segundo eram processados em paralelo e um podia
   gravar por cima do outro. A trava é gravada com ETag (só um consegue) e vale 25 s (se a função morrer, some sozinha).
   Espera até 12 s pela vez; passou disso, processa assim mesmo (melhor responder do que perder a mensagem). */
var TRAVA_VALE = 25000, TRAVA_ESPERA = 12000;
async function pegarTrava(k) {
  var caminho = RAIZ + '/travas/' + k, id = Date.now() + '-' + Math.random().toString(36).slice(2, 8), ini = Date.now();
  while (Date.now() - ini < TRAVA_ESPERA) {
    try {
      var r = await fetchT(fbUrl(caminho), { headers: { 'X-Firebase-ETag': 'true' } }, 4000);
      if (!r.ok) return null;
      var etag = r.headers.get('etag') || r.headers.get('ETag'), txt = await r.text();
      var atual = (txt === '' || txt === 'null') ? null : JSON.parse(txt);
      if (!atual || !atual.ts || Date.now() - atual.ts > TRAVA_VALE) {
        var w = await fetchT(fbUrl(caminho), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'if-match': etag },
          body: JSON.stringify({ ts: Date.now(), id: id }) }, 4000);
        if (w.ok) return id;
        if (w.status !== 412) return null;
      }
    } catch (e) { return null; }
    await new Promise(function (ok) { setTimeout(ok, 600); });
  }
  console.error('[logistica] trava da conversa ' + k + ' ocupada por mais de ' + (TRAVA_ESPERA / 1000) + ' s — processando assim mesmo');
  return null;
}
async function soltarTrava(k, id) {
  if (!id) return;
  try {
    var caminho = RAIZ + '/travas/' + k;
    var r = await fetchT(fbUrl(caminho), { headers: { 'X-Firebase-ETag': 'true' } }, 4000);
    var etag = r.headers.get('etag') || r.headers.get('ETag'), txt = await r.text();
    var atual = (txt === '' || txt === 'null') ? null : JSON.parse(txt);
    if (atual && atual.id === id) await fetchT(fbUrl(caminho), { method: 'DELETE', headers: { 'if-match': etag } }, 4000);
  } catch (e) { /* vence sozinha em 25 s */ }
}

/* Envio pela instância da logística. Erro SEMPRE no log (lição do grupo-vip de 19/09). */
async function enviar(paraPhone, texto) {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN) {
    console.error('[logistica] envio abortado: LOG_ZAPI_INSTANCE ou LOG_ZAPI_TOKEN vazia');
    return false;
  }
  try {
    var r = await fetchT('https://api.z-api.io/instances/' + ZAPI_INSTANCE + '/token/' + ZAPI_TOKEN + '/send-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': CLIENT_TOKEN },
      body: JSON.stringify({ phone: paraPhone, message: texto })
    }, 8000);
    if (!r.ok) {
      var corpo = '';
      try { corpo = await r.text(); } catch (e2) { corpo = '(sem corpo)'; }
      console.error('[logistica] send-text HTTP ' + r.status + ' para ' + paraPhone +
                    ' | Client-Token ' + (CLIENT_TOKEN ? 'presente' : 'AUSENTE') + ' | ' + String(corpo).slice(0, 400));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[logistica] send-text estourou: ' + e.message);
    return false;
  }
}

async function telegram(texto) {
  if (!TG_TOKEN || !TG_CHAT) return false;
  try {
    await fetchT('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: texto, disable_web_page_preview: true })
    }, 5000);
    return true;
  } catch (e) { return false; }
}

/* "Impressão digital" do texto: o bot guarda a do que vai mandar ANTES de mandar. Quando o
   webhook devolve a mensagem como fromMe, se a impressão bate, foi o bot; se não, foi gente. */
function impressao(texto) {
  var s = String(texto || '').replace(/[\s\u2800]+/g, '').toLowerCase();
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36) + '.' + s.length;
}

/* ------------------------------------------------------------------ data e hora (Brasília, sem horário de verão desde 2019) */
function partesBR(ts) {
  var p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23'
  }).formatToParts(new Date(ts));
  var o = {};
  p.forEach(function (x) { o[x.type] = x.value; });
  var dows = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: o.year, m: o.month, d: o.day, hh: o.hour, mi: o.minute, dow: dows[o.weekday] };
}
function diaBR(ts) { var p = partesBR(ts); return p.y + '-' + p.m + '-' + p.d; }
function ddmm(ts) { var p = partesBR(ts); return p.d + '/' + p.m; }
function ddmmhhmm(ts) { var p = partesBR(ts); return p.d + '/' + p.m + ' às ' + p.hh + ':' + p.mi; }
function tsBR(y, m, d, hhmm) {
  var hm = String(hhmm || '00:00').split(':');
  return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hm[0]) + 3, Number(hm[1] || 0));
}
/* feriados nacionais — mesma lista do GAS (_FERIADOS_BR) */
var FERIADOS = { '2026-01-01':1,'2026-04-03':1,'2026-04-21':1,'2026-05-01':1,'2026-09-07':1,'2026-10-12':1,'2026-11-02':1,
  '2026-11-15':1,'2026-11-20':1,'2026-12-25':1,'2027-01-01':1,'2027-03-26':1,'2027-04-21':1,'2027-05-01':1,'2027-09-07':1,
  '2027-10-12':1,'2027-11-02':1,'2027-11-15':1,'2027-11-20':1,'2027-12-25':1 };

function janelaDoDia(ts, cfg) {
  var p = partesBR(ts);
  if (FERIADOS[p.y + '-' + p.m + '-' + p.d]) return null;
  var h = (cfg && cfg.horario) || CFG_PADRAO.horario;
  if (p.dow >= 1 && p.dow <= 5) return h.semana || null;
  if (p.dow === 6) return h.sabado || null;
  return null;
}
function dentroHorario(ts, cfg) {
  var j = janelaDoDia(ts, cfg);
  if (!j || !j.de || !j.ate) return false;
  var p = partesBR(ts), agora = p.hh + ':' + p.mi;
  return agora >= j.de && agora < j.ate;
}
/* próximo momento em que o atendimento humano abre (ts). Dentro do horário = agora. */
function proximaAbertura(ts, cfg) {
  if (dentroHorario(ts, cfg)) return ts;
  for (var k = 0; k < 15; k++) {
    var dia = ts + k * DIA, p = partesBR(dia), j = janelaDoDia(dia, cfg);
    if (!j || !j.de) continue;
    var ab = tsBR(p.y, p.m, p.d, j.de);
    if (ab > ts) return ab;
  }
  return ts;
}
var DOW_NOME = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function horaCurta(hhmm) { var a = String(hhmm).split(':'); return Number(a[0]) + 'h' + (a[1] && a[1] !== '00' ? a[1] : ''); }
function textoAbertura(ab, agora) {
  var pa = partesBR(ab), hoje = diaBR(agora), amanha = diaBR(agora + DIA), dAb = diaBR(ab);
  var h = horaCurta(pa.hh + ':' + pa.mi);
  if (dAb === hoje) return 'hoje às ' + h;
  if (dAb === amanha) return 'amanhã (' + DOW_NOME[pa.dow] + ') às ' + h;
  return DOW_NOME[pa.dow] + ', ' + pa.d + '/' + pa.m + ' às ' + h;
}
function textoHorario(cfg) {
  var h = (cfg && cfg.horario) || CFG_PADRAO.horario;
  var s = [];
  if (h.semana && h.semana.de) s.push('seg a sex ' + horaCurta(h.semana.de) + '–' + horaCurta(h.semana.ate));
  if (h.sabado && h.sabado.de) s.push('sáb ' + horaCurta(h.sabado.de) + '–' + horaCurta(h.sabado.ate));
  return s.join(' · ');
}

/* ------------------------------------------------------------------ status (mesmos nomes do sistema de rastreamento) */
var ORDEM = { 'AGUARDANDO PAGAMENTO': 0, 'PEDIDO CONFIRMADO': 1, 'PAGO': 1, 'EM SEPARACAO': 2, 'DESPACHADO': 3, 'POSTADO': 4,
  'EM TRANSFERENCIA': 5, 'EM SEPARACAO NO CENTRO LOGISTICO': 5, 'CHEGOU A UNIDADE DE DESTINO': 6, 'SAIU PARA ENTREGA': 7, 'ENTREGUE': 8 };
/* ocorrências da transportadora que vão pro humano (gatilho b) */
var EXCECAO = { 'ENCAMINHADO PARA FISCALIZACAO': 1, 'DESTINATARIO AUSENTE': 1, 'ENDERECO INCORRETO': 1,
  'AREA COM DISTRIBUICAO': 1, 'PEDIDO EXTRAVIADO': 1, 'PEDIDO APREENDIDO': 1 };
var FINAL = { 'PEDIDO CANCELADO': 1, 'REEMBOLSO REALIZADO': 1 };
var ROTULO = {
  'AGUARDANDO PAGAMENTO': 'Aguardando pagamento', 'PEDIDO CONFIRMADO': 'Pedido confirmado', 'PAGO': 'Pedido confirmado',
  'EM SEPARACAO': 'Em separação', 'DESPACHADO': 'Despachado', 'POSTADO': 'Postado', 'EM TRANSFERENCIA': 'Em transferência',
  'EM SEPARACAO NO CENTRO LOGISTICO': 'No centro logístico', 'CHEGOU A UNIDADE DE DESTINO': 'Chegou à unidade de destino',
  'SAIU PARA ENTREGA': 'Saiu para entrega', 'ENTREGUE': 'Entregue', 'ENCAMINHADO PARA FISCALIZACAO': 'Encaminhado para fiscalização',
  'FISCALIZACAO FINALIZADA': 'Fiscalização finalizada', 'DESTINATARIO AUSENTE': 'Destinatário ausente',
  'ENDERECO INCORRETO': 'Endereço incorreto', 'AREA COM DISTRIBUICAO': 'Área com distribuição especial',
  'PEDIDO EXTRAVIADO': 'Pedido extraviado', 'PEDIDO APREENDIDO': 'Pedido apreendido',
  'REEMBOLSO REALIZADO': 'Reembolso realizado', 'PEDIDO CANCELADO': 'Pedido cancelado'
};
/* mesmas explicações da página/e-mail (rastreamento_code EXPLICACAO_STATUS) — ENTREGUE fica de fora de propósito:
   o bot NUNCA afirma "entregue"; diz que a TRANSPORTADORA registrou a entrega. */
var EXPLIC = {
  'AGUARDANDO PAGAMENTO': 'O pedido foi gerado mas o pagamento ainda não foi confirmado.',
  'PEDIDO CONFIRMADO': 'Pedido recebido e pagamento confirmado. Em breve iniciamos a separação.',
  'PAGO': 'Pedido recebido e pagamento confirmado. Em breve iniciamos a separação.',
  'EM SEPARACAO': 'Estamos preparando os produtos do seu pedido.',
  'DESPACHADO': 'O pedido foi preparado e aguarda a coleta da transportadora.',
  'POSTADO': 'O pedido já está com a transportadora e a caminho.',
  'EM TRANSFERENCIA': 'O pedido está em trânsito entre unidades, a caminho da sua cidade.',
  'CHEGOU A UNIDADE DE DESTINO': 'O pedido chegou à unidade de distribuição da sua cidade. A entrega será feita em breve.',
  'EM SEPARACAO NO CENTRO LOGISTICO': 'O pedido está sendo processado no centro logístico para sair para entrega.',
  'SAIU PARA ENTREGA': 'O pedido está com o entregador. Fique atento!',
  'ENCAMINHADO PARA FISCALIZACAO': 'O pedido passa por verificação de rotina da fiscalização.',
  'FISCALIZACAO FINALIZADA': 'A verificação foi concluída e o pedido segue o fluxo normal.',
  'DESTINATARIO AUSENTE': 'O entregador passou no endereço e não encontrou ninguém.',
  'ENDERECO INCORRETO': 'A transportadora informou um problema com o endereço de entrega.',
  'AREA COM DISTRIBUICAO': 'A região tem particularidade na distribuição (ex.: retirada em ponto).',
  'PEDIDO EXTRAVIADO': 'A transportadora informou extravio durante o transporte.',
  'PEDIDO APREENDIDO': 'O pedido foi retido/apreendido.',
  'REEMBOLSO REALIZADO': 'O reembolso do pedido foi efetuado.',
  'PEDIDO CANCELADO': 'O pedido foi cancelado.'
};
var ORIGEM = { SP: 'São Paulo', CP: 'Campinas/SP', MS: 'Mato Grosso do Sul', PY: 'Paraguai (atacado)', RJ: 'Rio de Janeiro' };   /* v7: CP */

function statusDe(snap) { return up((snap && (snap.status_exibido || snap.status)) || ''); }
function rotuloStatus(s) { var u = up(s); return ROTULO[u] || (String(s || '').charAt(0) + low(s).slice(1)) || '—'; }
function ordemDe(s) { var u = up(s); return ORDEM.hasOwnProperty(u) ? ORDEM[u] : -1; }

/* categoria do pedido para as opções */
function categoria(snap) {
  var s = statusDe(snap), sPlan = up(snap && snap.status);
  if (s === 'AGUARDANDO PAGAMENTO') return 'pagamento';
  if (FINAL[s] || FINAL[sPlan]) return 'final';
  if (EXCECAO[s] || EXCECAO[sPlan]) return 'excecao';
  if (s === 'ENTREGUE') return 'entregue';
  if (s === 'FISCALIZACAO FINALIZADA') return 'fiscal_ok';
  return 'fluxo';
}
/* já está com a transportadora? (postado ou depois, ou ocorrência de transporte, ou 1ª leitura real) */
function jaPostado(snap) {
  if (!snap) return false;
  if (Number(snap.primeira_leitura) > 0) return true;
  var s = statusDe(snap);
  if (ordemDe(s) >= 4) return true;
  if (EXCECAO[s] || s === 'FISCALIZACAO FINALIZADA') return true;
  return false;
}
/* quando a transportadora registrou a entrega: último evento "entregue" (não "tentativa", "saiu para",
   "ponto de retirada"); senão o ENTREGUE do histórico de status */
function entregaInfo(snap) {
  var ev = (snap && snap.eventos) || [];
  for (var i = ev.length - 1; i >= 0; i--) {
    var s = up(ev[i].s);
    if (s.indexOf('ENTREG') >= 0 && !/NAO |NAO$|TENTATIVA|SAIU|SAIDA|PONTO|RETIRADA|AGUARDANDO|DEVOLV|INSUCESSO|PARA ENTREGA/.test(s)) {
      return { ts: Number(ev[i].ts) || 0, local: ev[i].c || '' };
    }
  }
  var h = (snap && snap.historico) || [];
  for (var j = h.length - 1; j >= 0; j--) {
    if (up(h[j].status) === 'ENTREGUE' && h[j].ts) return { ts: Number(h[j].ts), local: '' };
  }
  return { ts: 0, local: '' };
}

/* resumo do pedido guardado na conversa e no protocolo (sem o que não serve) */
function resumo(it) {
  if (!it) return null;
  var ev = (it.eventos || []).slice(-12).map(function (e) { return { d: e.d || '', h: e.h || '', s: String(e.s || '').slice(0, 160), c: e.c || '', ts: e.ts || 0 }; });
  var hi = (it.historico || []).slice(-12).map(function (e) { return { status: e.status || '', ts: e.ts || 0 }; });
  return {
    pedido: it.pedido || '', nome: it.nome || '', produtos: String(it.produtos || '').slice(0, 1500),
    status: it.status || '', status_exibido: it.status_exibido || it.status || '',
    transportadora: it.transportadora || '', codigo: it.codigo || '', link_transp: it.link_transp || '',
    data: it.data || '', estado: it.estado || '', cidade: it.cidade || '', origem: it.origem || '',
    atacado: !!it.atacado, primeira_leitura: Number(it.primeira_leitura) || 0, prazo: it.prazo || null,
    aviso: (it.aviso && it.aviso.texto) ? { tipo: String(it.aviso.tipo || ''), texto: String(it.aviso.texto).slice(0, 1500) } : null,   /* v8 */
    eventos: ev, historico: hi, t: Date.now()
  };
}

/* ===== IDENTIFICAÇÃO DO CLIENTE — número do pedido e CPF escritos de qualquer jeito (30/09/2026) =====
   MESMO BLOCO em 3 lugares: logistica-bot.js · botconversa.js (Athena) · página rastrear-pedido.
   Mudou aqui → mudar nos 3. ES5 de propósito (a página roda em celular antigo: sem lookbehind, sem const).
   NÚMERO DO PEDIDO (formato real VF-DDMM-L000; contingência VF-DDMM-LX<HHmm>):
     - minúscula, com/sem "VF", espaço/ponto/barra/traço ou tudo junto: "vf 2909 s012", "VF2909S012",
       "2909-S012", "29/09 S012"; final sem zero ("S12" → S012); letra O no lugar de zero grudada em número
     - letras S M A V W (+X da contingência); dia 01-31 e mês 01-12 — senão não é pedido
     - sem "VF", a letra tem que vir GRUDADA no número ("29/09 S012" sim; "29/09 a 12h" não)
   INCOMPLETO (o sistema explica o que falta — NUNCA chuta letra/data: o número chutado pode ser de outro cliente):
     - sem_letra: "VF-2909-012" · final: só "S012" (falta dia/mês) · cpf_errado: 11 dígitos que não fecham
   CPF: com/sem ponto/traço/espaço; 10 dígitos = perdeu o zero da frente (o índice do GAS guarda com 11) */
var ID_SEP = '[\\s\\-_.\\/]*';
var ID_RE_VF = new RegExp('V\\s*F' + ID_SEP + '(\\d{2})' + ID_SEP + '(\\d{2})' + ID_SEP + '([A-Z]{1,2})' + ID_SEP + '(\\d{1,4})(?![0-9])');
var ID_RE_SEM_VF = /(?:^|[^A-Z0-9])(\d{2})[\/\-.]?(\d{2})[\s\-_.\/]*([SMAVW]X?)[\-_.]?(\d{1,4})(?![A-Z0-9])/;
var ID_RE_SEM_LETRA = new RegExp('V\\s*F' + ID_SEP + '(\\d{2})' + ID_SEP + '(\\d{2})' + ID_SEP + '(\\d{2,4})(?![0-9])');
var ID_RE_FINAL = /(?:^|[^A-Z0-9])([SMAVW]X?)[\-_.]?(\d{2,4})(?![A-Z0-9])/;
var ID_LETRAS = /^[SMAVW]X?$/;
var ID_MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

function idSoDig(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
function idDataOk(dd, mm) { var d = Number(dd), m = Number(mm); return d >= 1 && d <= 31 && m >= 1 && m <= 12; }
/* final do número: normal = 3 dígitos (S12 → S012); contingência (letra + X) = hora e minuto, 4 dígitos */
function idSeq(letra, dig) {
  var s;
  if (/X$/.test(letra)) { s = String(dig); while (s.length < 4) s = '0' + s; return s; }
  s = String(Number(dig)); while (s.length < 3) s = '0' + s; return s;
}
/* maiúscula + letra O no lugar de zero quando grudada em número. NÃO usar pra e-mail. */
function idPrepNum(texto) {
  var t = String(texto || '').toUpperCase();
  for (var i = 0; i < 3; i++) t = t.replace(/(\d)O/g, '$10').replace(/O(\d)/g, '0$1');
  return t;
}
/* número do pedido normalizado ou '' */
function idPedido(texto) {
  var t = idPrepNum(texto), m = t.match(ID_RE_VF);
  if (m && idDataOk(m[1], m[2]) && ID_LETRAS.test(m[3])) return 'VF-' + m[1] + m[2] + '-' + m[3] + idSeq(m[3], m[4]);
  m = t.match(ID_RE_SEM_VF);
  if (m && idDataOk(m[1], m[2])) return 'VF-' + m[1] + m[2] + '-' + m[3] + idSeq(m[3], m[4]);
  return '';
}
function idEmail(texto) {
  var m = String(texto || '').match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : '';
}
function idCpfValido(c) {
  c = idSoDig(c);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  var s = 0, i, r;
  for (i = 0; i < 9; i++) s += Number(c.charAt(i)) * (10 - i);
  r = (s * 10) % 11; if (r === 10) r = 0;
  if (r !== Number(c.charAt(9))) return false;
  s = 0;
  for (i = 0; i < 10; i++) s += Number(c.charAt(i)) * (11 - i);
  r = (s * 10) % 11; if (r === 10) r = 0;
  return r === Number(c.charAt(10));
}
/* { cpf: '11 dígitos válidos' } · { errado: 'dígitos de um CPF que não confere' } · {} */
function idCpf(texto) {
  var t = String(texto || ''), cand = [], i, d, toks = t.split(/\s+/), runs = t.match(/\d(?:[\s.\-\/]{0,2}\d){8,12}/g) || [];
  for (i = 0; i < toks.length; i++) cand.push(idSoDig(toks[i]));
  for (i = 0; i < runs.length; i++) cand.push(idSoDig(runs[i]));
  var errado = '';
  for (i = 0; i < cand.length; i++) {
    d = cand[i];
    if (d.length === 11 && idCpfValido(d)) return { cpf: d };
    if (d.length === 10 && idCpfValido('0' + d)) return { cpf: '0' + d };
    if (!errado && (d.length === 11 || d.length === 10)) errado = d;
  }
  return errado ? { errado: errado } : {};
}
function idCpfFmt(d) {
  d = idSoDig(d);
  return d.length === 11 ? d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9) : d;
}
/* parece pedido/CPF mas falta ou sobra algo: { tipo:'sem_letra'|'cpf_errado'|'final', valor } ou null */
function idIncompleto(texto) {
  var t = idPrepNum(texto), m = t.match(ID_RE_SEM_LETRA);
  if (m && idDataOk(m[1], m[2])) return { tipo: 'sem_letra', valor: 'VF-' + m[1] + m[2] + '-' + m[3] };
  var c = idCpf(texto);
  if (c.errado) return { tipo: 'cpf_errado', valor: c.errado };
  m = t.match(ID_RE_FINAL);
  if (m) return { tipo: 'final', valor: m[1] + idSeq(m[1], m[2]) };
  return null;
}
/* { tipo:'pedido'|'email'|'cpf'|'sem_letra'|'cpf_errado'|'final'|'', valor } */
function idAnalisar(texto) {
  var p = idPedido(texto); if (p) return { tipo: 'pedido', valor: p };
  var e = idEmail(texto); if (e) return { tipo: 'email', valor: e };
  var c = idCpf(texto); if (c.cpf) return { tipo: 'cpf', valor: c.cpf };
  return idIncompleto(texto) || { tipo: '', valor: '' };
}
/* dia e mês da compra ("29/09", "29-9", "29 de setembro") → 'DDMM' ou '' */
function idDiaMes(texto) {
  var t = String(texto || '').toLowerCase(), m = t.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})(?![0-9])/);
  if (m && idDataOk(m[1], m[2])) return ('0' + Number(m[1])).slice(-2) + ('0' + Number(m[2])).slice(-2);
  m = t.match(/(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/);
  if (m && idDataOk(m[1], ID_MESES[m[2]])) return ('0' + Number(m[1])).slice(-2) + ('0' + ID_MESES[m[2]]).slice(-2);
  return '';
}
/* ===== fim do bloco de identificação ===== */

/* nomes usados no resto do bot (mesmas funções do bloco acima) */
function acharNumeroPedido(t) { return idPedido(t); }
function acharEmail(t) { return idEmail(t); }
function acharCPF(t) { return idCpf(t).cpf || ''; }
function analisarCPF(t) { return idCpf(t); }
function cpfValido(c) { return idCpfValido(c); }
function cpfFormatado(d) { return idCpfFmt(d); }
function identificacaoIncompleta(t) { return idIncompleto(t); }
function acharDiaMes(t) { return idDiaMes(t); }
function acharIdentificador(texto) { return idPedido(texto) || idEmail(texto) || idCpf(texto).cpf || ''; }

/* Consulta: função rápida → GAS. { ok:true, pedidos:[...] } ou { ok:false } */
async function consultar(termo) {
  try {
    var r = await fetchT(RASTREIO_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'consultar_status', termo: termo })
    }, 3000);
    var d = await r.json();
    if (d && d.success === true && Array.isArray(d.pedidos)) return { ok: true, pedidos: d.pedidos };
  } catch (e) { console.error('[logistica] rastreio-consulta: ' + e.message); }
  try {
    var r2 = await fetchT(GAS_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'consultar_status', termo: termo })
    }, 5000);
    var d2 = await r2.json();
    if (d2 && d2.success && Array.isArray(d2.pedidos)) return { ok: true, pedidos: d2.pedidos };
    if (d2 && d2.success === false && !d2.erro) return { ok: true, pedidos: [] };
  } catch (e2) { console.error('[logistica] GAS consultar_status: ' + e2.message); }
  return { ok: false, pedidos: [] };
}

/* ------------------------------------------------------------------ textos (padrão; o Firebase vence) */
var MENU_PADRAO =
'*O que você precisa?*\n' +
'1️⃣ Rastreio completo\n' +
'2️⃣ Prazo estimado de entrega\n' +
'3️⃣ Meu pedido está atrasado ou parado\n' +
'4️⃣ Alterar meu pedido (produtos ou dados de entrega)\n' +
'5️⃣ Consta entregue, mas não recebi\n' +
'6️⃣ Recebi com problema (avaria, item faltando ou errado)\n' +
'⠀\n' +
'_Digite só o número da opção. *9* consulta outro pedido._';

var T_PADRAO = {
  boas_vindas:
'👋 Olá{NOME}! Aqui é o *atendimento automático da logística VitaFlow* — funciona 24h.\n⠀\n' +
'Para eu localizar o seu pedido, me mande *um* destes:\n' +
'• o *número do pedido* (ex.: VF-2909-S012)\n• o *CPF* da compra\n• o *e-mail* da compra',

  boas_vindas_volta:
'👋 Olá de novo{NOME}! Quer ver o pedido *{PEDIDO}*?\n⠀\n' +
'*1* — Sim\nOu mande outro *número de pedido*, *CPF* ou *e-mail*.',

  id_invalido:
'🔎 Para eu te ajudar, preciso localizar o pedido. Me mande *um* destes:\n' +
'• o *número do pedido* (ex.: VF-2909-S012) — está no e-mail e no recibo da compra\n' +
'• o *CPF* da compra\n• o *e-mail* da compra',

  nao_achou:
'🔎 Não encontrei pedido com *{TERMO}*.\n⠀\n' +
'Confira e mande de novo o *número do pedido* (ex.: VF-2909-S012), o *CPF* ou o *e-mail* da compra.\n⠀\n' +
'_Pelo CPF ou e-mail aparecem só os pedidos com pagamento confirmado._',

  cpf_invalido:
'🔎 O CPF *{TERMO}* não confere — parece ter algum número trocado ou faltando.\n⠀\n' +
'Confira os 11 números e mande de novo. Se preferir, mande o *número do pedido* (ex.: VF-2909-S012) ou o *e-mail* da compra.',

  pedido_sem_data:
'📅 Achei o final do número do pedido (*{FINAL}*), mas falta o *dia e o mês* da compra — eles fazem parte do número (ex.: VF-*2909*-S012 é uma compra de 29/09).\n⠀\n' +
'Me mande o *dia e o mês* da compra (ex.: *29/09*). Se preferir, mande o *CPF* ou o *e-mail* da compra.',

  pedido_sem_letra:
'🔎 O número *{TERMO}* está incompleto: falta a *letra* antes dos últimos números (ex.: VF-2909-*S*012).\n⠀\n' +
'Confira no e-mail ou no recibo da compra e mande de novo — ou mande o *CPF* ou o *e-mail* da compra.',

  data_invalida:
'📅 Me mande o *dia e o mês* da compra, assim: *29/09*. Se preferir, mande o *CPF* ou o *e-mail* da compra.',

  outro_pedido:
'🔎 Qual pedido você quer consultar? Me mande o *número do pedido* (ex.: VF-2909-S012), o *CPF* ou o *e-mail* da compra.',

  erro_consulta:
'😕 Não consegui consultar o pedido agora. Tente de novo em alguns instantes, por favor.',

  escolher_pedido:
'Encontrei *{N} pedidos*. Qual deles?\n⠀\n{LISTA}\n⠀\n_Digite o número da lista. Não está aqui? Mande o número do pedido._',

  menu: MENU_PADRAO,

  nao_entendi:
'Não entendi 🙂 Responda só com o *número* da opção:',

  audio:
'🎧 Ainda não consigo ouvir áudio. Pode *escrever*, por favor? 🙏',

  midia_fora:
'📎 Recebi o arquivo. Se for sobre *problema no recebimento* (avaria, item faltando ou errado), escolha a opção *6* primeiro, que eu te peço o vídeo da abertura.',

  humano:
'🤝 A nossa equipe de logística atende os casos que precisam de análise — e quem abre esse atendimento sou eu, *na hora*, assim que entendo o seu caso.\n⠀\n' +
'Escolha no menu a opção que descreve o que está acontecendo:',

  fora_assunto:
'Este número é o atendimento da *logística* (entregas e rastreio) 📦\n⠀\n' +
'Para *comprar*, tirar dúvida de *produto* ou ver *promoções*, fale com a *Athena*, nossa consultora 24h:\n👉 wa.me/5511926100192\n🌐 vitaflowoficial.com',

  /* ---- opção 2 (e trechos usados na 3) ---- */
  prazo_estimado:
'_Os prazos são *estimados*, em dias úteis, e podem variar por intercorrências fora do nosso controle: condições das estradas, problemas com o veículo, erro de encaminhamento, centros de distribuição, extravio, furto ou roubo, fiscalização e dificuldade na entrega (endereço ou ausência de quem recebe)._',

  /* ---- opção 3 ---- */
  op3_dentro:
'✅ *O pedido {PEDIDO} está dentro do prazo estimado.*\n⠀\n' +
'📍 Agora: *{STATUS}*\n⏱️ {ETAPA_TXT}\n🗓️ Previsão estimada de entrega: *{PREVISAO}*\n⠀\n' +
'{PRAZO_ESTIMADO}\n⠀\n' +
'Se passar da previsão, me chame aqui e escolha *3* de novo — aí eu abro o atendimento com a logística na hora.',

  op3_entregue:
'📬 A transportadora já registrou a *entrega* desse pedido{DATA_ENTREGA_TXT}.\n⠀\n' +
'• Ainda não recebeu? Digite *5*.\n• Recebeu com problema? Digite *6*.',

  op3_fiscal_ok:
'🔎 O pedido *{PEDIDO}* passou pela fiscalização de rotina e a verificação já foi *concluída* — ele segue o fluxo normal de entrega.\n⠀\n' +
'Acompanhe as próximas movimentações pela opção *1* ou em ' + PAGINA_RASTREIO + '.',

  /* ---- opção 4 ---- */
  op4_tipo:
'✏️ *Alterar o pedido {PEDIDO}*\n⠀\nO que você quer alterar?\n' +
'*1* — Produtos\n*2* — Dados de entrega (endereço, quem recebe, telefone)\n*3* — Os dois\n⠀\n_*0* volta ao menu._',

  op4_postado:
'🚚 O pedido *{PEDIDO}* já está com a *transportadora* ({STATUS}). Depois da postagem não dá mais para alterar produtos nem dados de entrega.',

  op4_prod_bloqueado:
'📦 Os produtos do pedido *{PEDIDO}* já foram *separados para envio*, e nesta etapa não dá mais para trocar.',

  op4_so_entrega:
'📦 Os *produtos* do pedido *{PEDIDO}* já foram separados para envio e não dá mais para trocar — mas os *dados de entrega* ainda dá para alterar.',

  op4_descrever:
'✍️ Escreva *em uma mensagem só* o que você quer alterar ({O_QUE}).\n⠀\n' +
'Exemplos:\n• _Trocar 1 TG 15mg por 1 Tirzec 15mg_\n• _Novo endereço: Rua ..., nº ..., bairro, cidade/UF, CEP_\n⠀\n' +
'_Se houver diferença de valor, a logística te informa. *0* cancela._',

  /* ---- opção 5 ---- */
  op5_nao_consta:
'📦 O pedido *{PEDIDO}* ainda *não consta como entregue*.\n⠀\n📍 Agora: *{STATUS}*{PREVISAO_TXT}\n⠀\n' +
'Se ele estiver demorando, escolha a opção *3*.',

  op5_aguarde:
'📬 A transportadora registrou a entrega em *{DATA_ENTREGA}*{LOCAL_TXT}.\n⠀\n' +
'Não se preocupe: às vezes a transportadora registra a entrega *antes* de o pacote chegar até você. Quando isso acontece, ele costuma ser entregue em até *{ESPERA} horas* depois do registro.\n⠀\n' +
'Enquanto isso, vale conferir:\n• portaria, recepção ou zelador\n• vizinhos e outras pessoas da casa\n• caixa de correio\n⠀\n' +
'Se até *{LIMITE}* não tiver chegado, me chame aqui e escolha a opção *5* de novo — aí eu abro o atendimento com a logística.',

  op5_checklist:
'📬 A transportadora registrou a entrega em *{DATA_ENTREGA}*{LOCAL_TXT}.\n⠀\n' +
'Antes de eu abrir o atendimento, confira, por favor:\n• portaria, recepção ou zelador\n• vizinhos e outras pessoas da casa\n• caixa de correio\n⠀\n' +
'*1* — Já conferi tudo e *não está*\n*2* — Ainda vou conferir',

  op5_conferir:
'👍 Combinado. Se não encontrar, me chame aqui e escolha a opção *5* de novo.',

  /* ---- opção 6 ---- */
  op6_pedir:
'📦 *Recebi com problema — pedido {PEDIDO}*\n⠀\nPara a logística analisar, preciso de *duas coisas*:\n' +
'1. Uma mensagem contando *o que aconteceu* (avaria, item faltando, produto errado...)\n' +
'2. O *vídeo da abertura* da embalagem\n⠀\n' +
'_Sem o vídeo da abertura não conseguimos abrir a análise — é ele que mostra como o pacote chegou._\n⠀\n' +
'_Vídeo pesado pode levar 1 ou 2 minutos para chegar até mim. Depois de enviar, é só aguardar — não precisa mandar de novo._\n⠀\n_*0* cancela._',

  op6_falta_video:
'👍 Anotado. Agora envie o *vídeo da abertura* da embalagem.\n⠀\n_Vídeo pesado pode levar 1 ou 2 minutos para chegar até mim. Depois de enviar, é só aguardar — não precisa mandar de novo._',

  op6_falta_texto:
'🎬 Vídeo recebido! Agora me conte *em uma mensagem* o que aconteceu.',

  op6_foto:
'📷 Recebi a foto, mas para abrir a análise preciso do *vídeo da abertura* da embalagem.',

  op6_sem_video:
'Entendo. Sem o *vídeo da abertura* da embalagem não conseguimos abrir a análise — é ele que mostra como o pacote chegou até você.\n⠀\n' +
'Se você tiver o vídeo, escolha a opção *6* de novo e envie.',

  /* ---- pedido fora do fluxo ---- */
  pagamento_pendente:
'⏳ O pedido *{PEDIDO}* ainda está *aguardando a confirmação do pagamento*. Assim que o pagamento for confirmado, ele entra na fila de envio.\n⠀\n' +
'Se você já pagou e o status não mudou, fale com o nosso atendimento: 👉 wa.me/5511911338515',

  pedido_final:
'ℹ️ O pedido *{PEDIDO}* consta como *{STATUS}*. {EXPLICACAO}\n⠀\n' +
'Para dúvidas sobre cancelamento ou reembolso, fale com o nosso atendimento: 👉 wa.me/5511911338515',

  /* ---- protocolo ---- */
  protocolo_aberto:
'✅ *Atendimento aberto — protocolo {PROTOCOLO}*\n⠀\n{MOTIVO_TXT}\n⠀\n' +
'A nossa logística já recebeu o seu caso com todas as informações do pedido *{PEDIDO}*. A resposta vem *aqui mesmo*, neste WhatsApp.\n⠀\n' +
'🕒 Atendimento da logística: {HORARIO}.\n⠀\n_Não precisa mandar de novo — o seu protocolo já está na fila._',

  protocolo_fora_horario:
'✅ *Atendimento aberto — protocolo {PROTOCOLO}*\n⠀\n{MOTIVO_TXT}\n⠀\n' +
'Agora estamos *fora do horário* da logística ({HORARIO}). O seu caso já está na fila e a resposta vem *aqui mesmo*, a partir de *{ABERTURA}*.\n⠀\n' +
'_Não precisa mandar de novo — o seu protocolo já está na fila._',

  ja_tem_protocolo:
'📌 Já existe um atendimento aberto para o pedido *{PEDIDO}* — protocolo *{PROTOCOLO}* ({MOTIVO}).\n⠀\n' +
'A logística responde aqui mesmo. Se quiser acrescentar alguma informação, é só escrever que eu anexo ao protocolo.',

  aguardando_lembrete:
'📌 O seu atendimento *{PROTOCOLO}* está na fila da logística e a resposta vem aqui. Anotei a sua mensagem no protocolo.\n⠀\n_Para ver o menu de novo, digite *0*._',

  /* frases do topo do protocolo (MOTIVO_TXT) */
  motivo_atraso: '⏱️ O pedido passou do prazo estimado da etapa ({ETAPA_TXT}).',
  motivo_excecao: '⚠️ A transportadora registrou: *{STATUS}*. {EXPLICACAO}',
  motivo_alteracao: '✏️ Pedido de alteração: {O_QUE}.',
  motivo_nao_recebi: '📬 Consta entregue em {DATA_ENTREGA}, mas você não recebeu.',
  motivo_avaria: '📦 Recebido com problema — descrição e vídeo da abertura anexados.'
};

var MOTIVO_NOME = { atraso: 'atraso', excecao: 'ocorrência da transportadora', alteracao: 'alteração de pedido',
  nao_recebi: 'consta entregue e não recebeu', avaria: 'recebido com problema' };

var _cache = { cfg: null, cfgT: 0, txt: null, txtT: 0 };
async function carregarCfg() {
  if (_cache.cfg && Date.now() - _cache.cfgT < MIN) return _cache.cfg;
  var b = await fbGet(RAIZ + '/config');
  var c = JSON.parse(JSON.stringify(CFG_PADRAO));
  if (b && typeof b === 'object') {
    for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k) && b[k] !== null && b[k] !== undefined) c[k] = b[k];
    if (c.modo !== 'ligado') c.modo = 'desligado';   /* v9: só 'ligado' liga; 'teste' antigo ou valor estranho = desligado */
  }
  if (!c.horario || !c.horario.semana) c.horario = CFG_PADRAO.horario;
  _cache.cfg = c; _cache.cfgT = Date.now();
  return c;
}
async function carregarTextos() {
  if (_cache.txt && Date.now() - _cache.txtT < MIN) return _cache.txt;
  var T = {}, k;
  for (k in T_PADRAO) T[k] = T_PADRAO[k];
  var b = await fbGet(RAIZ + '/textos');
  if (b && typeof b === 'object') {
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k) && typeof b[k] === 'string' && b[k].trim()) T[k] = b[k];
  }
  _cache.txt = T; _cache.txtT = Date.now();
  return T;
}
function preencher(t, v) {
  return String(t || '').replace(/\{([A-Z_]+)\}/g, function (m, k) { return (v && v[k] != null) ? String(v[k]) : ''; });
}

/* ------------------------------------------------------------------ textos montados a partir do pedido */
function etapaTxt(p) {
  if (!p || !p.etapa) return '';
  var d = Number(p.dias) || 0, n = Number(p.normal) || 0;
  var du = function (x) { return x + (x === 1 ? ' dia útil' : ' dias úteis'); };
  if (p.etapa === 'postagem') return 'Aguardando a postagem há ' + du(d) + ' — o normal é até ' + du(n) + '.';
  if (p.etapa === 'entrega') return 'Em transporte há ' + du(d) + ' — o normal é até ' + du(n) + '.';
  return '';
}
function previsaoTxt(p) {
  if (!p || !p.previsao_de) return '';
  return (p.previsao_de === p.previsao_ate) ? p.previsao_de : ('de ' + p.previsao_de + ' a ' + p.previsao_ate);
}
function primeiroNome(s) {
  var n = String(s || '').replace(/[^A-Za-zÀ-ÿ\s]/g, ' ').trim().split(/\s+/)[0] || '';
  return n.length >= 2 ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : '';
}

/* v5: "Nome (R$ 1049,00 un.) x1, Outro (R$ 649,00 un.) x2" → ["• 1x Nome · R$ 1.049,00", "• 2x Outro · R$ 649,00 cada"].
   Formato da coluna PRODUTOS (site, Athena e Orçamento: descrição + "(R$ x un.)" + " xN", separados por vírgula).
   Se o texto não estiver nesse formato, separa pelas vírgulas que não estão dentro de parênteses e mostra como veio. */
function reaisBR(v) {
  var n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  if (!isFinite(n)) return String(v);
  var s = n.toFixed(2).split('.'), i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return i + ',' + s[1];
}
function produtosLinhas(txt, max) {
  max = max || 10;
  var t = String(txt || '').replace(/\s+/g, ' ').trim(), itens = [], m;
  var re = /\s*(.+?)\s*(?:\(R\$\s*([\d.]*\d(?:,\d{1,2})?)\s*un\.?\))?\s*x\s?(\d+)\s*(?:,|$)/g, cobriu = 0;
  while ((m = re.exec(t)) !== null) {
    if (m.index !== cobriu && t.slice(cobriu, m.index).trim()) break;
    var q = Number(m[3]) || 1, nome = m[1].replace(/^[,\s]+|[,\s]+$/g, '');
    itens.push('• ' + q + 'x ' + nome + (m[2] ? ' · R$ ' + reaisBR(m[2]) + (q > 1 ? ' cada' : '') : ''));
    cobriu = re.lastIndex;
    if (re.lastIndex === m.index) break;
  }
  if (!itens.length || t.slice(cobriu).trim()) {
    /* fora do formato: vírgula fora de parênteses separa os itens */
    itens = []; var nivel = 0, atual = '';
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i);
      if (ch === '(') nivel++;
      if (ch === ')' && nivel > 0) nivel--;
      if (ch === ',' && nivel === 0) { if (atual.trim()) itens.push('• ' + atual.trim()); atual = ''; continue; }
      atual += ch;
    }
    if (atual.trim()) itens.push('• ' + atual.trim());
  }
  if (itens.length > max) { var resto = itens.length - (max - 1); itens = itens.slice(0, max - 1); itens.push('• _+' + resto + ' itens_'); }
  return itens;
}

/* v8: AVISO da página de rastreio no WhatsApp. NÃO muda nenhuma palavra do texto: uma frase por linha, a 1ª em negrito,
   negrito nos trechos principais e itálico no "Fique tranquilo" (os mesmos destaques da página v9). */
var AV_EMOJI = '(?:[\\uD83C-\\uDBFF][\\uDC00-\\uDFFF]|[\\u2190-\\u2BFF\\uFE0F\\u200D])';
var AV_FIM = new RegExp('([.!?](?:\\s*' + AV_EMOJI + ')*)\\s+(?=[A-ZÀ-Ý])', 'g');
var AV_NEGRITO = ['o código de rastreamento ainda não está disponível', 'o status detalhado ainda não foi alterado', 'o seu código aparecerá aqui!',
  'as informações serão atualizadas automaticamente aqui', 'transporte 100% seguro', 'a postagem ocorrerá logo em seguida', 'já abriu um chamado junto à transportadora'];
var AV_ITALICO = ['Fique tranquilo', 'fique tranquilo', 'Agradecemos a compreensão'];
function avisoWhats(t) {
  var frases = [];
  String(t || '').split(/\n+/).forEach(function (bloco) {
    bloco.replace(AV_FIM, '$1\n').split('\n').forEach(function (f) { f = f.replace(/^\s+|\s+$/g, ''); if (f) frases.push(f); });
  });
  return frases.map(function (f, i) {
    if (i === 0 && frases.length > 1) return '*' + f + '*';
    AV_NEGRITO.forEach(function (x) { f = f.split(x).join('*' + x + '*'); });
    AV_ITALICO.forEach(function (x) { f = f.split(x).join('_' + x + '_'); });
    return f;
  }).join('\n');
}
/* o aviso só vale para pedido em andamento (o mesmo critério da página) */
function avisoDe(snap) { return (snap && snap.aviso && snap.aviso.texto && categoria(snap) === 'fluxo') ? snap.aviso : null; }
function avisoPostagem(av) { return !!av && (av.tipo === 'sem_codigo' || av.tipo === 'objeto_criado' || av.tipo === 'atacado'); }

function cartao(snap, T) {
  var s = statusDe(snap), cat = categoria(snap), L = [], av = avisoDe(snap);
  L.push('📦 *Pedido ' + snap.pedido + '*');
  if (snap.nome) L.push('👤 ' + snap.nome);
  if (snap.produtos) { L.push('🧾 *Produtos:*'); produtosLinhas(snap.produtos).forEach(function (x) { L.push(x); }); }   /* v5 */
  L.push('⠀');
  if (cat === 'entregue') {
    var ei = entregaInfo(snap);
    L.push('📬 *A transportadora registrou a entrega*' + (ei.ts ? ' em ' + ddmmhhmm(ei.ts) : '') + (ei.local ? ' (' + ei.local + ')' : '') + '.');
    L.push('_Ainda não recebeu? Escolha a opção *5*._');
  } else {
    L.push('📍 *Status:* ' + rotuloStatus(s) + ((EXPLIC[s] && !avisoPostagem(av)) ? ' — ' + EXPLIC[s] : ''));   /* v8: com o aviso de postagem, quem explica é o aviso (igual à página) */
    if (cat === 'excecao') L.push('_Para a logística verificar, escolha a opção *3*._');
  }
  if (snap.transportadora) L.push('🚚 ' + snap.transportadora + (snap.codigo ? ' · código *' + snap.codigo + '*' : ''));
  if (ORIGEM[snap.origem] && cat !== 'entregue') L.push('🏭 Sai de: ' + ORIGEM[snap.origem]);
  var prev = previsaoTxt(snap.prazo);
  if (prev && (cat === 'fluxo')) L.push('🗓️ Previsão estimada de entrega: *' + prev + '*');
  if (av) { L.push('⠀'); L.push(avisoWhats(av.texto)); }   /* v8 */
  L.push('⠀');
  L.push(T.menu);
  return L.join('\n');
}

function textoRastreio(snap, T) {
  var L = ['🔎 *Rastreio do pedido ' + snap.pedido + '*', '⠀'];
  var s = statusDe(snap), av = avisoDe(snap);   /* v8 */
  if (snap.codigo) {
    L.push('🚚 ' + (snap.transportadora || 'Transportadora') + ' · código *' + snap.codigo + '*');
    if (snap.link_transp) L.push('👉 ' + snap.link_transp);
  } else {
    L.push('📍 Agora: *' + rotuloStatus(s) + '*' + ((EXPLIC[s] && !avisoPostagem(av)) ? ' — ' + EXPLIC[s] : ''));
    /* v8: com o aviso 1 ou 2 na mensagem, esta frase dizia outra coisa sobre o código — não vai */
    if (!(av && (av.tipo === 'sem_codigo' || av.tipo === 'objeto_criado'))) L.push('_O código de rastreio aparece aqui assim que a transportadora fizer a *primeira leitura* do pacote._');
  }
  if (av) { L.push('⠀'); L.push(avisoWhats(av.texto)); }   /* v8 */
  var ev = (snap.eventos || []).slice(-6).reverse();
  if (ev.length) {
    L.push('⠀'); L.push('*Últimas movimentações da transportadora:*');
    ev.forEach(function (e) {
      var quando = (e.d ? String(e.d).slice(0, 5) : '') + (e.h ? ' ' + e.h : '');
      L.push('• ' + (quando ? quando + ' — ' : '') + e.s + (e.c ? ' — ' + e.c : ''));
    });
  } else if ((snap.historico || []).length) {
    L.push('⠀'); L.push('*Histórico do pedido:*');
    (snap.historico || []).slice(-5).reverse().forEach(function (h) {
      L.push('• ' + (h.ts ? ddmm(h.ts) + ' — ' : '') + rotuloStatus(h.status));
    });
  }
  L.push('⠀');
  L.push('Acompanhe tudo, com mapa: ' + PAGINA_RASTREIO);
  L.push('⠀');
  L.push('_*0* volta ao menu._');
  return L.join('\n');
}

function textoPrazo(snap, T) {
  var p = snap.prazo || {}, cat = categoria(snap), L = ['⏱️ *Prazo estimado — pedido ' + snap.pedido + '*', '⠀'];
  L.push('📍 Agora: *' + rotuloStatus(statusDe(snap)) + '*');
  if (cat === 'entregue') {
    var ei = entregaInfo(snap);
    L.push('📬 A transportadora registrou a entrega' + (ei.ts ? ' em ' + ddmmhhmm(ei.ts) : '') + '.');
  } else if (cat === 'fluxo') {
    var et = etapaTxt(p); if (et) L.push('⏱️ ' + et);
    var pv = previsaoTxt(p); if (pv) L.push('🗓️ Previsão estimada de entrega: *' + pv + '*');
    if (snap.estado) L.push('📌 Entrega para ' + (snap.cidade ? snap.cidade + '/' : '') + snap.estado);
  }
  L.push('⠀'); L.push(T.prazo_estimado);
  L.push('⠀'); L.push('_*0* volta ao menu._');
  return L.join('\n');
}

/* ------------------------------------------------------------------ alteração: o que ainda dá pra trocar */
async function regraAlteracao(snap, cfg, agora) {
  var postado = jaPostado(snap);
  var out = { postado: postado, entrega: !postado, produtos: false, grupos: [] };
  if (postado || categoria(snap) === 'final') { out.entrega = false; return out; }
  var comp = await fbGet('vitaflow_compras/' + chaveFb(snap.pedido));
  var grupos = (comp && comp.grupos && typeof comp.grupos === 'object') ? comp.grupos : {};
  var flex = String(cfg.fornecedores_flex || '').split(/[,;]/).map(function (x) { return up(x); }).filter(Boolean);
  var hoje = diaBR(agora), algum = false, nomes = Object.keys(grupos);
  if (!nomes.length) { out.produtos = true; return out; }    /* nada comprado ainda */
  nomes.forEach(function (f) {
    var g = grupos[f] || {}, fu = up(f), pode, regra;
    var ehFlex = flex.some(function (x) { return fu.indexOf(x) >= 0; });
    var tCompra = g.compradoEm ? Date.parse(g.compradoEm) : 0;
    if (!g.comprado) { pode = true; regra = 'ainda não comprado'; }
    else if (ehFlex) { pode = true; regra = 'comprado ' + (tCompra ? ddmm(tCompra) : '') + ' — troca até postar'; }
    else if (tCompra && diaBR(tCompra) === hoje) { pode = true; regra = 'comprado hoje — troca só hoje'; }
    else { pode = false; regra = 'comprado ' + (tCompra ? ddmm(tCompra) : '') + ' — passou do dia da compra'; }
    if (pode) algum = true;
    out.grupos.push({ forn: f, comprado: !!g.comprado, compradoEm: g.compradoEm || '', pode: pode, regra: regra });
  });
  out.produtos = algum;
  return out;
}

/* ------------------------------------------------------------------ protocolo */
var PROTOCOLO_INICIO = 11;   /* v5: o 1º protocolo do dia é o 011 (pedido do Thiago, 01/10/2026) */
function chaveDoProtocolo(agora, n) {
  n = n + PROTOCOLO_INICIO - 1;
  var p = partesBR(agora), nn = n < 1000 ? ('00' + n).slice(-3) : String(n);
  return { chave: p.y + p.m + p.d + '-' + nn, id: 'LOG-' + p.d + p.m + '-' + nn };
}

async function protocoloAbertoDoPedido(pedido) {
  var ch = await fbGet(RAIZ + '/por_pedido/' + chaveFb(pedido));
  if (!ch) return null;
  var pr = await fbGet(RAIZ + '/protocolos/' + ch);
  if (pr && pr.status && pr.status !== 'resolvido') return pr;
  return null;
}

function textoAvisoAna(pr, cfg) {
  var p = pr.pedido_info || {}, L = [];
  L.push('🆕 *Protocolo ' + pr.id + '* — ' + (MOTIVO_NOME[pr.motivo] || pr.motivo));
  L.push('Pedido: *' + pr.pedido + '*');
  L.push('Cliente: ' + (pr.cliente.nome || pr.cliente.whatsapp_nome || '—') + ' · wa.me/' + pr.cliente.telefone);
  L.push('Status: ' + rotuloStatus(p.status_exibido || p.status) + (p.transportadora ? ' · ' + p.transportadora : '') + (p.codigo ? ' · ' + p.codigo : ''));
  if (pr.detalhe) L.push('Detalhe: ' + pr.detalhe);
  if (pr.texto_cliente) L.push('Cliente escreveu: "' + String(pr.texto_cliente).slice(0, 400) + '"');
  if (pr.video) L.push('Vídeo: ' + pr.video);
  if (pr.fora_horario) L.push('_(aberto fora do horário)_');
  if (cfg.painel_url) L.push('Painel: ' + cfg.painel_url);
  return L.join('\n');
}

/* Abre o protocolo. Devolve { texto, chave } ou { texto } quando já existe um aberto. */
async function abrirProtocolo(ctx, motivo, extra) {
  var snap = ctx.conv.snap, T = ctx.T, cfg = ctx.cfg, agora = ctx.agora;
  var existente = await protocoloAbertoDoPedido(snap.pedido);
  if (existente) {
    ctx.conv.estado = 'AGUARDANDO'; ctx.conv.protocolo = existente.chave;
    if (extra && (extra.texto || extra.video)) {   /* não perde o que o cliente acabou de mandar */
      await fbPut(RAIZ + '/protocolos/' + existente.chave + '/msgs/' + agora, { t: agora, tipo: extra.video ? 'video' : 'texto',
        texto: '[' + (MOTIVO_NOME[motivo] || motivo) + '] ' + String(extra.texto || '').slice(0, 1500), url: extra.video || '' });
      await fbPatch(RAIZ + '/protocolos/' + existente.chave, { atualizado: agora, msg_nova: true });
    }
    return { texto: preencher(T.ja_tem_protocolo, { PEDIDO: snap.pedido, PROTOCOLO: existente.id, MOTIVO: MOTIVO_NOME[existente.motivo] || existente.motivo }) };
  }
  var n = await proximoDoContador(RAIZ + '/seq/' + diaBR(agora).replace(/-/g, ''));
  var k = chaveDoProtocolo(agora, n);
  var foraHorario = !dentroHorario(agora, cfg);
  var ei = entregaInfo(snap);
  var vars = {
    PEDIDO: snap.pedido, PROTOCOLO: k.id, STATUS: rotuloStatus(statusDe(snap)), EXPLICACAO: EXPLIC[statusDe(snap)] || '',
    ETAPA_TXT: etapaTxt(snap.prazo).replace(/\.$/, ''), DATA_ENTREGA: ei.ts ? ddmmhhmm(ei.ts) : '',
    O_QUE: (extra && extra.o_que) || '', HORARIO: textoHorario(cfg),
    ABERTURA: textoAbertura(proximaAbertura(agora, cfg), agora)
  };
  var pr = {
    id: k.id, chave: k.chave, pedido: snap.pedido, motivo: motivo,
    detalhe: (extra && extra.detalhe) || '', texto_cliente: (extra && extra.texto) || '', video: (extra && extra.video) || '',
    alteracao: (extra && extra.alteracao) || null,
    cliente: { nome: snap.nome || '', whatsapp_nome: ctx.senderName || '', telefone: ctx.phone },
    pedido_info: snap, entrega_ts: ei.ts || 0,
    status: 'aberto', criado: agora, atualizado: agora, fora_horario: foraHorario, avisado_ana: false,
    historico: {}
  };
  pr.historico[agora] = { acao: 'aberto pelo bot', por: 'bot' };
  await fbPut(RAIZ + '/protocolos/' + k.chave, pr);
  await fbPut(RAIZ + '/por_pedido/' + chaveFb(snap.pedido), k.chave);
  ctx.conv.estado = 'AGUARDANDO'; ctx.conv.protocolo = k.chave;
  ctx.protocoloNovo = true;

  /* aviso: dentro do horário vai na hora pro WhatsApp da Ana; fora, entra na fila e sai na abertura */
  var aviso = textoAvisoAna(pr, cfg);
  if (!foraHorario && cfg.ana_whatsapp) {
    ctx.depois.push(function () {
      return enviar(cfg.ana_whatsapp, aviso).then(function (ok) {
        if (ok) return fbPatch(RAIZ + '/protocolos/' + k.chave, { avisado_ana: true });
      });
    });
  } else {
    await fbPut(RAIZ + '/fila_aviso/' + k.chave, true);
  }
  ctx.depois.push(function () { return telegram('🚚 LOGÍSTICA — ' + aviso.replace(/\*/g, '')); });

  vars.MOTIVO_TXT = preencher(T['motivo_' + motivo] || '', vars);
  return { texto: preencher(foraHorario ? T.protocolo_fora_horario : T.protocolo_aberto, vars), chave: k.chave };
}

/* ------------------------------------------------------------------ opções do menu */
async function atualizarSnap(ctx, forcar) {
  var c = ctx.conv;
  if (!c.pedido) return false;
  if (!forcar && c.snap && c.snap.t && ctx.agora - c.snap.t < 5 * MIN) return true;
  var r = await consultar(c.pedido);
  if (!r.ok) return !!c.snap;          /* consulta fora do ar: segue com o que já tinha */
  var it = null;
  for (var i = 0; i < r.pedidos.length; i++) if (up(r.pedidos[i].pedido) === up(c.pedido)) it = r.pedidos[i];
  if (it) c.snap = resumo(it);
  return !!c.snap;
}

async function opcao(ctx, n) {
  var T = ctx.T, c = ctx.conv;
  if (!(await atualizarSnap(ctx, false))) { ctx.msgs.push(T.erro_consulta); return; }
  var snap = c.snap, cat = categoria(snap), s = statusDe(snap);
  var v = { PEDIDO: snap.pedido, STATUS: rotuloStatus(s), EXPLICACAO: EXPLIC[s] || '' };

  if (n === 1) { ctx.msgs.push(textoRastreio(snap, T)); c.estado = 'MENU'; return; }
  if (n === 2) { ctx.msgs.push(textoPrazo(snap, T)); c.estado = 'MENU'; return; }

  if (n === 3) {
    c.estado = 'MENU';
    if (cat === 'pagamento') { ctx.msgs.push(preencher(T.pagamento_pendente, v)); return; }
    if (cat === 'final') { ctx.msgs.push(preencher(T.pedido_final, v)); return; }
    if (cat === 'entregue') {
      var e3 = entregaInfo(snap);
      ctx.msgs.push(preencher(T.op3_entregue, { DATA_ENTREGA_TXT: e3.ts ? ' em ' + ddmmhhmm(e3.ts) : '' }));
      return;
    }
    if (cat === 'excecao') { ctx.msgs.push((await abrirProtocolo(ctx, 'excecao', { detalhe: rotuloStatus(s) })).texto); return; }
    if (cat === 'fiscal_ok') { ctx.msgs.push(preencher(T.op3_fiscal_ok, v)); return; }
    var p = snap.prazo || {};
    if (p.fora) {
      ctx.msgs.push((await abrirProtocolo(ctx, 'atraso', { detalhe: etapaTxt(p) })).texto);
      return;
    }
    ctx.msgs.push(preencher(T.op3_dentro, {
      PEDIDO: snap.pedido, STATUS: rotuloStatus(s), ETAPA_TXT: etapaTxt(p) || '—',
      PREVISAO: previsaoTxt(p) || 'em cálculo', PRAZO_ESTIMADO: T.prazo_estimado
    }));
    return;
  }

  if (n === 4) {
    if (cat === 'final') { c.estado = 'MENU'; ctx.msgs.push(preencher(T.pedido_final, v)); return; }
    if (jaPostado(snap)) { c.estado = 'MENU'; ctx.msgs.push(preencher(T.op4_postado, v)); return; }
    c.estado = 'ALT_TIPO';
    ctx.msgs.push(preencher(T.op4_tipo, v));
    return;
  }

  if (n === 5) {
    c.estado = 'MENU';
    if (cat !== 'entregue') {
      var pv = previsaoTxt(snap.prazo);
      ctx.msgs.push(preencher(T.op5_nao_consta, { PEDIDO: snap.pedido, STATUS: rotuloStatus(s),
        PREVISAO_TXT: (pv && cat === 'fluxo') ? '\n🗓️ Previsão estimada de entrega: *' + pv + '*' : '' }));
      return;
    }
    var ei = entregaInfo(snap), espera = Number(ctx.cfg.espera_entregue_horas) || 48;
    var v5 = { DATA_ENTREGA: ei.ts ? ddmmhhmm(ei.ts) : '(data não informada)', LOCAL_TXT: ei.local ? ' (' + ei.local + ')' : '',
      ESPERA: espera, LIMITE: ei.ts ? ddmmhhmm(ei.ts + espera * HORA) : '' };
    if (ei.ts && ctx.agora - ei.ts < espera * HORA) { ctx.msgs.push(preencher(T.op5_aguarde, v5)); return; }
    c.estado = 'NR';
    ctx.msgs.push(preencher(T.op5_checklist, v5));
    return;
  }

  if (n === 6) {
    c.estado = 'AV'; c.av = { texto: '', video: '' };
    ctx.msgs.push(preencher(T.op6_pedir, v));
    return;
  }
}

/* palavras soltas no menu → opção (o cliente nem sempre digita o número) */
function opcaoPorPalavra(t, snap) {
  var s = low(t);
  if (/avaria|quebrad|vazand|vazou|amassad|violad|faltando|faltou|veio errad|produto errad|item errad|danificad/.test(s)) return 6;
  if (/nao (recebi|chegou)|não (recebi|chegou)/.test(s)) return (snap && categoria(snap) === 'entregue') ? 5 : 3;
  if (/alterar|mudar endereco|trocar endereco|mudar o endereco|trocar o endereco|trocar produto|trocar o produto|mudar produto|endereco errado/.test(s)) return 4;
  if (/atras|parad|demor|travad/.test(s)) return 3;
  if (/rastre|codigo|cadê|cade|onde esta|onde ta/.test(s)) return 1;
  if (/prazo|quando chega|quanto tempo|previsao/.test(s)) return 2;
  return 0;
}
function pedeHumano(t) { return /\b(atendente|humano|pessoa|alguem|falar com (a|o)? ?(ana|logistica|responsavel|gerente))\b/.test(low(t)); }
function ehForaAssunto(t) { return /\b(comprar|quero comprar|preco|precos|quanto custa|catalogo|cupom|promocao|promocoes|tabela de preco)\b/.test(low(t)); }

/* ------------------------------------------------------------------ fluxo da conversa */
async function mostrarPedidos(ctx, termo) {
  var T = ctx.T, c = ctx.conv;
  var r = await consultar(termo);
  if (!r.ok) { ctx.msgs.push(T.erro_consulta); return; }
  var lista = r.pedidos.slice();
  if (!lista.length) { c.estado = 'ID'; ctx.msgs.push(preencher(T.nao_achou, { TERMO: termo })); return; }
  if (lista.length === 1) {
    c.pedido = lista[0].pedido; c.snap = resumo(lista[0]); c.estado = 'MENU'; c.opcoes = null;
    ctx.msgs.push(cartao(c.snap, T));
    return;
  }
  lista.reverse();                         /* mais recente primeiro */
  lista = lista.slice(0, 8);
  c.opcoes = lista.map(function (p) { return p.pedido; });
  c.estado = 'ESCOLHER';
  var L = lista.map(function (p, i) {
    return (i + 1) + '️⃣ *' + p.pedido + '* — ' + (p.data ? String(p.data).slice(0, 5) + ' — ' : '') + rotuloStatus(p.status_exibido || p.status);
  });
  ctx.msgs.push(preencher(T.escolher_pedido, { N: r.pedidos.length, LISTA: L.join('\n') }));
}

async function processar(ctx) {
  var T = ctx.T, c = ctx.conv, m = ctx.m, txt = m.texto, t = low(txt);
  var est = c.estado || '';

  /* conversa parada há mais de 24 h: recomeça (menos quem está com protocolo aberto) */
  if (c.ts && ctx.agora - c.ts > 24 * HORA && est !== 'AGUARDANDO') est = c.pedido ? 'VOLTA' : '';

  /* protocolo aberto: o bot só anota e lembra (1x a cada 3 h). "0" volta ao menu. */
  if (est === 'AGUARDANDO') {
    var pr = c.protocolo ? await fbGet(RAIZ + '/protocolos/' + c.protocolo) : null;
    if (!pr || pr.status === 'resolvido') {
      est = c.pedido ? 'VOLTA' : '';
      c.protocolo = null;
    } else {
      if (t === '0' || t === 'menu') { c.estado = 'MENU'; await atualizarSnap(ctx, true); if (c.snap) ctx.msgs.push(cartao(c.snap, T)); return; }
      /* quer ver OUTRO pedido: segue o fluxo normal (o protocolo continua aberto na fila) */
      var outro = acharIdentificador(txt);
      if (t === '9' || t === 'outro pedido' || (outro && up(outro) !== up(c.pedido))) est = 'MENU';
    }
  }
  /* continua no protocolo: anota a mensagem (texto, áudio, foto, vídeo) pra Ana ver no painel */
  if (est === 'AGUARDANDO') {
    if (!m.tipo || m.tipo === 'outro') return;
    var reg = { t: ctx.agora, tipo: m.tipo, texto: String(txt || m.legenda || '').slice(0, 800), url: m.url || '' };
    await fbPut(RAIZ + '/protocolos/' + c.protocolo + '/msgs/' + ctx.agora, reg);
    await fbPatch(RAIZ + '/protocolos/' + c.protocolo, { atualizado: ctx.agora, msg_nova: true });
    if (!c.lembrete_ts || ctx.agora - c.lembrete_ts > 3 * HORA) {
      c.lembrete_ts = ctx.agora;
      ctx.msgs.push(preencher(T.aguardando_lembrete, { PROTOCOLO: pr.id }));
    }
    c.estado = 'AGUARDANDO';
    return;
  }

  /* ---- mídia ---- */
  if (m.tipo === 'audio') { ctx.msgs.push(T.audio); if (est === 'MENU') ctx.msgs.push(T.menu); c.estado = est; return; }
  if (m.tipo === 'outro') { c.estado = est; return; }   /* figurinha, reação, localização: ignora */
  if (est === 'AV') return coletarAvaria(ctx);
  if (m.tipo === 'video' || m.tipo === 'imagem' || m.tipo === 'documento') {
    c.estado = est || 'ID';
    if (!est) ctx.msgs.push(preencher(T.boas_vindas, { NOME: ctx.nomeTxt }));
    else if (est === 'ID' || est === 'VOLTA') ctx.msgs.push(T.id_invalido);
    else ctx.msgs.push(T.midia_fora);
    return;
  }

  /* ---- texto ---- */
  if (!txt) return;

  if (est === 'ALT_TEXTO') {
    if (t === '0') { c.estado = 'MENU'; ctx.msgs.push(T.menu); return; }
    if (txt.length < 4) { ctx.msgs.push(preencher(T.op4_descrever, { O_QUE: c.alt ? c.alt.o_que : '' })); return; }
    await atualizarSnap(ctx, true);
    if (jaPostado(c.snap)) { c.estado = 'MENU'; ctx.msgs.push(preencher(T.op4_postado, { PEDIDO: c.pedido, STATUS: rotuloStatus(statusDe(c.snap)) })); return; }
    var alt = c.alt || {};
    ctx.msgs.push((await abrirProtocolo(ctx, 'alteracao', {
      o_que: alt.o_que || '', texto: txt.slice(0, 1500), alteracao: alt,
      detalhe: 'Alterar ' + (alt.o_que || '') + (alt.grupos && alt.grupos.length ? ' · ' + alt.grupos.map(function (g) { return g.forn + ': ' + g.regra; }).join(' | ') : '')
    })).texto);
    c.alt = null;
    return;
  }

  /* comandos de qualquer lugar */
  if (t === '0' || t === 'menu' || t === 'inicio' || t === 'voltar') {
    if (c.pedido) { await atualizarSnap(ctx, true); if (c.snap) { c.estado = 'MENU'; ctx.msgs.push(cartao(c.snap, T)); return; } }
    c.estado = 'ID'; ctx.msgs.push(preencher(T.boas_vindas, { NOME: ctx.nomeTxt })); return;
  }
  if (t === '9' && est !== 'ESCOLHER' || t === 'outro pedido') {
    c.estado = 'ID'; c.pedido = null; c.snap = null; ctx.msgs.push(T.outro_pedido); return;
  }

  /* número de pedido, CPF ou e-mail em qualquer etapa = consulta direto */
  var termo = acharIdentificador(txt);
  if (termo && est !== 'AV') { c.parcial = null; await mostrarPedidos(ctx, termo); return; }

  /* só o final do número ("S012"): falta o dia e o mês da compra */
  if (est === 'PED_DATA') {
    var dm = acharDiaMes(txt);
    if (dm && c.parcial) {
      var montado = 'VF-' + dm + '-' + c.parcial;
      c.parcial = null;
      await mostrarPedidos(ctx, montado);
      return;
    }
    if (ehForaAssunto(txt)) { ctx.msgs.push(T.fora_assunto); return; }
    ctx.msgs.push(T.data_invalida);
    return;
  }

  /* parece pedido/CPF mas falta ou sobra algo — explica o que é (antes da resposta genérica).
     No MENU só vale "VF + data sem letra" (o resto ali pode ser outra coisa: telefone, apto A10...) */
  if (est === '' || est === 'ID' || est === 'VOLTA' || est === 'ESCOLHER' || est === 'MENU') {
    var inc = identificacaoIncompleta(txt);
    if (inc && (est !== 'MENU' || inc.tipo === 'sem_letra')) {
      if (inc.tipo === 'sem_letra') { c.estado = est || 'ID'; ctx.msgs.push(preencher(T.pedido_sem_letra, { TERMO: inc.valor })); return; }
      if (inc.tipo === 'cpf_errado') { c.estado = est || 'ID'; ctx.msgs.push(preencher(T.cpf_invalido, { TERMO: cpfFormatado(inc.valor) })); return; }
      if (inc.tipo === 'final') { c.estado = 'PED_DATA'; c.parcial = inc.valor; ctx.msgs.push(preencher(T.pedido_sem_data, { FINAL: inc.valor })); return; }
    }
  }

  if (est === 'ESCOLHER') {
    var i = parseInt(t, 10);
    if (c.opcoes && i >= 1 && i <= c.opcoes.length && String(i) === t) {
      c.pedido = c.opcoes[i - 1]; c.snap = null; c.opcoes = null;
      if (!(await atualizarSnap(ctx, true))) { ctx.msgs.push(T.erro_consulta); return; }
      c.estado = 'MENU'; ctx.msgs.push(cartao(c.snap, T)); return;
    }
    ctx.msgs.push(T.nao_entendi);
    ctx.msgs.push(preencher(T.escolher_pedido, { N: c.opcoes ? c.opcoes.length : 0,
      LISTA: (c.opcoes || []).map(function (p, k) { return (k + 1) + '️⃣ *' + p + '*'; }).join('\n') }));
    return;
  }

  if (est === 'VOLTA') {
    if (t === '1' || t === 'sim') {
      if (!(await atualizarSnap(ctx, true))) { ctx.msgs.push(T.erro_consulta); return; }
      c.estado = 'MENU'; ctx.msgs.push(cartao(c.snap, T)); return;
    }
    if (ehForaAssunto(txt)) { ctx.msgs.push(T.fora_assunto); c.estado = 'VOLTA'; return; }
    c.estado = 'VOLTA';
    ctx.msgs.push(preencher(T.boas_vindas_volta, { NOME: ctx.nomeTxt, PEDIDO: c.pedido }));
    return;
  }

  if (!est) {
    c.estado = 'ID';
    if (ehForaAssunto(txt)) { ctx.msgs.push(T.fora_assunto); }
    ctx.msgs.push(preencher(T.boas_vindas, { NOME: ctx.nomeTxt }));
    return;
  }

  if (est === 'ID') {
    c.estado = 'ID';
    if (ehForaAssunto(txt)) { ctx.msgs.push(T.fora_assunto); return; }
    ctx.msgs.push(T.id_invalido);
    return;
  }

  if (est === 'ALT_TIPO') {
    if (t === '1' || t === '2' || t === '3') {
      await atualizarSnap(ctx, true);
      var r = await regraAlteracao(c.snap, ctx.cfg, ctx.agora);
      var v4 = { PEDIDO: c.pedido, STATUS: rotuloStatus(statusDe(c.snap)) };
      if (r.postado) { c.estado = 'MENU'; ctx.msgs.push(preencher(T.op4_postado, v4)); return; }
      var querProd = (t === '1' || t === '3'), querEnt = (t === '2' || t === '3'), oque;
      if (querProd && !r.produtos) {
        if (!querEnt) { c.estado = 'MENU'; ctx.msgs.push(preencher(T.op4_prod_bloqueado, v4)); return; }
        ctx.msgs.push(preencher(T.op4_so_entrega, v4));
        querProd = false;
      }
      oque = (querProd && querEnt) ? 'produtos e dados de entrega' : (querProd ? 'produtos' : 'dados de entrega');
      c.alt = { tipo: querProd && querEnt ? 'ambos' : (querProd ? 'produtos' : 'entrega'), o_que: oque, grupos: r.grupos };
      c.estado = 'ALT_TEXTO';
      ctx.msgs.push(preencher(T.op4_descrever, { O_QUE: oque }));
      return;
    }
    ctx.msgs.push(preencher(T.op4_tipo, { PEDIDO: c.pedido }));
    return;
  }

  if (est === 'NR') {
    if (t === '1') {
      await atualizarSnap(ctx, true);
      var ei = entregaInfo(c.snap);
      ctx.msgs.push((await abrirProtocolo(ctx, 'nao_recebi', {
        detalhe: 'Transportadora registrou entrega em ' + (ei.ts ? ddmmhhmm(ei.ts) : '(sem data)') + (ei.local ? ' (' + ei.local + ')' : '') + '. Cliente diz que conferiu portaria/vizinhos/caixa de correio.'
      })).texto);
      return;
    }
    if (t === '2') { c.estado = 'MENU'; ctx.msgs.push(T.op5_conferir); return; }
    ctx.msgs.push(T.nao_entendi + '\n*1* — Já conferi tudo e *não está*\n*2* — Ainda vou conferir');
    return;
  }

  /* MENU (e qualquer outro estado que sobrou) */
  var n = (/^[1-6]$/.test(t)) ? Number(t) : 0;
  if (!n) n = opcaoPorPalavra(txt, c.snap);
  if (!n && pedeHumano(txt)) { ctx.msgs.push(T.humano + '\n⠀\n' + T.menu); c.estado = 'MENU'; return; }
  if (!n && ehForaAssunto(txt)) { ctx.msgs.push(T.fora_assunto); c.estado = 'MENU'; return; }
  if (!n) { ctx.msgs.push(T.nao_entendi + '\n⠀\n' + T.menu); c.estado = 'MENU'; return; }
  if (!c.pedido) { c.estado = 'ID'; ctx.msgs.push(T.id_invalido); return; }
  await opcao(ctx, n);
}

async function coletarAvaria(ctx) {
  var T = ctx.T, c = ctx.conv, m = ctx.m, t = low(m.texto);
  c.av = c.av || { texto: '', video: '' };
  if (m.tipo === 'texto') {
    if (t === '0') { c.estado = 'MENU'; c.av = null; ctx.msgs.push(T.menu); return; }
    if (/(nao|não) (tenho|gravei|filmei|fiz)( o)? (video|vídeo)|sem (video|vídeo)/.test(low(m.texto))) {
      c.estado = 'MENU'; c.av = null; ctx.msgs.push(T.op6_sem_video); return;
    }
    c.av.texto = (c.av.texto ? c.av.texto + '\n' : '') + String(m.texto).slice(0, 1500);
  } else if (m.tipo === 'video') {
    c.av.video = m.url || '';
    if (m.legenda) c.av.texto = (c.av.texto ? c.av.texto + '\n' : '') + String(m.legenda).slice(0, 1500);
  } else if (m.tipo === 'imagem' || m.tipo === 'documento') {
    c.estado = 'AV'; ctx.msgs.push(T.op6_foto); return;
  } else { c.estado = 'AV'; return; }

  if (c.av.texto && c.av.video) {
    var av = c.av; c.av = null;
    ctx.msgs.push((await abrirProtocolo(ctx, 'avaria', { texto: av.texto, video: av.video, detalhe: 'Descrição e vídeo da abertura enviados pelo cliente.' })).texto);
    return;
  }
  c.estado = 'AV';
  ctx.msgs.push(c.av.video ? T.op6_falta_texto : T.op6_falta_video);
}

/* ------------------------------------------------------------------ mensagem que o celular da logística MANDOU (fromMe) */
/* v7: "#bot" (com ou sem espaço, maiúscula ou minúscula) e mais nada na mensagem */
function ehComandoBot(t) { return /^#\s*bot[\s.!]*$/i.test(String(t || '').trim()); }
async function tratarFromMe(body, cfg, k, phone) {
  if (chaveNumero(phone) === chaveNumero(cfg.ana_whatsapp)) return 'fromMe para a Ana — ignorado';
  if (body.fromApi === true) return 'fromMe do bot (fromApi)';
  var conv = await fbGet(RAIZ + '/conversas/' + k) || {};
  var texto = (body.text && body.text.message) ? String(body.text.message) : '';
  /* v7: "#bot" mandado pelo celular da logística = devolver a conversa ao bot AGORA */
  if (ehComandoBot(texto)) {
    await fbPatch(RAIZ + '/conversas/' + k, { silencio_ate: 0, silencio_desde: 0, bot_volta_ts: Date.now(), telefone: phone });
    try { await fbDelete(RAIZ + '/silencio/' + k); } catch (eD) { /* a lista do painel é só um espelho */ }
    return 'bot reativado (#bot)';
  }
  if (texto) {
    var h = impressao(texto), agora = Date.now();
    var lista = conv.bot_txt || [];
    for (var i = 0; i < lista.length; i++) if (lista[i].h === h && agora - (lista[i].t || 0) < 10 * MIN) return 'fromMe do bot';
  }
  /* foi gente respondendo pelo celular da logística → silêncio */
  var agora2 = Date.now(), horas = Number(cfg.silencio_horas) || 6;
  var desde = (conv.silencio_ate && conv.silencio_ate > agora2 && conv.silencio_desde) ? conv.silencio_desde : agora2;
  await fbPatch(RAIZ + '/conversas/' + k, { silencio_ate: agora2 + horas * HORA, silencio_desde: desde, humano_ts: agora2, telefone: phone });
  /* v7: espelho pro painel listar as conversas com o bot calado (apagado no #bot e no botão "Devolver ao bot") */
  try {
    await fbPut(RAIZ + '/silencio/' + k, { ate: agora2 + horas * HORA, desde: desde, telefone: phone,
      nome: String(conv.nome_whatsapp || body.chatName || '').slice(0, 80),
      pedido: (typeof conv.pedido === 'string') ? conv.pedido : ((conv.snap && conv.snap.pedido) ? String(conv.snap.pedido) : ''),
      protocolo: conv.protocolo ? String(conv.protocolo) : '' });
  } catch (eS) { console.error('[logistica] silencio (espelho): ' + eS.message); }
  if (conv.protocolo) {
    var pr = await fbGet(RAIZ + '/protocolos/' + conv.protocolo);
    if (pr && pr.status === 'aberto') {
      await fbPatch(RAIZ + '/protocolos/' + conv.protocolo, { status: 'em_atendimento', atualizado: agora2, atendido_ts: agora2 });
      await fbPut(RAIZ + '/protocolos/' + conv.protocolo + '/historico/' + agora2, { acao: 'respondido pelo WhatsApp', por: 'whatsapp' });
    }
  }
  return 'silencio ' + horas + 'h';
}

/* ------------------------------------------------------------------ aviso da abertura (cron-job.org a cada 15 min) */
async function avisoAbertura() {
  var cfg = await carregarCfg(), agora = Date.now();
  if (!dentroHorario(agora, cfg)) return 'fora do horario';
  var fila = await fbGet(RAIZ + '/fila_aviso');
  if (!fila || typeof fila !== 'object') return 'fila vazia';
  var chaves = Object.keys(fila).sort();
  if (!chaves.length) return 'fila vazia';
  var linhas = [], i, pr;
  for (i = 0; i < chaves.length && i < 30; i++) {
    pr = await fbGet(RAIZ + '/protocolos/' + chaves[i]);
    if (pr && pr.status !== 'resolvido') {
      linhas.push('• *' + pr.id + '* — ' + (MOTIVO_NOME[pr.motivo] || pr.motivo) + ' — ' + pr.pedido + ' — ' +
        (pr.cliente && (pr.cliente.nome || pr.cliente.whatsapp_nome) || '') + ' · wa.me/' + (pr.cliente ? pr.cliente.telefone : ''));
    }
  }
  var ok = true;
  if (linhas.length && cfg.ana_whatsapp) {
    ok = await enviar(cfg.ana_whatsapp, '☀️ *Logística — protocolos que chegaram fora do horário* (' + linhas.length + ')\n⠀\n' +
      linhas.join('\n') + (cfg.painel_url ? '\n⠀\nPainel: ' + cfg.painel_url : ''));
  }
  if (!ok) return 'falhou o envio — fila mantida';
  for (i = 0; i < chaves.length && i < 30; i++) {
    await fbDelete(RAIZ + '/fila_aviso/' + chaves[i]);
    await fbPatch(RAIZ + '/protocolos/' + chaves[i], { avisado_ana: true });
  }
  return 'avisados ' + linhas.length;
}

/* ------------------------------------------------------------------ handler */
function tipoDaMensagem(body) {
  if (body.text && body.text.message) return { tipo: 'texto', texto: String(body.text.message).trim() };
  if (body.audio) return { tipo: 'audio', texto: '', url: body.audio.audioUrl || '' };
  if (body.video) return { tipo: 'video', texto: '', legenda: body.video.caption || '', url: body.video.videoUrl || '' };
  if (body.image) return { tipo: 'imagem', texto: '', legenda: body.image.caption || '', url: body.image.imageUrl || '' };
  if (body.document) return { tipo: 'documento', texto: '', legenda: body.document.caption || '', url: body.document.documentUrl || '' };
  return { tipo: 'outro', texto: '' };
}

function resp(code, txt) { return { statusCode: code, body: txt }; }

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    var q = event.queryStringParameters || {};
    if (q.defaults === '1') {
      /* 1ª vez: cria a config no Firebase com os padrões (o painel lê de lá, logado).
         Só cria se tiver CERTEZA que não existe (erro de leitura nunca vira "vazio"). */
      if (FB_SECRET && (await fbExiste(RAIZ + '/config')) === false) await fbPut(RAIZ + '/config', CFG_PADRAO);
      var pub = JSON.parse(JSON.stringify(CFG_PADRAO));
      delete pub.numeros_teste; delete pub.ana_whatsapp;   /* resposta pública: sem telefone */
      return { statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ versao: VERSAO, textos: T_PADRAO, config: pub }) };
    }
    if (q.acao === 'abertura') {
      if (!CRON_SECRET || q.secret !== CRON_SECRET) return resp(403, 'secret');
      return resp(200, await avisoAbertura());
    }
    return resp(200, 'logistica-bot ' + VERSAO + ' ok');
  }

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return resp(200, 'json invalido'); }
  if (body.type && body.type !== 'ReceivedCallback') return resp(200, 'tipo ' + body.type);
  if (body.isGroup || body.isNewsletter || body.isStatusReply || body.broadcast) return resp(200, 'ignorado');
  if (body.isEdit) return resp(200, 'edicao — ignorada');

  var phone = String(body.phone || '');
  if (!phone || phone.indexOf('-group') >= 0) return resp(200, 'sem telefone');
  var k = chaveFb(phone);
  var cfg = await carregarCfg();
  if (cfg.modo === 'desligado') return resp(200, 'bot desligado no painel');
  if (await ehExcecao(phone)) return resp(200, 'numero na lista de excecoes — ignorado');   /* v10: vale também para o fromMe */

  if (body.fromMe) return resp(200, await tratarFromMe(body, cfg, k, phone));

  if (chaveNumero(phone) === chaveNumero(cfg.ana_whatsapp)) return resp(200, 'numero da Ana — ignorado');   /* v9: sem exceção da lista de teste */

  var trava = await pegarTrava(k);   /* v6: uma mensagem por vez nesta conversa */
  try { return await atenderCliente(body, cfg, k, phone); }
  finally { await soltarTrava(k, trava); }
};

async function atenderCliente(body, cfg, k, phone) {
  var agora = Date.now();
  var conv = await fbGet(RAIZ + '/conversas/' + k) || {};
  var mid = String(body.messageId || '');
  if (mid && (conv.ult_ids || []).indexOf(mid) >= 0) return resp(200, 'repetida');
  if (conv.silencio_ate && conv.silencio_ate > agora) {
    if (mid) await fbPatch(RAIZ + '/conversas/' + k, { ult_ids: (conv.ult_ids || []).concat([mid]).slice(-15) });
    return resp(200, 'silencio (humano atendendo)');
  }

  /* v4: foto do ponto da conversa ANTES de processar — volta pra ela se nada for entregue */
  var antes = JSON.parse(JSON.stringify({ estado: conv.estado || '', pedido: conv.pedido || null, snap: conv.snap || null,
    opcoes: conv.opcoes || null, alt: conv.alt || null, av: conv.av || null, parcial: conv.parcial || null,
    lembrete_ts: conv.lembrete_ts || 0, bot_txt: conv.bot_txt || [] }));   /* bot_txt: sem isso a anti-rajada seguraria a boas-vindas que nunca chegou */
  var ctx = {
    cfg: cfg, T: await carregarTextos(), conv: conv, agora: agora, phone: phone,
    senderName: String(body.senderName || body.chatName || ''), m: tipoDaMensagem(body), msgs: [], depois: []
  };
  var pn = primeiroNome(ctx.senderName);
  ctx.nomeTxt = pn ? ', ' + pn : '';

  try { await processar(ctx); }
  catch (e) {
    console.error('[logistica] processar estourou: ' + (e && e.stack || e));
    ctx.msgs.push(ctx.T.erro_consulta);
  }

  /* anti-rajada: cliente manda "oi", "bom dia", "tudo bem?" em sequência → a mesma resposta genérica
     não sai de novo em menos de 90 s (as respostas do pedido e do protocolo saem sempre) */
  var bt = (conv.bot_txt || []).filter(function (x) { return agora - (x.t || 0) < 10 * MIN; });
  var genericas = [ctx.T.id_invalido, preencher(ctx.T.boas_vindas, { NOME: ctx.nomeTxt }), ctx.T.audio, ctx.T.midia_fora,
    ctx.T.fora_assunto, ctx.T.nao_entendi + '\n⠀\n' + ctx.T.menu].map(impressao);
  var tentouIdentificar = soDigitos(ctx.m.texto).length >= 5 || /@/.test(ctx.m.texto || '');   /* mandou CPF/número: responde sempre */
  ctx.msgs = ctx.msgs.filter(function (msg) {
    if (tentouIdentificar) return true;
    var h = impressao(msg);
    if (genericas.indexOf(h) < 0) return true;
    return !bt.some(function (x) { return x.h === h && agora - (x.t || 0) < 90000; });
  });

  /* grava o estado ANTES de mandar (a impressão das mensagens tem que estar lá quando o
     webhook devolver o fromMe delas) — PATCH: nunca apaga o silencio_ate gravado por outro lado */
  ctx.msgs.forEach(function (msg) { bt.push({ h: impressao(msg), t: agora }); });
  var salvar = {
    estado: conv.estado || '', pedido: conv.pedido || null, snap: conv.snap || null, opcoes: conv.opcoes || null,
    protocolo: conv.protocolo || null, alt: conv.alt || null, av: conv.av || null, lembrete_ts: conv.lembrete_ts || 0,
    parcial: conv.parcial || null,
    ts: agora, telefone: phone, nome_whatsapp: ctx.senderName.slice(0, 80),
    bot_txt: bt.slice(-12), ult_ids: (conv.ult_ids || []).concat(mid ? [mid] : []).slice(-15)
  };
  await fbPatch(RAIZ + '/conversas/' + k, salvar);

  var entregues = 0;
  for (var i = 0; i < ctx.msgs.length; i++) if (await enviar(phone, ctx.msgs[i])) entregues++;
  if (ctx.msgs.length && !entregues && !ctx.protocoloNovo) {
    await fbPatch(RAIZ + '/conversas/' + k, antes);
    console.error('[logistica] nenhuma mensagem entregue para ' + phone + ' — a conversa voltou ao ponto anterior (' + (antes.estado || 'inicio') + ')');
  }
  for (var j = 0; j < ctx.depois.length; j++) { try { await ctx.depois[j](); } catch (e3) { console.error('[logistica] depois: ' + e3.message); } }
  return resp(200, 'ok ' + (conv.estado || '') + ' · ' + ctx.msgs.length + ' msg');
}

/* exportado só pro teste local (node) — não usado pela Netlify */
exports._t = {
  acharNumeroPedido: acharNumeroPedido, acharCPF: acharCPF, analisarCPF: analisarCPF,
  identificacaoIncompleta: identificacaoIncompleta, acharDiaMes: acharDiaMes, acharEmail: acharEmail, cpfValido: cpfValido,
  chaveNumero: chaveNumero, numeroNaLista: numeroNaLista, dentroHorario: dentroHorario, proximaAbertura: proximaAbertura,
  textoAbertura: textoAbertura, categoria: categoria, jaPostado: jaPostado, entregaInfo: entregaInfo,
  impressao: impressao, opcaoPorPalavra: opcaoPorPalavra, T_PADRAO: T_PADRAO, CFG_PADRAO: CFG_PADRAO,
  _cache: _cache, regraAlteracao: regraAlteracao, partesBR: partesBR,
  cartao: cartao, textoRastreio: textoRastreio, avisoWhats: avisoWhats, resumo: resumo   /* v8 */
};
