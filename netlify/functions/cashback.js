'use strict';
/* =============================================================================
   cashback.js — CASHBACK VITAFLOW  ·  v1  ·  04/11/2026
   Pedido do Thiago (04/11): trocar o sorteio por cashback para todo cliente que compra.
   Regras dele: 3% · validade 45 dias · liberado logo depois da confirmação do pagamento (cancelado/estornado → o crédito cai
   sozinho) · só sobre o valor PAGO em produtos (cupom já descontado, frete nunca) · atacado participa igual · revendedor (V) fora ·
   pode usar JUNTO com cupom · pode usar o saldo inteiro, sem mínimo · aparece no carrinho (já aplicado), na Minha Conta e na
   Athena · lembrete por e-mail 5 dias antes de vencer · pedido cancelado em que o cliente USOU cashback → o valor volta pro saldo
   (com a validade original) · para usar: o mesmo CPF + o mesmo e-mail (site) ou o mesmo telefone (Athena) das compras.
   Netlify Function no repo vitaflow-proxy → netlify/functions/cashback.js
   QUEM GRAVA O QUÊ (Realtime Database, nó fechado — só com FIREBASE_SECRET):
     vitaflow_cashback/creditos/<cpf>/<pedido>  ← Apps Script (cashbackProcessar): { pedido, valor, base, pct, em, expira, email, tel, nome, cancelado }
     vitaflow_cashback/usos/<cpf>/<pedido>      ← ESTA função (reservado) e o Apps Script (usado/liberado): { pedido, valor, em, status, canal }
     vitaflow_cashback/tel/<DDD+8 dígitos>/<cpf> ← Apps Script: índice telefone → CPF (a Athena acha o cliente pelo WhatsApp)
     vitaflow_cashback/config                   ← { ativo, pct, dias, aviso_dias, inicio } (padrão no Apps Script)
   Valores em CENTAVOS. O cálculo do saldo (cbCalcular) é o MESMO texto do Apps Script.
   AÇÕES (POST JSON, CORS aberto):
     { acao:'saldo', cpf, email | telefone, ignorar? }        → { ok, saldo, lotes:[{valor, expira, validade}], validade_proxima }
         sem crédito ou CPF/e-mail/telefone que não confere → { ok:true, saldo:0 } (não diz se existe saldo)
         ignorar = nº do pedido de uma reserva anterior DESTE navegador (conta como liberada)
         só telefone (sem cpf) = Athena: o CPF sai do índice tel/ (o de maior saldo, se houver mais de um)
     { acao:'reservar', cpf, email | telefone, pedido, valor, canal, anterior? } → { ok, valor } (valor = o que foi reservado, ≤ saldo)
     { acao:'liberar', cpf, email | telefone, pedido }        → { ok }
   O Apps Script troca 'reservado' por 'usado' quando o pedido é pago, ou por 'liberado' se não for pago em 73 h ou for cancelado.
   Variáveis de ambiente (já existem no vitaflow-proxy): FIREBASE_SECRET.
   ============================================================================= */
