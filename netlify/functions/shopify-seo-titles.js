// shopify-seo-titles.js — Gera e aplica TÍTULOS SEO (page title) em massa no Shopify.
//
// O QUE ELE FAZ:
//   - Lê TODOS os produtos do Shopify (título + título SEO atual).
//   - Monta o título SEO na fórmula validada pelo Search Console:
//         "<Nome do produto> — Comprar <Categoria> <benefício> | VitaFlow"
//     (a mesma dos produtos que subiram: Retatrutida ZPHC +143%, CBL-514 +217%)
//   - NÃO mexe no título que o cliente vê na loja (só no title tag do Google).
//   - NÃO sobrescreve título SEO que você já escreveu à mão (a menos que force=1).
//
// COMO USAR (2 passos — nunca aplica sem você ver antes):
//   1) PRÉVIA (não altera nada):
//        /.netlify/functions/shopify-seo-titles?secret=SUA_SENHA
//   2) APLICAR de verdade:
//        /.netlify/functions/shopify-seo-titles?secret=SUA_SENHA&apply=1
//
//   Parâmetros extras:
//     &force=1   -> sobrescreve também os títulos SEO já preenchidos (cuidado)
//     &limit=20  -> processa só os N primeiros (bom pra testar antes de soltar em tudo)
//
// ENV VARS (Netlify): SHOPIFY_TOKEN (ou SHOPIFY_ACCESS_TOKEN) e SEO_SECRET.

const SHOPIFY_STORE = 'nv18ua-1w';
const API_VERSION = '2025-01';
const TOKEN = process.env.SHOPIFY_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN || '';
const SECRET = process.env.SEO_SECRET || '';

