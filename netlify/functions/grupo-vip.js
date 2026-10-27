'use strict';
/* =============================================================================
   grupo-vip.js — BOT DO GRUPO VIP (VitaFlow)  ·  v8  ·  27/10/2026
   v8 (27/10/2026, leitura da conversa inteira do grupo de 19/09 a 27/10 — pedido do Thiago):
       * SÓ RESPONDE PERGUNTA. Até a v7 qualquer menção à palavra disparava o texto ("tava valor bom
         atacado", "transportadora são fodas", "cobram caro o frete" = 100+ respostas fora de hora).
         Palavra-chave agora só vale com cara de pergunta (? / quanto / qual / como / tem / alguém
         sabe… ou chamando a Stella pelo nome). Comando (!) continua valendo sempre.
       * Cada assunto com padrões mais certeiros: "quantos dias após aplicação" não é prazo de entrega;
         "atacado parcela?" responde o pagamento; "atacado tem seguro?" / "se cair reembolsa?" respondem
         o seguro.
       * Respostas novas: seguro, frete grátis, rastreio (onde está meu pedido), como comprar,
         calculadora (diluição/UI), protocolo, confiança, e BUSCA DE PRODUTO no catálogo do site
         ("vocês têm X?", "tem X no site?", !produto X) com preço, disponibilidade e link.
       * SEM DUPLICADO: o mesmo webhook chegando 2x contava 2 strikes (23/10: participante removido
         no que devia ser o 2º aviso) e postava aviso dobrado. Agora cada mensagem só é tratada uma
         vez (trava atômica por messageId com ETag do Firebase) e as travas de tempo também são atômicas.
       * Textos revistos: atacado com os 2 estoques (CDE e PJC), mínimo por estoque, cartão em 12x e
         seguro; transportadora recomendando a Transportadora (única com seguro); frete por estado com
         a linha do frete grátis; origem com os 2 estoques do Paraguai; site com a Minha Conta.
   v7: texto padrão do !prazo com os PRAZOS NOVOS (tabela por estado aprovada em 29/09; postagem
       varejo 3 dias úteis, atacado 6). O texto que vale no grupo é o do Firebase (painel VIP, aba Textos).
   v6: LINKS LIBERADOS pelo painel (aba Exceções) — grupo_vip/config/links_liberados.
       Cada item e um dominio ("instagram.com" = qualquer link do Instagram) ou
       dominio + caminho ("instagram.com/perfil" = so aquele perfil). Vale na hora,
       sem deploy. Le junto com o config que o bot ja busca — nenhuma leitura a mais.
   Netlify Function no repo vitaflow-proxy → netlify/functions/grupo-vip.js
   Webhook "Ao receber" da instancia Z-API `grupo-vip` aponta pra ca.

   O QUE FAZ (spec: claude/bot_grupo_vip_spec_2026-09-19.md)
   - So atua no Grupo VIP. Mensagem privada => resposta pronta 1x a cada 24h.
   - MODERACAO (mudou em 21/09/2026 — a regra de 19/09 era "nunca apaga, nunca
     remove"; o VitaFlow derrubou ela pra o grupo nao virar classificados):
       * link de fora DURO   -> APAGA a mensagem + conta 1 strike no numero
       * link de fora MOLE   -> so posta o lembrete, nao apaga e nao conta
       * golpe               -> APAGA + texto de golpe + Telegram + conta 1 strike
       * 3o strike           -> REMOVE o numero do grupo
       * admin               -> passa direto, nada e apagado nem contado
     Link do proprio VitaFlow, convite deste grupo e os wa.me oficiais sao liberados.
     (v6) + os links cadastrados no painel, aba Exceções > Links liberados.
   - Responde por comando (!) e por palavra-chave: atacado, frete, prazo,
     transportadora, site, sorteio, origem, telegram. 1x por assunto a cada 10min.
     ADMIN so dispara por COMANDO. Em 21/09 o VitaFlow postou a promo do atacado e o
     bot respondeu com o texto de atacado por cima, porque a palavra "atacado" estava
     no anuncio. Palavra-chave de admin nao dispara mais nada.
   - Textos ficam no Firebase (vitaflow_sync/grupo_vip/textos) e sao editaveis no
     painel. Os defaults abaixo so valem enquanto o no nao existir.

   VARIAVEIS DE AMBIENTE (Netlify > Site settings > Environment variables)
     ZAPI_INSTANCE        id da instancia grupo-vip
     ZAPI_TOKEN           token da instancia
     ZAPI_CLIENT_TOKEN    token de seguranca da CONTA (header Client-Token)
     FIREBASE_SECRET      secret do RTDB pricehub-f0236
     GRUPO_VIP_ID         id do grupo (ex.: 120363...@g.us ou 120363...-group)
                          VAZIO = MODO DESCOBERTA (ver abaixo)
     GRUPO_VIP_ADMINS     telefones dos admins, separados por virgula
     TELEGRAM_TOKEN       bot do Telegram (alertas internos)
     TELEGRAM_CHAT        chat id do Telegram

   LIGA/DESLIGA: vitaflow_sync/grupo_vip/config/ativo === false desliga o bot inteiro
   (respostas, privado e moderacao). Botao no painel. O agendador tem o proprio
   interruptor (config/agendador_ativo) — desligar um nao desliga o outro.

   MODO DESCOBERTA: com GRUPO_VIP_ID vazio o bot NAO responde nada no grupo —
   so grava em vitaflow_sync/grupo_vip/descoberta o phone/chatName de cada chat que
   escreveu. Mande "!id" no grupo (de um numero que esteja em GRUPO_VIP_ADMINS)
   que ele responde com o ID. Preencha a env e o bot entra em operacao.
   ============================================================================= */

var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
/* RAIZ e FILHO de vitaflow_sync de proposito. No novo de TOPO e negado pelas regras
   do RTDB (".write": false na raiz) — a funcao passaria, porque usa o FIREBASE_SECRET,
   mas o painel escreve com o login do admin e seria recusado em silencio.
   Ver o aprendizado do Compras no projeto. (corrigido em 19/09, antes da v2) */
var RAIZ = 'vitaflow_sync/grupo_vip';

var ZAPI_INSTANCE = process.env.ZAPI_INSTANCE || '';
var ZAPI_TOKEN = process.env.ZAPI_TOKEN || '';
var CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || '';
var FB_SECRET = process.env.FIREBASE_SECRET || '';
var GRUPO_VIP_ID = (process.env.GRUPO_VIP_ID || '').trim();
var TG_TOKEN = process.env.TELEGRAM_TOKEN || '';
var TG_CHAT = process.env.TELEGRAM_CHAT || '';

var ADMINS = (process.env.GRUPO_VIP_ADMINS || '')
  .split(',').map(function (s) { return so_digitos(s); }).filter(Boolean);

/* Quantas vezes o texto COM APRESENTACAO sai antes de virar a versao curta.
   O bot e novo no grupo (21/09/2026) e ninguem sabe que ele existe; depois das
   primeiras vezes "prazer, eu sou o bot" fica estranho. Contador global em
   vitaflow_sync/grupo_vip/contadores/apresentacoes, zeravel pelo painel. */
var APRESENTACOES_MAX = 5;

/* 3o link de fora = sai do grupo. O contador NAO zera sozinho (decidido em
   21/09) — quem perdoa e o VitaFlow, pelo botao da aba Reincidentes. */
var STRIKES_MAX = 3;

/* ------------------------------------------------------------------ helpers */
function so_digitos(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }

function zapiUrl(rota) {
  return 'https://api.z-api.io/instances/' + ZAPI_INSTANCE + '/token/' + ZAPI_TOKEN + '/' + rota;
}

function fbUrl(caminho) {
  return FB_BASE + '/' + caminho + '.json' + (FB_SECRET ? '?auth=' + FB_SECRET : '');
}

