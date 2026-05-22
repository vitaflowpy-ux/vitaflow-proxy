// netlify/functions/extract-dados.js
// Proxy para chamada à API Anthropic — extrai dados de mensagem de venda

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { mensagem } = JSON.parse(event.body || '{}');
    if (!mensagem) throw new Error('mensagem vazia');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Extraia os dados desta conversa de venda e retorne APENAS um JSON válido, sem explicação, sem markdown:

{
  "nome": "",
  "cpf": "",
  "telefone": "",
  "email": "",
  "endereco": "",
  "cep": "",
  "cidade": "",
  "estado": "",
  "produtos": [{"nome":"","quantidade":1,"preco_unit":0.00}],
  "frete_descricao": "",
  "frete_valor": 0.00,
  "total": 0.00,
  "pagamento": ""
}

Regras:
- CPF: formato 000.000.000-00
- Telefone: formato (DD) 9XXXX-XXXX
- CEP: formato 00000-000
- Estado: sigla maiúscula (SP, RJ, etc.)
- produtos: lista com nome, quantidade e preço unitário em reais (número)
- frete_valor: número em reais
- total: número em reais
- pagamento: "PIX" ou "Cartão"
- Campos não encontrados: string vazia ou 0

Conversa:
${mensagem}`
        }]
      })
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(parsed),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
