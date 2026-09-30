'use strict';
/* =============================================================================
   rastreio-consulta.js — CONSULTA DE RASTREIO SEM APPS SCRIPT (VitaFlow)  ·  v1  ·  30/09/2026
   Netlify Function no repo vitaflow-proxy → netlify/functions/rastreio-consulta.js
   URL: https://vitaflow-proxy.netlify.app/.netlify/functions/rastreio-consulta

   POR QUE EXISTE: a consulta ia direto ao GAS (action consultar_status). O código roda em 1-3 s, mas o
   Apps Script às vezes segura a chamada 10-40 s antes de rodar. O GAS v50 agora deixa PRONTA no
   Firebase a resposta de cada pedido (vitaflow_rastreio_pub/<pedido>, o MESMO item que o
   consultar_status devolveria). Esta função só procura e entrega — ~0,3 s.

   CHAMADA (mesmo corpo do GAS): POST { action:'consultar_status', termo:'VF-2609-M051' | CPF | e-mail }
   RESPOSTA: igual à do GAS → { success:true, encontrados, pedidos:[...], fonte:'precalc' }
     ou { success:false, usar_gas:true, motivo } quando NÃO dá pra responder daqui com certeza —
     aí quem chamou (página de rastreio, Athena) consulta o GAS como antes. Casos:
       - termo que não é número exato / CPF / e-mail do índice (ex.: "M051" sem o VF-2609-)
       - pedido ainda sem resposta pronta (acabou de entrar)
       - resposta de outro dia para pedido em andamento (os "dias úteis" mudam à meia-noite)
   Mesma regra do GAS: por CPF/e-mail só volta pedido PAGO; pelo número, sempre.

   Variável de ambiente: FIREBASE_SECRET (a mesma do grupo-vip.js / numero-pedido.js).
   ============================================================================= */

var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var FB_SECRET = process.env.FIREBASE_SECRET || '';
var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};
var MAX_PEDIDOS = 60;   /* mesmo teto do índice no GAS */

function resp(obj) { return { statusCode: 200, headers: CORS, body: JSON.stringify(obj) }; }
function usarGas(motivo) { return resp({ success: false, usar_gas: true, motivo: motivo }); }

function fbUrl(caminho) {
  return FB_BASE + '/' + caminho + '.json' + (FB_SECRET ? '?auth=' + encodeURIComponent(FB_SECRET) : '');
}
async function fbGet(caminho) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, 5000);
  try {
    var r = await fetch(fbUrl(caminho), { signal: ctrl.signal });
    if (!r.ok) throw new Error('firebase ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* yyyy-MM-dd de hoje em Brasília (igual ao _dia gravado pelo GAS) */
function hojeBR() {
  var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  var g = function (t) { return (p.find(function (x) { return x.type === t; }) || {}).value || ''; };
  return g('year') + '-' + g('month') + '-' + g('day');
}

/* mesmas chaves que o GAS usa (_histKey e o índice de e-mail) */
function chave(s) { return String(s || '').replace(/[.#$\[\]\/]/g, '_'); }

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (!FB_SECRET) return usarGas('sem FIREBASE_SECRET');
  var d = {};
  try { d = JSON.parse(event.body || '{}') || {}; } catch (e) { d = {}; }
  var termo = String(d.termo || '').trim();
  if (!termo) return resp({ success: true, encontrados: 0, pedidos: [], fonte: 'precalc' });

  try {
    var dig = termo.replace(/\D/g, '');
    var porNumero = false, chaves = [];
    if (termo.indexOf('@') !== -1) {
      var ie = await fbGet('vitaflow_idx_email/' + chave(termo.toLowerCase().trim()));
      chaves = (ie && typeof ie === 'object') ? Object.keys(ie) : [];
    } else if (dig.length === 11) {
      var ic = await fbGet('vitaflow_idx_cpf/' + dig);
      chaves = (ic && typeof ic === 'object') ? Object.keys(ic) : [];
    } else {
      porNumero = true;
      chaves = [chave(termo.toUpperCase().replace(/\s+/g, ''))];
    }
    /* nada no índice / muitos pedidos: o GAS decide (ele ainda varre o espelho inteiro) */
    if (!chaves.length) return usarGas('fora do indice');
    if (chaves.length > MAX_PEDIDOS) return usarGas('muitos pedidos');

    var regs = await Promise.all(chaves.map(function (k) { return fbGet('vitaflow_rastreio_pub/' + k); }));
    var hoje = hojeBR(), pedidos = [];
    for (var i = 0; i < regs.length; i++) {
      var r = regs[i];
      if (!r || !r.pedido) {
        /* número completo (VF-DDMM-M123) que nem está no espelho da planilha: o GAS também não acharia
           (ele procura no mesmo espelho) — responde "não encontrado" aqui, sem esperar o Apps Script */
        if (porNumero && /^VF-\d{4}-[A-Z]{1,2}\d{2,4}$/i.test(termo.replace(/\s+/g, ''))) {
          var linha = await fbGet('vitaflow_pedidos/' + chaves[0]);
          if (!linha) return resp({ success: true, encontrados: 0, pedidos: [], fonte: 'precalc' });
        }
        return usarGas(porNumero ? 'numero sem resposta pronta' : 'pedido sem resposta pronta');
      }
      if (!r._fixo && r._dia !== hoje) return usarGas('resposta de outro dia');
      if (!porNumero && r._np) continue;               /* por CPF/e-mail: só pedido pago */
      var out = {};
      for (var c in r) if (Object.prototype.hasOwnProperty.call(r, c) && c.charAt(0) !== '_') out[c] = r[c];
      pedidos.push(out);
    }
    /* ordem parecida com a da planilha (mais antigo primeiro): data e depois o número */
    var ordem = function (x) {
      var m = String(x.data || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
      var n = String(x.pedido || '').match(/(\d+)\s*$/);
      return (m ? m[3] + m[2] + m[1] : '00000000') + String(n ? n[1] : '0').padStart(5, '0');
    };
    pedidos.sort(function (a, b) { return ordem(a) < ordem(b) ? -1 : (ordem(a) > ordem(b) ? 1 : 0); });
    return resp({ success: true, encontrados: pedidos.length, pedidos: pedidos, fonte: 'precalc' });
  } catch (e) {
    return usarGas('erro: ' + String(e && e.message || e));
  }
};

exports._t = { hojeBR: hojeBR, chave: chave };
