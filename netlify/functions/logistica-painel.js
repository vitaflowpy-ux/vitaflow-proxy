'use strict';
/* =============================================================================
   logistica-painel.js — DADOS DO PAINEL DA LOGÍSTICA (VitaFlow)  ·  v3  ·  01/10/2026
   v3 (Thiago, 01/10 — férias da Ana Clara): RODADA DE CÓDIGOS + PACOTES.
       · codigos_pendentes / codigos_ticket / codigos_fila / codigos_entrada / codigos_casar / codigos_aplicar / codigos_ignorar:
         o Claude lê o site do Daniel (códigos, CPF do cliente e ORIGEM MS/SP) e a Onlog (por CPF: AA + código real da
         transportadora) no navegador do Thiago e manda pra cá; aqui os códigos são casados com os pedidos SEM código e os
         CERTOS (1 código × 1 pedido do mesmo CPF) são gravados pelo Apps Script (action aplicar_codigos do GAS v53, com as
         travas do Rastreamento: nunca sobrescreve, recusa código repetido). O que não é certo vira DÚVIDA na aba Códigos.
         Entrega do Daniel por MOTOBOY (SP): a palavra MOTOBOY vai pra planilha no lugar do código (pedido do Thiago).
       · email_pacotes: e-mail "seu pedido vai em N pacotes" (o Compras chama quando TODOS os fornecedores foram comprados).
         Diz o que vai em cada pacote e de onde sai. Nunca o nome do fornecedor. Revendedor (V) não recebe.
       · atrasos: a linha D (pacote, coluna PEDIDO_ORIGINAL) continua na lista de cobrança, mas o e-mail de atraso sai UM por
         pedido (o contador é o do pedido original) — com texto próprio quando só um dos pacotes está atrasado.
   v2 (Thiago, 01/10): PEDIDO DE REVENDEDOR (prefixo V, ex. VF-2309-V002) NÃO RECEBE E-MAIL NOSSO — mesma regra do
       e-mail de compra e do de recompra no GAS. Continua na lista de atrasados (pra cobrar o fornecedor), marcado
       'revendedor: true', mas o decidirEnvio devolve null (nem 1º aviso nem lembrete) e o e-mail de teste nunca
       usa pedido V como exemplo. A logistica-atrasos.js usa este mesmo decidirEnvio.
   Netlify Function no repo vitaflow-proxy → netlify/functions/logistica-painel.js
   URL: https://vitaflow-proxy.netlify.app/.netlify/functions/logistica-painel

   O QUE FAZ (pedido do Thiago, 01/10: itens 4 e 5 do plano da logística)
     acao 'numeros' — NÚMEROS DA LOGÍSTICA: por estado (pago → entregue), por transportadora (postado → entregue +
                      ocorrências), por fornecedor (pago → postado) e a tendência mês a mês. Só agregados.
     acao 'atrasos' — pedidos PAGOS que passaram do prazo de POSTAGEM e ainda não foram postados (lista de cobrança
                      por fornecedor) + quantos e-mails de atraso cada cliente já recebeu.
     acao 'enviar_teste' — manda o e-mail de atraso (1º aviso, com os dados do 1º pedido atrasado) para o e-mail de
                      teste da configuração. Não conta como envio.
     GET ?defaults=1 — textos padrão do e-mail de atraso (sem login), pro painel mostrar na aba Textos.
     (v3) acao 'codigos_*' e 'email_pacotes' — ver o bloco "v3" mais abaixo.

   QUEM PODE: só admin. O painel manda o idToken do Firebase Auth; aqui ele é conferido lendo admins/<uid> com o
   próprio token (o Firebase recusa token falso/vencido) — o mesmo teste que o painel faz no login.
   (v3) codigos_fila e codigos_entrada aceitam um TICKET de 30 min (criado por um admin em codigos_ticket) — é o que a aba
   do Daniel / da Onlog usa pra mandar os dados sem ter o login do painel. email_pacotes aceita a chave do Compras
   (variável COMPRAS_KEY) ou o login de admin.

   O PRAZO É O MESMO DO RASTREIO: usa a tabela PRAZOS_ENTREGA e os dias úteis (feriados) da rastreio-consulta v3.
   Mudou o prazo → muda lá (e no GAS) — este arquivo não tem número de prazo próprio.

   LÊ: vitaflow_pedidos_hdr · vitaflow_pedidos · vitaflow_historico_status · vitaflow_sync/rastreio_eventos/<k>
       vitaflow_sync/logistica/{config,textos,email_atraso}
   GRAVA: (v3) vitaflow_sync/logistica/codigos/{ticket,entrada,rodada_atual,ultima,rodadas,ignorados} e
          vitaflow_sync/logistica/{email_pacotes,email_pacotes_fila}. O e-mail de ATRASO de verdade continua na logistica-atrasos.js.
          A PLANILHA só é alterada pelo Apps Script (aplicar_codigos).
   Variáveis de ambiente: FIREBASE_SECRET · BREVO_API_KEY · COMPRAS_KEY (as três já existem no site vitaflow-proxy).
   ============================================================================= */
var R = require('./rastreio-consulta.js').lib;

var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var RAIZ = 'vitaflow_sync/logistica';
var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};
var LOGO = 'https://cdn.shopify.com/s/files/1/0777/9762/1945/files/vitaflow_no_bg_pro.png?v=1775266917';
var RASTREIO_URL = 'https://vitaflowoficial.com/pages/rastrear-pedido';
var DIA = 86400000;

function resp(obj, code) { return { statusCode: code || 200, headers: CORS, body: JSON.stringify(obj) }; }

/* ============================ textos do e-mail (editáveis no painel) ============================ */
var EMAIL_PADRAO = {
  email_atraso_assunto: 'Seu pedido {PEDIDO} ainda está em separação',
  email_atraso_1:
    'Olá, {NOME}!\n\n' +
    'Seu pedido {PEDIDO}, confirmado em {DATA}, ainda está em separação no estoque e passou do prazo de postagem que informamos (até {PRAZO_POSTAGEM} dias úteis). Pedimos desculpas pela espera.\n\n' +
    'Nossa equipe está acompanhando o seu pedido junto ao estoque. Assim que ele for postado, o código de rastreio aparece na página de rastreio.\n\n' +
    'Acompanhe em vitaflowoficial.com/pages/rastrear-pedido (use o número do pedido, o CPF ou o e-mail).\n\n' +
    'Se precisar, fale com a nossa logística pelo WhatsApp +44 7537 155718.\n\n' +
    'Equipe VitaFlow',
  email_atraso_lembrete:
    'Olá, {NOME}!\n\n' +
    'Seu pedido {PEDIDO} continua em separação no estoque ({DIAS} dias úteis desde a confirmação). Seguimos acompanhando e cobrando o envio.\n\n' +
    'Assim que ele for postado, o código de rastreio aparece em vitaflowoficial.com/pages/rastrear-pedido.\n\n' +
    'Se precisar, fale com a nossa logística pelo WhatsApp +44 7537 155718.\n\n' +
    'Equipe VitaFlow',
  /* v3: o pedido foi dividido em pacotes e só UM (ou alguns) está atrasado */
  email_atraso_pacote_1:
    'Olá, {NOME}!\n\n' +
    'Um dos pacotes do seu pedido {PEDIDO}, confirmado em {DATA}, ainda está em separação no estoque e passou do prazo de postagem que informamos (até {PRAZO_POSTAGEM} dias úteis). Pedimos desculpas pela espera.\n\n' +
    'Nossa equipe está acompanhando esse pacote junto ao estoque. Assim que ele for postado, o rastreio dele aparece na página de rastreio.\n\n' +
    'Acompanhe em vitaflowoficial.com/pages/rastrear-pedido (use o número do pedido, o CPF ou o e-mail).\n\n' +
    'Se precisar, fale com a nossa logística pelo WhatsApp +44 7537 155718.\n\n' +
    'Equipe VitaFlow',
  email_atraso_pacote_lembrete:
    'Olá, {NOME}!\n\n' +
    'Um dos pacotes do seu pedido {PEDIDO} continua em separação no estoque ({DIAS} dias úteis desde a confirmação). Seguimos acompanhando e cobrando o envio.\n\n' +
    'Assim que ele for postado, o rastreio dele aparece em vitaflowoficial.com/pages/rastrear-pedido.\n\n' +
    'Se precisar, fale com a nossa logística pelo WhatsApp +44 7537 155718.\n\n' +
    'Equipe VitaFlow',
  /* v3: e-mail "seu pedido vai em N pacotes" ({PACOTES} = a lista dos pacotes, montada pelo sistema) */
  email_pacotes_assunto: 'Seu pedido {PEDIDO} será enviado em {N} pacotes',
  email_pacotes_texto:
    'Olá, {NOME}!\n\n' +
    'Seu pedido {PEDIDO} será enviado em {N} pacotes, porque os produtos saem de centros de distribuição diferentes. Cada pacote tem o seu próprio rastreio e pode chegar em um dia diferente.\n\n' +
    '{PACOTES}\n\n' +
    'Acompanhe cada pacote em vitaflowoficial.com/pages/rastrear-pedido (use o número do pedido, o CPF ou o e-mail).\n\n' +
    'Se precisar, fale com a nossa logística pelo WhatsApp +44 7537 155718.\n\n' +
    'Equipe VitaFlow'
};
var EMAIL_CFG_PADRAO = { email_atraso_modo: 'desligado', email_atraso_max: 3, email_atraso_intervalo_du: 3, email_atraso_janela_dias: 45,
  email_pacotes_modo: 'ligado', codigos_janela_dias: 45, codigos_duvida_dias: 15 };   /* v3 */

function preencher(t, v) { return String(t || '').replace(/\{([A-Z_]+)\}/g, function (a, k) { return (v[k] != null) ? String(v[k]) : a; }); }
function escH(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* texto → HTML no padrão do e-mail "Pedido confirmado" (fundo cinza, cartão branco, logo no topo) */
function htmlEmail(texto) {
  var pars = String(texto || '').split(/\n{2,}/).map(function (p) {
    var h = escH(p).replace(/\n/g, '<br>').replace(/vitaflowoficial\.com\/pages\/rastrear-pedido/g,
      '<a href="' + RASTREIO_URL + '" style="color:#0280CD;font-weight:700">vitaflowoficial.com/pages/rastrear-pedido</a>');
    h = h.replace(/^(Pacote \d+[^<]*)/, '<b style="color:#0D1B2E">$1</b>');   /* v3: título de cada pacote */
    return '<p style="margin:0 0 14px;font-size:15px;color:#41506a;line-height:1.65">' + h + '</p>';
  }).join('');
  return '<div style="background:#eceff3;padding:20px 10px;font-family:Arial,Helvetica,sans-serif">' +
    '<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden">' +
    '<tr><td style="background:#0D1B2E;padding:24px 20px 20px;text-align:center">' +
    '<div style="height:4px;width:52px;margin:0 auto 14px;background:#F5A623;border-radius:2px"></div>' +
    '<img src="' + LOGO + '" alt="VitaFlow" width="170" style="display:inline-block;width:170px;max-width:60%;height:auto;border:0"></td></tr>' +
    '<tr><td style="padding:26px 22px 10px">' + pars + '</td></tr>' +
    '<tr><td style="padding:0 22px 24px"><a href="' + RASTREIO_URL + '" style="display:block;text-align:center;background:#F5A623;color:#0D1B2E;text-decoration:none;font-size:16px;font-weight:800;padding:15px 10px;border-radius:10px">&#128269; Rastrear pedido</a></td></tr>' +
    '</table></div>';
}

/* Brevo (API transacional) — a mesma conta/remetente do Apps Script */
async function enviarBrevo(para, nome, assunto, texto) {
  var chave = process.env.BREVO_API_KEY || '';
  if (!chave) return { ok: false, erro: 'falta a variável BREVO_API_KEY no Netlify' };
  try {
    var r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': chave, 'accept': 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'VitaFlow', email: 'contato@vitaflowoficial.com' },
        to: [{ email: para, name: nome || undefined }], subject: assunto, htmlContent: htmlEmail(texto), textContent: texto })
    });
    if (r.status >= 200 && r.status < 300) return { ok: true };
    return { ok: false, erro: 'Brevo HTTP ' + r.status + ' ' + String(await r.text()).slice(0, 200) };
  } catch (e) { return { ok: false, erro: 'Brevo: ' + e.message }; }
}

