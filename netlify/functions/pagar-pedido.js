'use strict';
/* =============================================================================
   pagar-pedido.js — PAGAR DEPOIS O PIX DE UM PEDIDO "AGUARDANDO PAGAMENTO" (VitaFlow)  ·  v1  ·  28/11/2026
   Pedido do Thiago (28/11): "quero que coloque uma opção para o cliente voltar e pagar a chave pix gerada para ele, pois hoje os pedidos
   'aguardando pagamento' ficam presos e o cliente não tem mais acesso". Decisões dele: o cliente volta pela Minha Conta, pela página de
   rastreio (busca pelo número) e por um aviso no carrinho; prazo de 72 h; se ele fizer um pedido novo, o cashback preso no pedido antigo
   volta para ele e o pedido antigo não pode mais ser pago.
   Netlify Function no repo vitaflow-proxy → netlify/functions/pagar-pedido.js · página: /pages/pagar-pedido?pedido=VF-…

   AÇÕES (POST JSON, CORS aberto):
     { acao:'info', pedido }  → { ok, situacao, pedido, valorCentavos, itens:[texto], data, prazo }  (sem nome, CPF, telefone nem endereço)
     { acao:'pix',  pedido }  → { ok, situacao:'aguardando', referencia, brCode, qrCodeBase64, expiraEm, valorCentavos } ou { ok, situacao:'pago' }
     { acao:'cartao', pedido } → { ok, url } — link da InfinitePay (cartão), igual ao do carrinho: handle vitafuel, 1 item "Suplemento Alimentar" com o
         VALOR da planilha, nome/e-mail/CPF da planilha (lidos aqui, nunca devolvidos). Interruptor do cartão desligado → { ok, situacao:'cartao_desligado' }.
         (Thiago, 28/11: "deve aparecer a chave pix ou o link de pagamento por cartão obviamente")
     info devolve também cartao:'infinitepay'|'desligado' (o mesmo interruptor do carrinho: função braspay ?modo=1).
   situacao: 'aguardando' (pode pagar) · 'pago' · 'vencido' (passou do prazo) · 'substituido' (o cashback voltou porque ele fez outro pedido)
             · 'cashback_devolvido' (a reserva do cashback já voltou para o saldo) · 'cancelado' · 'nao_encontrado' · 'nao_pode' (pedido que não
             é do site: manual, revendedor, Athena em aberto…)
   O VALOR do Pix é SEMPRE o da planilha (coluna VALOR do espelho vitaflow_pedidos) — a página nunca manda valor.
   O Pix é criado pela função braspay (a mesma do carrinho): se o Pix original ainda vale, volta o MESMO; se venceu, um novo (referência
   <pedido>~a<acaoId>, um por janela de 20 min, para não nascer um Pix por toque). Antes de criar, pergunta à Bras Pay se já foi pago.
   PRAZO: a planilha guarda só o DIA do pedido (coluna DATA) → pode pagar até o fim do 3º dia depois dele (72 h a 96 h).
   LÊ (Firebase, só leitura): vitaflow_pedidos_hdr · vitaflow_pedidos/<pedido> · vitaflow_cashback/usos/<cpf>/<pedido> · não grava nada
   Variáveis de ambiente (já existem no vitaflow-proxy): FIREBASE_SECRET.
   ============================================================================= */
var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var BRASPAY_URL = process.env.PAGAR_BRASPAY_URL || 'https://vitaflow-proxy.netlify.app/.netlify/functions/braspay';
var DIAS_PRAZO = 3;
var JANELA_PIX_MS = 20 * 60000;
var PIX_VALIDADE_SEG = 1800;
var INFINITEPAY_URL = process.env.PAGAR_INFINITEPAY_URL || 'https://vitaflow-proxy.netlify.app/.netlify/functions/infinitepay';
var WEBHOOK_INFINITEPAY = 'https://vitaflow-proxy.vitaflow-py.workers.dev';      /* = PROXY_URL do carrinho (Worker → Apps Script) */
var ATHENA_ABERTO = 'ATHENA (EM ABERTO)';
var CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
function resp(obj) { return { statusCode: 200, headers: CORS, body: JSON.stringify(obj) }; }

