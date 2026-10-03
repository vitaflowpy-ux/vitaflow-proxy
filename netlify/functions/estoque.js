'use strict';
/* =============================================================================
   estoque.js — ESTOQUE PRÓPRIO DO PAINEL DE DADOS (VitaFlow)  ·  v2  ·  03/10/2026
   v2 (03/10/2026, pedido do Thiago): ação 'desfazer' — desfaz a baixa de UM pedido.
   Netlify Function no repo vitaflow-proxy → netlify/functions/estoque.js
   URL: https://vitaflow-proxy.netlify.app/.netlify/functions/estoque

   PEDIDO DO THIAGO (03/10/2026): aba "Estoque" no Painel de Dados — escolher produtos da Shopify, marcar a
   quantidade que tem de cada um e cruzar com os produtos dos pedidos selecionados (o que tem × o que comprar).
   Decisões dele: o estoque fica guardado NO SISTEMA (igual em qualquer aparelho) e existe o botão "Dar baixa".

   É um estoque INTERNO: NÃO lê nem altera o estoque/disponibilidade da Shopify, nem preço, nem pedido.

   ONDE GRAVA (RTDB pricehub-f0236):
     vitaflow_sync/estoque/itens/<chave>     { nome, qtd, t }          (qtd 0 = o item é apagado)
     vitaflow_sync/estoque/baixas/<pedido>   { t, itens:[{chave,nome,pediu,baixou}] }   (1 baixa por pedido)
   <chave> = nome do produto sem acento, minúsculo, com tudo que não é letra/número virando "_"
             (calculada no painel — a mesma conta para o produto da Shopify e para o produto do pedido).

   CHAMADAS (POST, corpo JSON com chave:'<COMPRAS_KEY>' — a mesma dos painéis):
     { acao:'ler' }                                   → { success, itens:{chave:{nome,qtd,t}}, baixas:{pedido:t} }
     { acao:'gravar', itens:{chave:{nome,qtd}} }      → grava só os enviados (qtd 0 apaga)  → devolve o 'ler'
     { acao:'baixa', pedidos:[{pedido, itens:[{chave,nome,qtd}]}] }
          → desconta do estoque o que cada pedido usa (nunca abaixo de zero), marca o pedido como baixado.
            Pedido que já teve baixa é IGNORADO (não desconta duas vezes).   → devolve o 'ler' + feitos/ja_baixados
     { acao:'desfazer', pedido:'VF-…' }               (v2)
          → devolve ao estoque exatamente o que a baixa daquele pedido descontou e apaga a marca de baixa
            (o pedido volta a entrar na conta).   → devolve o 'ler' + devolvido (unidades)

   Variáveis de ambiente (já existem no vitaflow-proxy): FIREBASE_SECRET · COMPRAS_KEY
   ============================================================================= */

var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var RAIZ = 'vitaflow_sync/estoque';
var FB_SECRET = process.env.FIREBASE_SECRET || '';
var COMPRAS_KEY = process.env.COMPRAS_KEY || '';
var MAX_ITENS = 2000, MAX_PEDIDOS = 500, MAX_QTD = 99999;
var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function resp(obj) { return { statusCode: 200, headers: CORS, body: JSON.stringify(obj) }; }
function erro(msg) { return resp({ success: false, erro: msg }); }

async function fb(caminho, metodo, valor) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, 9000);
  try {
    var opts = { method: metodo || 'GET', signal: ctrl.signal };
    if (valor !== undefined) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(valor); }
    var r = await fetch(FB_BASE + '/' + caminho + '.json?auth=' + encodeURIComponent(FB_SECRET), opts);
    if (!r.ok) throw new Error('firebase ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

function chaveOk(k) { return typeof k === 'string' && /^[a-z0-9_]{1,200}$/.test(k); }
function pedidoChave(p) { return String(p == null ? '' : p).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '_').slice(0, 60); }
function qtdInt(v) { var n = Math.floor(Number(v)); return (isFinite(n) && n > 0) ? Math.min(n, MAX_QTD) : 0; }
function nomeOk(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200); }

