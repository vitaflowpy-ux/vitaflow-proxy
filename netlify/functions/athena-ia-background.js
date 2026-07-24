// netlify/functions/athena-ia-background.js
// ── Cérebro de IA da Athena (ASSÍNCRONO) ──────────────────────────────────────
// Chamado pelo botconversa.js quando o cliente escreve algo que os menus NÃO entendem.
// Responde natural (Claude), ANCORADO no catálogo REAL (nada de inventar preço/estoque),
// e ENTREGA a resposta pelo BotConversa (API) — NÃO depende da janela síncrona do webhook,
// por isso NÃO dá timeout (é o que derrubava o galho de IA antigo).
//
// IMPORTANTE: o nome do arquivo TEM que terminar em "-background.js" pra rodar como
// Netlify Background Function (roda até ~15 min, sem o limite de ~10s do webhook normal).
//
// >>> CORRIGE 2 furos achados no log: <<<
//   (1) modelo da Claude estava errado (404) -> agora testa uma lista até um funcionar.
//   (2) URL do BotConversa estava sem "/webhook" (404 HTML) -> base corrigida.
//
// >>> MEMÓRIA DE CONVERSA (novo): <<<
//   A IA agora LEMBRA das últimas trocas com o cliente (histórico salvo no Firebase,
//   nó `vitaflow_ia_hist/{phone}`). Antes, cada mensagem ia isolada — se a Athena fazia
//   uma pergunta e o cliente respondia curto ("primeira vez", "sim", "os dois"), ela lia
//   sem contexto e entendia outra coisa. Agora ela continua a conversa de onde parou.

const BOTCONVERSA_KEY  = '8c9e69c3-3c9f-4f23-b480-be4a0de29640'; // confere com a chave do painel BotConversa
// CORRIGIDO: a base certa da API do BotConversa tem "/webhook" no fim (fonte: app oficial no Pipedream).
const BOTCONVERSA_BASE = 'https://backend.botconversa.com.br/api/v1/webhook';
const FIREBASE_URL     = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const FIREBASE_SECRET  = process.env.FIREBASE_SECRET || '';
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY;

// ── MEMÓRIA DE CONVERSA (ajuste fino aqui) ────────────────────────────────────
// HIST_MAX_MSGS: quantas mensagens (user+assistant) guardar. 16 = ~8 trocas.
// HIST_TTL_MS:   depois de quanto tempo sem falar a conversa "esfria" e começa do zero.
const HIST_MAX_MSGS = 16;
const HIST_TTL_MS   = 6 * 60 * 60 * 1000; // 6 horas

// Fallbacks caso o /v1/models não retorne nada. A env ATHENA_MODEL, se existir, entra na frente.
const MODELOS_FALLBACK = [
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307'
];

function fbUrl(path){
  const b = FIREBASE_URL + path;
  if (!FIREBASE_SECRET) return b;
  return b + (b.indexOf('?') >= 0 ? '&' : '?') + 'auth=' + encodeURIComponent(FIREBASE_SECRET);
}

// ── Histórico da conversa com a IA (memória curta) ────────────────────────────
// Chave = phone sanitizado (mesmo padrão de sanitização do botconversa.js).
function _histKey(phone){ return String(phone || '').replace(/[^a-zA-Z0-9]/g, '_'); }

async function lerHistorico(phone){
  try {
    const k = _histKey(phone);
    const r = await fetch(fbUrl(`/vitaflow_ia_hist/${k}.json`));
    const d = await r.json();
    if (!d || !Array.isArray(d.msgs)) return [];
    // Conversa velha demais → começa limpo (evita misturar assuntos de horas/dias atrás).
    if (d.updated && (Date.now() - d.updated) > HIST_TTL_MS) return [];
    // Segurança: só aceita itens no formato certo e mantém alinhamento user/assistant.
    const limpo = d.msgs.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
    return limpo.slice(-HIST_MAX_MSGS);
  } catch { return []; }
}

