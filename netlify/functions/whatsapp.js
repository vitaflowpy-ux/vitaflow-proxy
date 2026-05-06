const VERIFY_TOKEN = 'vitaflow2024';
const WHATSAPP_TOKEN = 'EAGB6ZA80DXwgBRVunQ40uUZCGPZCxVIQ3D2LSFSDqtad1IQUvTp4Lgn4rPNX7T451mACK1n1FBhLsdtoQEteiashi7DVpq1FagWjVoWbiERmK7uveHKcKROSByjFZB0z5NMEnOb8gB4rZCXnBx56vBWyXI5T03PWdA5Qh2C38O8nkPJHlDvBhbobRP5NRyRTbBUMDiyMZB06ZCHiZAdoG8TwdwD36ZALrGdRpdSWeDPMzsbMbxyQwVDTn4NySxkNZAVniDE1GgbZCQcf5OGqwuZBuh45aKq5glyFsgIby7OptswZD';
const PHONE_NUMBER_ID = '1005147169358134';

const SYSTEM_PROMPT = `Você é a assistente virtual da VitaFlow, loja especializada em peptídeos, hormônios e GH. Atendemos Brasil, Paraguai e Argentina.

IDENTIDADE:
- Nome: Via (assistente da VitaFlow)
- Tom: profissional, direto e acolhedor
- Idioma: português brasileiro

PRODUTOS:
- Peptídeos: BPC-157, TB-500, Retatrutida, Tirzepatida, Semaglutida, AOD-9604, GHRP-2, GHRP-6, CJC-1295, Ipamorelin, SS-31, Klow, entre outros
- Hormônios: Testosterona (Cipionato, Enantato), Trembolona, Boldenona, Oxandrolona, entre outros
- GH: Somatropina, fragmentos de GH

REGRAS:
- Nunca invente preços — diga que os preços estão no site vitaflowoficial.com
- Para compras, direcione para: vitaflowoficial.com
- Se o cliente quiser falar com humano, diga que vai transferir e encerre com: [ESCALAR_HUMANO]
- Não discuta assuntos fora do escopo da VitaFlow
- Seja breve e objetivo nas respostas

SITE: vitaflowoficial.com
INSTAGRAM: @vitaflow.py`;

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

      // Chama Claude via fetch direto
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
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: text }]
        })
      });

      const claudeData = await claudeRes.json();
      let reply = claudeData.content?.[0]?.text || 'Desculpe, não consegui processar sua mensagem.';
      const escalar = reply.includes('[ESCALAR_HUMANO]');
      reply = reply.replace('[ESCALAR_HUMANO]', '').trim();

      // Envia resposta via WhatsApp
      await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: from,
          type: 'text',
          text: { body: reply }
        })
      });

      // Notifica no Telegram se precisar escalar
      if (escalar) {
        await fetch('https://api.telegram.org/bot8689592582:AAEjalaa2hDQxstUVhm45CG4aZd9OiDDRXY/sendMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: '8660563352',
            text: `🔔 CLIENTE QUER FALAR COM HUMANO\n\n📱 Número: +${from}\n💬 Última mensagem: ${text}`
          })
        });
      }

      return { statusCode: 200, body: 'ok' };

    } catch (err) {
      console.error(err);
      return { statusCode: 200, body: 'ok' };
    }
  }

  return { statusCode: 405, body: 'Method not allowed' };
};
