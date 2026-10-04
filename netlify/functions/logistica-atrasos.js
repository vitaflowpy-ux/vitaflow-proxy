'use strict';
/* =============================================================================
   logistica-atrasos.js — ROTINA DIÁRIA DA LOGÍSTICA: e-mail de aviso de postagem, pacotes, cupom de atraso e parados (VitaFlow)  ·  v5  ·  04/10/2026
   v5 (OK do Thiago, 04/10: "ok, pode fazer tudo"): (5) manda no WhatsApp da logística o RESUMO DAS PASSADAS (rastreio automático e
       rodada de códigos desde o último resumo, o que está esperando a logística e alerta se uma rotina parou) — logistica-painel v13
       → avisoPassadas; chave: passadas_whatsapp. Roda mesmo com o e-mail de postagem desligado; falha vira aviso no Telegram.
   v4 (ordem do Thiago, 01-02/10): O E-MAIL DE ATRASO VIROU E-MAIL DE AVISO DE POSTAGEM (logistica-painel v6). Todo dia útil, o pedido
       que a logística marcou como POSTADO e a transportadora ainda não leu recebe UM e-mail com o mesmo aviso da página de
       rastreio (texto 1 sem código, texto 2 com código). Sem lembrete. Chave: email_postagem_modo (desligado é o padrão).
       GRAVA: vitaflow_sync/logistica/email_postagem/<pedido> = { n, ultimo, pedido, tipo } e email_postagem_log/<aaaammdd>.
       O e-mail antigo ("ainda está em separação", com lembretes) não é mais enviado. O resto (pacotes, cupom, parados) = v3.
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

   REGRA ANTIGA DO E-MAIL DE ATRASO (até a v3 — NÃO VALE MAIS desde a v4; fica só como história):
     - pedido PAGO que passou do prazo de POSTAGEM (3 dias úteis no varejo, 6 no atacado — PRAZOS_ENTREGA da
       rastreio-consulta v3) e ainda não foi postado → 1º e-mail;
     - continua sem postar → lembrete a cada 3 dias úteis; no máximo 3 e-mails por pedido;
     - só pedidos confirmados nos últimos 45 dias (pedido antigo com status parado na planilha não recebe nada);
     - feriado nacional: não roda.
   Pós-compra é só por e-mail (Regra 7). Remetente e conta: os mesmos do Apps Script (Brevo, contato@).

   MODO (v4: aba Atrasos do painel → vitaflow_sync/logistica/config/email_postagem_modo):
     desligado (padrão) → não manda nada · teste → manda só 1 e-mail (o 1º da fila) para o e-mail de teste, sem
     contar · ligado → manda para os clientes.
   GRAVA (v4): vitaflow_sync/logistica/email_postagem/<pedido> = { n, ultimo, pedido, tipo }
          vitaflow_sync/logistica/email_postagem_log/<aaaammdd> = { ts, modo, postados, elegiveis, enviados, falhas, erros }
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
  var cupons = null, parados = null, passadas = null;
  try { cupons = await P.cuponsAtraso({ agora: agora, base: base, peds: peds }); } catch (eC) { cupons = { ok: false, erro: String(eC && eC.message || eC) }; }
  try { parados = await P.avisoParados({ agora: agora, base: base, peds: peds }); } catch (eS) { parados = { ok: false, erro: String(eS && eS.message || eS) }; }
  if (cupons && cupons.lista) delete cupons.lista;   /* o log não precisa da lista */
  if (cupons && (cupons.erro || cupons.falhas)) await telegram('⚠️ CUPOM DE ATRASO: ' + (cupons.erro || (cupons.falhas + ' falha(s)\n' + (cupons.erros || []).slice(0, 3).join('\n'))));
  if (parados && parados.erro) await telegram('⚠️ PEDIDOS PARADOS: o resumo no WhatsApp falhou — ' + parados.erro);
  /* v5: resumo das passadas no WhatsApp da logística */
  try { passadas = await P.avisoPassadas({ agora: agora, base: base, peds: peds }); } catch (eR) { passadas = { ok: false, erro: String(eR && eR.message || eR) }; }
  if (passadas && passadas.erro) await telegram('⚠️ RESUMO DAS PASSADAS: o aviso no WhatsApp falhou — ' + passadas.erro);
  /* v4: e-mail de AVISO DE POSTAGEM (substitui o e-mail de atraso) */
  var cfg = Object.assign({}, P.EMAIL_CFG_PADRAO, base.cfg || {});
  var modo = cfg.email_postagem_modo || 'desligado';
  if (modo === 'desligado') return { ok: true, modo: modo, pacotes: pacotes, cupons: cupons, parados: parados, passadas: passadas };
  var lista = await P.calcularPostagens(base, peds, agora);
  var fila = lista.filter(function (x) { return !!P.decidirPostagem(x); });
  var log = { ts: agora, modo: modo, postados: lista.length, elegiveis: fila.length, enviados: 0, falhas: 0, erros: [] };

  if (modo === 'teste') {
    var para = String(cfg.email_postagem_teste || cfg.email_atraso_teste || '').trim();
    if (fila.length && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(para)) {
      var m0 = P.montarEmailPostagem(fila[0], base.txt);
      var r0 = await P.enviarBrevo(para, '', '[TESTE] ' + m0.assunto, m0.texto, m0.destaque);
      if (r0.ok) log.enviados = 1; else { log.falhas = 1; log.erros.push(r0.erro); }
    } else if (fila.length) { log.erros.push('modo teste sem e-mail de teste válido'); }
  } else if (modo === 'ligado') {
    fila = fila.slice(0, MAX_POR_RODADA);
    for (var i = 0; i < fila.length; i += 5) {
      var lote = fila.slice(i, i + 5);
      var rs = await Promise.all(lote.map(function (x) {
        var m = P.montarEmailPostagem(x, base.txt);
        return P.enviarBrevo(x.email, x.nome, m.assunto, m.texto, m.destaque);
      }));
      for (var j = 0; j < lote.length; j++) {
        var x = lote[j];
        if (rs[j].ok) {
          log.enviados++;
          try { await fbPatch(P.RAIZ + '/email_postagem/' + x.k_email, { n: 1, ultimo: agora, pedido: x.pedido_email || x.pedido, tipo: x.tipo }); }
          catch (eG) { log.erros.push(x.pedido + ': enviado, mas não gravou (' + eG.message + ')'); }
        } else { log.falhas++; if (log.erros.length < 10) log.erros.push(x.pedido + ': ' + rs[j].erro); }
      }
    }
  }
  var dia = R.diaBR(agora).replace(/-/g, '');
  try { await fbPatch(P.RAIZ + '/email_postagem_log', (function () { var o = {}; o[dia] = log; return o; })()); } catch (eL) { console.error(eL.message); }
  if (log.falhas) {   /* Telegram só quando falha (o resumo do dia fica no log, visível no painel) */
    await telegram('⚠️ E-MAIL DE AVISO DE POSTAGEM (' + modo + '): ' + log.falhas + ' falha(s) de ' + log.elegiveis + '\n' + log.erros.slice(0, 3).join('\n'));
  }
  return { ok: true, log: log, pacotes: pacotes, cupons: cupons, parados: parados, passadas: passadas };
}

exports.handler = async function () {
  try {
    var r = await rodar();
    console.log('[logistica-atrasos] ' + JSON.stringify(r).slice(0, 800));
    return { statusCode: 200, body: JSON.stringify(r) };
  } catch (e) {
    console.error('[logistica-atrasos] erro: ' + (e && e.message || e));
    await telegram('⚠️ ROTINA DA LOGÍSTICA: deu erro — ' + String(e && e.message || e).slice(0, 200));
    return { statusCode: 500, body: JSON.stringify({ ok: false, erro: String(e && e.message || e) }) };
  }
};
exports._rodar = rodar;