var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var RAIZ = 'vitaflow_cashback';
var DIA = 86400000;
var RESERVA_TROCA_MS = 20 * 60000;   /* reserva antiga do MESMO CPF, não paga, com mais de 20 min → liberada quando ele reserva de novo */
var CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
function resp(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

function segredo() { return process.env.FIREBASE_SECRET || ''; }
async function fbGet(caminho) {
  var r = await fetch(FB_BASE + '/' + caminho + '.json?auth=' + encodeURIComponent(segredo()));
  if (!r.ok) throw new Error('firebase GET ' + r.status + ' ' + caminho);
  return r.json();
}
async function fbPatch(caminho, obj) {
  var r = await fetch(FB_BASE + '/' + caminho + '.json?auth=' + encodeURIComponent(segredo()), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
  if (!r.ok) throw new Error('firebase PATCH ' + r.status + ' ' + caminho);
}

function soDig(s) { return String(s || '').replace(/\D/g, ''); }
function cpf11(v) { var d = soDig(v); while (d.length < 11 && d.length >= 9) d = '0' + d; return d; }
function chave(s) { return String(s || '').replace(/[.#$\[\]\/]/g, '_'); }
function normEmail(s) { return String(s || '').trim().toLowerCase(); }
/* telefone: DDD + 8 últimos dígitos (aceita com/sem 55 e com/sem o 9) */
function telChave(t) {
  var d = soDig(t);
  if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);
  if (d.length < 10) return '';
  return d.slice(0, 2) + d.slice(-8);
}
function ddmmaaaa(ts) { var d = new Date(Number(ts) - 3 * 3600000); return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '/' + d.getUTCFullYear(); }
function pedidoValido(p) { return /^VF-\d{4}-[SMAWP]X?\d{1,5}$/i.test(String(p || '').trim()); }

/* ===== CASHBACK — cálculo do saldo (ES5: o MESMO texto roda no Apps Script e na função cashback.js) =====
   Créditos: um por pedido pago, com valor (centavos), em (pagamento), expira. Cancelado = não conta.
   Usos: reservado/usado contam; liberado não. Cada uso consome os créditos que vencem primeiro (e que já
   existiam e não estavam vencidos na hora do uso). Saldo = o que sobra nos créditos ainda não vencidos. */
function cbCalcular(creditos, usos, agora) {
  var lotes = [], us = [], k, c, u, i, j;
  creditos = creditos || {}; usos = usos || {};
  for (k in creditos) {
    if (!creditos.hasOwnProperty(k)) continue;
    c = creditos[k];
    if (!c || c.cancelado) continue;
    var v = Math.round(Number(c.valor) || 0);
    if (v <= 0) continue;
    lotes.push({ k: k, pedido: String(c.pedido || k), v: v, rest: v, em: Number(c.em) || 0, exp: Number(c.expira) || 0 });
  }
  lotes.sort(function (a, b) { return (a.exp - b.exp) || (a.em - b.em); });
  for (k in usos) {
    if (!usos.hasOwnProperty(k)) continue;
    u = usos[k];
    if (!u || (u.status !== 'reservado' && u.status !== 'usado')) continue;
    var uv = Math.round(Number(u.valor) || 0);
    if (uv <= 0) continue;
    us.push({ k: k, v: uv, em: Number(u.em) || 0 });
  }
  us.sort(function (a, b) { return a.em - b.em; });
  for (i = 0; i < us.length; i++) {
    var falta = us[i].v;
    for (j = 0; j < lotes.length && falta > 0; j++) {
      var l = lotes[j];
      if (l.rest <= 0 || l.exp <= us[i].em || l.em > us[i].em) continue;
      var tira = Math.min(falta, l.rest);
      l.rest -= tira; falta -= tira;
    }
  }
  var saldo = 0, ativos = [];
  for (j = 0; j < lotes.length; j++) {
    if (lotes[j].rest > 0 && lotes[j].exp > agora) {
      saldo += lotes[j].rest;
      ativos.push({ k: lotes[j].k, pedido: lotes[j].pedido, valor: lotes[j].rest, expira: lotes[j].exp });
    }
  }
  return { saldo: saldo, lotes: ativos };
}


async function config() {
  var c = null;
  try { c = await fbGet(RAIZ + '/config'); } catch (e) { c = null; }
  c = c || {};
  return { ativo: c.ativo !== false, pct: Number(c.pct) || 3, dias: Number(c.dias) || 45 };
}

/* créditos + usos do CPF, e se o e-mail/telefone confere com o de algum pedido que gerou crédito */
async function lerCliente(cpf, email, tel) {
  var cr = (await fbGet(RAIZ + '/creditos/' + cpf)) || {};
  var e = normEmail(email), t = telChave(tel), ok = false;
  Object.keys(cr).forEach(function (k) {
    var c = cr[k] || {};
    if (e && normEmail(c.email) === e) ok = true;
    if (t && telChave(c.tel) === t) ok = true;
  });
  var us = ok ? ((await fbGet(RAIZ + '/usos/' + cpf)) || {}) : {};
  return { autorizado: ok, creditos: cr, usos: us };
}

function semReserva(usos, pedido) {
  var k = chave(String(pedido || '').trim().toUpperCase()), o = {};
  Object.keys(usos || {}).forEach(function (x) { o[x] = usos[x]; });
  if (k && o[k] && o[k].status === 'reservado') o[k] = Object.assign({}, o[k], { status: 'liberado' });
  return o;
}

function saida(calc) {
  var lotes = calc.lotes.map(function (l) { return { valor: l.valor, expira: l.expira, validade: ddmmaaaa(l.expira) }; });
  return { ok: true, saldo: calc.saldo, lotes: lotes, validade_proxima: lotes.length ? lotes[0].validade : '' };
}

/* Athena: sem CPF, acha pelo telefone (índice gravado pelo Apps Script junto com o crédito) */
async function cpfDoTelefone(tel, agora) {
  var t = telChave(tel);
  if (!t) return '';
  var idx = (await fbGet(RAIZ + '/tel/' + t)) || {};
  var cpfs = Object.keys(idx).filter(function (c) { return /^\d{11}$/.test(c); }).slice(0, 5);
  if (cpfs.length <= 1) return cpfs[0] || '';
  var melhor = '', maior = -1;
  for (var i = 0; i < cpfs.length; i++) {
    var cl = await lerCliente(cpfs[i], '', tel);
    var sd = cl.autorizado ? cbCalcular(cl.creditos, cl.usos, agora).saldo : 0;
    if (sd > maior) { maior = sd; melhor = cpfs[i]; }
  }
  return melhor;
}
async function cpfDoCorpo(b, agora) {
  var cpf = cpf11(b.cpf);
  if (cpf.length !== 11 && !b.email && b.telefone) cpf = await cpfDoTelefone(b.telefone, agora);
  return cpf;
}

async function acaoSaldo(b, agora) {
  var cfg = await config();
  if (!cfg.ativo) return { ok: true, ativo: false, saldo: 0, lotes: [] };
  var cpf = await cpfDoCorpo(b, agora);
  if (cpf.length !== 11) return { ok: true, saldo: 0, lotes: [] };
  var cl = await lerCliente(cpf, b.email, b.telefone);
  if (!cl.autorizado) return { ok: true, saldo: 0, lotes: [] };
  var usos = b.ignorar ? semReserva(cl.usos, b.ignorar) : cl.usos;
  var o = saida(cbCalcular(cl.creditos, usos, agora));
  o.pct = cfg.pct; o.dias = cfg.dias;
  return o;
}

async function acaoReservar(b, agora) {
  var cfg = await config();
  if (!cfg.ativo) return { ok: false, erro: 'desligado', valor: 0 };
  var cpf = await cpfDoCorpo(b, agora), pedido = String(b.pedido || '').trim().toUpperCase();
  if (cpf.length !== 11) return { ok: false, erro: 'cpf_invalido', valor: 0 };
  if (!pedidoValido(pedido)) return { ok: false, erro: 'pedido_invalido', valor: 0 };
  var pedir = Math.round(Number(b.valor) || 0);
  if (pedir <= 0) return { ok: false, erro: 'valor_invalido', valor: 0 };
  var cl = await lerCliente(cpf, b.email, b.telefone);
  if (!cl.autorizado) return { ok: false, erro: 'nao_autorizado', valor: 0 };
  var k = chave(pedido), usos = cl.usos, mud = {};
  if (usos[k] && (usos[k].status === 'reservado' || usos[k].status === 'usado')) return { ok: true, valor: Number(usos[k].valor) || 0, ja: true };
  /* libera a reserva anterior deste navegador e as antigas (> 20 min) ainda reservadas deste CPF */
  var ant = b.anterior ? chave(String(b.anterior).trim().toUpperCase()) : '';
  Object.keys(usos).forEach(function (x) {
    var u = usos[x];
    if (!u || u.status !== 'reservado' || x === k) return;
    if (x === ant || (agora - (Number(u.em) || 0)) > RESERVA_TROCA_MS) {
      mud[x + '/status'] = 'liberado'; mud[x + '/motivo'] = 'nova_reserva'; mud[x + '/atualizado'] = agora;
      usos[x] = Object.assign({}, u, { status: 'liberado' });
    }
  });
  var calc = cbCalcular(cl.creditos, usos, agora);
  var valor = Math.min(pedir, calc.saldo);
  if (valor > 0) {
    mud[k] = { pedido: pedido, valor: valor, em: agora, status: 'reservado', canal: String(b.canal || 'site').slice(0, 12) };
  }
  if (Object.keys(mud).length) await fbPatch(RAIZ + '/usos/' + cpf, mud);
  return { ok: true, valor: valor, saldo: calc.saldo };
}

async function acaoLiberar(b, agora) {
  var cpf = await cpfDoCorpo(b, agora), pedido = String(b.pedido || '').trim().toUpperCase();
  if (cpf.length !== 11 || !pedidoValido(pedido)) return { ok: false, erro: 'dados_invalidos' };
  var cl = await lerCliente(cpf, b.email, b.telefone);
  if (!cl.autorizado) return { ok: false, erro: 'nao_autorizado' };
  var k = chave(pedido);
  if (cl.usos[k] && cl.usos[k].status === 'reservado') {
    var m = {}; m[k + '/status'] = 'liberado'; m[k + '/motivo'] = 'cliente'; m[k + '/atualizado'] = agora;
    await fbPatch(RAIZ + '/usos/' + cpf, m);
  }
  return { ok: true };
}

/* Minha Conta (conta-cliente.js): resumo dos CPFs da conta — a conta já foi autenticada lá (sessão) */
async function resumoConta(cpfs, agora) {
  var cfg = await config();
  var out = { ativo: cfg.ativo, pct: cfg.pct, dias: cfg.dias, saldo: 0, lotes: [], historico: [] };
  var lidos = await Promise.all((cpfs || []).slice(0, 3).map(async function (c) {
    try { return { cr: (await fbGet(RAIZ + '/creditos/' + c)) || {}, us: (await fbGet(RAIZ + '/usos/' + c)) || {} }; }
    catch (e) { return { cr: {}, us: {} }; }
  }));
  lidos.forEach(function (x) {
    var calc = cbCalcular(x.cr, x.us, agora);
    out.saldo += calc.saldo;
    calc.lotes.forEach(function (l) { out.lotes.push({ valor: l.valor, expira: l.expira, validade: ddmmaaaa(l.expira) }); });
    Object.keys(x.cr).forEach(function (k) {
      var c = x.cr[k] || {};
      out.historico.push({ tipo: 'ganho', pedido: String(c.pedido || k), valor: Number(c.valor) || 0, ts: Number(c.em) || 0, data: ddmmaaaa(c.em),
        validade: ddmmaaaa(c.expira), situacao: c.cancelado ? 'cancelado' : ((Number(c.expira) || 0) <= agora ? 'vencido' : 'ativo') });
    });
    Object.keys(x.us).forEach(function (k) {
      var u = x.us[k] || {};
      if (u.status !== 'usado') return;
      out.historico.push({ tipo: 'uso', pedido: String(u.pedido || k), valor: Number(u.valor) || 0, ts: Number(u.em) || 0, data: ddmmaaaa(u.em) });
    });
  });
  out.lotes.sort(function (a, b) { return a.expira - b.expira; });
  out.historico.sort(function (a, b) { return b.ts - a.ts; });
  out.historico = out.historico.slice(0, 30).map(function (h) { delete h.ts; return h; });
  out.validade_proxima = out.lotes.length ? out.lotes[0].validade : '';
  return out;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, erro: 'metodo' });
  if (!segredo()) return resp(500, { ok: false, erro: 'config' });
  var b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return resp(400, { ok: false, erro: 'json' }); }
  var agora = Date.now();
  try {
    if (b.acao === 'saldo') return resp(200, await acaoSaldo(b, agora));
    if (b.acao === 'reservar') return resp(200, await acaoReservar(b, agora));
    if (b.acao === 'liberar') return resp(200, await acaoLiberar(b, agora));
    return resp(400, { ok: false, erro: 'acao' });
  } catch (e) {
    console.error('[cashback] ' + e.message);
    return resp(200, { ok: false, erro: 'falha', saldo: 0, valor: 0 });
  }
};
/* Athena (botconversa.js, mesmo site): chama direto, sem HTTP. Nunca lança erro. */
async function libSaldo(b) { try { if (!segredo()) return { ok: false, saldo: 0 }; return await acaoSaldo(b || {}, Date.now()); } catch (e) { console.error('[cashback] lib saldo: ' + e.message); return { ok: false, saldo: 0 }; } }
async function libReservar(b) { try { if (!segredo()) return { ok: false, valor: 0 }; return await acaoReservar(b || {}, Date.now()); } catch (e) { console.error('[cashback] lib reservar: ' + e.message); return { ok: false, valor: 0 }; } }
exports.lib = { cbCalcular: cbCalcular, resumoConta: resumoConta, telChave: telChave, saldo: libSaldo, reservar: libReservar };