async function fbGet(caminho) {
  try {
    var r = await fetch(fbUrl(caminho));
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function fbPut(caminho, valor) {
  try {
    await fetch(fbUrl(caminho), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(valor)
    });
    return true;
  } catch (e) { return false; }
}

/* Em 19/09 o bot recebeu um !site, roteou certo, gravou a trava... e nao respondeu.
   O log da Netlify ficou MUDO porque esta funcao engolia o erro e devolvia false.
   Uma hora de diagnostico que teria sido 10 segundos com uma linha de console.error.
   Agora toda falha de envio aparece no log da funcao. */
async function enviar(paraPhone, texto) {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN) {
    console.error('[grupo-vip] envio abortado: ZAPI_INSTANCE ou ZAPI_TOKEN vazia');
    return false;
  }
  try {
    var r = await fetch(zapiUrl('send-text'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': CLIENT_TOKEN },
      body: JSON.stringify({ phone: paraPhone, message: texto })
    });
    if (!r.ok) {
      var corpo = '';
      try { corpo = await r.text(); } catch (e2) { corpo = '(sem corpo)'; }
      console.error('[grupo-vip] send-text HTTP ' + r.status + ' para ' + paraPhone +
                    ' | Client-Token ' + (CLIENT_TOKEN ? 'presente' : 'AUSENTE') +
                    ' | resposta: ' + String(corpo).slice(0, 400));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[grupo-vip] send-text estourou: ' + e.message);
    return false;
  }
}

/* ---------------------------------------------------- apagar e remover (Z-API)
   Doc: DELETE /instances/{id}/token/{token}/messages?messageId=&phone=&owner=
   owner=false porque a mensagem foi RECEBIDA, nao enviada pelo bot.
   So funciona com o numero do bot sendo ADMIN do grupo — o VitaFlow confirmou
   em 21/09 que ele e. Se um dia deixar de ser, a Z-API responde 200 e a mensagem
   fica no lugar, por isso o log abaixo grava a resposta inteira. */
async function apagarMensagem(chatPhone, messageId) {
  if (!messageId) {
    console.error('[grupo-vip] nao apagou: webhook veio sem messageId');
    return false;
  }
  try {
    var url = zapiUrl('messages') + '?messageId=' + encodeURIComponent(messageId) +
              '&phone=' + encodeURIComponent(chatPhone) + '&owner=false';
    var r = await fetch(url, { method: 'DELETE', headers: { 'Client-Token': CLIENT_TOKEN } });
    var corpo = '';
    try { corpo = await r.text(); } catch (e2) { corpo = '(sem corpo)'; }
    if (!r.ok) {
      console.error('[grupo-vip] delete HTTP ' + r.status + ' | ' + String(corpo).slice(0, 400));
      return false;
    }
    console.log('[grupo-vip] apagou ' + messageId + ' | resposta: ' + String(corpo).slice(0, 200));
    return true;
  } catch (e) {
    console.error('[grupo-vip] delete estourou: ' + e.message);
    return false;
  }
}

/* POST /instances/{id}/token/{token}/remove-participant  { groupId, phones: [] }
   O corpo esta confirmado na doc; o ultimo pedaco da URL a doc nao mostra escrito,
   entao o log abaixo grava status e resposta pra aparecer na primeira tentativa se
   estiver errado, em vez de falhar calado. */
async function removerDoGrupo(numero) {
  try {
    var r = await fetch(zapiUrl('remove-participant'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': CLIENT_TOKEN },
      body: JSON.stringify({ groupId: GRUPO_VIP_ID, phones: [numero] })
    });
    var corpo = '';
    try { corpo = await r.text(); } catch (e2) { corpo = '(sem corpo)'; }
    if (!r.ok) {
      console.error('[grupo-vip] remove-participant HTTP ' + r.status + ' | ' + String(corpo).slice(0, 400));
      return false;
    }
    console.log('[grupo-vip] removeu ' + numero + ' | resposta: ' + String(corpo).slice(0, 200));
    return true;
  } catch (e) {
    console.error('[grupo-vip] remove-participant estourou: ' + e.message);
    return false;
  }
}

async function telegram(texto) {
  if (!TG_TOKEN || !TG_CHAT) return false;
  try {
    await fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: texto, disable_web_page_preview: true })
    });
    return true;
  } catch (e) { return false; }
}

/* ----------------------------------------------------------- trava de tempo
   Impede o bot de repetir a mesma resposta. Grava o timestamp no Firebase.
   Retorna true quando PODE falar.
   v8: ATÔMICA. Até a v7 era "lê, confere, grava" — duas chamadas do webhook ao mesmo tempo
   liam as duas "livre" e as duas falavam (aviso dobrado no grupo em 14/10 e 21/10).
   Agora lê com ETag e grava com if-match: só uma das duas consegue (a outra leva 412).
   Firebase fora do ar = deixa passar (melhor falar 2x do que calar o bot).              */
async function fbLerComEtag(caminho) {
  var r = await fetch(fbUrl(caminho), { headers: { 'X-Firebase-ETag': 'true' } });
  if (!r.ok) return null;
  return { etag: r.headers.get('ETag'), valor: await r.json() };
}
async function fbGravarSeIgual(caminho, etag, valor) {
  var r = await fetch(fbUrl(caminho), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'if-match': etag },
    body: JSON.stringify(valor)
  });
  return r.status !== 412 && r.ok;
}
async function travaOk(chave, minutos) {
  var agora = Date.now(), caminho = RAIZ + '/travas/' + chave;
  try {
    var lido = await fbLerComEtag(caminho);
    if (!lido || !lido.etag) return true;
    var reg = lido.valor;
    if (reg && reg.t && (agora - reg.t) < minutos * 60000) return false;
    return await fbGravarSeIgual(caminho, lido.etag, { t: agora });
  } catch (e) { return true; }
}

/* v8: cada mensagem é tratada UMA vez. Em 23/10 o mesmo link chegou 2x pelo webhook, contou
   2 strikes e o participante saiu do grupo no que devia ser o 2º aviso (em 14/10 o aviso de
   remoção saiu dobrado). Marca vitaflow_sync/grupo_vip/vistos/<dia>/<messageId> de forma atômica;
   quem chegar depois desiste. Sem messageId (não deveria acontecer) = segue como antes.        */
