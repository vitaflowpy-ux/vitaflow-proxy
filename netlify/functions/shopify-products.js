// netlify/functions/shopify-products.js
const SHOPIFY_DOMAIN = 'vitaflow-7352.myshopify.com';
const SHOPIFY_TOKEN  = process.env.SHOPIFY_TOKEN;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function shopifyGet(url) {
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`);
  return { data: await res.json(), link: res.headers.get('Link')||'' };
}

function mapCategory(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('peptid')) return 'Peptídeos';
  if (t.includes('horm')) return 'Hormônios';
  if (t === 'gh') return 'GH';
  if (t.includes('mais vendid')) return 'Mais Vendidos';
  if (t.includes('promo')) return 'Promoções';
  if (t.includes('outro')) return 'Outros';
  return 'Outros';
}

async function getAllPages(firstUrl) {
  let results = [];
  let url = firstUrl;
  while (url) {
    const { data, link } = await shopifyGet(url);
    const key = Object.keys(data)[0];
    results = results.concat(data[key] || []);
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return results;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const base = `https://${SHOPIFY_DOMAIN}/admin/api/2025-01`;

    const [customCols, smartCols] = await Promise.all([
      getAllPages(`${base}/custom_collections.json?limit=250&fields=id,title`),
      getAllPages(`${base}/smart_collections.json?limit=250&fields=id,title`),
    ]);
    const allCols = [...customCols, ...smartCols];

    const catCols = allCols.filter(c => {
      const t = c.title.toLowerCase();
      return t.includes('peptid') || t.includes('horm') || t === 'gh' ||
             t.includes('outro') || t.includes('mais vendid') || t.includes('promo');
    });

    const products = await getAllPages(`${base}/products.json?limit=250&fields=id,title,variants,status`);

    const allProducts = {};
    products.forEach(p => {
      const variants = p.variants || [];
      const prices = variants.map(v => parseFloat(v.price)||0).filter(v => v > 0);
      // Produto disponível se: status=active E pelo menos uma variante com estoque > 0
      // ou sem controle de estoque (inventory_management nulo)
      const available = p.status === 'active' && variants.some(v =>
        !v.inventory_management ||
        v.inventory_policy === 'continue' ||
        (v.inventory_quantity !== undefined ? v.inventory_quantity > 0 : true)
      );
      allProducts[String(p.id)] = {
        id: String(p.id),
        name: p.title,
        price: prices.length ? Math.min(...prices) : 0,
        category: 'Outros',
        categories: [],
        available,
      };
    });

    await Promise.all(catCols.map(async col => {
      const cat = mapCategory(col.title);
      try {
        const prods = await getAllPages(`${base}/products.json?collection_id=${col.id}&limit=250&fields=id`);
        prods.forEach(p => {
          const pid = String(p.id);
          if (allProducts[pid]) {
            allProducts[pid].categories.push(cat);
            const priority = ['Peptídeos','Hormônios','GH','Outros','Mais Vendidos','Promoções'];
            const current = allProducts[pid].category;
            const currentIdx = priority.indexOf(current);
            const newIdx = priority.indexOf(cat);
            if (newIdx < currentIdx) allProducts[pid].category = cat;
          }
        });
      } catch(e) {}
    }));

    const result = Object.values(allProducts)
      .map(p => ({ id: p.id, name: p.name, price: p.price, category: p.category, categories: p.categories, available: p.available }))
      .sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));

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
