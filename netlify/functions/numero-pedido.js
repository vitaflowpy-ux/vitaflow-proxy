'use strict';
/* =============================================================================
   numero-pedido.js — NÚMERO DO PEDIDO SEM APPS SCRIPT (VitaFlow)  ·  v2  ·  15/10/2026  (v1 = 30/09/2026)

   v2 (15/10/2026 — painel único, item 5, bloco 1): O NÚMERO SAI DO BANCO NOVO.
     • Com as variáveis de ambiente VFDB_SERVICE_KEY (e opcional VFDB_URL, padrão https://api.vitaflowoficial.com),
       o número vem de pedidos.gerar_numero_sinc no banco (D13). Antes, lê o contador do Firebase e manda como
       "piso"; depois grava no Firebase o maior dos dois. Os dois contadores andam juntos: se algum caminho ainda
       usar o Firebase (o GAS antigo, uma página antiga aberta), nunca sai número repetido.
     • Banco fora do ar ou lento (3,5 s) → usa o Firebase exatamente como a v1 (resposta com fonte:'firebase').
     • SEM a variável VFDB_SERVICE_KEY a função é IGUAL à v1 (nada muda até ela ser criada no Netlify).
     • 'reservar' (número digitado no Orçamento): faz a conferência da v1 e também avança o contador do banco
       (pedidos.reservar_numero).
     • Mesmas chamadas e mesmas respostas da v1 (+ campo fonte:'banco'|'firebase'). Quem chama não muda.
   Netlify Function no repo vitaflow-proxy → netlify/functions/numero-pedido.js
   URL: https://vitaflow-proxy.netlify.app/.netlify/functions/numero-pedido

   POR QUE EXISTE: o número era gerado pelo GAS (action gerar_numero). O código do GAS roda em
   1-3 s, mas o Apps Script às vezes segura a chamada 10-40 s na fila (ou devolve 404) antes de
   rodar — e aí o Orçamento caía em "PENDENTE", o site em "SX" e a Athena em "AX".
   Aqui o contador é o MESMO do GAS (Firebase vitaflow_seq/<ddMM>/<tipo>), incrementado com
   trava do próprio Firebase (ETag / if-match): dois pedidos ao mesmo tempo NUNCA pegam o mesmo
   número, nem se um vier por aqui e outro pelo GAS (o GAS v50 usa a mesma trava).

   CHAMADAS (POST JSON, ou GET com os mesmos campos na URL):
     { tipo:'M' }                       → gera   { success:true, order_nsu:'VF-3009-M053', seq:53 }
     { action:'gerar_numero', tipo:'S'} → idem (mesmo corpo que o site/Athena mandam ao GAS)
     { action:'reservar', numero:'VF-3009-M060' }
          → número DIGITADO À MÃO no Orçamento. Confere se já existe na planilha (espelho
            vitaflow_pedidos) e, se for de HOJE, avança o contador até ele (o próximo gerado
            não repete). Resposta: { success:true, numero, existe:false, contador_avancado:true }
            ou { success:false, existe:true, nome:'Fulano' } / { success:false, erro:'...' }
   tipo: S=site  M=manual (Orçamento)  A=Athena  V=revendedor  W=atacado

   COMEÇO DO DIA (contador ainda vazio): igual à linha nova da aba Sequencial do GAS —
   manual começa em 50 (1º = M051); os outros em 0 (1º = 001).
   PROTEÇÃO EXTRA: se o número gerado já existir no espelho da planilha (pedido que entrou por
   outro caminho), pula para o seguinte (até 5 vezes).

   Variável de ambiente: FIREBASE_SECRET (a mesma que o grupo-vip.js já usa neste site).
   ============================================================================= */

var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var FB_SECRET = process.env.FIREBASE_SECRET || '';

var COL = { S: 'site', M: 'manual', A: 'athena', V: 'revendedor', W: 'atacado' };
var INICIO_DIA = { site: 0, manual: 50, athena: 0, revendedor: 0, atacado: 0 };
var SALTO_MAX_RESERVA = 30;   /* número digitado não pode pular mais que isso à frente do contador */

