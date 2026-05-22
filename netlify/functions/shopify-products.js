// netlify/functions/shopify-products.js
const SHOPIFY_DOMAIN = 'vitaflow-7352.myshopify.com';
const SHOPIFY_TOKEN  = process.env.SHOPIFY_TOKEN;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function shopifyGet(path) {
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2025-01${path}`, {
    headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status} — ${path}`);
  return res.json();
}

// Mapeia título da coleção → categoria
function mapCategory(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('peptid')) return 'Peptídeos';
  if (t.includes('hormô') || t.includes('hormoni')) return 'Hormônios';
  if (t === 'gh') return 'GH';
  if (t.includes('outro')) return 'Outros';
  if (t.includes('mais vendid')) return 'Mais Vendidos';
  if (t.includes('promo')) return 'Promoções';
  return 'Outros';
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    // 1. Busca todas as coleções
    const colData = await shopifyGet('/custom_collections.json?limit=250&fields=id,title');
    const smartData = await shopifyGet('/smart_collections.json?limit=250&fields=id,title');
    const allCols = [...(colData.custom_collections||[]), ...(smartData.smart_collections||[])];

    // Filtra só as relevantes (ignora Mais Vendidos e Promoções para categorização)
    const catCols = allCols.filter(c => {
      const t = c.title.toLowerCase();
      return t.includes('peptid') || t.includes('hormô') || t.includes('hormoni') || t === 'gh' || t.includes('outro');
    });

    // 2. Para cada produto, descobre sua categoria buscando por coleção
    // Mais eficiente: busca todos os produtos e depois busca collects para cruzar
    let allProducts = {};
    let url = `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/products.json?limit=250&fields=id,title,variants`;
    while (url) {
      const res = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
      });
      if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`);
      const data = await res.json();
      (data.products || []).forEach(p => {
        const price = (p.variants||[]).reduce((min, v) => {
          const pr = parseFloat(v.price)||0;
          return pr > 0 && pr < min ? pr : min;
        }, Infinity);
        allProducts[String(p.id)] = {
          id: String(p.id),
          name: p.title,
          price: price === Infinity ? 0 : price,
          category: 'Outros',
        };
      });
      const link = res.headers.get('Link') || '';
      const next = link.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
    }

    // 3. Busca collects (relação produto↔coleção) para cada coleção relevante
    for (const col of catCols) {
      const cat = mapCategory(col.title);
      let cUrl = `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/collects.json?collection_id=${col.id}&limit=250&fields=product_id`;
      while (cUrl) {
        const res = await fetch(cUrl, {
          headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
        });
        if (!res.ok) break;
        const data = await res.json();
        (data.collects || []).forEach(c => {
          const pid = String(c.product_id);
          if (allProducts[pid]) allProducts[pid].category = cat;
        });
        const link = res.headers.get('Link') || '';
        const next = link.match(/<([^>]+)>;\s*rel="next"/);
        cUrl = next ? next[1] : null;
      }
    }

    const result = Object.values(allProducts).sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ products: result, total: result.length }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