/* ============================ leitura dos pedidos ============================ */
var EXCECAO = { 'ENCAMINHADO PARA FISCALIZACAO': 1, 'DESTINATARIO AUSENTE': 1, 'ENDERECO INCORRETO': 1,
  'AREA COM DISTRIBUICAO': 1, 'PEDIDO EXTRAVIADO': 1, 'PEDIDO APREENDIDO': 1 };
var FINAL = { 'PEDIDO CANCELADO': 1, 'REEMBOLSO REALIZADO': 1 };
var ANTES_DE_POSTAR = { 'PEDIDO CONFIRMADO': 1, 'PAGO': 1, 'EM SEPARACAO': 1, 'DESPACHADO': 1 };

function transpNome(t) {
  var u = R.semAcentoUp(t);
  if (!u) return 'Sem transportadora';
  if (u.indexOf('J&T') >= 0 || /\bJT\b/.test(u) || u.indexOf('J T') >= 0) return 'J&T';
  if (u.indexOf('JADLOG') >= 0) return 'Jadlog';
  if (u.indexOf('LOGGI') >= 0) return 'Loggi';
  if (u.indexOf('TOTAL') >= 0) return 'Total Express';
  if (u.indexOf('SHOPEE') >= 0 || u.indexOf('SPX') >= 0) return 'Shopee';
  if (u.indexOf('CORREIO') >= 0 || u.indexOf('PAC') >= 0 || u.indexOf('SEDEX') >= 0) return 'Correios';
  return String(t).trim();
}
/* 1º fornecedor da coluna COMPRADO_FORNECEDORES ("Daniel MS | Respect" → Daniel) */
function fornNome(f) {
  var u = R.semAcentoUp(String(f || '').split(/\||\n|,/)[0]);
  if (!u) return 'Sem fornecedor';
  if (u.indexOf('DANIEL') >= 0) return 'Daniel';
  if (u.indexOf('RESPECT') >= 0) return 'Respect';
  if (u.indexOf('GEOVANNA') >= 0) return 'Geovanna';
  if (u.indexOf('CAMILA') >= 0) return 'Camila (atacado)';
  if (u.replace(/[^A-Z]/g, '').indexOf('VITAFLOW') === 0) return 'VitaFlow';
  if (u.indexOf('ROGER') >= 0) return 'Roger';
  var w = u.split(/\s+/)[0];
  return w.charAt(0) + w.slice(1).toLowerCase();
}

async function lerBase(comEmails) {
  var lidos = await Promise.all([
    R.fbGet('vitaflow_pedidos_hdr'), R.fbGet('vitaflow_pedidos'), R.fbGet('vitaflow_historico_status'),
    R.fbGetOu(RAIZ + '/config'), R.fbGetOu(RAIZ + '/textos'), comEmails ? R.fbGetOu(RAIZ + '/email_atraso') : Promise.resolve(null)
  ]);
  return { hdr: lidos[0] || [], esp: lidos[1] || {}, hist: lidos[2] || {}, cfg: lidos[3] || {}, txt: lidos[4] || {}, env: lidos[5] || {} };
}

/* um pedido do espelho → dados de tempo (ts em ms) */
function montarPedidos(base) {
  var hd = (base.hdr || []).map(function (h) { return String(h || '').trim().toUpperCase(); });
  var cT = hd.indexOf('TRANSPORTADORA'), cR = hd.indexOf('CODIGO_RASTREIO'); if (cR < 0) cR = hd.indexOf('CODIGO RASTREIO');
  var cF = hd.indexOf('COMPRADO_FORNECEDORES');
  var cE = { orig: hd.indexOf('ORIGEM'), pai: hd.indexOf('PEDIDO_ORIGINAL') }, cO = hd.indexOf('CODIGO_ONLOG');   /* v3 */
  var out = [];
  Object.keys(base.esp).forEach(function (k) {
    var l = base.esp[k];
    if (!l || typeof l !== 'object' || !l[0]) return;
    var b = R.baseDaLinha(l, cT, cR, cF, cE);
    var st = R.semAcentoUp(b.status);
    var objH = base.hist[R.histKey(b.pedido)] || null, evs = [];
    if (objH && typeof objH === 'object') {
      evs = Object.keys(objH).map(function (x) { return objH[x]; }).filter(function (e) { return e && e.status && e.ts; })
        .sort(function (a, z) { return a.ts - z.ts; });
    }
    var tConf = 0, tPost = 0, tEnt = 0, oco = false, extr = false, apre = false;
    evs.forEach(function (e) {
      var su = R.semAcentoUp(e.status), o = R.ETAPA_ORDEM.hasOwnProperty(su) ? R.ETAPA_ORDEM[su] : -1;
      if (!tConf && su.indexOf('CONFIRMADO') >= 0) tConf = e.ts;
      if (!tPost && o >= 4) tPost = e.ts;
      if (!tEnt && su === 'ENTREGUE') tEnt = e.ts;
      if (EXCECAO[su]) oco = true;
      if (su === 'PEDIDO EXTRAVIADO') extr = true;
      if (su === 'PEDIDO APREENDIDO') apre = true;
    });
    if (EXCECAO[st]) oco = true;
    if (st === 'PEDIDO EXTRAVIADO') extr = true;
    if (st === 'PEDIDO APREENDIDO') apre = true;
    if (!tConf) { var md = String(b.data || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (md) tConf = new Date(md[3] + '-' + md[2] + '-' + md[1] + 'T12:00:00-03:00').getTime(); }
    var atacado = /VF-\d{4}-W/i.test(b.pedido) || R.semAcentoUp(b._forn).indexOf('CAMILA') >= 0;
    out.push({ k: R.histKey(b.pedido), pedido: b.pedido, nome: b.nome, email: String(l[2] || '').trim(), uf: b.estado, cidade: b.cidade,
      status: b.status, st: st, naoPagou: R.naoPagou(b.status, l[12]), final: !!FINAL[st], data: b.data,
      transp: transpNome(b.transportadora), transpTxt: b.transportadora, codigo: b._rast, forn: fornNome(b._forn), fornTxt: b._forn,
      atacado: atacado, tConf: tConf, tPost: tPost, tEnt: tEnt, oco: oco, extr: extr, apre: apre,
      /* v3: o que a rodada de códigos e os pacotes usam */
      cpf: cpf11(l[3]), cep: cepDe(l[8]), pai: b._pai, origCol: b._orig, produtos: b.produtos,
      cod: (String(b._rast || '').toUpperCase().indexOf('AVISO_ABANDONO') >= 0) ? '' : limparCod(b._rast),
      onlog: limparCod(cO >= 0 ? l[cO] : ''), fams: linhasForn(b._forn).map(familia).filter(function (f, i, a) { return f && a.indexOf(f) === i; }) });
  });
  return out;
}

function faixaUF(uf) {
  var P = R.PRAZOS_ENTREGA;
  return (P.estados && P.estados[uf]) || P.regioes[R.UF_REGIAO[uf] || ''] || null;
}
function postDU(p) { return p.atacado ? R.PRAZOS_ENTREGA.atacado_postagem_du : R.PRAZOS_ENTREGA.varejo_postagem_du; }

/* ============================ NÚMEROS ============================ */
function estat(arr) {
  if (!arr.length) return { n: 0 };
  var s = arr.slice().sort(function (a, b) { return a - b; });
  var q = function (p) { return s[Math.max(0, Math.ceil(p * s.length) - 1)]; };
  return { n: s.length, mediana: q(0.5), p90: q(0.9) };
}
function pct(a, b) { return b ? Math.round(1000 * a / b) / 10 : null; }
function mesBR(ts) { return R.diaBR(ts).slice(0, 7); }

function calcularNumeros(peds, dias, agora) {
  agora = agora || Date.now();
  var ini = agora - dias * DIA;
  var validos = peds.filter(function (p) { return !p.naoPagou && !p.final && p.tConf; });
  var noPeriodo = validos.filter(function (p) { return p.tConf >= ini && p.tConf <= agora; });

  var G = { uf: {}, tr: {}, fo: {} };
  function g(tab, chave) { return tab[chave] || (tab[chave] = { dias: [], noPrazo: 0, base: 0, total: 0, oco: 0, extr: 0, apre: 0 }); }
  var postT = [], entT = [], totalNoPrazo = 0, totalEnt = 0;
  noPeriodo.forEach(function (p) {
    var fx = faixaUF(p.uf), pd = postDU(p);
    var dPost = (p.tPost && p.tPost >= p.tConf) ? R.duEntre(p.tConf, p.tPost) : null;
    var dEnt = (p.tEnt && p.tPost && p.tEnt >= p.tPost) ? R.duEntre(p.tPost, p.tEnt) : null;
    var dTot = (p.tEnt && p.tEnt >= p.tConf) ? R.duEntre(p.tConf, p.tEnt) : null;
    /* estado: pago → entregue */
    if (p.uf) {
      var a = g(G.uf, p.uf); a.total++;
      if (dTot != null) { a.dias.push(dTot); a.base++; if (fx && dTot <= pd + fx[1]) a.noPrazo++; }
    }
    /* transportadora: postado → entregue + ocorrências */
    if (p.tPost || p.transp !== 'Sem transportadora') {
      var t = g(G.tr, p.transp); t.total++;
      if (p.oco) t.oco++; if (p.extr) t.extr++; if (p.apre) t.apre++;
      if (dEnt != null) { t.dias.push(dEnt); t.base++; if (fx && dEnt <= fx[1]) t.noPrazo++; }
    }
    /* fornecedor: pago → postado */
    var f = g(G.fo, p.forn); f.total++;
    if (dPost != null) { f.dias.push(dPost); f.base++; if (dPost <= pd) f.noPrazo++; }
    if (dPost != null) postT.push(dPost);
    if (dTot != null) { entT.push(dTot); totalEnt++; if (fx && dTot <= pd + fx[1]) totalNoPrazo++; }
  });
  function lista(tab, extra) {
    return Object.keys(tab).map(function (k) {
      var x = tab[k], e = estat(x.dias), o = { nome: k, pedidos: x.total, base: x.base, mediana: e.mediana, p90: e.p90, no_prazo_pct: pct(x.noPrazo, x.base) };
      if (extra) { o.ocorrencias = x.oco; o.ocorrencias_pct = pct(x.oco, x.total); o.extravios = x.extr; o.apreensoes = x.apre; }
      return o;
    }).sort(function (a, b) { return b.pedidos - a.pedidos; });
  }
  var porUF = lista(G.uf).map(function (o) { var fx = faixaUF(o.nome); o.prazo_entrega = fx ? fx[0] + ' a ' + fx[1] : ''; return o; });

  /* tendência: últimos 6 meses (mês da confirmação) */
  var meses = [], d0 = new Date(agora);
  for (var i = 5; i >= 0; i--) {
    var dm = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - i, 15));
    meses.push(dm.getUTCFullYear() + '-' + ('0' + (dm.getUTCMonth() + 1)).slice(-2));
  }
  var M = {}; meses.forEach(function (m) { M[m] = { ped: 0, post: [], tot: [], noPrazo: 0, baseEnt: 0, oco: 0 }; });
  validos.forEach(function (p) {
    var m = M[mesBR(p.tConf)]; if (!m) return;
    var fx = faixaUF(p.uf), pd = postDU(p);
    m.ped++; if (p.oco) m.oco++;
    if (p.tPost && p.tPost >= p.tConf) m.post.push(R.duEntre(p.tConf, p.tPost));
    if (p.tEnt && p.tEnt >= p.tConf) { var dt = R.duEntre(p.tConf, p.tEnt); m.tot.push(dt); m.baseEnt++; if (fx && dt <= pd + fx[1]) m.noPrazo++; }
  });
  var mensal = meses.map(function (k) {
    var m = M[k];
    return { mes: k, pedidos: m.ped, mediana_postagem: estat(m.post).mediana, mediana_total: estat(m.tot).mediana,
      entregues: m.baseEnt, no_prazo_pct: pct(m.noPrazo, m.baseEnt), ocorrencias_pct: pct(m.oco, m.ped) };
  });

  var eP = estat(postT), eT = estat(entT);
  return {
    periodo_dias: dias, gerado_ts: agora,
    resumo: { pedidos: noPeriodo.length, postados: postT.length, entregues: totalEnt,
      mediana_postagem: eP.mediana, p90_postagem: eP.p90, mediana_total: eT.mediana, p90_total: eT.p90,
      no_prazo_pct: pct(totalNoPrazo, totalEnt) },
    por_uf: porUF, por_transportadora: lista(G.tr, true), por_fornecedor: lista(G.fo), mensal: mensal,
    prazos: { postagem_varejo: R.PRAZOS_ENTREGA.varejo_postagem_du, postagem_atacado: R.PRAZOS_ENTREGA.atacado_postagem_du }
  };
}

