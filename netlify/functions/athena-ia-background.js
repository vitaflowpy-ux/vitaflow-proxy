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
// >>> RECURSOS: <<<
//   (1) Testa uma lista de modelos até um funcionar (resolve 404 de modelo).
//   (2) URL do BotConversa com "/webhook" (base correta).
//   (3) MEMÓRIA de conversa (nó `vitaflow_ia_hist/{phone}`): a IA lembra das últimas trocas.
//   (4) A IA ABRE A LISTA REAL DE PRODUTOS sozinha, sem o cliente digitar o nome.
//       Quando ela decide mostrar produtos, ela põe um marcador [[LISTA:colecao:termo]] no
//       fim da resposta; aqui a gente monta a lista de verdade (do cache), grava a sessão
//       como LISTA_PRODUTOS (pro botconversa.js continuar o fluxo: número → carrinho → pagamento)
//       e manda a fala + a lista numerada. O cliente só escolhe o número.

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

// Coleções válidas do catálogo (mesmas que o botconversa.js usa).
const COLECOES = ['emagrecedores','peptideos','hormonios','gh','outros','10-mais-vendidos'];

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

// ── Utilitários (mesma lógica do botconversa.js, pra a lista sair IDÊNTICA) ────
function norm(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ç/g,'c').trim();
}
function emojis(i){
  const e = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  return i < 10 ? e[i] : `${i+1}.`;
}
function formatarLista(linhas){
  const SEP = '\n┈┈┈┈┈┈┈┈┈┈\n';
  return linhas.map((l, i) => {
    const [nome, preco] = l.split('|');
    return preco ? `${emojis(i)} *${nome.trim()}* — R$ ${preco.trim()}` : `${emojis(i)} *${nome.trim()}*`;
  }).join(SEP);
}
function parseProdutos(linhas){
  return linhas.map(l => {
    const [nome, preco] = l.split('|');
    const precoNum = preco ? parseFloat(preco.replace(/\./g,'').replace(',','.')) : 0;
    return { nome: nome.trim(), preco: precoNum };
  });
}
function filtrarCache(dados, termos){
  const lista = Array.isArray(termos) ? termos : [termos];
  const resultados = new Set();
  lista.forEach(termo => {
    const palavras = norm(termo).split(/\s+/).filter(p => p.length > 2);
    if (!palavras.length) return;
    (dados||'').split('\n').filter(Boolean).forEach(linha => {
      const nomeProd = norm(linha.split('|')[0]);
      if (palavras.every(p => nomeProd.includes(p))) resultados.add(linha);
    });
  });
  return [...resultados];
}

// ── Sessão (mesma chave/sanitização do botconversa.js) ────────────────────────
function _sessKey(sid){ return String(sid || '').replace(/[^a-zA-Z0-9]/g, '_'); }
async function getSession(sid){
  try {
    const r = await fetch(fbUrl(`/vitaflow_sessions/${_sessKey(sid)}.json`));
    const d = await r.json();
    return d || { state:'MENU' };
  } catch { return { state:'MENU' }; }
}
async function saveSession(sid, sess){
  try {
    await fetch(fbUrl(`/vitaflow_sessions/${_sessKey(sid)}.json`), {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(sess)
    });
  } catch {}
}