async function salvarHistorico(phone, msgs){
  try {
    const k = _histKey(phone);
    const cortado = (Array.isArray(msgs) ? msgs : []).slice(-HIST_MAX_MSGS);
    await fetch(fbUrl(`/vitaflow_ia_hist/${k}.json`), {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ msgs: cortado, updated: Date.now() })
    });
  } catch {}
}

async function buscarCache(colecao){
  try {
    const r = await fetch(fbUrl(`/vitaflow_cache/colecoes/${colecao}.json`));
    const d = await r.json();
    return d && d.dados ? d.dados : '';
  } catch { return ''; }
}

// Monta um resumo do catálogo REAL (mesmas coleções que os menus usam) pra ancorar a IA.
async function catalogoResumo(){
  const cols = ['10-mais-vendidos','emagrecedores','peptideos','hormonios','gh','outros'];
  const parts = await Promise.all(cols.map(async c => {
    const d = await buscarCache(c);
    return d ? ('## ' + c + '\n' + d) : '';
  }));
  let txt = parts.filter(Boolean).join('\n\n');
  if (txt.length > 12000) txt = txt.slice(0, 12000) + '\n…(catálogo truncado)';
  return txt;
}

function normalizarPhone(raw){
  let d = (raw || '').replace(/\D/g, '');
  if (d.length <= 11) d = '55' + d;
  return d;
}

// Empurra a mensagem pro cliente pela API do BotConversa (mesmo padrão do send-whatsapp.js).
// Retorna { ok, etapa, status, detalhe } pra gente saber EXATAMENTE onde travou.
async function enviarBotConversa(phone, message){
  const phoneNorm = normalizarPhone(phone);
  console.log('[IA] enviarBotConversa -> phone bruto:', phone, '| normalizado:', phoneNorm);
  try {
    let subId = null;

    const r1 = await fetch(`${BOTCONVERSA_BASE}/subscriber/get_by_phone/${phoneNorm}/`, { headers: { 'api-key': BOTCONVERSA_KEY } });
    const t1 = await r1.text();
    console.log('[IA] get_by_phone status:', r1.status, '| body:', t1.slice(0, 200));
    if (r1.ok) { try { subId = (JSON.parse(t1) || {}).id || null; } catch {} }

    if (!subId) {
      const r2 = await fetch(`${BOTCONVERSA_BASE}/subscriber/`, {
        method: 'POST', headers: { 'api-key': BOTCONVERSA_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNorm, name: 'Cliente' })
      });
      const t2 = await r2.text();
      console.log('[IA] criar subscriber status:', r2.status, '| body:', t2.slice(0, 200));
      if (r2.ok) { try { subId = (JSON.parse(t2) || {}).id || null; } catch {} }
    }

    if (!subId) {
      console.log('[IA] FALHOU: sem subscriberId (não achou e não criou contato).');
      return { ok:false, etapa:'lookup', status:0, detalhe:'sem subscriberId' };
    }
    console.log('[IA] subscriberId:', subId);

    const r3 = await fetch(`${BOTCONVERSA_BASE}/subscriber/${subId}/send_message/`, {
      method: 'POST', headers: { 'api-key': BOTCONVERSA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', value: message })
    });
    const t3 = await r3.text();
    console.log('[IA] send_message status:', r3.status, '| body:', t3.slice(0, 200));
    if (r3.ok) return { ok:true, etapa:'enviado', status:r3.status, detalhe:'ok' };
    return { ok:false, etapa:'send_message', status:r3.status, detalhe:t3.slice(0, 200) };

  } catch (e) {
    console.log('[IA] EXCEÇÃO enviarBotConversa:', e.message);
    return { ok:false, etapa:'excecao', status:0, detalhe:e.message };
  }
}