/* ============================ ATRASOS NA POSTAGEM ============================ */
async function calcularAtrasos(base, peds, agora) {
  agora = agora || Date.now();
  var cfg = Object.assign({}, EMAIL_CFG_PADRAO, base.cfg || {});
  var janela = Math.max(7, Number(cfg.email_atraso_janela_dias) || 45);
  var cand = peds.filter(function (p) {
    return ANTES_DE_POSTAR[p.st] && !p.naoPagou && p.tConf && !p.tPost && p.tConf >= agora - janela * DIA &&
      R.duEntre(p.tConf, agora) > postDU(p);
  });
  /* leitura real da transportadora = já foi postado (o status da planilha só não andou) */
  var evos = await Promise.all(cand.map(function (p) { return R.fbGetOu('vitaflow_sync/rastreio_eventos/' + p.k); }));
  /* v3: família = o pedido + as linhas D dele (PEDIDO_ORIGINAL). Quantas linhas pagas cada família tem. */
  var famTotal = {};
  peds.forEach(function (p) { if (!p.naoPagou && !p.final) { var kf0 = R.histKey(p.pai || p.pedido); famTotal[kf0] = (famTotal[kf0] || 0) + 1; } });
  var lista = [];
  cand.forEach(function (p, i) {
    var evo = evos[i];
    if (evo && evo.cod && p.codigo && String(evo.cod).replace(/\.0$/, '') !== String(p.codigo).replace(/\.0$/, '')) evo = null;
    if (evo && evo.primeira) return;
    var kf = R.histKey(p.pai || p.pedido);
    var pd = postDU(p), dias = R.duEntre(p.tConf, agora), env = (base.env || {})[kf] || {};
    lista.push({ k: p.k, k_email: kf, pedido_email: p.pai || p.pedido, pacote_de: p.pai || '', pedido: p.pedido, nome: p.nome, email: p.email, uf: p.uf, cidade: p.cidade, data: p.data, status: p.status,
      fornecedor: p.forn, fornecedor_txt: p.fornTxt, transportadora: p.transpTxt, codigo: p.codigo, atacado: p.atacado,
      dias: dias, prazo_postagem: pd, postagem_ate: R.ddmm(R.somaDU(p.tConf, pd)), conf_ts: p.tConf,
      emails: Number(env.n) || 0, email_ultimo: Number(env.ultimo) || 0, revendedor: ehRevendedor(p.pai || p.pedido) });
  });
  /* v3: o e-mail sai UM por família — o "líder" é o pedido original (se estiver atrasado), senão a 1ª linha D atrasada.
     parcial = a família tem pacote que NÃO está atrasado (já postado ou ainda no prazo) → texto "um dos pacotes". */
  var porFam = {};
  lista.forEach(function (a) { (porFam[a.k_email] = porFam[a.k_email] || []).push(a); });
  Object.keys(porFam).forEach(function (kf) {
    var g = porFam[kf], lider = g.filter(function (a) { return !a.pacote_de; })[0] || g.slice().sort(function (x, y) { return x.pedido < y.pedido ? -1 : 1; })[0];
    g.forEach(function (a) { a.lider = (a === lider); a.parcial = (famTotal[kf] || 0) > g.length; });
  });
  lista.sort(function (a, b) { return b.dias - a.dias; });
  return lista;
}

/* v2: pedido de REVENDEDOR = letra V depois da data (VF-DDMM-V###, VF-DDMM-VX…). Revendedor NÃO recebe e-mail nosso. */
function ehRevendedor(pedido) { return /^VF-\d{4}-V/i.test(String(pedido || '').trim()); }

/* quem recebe e-mail hoje (1º aviso ou lembrete) */
function decidirEnvio(a, cfg, agora) {
  if (ehRevendedor(a.pedido_email || a.pedido)) return null;   /* v2: revendedor nunca recebe */
  if (a.lider === false) return null;        /* v3: outro pacote do mesmo pedido já responde pelo e-mail */
  var max = Math.max(1, Number(cfg.email_atraso_max) || 3), inter = Math.max(1, Number(cfg.email_atraso_intervalo_du) || 3);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(a.email || ''))) return null;
  if (!a.emails) return 'primeiro';
  if (a.emails >= max) return null;
  if (a.email_ultimo && R.duEntre(a.email_ultimo, agora) >= inter) return 'lembrete';
  return null;
}
function montarEmail(a, tipo, txt) {
  var T = Object.assign({}, EMAIL_PADRAO);
  Object.keys(EMAIL_PADRAO).forEach(function (k) { if (txt && txt[k] && String(txt[k]).trim()) T[k] = String(txt[k]); });
  var v = { NOME: String(a.nome || '').split(' ')[0] || 'cliente', PEDIDO: a.pedido_email || a.pedido, DATA: a.data, DIAS: a.dias, PRAZO_POSTAGEM: a.prazo_postagem };
  var corpo = a.parcial ? (tipo === 'lembrete' ? T.email_atraso_pacote_lembrete : T.email_atraso_pacote_1)
                        : (tipo === 'lembrete' ? T.email_atraso_lembrete : T.email_atraso_1);
  return { assunto: preencher(T.email_atraso_assunto, v), texto: preencher(corpo, v) };
}


/* =====================================================================================================================
   v3 (01/10/2026) — RODADA DE CÓDIGOS (Daniel + Onlog) · E-MAIL "SEU PEDIDO VAI EM N PACOTES" · ATRASO COM PACOTES
   ===================================================================================================================== */
var crypto = require('crypto');
var GAS_URL = 'https://script.google.com/macros/s/AKfycbxFlaN0FXFbpcC8HZ80sxnq383m5d-xTaj5cg72VcCdnYx47N_qKkiELFN5KAPmm_nb/exec';
var COD = RAIZ + '/codigos';
var LOTE_GAS = 15;                 /* itens por chamada ao Apps Script (cada um grava e espelha: ~1 s) */
var ENTRADA_VALE_MS = 60 * 60000;  /* o que veio do site do Daniel / da Onlog vale 1 h */
var TICKET_VALE_MS = 30 * 60000;
var MAX_DIAS_PAR = 20;             /* código criado até 20 dias depois da confirmação do pedido */
var ORIGEM_NOME = { SP: 'São Paulo/SP', MS: 'Ponta Porã/MS', RJ: 'Rio de Janeiro/RJ', PY: 'Ciudad del Este (Paraguai)' };

/* ---- Firebase com escrita (o R.fbGet só lê) ---- */
function fbUrlW(caminho, query) {
  return FB_BASE + '/' + caminho + '.json?auth=' + encodeURIComponent(process.env.FIREBASE_SECRET || '') + (query ? '&' + query : '');
}
async function fbReq(metodo, caminho, corpo, query) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, 8000);
  try {
    var op = { method: metodo, signal: ctrl.signal };
    if (corpo !== undefined) { op.headers = { 'Content-Type': 'application/json' }; op.body = JSON.stringify(corpo); }
    var r = await fetch(fbUrlW(caminho, query), op);
    if (!r.ok) throw new Error('firebase ' + metodo + ' ' + r.status + ' ' + caminho);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function fbLerOu(caminho, query) { try { return await fbReq('GET', caminho, undefined, query); } catch (e) { return null; } }

/* ---- helpers ---- */
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function cpf11(v) { var d = String(v == null ? '' : v).replace(/\D/g, ''); return d.length === 10 ? '0' + d : d; }
function cepDe(txt) { var m = String(txt || '').match(/\d{5}-?\d{3}(?!\d)/g); return m ? m[m.length - 1].replace('-', '') : ''; }
function limparCod(c) {
  c = String(c == null ? '' : c).trim();
  if (/^\d+\.0+$/.test(c)) c = c.replace(/\.0+$/, '');
  return c.replace(/\s+/g, '').toUpperCase();
}
/* MOTOBOY (Thiago, 01/10): o Daniel faz algumas entregas em SP por motoboy. No site dele o "código" vem escrito MOTOBOY —
   essa palavra vai pra planilha NO LUGAR do código. Não é única (vários pedidos podem ter) e não tem transportadora. */
var MOTOBOY = 'MOTOBOY';
/* código de rastreio de verdade: só letras e números, 8 a 34 caracteres, com pelo menos 6 dígitos */
function codigoValido(c) { c = limparCod(c); return /^[A-Z0-9]{8,34}$/.test(c) && (c.match(/\d/g) || []).length >= 6; }
function txt(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function emailOk(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '')); }
/* família do fornecedor ("Daniel DALE IMPORTS", "Daniel MS" → DANIEL) — uso interno, nunca sai pro cliente (= _pacFamilia do GAS) */
function familia(f) {
  var u = R.semAcentoUp(String(f || '').split(':')[0]).replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();
  if (!u) return '';
  if (u.indexOf('DANIEL') >= 0) return 'DANIEL';
  if (u.indexOf('GEOVANNA') >= 0) return 'GEOVANNA';
  if (u.indexOf('RESPECT') >= 0) return 'RESPECT';
  if (u.replace(/ /g, '').indexOf('VITAFLOW') === 0) return 'VITAFLOW';
  if (u.indexOf('CAMILA') >= 0) return 'CAMILA';
  return u.split(' ')[0];
}
function linhasForn(fornTxt) { return String(fornTxt || '').split(/\n| \| /).map(function (x) { return x.trim(); }).filter(Boolean); }
/* = _detectarTransportadoraPorFormato do Rastreamento e _pacTranspPorFormato do GAS (mudou lá, muda aqui) */
function transpPorFormato(codigo) {
  var c = String(codigo || '').trim();
  if (!c) return '';
  if (/^D\d.*BR$/i.test(c)) return 'LOGGI';
  if (/^E?C\d.*[A-Z]\d*$/i.test(c) && !/BR$/i.test(c) && c.length >= 16) return 'LOGGI';
  if (/^TX.+TX$/i.test(c)) return 'TOTAL EXPRESS';
  if (/^888\d{12}$/.test(c)) return 'J&T';
  if (/^\d{14}$/.test(c)) return 'JADLOG';
  if (/^BR\d+V$/i.test(c)) return 'SPX';
  if (/^[A-Za-z]{2}\d{9}[A-Za-z]{2}$/.test(c)) return 'CORREIOS';
  if (/^\d{9}$/.test(c)) return 'JADLOG';
  return '';
}
/* transportadora de um objeto da Onlog: 1º o formato do código; senão, o operador que a Onlog mostra (FASTPACK…).
   "2X" e "ONLOG" não são transportadora (é o serviço da própria Onlog) → fica vazio. */
