'use strict';
/* =============================================================================
   atacado-catalogo.js — CATÁLOGO DA PÁGINA DE ATACADO SEM APPS SCRIPT (VitaFlow)  ·  v1  ·  30/09/2026
   Netlify Function no repo vitaflow-proxy → netlify/functions/atacado-catalogo.js
   URL: https://vitaflow-proxy.netlify.app/.netlify/functions/atacado-catalogo

   Mesma coisa que o GAS faz na action 'atacado_catalogo' (_atacadoCatalogoPublico): lê a tabela que o
   Conversor publica (vitaflow_atacado/tabela_fornecedor) e devolve SÓ nome / preço / status / imagem —
   NUNCA o custo (usd) nem a margem. Mesma regra: sem nome ou preço <= 0 fica de fora; status vazio =
   'disponivel'. ⚠️ Se a regra do GAS mudar, mudar aqui também (as duas são curtas, de propósito).

   CHAMADA: POST { action:'atacado_catalogo' } (ou GET)
   RESPOSTA: { success:true, produtos:[{nome, preco, status, img}] }
     erro → { success:false, produtos:[], usar_gas:true } — a página cai no caminho antigo (Worker → GAS).

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

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
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

exports._t = { catalogoPublico: catalogoPublico };
