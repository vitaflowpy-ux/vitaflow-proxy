// netlify/functions/cache-colecoes.js
// Scheduled Function — roda a cada 10 minutos
// Busca todas as coleções do Shopify e salva no Firebase Realtime Database

const SHOPIFY_STORE = 'vitaflow-7352';
const FIREBASE_URL = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const COLECOES = ['mais-vendidos', 'peptideos', 'hormonios', 'gh', 'promocoes', 'outros'];

// Busca uma coleção completa do Shopify (paginada até 250 produtos)
async function buscarColecaoShopify(handle) {
  let todosProdutos = [];
  let cursor = null;
  let temMais = true;

  while (temMais) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const query = `{
      collectionByHandle(handle: "${handle}") {
        products(first: 250${afterClause}) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              title
              availableForSale
              variants(first: 3) {
                edges {
                  node {
                    title
                    price { amount }
                    availableForSale
                  }
                }
              }
            }
          }
        }
      }
    }`;

    const res = await fetch(`https://${SHOPIFY_STORE}.myshopify.com/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({ query })
    });

    const data = await res.json();
    const colecao = data?.data?.collectionByHandle;
    if (!colecao) break;

    const edges = colecao.products?.edges || [];
    todosProdutos = todosProdutos.concat(edges);

    temMais = colecao.products?.pageInfo?.hasNextPage || false;
    cursor = colecao.products?.pageInfo?.endCursor || null;
  }

  return todosProdutos;
}

// Formata produtos para string compacta: "Nome|Preço\n"
function formatarProdutos(produtos) {
  return produtos
    .filter(({ node: p }) => p.availableForSale)
    .map(({ node: p }) => {
      const variants = p.variants?.edges || [];
      const disponíveis = variants.filter(({ node: v }) => v.availableForSale);
      if (disponíveis.length === 0) return null;
      if (disponíveis.length === 1) {
        const preco = parseFloat(disponíveis[0]?.node?.price?.amount || '0');
        return `${p.title}|${preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      } else {
        const variantesTexto = disponíveis.map(({ node: v }) => {
          const preco = parseFloat(v.price?.amount || 0);
          return `${v.title}:R$${preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }).join(';');
        return `${p.title}|${variantesTexto}`;
      }
    })
    .filter(Boolean)
    .join('\n');
}

// Salva no Firebase
async function salvarFirebase(handle, dados) {
  const url = `${FIREBASE_URL}/vitaflow_cache/colecoes/${handle}.json?auth=${process.env.FIREBASE_SECRET}`;
  await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dados,
      atualizado_em: new Date().toISOString(),
      total: dados.split('\n').filter(Boolean).length
    })
  });
}

exports.handler = async () => {
  console.log('Iniciando cache de coleções...', new Date().toISOString());
  const resultados = [];

  for (const handle of COLECOES) {
    try {
      console.log(`Buscando coleção: ${handle}`);
      const produtos = await buscarColecaoShopify(handle);
      const dados = formatarProdutos(produtos);
      const total = dados.split('\n').filter(Boolean).length;
      await salvarFirebase(handle, dados);
      console.log(`✅ ${handle}: ${total} produtos salvos`);
      resultados.push({ handle, total, ok: true });
    } catch (err) {
      console.error(`❌ Erro em ${handle}:`, err.message);
      resultados.push({ handle, ok: false, erro: err.message });
    }
  }

  console.log('Cache concluído:', JSON.stringify(resultados));
  return { statusCode: 200, body: JSON.stringify({ ok: true, resultados }) };
};
