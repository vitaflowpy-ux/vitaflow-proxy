const VERIFY_TOKEN = 'vitaflow2024';
const WHATSAPP_TOKEN = 'EAGB6ZA80DXwgBRYscmVS6vBcWfpWUJOhhJMhrpAYiCb4kelXCVFJR2ZCaEWIgEnV8yvjVSmWhe7ioKX9ac6REa1KeZCbcGDDkRq8jZBT9TMdHmtn3KnJX6vQe6ZCcwMqnZA8NhNqUT6xkZBZC2bIZBd5CgPIXYO1ywKs5eWhXwJqqgZAoynBz6aZBdsCidZAEpclxLgHq7kfczViXkEp5ZAI2y3SXNiJI6vDvKtxUZCS9n3GdNzmo1pXfmz9rnBnVbwSypxEqpPCBT1bY7OcUQsxzmyd9lL9QcKW1HSZCfvwOFFklYZD';
const PHONE_NUMBER_ID = '1005147169358134';
const SHOPIFY_STORE = 'vitaflow-7352';

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

const SYSTEM_PROMPT = `Você é a Athena, assistente virtual da VitaFlow, loja especializada em peptídeos, hormônios e GH. Atendemos Brasil, Paraguai e Argentina.

IDENTIDADE:
- Tom: profissional, direto e acolhedor
- Idioma: português brasileiro

CAPACIDADES:
- Você consegue consultar o catálogo atualizado da loja em tempo real
- Quando o cliente perguntar sobre um produto específico, use os dados do catálogo consultado
- Para ver todos os produtos: vitaflowoficial.com

REGRAS:
- Nunca invente preços ou disponibilidade — use apenas os dados consultados do catálogo
- Para finalizar compras, direcione para: vitaflowoficial.com
- Se o cliente quiser falar com humano, diga que vai transferir e encerre com: [ESCALAR_HUMANO]
- Não discuta assuntos fora do escopo da VitaFlow
- Seja breve e objetivo

SITE: vitaflowoficial.com
INSTAGRAM: @vitaflow.py`;

async function enviarWhatsApp(to, body) {
  await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body }
    })
  });
}

async function enviarTelegram(texto) {
  await fetch('https://api.telegram.org/bot8689592582:AAEjalaa2hDQxstUVhm45CG4aZd9OiDDRXY/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: '8660563352', text: texto })
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters;
    if (params['hub.verify_token'] === VERIFY_TOKEN && params['hub.challenge']) {
      return { statusCode: 200, body: params['hub.challenge'] };
    }
    return { statusCode: 403, body: 'Token inválido' };
  }

  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body);
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (!message || message.type !== 'text') {
        return { statusCode: 200, body: 'ok' };
      }

      const from = message.from;
      const text = message.text.body;

      const palavrasProduto = ['tem', 'disponível', 'disponivel', 'preço', 'preco', 'valor', 'quanto', 'vende', 'mg', 'peptideo', 'peptídeo'];
      const perguntaProduto = palavrasProduto.some(p => text.toLowerCase().includes(p));

      let contextoProdutos = '';
      if (perguntaProduto) {
        const produtos = await buscarProdutos(text);
        if (produtos) {
          contextoProdutos = `\n\nDados atuais do catálogo VitaFlow:\n${produtos}`;
        }
      }

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
          messages: [{ role: 'user', content: text }]
        })
      });

      const claudeData = await claudeRes.json();
      let reply = claudeData.content?.[0]?.text || 'Desculpe, não consegui processar sua mensagem.';
      const escalar = reply.includes('[ESCALAR_HUMANO]');
      reply = reply.replace('[ESCALAR_HUMANO]', '').trim();

      await enviarWhatsApp(from, reply);

      if (escalar) {
        await enviarTelegram(`🔔 CLIENTE QUER FALAR COM HUMANO\n\n📱 Número: +${from}\n💬 Última mensagem: ${text}`);
      }

      return { statusCode: 200, body: 'ok' };

    } catch (err) {
      console.error(err);
      return { statusCode: 200, body: 'ok' };
    }
  }

  return { statusCode: 405, body: 'Method not allowed' };
};