async function fbGet(caminho) {
  var r = await fetch(FB_BASE + '/' + caminho + '.json?auth=' + encodeURIComponent(process.env.FIREBASE_SECRET || ''));
  if (!r.ok) throw new Error('firebase ' + r.status);
  return r.json();
}
function chave(s) { return String(s || '').replace(/[.#$\[\]\/]/g, '_'); }
function up(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim(); }
function soDig(s) { return String(s || '').replace(/\D/g, ''); }
function cpf11(v) { var d = soDig(v); while (d.length < 11 && d.length >= 9) d = '0' + d; return d; }

/* número de pedido do site / da página de atacado: VF-DDMM-S###, VF-DDMM-W### (com o X da contingência: VF-DDMM-SX###) — = cashback.js */
function pedidoValido(p) { return /^VF-\d{4}-[SW]X?\d{1,5}$/.test(p); }

/* "1.234,56" · "1234.56" · 1234.56 → centavos */
function centavos(v) {
  if (typeof v === 'number') return Math.round(v * 100);
  var s = String(v || '').replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  var n = Number(s);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

/* DATA da planilha (dd/mm/aaaa, às vezes ISO) → fim do 3º dia depois, em ms (BRT) */
function prazoDe(data, agora) {
  var s = String(data || '').trim(), d = null, m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) d = Date.UTC(+m[3], +m[2] - 1, +m[1]);
  else { var t = Date.parse(s); if (!isNaN(t)) { var b = new Date(t - 3 * 3600000); d = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()); } }
  if (d === null) return 0;
  return d + (DIAS_PRAZO + 1) * 86400000 + 3 * 3600000 - 1;   /* 23:59:59 BRT do 3º dia depois */
}
function ddmmhh(ms) {
  var b = new Date(ms - 3 * 3600000);
  return ('0' + b.getUTCDate()).slice(-2) + '/' + ('0' + (b.getUTCMonth() + 1)).slice(-2) + ' às ' + ('0' + b.getUTCHours()).slice(-2) + ':' + ('0' + b.getUTCMinutes()).slice(-2);
}

/* itens para mostrar. PRODUTOS (GAS) = "Nome (R$ 1.234,00 un.) x2, Outro (R$ 50,00 un.) x1, Frete — SP — PAC (R$ 30,00 un.) x1":
   corta em ", " só depois de " xN", tira o preço unitário e o frete (o total vem à parte) */
function itensDe(txt) {
  return String(txt || '').split(/(?<=\sx\d{1,4}),\s+/).map(function (l) {
    var m = l.trim().match(/^(.*?)(?:\s*\(R\$\s*[\d.,]+\s*un\.\))?\s*x(\d{1,4})$/);
    return m ? (m[2] + 'x ' + m[1].trim()) : l.trim();
  }).filter(function (l) { return l && !/^\d+x\s+frete\b/i.test(l) && !/^frete\b/i.test(l) && l !== 'N/A'; }).slice(0, 30);
}

async function lerPedido(pedido, agora) {
  var lidos = await Promise.all([fbGet('vitaflow_pedidos_hdr'), fbGet('vitaflow_pedidos/' + chave(pedido))]);
  var hdr = lidos[0], row = lidos[1];
  if (!row || !row.length || !hdr || !hdr.length) return { situacao: 'nao_encontrado' };
  var I = {};
  hdr.forEach(function (h, i) { I[up(h)] = i; });
  function cel(nome, padrao) { var i = I[nome] !== undefined ? I[nome] : padrao; return row[i] == null ? '' : row[i]; }
  if (up(cel('PEDIDO', 0)) !== pedido) return { situacao: 'nao_encontrado' };
  var st = up(cel('STATUS', 5)), obs = up(cel('OBSERVACAO', 17));
  var p = { pedido: pedido, status: st, valorCentavos: centavos(cel('VALOR', 10)), itens: itensDe(cel('PRODUTOS', 4)), data: String(cel('DATA', 7)),
            cpf: cpf11(cel('CPF', 3)), prazo: prazoDe(cel('DATA', 7), agora),
            _nome: String(cel('NOME', 1)).trim(), _email: String(cel('EMAIL', 2)).trim().toLowerCase() };   /* _nome/_email: só para o link do cartão, nunca saem daqui */
  if (st.indexOf('CANCELAD') >= 0 || st.indexOf('REEMBOLSO') >= 0 || st.indexOf('ESTORN') >= 0) p.situacao = 'cancelado';
  else if (st.indexOf('AGUARDANDO PAGAMENTO') < 0) p.situacao = 'pago';
  else if (obs.indexOf(ATHENA_ABERTO) === 0) p.situacao = 'nao_pode';
  else if (!p.prazo || agora > p.prazo) p.situacao = 'vencido';
  else if (p.valorCentavos < 100) p.situacao = 'nao_pode';
  else p.situacao = 'aguardando';
  /* cashback: se a reserva deste pedido já voltou para o saldo, pagar agora daria o desconto duas vezes */
  if (p.situacao === 'aguardando' && p.cpf.length === 11) {
    var u = null;
    try { u = await fbGet('vitaflow_cashback/usos/' + p.cpf + '/' + chave(pedido)); } catch (e) { u = null; }
    if (u && u.status === 'liberado') p.situacao = (u.motivo === 'nova_reserva') ? 'substituido' : 'cashback_devolvido';
  }
  return p;
}

function publico(p) {
  var o = { ok: true, situacao: p.situacao, pedido: p.pedido };
  if (p.situacao === 'aguardando' || p.situacao === 'vencido' || p.situacao === 'substituido' || p.situacao === 'cashback_devolvido') {
    o.valorCentavos = p.valorCentavos; o.itens = p.itens; o.data = p.data;
    if (p.prazo) { o.prazo = p.prazo; o.prazoTexto = ddmmhh(p.prazo); }
  }
  return o;
}

async function braspay(metodo, sufixo, corpo) {
  var ctrl = new AbortController(), t = setTimeout(function () { ctrl.abort(); }, 14000);
  try {
    var r = await fetch(BRASPAY_URL + (sufixo || ''), { method: metodo, signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: corpo ? JSON.stringify(corpo) : undefined });
    return await r.json();
  } finally { clearTimeout(t); }
}

async function modoCartao() {
  try { var d = await braspay('GET', '?modo=1'); return (d && d.cartao === 'infinitepay') ? 'infinitepay' : 'desligado'; } catch (e) { return 'desligado'; }
}
async function gerarLinkCartao(p) {
  if ((await modoCartao()) !== 'infinitepay') return { ok: true, situacao: 'cartao_desligado', pedido: p.pedido };
  var email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p._email) ? p._email : 'contato@vitaflowoficial.com';
  var corpo = { handle: 'vitafuel', redirect_url: 'https://vitaflowoficial.com/pages/obrigado', webhook_url: WEBHOOK_INFINITEPAY, order_nsu: p.pedido,
    items: [{ quantity: 1, price: p.valorCentavos, description: 'Suplemento Alimentar' }],
    customer: { name: p._nome || 'Cliente VitaFlow', email: email, document: p.cpf.length === 11 ? p.cpf : undefined } };
  var ctrl = new AbortController(), t = setTimeout(function () { ctrl.abort(); }, 15000);
  try {
    var r = await fetch(INFINITEPAY_URL, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corpo) });
    var d = await r.json();
    var url = d && (d.url || d.checkout_url || d.link);
    if (!url || !/^https:\/\//.test(String(url))) return { ok: false, erro: 'link_nao_gerado' };
    return { ok: true, situacao: 'aguardando', pedido: p.pedido, url: String(url) };
  } finally { clearTimeout(t); }
}