/* v2: banco novo (Supabase no servidor). A chave fica SÓ na variável de ambiente do Netlify. */
var DB_URL = String(process.env.VFDB_URL || 'https://api.vitaflowoficial.com').replace(/\/+$/, '');
var DB_KEY = String(process.env.VFDB_SERVICE_KEY || '').trim();
var DB_MS = 3500;

var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

function resp(obj) { return { statusCode: 200, headers: CORS, body: JSON.stringify(obj) }; }

function fbUrl(caminho) {
  return FB_BASE + '/' + caminho + '.json' + (FB_SECRET ? '?auth=' + encodeURIComponent(FB_SECRET) : '');
}

/* fetch com limite de tempo (o Firebase responde em ~0,2 s; 6 s é folga) */
async function fetchT(url, opts, ms) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, ms || 6000);
  try { return await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal })); }
  finally { clearTimeout(t); }
}

/* ddMM de HOJE no horário de Brasília (igual ao Utilities.formatDate do GAS) */
function hojeDDMM() {
  var p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
    .formatToParts(new Date());
  var d = '', m = '';
  p.forEach(function (x) { if (x.type === 'day') d = x.value; if (x.type === 'month') m = x.value; });
  return d + m;
}

function pad3(n) { var s = String(n); while (s.length < 3) s = '0' + s; return s; }
function chavePed(numero) { return String(numero || '').replace(/[.#$\[\]\/]/g, '_'); }

/* Lê o contador com ETag. Devolve { valor: número|null, etag } */
async function lerComEtag(caminho) {
  var r = await fetchT(fbUrl(caminho), { headers: { 'X-Firebase-ETag': 'true' } });
  if (!r.ok) throw new Error('firebase get ' + r.status);
  var etag = r.headers.get('etag') || r.headers.get('ETag');
  var txt = await r.text();
  var v = (txt === '' || txt === 'null') ? null : JSON.parse(txt);
  return { valor: v, etag: etag };
}

/* Troca o valor SÓ se ninguém mexeu desde a leitura (if-match). Devolve true/false. */
async function gravarSeIgual(caminho, valor, etag) {
  var r = await fetchT(fbUrl(caminho), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'if-match': etag },
    body: JSON.stringify(valor)
  });
  if (r.status === 412) return false;          /* outro pedido pegou antes — tenta de novo */
  if (!r.ok) throw new Error('firebase put ' + r.status);
  return true;
}

/* Incremento atômico: novo = f(atual). Até 15 tentativas (cada disputa perde ~0,2 s). */
async function atualizarContador(caminho, inicio, f) {
  for (var i = 0; i < 15; i++) {
    var cur = await lerComEtag(caminho);
    var atual = (cur.valor === null) ? inicio : (Number(cur.valor) || 0);
    var novo = f(atual);
    if (novo === null) return { atual: atual, novo: atual, mudou: false };
    if (await gravarSeIgual(caminho, novo, cur.etag)) return { atual: atual, novo: novo, mudou: true };
  }
  throw new Error('contador disputado demais');
}

/* O número já está na planilha (espelho)? Devolve a linha (array) ou null. */
async function linhaNoEspelho(numero) {
  try {
    var r = await fetchT(fbUrl('vitaflow_pedidos/' + chavePed(numero)), {}, 5000);
    if (!r.ok) return null;
    var v = await r.json();
    return (v && v.length) ? v : null;
  } catch (e) { return null; }
}

/* ===== v2: banco ===== */
async function dbRpc(fn, corpo) {
  var r = await fetchT(DB_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Profile': 'pedidos', 'apikey': DB_KEY, 'Authorization': 'Bearer ' + DB_KEY },
    body: JSON.stringify(corpo)
  }, DB_MS);
  var txt = await r.text();
  if (!r.ok) throw new Error('banco ' + r.status + ' ' + txt.slice(0, 160));
  return JSON.parse(txt);
}

