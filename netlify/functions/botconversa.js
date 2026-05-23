const SHOPIFY_STORE = 'vitaflow-7352';
const INFINITEPAY_TAG = 'vitaflowoficial';
const FIREBASE_URL = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxFlaN0FXFbpcC8HZ80sxnq383m5d-xTaj5cg72VcCdnYx47N_qKkiELFN5KAPmm_nb/exec';

const SYSTEM_PROMPT = `Você é a Athena, assistente virtual da VitaFlow, especializada em suplementação avançada e performance humana.

IDENTIDADE:
- Tom: profissional, direto e acolhedor — como um consultor de confiança, não um robô
- Idioma: português brasileiro
- NUNCA mencione que atende Paraguai ou Argentina — se perguntado sobre entregas, diga apenas "entregamos para todo o Brasil"
- Quando se apresentar: "✨ Olá! Eu sou a *Athena* 🤖💊, assistente virtual da *VitaFlow*! 🚀\nEstou aqui para te ajudar com nossos produtos de suplementação avançada e performance humana. 💪🔥\nO que você está procurando hoje?"
- NUNCA liste categorias na apresentação — só responda o que o cliente perguntar

CATÁLOGO:
- O catálogo real é fornecido no contexto quando disponível — use APENAS esses dados
- Se o catálogo mostrar "nenhum produto encontrado", diga que não temos esse produto e sugira vitaflowoficial.com
- NUNCA invente produtos, preços ou disponibilidade
- Ao listar produtos: use emojis numéricos 1️⃣ 2️⃣ ... 🔟 e depois 11. 12. etc, com linha em branco entre cada item
- Formato: emoji *Nome do produto* — R$ preço

CATEGORIAS DISPONÍVEIS (quando cliente pedir):
Mais Vendidos • Peptídeos • Hormônios • GH • Promoções • Outros

PROTOCOLOS:
- Pode explicar para que serve um produto e seus benefícios livremente
- Protocolo de uso (como usar, dosagem) só fornece após a compra ser confirmada e [DADOS_CLIENTE] disparado

FRETE E ENTREGA:
- Pergunte estado e modalidade ANTES de gerar link de pagamento
- Modalidades: PAC, SEDEX e Transportadora (Jadlog, J&T Express ou Loggi)
- Recomende sempre Transportadora — seguro grátis incluso (cobre apreensão/extravio)
- Correios (PAC/SEDEX) NÃO possuem seguro
- Despacho: até 48h úteis após pagamento
- Prazos ESTIMADOS (a partir do despacho): Sudeste 2-5d | Sul 3-5d | Centro-Oeste 4-6d | Nordeste 5-8d | Norte 7-10d
- SEMPRE use "prazo estimado" e informe que começa após o despacho
- Tabela:
  RJ: PAC R$45 | SEDEX R$60 | Transp. R$70 | SP: PAC R$45 | SEDEX R$60 | Transp. R$55
  MG: PAC R$45 | SEDEX R$70 | Transp. R$70 | ES: PAC R$45 | SEDEX R$70 | Transp. R$70
  DF: PAC R$45 | SEDEX R$60 | Transp. R$72 | PR: PAC R$45 | SEDEX R$60 | Transp. R$70
  SC: PAC R$45 | SEDEX R$70 | Transp. R$70 | RS: PAC R$45 | SEDEX R$70 | Transp. R$100
  GO: PAC R$45 | SEDEX R$70 | Transp. R$76 | MS: PAC R$45 | SEDEX R$85 | Transp. R$80
  BA: PAC R$58 | SEDEX R$90 | Transp. R$80 | MT: PAC R$58 | SEDEX R$90 | Transp. R$75
  CE: PAC R$72 | SEDEX R$105 | Transp. R$80 | PA: PAC R$87 | SEDEX R$105 | Transp. R$110
  PE: PAC R$87 | SEDEX R$115 | Transp. R$90 | TO: PAC R$87 | SEDEX R$105 | Transp. R$110
  MA: PAC R$100 | SEDEX R$125 | Transp. R$90 | PB: PAC R$100 | SEDEX R$125 | Transp. R$100
  RN: PAC R$100 | SEDEX R$125 | Transp. R$100 | PI: PAC R$100 | SEDEX R$125 | Transp. R$110
  AL: PAC R$100 | SEDEX R$125 | Transp. R$90 | SE: PAC R$100 | SEDEX R$125 | Transp. R$90
  AM: PAC R$100 | SEDEX R$125 | Transp. R$110 | RO: PAC R$100 | SEDEX R$110 | Transp. R$170
  AP: PAC R$100 | SEDEX R$125 | Transp. R$120 | RR: PAC R$130 | SEDEX R$110
  AC: PAC R$130 | SEDEX R$110 | Transp. R$150

PAGAMENTO:
- Quando tiver produto + frete definidos, responda EXATAMENTE:
  [GERAR_PAGAMENTO:nome do produto + Frete ESTADO MODALIDADE:valor total]
  Exemplo: [GERAR_PAGAMENTO:BPC-157 5mg XL Peptides + Frete RJ PAC:134.90]
- Só gere quando cliente confirmar que quer comprar

PÓS-VENDA:
- Após gerar link, pergunte se pagou
- Qualquer confirmação verbal ("paguei", "sim", "fiz", "ok") = aceito, siga para dados
- Colete: NOME, CPF, TELEFONE, EMAIL, ENDEREÇO, COMPLEMENTO, BAIRRO, CIDADE, ESTADO, CEP
- O cliente pode mandar todos os dados de uma vez em várias linhas — leia cada linha e extraia os campos na ordem: nome, cpf, telefone, email, endereço, complemento, bairro, cidade, estado, cep
- Se uma linha parecer endereço (rua, avenida, estrada, etc), é o endereço
- Se uma linha tiver @, é o email
- Se uma linha tiver só números com 11 dígitos, é o telefone ou CPF
- Email: aceite qualquer formato com @ e ponto; se recusar 2x use "nao_informado"
- CPF: se recusar 2x use "nao_informado"; complemento não informado: use "sem complemento"
- Com TODOS os dados extraídos, responda EXATAMENTE em uma linha:
  [DADOS_CLIENTE:nome|cpf|telefone|email|endereco|complemento|bairro|cidade|estado|cep|produto|valor]
- NUNCA peça os dados de novo se o cliente já os enviou — processe o que recebeu
- NUNCA diga "pedido finalizado" sem disparar [DADOS_CLIENTE] antes

LOGÍSTICA:
- Se cliente perguntar sobre entrega/rastreio/atraso de pedido JÁ REALIZADO, responda:
  "Para questões de entrega, nosso setor de logística vai te atender! 📦\nWhatsApp: *+44 7537 155718*\nLeve: número do pedido, CPF e nome completo."

ESCALAÇÃO:
- Se cliente quiser falar com humano: [ESCALAR_HUMANO]

SITE: vitaflowoficial.com | INSTAGRAM: @vitaflow.py`;