const GQL_URL = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${API_VERSION}/graphql.json`;

const LIMITE_TITULO = 60; // Google corta ~60 caracteres

// ── Classificação: descobre a CATEGORIA do produto pelo nome ──────────────
// A ordem importa: o primeiro que casar vence (específico antes do genérico).
const CATEGORIAS = [
  // [rótulo, termo de busca que a pessoa digita, palavras-chave do produto]
  ['emagrecedor', 'Emagrecedor', [
    'retatrutida', 'tirzepatida', 'semaglutida', 'liraglutida', 'cagrilintida',
    'mazdutida', 'survodutida', 'aod', 'aod-9604', 'tesofensina', 'slu-pp',
    'cbl-514', '5-amino', '5 amino', 'amino-1mq', 'mots-c', 'mots c'
  ]],
  ['hormônio', 'Hormônio', [
    'testosterona', 'enantato', 'cipionato', 'propionato', 'durateston', 'sustanon',
    'deca', 'nandrolona', 'boldenona', 'trembolona', 'stanozolol', 'oxandrolona',
    'dianabol', 'metandrostenolona', 'masteron', 'drostanolona', 'primobolan',
    'metenolona', 'halotestin', 'anadrol', 'oximetolona', 'winstrol', 'hemogenin',
    'estradiol', 'progesterona', 'gonadotrofina', 'hcg', 'clomifeno', 'tamoxifeno',
    'anastrozol', 'letrozol', 'proviron', 'mesterolona', 'cabergolina'
  ]],
  ['GH', 'GH', [
    'hgh', 'somatropina', 'gh ', 'ztrop', 'zptrop', 'hygetropin', 'jintropin',
    'genotropin', 'norditropin', 'saizen', 'omnitrope', 'ansomone', 'ipamorelina',
    'ipamorelin', 'cjc', 'cjc-1295', 'tesamorelina', 'tesamorelin', 'sermorelina',
    'hexarelina', 'ghrp', 'mk-677', 'ibutamoren'
  ]],
  ['peptídeo', 'Peptídeo', [
    'bpc', 'bpc-157', 'tb-500', 'tb 500', 'ghk', 'ghk-cu', 'ipamorelin', 'pt-141',
    'melanotan', 'kisspeptina', 'kisspeptin', 'epitalon', 'epitalona', 'selank',
    'semax', 'dsip', 'ss-31', 'thymosin', 'timosina', 'peptide', 'peptídeo',
    'glutationa', 'nad', 'nad+', 'larazotida', 'll-37', 'kpv', 'vip', 'pnc-27',
    'adipotide', 'follistatina', 'igf', 'igf-1', 'hexarelin', 'gonadorelina'
  ]],
  ['SARM', 'SARM', [
    'ostarine', 'ostarina', 'ligandrol', 'lgd', 'rad-140', 'rad 140', 'testolone',
    'andarine', 's4', 'yk-11', 'sr9009', 'cardarine', 'gw-501516', 'sarm'
  ]]
];

// Benefício por categoria (o que a pessoa realmente quer)
// Beneficio complementar: SO quando a categoria nao deixa claro o objetivo.
// "Comprar Emagrecedor" ja diz tudo -> nao repete "para Emagrecimento" (fica redundante).
const BENEFICIO = {
  'Emagrecedor': '',
  'Hormônio': '',
  'GH': '',
  'Peptídeo': '',
  'SARM': ''
};

// Peptideos que sao usados para EMAGRECER ganham o complemento (foi a formula que
// mais subiu no Search Console: "Comprar Peptideo para Emagrecimento").
// Aqui o produto e peptideo E emagrecedor ao mesmo tempo -> vale explicitar.
const PEPTIDEOS_EMAGRECEDORES = ['cbl-514', 'aod', 'aod-9604', 'mots-c', 'mots c', '5-amino', '5 amino', 'amino-1mq', 'tesofensina', 'slu-pp'];

const semAcento = (s) =>
  String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Descobre a categoria do produto pelo título
function categoriaDe(titulo) {
  const t = semAcento(titulo);
  for (const [, rotulo, chaves] of CATEGORIAS) {
    for (const k of chaves) {
      if (t.includes(semAcento(k))) return rotulo;
    }
  }
  return null; // não classificou → não inventa
}

// Monta o TÍTULO SEO na fórmula validada.
// Ex: "Retatrutida 120mg ZPHC" -> "Retatrutida 120mg ZPHC — Comprar Emagrecedor | VitaFlow"
function montarTituloSeo(tituloProduto) {
  const nome = String(tituloProduto || '').trim();
  if (!nome) return null;

  const cat = categoriaDe(nome);
  if (!cat) return null; // sem categoria reconhecida → NÃO gera (não inventa)

  const benef = BENEFICIO[cat] || '';
  const sufixoCompleto = ` — Comprar ${cat}${benef ? ' ' + benef : ''} | VitaFlow`;

  // Encurta por PRIORIDADE. O benefício ("para Emagrecimento") é o que a pessoa realmente
  // busca — vale MAIS que o "| VitaFlow". Então o "| VitaFlow" é sacrificado primeiro.
  const tentativas = [
    sufixoCompleto,                                              // completo
    benef ? ` — Comprar ${cat} ${benef}` : null,                 // sem "| VitaFlow", mantém o benefício
    ` — Comprar ${cat} | VitaFlow`,                              // sem benefício
    ` — Comprar ${cat}`,
    ` | ${cat}`
  ].filter(Boolean);
  for (const suf of tentativas) {
    const t = nome + suf;
    if (t.length <= LIMITE_TITULO) return t;
  }
  // nome já é longo demais: entrega o nome puro (melhor que cortar palavra no meio)
  return nome.slice(0, LIMITE_TITULO);
}

// ── Shopify GraphQL ───────────────────────────────────────────────────────
async function gql(query, variables) {
  const r = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// Lê todos os produtos (paginado)
async function lerProdutos() {
  const out = [];
  let cursor = null;
  for (let i = 0; i < 40; i++) { // teto de segurança: 40 x 100 = 4000 produtos
    const data = await gql(`
      query($cursor: String) {
        products(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id title seo { title } }
        }
      }`, { cursor });
    const p = data.products;
    out.push(...p.nodes);
    if (!p.pageInfo.hasNextPage) break;
    cursor = p.pageInfo.endCursor;
  }
  return out;
}

// Atualiza o título SEO de UM produto (campo seo.title = metafield global.title_tag)
async function aplicarSeo(id, tituloSeo) {
  const data = await gql(`
    mutation($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id seo { title } }
        userErrors { field message }
      }
    }`, { input: { id, seo: { title: tituloSeo } } });
  const errs = data.productUpdate.userErrors;
  if (errs && errs.length) throw new Error(errs.map(e => e.message).join('; '));
  return true;
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};

  if (!TOKEN) return json(500, { ok: false, erro: 'SHOPIFY_TOKEN não configurado no Netlify' });
  if (!SECRET || q.secret !== SECRET) return json(401, { ok: false, erro: 'não autorizado' });

  const aplicar = q.apply === '1';
  const forcar = q.force === '1';
  const limite = q.limit ? parseInt(q.limit, 10) : 0;

  try {
    const produtos = await lerProdutos();

    const planejados = [];
    const pulados = [];

    for (const p of produtos) {
      const seoAtual = (p.seo && p.seo.title) ? String(p.seo.title).trim() : '';

      // já tem título SEO escrito à mão → não mexe (a menos que force=1)
      if (seoAtual && !forcar) {
        pulados.push({ titulo: p.title, motivo: 'já tem título SEO', seo_atual: seoAtual });
        continue;
      }

      const novo = montarTituloSeo(p.title);
      if (!novo) {
        pulados.push({ titulo: p.title, motivo: 'categoria não reconhecida — precisa de título manual' });
        continue;
      }
      if (novo === seoAtual) {
        pulados.push({ titulo: p.title, motivo: 'já está correto' });
        continue;
      }
      planejados.push({ id: p.id, titulo: p.title, seo_atual: seoAtual || '(vazio)', seo_novo: novo, chars: novo.length });
    }

    const fila = limite > 0 ? planejados.slice(0, limite) : planejados;

    // ---- PRÉVIA (padrão): não altera nada ----
    if (!aplicar) {
      return json(200, {
        ok: true,
        modo: 'PREVIA (nada foi alterado)',
        para_aplicar: 'adicione &apply=1 na URL',
        total_produtos: produtos.length,
        vao_mudar: fila.length,
        pulados: pulados.length,
        mudancas: fila,
        detalhe_pulados: pulados
      });
    }

    // ---- APLICAR ----
    const ok = [], falhas = [];
    for (const item of fila) {
      try {
        await aplicarSeo(item.id, item.seo_novo);
        ok.push({ titulo: item.titulo, seo_novo: item.seo_novo });
      } catch (e) {
        falhas.push({ titulo: item.titulo, erro: e.message });
      }
      await new Promise(r => setTimeout(r, 250)); // respeita o rate limit do Shopify
    }

    return json(200, {
      ok: true,
      modo: 'APLICADO',
      total_produtos: produtos.length,
      aplicados: ok.length,
      falhas: falhas.length,
      pulados: pulados.length,
      detalhe_aplicados: ok,
      detalhe_falhas: falhas
    });

  } catch (e) {
    return json(500, { ok: false, erro: e.message });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body, null, 2)
  };
}
