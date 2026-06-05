// netlify/functions/create-product.js
// GET  -> lista as coleções PERSONALIZADAS (manuais) da loja, para o seletor do Sync
// POST -> cria produtos como rascunho no Shopify, com fabricante (vendor) e coleções
const SHOPIFY_DOMAIN = 'nv18ua-1w.myshopify.com';
const SHOPIFY_TOKEN  = process.env.SHOPIFY_TOKEN;
const API = '2025-01';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function shopify(path, method, body) {
  return fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API}/${path}`, {
    method: method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Lista coleções personalizadas (manuais). Só nelas dá para adicionar produto via seleção.
async function listarColecoes() {
  const res = await shopify('custom_collections.json?limit=250', 'GET');
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data.errors || data));
  return (data.custom_collections || []).map(c => ({ id: c.id, title: c.title, handle: c.handle }));
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  // ── GET: devolve a lista de coleções para o seletor ──────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const colecoes = await listarColecoes();
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, colecoes }) };
    } catch (e) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ ok: false, erro: e.message, colecoes: [] }) };
    }
  }

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
            vendor: p.fabricante || p.marca || p.fonte || '', // fabricante explícito tem prioridade
            body_html: '',
            variants: [{
              price: String(p.preco || 0),
              inventory_management: null,
            }],
          }
        };
        const res = await shopify('products.json', 'POST', payload);
        const data = await res.json();

        if (!res.ok) {
          resultados.push({ nome: p.nome, ok: false, ref: p.ref || null, erro: JSON.stringify(data.errors || data) });
          await sleep(550);
          continue;
        }

        const produtoId = data.product.id;
        const variantId = (data.product.variants && data.product.variants[0]) ? data.product.variants[0].id : null;
        const resultado = { nome: p.nome, ok: true, id: produtoId, variantId: variantId, ref: p.ref || null, colecoes_ok: 0, colecoes_falha: [] };
        await sleep(550); // rate limit Shopify

        // ── Adiciona às coleções (apenas IDs de coleções personalizadas) ─────────
        const colecoes = Array.isArray(p.colecoes) ? p.colecoes : [];
        for (const colId of colecoes) {
          if (!colId) continue;
          try {
            const cRes = await shopify('collects.json', 'POST', {
              collect: { product_id: produtoId, collection_id: Number(colId) }
            });
            if (cRes.ok) {
              resultado.colecoes_ok++;
            } else {
              const cData = await cRes.json();
              resultado.colecoes_falha.push(String(colId) + ': ' + JSON.stringify(cData.errors || cData));
            }
          } catch (ce) {
            resultado.colecoes_falha.push(String(colId) + ': ' + ce.message);
          }
          await sleep(550);
        }

        resultados.push(resultado);
      } catch(err) {
        resultados.push({ nome: p.nome, ok: false, ref: p.ref || null, erro: err.message });
        await sleep(550);
      }
    }

    const ok  = resultados.filter(r => r.ok).length;
    const err = resultados.filter(r => !r.ok).length;
    const colErros = resultados.reduce((a, r) => a + ((r.colecoes_falha && r.colecoes_falha.length) || 0), 0);
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ ok, err, colErros, resultados }),
    };
  } catch(e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ erro: e.message }) };
  }
};
