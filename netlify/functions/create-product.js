// netlify/functions/create-product.js
// GET  -> lista coleções da loja (manuais E automáticas), para o seletor do Sync
// POST -> cria produtos como rascunho com fabricante (vendor) e coleções:
//         - coleção manual  -> entra via Collect API
//         - coleção automática (smart por TAG) -> entra recebendo a tag da regra
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

// Lista manuais (custom) + automáticas (smart), normalizando o formato
async function listarColecoes() {
  const out = [];

  const rc = await shopify('custom_collections.json?limit=250', 'GET');
  const dc = await rc.json();
  if (!rc.ok) throw new Error('custom_collections: ' + JSON.stringify(dc.errors || dc));
  (dc.custom_collections || []).forEach(c => {
    out.push({ id: c.id, title: c.title, handle: c.handle, type: 'custom' });
  });

  const rs = await shopify('smart_collections.json?limit=250', 'GET');
  const ds = await rs.json();
  if (!rs.ok) throw new Error('smart_collections: ' + JSON.stringify(ds.errors || ds));
  (ds.smart_collections || []).forEach(c => {
    out.push({
      id: c.id, title: c.title, handle: c.handle, type: 'smart',
      disjunctive: !!c.disjunctive,
      rules: c.rules || []
    });
  });

  // ordena alfabeticamente para o seletor
  out.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pt-BR'));
  return out;
}

// Das regras de uma smart collection, devolve as TAGS que fazem o produto entrar nela.
// Cobre o caso comum "tag equals X". Se não houver regra por tag, devolve [] (e sinalizamos).
function tagsDaSmart(col) {
  const tags = [];
  (col.rules || []).forEach(r => {
    if (r.column === 'tag' && (r.relation === 'equals' || r.relation === 'contains')) {
      if (r.condition) tags.push(String(r.condition));
    }
  });
  return tags;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  // GET: lista de coleções para o seletor
  if (event.httpMethod === 'GET') {
    try {
      const colecoes = await listarColecoes();
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, colecoes }) };
    } catch (e) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, erro: e.message, colecoes: [] }) };
    }
  }

  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  try {
    const produtos = JSON.parse(event.body || '[]');
    if (!Array.isArray(produtos) || !produtos.length) throw new Error('Lista de produtos vazia');

    // Mapa id -> coleção (tipo + regras), buscado uma vez por lote
    let mapaCol = {};
    try {
      const todas = await listarColecoes();
      todas.forEach(c => { mapaCol[String(c.id)] = c; });
    } catch (e) { /* segue sem coleções se a busca falhar */ }

    const resultados = [];
    for (const p of produtos) {
      try {
        const selecionadas = (Array.isArray(p.colecoes) ? p.colecoes : []).map(String);

        // Separa: manuais (Collect) x automáticas (tags)
        const idsCustom = [];
        const tagsSmart = [];
        const smartSemTag = [];
        selecionadas.forEach(id => {
          const col = mapaCol[id];
          if (!col) { idsCustom.push(id); return; } // sem mapa: tenta Collect
          if (col.type === 'custom') { idsCustom.push(id); return; }
          const t = tagsDaSmart(col);
          if (t.length) { t.forEach(x => tagsSmart.push(x)); }
          else smartSemTag.push(col.title || id);
        });

        // Tags finais (sem duplicar)
        const tagsFinais = Array.from(new Set(tagsSmart)).join(', ');

        const payload = {
          product: {
            title: p.nome,
            status: 'draft',
            product_type: p.categoria || 'Outros',
            vendor: p.fabricante || p.marca || p.fonte || '',
            tags: tagsFinais,
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
        await sleep(550);

        // Coleções automáticas por tag já entram sozinhas (contam como ok)
        resultado.colecoes_ok += Array.from(new Set(tagsSmart)).length;
        smartSemTag.forEach(t => resultado.colecoes_falha.push('auto sem tag: ' + t));

        // Coleções manuais -> Collect
        for (const colId of idsCustom) {
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