/* valor atual do contador do Firebase, sem mexer (null = ninguém gerou hoje ainda) */
async function lerContador(caminho) {
  var r = await fetchT(fbUrl(caminho), {}, 4000);
  if (!r.ok) throw new Error('firebase get ' + r.status);
  var txt = await r.text();
  if (txt === '' || txt === 'null') return null;
  var n = Number(JSON.parse(txt));
  return isFinite(n) ? n : null;
}

/* sobe o contador do Firebase até seq (nunca desce). Best-effort: falha aqui não derruba o número. */
async function alinharFirebase(caminho, inicio, seq) {
  /* várias chamadas ao mesmo tempo disputam a mesma chave: quem tem o número maior sempre acaba gravando,
     porque os menores desistem assim que veem um valor >= ao deles */
  for (var rodada = 0; rodada < 3; rodada++) {
    try { await atualizarContador(caminho, inicio, function (a) { return (a >= seq) ? null : seq; }); return; }
    catch (e) {
      if (rodada === 2) { console.log('numero-pedido: nao alinhou o firebase: ' + (e && e.message)); return; }
      await new Promise(function (ok) { setTimeout(ok, 50 + Math.floor(Math.random() * 150)); });
    }
  }
}

async function gerarBanco(L) {
  var col = COL[L], hoje = hojeDDMM();
  var caminho = 'vitaflow_seq/' + hoje + '/' + col;
  var piso = null;
  try { piso = await lerContador(caminho); } catch (e) { piso = null; }   /* Firebase fora: o banco sozinho resolve */
  for (var tent = 0; tent < 5; tent++) {
    var r = await dbRpc('gerar_numero_sinc', { canal: L, piso: piso });
    if (!r || !r.success || !r.order_nsu) throw new Error('banco: ' + ((r && r.erro) || 'sem numero'));
    if (!(await linhaNoEspelho(r.order_nsu))) {
      await alinharFirebase(caminho, INICIO_DIA[col], r.seq);
      return { success: true, order_nsu: r.order_nsu, seq: r.seq, fonte: 'banco' };
    }
    piso = r.seq;   /* já está na planilha (ainda não chegou ao banco) → pede o seguinte */
  }
  throw new Error('5 números seguidos já existiam na planilha');
}

async function gerar(tipo) {
  var L = String(tipo || 'S').toUpperCase();
  if (!COL[L]) L = 'S';
  if (DB_KEY) {
    try { return await gerarBanco(L); }
    catch (e) { console.log('numero-pedido: banco falhou, usando o firebase: ' + (e && e.message)); }
  }
  return await gerarFirebase(L);
}

/* ===== v1: Firebase (continua igual; é o plano B) ===== */
async function gerarFirebase(tipo) {
  var L = String(tipo || 'S').toUpperCase();
  if (!COL[L]) L = 'S';
  var col = COL[L], hoje = hojeDDMM();
  var caminho = 'vitaflow_seq/' + hoje + '/' + col;
  for (var tent = 0; tent < 5; tent++) {
    var r = await atualizarContador(caminho, INICIO_DIA[col], function (a) { return a + 1; });
    var numero = 'VF-' + hoje + '-' + L + pad3(r.novo);
    if (!(await linhaNoEspelho(numero))) return { success: true, order_nsu: numero, seq: r.novo, fonte: 'firebase' };
    /* já existe (entrou por outro caminho) → pula para o próximo */
  }
  throw new Error('5 números seguidos já existiam na planilha');
}

