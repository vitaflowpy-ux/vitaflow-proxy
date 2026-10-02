'use strict';
/* =============================================================================
   atacado-catalogo.js — CATÁLOGO DA PÁGINA DE ATACADO SEM APPS SCRIPT (VitaFlow)  ·  v2  ·  02/10/2026
   Netlify Function no repo vitaflow-proxy → netlify/functions/atacado-catalogo.js
   URL: https://vitaflow-proxy.netlify.app/.netlify/functions/atacado-catalogo

   Mesma coisa que o GAS faz na action 'atacado_catalogo' (_atacadoCatalogoPublico): lê a tabela que o
   Conversor publica (vitaflow_atacado/tabela_fornecedor) e devolve SÓ nome / preço / status / imagem —
   NUNCA o custo (usd) nem a margem. Mesma regra: sem nome ou preço <= 0 fica de fora; status vazio =
   'disponivel'. ⚠️ Se a regra do GAS mudar, mudar aqui também (as duas são curtas, de propósito).

   CHAMADA: POST { action:'atacado_catalogo' } (ou GET)
   RESPOSTA: { success:true, produtos:[{nome, preco, status, img}] }
     erro → { success:false, produtos:[], usar_gas:true } — a página cai no caminho antigo (Worker → GAS).

   v2 (02/10/2026) — DESCRIÇÃO DOS PRODUTOS (modal da página de atacado):
   CHAMADA: POST { action:'atacado_descricoes' }
   RESPOSTA: { success:true, descricoes:{ "<nome do produto na tabela>": { titulo, texto } } }
     Só dos produtos que estão no catálogo público AGORA (mesma regra de cima). As descrições ficam em
     vitaflow_atacado/descricoes/<chave do nome> = { nome, titulo, texto } — a chave é a MESMA do
     vitaflow_atacado/historico (_histKey do Publicar Atacado). Produto que sai da tabela some daqui;
     quando volta, a descrição volta junto (ela nunca é apagada do Firebase).
     erro → { success:false, descricoes:{} } — a página só fica sem o modal.
   A action 'atacado_catalogo' (e a chamada sem action) NÃO mudou.

   Variável de ambiente: FIREBASE_SECRET (já existe no site).
   ============================================================================= */

var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var FB_SECRET = process.env.FIREBASE_SECRET || '';
var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=60'
};

function resp(obj) { return { statusCode: 200, headers: CORS, body: JSON.stringify(obj) }; }

/* igual ao _atacadoCatalogoPublico do GAS */
function catalogoPublico(d) {
  var arr = (d && d.produtos) ? d.produtos : [];
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var p = arr[i] || {};
    if (!p.nome) continue;
    var preco = Number(p.reais);
    if (!(preco > 0)) continue;
    var img = (p.img != null) ? String(p.img) : '';
    out.push({ nome: String(p.nome), preco: preco, status: String(p.status || 'disponivel'), img: img });
  }
  return out;
}

/* igual ao _normNome / _histKey do Publicar Atacado (conversor_publicar.html) */
function normNome(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(); }
function chaveNome(nome) { var k = normNome(nome).replace(/[.#$\[\]\/]/g, '_').slice(0, 180); return k || '_'; }

/* descrições só dos produtos que estão no catálogo público */
function descricoesPublicas(tabela, descs) {
  var prods = catalogoPublico(tabela);
  var out = {};
  descs = descs || {};
  for (var i = 0; i < prods.length; i++) {
    var d = descs[chaveNome(prods[i].nome)];
    if (!d) continue;
    var titulo = (d.titulo != null) ? String(d.titulo) : '';
    var texto = (d.texto != null) ? String(d.texto) : '';
    if (!titulo && !texto) continue;
    out[prods[i].nome] = { titulo: titulo, texto: texto };
  }
  return out;
}

function lerAcao(event) {
  try {
    if (event && event.body) { var b = JSON.parse(event.body); if (b && b.action) return String(b.action); }
  } catch (e) {}
  try {
    var q = (event && event.queryStringParameters) || {};
    if (q.action) return String(q.action);
  } catch (e2) {}
  return '';
}

function lerFb(caminho, signal) {
  return fetch(FB_BASE + '/' + caminho + '.json?auth=' + encodeURIComponent(FB_SECRET), { signal: signal })
    .then(function (r) { if (!r.ok) throw new Error('firebase ' + r.status); return r.json(); });
}

async function descricoes() {
  if (!FB_SECRET) return resp({ success: false, descricoes: {} });
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, 8000);
  try {
    var r = await Promise.all([lerFb('vitaflow_atacado/tabela_fornecedor', ctrl.signal), lerFb('vitaflow_atacado/descricoes', ctrl.signal)]);
    return resp({ success: true, descricoes: descricoesPublicas(r[0], r[1]) });
  } catch (e) {
    return resp({ success: false, descricoes: {} });
  } finally { clearTimeout(t); }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (lerAcao(event) === 'atacado_descricoes') return descricoes();
  if (!FB_SECRET) return resp({ success: false, produtos: [], usar_gas: true });
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, 8000);
  try {
    var r = await fetch(FB_BASE + '/vitaflow_atacado/tabela_fornecedor.json?auth=' + encodeURIComponent(FB_SECRET), { signal: ctrl.signal });
    if (!r.ok) throw new Error('firebase ' + r.status);
    var d = await r.json();
    return resp({ success: true, produtos: catalogoPublico(d) });
  } catch (e) {
    return resp({ success: false, produtos: [], usar_gas: true });
  } finally { clearTimeout(t); }
};

exports._t = { catalogoPublico: catalogoPublico, descricoesPublicas: descricoesPublicas, chaveNome: chaveNome, lerAcao: lerAcao };
