'use strict';
/* =============================================================================
   listar-pedidos.js — PEDIDOS PARA OS PAINÉIS SEM APPS SCRIPT (VitaFlow)  ·  v2  ·  15/10/2026
   v2 (15/10/2026): aceita o login de admin (tokenAdmin) — a chave saiu das páginas. Ver autorizado().
   Netlify Function no repo vitaflow-proxy → netlify/functions/listar-pedidos.js
   URL: https://vitaflow-proxy.netlify.app/.netlify/functions/listar-pedidos

   POR QUE EXISTE: Compras, Painel de Dados, Painel de Lucros e Painel Estratégico carregavam os pedidos
   pelo GAS (action listar_pedidos). O GAS só lia o ESPELHO da planilha no Firebase (vitaflow_pedidos +
   vitaflow_pedidos_hdr) e devolvia — mas o Apps Script às vezes segura a chamada 10-40 s na fila.
   Esta função faz a MESMA leitura e devolve EXATAMENTE o mesmo formato:
       { success:true, linhas:[[cabeçalho],[linha],...], fonte:'firebase' }
   (mesma ordem das linhas: a mesma que o GAS obtinha do mesmo JSON).

   CHAMADA (mesmo corpo do GAS): POST { action:'listar_pedidos', tokenAdmin:'<idToken do admin>' }  (v2; chave só servidor)
   Sem resposta daqui (espelho vazio, erro, variável não configurada, resposta grande demais):
       { success:false, usar_gas:true, motivo }  → o painel chama o GAS como antes (lá ainda tem a planilha).

   Variáveis de ambiente (Netlify → vitaflow-proxy → Environment variables):
     FIREBASE_SECRET (já existe)  ·  COMPRAS_KEY (NOVA — o mesmo valor vfc_... dos painéis/GAS)
   ============================================================================= */

var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var FB_SECRET = process.env.FIREBASE_SECRET || '';
var COMPRAS_KEY = process.env.COMPRAS_KEY || '';
var LIMITE_BYTES = 5500000;   /* a Netlify corta resposta acima de 6 MB — acima disso, o GAS responde */
var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function resp(obj) { return { statusCode: 200, headers: CORS, body: typeof obj === 'string' ? obj : JSON.stringify(obj) }; }
function usarGas(motivo) { return resp({ success: false, usar_gas: true, motivo: motivo }); }

/* v2 (15/10/2026): o painel manda o login de admin (tokenAdmin = idToken do Firebase Auth) em vez da chave.
   Conferido lendo admins/<uid> com o PRÓPRIO token (o Firebase recusa token falso/vencido) — igual ao conferirAdmin
   do logistica-painel. A chave (COMPRAS_KEY) continua aceita, só para chamadas de servidor. */
async function conferirAdmin(token) {
  token = String(token || '');
  var partes = token.split('.');
  if (partes.length !== 3) return null;
  var uid = '';
  try { var pl = JSON.parse(Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); uid = pl.user_id || pl.sub || ''; } catch (e) { return null; }
  if (!uid || !/^[A-Za-z0-9]+$/.test(uid)) return null;
  try {
    var r = await fetch(FB_BASE + '/admins/' + uid + '.json?auth=' + encodeURIComponent(token));
    if (!r.ok) return null;
    return (await r.json()) === true ? uid : null;
  } catch (e) { return null; }
}
async function autorizado(d) {
  if (COMPRAS_KEY && String(d.chave || '') === COMPRAS_KEY) return true;
  return !!(await conferirAdmin(d.tokenAdmin));
}

async function fbGet(caminho) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, 9000);
  try {
    var r = await fetch(FB_BASE + '/' + caminho + '.json?auth=' + encodeURIComponent(FB_SECRET), { signal: ctrl.signal });
    if (!r.ok) throw new Error('firebase ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  var d = {};
  try { d = JSON.parse(event.body || '{}') || {}; } catch (e) { d = {}; }
  if (!FB_SECRET) return usarGas('variavel de ambiente faltando');
  if (!(await autorizado(d))) return resp({ success: false, erro: 'nao_autorizado' });
  try {
    var dados = await Promise.all([fbGet('vitaflow_pedidos_hdr'), fbGet('vitaflow_pedidos')]);
    var hdr = dados[0], mapa = dados[1];
    if (!hdr || !hdr.length || !mapa || typeof mapa !== 'object') return usarGas('espelho vazio');
    var chaves = Object.keys(mapa);
    if (!chaves.length) return usarGas('espelho vazio');
    var linhas = [hdr];
    for (var i = 0; i < chaves.length; i++) linhas.push(mapa[chaves[i]]);
    var corpo = JSON.stringify({ success: true, linhas: linhas, fonte: 'firebase' });
    if (corpo.length > LIMITE_BYTES) return usarGas('resposta grande demais');
    return resp(corpo);
  } catch (e) {
    return usarGas('erro: ' + String(e && e.message || e));
  }
};
