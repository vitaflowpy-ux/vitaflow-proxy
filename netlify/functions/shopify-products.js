// netlify/functions/shopify-products.js
// Busca produtos da Shopify via Admin API e devolve para a ferramenta de orçamento

const SHOPIFY_DOMAIN = 'vitaflow-7352.myshopify.com';
const SHOPIFY_TOKEN  = process.env.SHOPIFY_TOKEN;

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    let allProducts = [];
    let url = `https://${SHOPIFY_DOMAIN}/admin/api/2025-01/products.json?limit=250&fields=id,title,variants,product_type`;

    // Pagina até buscar todos os produtos
    while (url) {
      const res = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          'Content-Type': 'application/json',
        }
      });

      if (!res.ok) {
        throw new Error(`Shopify HTTP ${res.status}`);
      }

      const data = await res.json();
      const products = data.products || [];

      products.forEach(p => {
        // Pega o menor preço entre as variantes disponíveis
        const variants = p.variants || [];
        const price = variants.length > 0
          ? Math.min(...variants.map(v => parseFloat(v.price) || 0))
          : 0;

        // Mapeia categoria pelo product_type
        let category = 'Outros';
        const pt = (p.product_type || '').toLowerCase();
        if (pt.includes('peptí') || pt.includes('pepti') || pt === 'peptideo' || pt === 'peptídeo') category = 'Peptídeos';
        else if (pt.includes('hormô') || pt.includes('hormo')) category = 'Hormônios';
        else if (pt.includes('gh') || pt.includes('growth')) category = 'GH';

        allProducts.push({
          id: String(p.id),
          name: p.title,
          price: price,
          category: category,
        });
      });

      // Checa se tem próxima página via Link header
      const linkHeader = res.headers.get('Link') || '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      url = nextMatch ? nextMatch[1] : null;
    }

    // Ordena por nome
    allProducts.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ products: allProducts, total: allProducts.length }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