// ── Utilitários ───────────────────────────────────────────────────────────────

function limparTagsXML(texto) {
  return texto.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '').replace(/<[^>]+>/g, '').trim();
}

function normalizarTexto(texto) {
  return (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ç/g, 'c').trim();
}

// ── Firebase: histórico de sessão ─────────────────────────────────────────────

async function getHistory(sessionId) {
  try {
    const key = sessionId.replace(/[^a-zA-Z0-9]/g, '_');
    const res = await fetch(`${FIREBASE_URL}/vitaflow_sessions/${key}.json`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function saveHistory(sessionId, history) {
  try {
    const key = sessionId.replace(/[^a-zA-Z0-9]/g, '_');
    await fetch(`${FIREBASE_URL}/vitaflow_sessions/${key}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(history.slice(-10))
    });
  } catch {}
}

async function deleteHistory(sessionId) {
  try {
    const key = sessionId.replace(/[^a-zA-Z0-9]/g, '_');
    await fetch(`${FIREBASE_URL}/vitaflow_sessions/${key}.json`, { method: 'DELETE' });
  } catch {}
}

// ── Shopify: coleções (via cache Firebase) ───────────────────────────────────

const MAPA_COLECOES = {
  'mais vendidos': '10-mais-vendidos', 'mais vendido': '10-mais-vendidos',
  'peptideo': 'peptideos', 'peptideos': 'peptideos', 'peps': 'peptideos', 'pep': 'peptideos',
  'hormonio': 'hormonios', 'hormonios': 'hormonios',
  'anabolizante': 'hormonios', 'anabolizantes': 'hormonios',
  'esteroide': 'hormonios', 'esteroides': 'hormonios',
  'bomba': 'hormonios', 'bombas': 'hormonios',
  'promocao': 'promocoes', 'promocoes': 'promocoes', 'promo': 'promocoes', 'oferta': 'promocoes',
  'sarm': 'outros', 'sarms': 'outros', 'outros': 'outros',
};

async function buscarColecaoCache(handle) {
  try {
    const res = await fetch(`${FIREBASE_URL}/vitaflow_cache/colecoes/${handle}.json`);
    const data = await res.json();
    return data?.dados || null;
  } catch { return null; }
}

async function buscarProdutosShopify(termo) {
  try {
    const termoLimpo = normalizarTexto(termo).replace(/['"]/g, '').trim();
    const res = await fetch(`https://${SHOPIFY_STORE}.myshopify.com/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({
        query: `{ products(first: 50, query: "${termoLimpo}") { edges { node { title availableForSale variants(first: 3) { edges { node { title price { amount } availableForSale } } } } } } }`
      })
    });
    const data = await res.json();
    const produtos = data?.data?.products?.edges?.filter(({ node: p }) => p.availableForSale);
    if (!produtos || produtos.length === 0) return null;
    return produtos.map(({ node: p }) => {
      const variants = p.variants?.edges?.filter(({ node: v }) => v.availableForSale) || [];
      if (variants.length <= 1) {
        const preco = parseFloat(variants[0]?.node?.price?.amount || '0');
        return `${p.title}|${preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      }
      const vars = variants.map(({ node: v }) => {
        const preco = parseFloat(v.price?.amount || 0);
        return `${v.title}:R$${preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      }).join(';');
      return `${p.title}|${vars}`;
    }).join('\n');
  } catch { return null; }
}