// ── Histórico da conversa com a IA (memória curta) ────────────────────────────
function _histKey(phone){ return String(phone || '').replace(/[^a-zA-Z0-9]/g, '_'); }
async function lerHistorico(phone){
  try {
    const r = await fetch(fbUrl(`/vitaflow_ia_hist/${_histKey(phone)}.json`));
    const d = await r.json();
    if (!d || !Array.isArray(d.msgs)) return [];
    if (d.updated && (Date.now() - d.updated) > HIST_TTL_MS) return []; // conversa velha → começa limpo
    const limpo = d.msgs.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
    return limpo.slice(-HIST_MAX_MSGS);
  } catch { return []; }
}
async function salvarHistorico(phone, msgs){
  try {
    const cortado = (Array.isArray(msgs) ? msgs : []).slice(-HIST_MAX_MSGS);
    await fetch(fbUrl(`/vitaflow_ia_hist/${_histKey(phone)}.json`), {
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
async function buscarTodosCache(){
  const resultados = await Promise.all(COLECOES.map(c => buscarCache(c)));
  return resultados.join('\n');
}

// Monta um resumo do catálogo REAL (mesmas coleções que os menus usam) pra ancorar a IA.
async function catalogoResumo(){
  const parts = await Promise.all(COLECOES.map(async c => {
    const d = await buscarCache(c);
    return d ? ('## ' + c + '\n' + d) : '';
  }));
  let txt = parts.filter(Boolean).join('\n\n');
  if (txt.length > 12000) txt = txt.slice(0, 12000) + '\n…(catálogo truncado)';
  return txt;
}

// Monta a lista REAL de produtos pra uma coleção+termo (o que a IA pede via marcador).
// Retorna { linhas, produtoLista } — linhas no formato "nome|preco" (pra formatar) e
// produtoLista no formato { nome, preco } (pro botconversa.js continuar o fluxo).
async function montarLista(colecao, termo){
  colecao = (colecao || '').toLowerCase().trim();
  termo = (termo || '').trim();
  let dados = '';
  if (colecao && COLECOES.indexOf(colecao) >= 0) dados = await buscarCache(colecao);
  let linhas;
  if (termo) {
    linhas = filtrarCache(dados, [termo]);
    if (!linhas.length) { // fallback: procura em TODAS as coleções se não achou na indicada
      const tudo = await buscarTodosCache();
      linhas = filtrarCache(tudo, [termo]);
    }
  } else {
    linhas = String(dados || '').split('\n').filter(Boolean);
  }
  const unicas = [...new Set(linhas)];
  return { linhas: unicas, produtoLista: parseProdutos(unicas) };
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

const SYSTEM = `Você é a Athena, consultora virtual da VitaFlow — loja de peptídeos, hormônios, emagrecedores, GH e performance, com entrega para todo o Brasil. Fala português do Brasil, tom caloroso, humano e direto — NADA robótico. Você é uma vendedora experiente, simpática e persuasiva (sem forçar), e você FECHA a venda aqui mesmo no WhatsApp.

REGRAS DE OURO (NUNCA viole):
- Use SOMENTE o catálogo abaixo para dizer se um produto EXISTE e qual o PREÇO/formato/disponibilidade. NUNCA invente preço, estoque, marca, formato (caneta/frasco/mg) ou produto. Se não tiver 100% de certeza, NÃO afirme — abra a lista (ver abaixo) e deixe o sistema mostrar os dados reais.
- NUNCA invente telefone, endereço, prazos ou dados da empresa.
- Seja BREVE (é WhatsApp): 2 a 6 linhas. Use *negrito* (um asterisco de cada lado). NUNCA use ## nem ###.
- Mantenha COERÊNCIA com o que você já disse (o histórico está acima). Nunca se contradiga.

VOCÊ FECHA A VENDA AQUI — NUNCA mande o cliente comprar no site:
- A compra é finalizada AQUI no WhatsApp: o cliente escolhe o produto, monta o carrinho e o sistema gera o link de pagamento. É PROIBIDO dizer que "a compra tem que ser pelo site" — isso é FALSO e faz perder venda.
- Se o cliente disser que quer comprar com você, ótimo: conduza pro fechamento aqui (abrindo a lista).

COMO LEVAR O CLIENTE AO PRODUTO (sem pedir pra ele digitar o nome):
- Quando o cliente demonstrar intenção de VER ou COMPRAR ("quero ver", "qual o preço", "quanto custa", "quero comprar", "vou querer a tirzepatida"), ou depois que VOCÊ recomendou e ele topou, NÃO peça pra ele digitar o nome. Em vez disso, TERMINE sua mensagem com um marcador que o sistema usa pra abrir a lista real (com preços e botão de compra):
    [[LISTA:colecao:termo]]
  - colecao (obrigatório), uma destas: emagrecedores, peptideos, hormonios, gh, outros, 10-mais-vendidos
  - termo é o nome/família do produto (ex.: retatrutida, tirzepatida, bpc, stanozolol). Deixe VAZIO pra mostrar a categoria inteira.
  - Exemplos:
    "Perfeito! Já te mostro as opções de tirzepatida 👇 [[LISTA:emagrecedores:tirzepatida]]"
    "Boa! Aqui vão nossos peptídeos 👇 [[LISTA:peptideos:]]"
- O texto ANTES do marcador deve ser CURTO (1-2 linhas) — a lista já fala por si. O cliente NÃO vê o marcador; ele vê sua fala + a lista numerada e é só escolher o número.
- Use o marcador SÓ quando houver intenção clara de ver/comprar. Em papo de dúvida/recomendação, primeiro converse; abra a lista quando o cliente sinalizar que quer ver ou comprar.
- NUNCA escreva a lista de produtos/preços você mesma na prosa — sempre use o marcador pra abrir a lista real (evita erro de preço/produto).

RECOMENDAÇÃO E PROTOCOLO (é aqui que você brilha):
- Pode recomendar, comparar produtos e montar protocolo GENÉRICO (visão geral de uso, benefícios e duração) pra criar valor e confiança.
- Ao falar de RENDIMENTO/duração, use SEMPRE o cenário mais favorável de venda: calcule pela DOSE MÍNIMA eficaz (rende MAIS), NUNCA pela dose máxima. Ex.: uma caneta de 60mg de tirzepatida/retatrutida, a 2mg por semana, rende ~30 semanas (nunca diga "1 mês").
- Deixe claro, com educação, que o PROTOCOLO COMPLETO e personalizado (doses exatas, ciclo, cuidados) você envia logo APÓS a confirmação da compra — use isso como incentivo pra fechar.
- Categoria sensível: fale de uso e benefícios de forma responsável, sem prometer cura, sempre reforçando acompanhamento profissional.

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
// Recebe o HISTÓRICO da conversa e o envia junto (memória curta).
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
      reply = 'Deixa eu te ajudar melhor! 😊 Me conta o que você procura (ex.: emagrecer, ganhar massa, um produto específico) que eu já te mostro as opções com preço.';
    } else {
      console.log('[IA] reply da Claude OK (', reply.length, 'chars ):', reply.slice(0, 120));
    }

    // ── A IA quer ABRIR A LISTA REAL? Procura o marcador [[LISTA:colecao:termo]] ──
    const mLista = reply.match(/\[\[\s*LISTA\s*:\s*([a-z0-9\-]*)\s*:\s*([^\]]*?)\s*\]\]/i);
    const replyLimpo = reply.replace(/\[\[\s*LISTA\s*:[^\]]*\]\]/gi, '').trim();

    if (mLista) {
      const colecao = mLista[1] || '';
      const termo = mLista[2] || '';
      console.log('[IA] marcador LISTA -> colecao:', colecao, '| termo:', termo);
      const abertura = await montarLista(colecao, termo);
      if (abertura && abertura.linhas.length) {
        // grava a sessão como LISTA_PRODUTOS pro botconversa.js continuar (número → carrinho → pagamento)
        const sessAtual = await getSession(phone);
        await saveSession(phone, { ...sessAtual, state:'LISTA_PRODUTOS', produtoLista: abertura.produtoLista, errosSeguidos:0 });
        const corpo = (replyLimpo ? replyLimpo + '\n\n' : '') + formatarLista(abertura.linhas) + '\n\n*Digite o número do produto:*';
        // guarda no histórico só a FALA (não a lista gigante)
        await salvarHistorico(phone, historico.concat([
          { role:'user', content: mensagem },
          { role:'assistant', content: replyLimpo || `(abriu a lista de ${termo || colecao})` }
        ]));
        const envio = await enviarBotConversa(phone, corpo);
        console.log('[IA] RESULTADO ENVIO (lista):', JSON.stringify(envio));
        return { statusCode: 200, body: 'ok' };
      }
      console.log('[IA] marcador LISTA sem resultados — envia só a fala.');
    }

    // ── Fluxo normal (sem abrir lista) ──
    const textoFinal = replyLimpo || reply;
    await salvarHistorico(phone, historico.concat([
      { role:'user', content: mensagem },
      { role:'assistant', content: textoFinal }
    ]));
    const envio = await enviarBotConversa(phone, textoFinal);
    console.log('[IA] RESULTADO ENVIO:', JSON.stringify(envio));
    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    console.log('[IA] EXCEÇÃO handler:', e.message);
    return { statusCode: 200, body: 'err:' + e.message };
  }
};