function transpOnlog(operador, codigo) {
  var f = transpPorFormato(codigo);
  if (f) return f;
  var u = R.semAcentoUp(operador).replace(/\s+/g, ' ');
  if (!u || u === '2X' || u.indexOf('ONLOG') >= 0) return '';
  if (u.indexOf('JT') === 0 || u.indexOf('J&T') >= 0) return 'J&T';
  if (u.indexOf('JADLOG') >= 0) return 'JADLOG';
  if (u.indexOf('LOGGI') >= 0) return 'LOGGI';
  if (u.indexOf('TOTAL') >= 0) return 'TOTAL EXPRESS';
  if (u.indexOf('CORREIO') >= 0) return 'CORREIOS';
  return u.slice(0, 30);
}
function tsDe(v) {
  if (typeof v === 'number') return v;
  var s = String(v || '').trim(); if (!s) return 0;
  var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (m) return new Date(m[3] + '-' + m[2] + '-' + m[1] + 'T' + (m[4] || '12') + ':' + (m[5] || '00') + ':00-03:00').getTime();
  var t = Date.parse(s); return isNaN(t) ? 0 : t;
}
function ddmmaa(ts) { if (!ts) return ''; var d = R.diaBR(ts).split('-'); return d[2] + '/' + d[1] + '/' + d[0]; }

/* ============================ PENDENTES DE CÓDIGO ============================ */
/* pedido PAGO, não cancelado/entregue, SEM código de rastreio, confirmado na janela */
function pendentesCodigo(peds, agora, janelaDias) {
  var ini = agora - Math.max(7, Number(janelaDias) || 45) * DIA;
  return peds.filter(function (p) {
    return !p.naoPagou && !p.final && p.st !== 'ENTREGUE' && !p.cod && p.tConf && p.tConf >= ini && String(p.pedido).indexOf(',') < 0;
  });
}
/* fila da Onlog: CPFs dos pendentes de Geovanna/Respect (1º) e dos sem fornecedor com 2+ dias úteis (depois) */
function filaOnlog(pend, agora, max) {
  var porCpf = {};
  pend.forEach(function (p) {
    if (p.cpf.length !== 11) return;
    var gr = p.fams.indexOf('GEOVANNA') >= 0 || p.fams.indexOf('RESPECT') >= 0;
    var solto = !p.fams.length && R.duEntre(p.tConf, agora) >= 2;
    if (!gr && !solto) return;
    var x = porCpf[p.cpf] || (porCpf[p.cpf] = { cpf: p.cpf, desde: p.tConf, gr: false });
    if (p.tConf < x.desde) x.desde = p.tConf;
    if (gr) x.gr = true;
  });
  return Object.keys(porCpf).map(function (c) { return porCpf[c]; })
    .sort(function (a, b) { return (a.gr === b.gr) ? a.desde - b.desde : (a.gr ? -1 : 1); })
    .slice(0, max || 40)
    .map(function (x) { return { cpf: x.cpf, desde: ddmmaa(x.desde) }; });
}

/* ============================ CASAMENTO (função pura — testada) ============================ */
/* Cada candidato (um código novo) vai para o pedido pendente MAIS RECENTE confirmado até o dia dele (e no máximo 20 dias
   antes). Só é CERTO quando é 1 código para 1 pedido, sem outro pedido do mesmo cliente no mesmo dia. O resto vira DÚVIDA. */
function parear(cands, rows) {
  var porRow = {}, certos = [], duvidas = [], fora = [];
  cands.forEach(function (c) {
    var melhor = null;
    rows.forEach(function (r) {
      if (R.diaBR(r.tConf) > R.diaBR(c.ts)) return;
      if (c.ts - r.tConf > MAX_DIAS_PAR * DIA) return;
      if (!melhor || r.tConf > melhor.tConf) melhor = r;
    });
    if (!melhor) { fora.push(c); return; }
    var mesmoDia = rows.filter(function (r) { return R.diaBR(r.tConf) === R.diaBR(melhor.tConf); });
    if (mesmoDia.length > 1) { duvidas.push({ c: c, rows: mesmoDia, por: 'dois pedidos do cliente no mesmo dia' }); return; }
    (porRow[melhor.k] = porRow[melhor.k] || { r: melhor, cs: [] }).cs.push(c);
  });
  Object.keys(porRow).forEach(function (k) {
    var x = porRow[k];
    if (x.cs.length === 1) certos.push({ c: x.cs[0], r: x.r });
    else x.cs.forEach(function (c) { duvidas.push({ c: c, rows: [x.r], por: x.cs.length + ' códigos para o mesmo pedido' }); });
  });
  return { certos: certos, duvidas: duvidas, fora: fora };
}
function candPub(r) { return { pedido: r.pedido, data: String(r.data || '').slice(0, 10), status: r.status, fornecedor: r.forn, codigo_atual: r.cod || '', onlog_atual: r.onlog || '' }; }

function casarCodigos(e) {
  var peds = e.peds, agora = e.agora || Date.now(), ign = e.ignorados || {};
  var janela = Number(e.janelaDias) || 45, duvDias = Number(e.duvidaDias) || 15;
  var pend = pendentesCodigo(peds, agora, janela);
  var usados = {}, porCpf = {}, pendCpf = {};
  peds.forEach(function (p) {
    if (p.cod && p.cod !== MOTOBOY) usados[p.cod] = p;
    if (p.onlog) usados[p.onlog] = p;
    if (p.cpf.length === 11 && !p.naoPagou) (porCpf[p.cpf] = porCpf[p.cpf] || []).push(p);
  });
  pend.forEach(function (p) { if (p.cpf.length === 11) (pendCpf[p.cpf] = pendCpf[p.cpf] || []).push(p); });

  var aplicar = [], duvidas = [], res = { pendentes: pend.length, daniel_pedidos: 0, onlog_cpfs: 0, onlog_objetos: 0, sem_pedido: 0, antigos: 0, sem_cpf: 0, onlog_erros: 0 };
  var certos = [];   /* {fonte, r, item} — conferidos no fim: o mesmo pedido não pode receber de duas fontes */
  function duvida(fonte, tipo, c, rows, por) {
    var cod = c.cods && c.cods[0] || c.real || '';
    duvidas.push({ id: sha(fonte + '|' + (cod || c.aa || '') + (cod === MOTOBOY ? '|' + (c.ref || '') : '')).slice(0, 12), fonte: fonte, tipo: tipo, motivo: por,
      codigo: cod, codigo2: (c.cods && c.cods[1]) || '', onlog: c.aa || '', transportadora: c.transp || '', origem: c.origem || '',
      nome: c.nome || '', cpf: c.cpf || '', quando: ddmmaa(c.ts), situacao: c.situacao || '', ref: c.ref || '',
      candidatos: rows.map(candPub) });
  }
  function fornDaLinha(r, fam) {   /* nome do fornecedor como está na linha (pra linha D nova) */
    var ls = linhasForn(r.fornTxt), i;
    for (i = 0; i < ls.length; i++) if (familia(ls[i]) === fam) return ls[i].split(':')[0].trim();
    return fam === 'DANIEL' ? 'Daniel' : (ls[0] ? ls[0].split(':')[0].trim() : '');
  }

  /* ---------------- DANIEL (site dele) ---------------- */
  var danCpf = {};
  (e.daniel || []).forEach(function (o) {
    if (/cancel/i.test(String(o.st || ''))) return;   /* pedido cancelado no site dele */
    res.daniel_pedidos++;
    var cods = [limparCod(o.c1), limparCod(o.c2)].filter(function (c, i, a) { return c && (codigoValido(c) || c === MOTOBOY) && a.indexOf(c) === i; });
    var rg = String(o.rg || '').toLowerCase();
    var origem = rg === 'interior' ? 'MS' : (rg === 'capital' ? 'SP' : '');
    var ts = tsDe(o.cr), cpf = cpf11(o.cpf);
    var naPlanilha = cods.filter(function (c) { return usados[c]; });
    var novos = cods.filter(function (c) { return !usados[c] && !ign[c]; });
    /* 1) código que já está na planilha: só confere a ORIGEM daquela linha */
    naPlanilha.forEach(function (c) {
      var dono = usados[c];
      if (origem && dono.origCol !== origem) aplicar.push({ pedido: dono.pedido, codigo: c, origem: origem, _fonte: 'daniel', _tipo: 'origem' });
    });
    if (!novos.length && cods.length) return;
    /* 2) 2º código do MESMO pedido do Daniel (o 1º já está na planilha): é outro pacote do mesmo pedido → linha D */
    if (naPlanilha.length && novos.length) {
      var d0 = usados[naPlanilha[0]];
      aplicar.push({ pedido: d0.pedido, codigo: novos[0], origem: origem, transportadora: transpPorFormato(novos[0]),
        novoD: { forn: fornDaLinha(d0, 'DANIEL'), itens: '2o pacote do mesmo envio', produtos: '' }, _fonte: 'daniel', _tipo: 'pacote' });
      return;
    }
    var c = { ts: ts, cods: novos, origem: origem, cpf: cpf, nome: txt(o.nome, 60), cep: cepDe(o.cep), ref: txt(o.oc, 30),
      transp: novos[0] ? transpPorFormato(novos[0]) : '', situacao: ({ in_transit: 'em trânsito no site do Daniel', delivered: 'entregue no site do Daniel' })[String(o.st || '')] || txt(o.st, 20) };
    if (cpf.length !== 11) { if (novos.length) res.sem_cpf++; return; }
    if (!novos.length && (!origem || agora - ts > 30 * DIA)) return;   /* sem código: só serve pra adiantar a origem */
    (danCpf[cpf] = danCpf[cpf] || []).push(c);
  });
  Object.keys(danCpf).forEach(function (cpf) {
    var rows = (pendCpf[cpf] || []).filter(function (r) { return !r.fams.length || r.fams.indexOf('DANIEL') >= 0; });
    if (rows.some(function (r) { return r.fams.indexOf('DANIEL') >= 0; })) rows = rows.filter(function (r) { return r.fams.indexOf('DANIEL') >= 0; });
    /* MOTOBOY já gravado: cada entrega por motoboy do site "consome" um pedido do cliente que já está com MOTOBOY
       (o mais recente confirmado até o dia dela). Só as que sobram procuram pedido sem código. */
    var motoRows = (porCpf[cpf] || []).filter(function (p) { return p.cod === MOTOBOY; }), motoUsado = {};
    var cands = danCpf[cpf].slice().sort(function (a, b) { return a.ts - b.ts; }).filter(function (c) {
      if (c.cods[0] !== MOTOBOY) return true;
      var m = null;
      motoRows.forEach(function (r) {
        if (motoUsado[r.k] || R.diaBR(r.tConf) > R.diaBR(c.ts) || c.ts - r.tConf > MAX_DIAS_PAR * DIA) return;
        if (!m || r.tConf > m.tConf) m = r;
      });
      if (!m) return true;
      motoUsado[m.k] = 1;
      if (c.origem && m.origCol !== c.origem) aplicar.push({ pedido: m.pedido, origem: c.origem, _fonte: 'daniel', _tipo: 'origem' });
      return false;
    });
    var par = parear(cands, rows);
    par.certos.forEach(function (x) {
      var c = x.c, r = x.r;
      if (c.cep && r.cep && c.cep !== r.cep) { if (c.cods.length) duvida('daniel', 'cep_diferente', c, [r], 'o CEP do envio é diferente do CEP do pedido'); return; }
      if (!c.cods.length) {   /* ainda sem código: só adianta a origem */
        if (c.origem && r.origCol !== c.origem) certos.push({ fonte: 'daniel', r: r, itens: [{ pedido: r.pedido, origem: c.origem, _fonte: 'daniel', _tipo: 'origem' }] });
        return;
      }
      var its = [{ pedido: r.pedido, codigo: c.cods[0], transportadora: transpPorFormato(c.cods[0]), origem: c.origem, _fonte: 'daniel', _tipo: 'codigo' }];
      if (c.cods[1]) its.push({ pedido: r.pedido, codigo: c.cods[1], transportadora: transpPorFormato(c.cods[1]), origem: c.origem,
        novoD: { forn: fornDaLinha(r, 'DANIEL'), itens: '2o pacote do mesmo envio', produtos: '' }, _fonte: 'daniel', _tipo: 'pacote' });
      certos.push({ fonte: 'daniel', r: r, itens: its });
    });
    par.duvidas.forEach(function (x) { if (x.c.cods.length) duvida('daniel', 'escolher', x.c, x.rows, x.por); });
    par.fora.forEach(function (c) {
      if (!c.cods.length) return;
      if (agora - c.ts > duvDias * DIA) { res.antigos++; return; }
      /* sem pedido pendente: o cliente tem pedido (já com outro código) confirmado até o dia desse envio? → pode ser 2º pacote */
      var outros = (porCpf[cpf] || []).filter(function (p) { return !p.final && R.diaBR(p.tConf) <= R.diaBR(c.ts) && c.ts - p.tConf <= MAX_DIAS_PAR * DIA; });
      if (outros.length) duvida('daniel', 'sem_pendente', c, outros, 'o cliente não tem pedido sem código; pode ser outro pacote de um pedido que já tem código');
      else res.sem_pedido++;
    });
  });

  /* ---------------- ONLOG (Geovanna / Respect) ---------------- */
  (e.onlog || []).forEach(function (it) {
    var cpf = cpf11(it.cpf);
    if (cpf.length !== 11) return;
    res.onlog_cpfs++;
    if (it.erro) { res.onlog_erros++; return; }
    var cands = [];
    (it.objetos || []).forEach(function (ob) {
      var aa = limparCod(ob.aa), real = limparCod(ob.real);
      if (!/^AA\d{10}$/.test(aa)) aa = '';
      if (real && (!codigoValido(real) || /^AA\d{10}$/.test(real))) real = '';
      if (!aa && !real) return;
      res.onlog_objetos++;
      var transp = real ? transpOnlog(ob.op, real) : '';
      var sit = txt((ob.status || '') + (ob.quando ? ' ' + ob.quando : ''), 80);
      if (aa && usados[aa]) {   /* o AA já está num pedido: se ele ainda não tem o código real, completa */
        var dono = usados[aa];
        if (!dono.cod && real && !usados[real] && !ign[real]) aplicar.push({ pedido: dono.pedido, codigo: real, onlog: aa, transportadora: transp, _fonte: 'onlog', _tipo: 'codigo', _info: sit });
        return;
      }
      if (real && usados[real]) return;
      if ((aa && ign[aa]) || (real && ign[real])) return;
      cands.push({ ts: tsDe(ob.criado), aa: aa, real: real, transp: transp, cpf: cpf, cep: cepDe(ob.cep), situacao: sit, nome: txt(ob.nome, 60) });
    });
    cands = cands.filter(function (c) { return c.ts; });
    var rows = (pendCpf[cpf] || []).filter(function (r) { return !r.onlog && (!r.fams.length || r.fams.indexOf('GEOVANNA') >= 0 || r.fams.indexOf('RESPECT') >= 0); });
    var temGR = function (r) { return r.fams.indexOf('GEOVANNA') >= 0 || r.fams.indexOf('RESPECT') >= 0; };
    if (rows.some(temGR)) rows = rows.filter(temGR);
    var par = parear(cands, rows);
    par.certos.forEach(function (x) {
      var c = x.c, r = x.r;
      if (c.cep && r.cep && c.cep !== r.cep) { duvida('onlog', 'cep_diferente', c, [r], 'o CEP do envio é diferente do CEP do pedido'); return; }
      certos.push({ fonte: 'onlog', r: r, itens: [{ pedido: r.pedido, codigo: c.real || '', onlog: c.aa || '', transportadora: c.transp, _fonte: 'onlog', _tipo: c.real ? 'codigo' : 'onlog', _info: c.situacao }], c: c });
    });
    par.duvidas.forEach(function (x) { duvida('onlog', 'escolher', x.c, x.rows, x.por); });
    /* par.fora: objeto mais antigo que os pedidos pendentes (envio anterior do mesmo cliente) → ignora */
  });

  /* o mesmo pedido recebendo código do Daniel E da Onlog na mesma rodada → ninguém grava, vira dúvida */
  var vezes = {};
  certos.forEach(function (x) { if (x.itens[0]._tipo !== 'origem') vezes[x.r.k] = (vezes[x.r.k] || 0) + 1; });
  certos.forEach(function (x) {
    if (x.itens[0]._tipo !== 'origem' && vezes[x.r.k] > 1) {
      var i0 = x.itens[0];
      duvida(x.fonte, 'duas_fontes', { cods: i0.codigo ? [i0.codigo] : [], aa: i0.onlog || '', real: i0.codigo, transp: i0.transportadora, origem: i0.origem, ts: 0, situacao: i0._info }, [x.r], 'o site do Daniel e a Onlog apontam para o mesmo pedido');
      return;
    }
    x.itens.forEach(function (i) { aplicar.push(i); });
  });
  /* dúvida repetida (mesmo código) fica uma vez só */
  var visto = {}; duvidas = duvidas.filter(function (d) { if (visto[d.id]) return false; visto[d.id] = 1; return true; });
  res.duvidas = duvidas.length;
  return { aplicar: aplicar, duvidas: duvidas, resumo: res };
}
function chaveItem(i) { return [String(i.pedido || '').toUpperCase(), i.codigo || '', i.onlog || '', i.origem || ''].join('|'); }

