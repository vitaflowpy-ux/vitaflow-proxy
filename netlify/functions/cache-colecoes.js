// netlify/functions/cache-colecoes.js
// Scheduled Function — roda a cada 10 minutos
// Usa Admin API REST para filtrar disponibilidade corretamente:
// - inventory_management: null → sem rastreamento → sempre disponível
// - inventory_management: 'shopify' + inventory_quantity > 0 → disponível
// - inventory_management: 'shopify' + inventory_quantity <= 0 → indisponível

const SHOPIFY_STORE = 'vitaflow-7352';
const ADMIN_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const STOREFRONT_TOKEN = 'b4b46a09460b7277f5d4625b9019daef'; // mantido para fotos via Storefront
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

const ADMIN_BASE = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01`;
const ADMIN_HEADERS = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': ADMIN_TOKEN
};

// Busca o ID da coleção pelo handle
async function buscarIdColecao(handle) {
  // Tenta custom collections
  let res = await fetch(`${ADMIN_BASE}/custom_collections.json?handle=${handle}&fields=id`, { headers: ADMIN_HEADERS });
  let data = await res.json();
  if (data.custom_collections && data.custom_collections.length > 0) {
    return { id: data.custom_collections[0].id, tipo: 'custom' };
  }
  // Tenta smart collections
  res = await fetch(`${ADMIN_BASE}/smart_collections.json?handle=${handle}&fields=id`, { headers: ADMIN_HEADERS });
  data = await res.json();
  if (data.smart_collections && data.smart_collections.length > 0) {
    return { id: data.smart_collections[0].id, tipo: 'smart' };
  }
  return null;
}

// Busca produtos da coleção via Admin API com paginação
async function buscarProdutosAdmin(colecaoId) {
  let todosProdutos = [];
  let url = `${ADMIN_BASE}/products.json?collection_id=${colecaoId}&limit=250&fields=id,title,status,images,variants`;

  while (url) {
    const res = await fetch(url, { headers: ADMIN_HEADERS });
    const data = await res.json();
    if (data.products) {
      todosProdutos = todosProdutos.concat(data.products);
    }
    // Paginação via Link header
    const linkHeader = res.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return todosProdutos;
}

// Variante disponível:
// - inventory_management null/'' → sem rastreamento → disponível
// - inventory_management 'shopify' + inventory_quantity > 0 → disponível
// - inventory_management 'shopify' + inventory_quantity <= 0 → indisponível
function varianteDisponivel(v) {
  if (!v.inventory_management || v.inventory_management === '') return true;
  return (v.inventory_quantity || 0) > 0;
}

// Produto disponível: status ativo E pelo menos uma variante disponível
function produtoDisponivel(p) {
  if (p.status !== 'active') return false;
  return (p.variants || []).some(varianteDisponivel);
}

// Formato texto "nome|preço" — INTACTO (Athena e Radar dependem disso)
function formatarProdutos(produtos) {
  return produtos
    .filter(produtoDisponivel)
    .map(p => {
      const disponiveis = (p.variants || []).filter(varianteDisponivel);
      if (disponiveis.length === 0) return null;
      if (disponiveis.length === 1) {
        const preco = parseFloat(disponiveis[0].price || '0');
        return `${p.title}|${preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      } else {
        const variantesTexto = disponiveis.map(v => {
          const preco = parseFloat(v.price || 0);
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
    .filter(produtoDisponivel)
    .map(p => {
      const disponiveis = (p.variants || []).filter(varianteDisponivel);
      if (disponiveis.length === 0) return null;
      const precos = disponiveis.map(v => parseFloat(v.price || 0)).filter(x => x > 0);
      const preco = precos.length ? Math.min(...precos) : 0;
      let compareAt = 0;
      disponiveis.forEach(v => {
        const pv = parseFloat(v.price || 0);
        if (pv === preco) {
          const c = parseFloat(v.compare_at_price || 0);
          if (c > preco) compareAt = c;
        }
      });
      const foto = (p.images && p.images[0]) ? p.images[0].src : '';
      return { nome: p.title, preco, compare_at: compareAt, foto };
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
  console.log('Iniciando cache de coleções (Admin API)...', new Date().toISOString());
  const resultados = [];

  for (const handle of COLECOES) {
    try {
      console.log(`Buscando coleção: ${handle}`);

      const colecao = await buscarIdColecao(handle);
      if (!colecao) {
        console.log(`Coleção não encontrada: ${handle}`);
        resultados.push({ handle, ok: false, erro: 'Coleção não encontrada' });
        continue;
      }

      const produtos = await buscarProdutosAdmin(colecao.id);
      console.log(`  ${handle}: ${produtos.length} produtos brutos`);

      const dados = formatarProdutos(produtos);
      const produtosComFoto = formatarProdutosComFoto(produtos);
      const total = dados.split('\n').filter(Boolean).length;

      await salvarFirebase(handle, dados, produtosComFoto);
      console.log(`✅ ${handle}: ${total} produtos disponíveis salvos`);
      resultados.push({ handle, total, ok: true });

    } catch (err) {
      console.error(`❌ Erro em ${handle}:`, err.message);
      resultados.push({ handle, ok: false, erro: err.message });
    }
  }

  console.log('Cache concluído:', JSON.stringify(resultados));
  return { statusCode: 200, body: JSON.stringify({ ok: true, resultados }) };
};