/* v2: conferência da v1 (espelho + contador do Firebase) e, se der certo, avança também o contador do banco */
async function reservar(numeroBruto) {
  if (!DB_KEY) return await reservarFirebase(numeroBruto);
  /* o piso é lido ANTES da v1 avançar o Firebase (senão o banco acharia que o número já foi gerado) */
  var piso = null;
  var m = String(numeroBruto || '').trim().toUpperCase().replace(/\s+/g, '').match(/^VF-(\d{4})-([A-Z])\d+$/);
  if (m && COL[m[2]] && m[1] === hojeDDMM()) {
    try { piso = await lerContador('vitaflow_seq/' + m[1] + '/' + COL[m[2]]); } catch (e) { piso = null; }
  }
  var r1 = await reservarFirebase(numeroBruto);
  if (!r1 || !r1.success) return r1;
  try {
    var r2 = await dbRpc('reservar_numero', { numero: r1.numero, piso: piso });
    if (r2 && r2.existe) return r2;                       /* o banco conhece o número (a planilha ainda não) */
    if (r2 && r2.ja_gerado_hoje) r1.ja_gerado_hoje = true;
    r1.fonte = 'banco';
  } catch (e) { console.log('numero-pedido: reservar no banco falhou: ' + (e && e.message)); r1.fonte = 'firebase'; }
  return r1;
}

async function reservarFirebase(numeroBruto) {
  var numero = String(numeroBruto || '').trim().toUpperCase().replace(/\s+/g, '');
  var m = numero.match(/^VF-(\d{4})-([A-Z])(\d{1,4})$/);
  if (!m) return { success: false, erro: 'formato', msg: 'Use o formato VF-DDMM-M123 (ex.: VF-3009-M060).' };
  var ddmm = m[1], L = m[2], seq = Number(m[3]);
  if (!(seq > 0)) return { success: false, erro: 'formato', msg: 'O número depois da letra tem que ser maior que zero.' };

  var linha = await linhaNoEspelho(numero);
  if (linha) return { success: false, existe: true, numero: numero, nome: String(linha[1] || ''), msg: 'Esse número já está na planilha.' };

  var col = COL[L];
  if (!col || ddmm !== hojeDDMM()) {
    /* letra sem contador ou outro dia: só confere que não existe, não mexe em contador */
    return { success: true, numero: numero, existe: false, contador_avancado: false };
  }
  var caminho = 'vitaflow_seq/' + ddmm + '/' + col;
  var jaPassou = false, salto = false;
  var r = await atualizarContador(caminho, INICIO_DIA[col], function (a) {
    if (seq <= a) { jaPassou = true; return null; }            /* contador já passou dele — não mexe */
    if (seq - a > SALTO_MAX_RESERVA) { salto = true; return null; }
    return seq;                                                /* próximo gerado = seq + 1 */
  });
  if (salto) return { success: false, erro: 'salto', atual: r.atual,
    msg: 'Esse número pula muito à frente do contador de hoje (último: ' + L + pad3(r.atual) + '). Confira o número.' };
  return { success: true, numero: numero, existe: false, contador_avancado: r.mudou,
    /* seq <= contador: o número já foi gerado hoje e pode estar num pedido que ainda não chegou
       ao espelho (até 5 min). O Orçamento avisa e pede confirmação. */
    ja_gerado_hoje: jaPassou, atual: r.atual };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  var d = {};
  if (event.httpMethod === 'POST') {
    try { d = JSON.parse(event.body || '{}') || {}; } catch (e) { d = {}; }
  } else {
    d = event.queryStringParameters || {};
  }
  if (!FB_SECRET) return resp({ success: false, erro: 'FIREBASE_SECRET nao configurada' });
  try {
    if (d.action === 'reservar') return resp(await reservar(d.numero));
    if (d.action === 'ping') return resp({ success: true, hoje: hojeDDMM(), banco: !!DB_KEY });
    return resp(await gerar(d.tipo));
  } catch (e) {
    return resp({ success: false, erro: String(e && e.message || e) });
  }
};

/* só para teste local (node) */
exports._t = { hojeDDMM: hojeDDMM, pad3: pad3, reservar: reservar, gerar: gerar, atualizarContador: atualizarContador,
  gerarFirebase: gerarFirebase, gerarBanco: gerarBanco, reservarFirebase: reservarFirebase };
