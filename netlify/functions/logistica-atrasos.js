'use strict';
/* =============================================================================
   logistica-atrasos.js — ROTINA DIÁRIA DA LOGÍSTICA: e-mail de atraso, pacotes, cupom de atraso e parados (VitaFlow)  ·  v3  ·  01/10/2026
   v3 (01/10/2026): todo dia útil, além do que já fazia, (3) gera os CUPONS DE ATRASO dos pedidos que passaram da previsão
       máxima de entrega e manda o e-mail do cupom (logistica-painel v4 → cuponsAtraso; chave própria: cupom_atraso_modo) e
       (4) manda no WhatsApp da logística o resumo dos PEDIDOS PARADOS há mais de 3 dias úteis no mesmo status
       (logistica-painel v4 → avisoParados; chave: parados_whatsapp). Os dois rodam mesmo com o e-mail de atraso desligado,
       e a falha de um não para os outros (vai aviso no Telegram).
   v2 (01/10/2026): PACOTES. (1) O pedido dividido em pacotes (linhas D com PEDIDO_ORIGINAL) recebe UM e-mail de atraso por
       pedido: o contador fica na chave do pedido ORIGINAL (k_email da logistica-painel v3) e o texto fala no número original.
       (2) Todo dia útil, antes do e-mail de atraso, manda os e-mails "seu pedido vai em N pacotes" que ficaram esperando a
       origem do pacote (logistica-painel v3 → enviarPacotesPendentes; depois de 20 h manda sem a origem). Isso roda mesmo
       com o e-mail de atraso desligado (o e-mail de pacotes tem a chave própria: email_pacotes_modo).
   Netlify Function AGENDADA no repo vitaflow-proxy → netlify/functions/logistica-atrasos.js
   Agenda no netlify.toml: [functions."logistica-atrasos"] schedule = "0 13 * * 1-5"  (10h de Brasília, seg a sex)
   (função agendada não abre por URL — o teste manual é o botão "Enviar e-mail de teste" no painel)

   REGRA (decisão do Thiago, 01/10/2026 — "1 + lembretes"):
     - pedido PAGO que passou do prazo de POSTAGEM (3 dias úteis no varejo, 6 no atacado — PRAZOS_ENTREGA da
       rastreio-consulta v3) e ainda não foi postado → 1º e-mail;
     - continua sem postar → lembrete a cada 3 dias úteis; no máximo 3 e-mails por pedido;
     - só pedidos confirmados nos últimos 45 dias (pedido antigo com status parado na planilha não recebe nada);
     - feriado nacional: não roda.
   Pós-compra é só por e-mail (Regra 7). Remetente e conta: os mesmos do Apps Script (Brevo, contato@).

   MODO (aba Atrasos do painel → vitaflow_sync/logistica/config/email_atraso_modo):
     desligado (padrão) → não manda nada · teste → manda só 1 e-mail (o 1º da fila) para o e-mail de teste, sem
     contar · ligado → manda para os clientes.
   GRAVA: vitaflow_sync/logistica/email_atraso/<pedido> = { n, ultimo, envios:{<ts>:'primeiro'|'lembrete'} }
          vitaflow_sync/logistica/email_atraso_log/<aaaammdd> = { ts, modo, elegiveis, enviados, falhas, erros }
   Variáveis de ambiente: FIREBASE_SECRET · BREVO_API_KEY (a mesma do Apps Script: Configurações do projeto →
   Propriedades do script → BREVO_API_KEY) · TELEGRAM_TOKEN/TELEGRAM_CHAT (aviso só quando algum envio falha).
   ============================================================================= */
var R = require('./rastreio-consulta.js').lib;
var P = require('./logistica-painel.js').lib;

var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var FB_SECRET = process.env.FIREBASE_SECRET || '';
var MAX_POR_RODADA = 80;

async function fbPatch(caminho, obj) {
  var r = await fetch(FB_BASE + '/' + caminho + '.json?auth=' + encodeURIComponent(FB_SECRET), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
  if (!r.ok) throw new Error('firebase PATCH ' + r.status + ' ' + caminho);
}
async function telegram(txt) {
  var t = process.env.TELEGRAM_TOKEN, c = process.env.TELEGRAM_CHAT;
  if (!t || !c) return;
  try {
    await fetch('https://api.telegram.org/bot' + t + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: c, text: txt }) });
  } catch (e) { /* aviso interno: falha não para nada */ }
}