/* ---- Apps Script: gravar com as travas (action aplicar_codigos, GAS v53) ---- */
async function gasAplicar(itens) {
  var chave = process.env.COMPRAS_KEY || '';
  if (!chave) return { ok: false, erro: 'falta a variável COMPRAS_KEY no Netlify' };
  var limpos = itens.map(function (i) { var o = { pedido: i.pedido }; ['codigo', 'onlog', 'transportadora', 'origem', 'novoD'].forEach(function (k) { if (i[k]) o[k] = i[k]; }); return o; });
  try {
    var ctrl = new AbortController(); var t = setTimeout(function () { ctrl.abort(); }, 22000);
    var r = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctrl.signal,
      body: JSON.stringify({ action: 'aplicar_codigos', chave: chave, itens: limpos }) });
    clearTimeout(t);
    var j = null; try { j = JSON.parse(await r.text()); } catch (e) { return { ok: false, erro: 'o Apps Script não respondeu JSON (a versão v53 já foi publicada?)' }; }
    if (j && j.success && Array.isArray(j.resultado)) return { ok: true, resultado: j.resultado };
    return { ok: false, erro: (j && (j.msg || j.erro)) || 'o Apps Script não confirmou' };
  } catch (e) { return { ok: false, erro: 'Apps Script: ' + e.message }; }
}
function registroDe(item, resGas) {
  return { pedido: (resGas && resGas.pedido) || item.pedido, pedido_pedido: item.pedido, codigo: item.codigo || '', onlog: item.onlog || '',
    transportadora: item.transportadora || '', origem: item.origem || '', fonte: item._fonte || 'manual', tipo: item._tipo || 'manual',
    info: item._info || '', fez: (resGas && resGas.fez) || [], ok: !!(resGas && resGas.ok), motivo: (resGas && resGas.motivo) || '' };
}

/* ---- ticket: deixa a aba do Daniel / da Onlog mandar os dados direto pra cá (sem login de admin naquela aba) ---- */
async function novoTicket(uid, agora) {
  var tk = crypto.randomBytes(24).toString('hex');
  await fbReq('PUT', COD + '/ticket', { h: sha(tk), exp: agora + TICKET_VALE_MS, uid: uid });
  return tk;
}
async function conferirTicket(tk, agora) {
  tk = String(tk || '');
  if (!/^[0-9a-f]{48}$/.test(tk)) return false;
  var t = await fbLerOu(COD + '/ticket');
  return !!(t && t.h === sha(tk) && Number(t.exp) > agora);
}
function limparEntrada(fonte, itens) {
  itens = Array.isArray(itens) ? itens : [];
  if (fonte === 'daniel') return itens.slice(0, 600).map(function (o) {
    o = o || {};
    return { oc: txt(o.oc, 30), st: txt(o.st, 20), c1: txt(o.c1, 40), c2: txt(o.c2, 40), rg: txt(o.rg, 12), cpf: cpf11(o.cpf).slice(0, 14),
      nome: txt(o.nome, 60), cep: cepDe(o.cep), cr: tsDe(o.cr) };
  });
  return itens.slice(0, 80).map(function (o) {
    o = o || {};
    return { cpf: cpf11(o.cpf).slice(0, 14), erro: txt(o.erro, 60), objetos: (Array.isArray(o.objetos) ? o.objetos : []).slice(0, 12).map(function (b) {
      b = b || {};
      return { aa: txt(b.aa, 14), real: txt(b.real, 40), op: txt(b.op, 30), criado: tsDe(b.criado), status: txt(b.status, 60), quando: txt(b.quando, 20), cep: cepDe(b.cep), nome: txt(b.nome, 60) };
    }) };
  });
}