function formatarLista(dados, titulo) {
  const linhas = dados.split('\n').filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const LIMITE = 50;
  const exibir = linhas.slice(0, LIMITE);
  const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  const lista = exibir.map((linha, i) => {
    const [nome, preco] = linha.split('|');
    const emoji = i < 10 ? emojis[i] : `${i+1}.`;
    return preco ? `${emoji} *${nome.trim()}* — R$ ${preco.trim()}` : `${emoji} *${nome.trim()}*`;
  }).join('\n\n');
  const rodape = linhas.length > LIMITE
    ? `\n\n_Mostrando ${LIMITE} de ${linhas.length}. Me diga o nome ou marca para buscar mais!_`
    : '';
  return `Aqui estão os produtos de *${titulo}* disponíveis! 💪\n\n${lista}${rodape}\n\nQual te interessa? Me diz o nome ou número! 🚀`;
}

// ── InfinitePay ───────────────────────────────────────────────────────────────

async function gerarLinkInfinitePay(produto, valor) {
  try {
    const res = await fetch('https://api.checkout.infinitepay.io/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: INFINITEPAY_TAG,
        redirect_url: 'https://vitaflowoficial.com/pages/obrigado',
        items: [{ quantity: 1, price: Math.round(valor * 100), description: produto }]
      })
    });
    const data = await res.json();
    return data?.url || null;
  } catch { return null; }
}

// ── GAS / Pedido ──────────────────────────────────────────────────────────────

async function gerarNumeroPedido() {
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'gerar_numero', tipo: 'A' })
    });
    const data = await res.json();
    return data.order_nsu || null;
  } catch { return null; }
}