async function rodar(agora) {
  agora = agora || Date.now();
  if (!FB_SECRET) return { ok: false, erro: 'sem FIREBASE_SECRET' };
  if (!R.diaUtilBR(agora)) return { ok: true, pulou: 'dia não útil' };
  /* v2: e-mails de pacotes que ficaram esperando a origem (falha aqui não para o e-mail de atraso) */
  var pacotes = null;
  try { pacotes = await P.enviarPacotesPendentes(agora); } catch (eP) { pacotes = { erro: String(eP && eP.message || eP) }; }
  var base = await P.lerBase(true);
  var peds = P.montarPedidos(base);
  /* v3: cupom de atraso na entrega e resumo dos parados (cada um com a sua chave; falha vira aviso e a rotina segue) */
  var cupons = null, parados = null;
  try { cupons = await P.cuponsAtraso({ agora: agora, base: base, peds: peds }); } catch (eC) { cupons = { ok: false, erro: String(eC && eC.message || eC) }; }
  try { parados = await P.avisoParados({ agora: agora, base: base, peds: peds }); } catch (eS) { parados = { ok: false, erro: String(eS && eS.message || eS) }; }
  if (cupons && cupons.lista) delete cupons.lista;   /* o log não precisa da lista */
  if (cupons && (cupons.erro || cupons.falhas)) await telegram('⚠️ CUPOM DE ATRASO: ' + (cupons.erro || (cupons.falhas + ' falha(s)\n' + (cupons.erros || []).slice(0, 3).join('\n'))));
  if (parados && parados.erro) await telegram('⚠️ PEDIDOS PARADOS: o resumo no WhatsApp falhou — ' + parados.erro);
  var cfg = Object.assign({}, P.EMAIL_CFG_PADRAO, base.cfg || {});
  var modo = cfg.email_atraso_modo || 'desligado';
  if (modo === 'desligado') return { ok: true, modo: modo, pacotes: pacotes, cupons: cupons, parados: parados };
  var lista = await P.calcularAtrasos(base, peds, agora);
  var fila = [];
  lista.forEach(function (a) { var tipo = P.decidirEnvio(a, cfg, agora); if (tipo) fila.push({ a: a, tipo: tipo }); });
  var log = { ts: agora, modo: modo, atrasados: lista.length, elegiveis: fila.length, enviados: 0, falhas: 0, erros: [] };

  if (modo === 'teste') {
    var para = String(cfg.email_atraso_teste || '').trim();
    if (fila.length && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(para)) {
      var m0 = P.montarEmail(fila[0].a, fila[0].tipo, base.txt);
      var r0 = await P.enviarBrevo(para, '', '[TESTE] ' + m0.assunto, m0.texto);
      if (r0.ok) log.enviados = 1; else { log.falhas = 1; log.erros.push(r0.erro); }
    } else if (fila.length) { log.erros.push('modo teste sem e-mail de teste válido'); }
  } else if (modo === 'ligado') {
    fila = fila.slice(0, MAX_POR_RODADA);
    for (var i = 0; i < fila.length; i += 5) {
      var lote = fila.slice(i, i + 5);
      var rs = await Promise.all(lote.map(function (x) {
        var m = P.montarEmail(x.a, x.tipo, base.txt);
        return P.enviarBrevo(x.a.email, x.a.nome, m.assunto, m.texto);
      }));
      for (var j = 0; j < lote.length; j++) {
        var x = lote[j];
        if (rs[j].ok) {
          log.enviados++;
          var envios = {}; envios[agora + j] = x.tipo;
          try {
            var kE = x.a.k_email || x.a.k;   /* v2: pacote (linha D) conta no pedido original */
            await fbPatch(P.RAIZ + '/email_atraso/' + kE, { n: (x.a.emails || 0) + 1, ultimo: agora, pedido: x.a.pedido_email || x.a.pedido });
            await fbPatch(P.RAIZ + '/email_atraso/' + kE + '/envios', envios);
          } catch (eG) { log.erros.push(x.a.pedido + ': enviado, mas não gravou (' + eG.message + ')'); }
        } else { log.falhas++; if (log.erros.length < 10) log.erros.push(x.a.pedido + ': ' + rs[j].erro); }
      }
    }
  }
  var dia = R.diaBR(agora).replace(/-/g, '');
  try { await fbPatch(P.RAIZ + '/email_atraso_log', (function () { var o = {}; o[dia] = log; return o; })()); } catch (eL) { console.error(eL.message); }
  if (log.falhas) {   /* Telegram só quando falha (o resumo do dia fica no log, visível no painel) */
    await telegram('⚠️ E-MAIL DE ATRASO (' + modo + '): ' + log.falhas + ' falha(s) de ' + log.elegiveis + '\n' + log.erros.slice(0, 3).join('\n'));
  }
  return { ok: true, log: log, pacotes: pacotes, cupons: cupons, parados: parados };
}

exports.handler = async function () {
  try {
    var r = await rodar();
    console.log('[logistica-atrasos] ' + JSON.stringify(r).slice(0, 800));
    return { statusCode: 200, body: JSON.stringify(r) };
  } catch (e) {
    console.error('[logistica-atrasos] erro: ' + (e && e.message || e));
    await telegram('⚠️ E-MAIL DE ATRASO: a rotina deu erro — ' + String(e && e.message || e).slice(0, 200));
    return { statusCode: 500, body: JSON.stringify({ ok: false, erro: String(e && e.message || e) }) };
  }
};
exports._rodar = rodar;
