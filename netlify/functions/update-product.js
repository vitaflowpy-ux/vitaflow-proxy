// netlify/functions/update-product.js
// Busca produto no Shopify pelo nome e atualiza campos
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
    const { nomeAtual, novoNome, novoPreco, novoFabricante, novoStatus, novoInventoryManagement } = JSON.parse(event.body || '{}');
    if (!nomeAtual) throw new Error('nomeAtual obrigatório');

    // Busca produto pelo título
    const query = encodeURIComponent(nomeAtual);
    const searchRes = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/products.json?title=${query}&limit=5&fields=id,title,variants`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' } }
    );
    const searchData = await searchRes.json();
    const produtos = searchData.products || [];
    const found = produtos.find(p => p.title.toLowerCase().trim() === nomeAtual.toLowerCase().trim()) || produtos[0];
    if (!found) throw new Error('Produto não encontrado no Shopify: ' + nomeAtual);

    // 1. Atualiza status (active/draft)
    if (novoStatus !== undefined) {
      const res = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/products/${found.id}.json`,
        { method: 'PUT', headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({ product: { id: found.id, status: novoStatus } }) }
      );
      if (!res.ok) throw new Error('Erro ao atualizar status: ' + await res.text());
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, shopifyId: found.id }) };
    }

    // 2. Atualiza inventory_management da variante (disponível/indisponível)
    if (novoInventoryManagement !== undefined) {
      const varId = found.variants?.[0]?.id;
      if (!varId) throw new Error('Variante não encontrada');
      const res = await fetch(
        `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/variants/${varId}.json`,
        { method: 'PUT', headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({ variant: { id: varId, inventory_management: novoInventoryManagement || null } }) }
      );
      if (!res.ok) throw new Error('Erro ao atualizar disponibilidade: ' + await res.text());
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, shopifyId: found.id }) };
    }

    // 3. Atualiza nome, fabricante e preço
    const updatePayload = { product: { id: found.id } };
    if (novoNome && novoNome !== nomeAtual) updatePayload.product.title = novoNome;
    if (novoFabricante !== undefined)        updatePayload.product.vendor = novoFabricante;

    const updateRes = await fetch(
      `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/products/${found.id}.json`,
      { method: 'PUT', headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload) }
    );
    if (!updateRes.ok) throw new Error('Erro ao atualizar produto: ' + await updateRes.text());

    // Atualiza preço na variante se necessário
    if (novoPreco !== undefined && novoPreco !== null) {
      const varId = found.variants?.[0]?.id;
      if (varId) {
        await fetch(
          `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/variants/${varId}.json`,
          { method: 'PUT', headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ variant: { id: varId, price: String(novoPreco) } }) }
        );
      }
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, shopifyId: found.id }) };

  } catch(e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ erro: e.message }) };
  }
};
