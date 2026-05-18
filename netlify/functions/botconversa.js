const SHOPIFY_STORE = 'vitaflow-7352';
const INFINITEPAY_TAG = 'vitaflowoficial';

const SYSTEM_PROMPT = `Você é a Athena, assistente virtual da VitaFlow, especializada em suplementação avançada e performance humana.

IDENTIDADE:
- Tom: profissional, direto e acolhedor
- Idioma: português brasileiro
- NUNCA mencione peptídeos, hormônios, GH ou substâncias controladas pelo nome
- NUNCA mencione Paraguai ou Argentina — se perguntado sobre entregas, diga apenas "entregamos para todo o Brasil"

CAPACIDADES:
- Você consulta o catálogo atualizado da loja em tempo real
- Quando receber dados do catálogo, use-os para responder com preços e disponibilidade reais
- Se um produto não aparecer no catálogo consultado, diga que não encontrou e sugira acessar vitaflowoficial.com

GERAÇÃO DE LINK DE PAGAMENTO:
- Quando o cliente confirmar que quer comprar um produto específico e você tiver o valor, responda EXATAMENTE neste formato:
  [GERAR_PAGAMENTO:nome do produto:valor numérico]
  Exemplo: [GERAR_PAGAMENTO:BPC-157 5mg:89.90]
- Só gere o link quando o cliente confirmar claramente que quer comprar e você tiver produto e valor definidos
- Não gere link para dúvidas ou consultas de preço

REGRAS:
- Nunca invente preços ou disponibilidade — use apenas os dados do catálogo
- Se o cliente quiser falar com humano, diga que vai transferir e encerre com: [ESCALAR_HUMANO]
- Não discuta assuntos fora do escopo da VitaFlow
- Seja breve e objetivo — máximo 3 parágrafos

SITE: vitaflowoficial.com
INSTAGRAM: @vitaflow.py`;

const sessionHistory = {};

async function extrairTermoBusca(mensagem) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        system: 'Você extrai o nome do produto mencionado na mensagem do cliente. Responda APENAS com o nome do produto, sem explicações. Se não houver produto específico, responda "nenhum".',
        messages: [{ role: 'user', content: mensagem }]
      })
    });
    const data = await res.json();
    const termo = data.content?.[0]?.text?.trim() || 'nenhum';
    return termo.toLowerCase() === 'nenhum' ? null : termo;
  } catch (err) {
    console.error('Erro ao extrair termo:', err);
    return null;
  }
}

async function buscarProdutos(termo) {
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
            products(first: 20, query: "title:*${termo}*") {
              edges {
                node {
                  title
                  availableForSale
                  variants(first: 5) {
                    edges {
                      node {
                        title
                        price { amount }
                        availableForSale
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
      const variants = p.variants?.edges || [];
      if (variants.length === 1) {
        const preco = variants[0]?.node?.price?.amount || '0';
        return `• ${p.title} — R$ ${parseFloat(preco).toFixed(2)} — ${p.availableForSale ? 'Disponível' : 'Indisponível'}`;
      } else {
        const variantesTexto = variants.map(({ node: v }) =>
          `  - ${v.title}: R$ ${parseFloat(v.price?.amount || 0).toFixed(2)} — ${v.availableForSale ? 'Disponível' : 'Indisponível'}`
        ).join('\n');
        return `• ${p.title}:\n${variantesTexto}`;
      }
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
        items: [{ quantity: 1, price: Math.round(valor * 100), description: produto }]
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

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    console.log('BODY RECEBIDO:', JSON.stringify(body));

    const mensagem = body.mensagem || body.message || body.texto || '';
    const sessionId = body.phone || body.subscriber_id || body.session_id || 'default';

    console.log('MENSAGEM:', mensagem, '| SESSION:', sessionId);

    if (!mensagem) {
      console.log('MENSAGEM VAZIA - retornando erro');
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Campo mensagem obrigatorio' }) };
    }

    if (!sessionHistory[sessionId]) sessionHistory[sessionId] = [];
    const history = sessionHistory[sessionId];

    const termoBusca = await extrairTermoBusca(mensagem);
    console.log('TERMO DE BUSCA:', termoBusca);

    let contextoProdutos = '';
    if (termoBusca) {
      const produtos = await buscarProdutos(termoBusca);
      if (produtos) {
        contextoProdutos = `\n\nRESULTADO DA BUSCA NO CATÁLOGO para "${termoBusca}":\n${produtos}`;
        console.log('PRODUTOS ENCONTRADOS:', produtos.substring(0, 200));
      } else {
        contextoProdutos = `\n\nRESULTADO DA BUSCA NO CATÁLOGO para "${termoBusca}": nenhum produto encontrado.`;
        console.log('NENHUM PRODUTO ENCONTRADO para:', termoBusca);
      }
    }

    history.push({ role: 'user', content: mensagem });
    if (history.length > 10) history.splice(0, history.length - 10);

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
    console.log('RESPOSTA CLAUDE:', reply.substring(0, 200));

    history.push({ role: 'assistant', content: reply });

    const escalar = reply.includes('[ESCALAR_HUMANO]');
    reply = reply.replace('[ESCALAR_HUMANO]', '').trim();
    if (escalar) {
      await enviarTelegram(`🔔 CLIENTE QUER FALAR COM HUMANO\n\n📱 Número: ${sessionId}\n💬 Última mensagem: ${mensagem}`);
      delete sessionHistory[sessionId];
    }

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
      body: JSON.stringify({ resposta: reply, transferir: escalar, session_id: sessionId })
    };

  } catch (error) {
    console.error('Erro geral:', error);
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