function diaBRT() {
  return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');
}
async function primeiraVez(messageId) {
  if (!messageId) return true;
  var dia = diaBRT();
  var caminho = RAIZ + '/vistos/' + dia + '/' + String(messageId).replace(/[.#$\/\[\]]/g, '_');
  try {
    var lido = await fbLerComEtag(caminho);
    if (!lido || !lido.etag) return true;
    if (lido.valor !== null) return false;
    var ok = await fbGravarSeIgual(caminho, lido.etag, Date.now());
    /* faxina: de vez em quando apaga o dia de anteontem (o nó não cresce pra sempre) */
    if (ok && Math.random() < 0.05) {
      var ante = new Date(Date.now() - 3 * 3600000 - 2 * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
      try { await fetch(fbUrl(RAIZ + '/vistos/' + ante), { method: 'DELETE' }); } catch (e2) {}
    }
    return ok;
  } catch (e) { return true; }
}

/* ------------------------------------------------------------ data/hora BRT
   Netlify roda em UTC. Todas as datas do sorteio sao de Brasilia (UTC-3),
   entao construimos sempre em UTC ja somando 3h.                             */
function brt(y, m, d, h) { return new Date(Date.UTC(y, m, d, (h || 0) + 3, 0, 0)); }

function ddmm(dt) {
  return dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
}
function diaSemana(dt) {
  return dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
}

/* Mesma conta da pagina_sorteio.html (fecha sabado 23h59, apura domingo 11h).
   NUNCA escrever data na mao. */
function cicloSorteio(d) {
  var C1 = brt(2026, 7, 22, 0), C2 = brt(2026, 8, 5, 0), C3 = brt(2026, 8, 20, 0);
  var PASSO = 14 * 86400000, HORA = 11;
  if (d < C2) return { n: 1, ini: C1, fim: new Date(C2.getTime() - 1000), sort: brt(2026, 8, 6, HORA) };
  if (d < C3) return { n: 2, ini: C2, fim: new Date(C3.getTime() - 1000), sort: new Date(C3.getTime() + (HORA * 3600000)) };
  var k = Math.floor((d - C3) / PASSO); if (k < 0) k = 0;
  var ini = new Date(C3.getTime() + k * PASSO);
  var vira = new Date(ini.getTime() + PASSO);
  return { n: k + 3, ini: ini, fim: new Date(vira.getTime() - 1000), sort: new Date(vira.getTime() + (HORA * 3600000)) };
}

/* ------------------------------------------------------------------ textos
   Default no codigo; o que estiver em vitaflow_sync/grupo_vip/textos vence.       */
var T = {
  /* ---- MODERACAO (21/09/2026) ----
     mod_apresenta  1o strike, so nas APRESENTACOES_MAX primeiras vezes do grupo
     mod1           1o strike, depois que a apresentacao ja rodou
     mod2           2o strike — avisa que a proxima e remocao
     mod3           3o strike — postado DEPOIS de remover
     regras         link duvidoso: o bot NAO apagou, so lembra a regra
     golpe          so quando ehGolpe() bate. Nao acusa ninguem de proposito:
                    a peneira e grossa e pode disparar em cliente de bem.        */
  mod_apresenta:
'👋 *Oi, gente! Prazer — eu sou o bot do Grupo VIP.*\n⠀\n' +
'Talvez você nem tenha notado que eu estava aqui, mas eu fico de plantão 24h. Pergunta de frete, prazo, rastreio, atacado ou sorteio — joga aqui que eu respondo na hora.\n⠀\n' +
'E aí vem a parte chata do meu trabalho: *acabei de apagar um link que não é da VitaFlow.* Nada pessoal, juro! 😅\n⠀\n' +
'É que este grupo existe pra falar dos *nossos produtos* e dos assuntos da *VitaFlow*. Se cada um começar a divulgar a sua loja, o seu serviço ou o seu link aqui dentro, em uma semana isso vira grupo de classificados — e quem entrou pra ver promoção, reposição e novidade não acha mais nada no meio da bagunça.\n⠀\n' +
'Então fica combinado: *link de fora, não.* O resto é livre — dúvida, foto do pedido que chegou, elogio, reclamação, sugestão. É exatamente pra isso que o grupo existe. 💙',

  mod1:
'🚫 *Link de fora removido*\n⠀\n' +
'Aqui é o canal da VitaFlow — divulgação de outras lojas, produtos ou serviços não fica no grupo, senão isso vira classificados.\n⠀\n' +
'O resto é livre: dúvida, foto do pedido que chegou, elogio, reclamação. 💙',

  mod2:
'⚠️ *Opa, de novo!*\n⠀\n' +
'Apaguei mais um link de fora — esse é o *segundo* seu.\n⠀\n' +
'Não é implicância: o grupo é da VitaFlow e existe pra falar dos nossos produtos. Se virar mural de divulgação, todo mundo perde.\n⠀\n' +
'*Na próxima eu vou ter que te tirar do grupo.* Prefiro não precisar. 🙏',

  mod3:
'🚪 *Removi um participante do grupo*\n⠀\n' +
'Insistiu em postar divulgação de fora depois de dois avisos.\n⠀\n' +
'A regra é uma só: *link de fora, não.* O resto é livre por aqui. 💙',

  regras:
'📌 Lembrete rápido: aqui é canal da VitaFlow, divulgação de fora não fica no grupo. O resto é livre. 💙',

  golpe:
'🚨 *Atenção*\n⠀\n' +
'🔒 A VitaFlow *nunca* pede pra você *sair deste grupo* nem *trocar por outro grupo de WhatsApp*. Nossos canais oficiais estão todos no site *vitaflowoficial.com* e o nosso e-mail é *contato@vitaflowoficial.com*. Qualquer link diferente disso = golpe.',

  privado:
'📵 *ESTE NÚMERO AGORA É AUTOMÁTICO*\n⠀\n' +
'Ele cuida só dos avisos do *Grupo VIP*. *Não faço mais atendimento por aqui* — não leio as mensagens que chegam neste número.\n⠀\n' +
'💬 *Fale comigo no meu número oficial:*\n*(11) 91133-8515*\n👉 wa.me/5511911338515\n⠀\n' +
'📲 *Salve esse meu outro contato.* Assim você me acha na hora que precisar.\n⠀\n' +
'Se preferir:\n🤖 *Athena*, nossa consultora 24h → wa.me/5511926100192\n🌐 Site oficial → *vitaflowoficial.com*\n⠀\n' +
'Te espero lá! 💚',

  prazo:
'⏱️ *PRAZOS DE ENVIO E ENTREGA*\n⠀\n' +
'📦 *Postagem:* até *3 dias úteis* depois que o pagamento é confirmado — o mesmo prazo pra todo envio do varejo, saindo de SP ou de MS. Com o aumento das fiscalizações, as postagens saem em lotes controlados por dia.\n⠀\n' +
'🚚 *Entrega, a partir da postagem (dias úteis):*\n' +
'• Sudeste — SP e RJ *1 a 6* · MG *2 a 6* · ES *2 a 8*\n• Sul — PR *2 a 6* · SC *2 a 7* · RS *2 a 5*\n' +
'• Centro-Oeste — DF *3 a 6* · GO *2 a 6* · MS *4 a 8* · MT *4 a 9*\n' +
'• Nordeste — BA *3 a 10* · demais estados *5 a 11*\n• Norte — *7 a 11*\n⠀\n' +
'🏭 *Atacado:* postagem em até *6 dias úteis* após a confirmação. Depois disso, valem os prazos de entrega acima.\n⠀\n' +
'🔎 Acompanhe o seu em *vitaflowoficial.com/pages/rastrear-pedido*\n⠀\n' +
'_Estimativas em dias úteis; variam com distância e condições de entrega._',

  transportadora:
'🚚 *COMO ENVIAMOS*\n⠀\n' +
'No fechamento do pedido você escolhe:\n' +
'🚛 *Transportadora* (Jadlog, Loggi, J&T Express ou Total Express) — com *seguro grátis* contra apreensão e extravio\n' +
'📮 *PAC* ou ⚡ *SEDEX* (Correios) — *sem* seguro\n⠀\n' +
'👉 A gente recomenda a *Transportadora*: é a única opção com seguro.',

  atacado:
'🏭 *ATACADO VITAFLOW*\n⠀\n' +
'Compra direto pelo site, 24h, com o preço do dia:\n👉 *vitaflowoficial.com/pages/atacado*\n⠀\n' +
'Agora são *2 estoques*: *Ciudad del Este* e *Pedro Juan Caballero* — você escolhe na página.\n⠀\n' +
'✅ *Frete grátis* para todo o Brasil\n' +
'✅ Pedido mínimo de *R$ 3.000 por estoque* (pode misturar produtos do mesmo estoque)\n' +
'✅ *Pix* ou *cartão em até 12x*\n' +
'✅ *Seguro grátis* contra apreensão e extravio\n⠀\n' +
'Cada estoque é um pedido separado. Prefere pelo WhatsApp? A *Athena* também fecha o seu atacado:\n🤖 wa.me/5511926100192\n⠀\n' +
'_Atacado não entra em cupom nem promoção — o benefício é o frete grátis._',

  atacado_pagamento:
'💳 *ATACADO: PIX OU CARTÃO EM ATÉ 12x*\n⠀\n' +
'Na página do atacado tem o botão *"Simular parcelas"* — você vê as parcelas antes de fechar.\n' +
'👉 *vitaflowoficial.com/pages/atacado*\n⠀\n' +
'Frete grátis e pedido mínimo de *R$ 3.000 por estoque*.',

  seguro:
'🛡️ *SEGURO GRÁTIS*\n⠀\n' +
'Cobre *apreensão e extravio*, sem custo nenhum, nos envios por *Transportadora* — no varejo e no atacado.\n⠀\n' +
'Se acontecer, você não fica no prejuízo: o pedido é *reenviado ou reembolsado*. É só falar com a nossa logística:\n' +
'💬 wa.me/447537155718 (seg a sex 8h–18h · sáb 9h–14h)\n⠀\n' +
'⚠️ *PAC e SEDEX (Correios) não têm o seguro.* Na hora de fechar, escolha *Transportadora*.',

  frete_gratis:
'🚚 *FRETE GRÁTIS*\n⠀\n' +
'• *Varejo:* automático em pedidos a partir de *R$ 1.000* em produtos — sem cupom, aparece direto no carrinho.\n' +
'• *Atacado:* sempre grátis (pedido mínimo de R$ 3.000 por estoque).\n⠀\n' +
'Não acumula com cupom ou outra promoção: se o pedido tiver mais de um benefício, o carrinho mostra as opções e você escolhe a melhor.\n⠀\n' +
'🛡️ O seguro grátis continua valendo na *Transportadora*.',

  rastreio:
'🔎 *ONDE ESTÁ O MEU PEDIDO?*\n⠀\n' +
'Acompanhe por aqui, a qualquer hora:\n' +
'👉 *vitaflowoficial.com/pages/rastrear-pedido*\n' +
'👉 ou na sua *Minha Conta*: vitaflowoficial.com/pages/minha-conta\n⠀\n' +
'Quando o pedido é postado, você também recebe um e-mail com o rastreio.\n⠀\n' +
'Algo diferente do esperado? Fale com a logística:\n💬 wa.me/447537155718 (seg a sex 8h–18h · sáb 9h–14h)',

  comprar:
'🛒 *COMO COMPRAR NA VITAFLOW*\n⠀\n' +
'🌐 *No site*, 24h: *vitaflowoficial.com* — Pix ou cartão em até 12x\n' +
'🤖 *Com a Athena*, no WhatsApp: wa.me/5511926100192\n' +
'💬 *Atendimento:* wa.me/5511911338515\n⠀\n' +
'🏭 Atacado (a partir de R$ 3.000, frete grátis): vitaflowoficial.com/pages/atacado',

  calculadora:
'🧮 *CALCULADORA DE PEPTÍDEOS*\n⠀\n' +
'Quanto de água colocar e quantas unidades (UI) marcar na seringa — a calculadora faz a conta pra você, de graça:\n' +
'👉 *vitaflowoficial.com/pages/calculadora-de-peptideos*\n⠀\n' +
'_Cada marca tem a sua concentração: confira a do seu frasco antes de calcular._',

  protocolo:
'📋 *GERADOR DE PROTOCOLOS*\n⠀\n' +
'Monte um protocolo de peptídeos ou de hormônios em 2 minutos, de graça:\n' +
'👉 *vitaflowoficial.com/pages/gerador-de-protocolo*\n⠀\n' +
'_É material de referência — a dose certa pra você deve ser acompanhada por um profissional de saúde._',

  confianca:
'💙 *SOBRE A VITAFLOW*\n⠀\n' +
'São *8 anos* de mercado. Se algo der errado com o seu pedido, a gente resolve: *reenvio, troca ou reembolso*.\n⠀\n' +
'🛡️ Escolha *Transportadora* no fechamento — tem seguro grátis contra apreensão e extravio.\n' +
'🔎 Acompanhe o pedido em *vitaflowoficial.com/pages/rastrear-pedido*\n⠀\n' +
'E aqui no grupo você vê, todo dia, gente mostrando o pedido que chegou. 📦',

  site:
'🛒 *LINKS OFICIAIS VITAFLOW*\n⠀\n' +
'🌐 Loja → *vitaflowoficial.com*\n📦 Rastrear pedido → *vitaflowoficial.com/pages/rastrear-pedido*\n' +
'🧮 Calculadora de Peptídeos → *vitaflowoficial.com/pages/calculadora-de-peptideos*\n' +
'📋 Gerador de Protocolos → *vitaflowoficial.com/pages/gerador-de-protocolo*\n' +
'🏭 Atacado → *vitaflowoficial.com/pages/atacado*\n' +
'👤 Minha Conta (pedidos e rastreio) → *vitaflowoficial.com/pages/minha-conta*\n⠀\n' +
'🤖 Athena, consultora 24h → wa.me/5511926100192\n⠀\n' +
'💬 *Atendimento:*\n• (11) 91133-8515 → wa.me/5511911338515\n• +44 7537 155723 → wa.me/447537155723\n⠀\n' +
'📧 *E-mail:* contato@vitaflowoficial.com\n⠀\n' +
'✈️ *Tem Telegram?* Entre também no nosso grupo de lá:\n👉 *t.me/referencias_vitaflow*\n⠀\n' +
'_O Telegram é mais seguro e mais estável. Estando nos dois grupos, fica muito mais difícil você perder um aviso, uma promoção ou uma novidade._',

  telegram:
'✈️ *NOSSO GRUPO NO TELEGRAM*\n⠀\n' +
'👉 *t.me/referencias_vitaflow*\n⠀\n' +
'Lá saem os mesmos avisos daqui: promoções, reposições, lançamentos e sorteio.\n⠀\n' +
'_Você não precisa sair do grupo do WhatsApp — dá pra ficar nos dois._',

  origem:
'📦 *DE ONDE SAI O SEU PEDIDO*\n⠀\n' +
'A VitaFlow trabalha com estoques em *lugares diferentes*, pra ter sempre o produto disponível pra você:\n⠀\n' +
'🏭 *São Paulo* — 3 estoques\n🏭 *Mato Grosso do Sul*\n' +
'🇵🇾 *Paraguai* — *Ciudad del Este* e *Pedro Juan Caballero*, de onde sai o *atacado*, com logística própria e por isso com prazo maior\n⠀\n' +
'No varejo, cada produto sai de *SP* ou de *MS*, conforme a disponibilidade do momento.\n⠀\n' +
'Por isso uma mesma compra pode chegar em *até 3 envios separados*, em dias diferentes. Você recebe *um número para cada envio* e acompanha todos no mesmo lugar:\n🔎 *vitaflowoficial.com/pages/rastrear-pedido*\n⠀\n' +
'✅ *E você paga UM frete só.* A logística dos envios fica por nossa conta.',

  sorteio:
'🎲 *SORTEIO QUINZENAL — NÚMERO DA SORTE*\n⠀\n' +
'A cada *R$ 100* em produtos você ganha *1 número* e concorre a um *vale-compras de R$ 1.000*.\n⠀\n' +
'🏭 Vale também pras compras de *atacado*.\n⠀\n' +
'📅 Este ciclo fecha em *{FECHA}*\n🍀 Sorteio pela Loteria Federal em *{APURA}*\n⠀\n' +
'👉 Veja os seus números: *vitaflowoficial.com/pages/sorteio*',

  frete_sem_uf:
'🚚 Me diz o *estado* que eu te passo o valor do frete!\n⠀\nExemplo: *!frete RJ* ou *quanto é o frete pra Bahia?*\n⠀\n' +
'🎁 Em pedidos de varejo a partir de *R$ 1.000* o frete é grátis.',

  produto_nada:
'🔎 Não achei *{BUSCA}* no site agora.\n⠀\n' +
'Dá uma olhada na loja (*vitaflowoficial.com*) ou pergunta pra *Athena*: wa.me/5511926100192'
};

async function carregarTextos() {
  var doBanco = await fbGet(RAIZ + '/textos');
  if (doBanco && typeof doBanco === 'object') {
    for (var k in doBanco) {
      if (Object.prototype.hasOwnProperty.call(doBanco, k) && typeof doBanco[k] === 'string' && doBanco[k].trim()) {
        T[k] = doBanco[k];
      }
    }
  }
}

/* -------------------------------------------------------------------- frete
   Le vitaflow_sync/fretes_venda (CENTAVOS). O bot NAO tem tabela propria —
   ver regra 5 no _LEIA-ME: o frete de venda ja mora em 7 arquivos.           */
var UF_NOME = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MG: 'Minas Gerais', MS: 'Mato Grosso do Sul', MT: 'Mato Grosso', PA: 'Pará',
  PB: 'Paraíba', PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul',
  SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins'
};

function normaliza(s) {
  return String(s == null ? '' : s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function acharUF(texto) {
  var t = normaliza(texto);
  var m = t.match(/\b(ac|al|am|ap|ba|ce|df|es|go|ma|mg|ms|mt|pa|pb|pe|pi|pr|rj|rn|ro|rr|rs|sc|se|sp|to)\b/);
  if (m) return m[1].toUpperCase();

  /* Nomes por extenso, do MAIS LONGO pro mais curto.
     Sem isso, "frete para SAO PAULO" casava com "Para" (Pará, sem acento) antes
     de chegar em "sao paulo" — bug pego no teste em 19/09. */
  var lista = [], uf;
  for (uf in UF_NOME) {
    if (Object.prototype.hasOwnProperty.call(UF_NOME, uf)) {
      lista.push({ uf: uf, n: normaliza(UF_NOME[uf]) });
    }
  }
  lista.sort(function (a, b) { return b.n.length - a.n.length; });

  for (var i = 0; i < lista.length; i++) {
    /* "para" sem acento é preposição. O Pará só entra pelo nome quando vem
       acentuado no texto original; pela sigla "PA" continua valendo sempre. */
    if (lista[i].uf === 'PA' && !/pará/i.test(String(texto || ''))) continue;
    var re = new RegExp('\\b' + lista[i].n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if (re.test(t)) return lista[i].uf;
  }
  return null;
}

function reais(centavos) {
  return 'R$ ' + (Number(centavos) / 100).toFixed(2).replace('.', ',');
}

async function respostaFrete(texto) {
  var uf = acharUF(texto);
  if (!uf) return T.frete_sem_uf;
  var no = await fbGet('vitaflow_sync/fretes_venda/tabela/' + uf);
  if (!no || no.PAC == null) return T.frete_sem_uf;
  return '🚚 *Frete para o ' + uf + '*\n⠀\n' +
    '📮 PAC — *' + reais(no.PAC) + '*\n' +
    '⚡ SEDEX — *' + reais(no.SEDEX) + '*\n' +
    '🚛 Transportadora — *' + reais(no.Transportadora) + '*\n⠀\n' +
    '🛡️ O *seguro grátis* contra apreensão e extravio vale *só* na *Transportadora*.\n' +
    '🎁 Pedidos de varejo a partir de *R$ 1.000*: frete grátis automático.';
}

/* ------------------------------------------------------- busca de produto (v8)
   "vocês têm X?", "tem X no site?", !produto X → procura no catálogo público da loja
   (a mesma busca do site) e devolve até 4 produtos com preço, disponibilidade e link.
   Só dados públicos da vitrine. Pergunta natural sem achado = fica calado (não polui o grupo);
   no comando responde "não achei".                                                          */
var LOJA = 'https://vitaflowoficial.com';
var PALAVRAS_VAZIAS = ' o a os as um uma uns umas de da do das dos pra para por com e ou no na nos nas ai aqui la ' +
  'ainda tambem tbm vcs voces vc voce site loja vita vitaflow vender venda vende vendem tem ter esse essa esses essas isso ' +
  'disponivel estoque agora hoje alguma algum previsao chegar quando volta voltar ';
function limparBusca(q) {
  var t = normaliza(q).replace(/[?!.,;:()"'*_~]/g, ' ').replace(/\s+/g, ' ').trim();
  var p = t.split(' ').filter(function (w) { return w && PALAVRAS_VAZIAS.indexOf(' ' + w + ' ') < 0; });
  return p.join(' ').trim();
}
/* devolve o texto procurado, ou null se a mensagem não é um "vocês têm X?" */
function extrairBuscaProduto(texto) {
  var t = normaliza(texto).replace(/\s+/g, ' ').trim();
  var m = t.match(/^!(produto|tem|preco)\s+(.{2,60})$/);
  if (m) return { q: m[2], cmd: true };
  if (/\b(desse|dessa|deste|desta|esse|essa|isso|aquele|aquela)\b/.test(t)) return null;   /* fala de foto/mensagem anterior */
  var pergunta = String(texto).indexOf('?') >= 0;
  /* "vocês têm X?" — só no plural/nome da loja ("vc tem que ver…" é papo entre membros) */
  m = t.match(/^(?:(?:bom dia|boa tarde|boa noite|ola|oi|pessoal|galera)[ ,!]*)*(?:voces|vcs|a vita|a vitaflow|vitaflow)\s+(?:tem|vende|vendem|trabalha com|trabalham com)\s+(?:o |a |os |as )?(.{2,50}?)(?:\s+(?:no site|ai|a venda|pra vender|disponivel))?\s*\??$/);
  if (m && !/^(que|q|alguma previsao|previsao)\b/.test(m[1])) return { q: m[1], cmd: false };
  m = t.match(/\b(?:voces|vcs|a vita|a vitaflow|vitaflow)\s+(?:tem|vende|vendem)\s+(?:o |a |os |as )?(.{2,50}?)\s*\?/);
  if (m && pergunta && !/^(que|q|alguma previsao|previsao)\b/.test(m[1])) return { q: m[1], cmd: false };
  m = t.match(/\btem\s+(?:o |a |os |as )?(.{2,40}?)\s+(?:no site|na vita|na vitaflow|pra vender|a venda)\s*\?/);
  if (m && pergunta && !/^(tudo|algo|alguma coisa|calculadora|um agente)\b/.test(m[1])) return { q: m[1], cmd: false };
  return null;
}
function reaisTxt(v) {
  var n = Number(v); if (!(n > 0)) return '';
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
async function buscarProdutos(q) {
  try {
    var url = LOJA + '/search/suggest.json?q=' + encodeURIComponent(q) +
              '&resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=last';
    var r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) { console.error('[grupo-vip] busca HTTP ' + r.status); return []; }
    var d = await r.json();
    return (d && d.resources && d.resources.results && d.resources.results.products) || [];
  } catch (e) { console.error('[grupo-vip] busca estourou: ' + e.message); return []; }
}
async function respostaProduto(busca) {
  var q = limparBusca(busca.q);
  if (q.length < 3) return busca.cmd ? T.produto_nada.replace('{BUSCA}', busca.q.trim()) : null;
  var lista = await buscarProdutos(q);
  /* só o que tem as palavras procuradas no nome (a busca do site é solta demais) */
  var termos = q.split(' ').filter(function (w) { return w.length >= 3 || /\d/.test(w); });
  lista = lista.filter(function (p) {
    var n = normaliza(p.title);
    return termos.every(function (w) { return n.indexOf(w) >= 0; });
  });
  if (!lista.length) return busca.cmd ? T.produto_nada.replace('{BUSCA}', busca.q.trim()) : null;
  lista.sort(function (a, b) { return (b.available ? 1 : 0) - (a.available ? 1 : 0); });
  var linhas = lista.slice(0, 4).map(function (p) {
    var link = String(p.url || '').split('?')[0];
    return '▪️ *' + p.title + '*\n' +
           (p.available ? '   ' + reaisTxt(p.price) + ' · ✅ disponível' : '   ⛔ esgotado no momento') + '\n' +
           '   vitaflowoficial.com' + link;
  });
  return '🔎 *No site agora:*\n⠀\n' + linhas.join('\n⠀\n') +
         (lista.length > 4 ? '\n⠀\n_Tem mais opções na busca do site._' : '') +
         '\n⠀\n🏭 Pra comprar em quantidade: vitaflowoficial.com/pages/atacado';
}

/* ------------------------------------------------------------- roteamento
   v8: COMANDO (!) vale sempre. PALAVRA-CHAVE só com cara de pergunta — até a v7 qualquer
   menção disparava ("tava valor bom atacado" → texto do atacado; 100+ respostas fora de hora
   entre 19/09 e 27/10). Cada assunto tem padrões próprios, testados contra a conversa real.  */
var GATILHOS = [
  { chave: 'atacado',        cmd: ['!atacado'] },
  { chave: 'frete',          cmd: ['!frete'] },
  { chave: 'frete_gratis',   cmd: ['!fretegratis', '!frete-gratis'] },
  { chave: 'prazo',          cmd: ['!prazo'] },
  { chave: 'transportadora', cmd: ['!transportadora', '!envio'] },
  { chave: 'seguro',         cmd: ['!seguro'] },
  { chave: 'rastreio',       cmd: ['!rastreio', '!rastrear', '!pedido'] },
  { chave: 'origem',         cmd: ['!origem'] },
  { chave: 'sorteio',        cmd: ['!sorteio'] },
  { chave: 'telegram',       cmd: ['!telegram'] },
  { chave: 'comprar',        cmd: ['!comprar'] },
  { chave: 'calculadora',    cmd: ['!calculadora', '!diluicao'] },
  { chave: 'protocolo',      cmd: ['!protocolo', '!gerador'] },
  { chave: 'confianca',      cmd: ['!confianca'] },
  { chave: 'site',           cmd: ['!site', '!links', '!ajuda'] }
];

/* "é pergunta?" — ? em qualquer lugar, começa com palavra de pergunta, ou chama a Stella/bot */
function ehPergunta(textoOriginal) {
  var o = String(textoOriginal || '');
  var t = normaliza(o).trim();
  if (/\bstella\b/.test(t)) return true;
  if (/k{3,}|\bhaha|\brsrs|\brs\b/.test(t)) return false;
  if (o.indexOf('?') >= 0) return true;
  if (/\bstella\b/.test(t)) return true;
  if (/k{3,}|\bhaha|\brsrs|\brs\b/.test(t)) return false;   /* piada/zoeira não é pergunta pro bot */
  return /^(quanto|quantos|quantas|qual|quais|como|onde|quando|alguem sabe|alguem ai|sabe se|sabem se|da pra|e possivel|gostaria de saber|quero saber|preciso saber|me fala|me diz|informac)/.test(t);
}

/* padrões por assunto (texto já normalizado: minúsculo, sem acento) */
var RX = {
  seguro:       /\b(tem|com|o|um|inclui|incluso|incluir|contempla|vem|ha|existe|sem|de|do|e o) seguro\b|\bseguro (contra|incluso|gratis|gratuito|vale|cobre)\b|^seguro\b|\b(apreend\w*|apreensao|extravi\w*|reembols\w*|ressarc\w*)\b|\bse (cair|for pego|pegarem|segurarem)\b|\b(caiu|cair) (o|meu) pedido\b/,
  seguroCompra: /\be seguro (comprar|pedir|comprar aqui)\b/,
  fretegratis:  /\bfrete (gratis|gratuito|free|zero)\b/,
  frete:        /\bfrete\b/,
  freteValor:   /\b(quanto|valor|custa|custo|preco|fica|sai|cobram|cobra)\b/,
  atacado:      /\batacado\b/,
  pagamento:    /\b(parcel\w*|cartao|credito|12x|\d+x|vezes|pix|boleto|pagamento|pagar)\b/,
  prazoDireto:  /\bprazo\b/,
  prazoTempo:   /\b(quanto tempo|quantos dias|demora|demoram|leva quantos|chega em quantos|em quanto tempo)\b/,
  prazoEntrega: /\b(chega|chegar|chegam|chegou|entrega|entregar|envio|enviar|envia|postag\w*|posta|pedido|encomenda|correio|correios|transportadora|sedex|pac)\b/,
  naoEntrega:   /\b(aplica\w*|dose|dosagem|semana|semanas|efeito|resultado|ciclo|tomar|usar|uso|treino|dieta|exame)\b/,
  transportadora: /\b(qual|quais|que) (a |as |e a |sao as )?(transportadora|transportadoras)\b|\bquem (faz a |que )?entrega\b|\b(envia|enviam|manda|mandam|vem|vai) (por|pelos?|pela) (correios|transportadora|sedex|pac)\b|\b(pac ou sedex|sedex ou pac|transportadora ou (pac|sedex|correios)|(pac|sedex|correios) ou transportadora)\b|\bmelhor (forma de |opcao de )?envio\b/,
  rastreio:     /\b(rastre\w*|codigo de rastreio|meu pedido|minha encomenda|meu pacote|nao chegou|nao recebi|ainda nao chegou|cade (o )?meu|status do (meu )?pedido|foi postado|em separacao|pedido feito|atualizar o pedido)\b/,
  origem:       /\b(de onde sai|de onde vem|onde fica o estoque|sai de onde|vem de onde|sao enviados de onde)\b/,
  sorteio:      /\b(sorteio|numero da sorte|numeros da sorte|vale-compras|vale compras)\b/,
  telegram:     /\btelegram\b/,
  comprar:      /\b(como (eu )?(compro|comprar|faco (o |um )?pedido|faco pra comprar)|onde (eu )?(compro|comprar)|vende direto|vendem direto|como faz pra comprar|qual (e )?o site|link do site|links oficiais)\b/,
  calculadora:  /\b(diluir|diluo|dilua|diluicao|diluiu|dilui em|reconstituir|reconstituo|quantas ui|quantos ui|quantas unidades|quantos tracinhos|quantas marcacoes|quanto de agua|quanta agua|quantos ml|ml de agua)\b/,
  calcNao:      /\b(vem dilu\w*|ja vem|liofiliz\w*|diluida ou|diluido ou)\b/,
  protocolo:    /\b(protocolo de uso|qual (o |seria o )?protocolo|algum protocolo|tem (o |um )?protocolo|qual (a |seria a )?dose|qual (a |seria a )?dosagem|dosagem (diaria|semanal)|como (devo |eu )?(usar|aplicar|tomar))\b/,
  protNao:      /\b(seu|teu|esse|desse|meu|nosso) protocolo\b|\b(tu|vc|voce|voces|vcs) (usou|usa|usaram|faz|fez)\b|\bque (vc|voce|tu) usa\b/,
  confianca:    /\b(?:quem|alguem) ja comprou (?:aqui|nessa loja|na vita|na vitaflow|no site|com voces|com vcs)\b|\bja comprou\b.*\bconfiav|\bconfiav\w*\b.*\bja comprou\b|\b(?:loja|site|vita|vitaflow|voces|vcs|aqui)\b.*\b(?:confiavel|de confianca|serios?|golpe)\b|\b(?:confiavel|de confianca|golpe)\b.*\b(?:loja|site|vita|vitaflow|voces|vcs|aqui)\b|\be seguro (comprar|pedir)\b|\bda pra confiar\b|\bposso confiar\b/
};

/* devolve a chave da resposta, ou null.
   soComando=true (admin) ignora palavra-chave — desde 21/09 o admin só dispara por comando. */
function rotear(texto, soComando) {
  var t = normaliza(texto).trim();
  var i, g, j;
  for (i = 0; i < GATILHOS.length; i++) {
    g = GATILHOS[i];
    for (j = 0; j < g.cmd.length; j++) {
      if (t === g.cmd[j] || t.indexOf(g.cmd[j] + ' ') === 0) return g.chave;
    }
  }
  if (soComando) return null;
  if (!ehPergunta(texto)) return null;

  /* ordem importa: o mais específico primeiro */
  if (RX.confianca.test(t) && (RX.seguroCompra.test(t) || !RX.seguro.test(t))) return 'confianca';
  if (RX.seguro.test(t)) return 'seguro';
  if (RX.sorteio.test(t) || /\bcotas?\b/.test(t) && RX.atacado.test(t)) return 'sorteio';
  if (RX.rastreio.test(t) && /\b(meu|minha|um) pedido\b|\bpedido (feito|na conta)\b/.test(t)) return 'rastreio';
  if (RX.atacado.test(t)) return RX.pagamento.test(t) ? 'atacado_pagamento' : 'atacado';
  if (RX.fretegratis.test(t)) return 'frete_gratis';
  if (RX.frete.test(t) && (RX.freteValor.test(t) || acharUF(texto))) return 'frete';
  if (RX.rastreio.test(t)) return 'rastreio';
  if ((RX.prazoDireto.test(t) || (RX.prazoTempo.test(t) && RX.prazoEntrega.test(t))) && !RX.naoEntrega.test(t)) return 'prazo';
  if (RX.transportadora.test(t)) return 'transportadora';
  if (RX.origem.test(t)) return 'origem';
  if (RX.telegram.test(t)) return 'telegram';
  if (RX.comprar.test(t)) return 'comprar';
  if (RX.calculadora.test(t) && !RX.calcNao.test(t)) return 'calculadora';
  if (RX.protocolo.test(t) && !RX.protNao.test(t)) return 'protocolo';
  return null;
}

/* minutos de silêncio por assunto depois de responder (dose/diluição são papo constante entre os
   membros — o bot lembra da ferramenta no máximo 1x por hora) */
var TRAVA_MIN = { calculadora: 120, protocolo: 120, confianca: 60 };

/* ============================ MODERACAO DE LINK ============================
   Regra fechada com o VitaFlow em 21/09/2026.

   DURO  = da pra clicar, e inequivocamente um endereco. E o que o bot APAGA.
           http:// · https:// · www.algo · dominio.tld/caminho · dominio com TLD
           comercial (.com.br .net .shop .store .online .app .xyz .top .vip)
   MOLE  = 'palavra.com' ou 'palavra.me' solto, sem esquema, sem www e sem barra.
           No WhatsApp isso e quase sempre gente esquecendo o espaco depois do
           ponto ("chegou hoje.com a nota fiscal"). Enquanto o bot so avisava,
           errar aqui nao custava nada; agora que ele APAGA, um falso positivo
           destroi mensagem de cliente. Entao mole so leva lembrete.

   LIBERADOS (nao apaga, nao conta strike):
     vitaflowoficial.com e qualquer caminho/subdominio
     chat.whatsapp.com/<convite DESTE grupo>
     t.me/referencias_vitaflow
     wa.me/ dos 4 numeros oficiais
   ========================================================================= */
var CONVITE_NOSSO = 'BNa4tPKWjaZ1cTP4XwXtgM';

var WA_OFICIAIS = '5511911338515|5511926100192|447537155723|447537155718';

/* TLDs que contam como endereco mesmo SEM barra depois. */
var TLD_SOLTO = 'com\\.br|com|net|org|br|io|me|co|shop|store|online|site|link|app|xyz|info|top|live|vip|la|ly|gl|be';

var RE_LINKS = new RegExp(
  '(' +
    'https?:\\/\\/[^\\s<>"\']+' +
    '|www\\.[a-z0-9-]+(?:\\.[a-z0-9-]+)+(?:\\/[^\\s<>"\']*)?' +
    '|[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.[a-z]{2,}\\/[^\\s<>"\']*' +
    '|[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:' + TLD_SOLTO + ')\\b' +
  ')', 'gi');

/* NAO existe mais um "temLink" separado. Ate a v4 havia dois regex pro mesmo
   conceito e eles divergiram: o pre-filtro nao conhecia .la, entao um link do
   Mercado Livre (meli.la/...) sozinho na mensagem nem chegava na moderacao.
   Uma unica fonte de verdade: acharLinks + linkDeFora, que rodam sempre.
   Custo: um match de regex numa string curta por mensagem. Barato. */

/* Tira pontuacao grudada no fim: "veja loja.com/x." -> "loja.com/x" */
function limparFim(l) {
  return String(l || '').replace(/[.,;:!?)\]}»"\']+$/, '');
}

function acharLinks(texto) {
  RE_LINKS.lastIndex = 0;   /* regex global e stateful — sem isso pula achado */
  return String(texto || '').match(RE_LINKS) || [];
}

/* ---- v6: LINKS LIBERADOS PELO PAINEL -----------------------------------------
   grupo_vip/config/links_liberados = { <chave>: { dominio: 'instagram.com', nome, t } }
   Tira protocolo, www. e barra do fim, tudo minusculo. */
function normalizarLiberado(v) {
  return String(v || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[\/?#]+$/, '');
}

/* Le a lista do config que o handler ja buscou. Config ausente/corrompido = lista vazia
   (fica valendo so o que e fixo no codigo, como ate a v5). */
function listaLiberados(cfg) {
  var n = cfg && cfg.links_liberados, out = [], k, d;
  if (!n || typeof n !== 'object') return out;
  for (k in n) {
    if (!Object.prototype.hasOwnProperty.call(n, k)) continue;
    d = normalizarLiberado(n[k] && typeof n[k] === 'object' ? n[k].dominio : n[k]);
    if (d && d.indexOf('.') > 0) out.push(d);
  }
  return out;
}

/* "instagram.com"          -> instagram.com, www.instagram.com, m.instagram.com, com qualquer caminho
   "instagram.com/vitaflow" -> so instagram.com/vitaflow e o que vem depois (/vitaflow/reel/...) */
function naListaLiberada(link, liberados) {
  if (!liberados || !liberados.length) return false;
  var s = normalizarLiberado(limparFim(link));
  var host = s.split(/[\/?#]/)[0];
  var resto = s.slice(host.length);
  var i, e, eHost, ePath;
  for (i = 0; i < liberados.length; i++) {
    e = liberados[i];
    eHost = e.split('/')[0];
    ePath = e.slice(eHost.length);
    if (host !== eHost && host.slice(-(eHost.length + 1)) !== '.' + eHost) continue;
    if (!ePath) return true;
    if (resto === ePath || resto.indexOf(ePath + '/') === 0 ||
        resto.indexOf(ePath + '?') === 0 || resto.indexOf(ePath + '#') === 0) return true;
  }
  return false;
}

function linkPermitido(link, liberados) {
  var l = limparFim(link).toLowerCase();
  /* convite de grupo NUNCA passa pela lista do painel — so o nosso */
  if (/^(https?:\/\/)?(www\.)?chat\.whatsapp\.com\//.test(l)) {
    return limparFim(link).indexOf(CONVITE_NOSSO) >= 0;   /* convite e case-sensitive */
  }
  if (/^(https?:\/\/)?(www\.)?([a-z0-9-]+\.)*vitaflowoficial\.com(\/|\?|$)/.test(l)) return true;
  if (/^(https?:\/\/)?(www\.)?t\.me\/referencias_vitaflow\/?$/.test(l)) return true;
  if (new RegExp('^(https?:\\/\\/)?(www\\.)?wa\\.me\\/(' + WA_OFICIAIS + ')\\/?$').test(l)) return true;
  if (naListaLiberada(l, liberados)) return true;
  return false;
}

function linkDuro(link) {
  var l = limparFim(link);
  if (/^https?:\/\//i.test(l)) return true;
  if (/^www\./i.test(l)) return true;
  if (/\.[a-z]{2,}\//i.test(l)) return true;                                    /* tem caminho */
  if (/\.(com\.br|net|shop|store|online|app|xyz|top|vip)$/i.test(l)) return true; /* TLD comercial */
  return false;
}

/* Devolve o link de fora mais grave da mensagem, ou null se estiver tudo liberado.
   Duro ganha de mole: "vitaflowoficial.com e tambem https://outraloja.com/x" apaga. */
function linkDeFora(texto, liberados) {
  var achados = acharLinks(texto), i, l, mole = null;
  for (i = 0; i < achados.length; i++) {
    l = limparFim(achados[i]);
    if (linkPermitido(l, liberados)) continue;
    if (linkDuro(l)) return { link: l, duro: true };
    if (!mole) mole = { link: l, duro: false };
  }
  return mole;
}

/* ---------------------------------------------------------------- strikes
   Um no por numero. Nao zera sozinho. O painel (aba Reincidentes) mostra a
   lista e tem os botoes de zerar e apagar da lista.                         */
async function contarStrike(numero, nome, texto, link) {
  var caminho = RAIZ + '/reincidentes/' + numero;
  var a = await fbGet(caminho);
  var reg = {
    numero: numero,
    nome: nome || (a && a.nome) || '',
    vezes: Number((a && a.vezes) || 0) + 1,
    primeiro: (a && a.primeiro) || Date.now(),
    ultimo: Date.now(),
    ultimo_link: String(link || '').slice(0, 200),
    ultimo_trecho: String(texto || '').slice(0, 300),
    removido: !!(a && a.removido),
    removido_em: Number((a && a.removido_em) || 0)
  };
  await fbPut(caminho, reg);
  return reg;
}

function ehGolpe(texto) {
  var t = String(texto || '');
  var n = normaliza(t);
  if (/chat\.whatsapp\.com/i.test(t) && t.indexOf(CONVITE_NOSSO) < 0) return 'convite de outro grupo';
  if (/\b(bit\.ly|tinyurl|encurtador|cutt\.ly|is\.gd|t\.co|shorturl)\b/i.test(t)) return 'encurtador';
  if (/wa\.me\/\d+/i.test(t)) {
    if (!/wa\.me\/(5511911338515|5511926100192|447537155723|447537155718)/i.test(t)) return 'wa.me desconhecido';
  }
  if (n.indexOf('migre de grupo') >= 0 || n.indexOf('grupo novo') >= 0 ||
      n.indexOf('atualize seu cadastro') >= 0 || n.indexOf('voce foi premiado') >= 0 ||
      n.indexOf('voce ganhou') >= 0) return 'texto tipico de golpe';
  return null;
}

/* ------------------------------------------------------------------ handler */
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    /* ?defaults=1 devolve os textos PADRAO (os do codigo, sem o merge do Firebase).
       Existe pro painel_grupo_vip.html nao precisar ter uma segunda copia dos textos —
       duas copias e a receita pra um dia ficarem diferentes. Nao tem segredo nenhum
       aqui: sao os mesmos textos que o bot posta em grupo publico. */
    var q = event.queryStringParameters || {};
    if (q.defaults === '1') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(T)
      };
    }
    return { statusCode: 200, body: 'grupo-vip ok' };
  }

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 200, body: 'json invalido' }; }

  // ignora o que nao interessa
  if (body.fromMe) return { statusCode: 200, body: 'fromMe' };
  if (body.isNewsletter) return { statusCode: 200, body: 'newsletter' };
  if (body.isStatusReply) return { statusCode: 200, body: 'status' };

  /* Ate a v4 o bot so lia text.message. Foto com link na legenda passava batido —
     e e exatamente assim que se divulga no WhatsApp: imagem do produto + link
     embaixo. A legenda entra na MODERACAO; pro roteador de respostas continua
     valendo so o texto puro, senao foto de pedido com a palavra "frete" na
     legenda dispararia o texto de frete. */
  var texto = (body.text && body.text.message) ? String(body.text.message) : '';
  var legenda =
      (body.image && body.image.caption) ? String(body.image.caption) :
      (body.video && body.video.caption) ? String(body.video.caption) :
      (body.document && body.document.caption) ? String(body.document.caption) : '';
  var paraModerar = (texto + ' ' + legenda).trim();
  var chat = String(body.phone || '');
  var autor = so_digitos(body.participantPhone || body.phone || '');
  var ehAdmin = ADMINS.indexOf(autor) >= 0;

  // ---- !id funciona sempre (so pra admin) — usado pra descobrir o grupo
  if (normaliza(texto).trim() === '!id' && ehAdmin) {
    await enviar(chat, '🆔 ID deste chat:\n`' + chat + '`\n\nisGroup: ' + (body.isGroup ? 'sim' : 'nao') +
                       '\nnome: ' + (body.chatName || '-'));
    return { statusCode: 200, body: 'id enviado' };
  }

  /* ---- LIGA/DESLIGA (painel > config/ativo). Fica DEPOIS do !id de proposito:
     mesmo desligado o admin consegue perguntar o id do chat pra depurar.
     O default e LIGADO — so desliga com o valor explicitamente false, pra um
     config ausente ou corrompido nunca calar o bot sem ninguem entender. */
  var cfg = await fbGet(RAIZ + '/config');
  if (cfg && cfg.ativo === false) {
    return { statusCode: 200, body: 'bot desligado no painel' };
  }

  // ---- MODO DESCOBERTA: sem GRUPO_VIP_ID o bot nao fala, so registra
  if (!GRUPO_VIP_ID) {
    await fbPut(RAIZ + '/descoberta/' + chat.replace(/[.#$/\[\]]/g, '_'), {
      phone: chat, chatName: body.chatName || '', isGroup: !!body.isGroup, t: Date.now()
    });
    return { statusCode: 200, body: 'modo descoberta' };
  }

  // ---- PRIVADO: resposta pronta, 1x a cada 24h por contato
  if (!body.isGroup) {
    if (ehAdmin) return { statusCode: 200, body: 'privado de admin — ignorado' };

    /* LISTA DE EXCECAO (19/09/2026): numeros que NAO recebem a mensagem de
       direcionamento. Cadastrada no painel, aba Exceções — vale na hora, sem deploy.
       Os admins ja sairam acima e nao precisam estar na lista.
       Le SO a chave do numero, nunca o no inteiro: ler no inteiro num laco foi o que
       estourou a cota do Firebase em 19/09 (claude/firebase_estouro_cota_2026-09-19.md).
       Vale so pro privado — no grupo esse numero continua usando comando normalmente. */
    if (autor && await fbGet(RAIZ + '/excecoes/' + autor)) {
      return { statusCode: 200, body: 'numero na lista de excecao — ignorado' };
    }

    var chavePriv = 'privado_' + autor;
    if (await travaOk(chavePriv, 24 * 60)) {
      await carregarTextos();
      await enviar(chat, T.privado);
    }
    return { statusCode: 200, body: 'privado' };
  }

  // ---- daqui pra baixo: so o Grupo VIP
  if (chat !== GRUPO_VIP_ID) return { statusCode: 200, body: 'outro grupo — ignorado' };
  if (!paraModerar) return { statusCode: 200, body: 'sem texto' };

  await carregarTextos();

  /* ======================= MODERACAO (admin passa direto) =======================
     Ordem: golpe > link duro > link mole. Admin nunca e apagado nem contado.     */
  if (!ehAdmin) {
    var motivo = ehGolpe(paraModerar);
    var fora = linkDeFora(paraModerar, listaLiberados(cfg));   /* v6: + lista do painel */
    var apagar = !!motivo || !!(fora && fora.duro);

    if (apagar) {
      /* v8: o mesmo webhook chegando 2x não pode contar 2 strikes */
      if (!(await primeiraVez(body.messageId))) return { statusCode: 200, body: 'duplicado — ja tratado' };
      var apagou = await apagarMensagem(chat, body.messageId);
      var reg = await contarStrike(autor, body.senderName, paraModerar, fora ? fora.link : '');

      await fbPut(RAIZ + '/log/' + Date.now(), {
        tipo: motivo ? 'golpe' : 'link',
        acao: apagou ? 'apagado' : 'falhou_apagar',
        vez: reg.vezes, autor: autor, nome: body.senderName || '',
        link: fora ? fora.link : '', trecho: paraModerar.slice(0, 300), t: Date.now()
      });

      /* 3o strike = sai do grupo. Nao repete pra quem ja foi removido e voltou
         por conta propria — nesse caso o VitaFlow decide na mao. */
      var saiu = false;
      if (reg.vezes >= STRIKES_MAX && !reg.removido) {
        saiu = await removerDoGrupo(autor);
        if (saiu) {
          await fbPut(RAIZ + '/reincidentes/' + autor + '/removido', true);
          await fbPut(RAIZ + '/reincidentes/' + autor + '/removido_em', Date.now());
        }
      }

      await telegram(
        (motivo ? '🚨 GRUPO VIP — GOLPE (' + motivo + ')' : '🚫 GRUPO VIP — link de fora') +
        '\nAutor: ' + (body.senderName || '') + ' (' + autor + ')  ·  ' + reg.vezes + 'a vez' +
        '\nApagou: ' + (apagou ? 'sim' : 'NAO — ver log da funcao') +
        (reg.vezes >= STRIKES_MAX ? '\nRemovido do grupo: ' + (saiu ? 'sim' : 'NAO — ver log') : '') +
        (fora ? '\nLink: ' + fora.link : '') +
        '\n\n' + paraModerar.slice(0, 500));

      /* Texto no grupo. mod2/mod3/golpe sao dirigidos e saem sempre; os genericos
         respeitam a trava de 30 min pra o bot nao virar metralhadora de aviso. */
      var msgMod, sempre = true;
      if (saiu)             msgMod = T.mod3;
      else if (motivo)      msgMod = T.golpe;
      else if (reg.vezes >= 2) msgMod = T.mod2;
      else {
        sempre = false;
        var usadas = Number(await fbGet(RAIZ + '/contadores/apresentacoes')) || 0;
        if (usadas < APRESENTACOES_MAX) {
          msgMod = T.mod_apresenta;
          await fbPut(RAIZ + '/contadores/apresentacoes', usadas + 1);
        } else {
          msgMod = T.mod1;
        }
      }
      if (sempre || await travaOk('aviso_mod', 30)) await enviar(chat, msgMod);

      return { statusCode: 200, body: 'apagado (' + reg.vezes + 'a vez)' + (saiu ? ' + removido' : '') };
    }

    if (fora) {
      /* Link MOLE: nao apaga e NAO conta strike — pode ser so um espaco faltando
         depois do ponto. So o lembrete, com trava. */
      if (!(await primeiraVez(body.messageId))) return { statusCode: 200, body: 'duplicado — ja tratado' };
      await fbPut(RAIZ + '/log/' + Date.now(), {
        tipo: 'link', acao: 'avisado', autor: autor, nome: body.senderName || '',
        link: fora.link, trecho: paraModerar.slice(0, 300), t: Date.now()
      });
      if (await travaOk('aviso_mod', 30)) await enviar(chat, T.regras);
      return { statusCode: 200, body: 'link duvidoso — so avisado' };
    }
  }

  if (!texto) return { statusCode: 200, body: 'sem texto puro — nada a responder' };

  // ---- respostas
  var chave = rotear(texto, ehAdmin);

  /* v8: "vocês têm X?" / "tem X no site?" / !produto X → busca no catálogo da loja.
     Só quando nenhum outro assunto bateu (pergunta de atacado/frete/prazo tem prioridade). */
  if (!chave) {
    var busca = extrairBuscaProduto(texto);
    if (busca && (busca.cmd || !ehAdmin)) {
      var chaveBusca = (busca.cmd ? 'prodcmd_' : 'prod_') + limparBusca(busca.q).replace(/[^a-z0-9]+/g, '_').slice(0, 60);
      if (!(await travaOk(chaveBusca, 30))) return { statusCode: 200, body: 'trava produto' };
      var resp = await respostaProduto(busca);
      if (!resp) return { statusCode: 200, body: 'produto: nada achado (calado)' };
      if (!(await primeiraVez(body.messageId))) return { statusCode: 200, body: 'duplicado — ja tratado' };
      await enviar(chat, resp);
      return { statusCode: 200, body: 'respondido: produto' };
    }
    return { statusCode: 200, body: 'sem gatilho' };
  }
  if (!(await travaOk('resp_' + chave, TRAVA_MIN[chave] || 10))) return { statusCode: 200, body: 'trava de tempo' };
  if (!(await primeiraVez(body.messageId))) return { statusCode: 200, body: 'duplicado — ja tratado' };

  var msg;
  if (chave === 'frete') {
    msg = await respostaFrete(texto);
  } else if (chave === 'sorteio') {
    var c = cicloSorteio(new Date());
    msg = T.sorteio
      .replace('{FECHA}', ddmm(c.fim))
      .replace('{APURA}', diaSemana(c.sort) + ', ' + ddmm(c.sort) + ' às 11h');
  } else {
    msg = T[chave];
  }
  if (!msg) return { statusCode: 200, body: 'texto vazio' };

  await enviar(chat, msg);
  return { statusCode: 200, body: 'respondido: ' + chave };
};

/* exportado so pra teste local (node) — nao usado pela Netlify */
exports._teste = {
  rotear: rotear, ehGolpe: ehGolpe, acharUF: acharUF, ehPergunta: ehPergunta,
  extrairBuscaProduto: extrairBuscaProduto, limparBusca: limparBusca, respostaProduto: respostaProduto,
  textos: T,
  cicloSorteio: cicloSorteio, reais: reais, ddmm: ddmm, diaSemana: diaSemana
};

/* Exportado so pro teste automatizado. Nao usado em producao. */
exports._acharLinks = acharLinks;
exports._linkPermitido = linkPermitido;
exports._linkDuro = linkDuro;
exports._linkDeFora = linkDeFora;
exports._listaLiberados = listaLiberados;
exports._naListaLiberada = naListaLiberada;
exports._ehGolpe = ehGolpe;
exports._rotear = rotear;
exports._limparFim = limparFim;
