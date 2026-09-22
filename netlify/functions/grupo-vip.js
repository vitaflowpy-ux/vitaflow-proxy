'use strict';
/* =============================================================================
   grupo-vip.js — BOT DO GRUPO VIP (VitaFlow)  ·  v5  ·  21/09/2026
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
   Retorna true quando PODE falar.                                            */
async function travaOk(chave, minutos) {
  var agora = Date.now();
  var reg = await fbGet(RAIZ + '/travas/' + chave);
  if (reg && reg.t && (agora - reg.t) < minutos * 60000) return false;
  await fbPut(RAIZ + '/travas/' + chave, { t: agora });
  return true;
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
'📦 *Postagem:* até *2 dias úteis* depois que o pagamento é confirmado — o mesmo prazo pra todo envio do varejo, saindo de SP ou de MS.\n⠀\n' +
'🚚 *Entrega, a partir da postagem:*\n' +
'• Sudeste — *2 a 5* dias úteis\n• Sul — *3 a 5* dias úteis\n• Centro-Oeste — *4 a 6* dias úteis\n' +
'• Nordeste — *5 a 8* dias úteis\n• Norte — *7 a 10* dias úteis\n⠀\n' +
'🏭 *Atacado:* despacho em até *5 dias úteis* após a confirmação. Depois disso, valem os prazos por região acima.\n⠀\n' +
'🔎 Acompanhe o seu em *vitaflowoficial.com/pages/rastrear-pedido*\n⠀\n' +
'_Estimativas em dias úteis; variam com distância e condições de entrega._',

  transportadora:
'🚚 *COMO ENVIAMOS*\n⠀\n' +
'Trabalhamos com os *Correios* e com as principais transportadoras do mercado: *Jadlog, Loggi, J&T Express e Total Express*.\n⠀\n' +
'🛡️ *Seguro gratuito* contra apreensão e extravio — *exclusivamente* para os envios feitos via *transportadora*.\n⠀\n' +
'No fechamento você escolhe entre *PAC*, *SEDEX* e *Transportadora*.',

  atacado:
'🏭 *ATACADO VITAFLOW*\n⠀\n' +
'Agora você compra no atacado *direto pelo site*, 24h por dia, sem fila de atendimento:\n👉 *vitaflowoficial.com/pages/atacado*\n⠀\n' +
'✅ *FRETE GRÁTIS* pro Brasil inteiro\n✅ Pedido mínimo de *R$ 3.000* — pode misturar produtos\n' +
'✅ Catálogo ao vivo, com o preço do dia e foto de cada produto\n✅ PIX ou cartão\n⠀\n' +
'Prefere pelo WhatsApp? A *Athena* também fecha o seu atacado, também com *frete grátis*:\n🤖 wa.me/5511926100192\n⠀\n' +
'_No atacado não entram os 3% nem cupom — o benefício é o frete grátis._',

  site:
'🛒 *LINKS OFICIAIS VITAFLOW*\n⠀\n' +
'🌐 Loja → *vitaflowoficial.com*\n📦 Rastrear pedido → *vitaflowoficial.com/pages/rastrear-pedido*\n' +
'🧮 Calculadora de Peptídeos → *vitaflowoficial.com/pages/calculadora-de-peptideos*\n' +
'📋 Gerador de Protocolos → *vitaflowoficial.com/pages/gerador-de-protocolo*\n' +
'🏭 Atacado → *vitaflowoficial.com/pages/atacado*\n⠀\n' +
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
'🇵🇾 *Paraguai* — de onde sai o *atacado*, com uma logística própria e por isso com prazo maior\n⠀\n' +
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
'🚚 Me diz o *estado* que eu te passo o frete!\n⠀\nExemplo: *!frete RJ* ou *frete para a Bahia*'
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
    '🛡️ O *seguro gratuito* contra apreensão e extravio vale *só* para envios por *transportadora*.';
}

/* ------------------------------------------------------------- roteamento */
var GATILHOS = [
  { chave: 'atacado',        cmd: ['!atacado'],                 palavras: ['atacado', 'por atacado', 'compra grande'] },
  { chave: 'frete',          cmd: ['!frete'],                   palavras: ['frete', 'quanto custa o envio', 'valor do envio'] },
  { chave: 'prazo',          cmd: ['!prazo'],                   palavras: ['prazo', 'quanto tempo demora', 'demora quanto', 'quantos dias'] },
  { chave: 'transportadora', cmd: ['!transportadora'],          palavras: ['transportadora', 'quem entrega', 'correios', 'jadlog', 'loggi', 'total express'] },
  { chave: 'origem',         cmd: ['!origem'],                  palavras: ['de onde sai', 'de onde vem', 'onde fica o estoque', 'sai de onde'] },
  { chave: 'sorteio',        cmd: ['!sorteio'],                 palavras: ['sorteio', 'numero da sorte', 'numeros da sorte', 'vale-compras'] },
  { chave: 'telegram',       cmd: ['!telegram'],                palavras: ['telegram'] },
  { chave: 'site',           cmd: ['!site', '!links', '!ajuda'], palavras: ['link do site', 'qual o site', 'links oficiais'] }
];

/* soComando=true ignora as palavras-chave e so aceita !comando.
   E o que vale pro ADMIN desde 21/09: o VitaFlow postou a promo do atacado, a
   palavra "atacado" estava no anuncio, e o bot respondeu com o texto pronto por
   cima da promo dele. Quando ele quiser o texto, manda !atacado. */
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
  for (i = 0; i < GATILHOS.length; i++) {
    g = GATILHOS[i];
    for (j = 0; j < g.palavras.length; j++) {
      if (t.indexOf(normaliza(g.palavras[j])) >= 0) return g.chave;
    }
  }
  return null;
}

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

function linkPermitido(link) {
  var l = limparFim(link).toLowerCase();
  if (/^(https?:\/\/)?(www\.)?chat\.whatsapp\.com\//.test(l)) {
    return limparFim(link).indexOf(CONVITE_NOSSO) >= 0;   /* convite e case-sensitive */
  }
  if (/^(https?:\/\/)?(www\.)?([a-z0-9-]+\.)*vitaflowoficial\.com(\/|\?|$)/.test(l)) return true;
  if (/^(https?:\/\/)?(www\.)?t\.me\/referencias_vitaflow\/?$/.test(l)) return true;
  if (new RegExp('^(https?:\\/\\/)?(www\\.)?wa\\.me\\/(' + WA_OFICIAIS + ')\\/?$').test(l)) return true;
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
function linkDeFora(texto) {
  var achados = acharLinks(texto), i, l, mole = null;
  for (i = 0; i < achados.length; i++) {
    l = limparFim(achados[i]);
    if (linkPermitido(l)) continue;
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
    var fora = linkDeFora(paraModerar);
    var apagar = !!motivo || !!(fora && fora.duro);

    if (apagar) {
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
  if (!chave) return { statusCode: 200, body: 'sem gatilho' };
  if (!(await travaOk('resp_' + chave, 10))) return { statusCode: 200, body: 'trava de 10min' };

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
  rotear: rotear, ehGolpe: ehGolpe, acharUF: acharUF,
  cicloSorteio: cicloSorteio, reais: reais, ddmm: ddmm, diaSemana: diaSemana
};

/* Exportado so pro teste automatizado. Nao usado em producao. */
exports._acharLinks = acharLinks;
exports._linkPermitido = linkPermitido;
exports._linkDuro = linkDuro;
exports._linkDeFora = linkDeFora;
exports._ehGolpe = ehGolpe;
exports._rotear = rotear;
exports._limparFim = limparFim;
