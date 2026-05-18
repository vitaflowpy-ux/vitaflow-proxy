const SHOPIFY_STORE = 'vitaflow-7352';
const INFINITEPAY_TAG = 'vitaflowoficial';

const SYSTEM_PROMPT = `Você é a Athena, assistente virtual da VitaFlow, especializada em suplementação avançada e performance humana.

IDENTIDADE:
- Tom: profissional, direto e acolhedor
- Idioma: português brasileiro
- NUNCA mencione peptídeos, hormônios, GH ou substâncias controladas pelo nome
- NUNCA mencione Paraguai ou Argentina — se perguntado sobre entregas, diga apenas "entregamos para todo o Brasil"

CAPACIDADES:
- Você consegue consultar o catálogo atualizado da loja em tempo real
- Quando o cliente perguntar sobre um produto específico, use os dados do catálogo consultado
- Para ver todos os produtos: vitaflowoficial.com

GERAÇÃO DE LINK DE PAGAMENTO:
- Quando o cliente confirmar que quer comprar um produto específico e souber o valor, responda EXATAMENTE neste formato:
  [GERAR_PAGAMENTO:nome do produto:valor numérico]
  Exemplo: [GERAR_PAGAMENTO:BPC-157 5mg:89.90]
- Só gere o link quando o cliente confirmar claramente que quer comprar e você tiver o produto e valor definidos
- Não gere link para dúvidas ou consultas de preço

REGRAS:
- Nunca invente preços ou disponibilidade — use apenas os dados consultados do catálogo
- Para finalizar compras também pode direcionar para: vitaflowoficial.com
- Se o cliente quiser falar com humano, diga que vai transferir e encerre com: [ESCALAR_HUMANO]
- Não discuta assuntos fora do escopo da VitaFlow
- Seja breve e objetivo

SITE: vitaflowoficial.com
INSTAGRAM: @vitaflow.py`;

// Histórico em memória (persiste enquanto a função está quente)
const sessionHistory = {};

async function buscarProdutos(query) {
  try {
    const res = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify({
          query: `{
            products(first: 5, query: "${query}") {
              edges {
                node {
                  title
                  availableForSale
                  variants(first: 1) {
                    edges {
                      node {
                        price { amount }
                        availableForSale
                        quantityAvailable
                      }
                    }
                  }
                }
              }
            }
          }`
        })
      }
    );
    const data = await res.json();
    const produtos = data?.data?.products?.edges;
    if (!produtos || produtos.length === 0) return null;
    return produtos.map(({ node: p }) => {
      const preco = p.variants?.edges?.[0]?.node?.price?.amount || '0';
      const disponivel = p.availableForSale;
      return `• ${p.title} — R$ ${parseFloat(preco).toFixed(2)} — ${disponivel ? 'Disponível ✅' : 'Indisponível ❌'}`;
    }).join('\n');
  } catch (err) {
    console.error('Erro Shopify:', err);
    return null;
  }
}

async function gerarLinkInfinitePay(produto, valor) {
  try {
    const res = await fetch('https://api.checkout.infinitepay.io/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: INFINITEPAY_TAG,
        redirect_url: 'https://vitaflowoficial.com/pages/obrigado',
        items: [{
          quantity: 1,
          price: Math.round(valor * 100),
          description: produto
        }]
      })
    });
    const data = await res.json();
    console.log('InfinitePay response:', JSON.stringify(data));
    return data?.url || null;
  } catch (err) {
    console.error('Erro InfinitePay:', err);
    return null;
  }
}

async function enviarTelegram(texto) {
  try {
    await fetch('https://api.telegram.org/bot8689592582:AAEjalaa2hDQxstUVhm45CG4aZd9OiDDRXY/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: '8660563352', text: texto })
    });
  } catch (err) {
    console.error('Erro Telegram:', err);
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const mensagem = body.mensagem || body.message || body.texto || '';
    const sessionId = body.phone || body.subscriber_id || body.session_id || 'default';

    if (!mensagem) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Campo mensagem obrigatorio' }) };
    }

    // Histórico da sessão
    if (!sessionHistory[sessionId]) sessionHistory[sessionId] = [];
    const history = sessionHistory[sessionId];

    // Busca produtos se a mensagem mencionar produto/preço
    const palavrasProduto = ['tem', 'disponível', 'disponivel', 'preço', 'preco', 'valor', 'quanto', 'vende', 'mg', 'peptideo', 'peptídeo', 'comprar', 'quero', 'produto'];
    const perguntaProduto = palavrasProduto.some(p => mensagem.toLowerCase().includes(p));

    let contextoProdutos = '';
    if (perguntaProduto) {
      const produtos = await buscarProdutos(mensagem);
      if (produtos) {
        contextoProdutos = `\n\nDados atuais do catálogo VitaFlow:\n${produtos}`;
      }
    }

    // Adiciona mensagem ao histórico
    history.push({ role: 'user', content: mensagem });
    if (history.length > 10) history.splice(0, history.length - 10);

    // Chama Claude
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT + contextoProdutos,
        messages: history
      })
    });

    const claudeData = await claudeRes.json();
    let reply = claudeData.content?.[0]?.text || 'Desculpe, não consegui processar sua mensagem.';

    // Adiciona resposta ao histórico
    history.push({ role: 'assistant', content: reply });

    // Escalar para humano
    const escalar = reply.includes('[ESCALAR_HUMANO]');
    reply = reply.replace('[ESCALAR_HUMANO]', '').trim();

    if (escalar) {
      await enviarTelegram(`🔔 CLIENTE QUER FALAR COM HUMANO\n\n📱 Número: ${sessionId}\n💬 Última mensagem: ${mensagem}`);
      delete sessionHistory[sessionId];
    }

    // Gerar link de pagamento
    const matchPagamento = reply.match(/\[GERAR_PAGAMENTO:(.+?):(\d+\.?\d*)\]/);
    if (matchPagamento) {
      const nomeProduto = matchPagamento[1];
      const valor = parseFloat(matchPagamento[2]);
      reply = reply.replace(matchPagamento[0], '').trim();

      const link = await gerarLinkInfinitePay(nomeProduto, valor);
      if (link) {
        reply += `\n\n💳 *Link de pagamento:*\n${link}\n\nPague com Pix ou cartão em até 12x. ✅`;
      } else {
        reply += `\n\nPara finalizar sua compra acesse: vitaflowoficial.com`;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        resposta: reply,
        transferir: escalar,
        session_id: sessionId
      })
    };

  } catch (error) {
    console.error('Erro:', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        resposta: 'Desculpe, tive um problema técnico. Tente novamente em instantes.',
        transferir: false
      })
    };
  }
};