async function lerTudo() {
  var d = (await fb(RAIZ)) || {};
  var itens = (d.itens && typeof d.itens === 'object') ? d.itens : {};
  var baixas = {};
  if (d.baixas && typeof d.baixas === 'object') Object.keys(d.baixas).forEach(function (p) { baixas[p] = Number(d.baixas[p] && d.baixas[p].t) || 1; });
  return { itens: itens, baixas: baixas };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return erro('use POST');
  var d = {};
  try { d = JSON.parse(event.body || '{}') || {}; } catch (e) { d = {}; }
  if (!FB_SECRET || !COMPRAS_KEY) return erro('variavel de ambiente faltando');
  if (String(d.chave || '') !== COMPRAS_KEY) return erro('nao_autorizado');

  try {
    var acao = String(d.acao || '');

    if (acao === 'ler') {
      var a = await lerTudo();
      return resp({ success: true, itens: a.itens, baixas: a.baixas });
    }

    if (acao === 'gravar') {
      var ent = (d.itens && typeof d.itens === 'object' && !Array.isArray(d.itens)) ? d.itens : null;
      if (!ent) return erro('itens faltando');
      var ks = Object.keys(ent);
      if (!ks.length) return erro('nada para gravar');
      if (ks.length > MAX_ITENS) return erro('itens demais');
      var patch = {}, agora = Date.now();
      for (var i = 0; i < ks.length; i++) {
        var k = ks[i];
        if (!chaveOk(k)) return erro('chave invalida: ' + String(k).slice(0, 40));
        var q = qtdInt(ent[k] && ent[k].qtd), nm = nomeOk(ent[k] && ent[k].nome);
        if (q > 0 && !nm) return erro('nome faltando: ' + k);
        patch[k] = q > 0 ? { nome: nm, qtd: q, t: agora } : null;
      }
      await fb(RAIZ + '/itens', 'PATCH', patch);
      var b = await lerTudo();
      return resp({ success: true, itens: b.itens, baixas: b.baixas, gravados: ks.length });
    }

    if (acao === 'baixa') {
      var peds = Array.isArray(d.pedidos) ? d.pedidos : null;
      if (!peds || !peds.length) return erro('pedidos faltando');
      if (peds.length > MAX_PEDIDOS) return erro('pedidos demais');
      var atual = (await fb(RAIZ)) || {};
      var itens = (atual.itens && typeof atual.itens === 'object') ? atual.itens : {};
      var jaTem = (atual.baixas && typeof atual.baixas === 'object') ? atual.baixas : {};
      var saldo = {}; Object.keys(itens).forEach(function (k2) { saldo[k2] = qtdInt(itens[k2] && itens[k2].qtd); });
      var mexeu = {}, novasBaixas = {}, feitos = [], jaBaixados = [], t0 = Date.now(), vistos = {};
      for (var p = 0; p < peds.length; p++) {
        var pk = pedidoChave(peds[p] && peds[p].pedido);
        if (!pk) return erro('pedido sem numero');
        if (vistos[pk]) continue; vistos[pk] = 1;
        if (jaTem[pk]) { jaBaixados.push(pk); continue; }
        var lista = Array.isArray(peds[p].itens) ? peds[p].itens : [];
        var reg = [];
        for (var j = 0; j < lista.length && j < 200; j++) {
          var ck = lista[j] && lista[j].chave;
          if (!chaveOk(ck)) return erro('chave invalida no pedido ' + pk);
          var pediu = qtdInt(lista[j].qtd); if (!pediu) continue;
          var tem = saldo[ck] || 0, baixou = Math.min(pediu, tem);
          if (baixou > 0) { saldo[ck] = tem - baixou; mexeu[ck] = 1; }
          reg.push({ chave: ck, nome: nomeOk(lista[j].nome), pediu: pediu, baixou: baixou });
        }
        novasBaixas[pk] = { t: t0, itens: reg };
        feitos.push(pk);
      }
      if (feitos.length) {
        var raizPatch = {};
        Object.keys(mexeu).forEach(function (k3) {
          raizPatch['itens/' + k3] = saldo[k3] > 0 ? { nome: nomeOk(itens[k3] && itens[k3].nome), qtd: saldo[k3], t: t0 } : null;
        });
        Object.keys(novasBaixas).forEach(function (pk2) { raizPatch['baixas/' + pk2] = novasBaixas[pk2]; });
        await fb(RAIZ, 'PATCH', raizPatch);   /* um PATCH só: estoque e marca de baixa entram juntos */
      }
      var c = await lerTudo();
      return resp({ success: true, itens: c.itens, baixas: c.baixas, feitos: feitos, ja_baixados: jaBaixados });
    }

    if (acao === 'desfazer') {
      var pkD = pedidoChave(d.pedido);
      if (!pkD) return erro('pedido faltando');
      var at = (await fb(RAIZ)) || {};
      var its = (at.itens && typeof at.itens === 'object') ? at.itens : {};
      var regB = at.baixas && at.baixas[pkD];
      if (!regB) return erro('esse pedido nao tem baixa');
      var volta = {}, nomes = {}, devolvido = 0, linhasB = Array.isArray(regB.itens) ? regB.itens : [];
      for (var x = 0; x < linhasB.length; x++) {
        var kb = linhasB[x] && linhasB[x].chave, qb = qtdInt(linhasB[x] && linhasB[x].baixou);
        if (!chaveOk(kb) || !qb) continue;
        volta[kb] = (volta[kb] || 0) + qb; nomes[kb] = nomeOk(linhasB[x].nome); devolvido += qb;
      }
      var tD = Date.now(), patchD = {};
      Object.keys(volta).forEach(function (kv) {
        var nomeAtual = nomeOk(its[kv] && its[kv].nome) || nomes[kv] || kv;
        patchD['itens/' + kv] = { nome: nomeAtual, qtd: Math.min(qtdInt(its[kv] && its[kv].qtd) + volta[kv], MAX_QTD), t: tD };
      });
      patchD['baixas/' + pkD] = null;
      await fb(RAIZ, 'PATCH', patchD);   /* um PATCH só: o estoque volta e a marca some juntos */
      var e2 = await lerTudo();
      return resp({ success: true, itens: e2.itens, baixas: e2.baixas, desfeito: pkD, devolvido: devolvido });
    }

    return erro('acao desconhecida');
  } catch (e) {
    return erro('erro: ' + String(e && e.message || e));
  }
};