async function gerarPix(p, agora) {
  var st = await braspay('GET', '?ref=' + encodeURIComponent(p.pedido));
  if (st && st.ok && st.status === 'pago') return { ok: true, situacao: 'pago', pedido: p.pedido };
  var base = { acao: 'criar', referencia: p.pedido, valorCentavos: p.valorCentavos, descricao: 'Pedido ' + p.pedido, expiraEmSegundos: PIX_VALIDADE_SEG };
  var exp = st && st.ok ? Date.parse(st.expiraEm || '') : NaN;
  var c = null;
  if (st && st.ok && st.status === 'pendente' && !isNaN(exp) && exp - agora > 120000) {
    c = await braspay('POST', '', base);                                   /* o Pix original ainda vale: a Bras Pay devolve o MESMO */
  }
  if (!c || !c.ok) {
    var jan = Math.floor(agora / JANELA_PIX_MS).toString(36);
    for (var i = 0; i < 2 && !(c && c.ok); i++) {
      var acaoId = ('pg' + jan + (i ? 'b' : '')).toLowerCase();
      c = await braspay('POST', '', Object.assign({}, base, { nova: true, acaoId: acaoId }));
      if (c && !c.ok && c.erro === 'acao_em_conflito') {
        var s2 = await braspay('GET', '?ref=' + encodeURIComponent(p.pedido + '~a' + acaoId));
        if (s2 && s2.ok && s2.status === 'pago') return { ok: true, situacao: 'pago', pedido: p.pedido };
      }
    }
  }
  if (!c || !c.ok || !c.brCode) return { ok: false, erro: 'pix_nao_gerado', detalhe: c && c.erro ? String(c.erro).slice(0, 80) : '' };
  return { ok: true, situacao: 'aguardando', pedido: p.pedido, referencia: c.referencia, brCode: c.brCode, qrCodeBase64: c.qrCodeBase64 || '',
           expiraEm: c.expiraEm || '', valorCentavos: Number(c.valorCentavos || p.valorCentavos) };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return resp({ ok: true, servico: 'pagar-pedido v1' });
  var b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return resp({ ok: false, erro: 'json' }); }
  var pedido = String(b.pedido || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!pedidoValido(pedido)) return resp({ ok: true, situacao: 'nao_encontrado', pedido: pedido.slice(0, 20) });
  var agora = Date.now(), p;
  try { p = await lerPedido(pedido, agora); } catch (e) { return resp({ ok: false, erro: 'sem_resposta' }); }
  p.pedido = pedido;
  if (b.acao === 'cartao') {
    if (p.situacao !== 'aguardando') return resp(publico(p));
    try { return resp(await gerarLinkCartao(p)); } catch (e) { return resp({ ok: false, erro: 'link_nao_gerado' }); }
  }
  if (b.acao === 'pix') {
    if (p.situacao !== 'aguardando') return resp(publico(p));
    try { return resp(await gerarPix(p, agora)); } catch (e) { return resp({ ok: false, erro: 'pix_nao_gerado' }); }
  }
  var o = publico(p);
  if (p.situacao === 'aguardando') o.cartao = await modoCartao();
  return resp(o);
};

exports._t = { centavos: centavos, prazoDe: prazoDe, itensDe: itensDe, pedidoValido: pedidoValido, lerPedido: lerPedido, gerarPix: gerarPix, gerarLinkCartao: gerarLinkCartao };