/* ---- a rodada: casa o que veio (Daniel + Onlog) com os pendentes e grava os certos ---- */
async function rodadaCodigos(op) {
  var agora = op.agora || Date.now();
  var lidos = await Promise.all([lerBase(false), fbLerOu(COD + '/entrada'), fbLerOu(COD + '/ignorados'), fbLerOu(COD + '/rodada_atual')]);
  var base = lidos[0], ent = lidos[1] || {}, ign = lidos[2] || {}, atual = lidos[3];
  var cfg = Object.assign({}, EMAIL_CFG_PADRAO, base.cfg || {});
  var fontes = {}, dan = null, onl = null;
  if (ent.daniel && agora - Number(ent.daniel.ts) < ENTRADA_VALE_MS) { dan = ent.daniel.itens || []; fontes.daniel = { ts: ent.daniel.ts, n: dan.length }; }
  if (ent.onlog && agora - Number(ent.onlog.ts) < ENTRADA_VALE_MS) { onl = ent.onlog.itens || []; fontes.onlog = { ts: ent.onlog.ts, n: onl.length }; }
  if (!dan && !onl) return { ok: false, erro: 'sem_entrada', msg: 'Nenhum dado novo do site do Daniel nem da Onlog (vale 1 hora). Rode a coleta de novo.' };
  var peds = montarPedidos(base);
  var plano = casarCodigos({ peds: peds, daniel: dan || [], onlog: onl || [], ignorados: ign, agora: agora, janelaDias: cfg.codigos_janela_dias, duvidaDias: cfg.codigos_duvida_dias });
  if (!op.aplicar) return { ok: true, simulacao: true, fontes: fontes, resumo: plano.resumo, aplicar: plano.aplicar, duvidas: plano.duvidas };

  if (!atual || !atual.inicio || agora - Number(atual.inicio) > ENTRADA_VALE_MS) atual = { inicio: agora, tentados: {}, registros: [] };
  atual.tentados = atual.tentados || {}; atual.registros = atual.registros || [];
  var fila = plano.aplicar.filter(function (i) { return !atual.tentados[sha(chaveItem(i)).slice(0, 16)]; });
  var lote = fila.slice(0, LOTE_GAS);
  if (lote.length) {
    var g = await gasAplicar(lote);
    if (!g.ok) return { ok: false, erro: 'gas', msg: g.erro, resta: fila.length };
    lote.forEach(function (i, n) {
      atual.tentados[sha(chaveItem(i)).slice(0, 16)] = 1;
      var rg = registroDe(i, g.resultado[n]);
      if (!rg.ok || rg.fez.length) atual.registros.push(rg);
    });
    await fbReq('PUT', COD + '/rodada_atual', atual);
  }
  var resta = fila.length - lote.length;
  if (resta > 0) return { ok: true, resta: resta, gravados_ate_agora: atual.registros.filter(function (x) { return x.ok; }).length };

  /* acabou: fecha a rodada */
  var aplicados = atual.registros.filter(function (x) { return x.ok; }), recusados = atual.registros.filter(function (x) { return !x.ok; });
  var cont = function (f) { return aplicados.filter(f).length; };
  var resumo = Object.assign({}, plano.resumo, {
    codigos: cont(function (x) { return x.fez.indexOf('codigo') >= 0; }), onlogs: cont(function (x) { return x.fez.indexOf('onlog') >= 0 && x.fez.indexOf('codigo') < 0; }),
    origens: cont(function (x) { return x.fez.indexOf('origem') >= 0; }), linhas_d: cont(function (x) { return x.fez.indexOf('linha D') >= 0; }),
    recusados: recusados.length });
  var rodada = { ts: agora, inicio: atual.inicio, fontes: fontes, resumo: resumo, aplicados: aplicados, recusados: recusados, duvidas: plano.duvidas };
  await fbReq('PUT', COD + '/ultima', rodada);
  await fbReq('PUT', COD + '/rodadas/' + atual.inicio, { ts: agora, fontes: fontes, resumo: resumo });
  await fbReq('DELETE', COD + '/rodada_atual'); await fbReq('DELETE', COD + '/entrada'); await fbReq('DELETE', COD + '/ticket');
  var mails = null;
  try { mails = await enviarPacotesPendentes(agora); } catch (eM) { mails = { erro: eM.message }; }
  return { ok: true, resta: 0, fontes: fontes, resumo: resumo, aplicados: aplicados, recusados: recusados, duvidas: plano.duvidas, emails_pacotes: mails };
}

/* ============================ E-MAIL "SEU PEDIDO VAI EM N PACOTES" ============================ */
function itensDoPacote(linhaForn) {   /* "Fornecedor: 2x A, 1x B" → ['2x A', '1x B'] (o nome do fornecedor NUNCA sai) */
  var s = String(linhaForn || ''), i = s.indexOf(':');
  if (i < 0) return [];
  return s.slice(i + 1).split(/,\s*(?=\d+\s*x\s)/i).map(function (x) { return x.trim(); }).filter(function (x) { return /^\d+\s*x\s+\S/i.test(x); });
}
function montarEmailPacotes(dados, textos) {
  var T = Object.assign({}, EMAIL_PADRAO);
  Object.keys(EMAIL_PADRAO).forEach(function (k) { if (textos && textos[k] && String(textos[k]).trim()) T[k] = String(textos[k]); });
  var blocos = dados.pacotes.map(function (p, i) {
    var local = p.local || (p.origem && ORIGEM_NOME[p.origem]) || '';
    return 'Pacote ' + (i + 1) + (local ? ' — sai de ' + local : '') + '\n' + p.itens.map(function (x) { return '• ' + x; }).join('\n');
  }).join('\n\n');
  var v = { NOME: String(dados.nome || '').split(' ')[0] || 'cliente', PEDIDO: dados.pedido, N: dados.pacotes.length, PACOTES: blocos };
  return { assunto: preencher(T.email_pacotes_assunto, v), texto: preencher(T.email_pacotes_texto, v) };
}
/* lê o pedido e as linhas D dele (PEDIDO_ORIGINAL) e monta os pacotes; devolve { motivo } quando não é caso de e-mail */
async function lerPacotes(pedido) {
  var k = R.histKey(pedido), dia = (pedido.match(/^(VF-\d{4}-)/) || [])[1];
  var lidos = await Promise.all([R.fbGetOu('vitaflow_pedidos_hdr'), R.fbGetOu('vitaflow_pedidos/' + k),
    fbLerOu('vitaflow_pedidos', 'orderBy=' + encodeURIComponent('"$key"') + '&startAt=' + encodeURIComponent('"' + dia + 'D"') + '&endAt=' + encodeURIComponent('"' + dia + 'D"')),
    R.fbGetOu('vitaflow_compras/' + k)]);
  var hdr = (lidos[0] || []).map(function (h) { return String(h || '').trim().toUpperCase(); }), l = lidos[1], ds = lidos[2] || {}, comp = lidos[3];
  if (!l || !l.length) return { motivo: 'pedido não encontrado' };
  var cF = hdr.indexOf('COMPRADO_FORNECEDORES'), cP = hdr.indexOf('PEDIDO_ORIGINAL'), cO = hdr.indexOf('ORIGEM');
  if (cF < 0 || cP < 0) return { motivo: 'a planilha ainda não tem as colunas dos pacotes' };
  var st = R.semAcentoUp(l[5]);
  if (R.naoPagou(l[5], l[12]) || FINAL[st]) return { motivo: 'pedido não pago ou cancelado' };
  var cel = function (ln, c) { return (c >= 0 && ln) ? String(ln[c] == null ? '' : ln[c]).trim() : ''; };
  if (cel(l, cP)) return { motivo: 'é uma linha de pacote, não o pedido' };
  var linhasO = linhasForn(cel(l, cF));
  if (linhasO.length !== 1) return { motivo: 'pedido não dividido em pacotes' };
  var filhos = Object.keys(ds).map(function (kd) { return ds[kd]; }).filter(function (ln) {
    return ln && ln.length && cel(ln, cP).toUpperCase() === pedido && !FINAL[R.semAcentoUp(ln[5])];
  }).sort(function (a, b) { return String(a[0]) < String(b[0]) ? -1 : 1; });
  var pacotes = [l].concat(filhos).map(function (ln) {
    var fornLinha = linhasForn(cel(ln, cF))[0] || '', og = cel(ln, cO).toUpperCase();
    if (!ORIGEM_NOME[og]) { og = R.origemEnvio(pedido, fornLinha); if (!ORIGEM_NOME[og]) og = ''; }   /* 'DANIEL' = ainda não se sabe (MS ou SP) */
    var fam = familia(fornLinha);
    /* fornecedora VitaFlow sai de Campinas/SP — nunca do RJ (Thiago, 01/10) */
    return { numero: String(ln[0]).trim(), fam: fam, itens: itensDoPacote(fornLinha), origem: og, local: (fam === 'VITAFLOW' && og === 'SP') ? 'Campinas/SP' : '' };
  }).filter(function (p) { return p.itens.length; });
  if (pacotes.length < 2) return { motivo: 'pedido com um pacote só' };
  /* "com tudo comprado": todo fornecedor do pedido no Compras já está marcado como comprado */
  if (comp && comp.itens && comp.itens.length) {
    var falta = false, nomes = {};
    comp.itens.forEach(function (it) { if (it) nomes[it.fornecedor || '(sem fornecedor)'] = 1; });
    Object.keys(nomes).forEach(function (f) { if (!(comp.grupos && comp.grupos[f] && comp.grupos[f].comprado)) falta = true; });
    if (falta) return { motivo: 'falta comprar', esperar: true };
  }
  return { k: k, pedido: pedido, nome: String(l[1] || '').trim(), email: String(l[2] || '').trim(), pacotes: pacotes };
}
async function emailPacotes(pedido, op) {
  op = op || {}; var agora = op.agora || Date.now();
  pedido = String(pedido || '').trim().toUpperCase();
  if (!/^VF-\d{4}-[A-Z][A-Z0-9]*$/.test(pedido)) return { ok: false, erro: 'pedido inválido' };
  if (ehRevendedor(pedido)) return { ok: true, enviado: false, motivo: 'revendedor não recebe e-mail' };
  var k = R.histKey(pedido);
  var pre = await Promise.all([fbLerOu(RAIZ + '/config'), fbLerOu(RAIZ + '/textos'), fbLerOu(RAIZ + '/email_pacotes/' + k)]);
  var cfg = Object.assign({}, EMAIL_CFG_PADRAO, pre[0] || {}), reg = pre[2] || {};
  var modo = cfg.email_pacotes_modo || 'ligado';
  if (modo === 'desligado') return { ok: true, enviado: false, motivo: 'e-mail de pacotes desligado' };
  if (reg.estado === 'enviado' || reg.estado === 'teste') { if (!op.forcar) return { ok: true, enviado: false, motivo: 'já enviado' }; }
  var d = await lerPacotes(pedido);
  if (d.motivo) {
    if (!d.esperar && reg.estado === 'aguardando_origem') { await fbReq('DELETE', RAIZ + '/email_pacotes/' + k); await fbReq('DELETE', RAIZ + '/email_pacotes_fila/' + k); }
    return { ok: true, enviado: false, motivo: d.motivo };
  }
  if (!emailOk(d.email)) return { ok: true, enviado: false, motivo: 'pedido sem e-mail válido' };
  /* origem do pacote do Daniel só é certa depois que a rodada lê o site dele → espera (no máximo 20 h) */
  var semOrigem = d.pacotes.filter(function (p) { return !p.origem; }).length;
  var desde = Number(reg.desde) || agora;
  if (semOrigem && !op.semEspera && agora - desde < 20 * 3600000) {
    await fbReq('PUT', RAIZ + '/email_pacotes/' + k, { estado: 'aguardando_origem', desde: desde, pedido: pedido });
    await fbReq('PUT', RAIZ + '/email_pacotes_fila/' + k, desde);
    return { ok: true, enviado: false, adiado: 'origem', motivo: 'esperando a origem do pacote (próxima rodada de códigos; no máximo 20 h)' };
  }
  var m = montarEmailPacotes(d, pre[1]);
  var para = d.email, assunto = m.assunto;
  if (modo === 'teste') {
    para = String(cfg.email_atraso_teste || '').trim(); assunto = '[TESTE] ' + assunto;
    if (!emailOk(para)) return { ok: false, erro: 'modo teste sem e-mail de teste (aba Atrasos)' };
  }
  var r = await enviarBrevo(para, modo === 'teste' ? '' : d.nome, assunto, m.texto);
  if (!r.ok) return { ok: false, erro: r.erro };
  await fbReq('PUT', RAIZ + '/email_pacotes/' + k, { estado: modo === 'teste' ? 'teste' : 'enviado', ts: agora, n: d.pacotes.length, pedido: pedido, numeros: d.pacotes.map(function (p) { return p.numero; }).join(', ') });
  await fbReq('DELETE', RAIZ + '/email_pacotes_fila/' + k);
  return { ok: true, enviado: true, modo: modo, pacotes: d.pacotes.length };
}
/* os que ficaram esperando a origem: chamado no fim da rodada de códigos e pela rotina diária (logistica-atrasos) */
async function enviarPacotesPendentes(agora) {
  agora = agora || Date.now();
  var fila = await fbLerOu(RAIZ + '/email_pacotes_fila');
  var ks = (fila && typeof fila === 'object') ? Object.keys(fila).slice(0, 15) : [];
  var out = { fila: ks.length, enviados: 0, esperando: 0, erros: [] };
  for (var i = 0; i < ks.length; i++) {
    var reg = await fbLerOu(RAIZ + '/email_pacotes/' + ks[i]);
    if (!reg || !reg.pedido) { await fbReq('DELETE', RAIZ + '/email_pacotes_fila/' + ks[i]); continue; }
    var r = await emailPacotes(reg.pedido, { agora: agora });
    if (r.enviado) out.enviados++; else if (r.adiado || (r.motivo === 'falta comprar')) out.esperando++; else if (!r.ok) out.erros.push(reg.pedido + ': ' + r.erro);
  }
  return out;
}