async function salvarPedidoGAS(pedido) {
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido)
    });
  } catch {}
}

async function enviarTelegram(texto) {
  try {
    await fetch('https://api.telegram.org/bot8689592582:AAEjalaa2hDQxstUVhm45CG4aZd9OiDDRXY/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: '8660563352', text: texto })
    });
  } catch {}
}

// ── Handler principal ─────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const mensagem = body.mensagem || body.message || body.texto || '';
    const sessionId = body.phone || body.subscriber_id || body.session_id || 'default';

    console.log('MENSAGEM:', mensagem, '| SESSION:', sessionId);

    if (!mensagem) return { statusCode: 400, headers, body: JSON.stringify({ error: 'mensagem obrigatoria' }) };

    const history = await getHistory(sessionId);
    const msgNorm = normalizarTexto(mensagem);

    // ── MÍDIA: trata como comprovante de pagamento ────────────────────────────
    const ehMidia = body.type === 'image' || body.type === 'video' || body.type === 'document' || body.type === 'audio' || mensagem === '' || mensagem === '[image]' || mensagem === '[video]' || mensagem === '[document]' || mensagem === '[audio]' || mensagem === '[sticker]';
    if (ehMidia && history.length > 0) {
      // Injeta como confirmação de pagamento no histórico
      const msgComprovante = 'O cliente enviou o comprovante de pagamento por imagem/mídia. Considere como pagamento confirmado e solicite os dados de entrega.';
      history.push({ role: 'user', content: msgComprovante });
      const claudeResComp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 500, system: SYSTEM_PROMPT, messages: history })
      });
      const compData = await claudeResComp.json();
      const replyComp = limparTagsXML(compData.content?.[0]?.text || 'Comprovante recebido! ✅ Agora me passe seus dados para o envio.');
      history.push({ role: 'assistant', content: replyComp });
      await saveHistory(sessionId, history);
      return { statusCode: 200, headers, body: JSON.stringify({ resposta: replyComp, resposta2: '', resposta3: '', transferir: false, session_id: sessionId }) };
    }
    const palavras = msgNorm.split(/\s+/).filter(Boolean);

    // ── 1. BYPASS: COLEÇÃO ────────────────────────────────────────────────────
    // Detecta só se mensagem curta e palavra-chave exata (evita GHK → GH)
    let handleColecao = null;
    let nomeColecao = null;

    if (palavras.length <= 5) {
      // GH isolado — não pega GHK, GHRP etc
      if (palavras.some(p => p === 'gh') && !msgNorm.match(/gh[a-z]/)) {
        handleColecao = 'gh'; nomeColecao = 'GH';
      }
      if (!handleColecao) {
        for (const [palavra, handle] of Object.entries(MAPA_COLECOES)) {
          if (msgNorm.includes(palavra)) {
            handleColecao = handle;
            nomeColecao = handle === '10-mais-vendidos' ? 'MAIS VENDIDOS'
              : handle === 'peptideos' ? 'PEPTÍDEOS'
              : handle === 'hormonios' ? 'HORMÔNIOS'
              : handle === 'promocoes' ? 'PROMOÇÕES'
              : handle.toUpperCase();
            break;
          }
        }
      }
    }

    if (handleColecao) {
      console.log('COLECAO:', handleColecao);
      const dados = await buscarColecaoCache(handleColecao);
      if (dados) {
        const reply = formatarLista(dados, nomeColecao);
        history.push({ role: 'user', content: mensagem });
        history.push({ role: 'assistant', content: reply });
        await saveHistory(sessionId, history);
        console.log('CACHE HIT:', handleColecao);
        return { statusCode: 200, headers, body: JSON.stringify({ resposta: reply, resposta2: '', resposta3: '', transferir: false, session_id: sessionId }) };
      }
    }

    // ── 2. BYPASS: "tabela de produtos" ──────────────────────────────────────
    const pedindoCategorias = ['tabela de produto', 'tabela completa', 'ver categoria', 'quais categoria', 'lista de produto', 'o que voce vende', 'o que voces vendem', 'o que tem', 'o que voce tem', 'catalogo'];
    if (pedindoCategorias.some(p => msgNorm.includes(p))) {
      const reply = `Temos as seguintes categorias! 📋\n\n1️⃣ *Mais Vendidos*\n2️⃣ *Peptídeos*\n3️⃣ *Hormônios*\n4️⃣ *GH*\n5️⃣ *Promoções*\n6️⃣ *Outros*\n\nQual quer ver? 😊`;
      history.push({ role: 'user', content: mensagem });
      history.push({ role: 'assistant', content: reply });
      await saveHistory(sessionId, history);
      return { statusCode: 200, headers, body: JSON.stringify({ resposta: reply, resposta2: '', resposta3: '', transferir: false, session_id: sessionId }) };
    }

    // ── 3. BUSCA DE PRODUTO NO SHOPIFY ────────────────────────────────────────
    // Só busca se a mensagem parece ser sobre um produto
    // (não é saudação, não é pergunta de contexto com histórico)
    const ehSaudacao = ['bom dia', 'boa tarde', 'boa noite', 'oi', 'ola', 'opa', 'eai', 'e ai', 'hey', 'hi', 'hello', 'tudo bem', 'tudo bom', 'como vai'].some(p => msgNorm === p || msgNorm.startsWith(p + ' ') || msgNorm.startsWith(p + '!'));
    const temHistorico = history.length > 0;
    const ehPerguntaContextual = temHistorico && (
      /^[0-9]{1,2}$/.test(msgNorm) ||
      ['qual', 'quanto', 'como', 'porque', 'por que', 'diferenca', 'melhor', 'pior', 'recomend', 'mais barat', 'mais caro', 'esse', 'essa', 'quero esse', 'quero essa', 'pode ser', 'gerar', 'pagar', 'frete', 'entrega', 'comprar', 'sim', 'nao', 'ok', 'combinado', 'fechado', 'paguei', 'fiz', 'feito', 'confirmado', 'obrigado', 'obrigada', 'valeu'].some(p => msgNorm.includes(p))
    );

    let contextoProdutos = '';

    if (!ehSaudacao && !ehPerguntaContextual) {
      // Tenta busca direta
      let produtos = await buscarProdutosShopify(mensagem);
      console.log('BUSCA DIRETA:', produtos ? 'encontrou' : 'não encontrou');

      // Fallback: palavras individuais
      if (!produtos) {
        const stopWords = new Set(['voce', 'tem', 'para', 'quero', 'qual', 'como', 'esse', 'esta', 'uma', 'que', 'com', 'dos', 'das', 'marca', 'produto', 'linha', 'sobre', 'ver', 'mostrar', 'quais', 'mais', 'tudo', 'seus', 'suas', 'minha', 'meu', 'comprar', 'preciso', 'gostaria']);
        const termos = palavras.filter(p => p.length > 3 && !stopWords.has(p));
        for (const termo of termos) {
          produtos = await buscarProdutosShopify(termo);
          if (produtos) { console.log('BUSCA PALAVRA:', termo); break; }
        }
      }

      if (produtos) {
        // Monta lista sem passar pelo Sonnet
        const linhas = produtos.split('\n').filter(Boolean);
        const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
        const lista = linhas.map((linha, i) => {
          const [nome, preco] = linha.split('|');
          const emoji = i < 10 ? emojis[i] : `${i+1}.`;
          return preco ? `${emoji} *${nome.trim()}* — R$ ${preco.trim()}` : `${emoji} *${nome.trim()}*`;
        }).join('\n\n');
        const reply = `Aqui estão os produtos disponíveis! 💪\n\n${lista}\n\nQual te interessa? Me diz o nome ou número que geramos o link de pagamento! 🚀`;
        history.push({ role: 'user', content: mensagem });
        history.push({ role: 'assistant', content: reply });
        await saveHistory(sessionId, history);
        return { statusCode: 200, headers, body: JSON.stringify({ resposta: reply, resposta2: '', resposta3: '', transferir: false, session_id: sessionId }) };
      } else {
        contextoProdutos = `\n\nCATÁLOGO: Busca por "${mensagem}" não retornou resultados. Informe que não encontrou e sugira vitaflowoficial.com ou pergunte se quer ver alguma categoria.`;
        console.log('NENHUM PRODUTO ENCONTRADO');
      }
    }

    // ── 4. SONNET — conversa geral, contexto, pós-venda ──────────────────────
    history.push({ role: 'user', content: mensagem });

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: SYSTEM_PROMPT + contextoProdutos,
        messages: history
      })
    });

    const claudeData = await claudeRes.json();
    if (claudeData.error || !claudeData.content) {
      console.error('ERRO CLAUDE:', JSON.stringify(claudeData));
      await new Promise(r => setTimeout(r, 1000));
      return { statusCode: 200, headers, body: JSON.stringify({ resposta: 'Desculpe, tive um problema técnico. Pode repetir?', resposta2: '', resposta3: '', transferir: false }) };
    }

    let reply = limparTagsXML(claudeData.content[0].text || '');
    console.log('SONNET:', reply.substring(0, 150));

    // Escalar para humano
    const escalar = reply.includes('[ESCALAR_HUMANO]');
    reply = reply.replace('[ESCALAR_HUMANO]', '').trim();
    if (escalar) {
      await enviarTelegram(`🔔 CLIENTE QUER HUMANO\n📱 ${sessionId}\n💬 ${mensagem}`);
      await deleteHistory(sessionId);
    }

    // Gerar link de pagamento
    const matchPag = reply.match(/\[GERAR_PAGAMENTO:(.+?):(\d+\.?\d*)\]/);
    if (matchPag) {
      reply = reply.replace(matchPag[0], '').trim();
      const nomeProdPag = matchPag[1];
      const valorPag = parseFloat(matchPag[2]);
      const link = await gerarLinkInfinitePay(nomeProdPag, valorPag);

      // Salva no Firebase: phone + produto + valor + subscriber_id para o GAS usar após confirmação
      try {
        const orderKey = `pending_${sessionId.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const subscriberId = body.subscriber_id || body.id || null;
        await fetch(`${FIREBASE_URL}/vitaflow_pending_orders/${orderKey}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: sessionId, produto: nomeProdPag, valor: valorPag, subscriber_id: subscriberId, ts: Date.now() })
        });
        console.log('FIREBASE PENDING SALVO:', orderKey, 'subscriber_id:', subscriberId);
      } catch {}

      reply += link
        ? `\n\n💳 *Link de pagamento:*\n${link}\n\nPague e me envie o comprovante assim que concluir! 📸\n_(pode ser print ou foto)_`
        : `\n\nAcesse: vitaflowoficial.com`;
      history.push({ role: 'assistant', content: reply });
      await saveHistory(sessionId, history);
      return { statusCode: 200, headers, body: JSON.stringify({ resposta: reply, resposta2: '', resposta3: '', transferir: false, session_id: sessionId }) };
    }

    // Processar dados pós-venda
    const matchDados = reply.match(/\[DADOS_CLIENTE:(.+?)\]/);
    if (matchDados) {
      reply = reply.replace(matchDados[0], '').trim();
      const [nome, cpfRaw, telefone, email, endereco, complemento, bairro, cidade, estado, cep, produto, valorRaw] = matchDados[1].split('|');
      const cpfNum = (cpfRaw || '').replace(/\D/g, '');
      const cpf = cpfNum.length === 11 ? `${cpfNum.slice(0,3)}.${cpfNum.slice(3,6)}.${cpfNum.slice(6,9)}-${cpfNum.slice(9)}` : cpfRaw;
      const emailNorm = (email || 'nao_informado').toLowerCase().trim();
      const valorReais = parseFloat(valorRaw || '0') || 0;
      const valorCentavos = Math.round(valorReais * 100);
      const nomeProduto = produto || 'Pedido via Athena WhatsApp';
      const numeroPedido = await gerarNumeroPedido();

      if (numeroPedido) {
        await salvarPedidoGAS({
          order_nsu: numeroPedido, paid_amount: valorCentavos, capture_method: 'whatsapp_athena',
          customer: { name: nome, email: emailNorm, phone_number: telefone, document: cpf },
          address: { street: endereco, number: '', complement: complemento, neighborhood: bairro, city: cidade, state: estado, cep },
          items: [{ description: nomeProduto, quantity: 1, price: valorCentavos }]
        });
        await enviarTelegram(`🤖 *VENDA ATHENA!*\n\n📦 ${numeroPedido}\n👤 ${nome}\n🪪 ${cpf}\n📱 ${telefone}\n📧 ${emailNorm}\n🏠 ${endereco}${complemento && complemento !== 'sem complemento' ? ', '+complemento : ''}, ${bairro}, ${cidade}-${estado}, ${cep}\n🛒 ${nomeProduto}\n💰 R$ ${valorReais.toFixed(2)}\n📱 ${sessionId}`);
        await deleteHistory(sessionId);

        const msgConfirmacao = `✅ *Pedido ${numeroPedido} confirmado!*\n\n📦 ${nomeProduto}\n💰 R$ ${valorReais.toFixed(2)}\n\n🔍 *Rastreie seu pedido:*\nvitaflowoficial.com/pages/rastrear-pedido\nNúmero: *${numeroPedido}*\n\n─────────────────────\n⚠️ *AVISOS IMPORTANTES — VITAFLOW* ⚠️\n\n📹 *1. FILMAGEM DA ABERTURA — OBRIGATÓRIO*\nAo receber, grave um vídeo *contínuo e sem cortes* desde a embalagem fechada até retirar todos os itens.\n\n*Por que?* Já identificamos casos de entregadores que retiraram produtos e lacraram a caixa novamente sem deixar vestígios. O vídeo é a única prova possível.\n\n✅ Filme a caixa fechada antes de abrir\n✅ Não pause nem corte\n✅ Filme todos os itens ao retirar\n\n❗ *Sem o vídeo não conseguimos abrir reclamação.* A responsabilidade pela filmagem é do cliente.\n\n─────────────────────\n📍 *2. ENDEREÇO E RECEBIMENTO*\nDeve haver uma pessoa disponível para receber pessoalmente. ❗ *A responsabilidade pelo endereço correto e pelo recebimento é do cliente.*\n\n─────────────────────\n⚠️ *3. DISPONIBILIDADE DE ESTOQUE*\nDevido ao alto volume de vendas, o estoque pode oscilar. Se algum item estiver indisponível, faremos substituição equivalente ou superior. Para não receber substitutos, entre em contato antes do despacho da encomenda.\n\n─────────────────────\n💬 Qualquer problema, fale conosco *imediatamente* com o vídeo da abertura. 💪\n— *Equipe VitaFlow* 🧡`;

        return { statusCode: 200, headers, body: JSON.stringify({ resposta: msgConfirmacao, resposta2: '', resposta3: '', transferir: false, session_id: sessionId }) };
      } else {
        reply = 'Dados recebidos! Em instantes você receberá a confirmação. ✅';
        await enviarTelegram(`⚠️ ERRO NÚMERO\n${matchDados[1]}\n${sessionId}`);
      }
    }

    history.push({ role: 'assistant', content: reply });
    await saveHistory(sessionId, history);

    return { statusCode: 200, headers, body: JSON.stringify({ resposta: reply, resposta2: '', resposta3: '', transferir: escalar, session_id: sessionId }) };

  } catch (err) {
    console.error('ERRO GERAL:', err);
    return { statusCode: 200, headers, body: JSON.stringify({ resposta: 'Desculpe, tive um problema técnico. Tente novamente!', resposta2: '', resposta3: '', transferir: false }) };
  }
};
