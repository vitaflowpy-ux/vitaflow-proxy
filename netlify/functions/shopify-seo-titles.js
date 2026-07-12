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
    'cbl-514', '5-amino', '5 amino', 'amino-1mq', 'mots-c', 'mots c',
    // faltavam (achados na previa):
    'clembuterol', 'clenbuterol', 'ioimbina', 'yohimbina', 't3', 'liotironina',
    't4', 'levotiroxina', 'cyt3', 'lipo', 'lipoc', 'lipob', 'redux', 'sibutramina',
    'orlistat', 'aicar', 'slupp', 'slu pp'
  ]],
  ['hormônio', 'Hormônio', [
    'testosterona', 'enantato', 'cipionato', 'propionato', 'durateston', 'sustanon',
    'deca', 'nandrolona', 'boldenona', 'trembolona', 'stanozolol', 'oxandrolona',
    'dianabol', 'metandrostenolona', 'masteron', 'drostanolona', 'primobolan',
    'metenolona', 'halotestin', 'anadrol', 'oximetolona', 'winstrol', 'hemogenin',
    'estradiol', 'progesterona', 'gonadotrofina', 'hcg', 'clomifeno', 'tamoxifeno',
    'anastrozol', 'letrozol', 'proviron', 'mesterolona', 'cabergolina',
    // faltavam (achados na previa dos 774 produtos):
    'npp', 'fenilpropionato', 'turinabol', 'trestolona', 'trest', 'dhb', 'superdrol',
    'methasterone', 'metasterona', 'hemogenim', 'dhea', 'sustanon', 'mix', 'cutstack',
    'undecilato', 'undecanoato', 'acetato de trembolona', 'primoteston', 'testovis'
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
    'adipotide', 'follistatina', 'igf', 'igf-1', 'hexarelin', 'gonadorelina',
    // faltavam (achados na previa):
    'epithalon', 'epitalon', 'tb500', 'tb-500', 'peg-mgf', 'peg mgf', 'mgf',
    'ss31', 'ss-31', 'snake', 'klow', 'glow', 'melatonan', 'melanotan',
    'fematropin', 'acido tioctico', 'acido ascorbico'
  ]],
  ['SARM', 'SARM', [
    'ostarine', 'ostarina', 'ligandrol', 'lgd', 'rad-140', 'rad 140', 'testolone',
    'andarine', 's4', 'yk-11', 'sr9009', 'cardarine', 'gw-501516', 'sarm',
    'mk677', 'mk-677', 'nutrobol', 'ibutamoren'
  ]],

  // Suplementos / vitaminas (categoria propria — nao sao peptideo nem hormonio)
  ['suplemento', 'Suplemento', [
    'melatonina', 'melatonin', 'multivitaminico', 'multivitaminc', 'vitamina',
    'colageno', 'creatina', 'omega', 'coenzima', 'glutamina'
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

// ── Limpeza do nome: tira o que NINGUEM busca no Google ───────────────────
// Nomes como "Enantato 250mg/ml - 10 ampolas - Geniqs Pharma - Nao acompanha BAC" (62+ chars)
// nao cabem no titulo SEO. Removemos o ruido e ficamos com: SUBSTANCIA + DOSE + MARCA.
function limparNome(nome) {
  let n = String(nome || '').trim();
  n = n.replace(/\s*-\s*n[aã]o acompanha bac/gi, '');       // "- Não acompanha BAC"
  n = n.replace(/\s*\(\s*produto fracionado\s*\)/gi, '');   // "(produto fracionado)"
  n = n.replace(/\s*-?\s*\d+\s*ampolas?\s*(de\s*\d+\s*ml)?/gi, ''); // "- 10 ampolas de 10ml"
  n = n.replace(/\s*\/\s*\d+\s*tablets?/gi, '');            // "/50 tablets"
  n = n.replace(/\s*-?\s*\d+\s*comprimidos?/gi, '');        // "- 30 Comprimidos"
  n = n.replace(/\s*-?\s*\d+\s*frascos?/gi, '');
  n = n.replace(/\s*\(\s*\d+\s*(mg|mcg)?\s*x\s*\d+\s*vial[s]?\s*\)/gi, ''); // "(5mg x 5 vial)"
  n = n.replace(/\s*-\s*gen[eé]rico\s*$/gi, '');
  n = n.replace(/\s*-\s*([^-]+)\s*-\s*\1\s*$/gi, ' - $1');  // marca repetida no fim
  n = n.replace(/\s*-\s*-\s*/g, ' - ');                     // "- -" duplicado
  n = n.replace(/([^\s])-\s/g, '$1 - ');                    // "250mg/ml- Geniqs" -> "250mg/ml - Geniqs"
  n = n.replace(/\s{2,}/g, ' ').replace(/\s*[-–—+,]\s*$/, '').trim();
  return n;
}

// Corta o nome no ultimo separador seguro (nunca no meio de uma palavra)
function cortarSeguro(nome, max) {
  if (nome.length <= max) return nome;
  let corte = nome.slice(0, max);
  const sep = Math.max(corte.lastIndexOf(' - '), corte.lastIndexOf(' ('), corte.lastIndexOf(' '));
  if (sep > max * 0.55) corte = corte.slice(0, sep);
  return corte.replace(/[\s\-–—(,+]+$/, '').trim();
}

// Monta o TÍTULO SEO. A KEYWORD VEM PRIMEIRO ("Comprar <Categoria>") — assim ela NUNCA
// e cortada, que era o bug da 1a versao (232 titulos perderam o "Comprar").
// Formato: "Comprar <Categoria> <Nome> | VitaFlow"
// Ex: "Comprar Emagrecedor Retatrutida 120mg - ZPHC | VitaFlow"
function montarTituloSeo(tituloProduto) {
  const bruto = String(tituloProduto || '').trim();
  if (!bruto) return null;

  const cat = categoriaDe(bruto);
  if (!cat) return null;                 // nao classificou -> NAO inventa, pula

  let nome = limparNome(bruto);
  // evita repeticao: "Comprar GH GH ZPTrop 90 UI" -> "Comprar GH ZPTrop 90 UI"
  const catRe = new RegExp('^' + cat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i');
  if (catRe.test(nome)) nome = nome.replace(catRe, '');
  const prefixo = `Comprar ${cat} `;     // <- keyword sempre presente, no inicio
  const sufixo = ' | VitaFlow';

  // 1) cabe tudo?
  if ((prefixo + nome + sufixo).length <= LIMITE_TITULO) return prefixo + nome + sufixo;
  // 2) sacrifica o "| VitaFlow" (a marca ja aparece no dominio)
  if ((prefixo + nome).length <= LIMITE_TITULO) return prefixo + nome;
  // 3) nao cabe: tira a MARCA inteira (o trecho apos o ultimo " - ").
  //    Melhor perder a marca do que exibir ela cortada ("Cooper" no lugar de "Cooper Pharma").
  const espaco = LIMITE_TITULO - prefixo.length;
  const iMarca = nome.lastIndexOf(' - ');
  if (iMarca > 0) {
    const semMarca = nome.slice(0, iMarca).trim();
    if (semMarca.length <= espaco) return (prefixo + semMarca).trim();
  }
  // 4) ainda nao cabe: corta em separador seguro (nunca no meio de palavra)
  const cortado = cortarSeguro(nome, espaco);
  return (prefixo + cortado).trim();
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