const SYSTEM = `Você é a Athena, consultora virtual da VitaFlow — loja de peptídeos, hormônios, emagrecedores, GH e performance, com entrega para todo o Brasil. Fala português do Brasil, tom caloroso, humano e direto — NADA robótico. Você responde qualquer pergunta do cliente da melhor forma possível, como uma vendedora experiente, simpática e persuasiva (sem forçar).

REGRAS DE OURO (NUNCA viole):
- Use SOMENTE o catálogo abaixo para dizer se um produto EXISTE e qual o PREÇO/disponibilidade. NUNCA invente preço, estoque, marca ou produto. Se não estiver no catálogo, diga que vai verificar e oriente a ver no site vitaflowoficial.com.
- NUNCA invente telefone, endereço, prazos ou dados da empresa.
- Categoria sensível (peptídeos/hormônios): pode falar de uso e benefícios de forma geral e responsável, mas NÃO prescreva, NÃO prometa cura e SEMPRE reforce a importância de acompanhamento profissional.
- Seja BREVE (é WhatsApp): 2 a 6 linhas. Use *negrito* (um asterisco de cada lado). NUNCA use ## nem ###.

MEMÓRIA E CONTEXTO DA CONVERSA (MUITO IMPORTANTE):
- Esta é uma conversa CONTÍNUA. As mensagens anteriores (histórico) fazem parte do contexto — leia antes de responder.
- Se VOCÊ fez uma pergunta na sua última mensagem e o cliente respondeu de forma curta (ex.: "primeira vez", "já uso", "nunca usei", "sim", "não", "os dois", "o primeiro", "pode ser"), ISSO É A RESPOSTA À SUA PERGUNTA. Continue de onde parou — NÃO trate como assunto novo nem mude de tema.
- NÃO recomece com saudação de boas-vindas ("seja bem-vindo", "que legal ter você aqui") se a conversa já está em andamento. Cumprimente só se for realmente a primeira mensagem do cliente.
- Mantenha a linha de raciocínio: se estava recomendando um produto/protocolo, siga fechando esse mesmo assunto.

COMO CONDUZIR PRA VENDA (natural, sem empurrar):
- Se o cliente se interessar por um produto, incentive a digitar o *nome do produto* (ex.: "manda *retatrutida* aqui que eu já te mostro as opções e os preços"). Assim o sistema abre a lista com preço e leva o cliente ao carrinho/checkout.
- Pra finalizar, rastrear pedido ou ver tudo: pode indicar digitar *menu*, ou o site vitaflowoficial.com.

PRAZOS OFICIAIS (use sempre "prazo estimado"): despacho em até 48h úteis após o pagamento; entrega estimada — Sudeste 2 a 5, Sul 3 a 5, Centro-Oeste 4 a 6, Nordeste 5 a 8, Norte 7 a 10 dias úteis. A Transportadora inclui seguro grátis; Correios (PAC/SEDEX) não têm seguro.`;

// Pergunta pra própria API da Anthropic QUAIS modelos essa chave pode usar (resolve o 404 de vez).
async function modelosDisponiveis(){
  try {
    const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' }
    });
    const d = await r.json();
    if (d && Array.isArray(d.data)) {
      const ids = d.data.map(m => m.id);
      console.log('[IA] /v1/models status:', r.status, '| DISPONÍVEIS:', ids.join(', ') || '(lista vazia)');
      return ids;
    }
    console.log('[IA] /v1/models status:', r.status, '| resposta:', JSON.stringify(d).slice(0, 300));
    return [];
  } catch (e) {
    console.log('[IA] EXCEÇÃO /v1/models:', e.message);
    return [];
  }
}

// Monta a ordem de preferência: env forçada > Sonnet disponível > Haiku disponível > resto > fallbacks.
function montarCandidatos(disponiveis){
  const cand = [];
  if (process.env.ATHENA_MODEL) cand.push(process.env.ATHENA_MODEL);
  const sonnets = disponiveis.filter(m => /sonnet/i.test(m));
  const haikus  = disponiveis.filter(m => /haiku/i.test(m));
  const resto   = disponiveis.filter(m => !/sonnet/i.test(m) && !/haiku/i.test(m));
  cand.push(...sonnets, ...haikus, ...resto, ...MODELOS_FALLBACK);
  return cand.filter((m, i) => m && cand.indexOf(m) === i); // tira duplicados, mantém ordem
}

