// netlify/functions/cache-colecoes.js
// Scheduled Function — roda a cada 10 minutos
// Busca todas as coleções do Shopify e salva no Firebase Realtime Database

const SHOPIFY_STORE = 'vitaflow-7352';
const STOREFRONT_TOKEN = 'b4b46a09460b7277f5d4625b9019daef'; // Storefront API token (público)
const FIREBASE_URL = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const COLECOES = ['10-mais-vendidos', 'peptideos', 'hormonios', 'gh', 'promocoes', 'outros'];

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
        'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN
      },
      body: JSON.stringify({ query })
    });

    const data = await res.json();
    if (data.errors) {
      console.error(`Erro GraphQL em ${handle}:`, JSON.stringify(data.errors));
      break;
    }
    const colecao = data?.data?.collectionByHandle;
    if (!colecao) {
      console.log(`Coleção não encontrada: ${handle}`);
      break;
    }

    const edges = colecao.products?.edges || [];
    todosProdutos = todosProdutos.concat(edges);
    console.log(`  ${handle}: página com ${edges.length} produtos`);

    temMais = colecao.products?.pageInfo?.hasNextPage || false;
    cursor = colecao.products?.pageInfo?.endCursor || null;
  }

  return todosProdutos;
}

function formatarProdutos(produtos) {
  return produtos
    .filter(({ node: p }) => p.availableForSale)
    .map(({ node: p }) => {
      const variants = p.variants?.edges || [];
      const disponiveis = variants.filter(({ node: v }) => v.availableForSale);
      if (disponiveis.length === 0) return null;
      if (disponiveis.length === 1) {
        const preco = parseFloat(disponiveis[0]?.node?.price?.amount || '0');
        return `${p.title}|${preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      } else {
        const variantesTexto = disponiveis.map(({ node: v }) => {
          const preco = parseFloat(v.price?.amount || 0);
          return `${v.title}:R$${preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }).join(';');
        return `${p.title}|${variantesTexto}`;
      }
    })
    .filter(Boolean)
    .join('\n');
}

async function salvarFirebase(handle, dados) {
  // Salva sem autenticação (regras do Firebase permitem escrita)
  const url = `${FIREBASE_URL}/vitaflow_cache/colecoes/${handle}.json`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dados,
      atualizado_em: new Date().toISOString(),
      total: dados.split('\n').filter(Boolean).length
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firebase erro: ${err}`);
  }
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