/* ---- ações novas do handler (v3) ---- */
async function acaoComTicket(acao, d, agora) {
  if (!(await conferirTicket(d.ticket, agora))) return resp({ ok: false, erro: 'ticket inválido ou vencido' }, 401);
  if (acao === 'codigos_fila') {
    var base = await lerBase(false), cfg = Object.assign({}, EMAIL_CFG_PADRAO, base.cfg || {});
    return resp({ ok: true, cpfs: filaOnlog(pendentesCodigo(montarPedidos(base), agora, cfg.codigos_janela_dias), agora, 40) });
  }
  var fonte = d.fonte === 'onlog' ? 'onlog' : (d.fonte === 'daniel' ? 'daniel' : '');
  if (!fonte) return resp({ ok: false, erro: 'fonte inválida' }, 400);
  var itens = limparEntrada(fonte, d.itens);
  if (d.acumular) {
    var ja = await fbLerOu(COD + '/entrada/' + fonte);
    if (ja && agora - Number(ja.ts) < ENTRADA_VALE_MS && Array.isArray(ja.itens)) itens = ja.itens.concat(itens).slice(0, 600);
  }
  await fbReq('PUT', COD + '/entrada/' + fonte, { ts: agora, itens: itens });
  return resp({ ok: true, fonte: fonte, recebidos: itens.length });
}
async function acaoAdminV3(acao, d, uid, agora) {
  if (acao === 'codigos_ticket') return resp({ ok: true, ticket: await novoTicket(uid, agora), vale_min: TICKET_VALE_MS / 60000 });
  if (acao === 'codigos_pendentes') {
    var base = await lerBase(false), cfg = Object.assign({}, EMAIL_CFG_PADRAO, base.cfg || {});
    var pend = pendentesCodigo(montarPedidos(base), agora, cfg.codigos_janela_dias);
    var lidos = await Promise.all([fbLerOu(COD + '/ultima'), fbLerOu(COD + '/rodadas', 'orderBy=' + encodeURIComponent('"$key"') + '&limitToLast=10')]);
    return resp({ ok: true, gerado_ts: agora,
      pendentes: pend.sort(function (a, b) { return a.tConf - b.tConf; }).map(function (p) {
        return { pedido: p.pedido, nome: p.nome, cpf: p.cpf, data: String(p.data || '').slice(0, 10), status: p.status, fornecedor: p.forn, comprado: p.fams.length > 0,
          onlog: p.onlog, pacote_de: p.pai, dias: R.duEntre(p.tConf, agora), revendedor: ehRevendedor(p.pedido) };
      }),
      ultima: lidos[0] || null, rodadas: lidos[1] || {},
      config: { email_pacotes_modo: cfg.email_pacotes_modo, teste: cfg.email_atraso_teste || '' } });
  }
  if (acao === 'codigos_casar') return resp(await rodadaCodigos({ agora: agora, aplicar: d.aplicar === true }));
  if (acao === 'codigos_aplicar') {   /* resolver uma dúvida à mão (painel) */
    var itens = (Array.isArray(d.itens) ? d.itens : []).slice(0, 10).map(function (i) {
      i = i || {};
      var o = { pedido: txt(i.pedido, 30).toUpperCase(), codigo: (codigoValido(i.codigo) || limparCod(i.codigo) === MOTOBOY) ? limparCod(i.codigo) : '', onlog: limparCod(i.onlog), transportadora: txt(i.transportadora, 30), origem: txt(i.origem, 2).toUpperCase(), _fonte: txt(i.fonte, 10) || 'manual', _tipo: 'manual' };
      if (i.novoD && i.novoD.forn) o.novoD = { forn: txt(i.novoD.forn, 60), itens: txt(i.novoD.itens, 300), produtos: '' };
      if (o.codigo && !o.transportadora) o.transportadora = transpPorFormato(o.codigo);
      return o;
    }).filter(function (o) { return o.pedido && (o.codigo || o.onlog || o.origem); });
    if (!itens.length) return resp({ ok: false, erro: 'nada para gravar' }, 400);
    var g = await gasAplicar(itens);
    if (!g.ok) return resp({ ok: false, erro: g.erro });
    var regs = itens.map(function (i, n) { return registroDe(i, g.resultado[n]); });
    /* tira a dúvida resolvida da última rodada e anota o que foi gravado */
    var ult = await fbLerOu(COD + '/ultima');
    if (ult) {
      var feitos = {}, pedFeito = {};
      regs.forEach(function (x) { if (x.ok) { if (x.codigo) feitos[x.codigo] = 1; if (x.onlog) feitos[x.onlog] = 1; pedFeito[String(x.pedido_pedido || '').toUpperCase()] = 1; } });
      ult.duvidas = (ult.duvidas || []).filter(function (dv) {
        if (dv.codigo === MOTOBOY) return !(feitos[MOTOBOY] && (dv.candidatos || []).some(function (c) { return pedFeito[String(c.pedido).toUpperCase()]; }));   /* MOTOBOY não é único: só sai a dúvida daquele pedido */
        return !(feitos[dv.codigo] || feitos[dv.onlog]);
      });
      ult.aplicados = (ult.aplicados || []).concat(regs.filter(function (x) { return x.ok && x.fez.length; }).map(function (x) { x.manual_por = uid; x.manual_ts = agora; return x; }));
      await fbReq('PUT', COD + '/ultima', ult);
    }
    return resp({ ok: true, resultado: regs });
  }
  if (acao === 'codigos_ignorar') {   /* "esse código não é de pedido nosso" → não aparece mais */
    var c = limparCod(d.codigo);
    if (!c || /[.#$\[\]\/]/.test(c)) return resp({ ok: false, erro: 'código inválido' }, 400);
    if (c === MOTOBOY) return resp({ ok: false, erro: 'MOTOBOY não dá para ignorar (é entrega por motoboy, não um código)' }, 400);
    await fbReq('PUT', COD + '/ignorados/' + c, agora);
    var u2 = await fbLerOu(COD + '/ultima');
    if (u2 && u2.duvidas) { u2.duvidas = u2.duvidas.filter(function (dv) { return dv.codigo !== c && dv.onlog !== c; }); await fbReq('PUT', COD + '/ultima', u2); }
    return resp({ ok: true });
  }
  return null;
}

/* ============================ COLETORES (rodam DENTRO da aba do site do Daniel / da Onlog) ============================
   GET ?coletor=daniel | ?coletor=onlog devolve o código-fonte de uma função. Quem faz a rodada cola na aba:
       var f = (0, eval)(await (await fetch(FN + '?coletor=daniel')).text());  await f('<ticket>');
   Os dados (CPF, nome, códigos) vão DIRETO da aba para esta função (codigos_entrada) — não passam por mais ninguém.
   ⚠️ Estas funções rodam no navegador: só usam o que existe lá (nada de require / variáveis deste arquivo). */
function coletorDaniel(ticket) {
  var FN = 'https://vitaflow-proxy.netlify.app/.netlify/functions/logistica-painel';
  return (async function () {
    var chave = Object.keys(localStorage).filter(function (k) { return /^sb-.*-auth-token$/.test(k); })[0];
    var tk = '';
    try { tk = (JSON.parse(localStorage.getItem(chave) || '{}') || {}).access_token || ''; } catch (e) { tk = ''; }
    if (!tk) return { ok: false, erro: 'sem_login' };
    var r = await fetch('https://drarbctupbqspvyuhsrb.supabase.co/functions/v1/make-server-59637aed/orders/my', { headers: { Authorization: 'Bearer ' + tk } });
    if (r.status === 401 || r.status === 403) return { ok: false, erro: 'sem_login' };
    if (!r.ok) return { ok: false, erro: 'site do Daniel respondeu ' + r.status };
    var j = await r.json(), os = (j && j.orders) || [];
    if (!os.length) return { ok: false, erro: 'nenhum pedido veio do site' };
    var itens = os.map(function (o) {
      var d = o.dropCustomer || {}, e = o.deliveryAddress || {};
      return { oc: o.orderCode || '', st: o.status || '', c1: o.trackingCode || '', c2: o.trackingCode2 || '', rg: o.shippingRegion || '',
        cpf: d.cpf || '', nome: d.name || '', cep: e.zipCode || '', cr: o.createdAt || '' };
    });
    var p = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao: 'codigos_entrada', ticket: ticket, fonte: 'daniel', itens: itens }) });
    var pj = await p.json();
    return { ok: !!pj.ok, pedidos: os.length, com_codigo: itens.filter(function (x) { return x.c1; }).length, recebidos: pj.recebidos || 0, erro: pj.erro || '' };
  })();
}
function coletorOnlog(ticket) {
  var FN = 'https://vitaflow-proxy.netlify.app/.netlify/functions/logistica-painel';
  var S = window._vfOnlog = { estado: 'iniciando', total: 0, feitos: 0, com_objeto: 0, objetos: 0, erros: 0, msg: '' };
  function espera(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function ate(cond, ms) { var t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await espera(300); } return false; }
  function token() { var e = document.querySelector('[name=cf-turnstile-response]'); return !!(e && e.value); }
  function linhas(e) { return String((e && e.innerText) || '').split('\n').map(function (x) { return x.replace(/\s+/g, ' ').trim(); }).filter(Boolean); }
  var DATA = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/;
  /* bloco de UM objeto: "OBJETO <código real>" · AA… · operador · [DESTINATÁRIO…] · eventos (título, [cidade], data) */
  function lerDetalhe(raiz) {
    var ls = linhas(raiz), o = { aa: '', real: '', op: '', criado: '', status: '', quando: '', cep: '', nome: '' }, i;
    for (i = 0; i < ls.length; i++) {
      var mA = ls[i].match(/^AA\d{10}$/);
      if (mA && !o.aa) {
        o.aa = mA[0];
        var mR = (ls[i - 1] || '').match(/^OBJETO\s+([A-Z0-9]{8,34})$/i);
        if (mR && /\d{5}/.test(mR[1]) && !/^AA\d{10}$/i.test(mR[1])) o.real = mR[1].toUpperCase();
        var prox = ls[i + 1] || '';
        if (prox && !DATA.test(prox) && !/^(OBJETO|DESTINAT)/i.test(prox)) o.op = prox;
      }
      var mN = ls[i].match(/^DESTINAT[ÁA]RIO:\s*(.+)$/i); if (mN) o.nome = mN[1];
      var mC = ls[i].match(/\d{5}-\d{3}(?!\d)/); if (mC && !DATA.test(ls[i])) o.cep = mC[0];
      if (/^OBJETO CRIADO$/i.test(ls[i]) && DATA.test(ls[i + 1] || '')) o.criado = ls[i + 1];
    }
    for (i = ls.length - 1; i > 0; i--) {
      if (DATA.test(ls[i])) { o.quando = ls[i]; o.status = /^[^\d]+ - [A-Z]{2}$/.test(ls[i - 1]) ? (ls[i - 2] || ls[i - 1]) : ls[i - 1]; break; }
    }
    return o;
  }
  async function fecharModal() {
    var m = document.querySelector('.modal.show');
    if (!m) return;
    var b = m.querySelector('[data-dismiss=modal], [data-bs-dismiss=modal], .close, .btn-close');
    if (b) b.click(); else if (window.jQuery) window.jQuery(m).modal('hide');
    await ate(function () { return !document.querySelector('.modal.show'); }, 4000);
  }
  async function consultar(cpf, desde) {
    var campo = document.querySelector('#txtR1RastreioEncomendas'), div = document.getElementById('divRetornoRastreio'), btn = document.getElementById('btnConsultar');
    var aba = document.querySelector('.btnTipo[data-tipo=cpf]');
    if (!campo || !div || !btn || !aba || !window.jQuery) return { erro: 'a página da Onlog mudou' };
    await fecharModal();
    if (!(await ate(token, 30000))) return { erro: 'verificacao', parar: true };   /* o Cloudflare não liberou sozinho → PARA (ninguém clica nele) */
    aba.click(); await espera(200);
    div.innerHTML = '';
    var fmt = cpf.slice(0, 3) + '.' + cpf.slice(3, 6) + '.' + cpf.slice(6, 9) + '-' + cpf.slice(9);
    window.jQuery(campo).val(fmt).trigger('input').trigger('change');
    btn.click();
    var semToken = false;
    await ate(function () { if (!token()) semToken = true; return div.children.length > 0 || (semToken && token()); }, 15000);
    if (!div.children.length) await espera(1500);
    if (!div.children.length) return { objetos: [] };
    var trs = [].slice.call(div.querySelectorAll('tbody tr'));
    if (!trs.length) { var u = lerDetalhe(div); return { objetos: (u.aa || u.real) ? [u] : [] }; }
    /* vários objetos: abre o detalhe só dos criados a partir da véspera do pedido mais antigo sem código (no máximo 6) */
    var corte = 0, md = String(desde || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (md) corte = new Date(md[3] + '-' + md[2] + '-' + md[1] + 'T00:00:00-03:00').getTime() - 86400000;
    var objs = [], abertos = 0;
    for (var i = 0; i < trs.length; i++) {
      var tds = [].slice.call(trs[i].children).map(function (td) { return String(td.innerText || '').replace(/\s+/g, ' ').trim(); });
      var aa = (tds[0] || '').match(/AA\d{10}/); if (!aa) continue;
      var dt = (tds[2] || '').match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);
      var ts = dt ? new Date(dt[3] + '-' + dt[2] + '-' + dt[1] + 'T' + dt[4] + ':' + dt[5] + ':00-03:00').getTime() : 0;
      if (corte && ts && ts < corte) continue;
      var o = { aa: aa[0], real: '', op: tds[1] || '', criado: tds[2] || '', status: tds[3] || '', quando: '', cep: ((tds[4] || '').match(/\d{5}-\d{3}(?!\d)/) || [''])[0], nome: '' };
      var b = trs[i].querySelector('.btnVisualizarRastreio');
      if (b && abertos < 6) {
        abertos++; b.click();
        var abriu = await ate(function () { var m = document.querySelector('.modal.show'); return !!(m && String(m.innerText || '').indexOf(o.aa) >= 0); }, 8000);
        if (abriu) { var det = lerDetalhe(document.querySelector('.modal.show')); if (det.aa === o.aa) { det.cep = det.cep || o.cep; if (!det.criado) det.criado = o.criado; o = det; } }
        await fecharModal(); await espera(400);
      }
      objs.push(o);
    }
    return { objetos: objs };
  }
  async function mandar(itens, acumular) {
    var r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao: 'codigos_entrada', ticket: ticket, fonte: 'onlog', itens: itens, acumular: acumular }) });
    return r.json();
  }
  (async function () {
    try {
      var rf = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao: 'codigos_fila', ticket: ticket }) });
      var fila = await rf.json();
      if (!fila || !fila.ok) { S.estado = 'erro'; S.msg = (fila && fila.erro) || 'fila'; return; }
      var cpfs = fila.cpfs || [], lote = [], primeiro = true;
      S.total = cpfs.length; S.estado = 'rodando';
      if (!cpfs.length) { await mandar([], false); S.estado = 'fim'; return; }
      for (var i = 0; i < cpfs.length; i++) {
        var res;
        try { res = await consultar(cpfs[i].cpf, cpfs[i].desde); } catch (e) { res = { erro: String(e && e.message || e).slice(0, 60) }; }
        if (res.parar) { S.estado = 'parado'; S.msg = 'O Cloudflare da Onlog pediu confirmação: clique no quadradinho na página e peça a rodada de novo.'; break; }
        if (res.erro) { S.erros++; lote.push({ cpf: cpfs[i].cpf, erro: res.erro }); }
        else { lote.push({ cpf: cpfs[i].cpf, objetos: res.objetos }); if (res.objetos.length) { S.com_objeto++; S.objetos += res.objetos.length; } }
        S.feitos = i + 1;
        if (lote.length >= 5 || i === cpfs.length - 1) { await mandar(lote, !primeiro); primeiro = false; lote = []; }
        await espera(3500);   /* sem pressa: uma consulta de cada vez, como uma pessoa faria */
      }
      if (lote.length) await mandar(lote, !primeiro);
      if (S.estado === 'rodando') S.estado = 'fim';
    } catch (e) { S.estado = 'erro'; S.msg = String(e && e.message || e).slice(0, 120); }
  })();
  return { ok: true, iniciado: true };
}
function fonteColetor(qual) {
  var f = qual === 'daniel' ? coletorDaniel : (qual === 'onlog' ? coletorOnlog : null);
  return f ? '(' + f.toString() + ')' : '';
}

