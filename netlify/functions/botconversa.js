const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Histórico em memória por sessão (dura enquanto a função está quente)
// Para persistência real, usar KV store (Netlify Blobs ou Upstash Redis)
const sessionHistory = {};

const SYSTEM_PROMPT = `Você é Athena, assistente virtual da VitaFlow — especializada em suplementação avançada e performance humana.

REGRAS OBRIGATÓRIAS:
- Nunca mencione hormônios, peptídeos ou substâncias controladas diretamente pelo nome em contextos que possam gerar restrições
- Não mencione que atende Paraguai ou Argentina — fale apenas "entregamos para toda a América Latina" se perguntado
- Tom: profissional, direto, acolhedor. Sem emojis excessivos
- Para compras, direcione sempre para: vitaflowoficial.com
- Instagram: @vitaflow.py
- Se o cliente pedir para falar com humano: responda {"transferir": true, "mensagem": "Claro! Vou te conectar com nossa equipe agora."} em JSON
- Respostas curtas e objetivas — máximo 3 parágrafos
- Nunca invente preços ou produtos — diga que pode consultar no site

SOBRE A VITAFLOW:
- E-commerce especializado em performance e suplementação avançada
- DINAVISA autorizada no Paraguai
- Pagamento: Pix, cartão até 12x
- Atendimento via WhatsApp e Instagram`;

exports.handler = async (event) => {
  // CORS
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // BotConversa vai mandar a mensagem do cliente aqui
    const mensagem = body.mensagem || body.message || body.texto || "";
    const sessionId = body.session_id || body.phone || body.subscriber_id || "default";

    if (!mensagem) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Campo 'mensagem' obrigatório" }),
      };
    }

    // Recupera histórico da sessão (últimas 10 mensagens)
    if (!sessionHistory[sessionId]) {
      sessionHistory[sessionId] = [];
    }

    const history = sessionHistory[sessionId];

    // Adiciona mensagem do usuário ao histórico
    history.push({ role: "user", content: mensagem });

    // Mantém só as últimas 10 mensagens (5 trocas)
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }

    // Chama Claude
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: history,
    });

    const respostaTexto = response.content[0].text;

    // Adiciona resposta ao histórico
    history.push({ role: "assistant", content: respostaTexto });

    // Verifica se deve transferir para humano
    let transferir = false;
    let mensagemFinal = respostaTexto;

    try {
      const parsed = JSON.parse(respostaTexto);
      if (parsed.transferir === true) {
        transferir = true;
        mensagemFinal = parsed.mensagem;
        // Limpa histórico ao transferir
        delete sessionHistory[sessionId];
      }
    } catch {
      // Resposta normal, não é JSON
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        resposta: mensagemFinal,
        transferir: transferir,
        session_id: sessionId,
      }),
    };
  } catch (error) {
    console.error("Erro:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        resposta: "Desculpe, tive um problema técnico. Tente novamente em instantes.",
        transferir: false,
        error: error.message,
      }),
    };
  }
};
