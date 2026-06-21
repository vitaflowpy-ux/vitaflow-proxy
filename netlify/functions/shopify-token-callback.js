// netlify/functions/shopify-token-callback.js
// Recebe o código OAuth do Shopify e troca pelo token shpat_

exports.handler = async (event) => {
  const CLIENT_ID = 'cf3ac11bf9d1b25cd4e89f4fa534a9c7';
  const CLIENT_SECRET = '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';
  const SHOP = 'nv18ua-1w.myshopify.com';

  const params = event.queryStringParameters || {};
  const code = params.code;

  if (!code) {
    return {
      statusCode: 400,
      body: '<h2>Erro: código OAuth não recebido.</h2><pre>' + JSON.stringify(params, null, 2) + '</pre>'
    };
  }

  try {
    const response = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code
      })
    });

    const data = await response.json();

    if (data.access_token) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html>
          <body style="font-family:monospace;background:#111;color:#fff;padding:40px;">
            <h2 style="color:#27AE60">✅ Token gerado com sucesso!</h2>
            <p>Copie o token abaixo e atualize no Netlify como <b>SHOPIFY_ACCESS_TOKEN</b>:</p>
            <div style="background:#222;padding:20px;border-radius:8px;border:2px solid #27AE60;font-size:18px;word-break:break-all;">
              ${data.access_token}
            </div>
            <p style="margin-top:20px;color:#aaa;">Escopo: ${data.scope || '—'}</p>
          </body>
          </html>
        `
      };
    } else {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: `<h2 style="color:red">Erro ao gerar token</h2><pre>${JSON.stringify(data, null, 2)}</pre>`
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `<h2 style="color:red">Erro interno</h2><pre>${err.message}</pre>`
    };
  }
};