/* ============================ login (só admin) ============================ */
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

/* cache da instância quente (5 min) — os números não mudam a cada clique */
var _cache = {};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  var q = event.queryStringParameters || {};
  if (event.httpMethod === 'GET' && q.coletor) {   /* v3: código do coletor que roda na aba do Daniel / da Onlog (não tem segredo nenhum) */
    var src = fonteColetor(String(q.coletor));
    return { statusCode: src ? 200 : 404, headers: Object.assign({}, CORS, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }), body: src || '// coletor desconhecido' };
  }
  if (event.httpMethod === 'GET' && q.defaults) return resp({ textos: EMAIL_PADRAO, config: EMAIL_CFG_PADRAO, brevo: !!process.env.BREVO_API_KEY });
  if (event.httpMethod !== 'POST') return resp({ ok: false, erro: 'use POST' }, 405);
  var d = {};
  try { d = JSON.parse(event.body || '{}') || {}; } catch (e) { d = {}; }
  var acao = String(d.acao || ''), agora = Date.now();
  try {
    /* v3: ações que NÃO usam o login de admin */
    if (acao === 'codigos_fila' || acao === 'codigos_entrada') return await acaoComTicket(acao, d, agora);
    if (acao === 'email_pacotes') {
      var chaveOk = !!process.env.COMPRAS_KEY && String(d.chave || '') === process.env.COMPRAS_KEY;
      if (!chaveOk && !(await conferirAdmin(d.token))) return resp({ ok: false, erro: 'sem permissão' }, 401);
      return resp(await emailPacotes(d.pedido, { agora: agora, forcar: d.forcar === true && !chaveOk }));
    }
  } catch (e0) {
    console.error('[logistica-painel] ' + (e0 && e0.message || e0));
    return resp({ ok: false, erro: String(e0 && e0.message || e0) }, 500);
  }
  var uid = await conferirAdmin(d.token);
  if (!uid) return resp({ ok: false, erro: 'sem permissão (faça login de novo)' }, 401);
  try {
    if (acao.indexOf('codigos_') === 0) {
      var rV3 = await acaoAdminV3(acao, d, uid, agora);
      if (rV3) return rV3;
    }
    if (acao === 'numeros') {
      var dias = [30, 60, 90, 180, 365].indexOf(Number(d.dias)) >= 0 ? Number(d.dias) : 90;
      var ck = 'n' + dias;
      if (!d.forcar && _cache[ck] && agora - _cache[ck].t < 300000) return resp({ ok: true, numeros: _cache[ck].v, cache: true });
      var base = await lerBase(false);
      var v = calcularNumeros(montarPedidos(base), dias, agora);
      _cache[ck] = { t: agora, v: v };
      return resp({ ok: true, numeros: v });
    }
    if (acao === 'atrasos' || acao === 'enviar_teste') {
      var b2 = await lerBase(true);
      var lista = await calcularAtrasos(b2, montarPedidos(b2), agora);
      var cfg = Object.assign({}, EMAIL_CFG_PADRAO, b2.cfg || {});
      if (acao === 'atrasos') {
        lista.forEach(function (a) { a.recebe_hoje = decidirEnvio(a, cfg, agora); });
        return resp({ ok: true, atrasos: lista, gerado_ts: agora, brevo: !!process.env.BREVO_API_KEY,
          config: { modo: cfg.email_atraso_modo, teste: cfg.email_atraso_teste || '', max: cfg.email_atraso_max, intervalo_du: cfg.email_atraso_intervalo_du, janela_dias: cfg.email_atraso_janela_dias } });
      }
      var para = String(cfg.email_atraso_teste || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(para)) return resp({ ok: false, erro: 'Preencha o e-mail de teste na aba Atrasos e salve.' });
      /* exemplo = o 1º atrasado que tem e-mail (senão, um pedido fictício) */
      var ex = lista.filter(function (a) { return !ehRevendedor(a.pedido_email || a.pedido) && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(a.email || '')); })[0] ||
        { nome: 'Cliente Exemplo', pedido: 'VF-0110-S001', data: '01/10/2026', dias: 5, prazo_postagem: 3 };
      if (d.tipo === 'pacotes') {   /* v3: exemplo do e-mail "seu pedido vai em N pacotes" */
        var mp = montarEmailPacotes({ nome: 'Cliente Exemplo', pedido: 'VF-0110-S001', pacotes: [
          { origem: 'SP', itens: ['2x Produto A', '1x Produto B'] }, { origem: 'MS', itens: ['1x Produto C'] }] }, b2.txt);
        var rp = await enviarBrevo(para, '', '[TESTE] ' + mp.assunto, mp.texto);
        return resp(rp.ok ? { ok: true, enviado_para: para, pedido_exemplo: 'VF-0110-S001' } : { ok: false, erro: rp.erro });
      }
      var tipo = d.tipo === 'lembrete' ? 'lembrete' : 'primeiro';
      var m = montarEmail(ex, tipo, b2.txt);
      var r = await enviarBrevo(para, '', '[TESTE] ' + m.assunto, m.texto);
      return resp(r.ok ? { ok: true, enviado_para: para, pedido_exemplo: ex.pedido } : { ok: false, erro: r.erro });
    }
    return resp({ ok: false, erro: 'acao desconhecida' }, 400);
  } catch (e) {
    console.error('[logistica-painel] ' + (e && e.message || e));
    return resp({ ok: false, erro: String(e && e.message || e) }, 500);
  }
};

/* usado pela logistica-atrasos.js (agendada) e pelos testes */
exports.lib = { lerBase: lerBase, montarPedidos: montarPedidos, calcularNumeros: calcularNumeros, calcularAtrasos: calcularAtrasos,
  decidirEnvio: decidirEnvio, ehRevendedor: ehRevendedor, montarEmail: montarEmail, enviarBrevo: enviarBrevo, htmlEmail: htmlEmail, conferirAdmin: conferirAdmin,
  EMAIL_PADRAO: EMAIL_PADRAO, EMAIL_CFG_PADRAO: EMAIL_CFG_PADRAO, transpNome: transpNome, fornNome: fornNome, RAIZ: RAIZ,
  /* v3 */
  casarCodigos: casarCodigos, parear: parear, pendentesCodigo: pendentesCodigo, filaOnlog: filaOnlog, rodadaCodigos: rodadaCodigos,
  emailPacotes: emailPacotes, enviarPacotesPendentes: enviarPacotesPendentes, montarEmailPacotes: montarEmailPacotes, lerPacotes: lerPacotes,
  itensDoPacote: itensDoPacote, transpPorFormato: transpPorFormato, transpOnlog: transpOnlog, familia: familia, limparEntrada: limparEntrada,
  limparCod: limparCod, codigoValido: codigoValido, novoTicket: novoTicket, conferirTicket: conferirTicket, fonteColetor: fonteColetor };
