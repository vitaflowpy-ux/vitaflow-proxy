// netlify/functions/shopify-oauth-callback.js
exports.handler = async (event) => {
  const CLIENT_ID = '4a40ce8787485a646fab2874817526a6';
  const CLIENT_SECRET = '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';
  const SHOP = 'vitaflow-7352.myshopify.com';

  const { code } = event.queryStringParameters || {};

  if (!code) {
    return {
      statusCode: 400,
      body: '<h2>Erro: code não recebido</h2>',
    };
  }

  try {
    const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
    });

    const data = await res.json();

    if (data.access_token) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="UTF-8"><title>Token gerado!</title>
          <style>
            body { font-family: monospace; background: #0a0e1a; color: #e8eaf0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .box { background: #111827; border: 1px solid #00d4c8; border-radius: 12px; padding: 40px; max-width: 700px; width: 90%; }
            h1 { color: #00d4c8; margin-bottom: 8px; }
            .token { background: #0a0e1a; border: 1px solid #222d42; border-radius: 8px; padding: 16px; font-size: 14px; word-break: break-all; color: #22d68a; margin: 20px 0; }
            .btn { background: #00d4c8; color: #0a0e1a; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; font-family: monospace; }
            p { color: #8892a4; font-size: 13px; }
          </style>
          </head>
          <body>
            <div class="box">
              <h1>✅ Token gerado com sucesso!</h1>
              <p>Copie o token abaixo e salve em local seguro. Ele não será exibido novamente.</p>
              <div class="token" id="token">${data.access_token}</div>
              <button class="btn" onclick="navigator.clipboard.writeText('${data.access_token}').then(()=>this.textContent='✅ Copiado!')">📋 Copiar token</button>
              <p style="margin-top:20px;">Agora cole esse token nas variáveis de ambiente do Netlify:<br>
              <b>vitaflow-radar</b>: SHOPIFY_ACCESS_TOKEN e vitaflow_radar<br>
              <b>vitaflow-proxy</b>: SHOPIFY_TOKEN e SHOPIFY_ACCESS_TOKEN</p>
            </div>
          </body>
          </html>
        `,
      };
    } else {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: `<h2 style="color:red">Erro: ${JSON.stringify(data)}</h2>`,
      };
    }
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `<h2 style="color:red">Erro: ${e.message}</h2>`,
    };
  }
};
