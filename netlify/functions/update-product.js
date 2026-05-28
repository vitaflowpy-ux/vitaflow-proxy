// netlify/functions/update-product.js
// Busca produto no Shopify pelo nome e atualiza título, preço e fabricante
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
    const { nomeAtual, novoNome, novoPreco, novoFabricante } = JSON.parse(event.body || '{}');
    if (!nomeAtual) throw new Error('nomeAtual obrigatório');

    // Busca produto pelo título atual
    const query = encodeURIComponent(nomeAtual);
    const searchRes = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/products.json?title=${query}&limit=5&fields=id,title`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' } }
    );
    const searchData = await searchRes.json();
    const produtos = searchData.products || [];

    // Busca match exato (case insensitive)
    const found = produtos.find(p =>
      p.title.toLowerCase().trim() === nomeAtual.toLowerCase().trim()
    ) || produtos[0];

    if (!found) {
      return {
        statusCode: 404,
        headers: cors,
        body: JSON.stringify({ erro: 'Produto não encontrado no Shopify: ' + nomeAtual })
      };
    }

    // Monta payload de atualização
    const updatePayload = { product: { id: found.id } };
    if (novoNome      && novoNome !== nomeAtual) updatePayload.product.title  = novoNome;
    if (novoFabricante !== undefined)             updatePayload.product.vendor = novoFabricante;

    // Atualiza produto
    const updateRes = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/products/${found.id}.json`,
      {
        method: 'PUT',
        headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      }
    );
    const updateData = await updateRes.json();
    if (!updateRes.ok) throw new Error(JSON.stringify(updateData.errors || updateData));

    // Atualiza preço na primeira variante se necessário
    if (novoPreco !== undefined && novoPreco !== null) {
      const varRes = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/products/${found.id}/variants.json?limit=1`,
        { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
      );
      const varData = await varRes.json();
      const varId   = varData.variants?.[0]?.id;
      if (varId) {
        await fetch(
          `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/variants/${varId}.json`,
          {
            method: 'PUT',
            headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ variant: { id: varId, price: String(novoPreco) } })
          }
        );
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ ok: true, shopifyId: found.id, titulo: novoNome || nomeAtual })
    };

  } catch(e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ erro: e.message }) };
  }
};
