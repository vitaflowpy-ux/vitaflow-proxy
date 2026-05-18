const sessionHistory = {};

const SYSTEM_PROMPT = `Você é Athena, assistente virtual da VitaFlow — especializada em suplementação avançada e performance humana.

REGRAS OBRIGATÓRIAS:
- Nunca mencione hormônios, peptídeos ou substâncias controladas diretamente pelo nome em contextos que possam gerar restrições
- Não mencione que atende Paraguai ou Argentina — fale apenas "entregamos para toda o Brasil" se perguntado
- Tom: profissional, direto, acolhedor. Sem emojis excessivos
- Para compras, direcione sempre para: vitaflowoficial.com
- Instagram: @vitaflow.py
- Se o cliente pedir para falar com humano, responda APENAS este JSON exato: {"transferir":true,"mensagem":"Claro! Vou te conectar com nossa equipe agora."}
- Respostas curtas e objetivas — máximo 3 parágrafos
- Nunca invente preços ou produtos — diga que pode consultar no site

SOBRE A VITAFLOW:
- E-commerce especializado em performance e suplementação avançada
- DINAVISA autorizada no Paraguai
- Pagamento: Pix, cartão até 12x
- Atendimento via WhatsApp e Instagram`;

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const mensagem = body.mensagem || body.message || body.texto || "";
    const sessionId = body.session_id || body.phone || body.subscriber_id || "default";

    if (!mensagem) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Campo 'mensagem' obrigatorio" }) };
    }

    if (!sessionHistory[sessionId]) sessionHistory[sessionId] = [];
    const history = sessionHistory[sessionId];

    history.push({ role: "user", content: mensagem });
    if (history.length > 10) history.splice(0, history.length - 10);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: history,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    const respostaTexto = data.content[0].text;

    history.push({ role: "assistant", content: respostaTexto });

    let transferir = false;
    let mensagemFinal = respostaTexto;

    try {
      const parsed = JSON.parse(respostaTexto);
      if (parsed.transferir === true) {
        transferir = true;
        mensagemFinal = parsed.mensagem;
        delete sessionHistory[sessionId];
      }
    } catch {
      // resposta normal
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ resposta: mensagemFinal, transferir, session_id: sessionId }),
    };
  } catch (error) {
    console.error("Erro:", error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        resposta: "Desculpe, tive um problema técnico. Tente novamente em instantes.",
        transferir: false,
      }),
    };
  }
};
