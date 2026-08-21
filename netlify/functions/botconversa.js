// netlify/functions/cache-colecoes-manual.js
// Versão MANUAL do cache de coleções — roda NA HORA quando você abre a URL.
// É idêntica à cache-colecoes.js (mesma loja, mesmas coleções, mesma gravação),
// só que é uma função COMUM (não agendada), então PODE ser chamada pelo navegador.
// Uso: abra  https://vitaflow-proxy.netlify.app/.netlify/functions/cache-colecoes-manual?key=rodaragora
// (o "key" é só um trava simples pra não rodar por acidente — NÃO é segredo; pode trocar a vontade.)

const CHAVE_GATILHO = 'rodaragora';

const SHOPIFY_STORE = 'vitaflow-7352';
const ADMIN_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const FIREBASE_URL = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const FIREBASE_SECRET = process.env.FIREBASE_SECRET || '';
const FB_AUTH = FIREBASE_SECRET ? ('?auth=' + encodeURIComponent(FIREBASE_SECRET)) : '';

const COLECOES = [
  '10-mais-vendidos',
  'emagrecedores',
  'peptideos',
  'hormonios',
  'gh',
  'estetica',
  'farmacia',
  'sarms',
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

async function buscarIdColecao(handle) {
  let res = await fetch(`${ADMIN_BASE}/custom_collections.json?handle=${handle}&fields=id`, { headers: ADMIN_HEADERS });
  let data = await res.json();
  if (data.custom_collections && data.custom_collections.length > 0) {
    return { id: data.custom_collections[0].id, tipo: 'custom' };
  }
  res = await fetch(`${ADMIN_BASE}/smart_collections.json?handle=${handle}&fields=id`, { headers: ADMIN_HEADERS });
  data = await res.json();
  if (data.smart_collections && data.smart_collections.length > 0) {
    return { id: data.smart_collections[0].id, tipo: 'smart' };
  }
  return null;
}

async function buscarProdutosAdmin(colecaoId) {
  let todosProdutos = [];
  let url = `${ADMIN_BASE}/products.json?collection_id=${colecaoId}&limit=250&fields=id,title,status,images,variants`;
  while (url) {
    const res = await fetch(url, { headers: ADMIN_HEADERS });
    const data = await res.json();
    if (data.products) todosProdutos = todosProdutos.concat(data.products);
    const linkHeader = res.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }
  return todosProdutos;
}

function varianteDisponivel(v) {
  if (!v.inventory_management || v.inventory_management === '') return true;
  return (v.inventory_quantity || 0) > 0;
}
function produtoDisponivel(p) {
  if (p.status !== 'active') return false;
  return (p.variants || []).some(varianteDisponivel);
}

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
  const url = `${FIREBASE_URL}/vitaflow_cache/colecoes/${handle}.json${FB_AUTH}`;
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

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const key = (event.queryStringParameters && event.queryStringParameters.key) || '';
  if (key !== CHAVE_GATILHO) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, erro: 'Faltou ?key= correto. Use ?key=' + CHAVE_GATILHO }) };
  }

  const resultados = [];
  for (const handle of COLECOES) {
    try {
      const colecao = await buscarIdColecao(handle);
      if (!colecao) {
        resultados.push({ handle, ok: false, erro: 'Coleção não encontrada' });
        continue;
      }
      const produtos = await buscarProdutosAdmin(colecao.id);
      const dados = formatarProdutos(produtos);
      const produtosComFoto = formatarProdutosComFoto(produtos);
      const total = dados.split('\n').filter(Boolean).length;
      await salvarFirebase(handle, dados, produtosComFoto);
      resultados.push({ handle, total, ok: true });
    } catch (err) {
      resultados.push({ handle, ok: false, erro: err.message });
    }
  }
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, loja: SHOPIFY_STORE, resultados }, null, 2) };
};
