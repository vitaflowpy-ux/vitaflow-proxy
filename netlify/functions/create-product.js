// netlify/functions/create-product.js
// Cria produto como rascunho no Shopify via Admin API
const SHOPIFY_DOMAIN = 'nv18ua-1w.myshopify.com';
const SHOPIFY_TOKEN  = process.env.SHOPIFY_TOKEN;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  try {
    const produtos = JSON.parse(event.body || '[]');
    if (!Array.isArray(produtos) || !produtos.length) throw new Error('Lista de produtos vazia');

    const resultados = [];

    for (const p of produtos) {
      try {
        const payload = {
          product: {
            title: p.nome,
            status: 'draft',
            product_type: p.categoria || 'Outros',
            vendor: p.marca || p.fonte || '',
            body_html: '',
            variants: [{
              price: String(p.preco || 0),
              inventory_management: null,
            }],
          }
        };

        const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2025-01/products.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok) {
          resultados.push({ nome: p.nome, ok: false, erro: JSON.stringify(data.errors || data) });
        } else {
          resultados.push({ nome: p.nome, ok: true, id: data.product.id });
        }

        // Respeita rate limit Shopify: ~2 req/s
        await new Promise(r => setTimeout(r, 550));

      } catch(err) {
        resultados.push({ nome: p.nome, ok: false, erro: err.message });
      }
    }

    const ok  = resultados.filter(r => r.ok).length;
    const err = resultados.filter(r => !r.ok).length;

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ ok, err, resultados }),
    };

  } catch(e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ erro: e.message }) };
  }
};