// Chama a Claude testando os modelos (na ordem de preferência) até um responder 200.
// Agora recebe o HISTÓRICO da conversa e o envia junto (memória curta).
async function pensarComClaude(sys, mensagem, historico){
  const disponiveis = await modelosDisponiveis();
  const lista = montarCandidatos(disponiveis);
  console.log('[IA] ordem de tentativa:', lista.join(', '));
  const previas = Array.isArray(historico) ? historico : [];
  const mensagens = previas.concat([{ role: 'user', content: mensagem }]);
  console.log('[IA] histórico enviado:', previas.length, 'msgs anteriores + a atual');
  for (let i = 0; i < lista.length; i++){
    const modelo = lista[i];
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modelo, max_tokens: 600, system: sys, messages: mensagens })
      });
      const d = await r.json();
      const erro = d && d.error ? JSON.stringify(d.error).slice(0,160) : 'nenhum';
      console.log('[IA] tentativa modelo:', modelo, '-> status', r.status, '| erro:', erro);
      if (r.status === 200 && d && d.content && d.content[0] && d.content[0].text) {
        return { texto: d.content[0].text.trim(), modelo: modelo };
      }
    } catch (e) {
      console.log('[IA] EXCEÇÃO modelo', modelo, ':', e.message);
    }
  }
  return { texto: '', modelo: '' };
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const phone = body.phone;
    const mensagem = (body.mensagem || '').toString().trim();
    const promoContext = (body.promoContext || '').toString().trim(); // regras REAIS de promoção/desconto (vêm do botconversa.js)
    console.log('[IA] START | phone:', phone, '| mensagem:', mensagem);
    if (!phone || !mensagem) { console.log('[IA] no-op: faltou phone ou mensagem'); return { statusCode: 200, body: 'no-op' }; }

    // Memória: carrega o que já foi conversado com esse cliente.
    const historico = await lerHistorico(phone);

    const catalogo = await catalogoResumo();
    console.log('[IA] catalogo len:', catalogo.length, '| promoContext:', promoContext ? 'sim' : 'nao', '| histórico:', historico.length, '| ANTHROPIC_KEY presente:', !!ANTHROPIC_KEY);
    let sys = SYSTEM + `\n\n=== CATÁLOGO REAL (preços e disponibilidade de hoje) ===\n${catalogo}`;
    if (promoContext) {
      sys += `\n\n=== PROMOÇÕES E DESCONTOS (regras REAIS de hoje — use SOMENTE isto, NÃO invente promoção) ===\n${promoContext}`;
    }

    const pensado = await pensarComClaude(sys, mensagem, historico);
    let reply = pensado.texto;
    console.log('[IA] modelo que funcionou:', pensado.modelo || 'NENHUM');

    if (!reply) {
      console.log('[IA] reply vazio -> usando texto reserva (Claude não respondeu).');
      reply = 'Deixa eu te ajudar melhor! 😊 Me diz o *nome do produto* que você procura (ex.: *retatrutida*, *bpc-157*, *stanozolol*) ou digite *menu* pra ver as categorias.';
    } else {
      console.log('[IA] reply da Claude OK (', reply.length, 'chars ):', reply.slice(0, 120));
    }

    // Memória: grava a troca (pergunta do cliente + resposta da Athena) pra próxima mensagem ter contexto.
    await salvarHistorico(phone, historico.concat([
      { role: 'user', content: mensagem },
      { role: 'assistant', content: reply }
    ]));

    const envio = await enviarBotConversa(phone, reply);
    console.log('[IA] RESULTADO ENVIO:', JSON.stringify(envio));
    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    console.log('[IA] EXCEÇÃO handler:', e.message);
    return { statusCode: 200, body: 'err:' + e.message };
  }
};
