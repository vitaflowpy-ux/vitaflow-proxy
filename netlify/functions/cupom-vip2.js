'use strict';
/* =============================================================================
   cupom-vip2.js — CUPOM PESSOAL DO GRUPO VIP 2 (VitaFlow)  ·  v1  ·  28/10/2026
   Pedido do Thiago (28/10): "quero uma funcionalidade para o cliente entrar em um link e preencher o nome e o cpf dele, então o
   cupom é gerado automaticamente e vinculado àquele cpf" · 5% · primeiros 100 · 30 dias · não acumula ("sim, pode fazer tudo").

   Netlify Function no repo vitaflow-proxy → netlify/functions/cupom-vip2.js
   Página que chama: vitaflowoficial.com/pages/vip2 (formulário nome + CPF).

   AÇÕES (POST JSON, CORS aberto):
     { acao:'gerar', nome, cpf }     → { ok:true, codigo, expira, pct, jaTinha } · { ok:false, erro, msg }
                                       erro: cpf_invalido · nome_invalido · esgotado · encerrada · falha
     { acao:'conferir', codigo, cpf } → { ok:true, travado:false } (cupom que não é do VIP 2)
                                       { ok:true, travado:true, confere:true|false }
     GET ?acao=status                 → { ok:true, ativo, limite, usados, restam, pct, dias }

   REGRAS
     • 1 cupom por CPF: quem volta recebe o MESMO cupom (não gera outro).
     • Limite (padrão 100): esgotou → a página avisa. Aviso no Telegram quando acabar.
     • Cupom no MESMO formato dos outros (Gestão de Cupons / carrinho / Athena / Apps Script já entendem):
       cupons_vitaflow/<id>: tipo 'pct', valor 5, tipoVal 'unico_prazo' (uso único + validade), expira = +30 dias da geração,
       maxUsos 1, usosAtual 0, origem 'grupo-vip2', travaCpf true.
     • PRIVACIDADE: a coleção cupons_vitaflow é aberta para LEITURA (o site lê). Por isso o CPF e o nome NÃO vão nela — nem no id do
       documento (o id é um hash do CPF com o segredo do servidor). CPF e nome ficam só no Realtime Database (fechado):
         vitaflow_sync/cupom_vip2/cpf/<cpf 11 dígitos> = { nome, codigo, criado, expira }
         vitaflow_sync/cupom_vip2/codigo/<CÓDIGO>      = { cpf, nome, criado }
         vitaflow_sync/cupom_vip2/config               = { ativo, limite, pct, dias, prefixo }   (opcional; sem ele vale o padrão)
     • Quem confere o CPF: carrinho do site (ao aplicar e ao finalizar), Athena (pede o CPF do titular) e Apps Script (avisa no
       Telegram se um pedido usar o cupom com outro CPF).
   Variáveis de ambiente (já existem no vitaflow-proxy): FIREBASE_SECRET · TELEGRAM_TOKEN (aviso de esgotado).
   ============================================================================= */
var crypto = require('crypto');

var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var FB_SECRET = process.env.FIREBASE_SECRET || '';
var RAIZ = 'vitaflow_sync/cupom_vip2';
var FS_PROJETO = 'pricehub-f0236';
var FS_KEY = process.env.FIRESTORE_KEY || 'AIzaSyBxaI82P6OjCoPtBA-kNZZ0-F0RdjYdNhw';   /* chave web pública — a mesma do carrinho, da Athena e do logistica-painel */
var PADRAO = { ativo: true, limite: 100, pct: 5, dias: 30, prefixo: 'VIP2' };
var ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   /* sem I, O, 0 e 1 — o cliente digita isso */

var CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
function resp(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

/* ---------- utilidades ---------- */
function soDig(s) { return String(s || '').replace(/\D/g, ''); }
function cpfValido(c) {
  c = soDig(c);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (var t = 9; t < 11; t++) {
    var s = 0;
    for (var i = 0; i < t; i++) s += Number(c.charAt(i)) * (t + 1 - i);
    var d = (s * 10) % 11; if (d === 10) d = 0;
    if (d !== Number(c.charAt(t))) return false;
  }
  return true;
}
function nomeLimpo(n) { return String(n || '').replace(/[<>"\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80); }
function codigoNorm(c) { return String(c || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 30); }
function codigoNovo(prefixo) { var s = ''; for (var i = 0; i < 5; i++) s += ALFA.charAt(crypto.randomInt(ALFA.length)); return prefixo + '-' + s; }
function docIdDoCpf(cpf) { return 'vip2_' + crypto.createHmac('sha256', FB_SECRET || 'vitaflow').update(cpf).digest('hex').slice(0, 20); }

/* ---------- Realtime Database (fechado; FIREBASE_SECRET) ---------- */
async function fbGet(caminho, extra) {
  var r = await fetch(FB_BASE + '/' + caminho + '.json?auth=' + encodeURIComponent(FB_SECRET) + (extra || ''));
  if (!r.ok) throw new Error('firebase GET ' + r.status + ' ' + caminho);
  return r.json();
}
async function fbPatch(caminho, obj) {
  var r = await fetch(FB_BASE + '/' + caminho + '.json?auth=' + encodeURIComponent(FB_SECRET), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
  if (!r.ok) throw new Error('firebase PATCH ' + r.status + ' ' + caminho);
}
async function config() {
  var c = {};
  try { c = (await fbGet(RAIZ + '/config')) || {}; } catch (e) { c = {}; }
  var o = Object.assign({}, PADRAO, c);
  o.ativo = o.ativo !== false;
  o.limite = Math.max(0, Math.min(10000, Number(o.limite) || PADRAO.limite));
  o.pct = Math.max(1, Math.min(50, Number(o.pct) || PADRAO.pct));
  o.dias = Math.max(1, Math.min(365, Number(o.dias) || PADRAO.dias));
  o.prefixo = String(o.prefixo || PADRAO.prefixo).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || PADRAO.prefixo;
  return o;
}
async function quantosGerados() {
  var d = await fbGet(RAIZ + '/cpf', '&shallow=true');
  return d && typeof d === 'object' ? Object.keys(d).length : 0;
}
async function telegram(txt) {
  var t = process.env.TELEGRAM_TOKEN, c = process.env.TELEGRAM_CHAT || '8660563352';   /* mesmo chat da Athena (enviarTelegram) */
  if (!t || !c) return;
  try { await fetch('https://api.telegram.org/bot' + t + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: c, text: txt }) }); }
  catch (e) { /* aviso interno */ }
}

/* ---------- Firestore (cupons_vitaflow — a mesma da Gestão de Cupons, do carrinho e da Athena) ---------- */
function fsUrl(caminho, extra) {
  return 'https://firestore.googleapis.com/v1/projects/' + FS_PROJETO + '/databases/(default)/documents' + caminho + '?key=' + FS_KEY + (extra || '');
}
async function fsCodigoExiste(codigo) {
  var r = await fetch('https://firestore.googleapis.com/v1/projects/' + FS_PROJETO + '/databases/(default)/documents:runQuery?key=' + FS_KEY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'cupons_vitaflow' }],
      where: { fieldFilter: { field: { fieldPath: 'codigo' }, op: 'EQUAL', value: { stringValue: codigo } } }, limit: 1 } }) });
  if (!r.ok) throw new Error('Firestore runQuery ' + r.status);
  var d = await r.json();
  return (d || []).some(function (x) { return x && x.document; });
}
async function fsLerDoc(docId) {
  var r = await fetch(fsUrl('/cupons_vitaflow/' + encodeURIComponent(docId)));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Firestore GET ' + r.status);
  var d = await r.json(), f = d.fields || {};
  return { codigo: f.codigo ? String(f.codigo.stringValue || '') : '', expira: (f.expira && f.expira.timestampValue) ? new Date(f.expira.timestampValue).getTime() : 0 };
}
async function fsCriarCupom(docId, c) {
  var corpo = { fields: {
    codigo: { stringValue: c.codigo }, ativo: { booleanValue: true }, tipo: { stringValue: 'pct' }, valor: { doubleValue: c.pct },
    tipoVal: { stringValue: 'unico_prazo' }, expira: { timestampValue: new Date(c.expira).toISOString() },
    maxUsos: { integerValue: 1 }, usosAtual: { integerValue: 0 }, minPedido: { doubleValue: 0 }, maxDesc: { doubleValue: 0 },
    escopo: { stringValue: 'todos' },
    origem: { stringValue: 'grupo-vip2' }, travaCpf: { booleanValue: true }, criadoEm: { timestampValue: new Date(c.criado).toISOString() },   /* Timestamp, igual à Gestão de Cupons (ordena junto) */
    /* sem nome nem CPF (a coleção é aberta para leitura) */
    descricao: { stringValue: 'Grupo VIP 2 · cupom pessoal (vale só para o CPF de quem gerou)' } } };
  var r = await fetch(fsUrl('/cupons_vitaflow', '&documentId=' + encodeURIComponent(docId)), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  if (r.status === 409) return { ok: false, existe: true };
  if (!r.ok) return { ok: false, erro: 'Firestore HTTP ' + r.status + ' ' + String(await r.text()).slice(0, 160) };
  return { ok: true };
}

/* ---------- ações ---------- */
async function gerar(body, agora) {
  var cpf = soDig(body.cpf), nome = nomeLimpo(body.nome);
  if (!cpfValido(cpf)) return { ok: false, erro: 'cpf_invalido', msg: 'CPF inválido. Confira os números e tente de novo.' };
  if (nome.length < 3 || !/[A-Za-zÀ-ÿ]/.test(nome)) return { ok: false, erro: 'nome_invalido', msg: 'Escreva o seu nome completo.' };
  var cfg = await config();
  /* já tem? devolve o mesmo (mesmo com a campanha encerrada ou esgotada) */
  var ja = await fbGet(RAIZ + '/cpf/' + cpf);
  if (ja && ja.codigo) return { ok: true, jaTinha: true, codigo: ja.codigo, expira: ja.expira, pct: cfg.pct };
  if (!cfg.ativo) return { ok: false, erro: 'encerrada', msg: 'A campanha de cupons do Grupo VIP 2 foi encerrada.' };
  var usados = await quantosGerados();
  if (usados >= cfg.limite) return { ok: false, erro: 'esgotado', msg: 'Os ' + cfg.limite + ' cupons do Grupo VIP 2 já foram distribuídos.' };
  var docId = docIdDoCpf(cpf);
  /* se o documento já existe (clique duplo / registro perdido), reaproveita o cupom dele */
  var existente = await fsLerDoc(docId);
  var codigo, expira;
  if (existente && existente.codigo) { codigo = existente.codigo; expira = existente.expira; }
  else {
    for (var i = 0; i < 6 && !codigo; i++) { var c = codigoNovo(cfg.prefixo); if (!(await fsCodigoExiste(c))) codigo = c; }
    if (!codigo) throw new Error('não consegui um código livre');
    expira = agora + cfg.dias * 86400000;
    var cr = await fsCriarCupom(docId, { codigo: codigo, pct: cfg.pct, expira: expira, criado: agora });
    if (!cr.ok && cr.existe) { var de = await fsLerDoc(docId); if (de && de.codigo) { codigo = de.codigo; expira = de.expira; } else throw new Error('cupom existe mas não li'); }
    else if (!cr.ok) throw new Error(cr.erro || 'Firestore');
  }
  var reg = {};
  reg['cpf/' + cpf] = { nome: nome, codigo: codigo, criado: agora, expira: expira };
  reg['codigo/' + codigo] = { cpf: cpf, nome: nome, criado: agora };
  await fbPatch(RAIZ, reg);
  if (usados + 1 === cfg.limite) await telegram('🎟️ GRUPO VIP 2: os ' + cfg.limite + ' cupons de ' + cfg.pct + '% acabaram de ser distribuídos (último: ' + codigo + ').');
  return { ok: true, jaTinha: false, codigo: codigo, expira: expira, pct: cfg.pct };
}
async function conferir(body) {
  var codigo = codigoNorm(body.codigo), cpf = soDig(body.cpf);
  if (!codigo) return { ok: false, erro: 'sem_codigo' };
  var reg = await fbGet(RAIZ + '/codigo/' + codigo);
  if (!reg || !reg.cpf) return { ok: true, travado: false };
  return { ok: true, travado: true, confere: cpf.length === 11 && cpf === String(reg.cpf) };
}
async function status() {
  var cfg = await config(), usados = await quantosGerados();
  return { ok: true, ativo: cfg.ativo, limite: cfg.limite, usados: usados, restam: Math.max(0, cfg.limite - usados), pct: cfg.pct, dias: cfg.dias };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (!FB_SECRET) return resp(500, { ok: false, erro: 'falha', msg: 'Servidor sem configuração (FIREBASE_SECRET).' });
  try {
    if (event.httpMethod === 'GET') {
      var q = event.queryStringParameters || {};
      if (q.acao === 'status') return resp(200, await status());
      return resp(200, { ok: true, servico: 'cupom-vip2 v1' });
    }
    var body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return resp(400, { ok: false, erro: 'json' }); }
    if (body.acao === 'gerar') return resp(200, await gerar(body, Date.now()));
    if (body.acao === 'conferir') return resp(200, await conferir(body));
    if (body.acao === 'status') return resp(200, await status());
    return resp(400, { ok: false, erro: 'acao' });
  } catch (e) {
    console.error('[cupom-vip2] ' + (e && e.message || e));
    return resp(500, { ok: false, erro: 'falha', msg: 'Não consegui gerar agora. Tente de novo em alguns minutos.' });
  }
};
exports._lib = { cpfValido: cpfValido, gerar: gerar, conferir: conferir, status: status, docIdDoCpf: docIdDoCpf };
