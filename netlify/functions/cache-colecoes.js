// netlify/functions/cache-colecoes.js
// Scheduled Function — roda a cada 10 minutos
// Busca todas as coleções do Shopify e salva no Firebase Realtime Database
// Mantém o campo "dados" (nome|preço) intacto para Athena/Radar
// e adiciona "produtos" (com foto) numa estrutura paralela para a tabela pública

const SHOPIFY_STORE = 'vitaflow-7352';
const STOREFRONT_TOKEN = 'b4b46a09460b7277f5d4625b9019daef';
const FIREBASE_URL = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const COLECOES = [
  '10-mais-vendidos',
  'emagrecedores',
  'peptideos',
  'hormonios',
  'gh',
  'promocoes',
  'outros',
  'emagrecimento',
  'ganho-de-massa',
  'saude-qualidade-de-vida',
  'energia',
  'recuperacao'
];

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
              featuredImage { url }
              variants(first: 3) {
                edges {
                  node {
                    title
                    price { amount }
                    compareAtPrice { amount }
                    availableForSale
                    quantityAvailable
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

// Variante está disponível se:
// - quantityAvailable é null → sem rastreamento de estoque → sempre disponível
// - quantityAvailable > 0 → com rastreamento e tem estoque → disponível
// - quantityAvailable === 0 → com rastreamento sem estoque → indisponível
function varianteDisponivel({ node: v }) {
  if (!v.availableForSale) return false;
  if (v.quantityAvailable === null || v.quantityAvailable === undefined) return true;
  return v.quantityAvailable > 0;
}

// Formato texto "nome|preço" — INTACTO (Athena e Radar dependem disso)
function formatarProdutos(produtos) {
  return produtos
    .filter(({ node: p }) => p.availableForSale)
    .map(({ node: p }) => {
      const variants = p.variants?.edges || [];
      const disponiveis = variants.filter(varianteDisponivel);
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

// Formato estruturado COM FOTO — para a tabela pública
function formatarProdutosComFoto(produtos) {
  return produtos
    .filter(({ node: p }) => p.availableForSale)
    .map(({ node: p }) => {
      const variants = p.variants?.edges || [];
      const disponiveis = variants.filter(varianteDisponivel);
      if (disponiveis.length === 0) return null;
      const precos = disponiveis.map(({ node: v }) => parseFloat(v.price?.amount || 0)).filter(x => x > 0);
      const preco = precos.length ? Math.min(...precos) : 0;
      let compareAt = 0;
      disponiveis.forEach(({ node: v }) => {
        const pv = parseFloat(v.price?.amount || 0);
        if (pv === preco) {
          const c = parseFloat(v.compareAtPrice?.amount || 0);
          if (c > preco) compareAt = c;
        }
      });
      return {
        nome: p.title,
        preco,
        compare_at: compareAt,
        foto: p.featuredImage?.url || ''
      };
    })
    .filter(Boolean);
}

async function salvarFirebase(handle, dados, produtos) {
  const url = `${FIREBASE_URL}/vitaflow_cache/colecoes/${handle}.json`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dados,
      produtos,
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
      const produtosComFoto = formatarProdutosComFoto(produtos);
      const total = dados.split('\n').filter(Boolean).length;
      await salvarFirebase(handle, dados, produtosComFoto);
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
