const SHOPIFY_STORE = 'vitaflow-7352';
const INFINITEPAY_TAG = 'vitaflowoficial';
const FIREBASE_URL = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxFlaN0FXFbpcC8HZ80sxnq383m5d-xTaj5cg72VcCdnYx47N_qKkiELFN5KAPmm_nb/exec';
const ATACADO_PDF = 'https://drive.google.com/uc?export=download&id=1olhYj0OW1cL0Wk0kk6-fct89EJff_1Ip';

const MARCAS = {
  'cooper': 'Cooper Pharma', 'lander': 'Landerlan', 'landerlan': 'Landerlan',
  'king': 'King Pharma', 'alpha': 'Alpha Pharma', 'muscle': 'Muscle Labs',
  'zphc': 'ZPHC', 'xl': 'XL Peptides', 'neuro': 'Neuroceptix', 'neuroceptix': 'Neuroceptix',
  'oxygen': 'OxygenKW', 'health': 'Health Peptides', 'royal': 'Royal Pharmaceuticals',
  'pharmacom': 'Pharmacom', 'veltrane': 'Veltrane', 'lipoless': 'Lipoless',
  'eticos': 'Ético', 'etico': 'Ético', 'neo': 'NeoPeptides', 'neopeptides': 'NeoPeptides',
  'euro': 'Eurogold', 'eurogold': 'Eurogold', 'alluvi': 'Alluvi Healthcare',
  'tirzec': 'Tirzec', 'gluconex': 'Gluconex', 'lipoland': 'Lipoland', 'tg': 'TG',
  'spectrum': 'Spectrum Pharma', 'eminence': 'Eminence Labs', 'canada': 'CanadaBioLabs',
  'drosgenic': 'Drosgenic', 'novax': 'Novax Pharmaceuticals', 'zuuv': 'ZUUV',
  'lider': 'Líder Pharma', 'bratva': 'Bratva Labs', 'synedica': 'Synedica',
};

// ── Stacks por objetivo ───────────────────────────────────────────────────────
const STACKS = {
  emagrecimento: ['retatrutida', 'tirzepatida', 'semaglutida', 'cbl-514', 'cbl514', 'mots-c', 'motsc', 'aod-9604', 'aod9604', 'slupp-332', 'slupp332', 'ipamorelin', 'ipamorelina', 'clembuterol', 't3', 'glow', 'klow'],
  massa: ['testosterona', 'testosterone', 'trembolona', 'trenbolona', 'boldenona', 'boldenone', 'decanoato', 'deca', 'gh', 'somatropina', 'ipamorelin', 'cjc-1295', 'cjc1295', 'stanozolol', 'oxandrolona'],
  recuperacao: ['bpc-157', 'bpc157', 'tb-500', 'tb500', 'klow', 'glow', 'ghk-cu', 'ghkcu', 'ss-31', 'ss31'],
  antiaging: ['epitalon', 'epithalon', 'ss-31', 'ss31', 'mots-c', 'motsc', 'ghk-cu', 'ghkcu', 'tesamorelin', '5-amino-1mq', '5amino1mq'],
  performance: ['gh', 'somatropina', 'testosterona', 'ipamorelin', 'cjc-1295', 'slupp-332', 'mots-c'],
  mitocondrial: ['ss-31', 'ss31', 'mots-c', 'motsc', 'slupp-332', 'slupp332', '5-amino-1mq', '5amino1mq', 'epitalon', 'nad'],
  hormonal: ['testosterona', 'testosterone', 'hcg', 'anastrozol', 'proviron', 'mesterolona'],
};

// Palavras que indicam cada objetivo
const OBJETIVO_PALAVRAS = {
  emagrecimento: ['emagre', 'perder peso', 'emagrecer', 'queimar gordura', 'gordura', 'peso', 'obesidade', 'secar', 'definir', 'cutting', 'peptideo emagre'],
  massa: ['ganhar massa', 'hipertrofia', 'ganho muscular', 'massa muscular', 'bulking', 'anabolizante', 'hormonio', 'anabolismo', 'ficar grande', 'aumentar musculo'],
  recuperacao: ['recuperar', 'recuperacao', 'lesao', 'lesão', 'cicatrizar', 'dor', 'tendinite', 'articulacao', 'articulação', 'inflamacao'],
  antiaging: ['anti-aging', 'anti aging', 'envelhecimento', 'longevidade', 'rejuvenescer', 'celula', 'celulas', 'antienvelhecimento'],
  performance: ['performance', 'resistencia', 'rendimento', 'atletismo', 'corrida', 'endurance', 'esporte'],
  mitocondrial: ['energia', 'mitocondria', 'cansaco', 'fadiga', 'disposicao', 'mitocondrial'],
  hormonal: ['hormonio', 'testosterona', 'trt', 'reposicao hormonal', 'libido', 'andropausa'],
};

const SYSTEM_PROMPT = `Você é a Athena, consultora especializada da VitaFlow em suplementação avançada e performance humana.

IDENTIDADE E TOM:
- Tom: consultora experiente, inteligente, direta, acolhedora e VENDEDORA
- Idioma: português brasileiro informal e caloroso
- NUNCA mencione Paraguai ou Argentina — "entregamos para todo o Brasil"
- Apresentação: "✨ Olá! Eu sou a *Athena* 🤖💊, consultora da *VitaFlow*! 🚀\nEstou aqui para te ajudar a encontrar os melhores produtos para seus objetivos. 💪🔥\nO que você está procurando hoje?"
- NUNCA liste categorias na apresentação

INTELIGÊNCIA CONSULTORA — REGRAS PRINCIPAIS:
1. NUNCA invente produtos, preços, promoções ou informações — use SOMENTE o que está no catálogo fornecido
2. Se produto não disponível → use as ALTERNATIVAS DO MESMO OBJETIVO fornecidas no contexto
3. Doses mínimas eficazes: sempre calcule quanto tempo o produto dura (ex: "com 0,5mg/semana este frasco rende 24 semanas")
4. Sugira UM complemento por conversa — se cliente recusar, aceite e siga sem insistir
5. NUNCA congele — sempre dê uma resposta útil, mesmo que seja pedir clareza
6. Seja consultora, não robô — raciocine, conecte objetivo ao produto, explique valor

REGRA DE OURO — NAVEGAÇÃO DO CLIENTE:
- Se o cliente pedir categoria, número ou nome de produto: mostre IMEDIATAMENTE sem perguntas
- Perguntas de objetivo SÓ quando cliente não sabe o que quer

OBJETIVOS — COMO APRESENTAR:
Quando o cliente pede orientação sem saber o produto:
"Qual é o seu objetivo principal? 😊
💊 Emagrecimento
💪 Ganho de massa muscular
🔧 Recuperação/lesões
⏳ Anti-aging/longevidade
⚡ Performance/resistência
🔋 Saúde mitocondrial/energia
🧬 Saúde hormonal"

MUDANÇA DE CONTEXTO — REGRA CRÍTICA:
Quando cliente mudar de assunto, ignore contexto anterior completamente.

CANETAS ESPECIAIS:
- 🔥 *Caneta 240UI Eurogold* (Somatropina + Ipamorelin + GHRP6) — metabolismo geral
- 🔥 *Caneta 200 UI MyoMax Inibition - Alluvi* (CJC-1295 + HGH Frag + Folistatin) — composição corporal

PREFERÊNCIAS DE MARCA:
- Retatrutida: Veltrane, ZPHC, Alluvi, Synedica
- Tirzepatida: Lipoless, TG, Tirzec, Gluconex, Lipoland
- Peptídeos: XL Peptides, Health Peptides, NeoPeptides
- Hormônios: Landerlan, ZPHC, Cooper Pharma
- GH: do mais barato para o mais caro

TIRZEPATIDA — EXPLICAÇÃO OBRIGATÓRIA:
"15mg" das marcas populares = 60mg TOTAIS (4 ampolas x 15mg). Explique sempre de forma didática com cálculo de duração.

RETATRUTIDA:
- Melhor custo-benefício: Veltrane 120mg
- Melhor qualidade: ZPHC, Alluvi, Synedica
- Explique relação dose/duração

PROTOCOLOS:
- Informações detalhadas sobre mecanismo, benefícios e protocolo
- Doses MÍNIMAS eficazes com cálculo de duração do produto
- Disclaimer: "💡 Como qualquer suplemento avançado, o acompanhamento profissional potencializa os resultados."
- Após protocolo → direcione para venda ou vitaflowoficial.com/pages/gerador-de-protocolo

ATACADO:
- Mínimo R$3.000 | Preços variam pelo câmbio | Link: ${ATACADO_PDF}
- Escalone: [ESCALAR_HUMANO]

CUPONS E DESCONTOS:
- Com cupom: aplicar em vitaflowoficial.com ou conectar com atendente
- Pede desconto — primeira compra: peça nome e CPF → "Confirmado! 5% de desconto em produtos (não inclui frete)"
- Não primeira compra: sem desconto, ofereça promoções

CATÁLOGO:
- Ordene do menor para o maior em mg/ui
- Formato: emoji *Nome* — R$ preço
- Emojis: 1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🔟 depois 11. 12...
- Linha em branco entre produtos
- Comente sobre custo-benefício após listar
- NUNCA use ## ou ### — use apenas *negrito*

LOGÍSTICA:
"Para rastrear, nosso setor de logística te atende diretamente! 📦
👉 *wa.me/447537155718*
Leve: número do pedido, CPF e nome. Eles resolvem rapidinho! 💪"

FRETE:
- Recomende Transportadora — seguro grátis (cobre apreensão/extravio)
- Despacho: até 48h úteis após pagamento
- Tabela:
  RJ: PAC R$45|SEDEX R$60|Transp R$70 | SP: PAC R$45|SEDEX R$60|Transp R$55
  MG: PAC R$45|SEDEX R$70|Transp R$70 | ES: PAC R$45|SEDEX R$70|Transp R$70
  DF: PAC R$45|SEDEX R$60|Transp R$72 | PR: PAC R$45|SEDEX R$60|Transp R$70
  SC: PAC R$45|SEDEX R$70|Transp R$70 | RS: PAC R$45|SEDEX R$70|Transp R$100
  GO: PAC R$45|SEDEX R$70|Transp R$76 | MS: PAC R$45|SEDEX R$85|Transp R$80
  BA: PAC R$58|SEDEX R$90|Transp R$80 | MT: PAC R$58|SEDEX R$90|Transp R$75
  CE: PAC R$72|SEDEX R$105|Transp R$80 | PA: PAC R$87|SEDEX R$105|Transp R$110
  PE: PAC R$87|SEDEX R$115|Transp R$90 | TO: PAC R$87|SEDEX R$105|Transp R$110
  MA: PAC R$100|SEDEX R$125|Transp R$90 | PB: PAC R$100|SEDEX R$125|Transp R$100
  RN: PAC R$100|SEDEX R$125|Transp R$100 | PI: PAC R$100|SEDEX R$125|Transp R$110
  AL: PAC R$100|SEDEX R$125|Transp R$90 | SE: PAC R$100|SEDEX R$125|Transp R$90
  AM: PAC R$100|SEDEX R$125|Transp R$110 | RO: PAC R$100|SEDEX R$110|Transp R$170
  AP: PAC R$100|SEDEX R$125|Transp R$120 | RR: PAC R$130|SEDEX R$110
  AC: PAC R$130|SEDEX R$110|Transp R$150

PAGAMENTO:
- [GERAR_PAGAMENTO:produto + Frete ESTADO MODALIDADE:valor total]
- Só gere quando cliente confirmar compra
- NUNCA mencione "link de pagamento" antes de o cliente ter escolhido um produto específico
- Sequência obrigatória: 1) cliente escolhe produto → 2) pergunta estado/modalidade frete → 3) confirma total → 4) gera link
- Se cliente perguntar só sobre frete sem produto: informe os valores e pergunte o que ele quer pedir

DESCONTO PROMOCIONAL (quando houver promoção ativa no contexto):
- O desconto é aplicado SOMENTE no valor dos produtos, NUNCA no frete
- NÃO é acumulável com nenhum outro desconto, cupom ou promoção — se cliente pedir desconto adicional ou mencionar cupom, explique que a promoção já é o desconto máximo disponível
- Cálculo: valor_produto × (1 - desconto%) + valor_frete = total do link
- Exemplo com 15% off: produto R$1.000 + frete R$70 = link de R$920 (R$850 produto + R$70 frete)
- Mostre o cálculo detalhado ao cliente antes de gerar o link:
  "💰 Produto: R$ 1.000,00
   🔥 Desconto 15%: -R$ 150,00
   🚚 Frete [estado/modalidade]: R$ 70,00
   ✅ Total: R$ 920,00"
- Só então gera: [GERAR_PAGAMENTO:produto + Frete ESTADO MODALIDADE:920.00]

PÓS-VENDA:
- Imagem/comprovante = pagamento confirmado
- Colete: NOME, CPF, TELEFONE, EMAIL, ENDEREÇO, COMPLEMENTO, BAIRRO, CIDADE, ESTADO, CEP
- [DADOS_CLIENTE:nome|cpf|telefone|email|endereco|complemento|bairro|cidade|estado|cep|produto|valor]
- NUNCA diga "finalizado" sem disparar [DADOS_CLIENTE]

ESCALAÇÃO: [ESCALAR_HUMANO]
SITE: vitaflowoficial.com | INSTAGRAM: @vitaflow.py`;

// ── Utilitários ───────────────────────────────────────────────────────────────
function limparTagsXML(texto) {
  return texto.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '').replace(/<[^>]+>/g, '').trim();
}
function normalizarTexto(texto) {
  return (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ç/g, 'c').trim();
}
function expandirMarca(termo) {
  const norm = normalizarTexto(termo);
  for (const [abrev, nome] of Object.entries(MARCAS)) {
    if (norm === abrev || norm.includes(abrev)) return nome;
  }
  return termo;
}
function singularizar(palavra) {
  if (palavra.endsWith('idas')) return palavra.slice(0, -1);
  if (palavra.endsWith('idos')) return palavra.slice(0, -1);
  if (palavra.endsWith('oes')) return palavra.slice(0, -2) + 'ao';
  if (palavra.endsWith('ais')) return palavra.slice(0, -2) + 'al';
  if (palavra.endsWith('eis')) return palavra.slice(0, -2) + 'el';
  if (palavra.length > 4 && palavra.endsWith('s')) return palavra.slice(0, -1);
  return palavra;
}

const STOP_BUSCA = new Set([
  'voce','voces','tem','para','quero','qual','como','esse','esta','uma','que',
  'com','dos','das','marca','produto','linha','sobre','ver','mostrar','quais',
  'mais','tudo','seus','suas','minha','meu','comprar','preciso','gostaria','saber',
  'todos','todas','valores','preco','precos','lista','tabela','poderia','me','de',
  'do','da','os','as','um','no','na','por','ate','so','ja','nao','sim','ok',
  'ola','oi','protocolo','objetivo','ajuda','o','a','e','em','ou','se','ao',
  'ser','ter','ir','ver','sao','vende','vendem','custa','custo','valor',
  'opcao','opcoes','info','fala','mostra','passa','ha','la','ai','te','lhe',
  'nos','show','boa','bom','dia','tarde','noite','bem','certo','ver','olhar',
  'interessado','interessada','quero','busco','procuro','buscando'
]);

function extrairTermoBusca(mensagem) {
  const norm = normalizarTexto(mensagem);
  const semFrases = norm
    .replace(/quero ver|quero saber|quero comprar|quanto custa|qual o preco|qual o valor|voce tem|tem disponivel|me mostra|me fala|me passa|o preco de|preco do|preco da|ver os|ver as|quais sao|qual e o|qual e a|informacoes sobre|info sobre|pode me falar|fala sobre|me conta sobre|me indica|me recomenda|o que e|o que sao|como funciona|como usar|pra que serve|para que serve/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const palavras = semFrases.split(/\s+/).filter(p => p.length > 2 && !STOP_BUSCA.has(p));
  return palavras.join(' ').trim();
}

// ── Detecta objetivo da mensagem ──────────────────────────────────────────────
function detectarObjetivo(mensagem) {
  const norm = normalizarTexto(mensagem);
  for (const [objetivo, palavras] of Object.entries(OBJETIVO_PALAVRAS)) {
    if (palavras.some(p => norm.includes(p))) return objetivo;
  }
  // Detecta objetivo pelo nome do produto
  for (const [objetivo, produtos] of Object.entries(STACKS)) {
    if (produtos.some(p => norm.includes(p))) return objetivo;
  }
  return null;
}

// ── Firebase ──────────────────────────────────────────────────────────────────
async function getHistory(sessionId) {
  try {
    const key = sessionId.replace(/[^a-zA-Z0-9]/g, '_');
    const res = await fetch(`${FIREBASE_URL}/vitaflow_sessions/${key}.json`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
async function saveHistory(sessionId, history) {
  try {
    const key = sessionId.replace(/[^a-zA-Z0-9]/g, '_');
    await fetch(`${FIREBASE_URL}/vitaflow_sessions/${key}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(history.slice(-12))
    });
  } catch {}
}
async function deleteHistory(sessionId) {
  try {
    const key = sessionId.replace(/[^a-zA-Z0-9]/g, '_');
    await fetch(`${FIREBASE_URL}/vitaflow_sessions/${key}.json`, { method: 'DELETE' });
  } catch {}
}

// ── Promoções programadas ─────────────────────────────────────────────────────
async function carregarPromocoes() {
  try {
    const res = await fetch(`${FIREBASE_URL}/vitaflow_promocoes.json`);
    const data = await res.json();
    if (!data) return '';
    const hoje = new Date().toISOString().slice(0, 10);
    const ativas = Object.values(data).filter(p =>
      p && p.ativo && (!p.inicio || p.inicio <= hoje) && (!p.fim || p.fim >= hoje)
    );
    if (!ativas.length) return '';
    const lista = ativas.map(p => `• *${p.titulo}*: ${p.descricao}`).join('\n');
    return `\n\nPROMOÇÕES ATIVAS AGORA (mencione quando relevante):\n${lista}`;
  } catch { return ''; }
}

// ── Aprendizado simples ───────────────────────────────────────────────────────
async function salvarAprendizado(pergunta, produto, valor) {
  try {
    const ts = Date.now();
    await fetch(`${FIREBASE_URL}/vitaflow_aprendizado/${ts}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pergunta: normalizarTexto(pergunta), produto, valor, ts })
    });
  } catch {}
}

async function carregarAprendizado(mensagem) {
  try {
    const res = await fetch(`${FIREBASE_URL}/vitaflow_aprendizado.json`);
    const data = await res.json();
    if (!data) return '';
    const norm = normalizarTexto(mensagem);
    const palavrasMens = norm.split(/\s+/).filter(p => p.length > 3 && !STOP_BUSCA.has(p));
    if (!palavrasMens.length) return '';
    const matches = Object.values(data)
      .filter(r => r && r.pergunta && r.produto)
      .filter(r => {
        const palavrasR = r.pergunta.split(/\s+/).filter(p => p.length > 3);
        return palavrasMens.filter(p => palavrasR.includes(p)).length >= 2;
      })
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 3);
    if (!matches.length) return '';
    const sugestoes = matches.map(m => `"${m.produto}"`).join(', ');
    return `\n\nAPRENDIZADO (produtos que converteram para perguntas similares): ${sugestoes} — considere priorizar esses ao sugerir`;
  } catch { return ''; }
}

// ── Cache Firebase (coleções) ─────────────────────────────────────────────────
const MAPA_COLECOES = {
  'mais vendidos': '10-mais-vendidos', 'mais vendido': '10-mais-vendidos', 'top': '10-mais-vendidos',
  'peptideo': 'peptideos', 'peptideos': 'peptideos', 'peps': 'peptideos', 'pep': 'peptideos',
  'hormonio': 'hormonios', 'hormonios': 'hormonios',
  'anabolizante': 'hormonios', 'anabolizantes': 'hormonios',
  'esteroide': 'hormonios', 'esteroides': 'hormonios',
  'bomba': 'hormonios', 'bombas': 'hormonios',
  'promocao': 'promocoes', 'promocoes': 'promocoes', 'promo': 'promocoes', 'oferta': 'promocoes',
  'sarm': 'outros', 'sarms': 'outros', 'outros': 'outros',
};
async function buscarColecaoCache(handle) {
  try {
    const res = await fetch(`${FIREBASE_URL}/vitaflow_cache/colecoes/${handle}.json`);
    const data = await res.json();
    return data?.dados || null;
  } catch { return null; }
}

// ── Busca no cache do Firebase ───────────────────────────────────────────────
async function buscarNoCache(termo) {
  try {
    const norm = normalizarTexto(termo);
    const palavras = norm.split(/\s+/).filter(p => p.length > 2 && !STOP_BUSCA.has(p));
    if (!palavras.length) return null;

    const TODAS = ['peptideos', 'hormonios', 'gh', 'promocoes', 'outros', '10-mais-vendidos'];
    const resultados = new Set();

    await Promise.all(TODAS.map(async handle => {
      try {
        const res = await fetch(`${FIREBASE_URL}/vitaflow_cache/colecoes/${handle}.json`);
        const data = await res.json();
        if (!data?.dados) return;
        data.dados.split('\n').filter(Boolean).forEach(linha => {
          const nomeProd = normalizarTexto(linha.split('|')[0]);
          if (palavras.every(p => nomeProd.includes(p))) {
            resultados.add(linha);
          }
        });
      } catch {}
    }));

    return resultados.size > 0 ? [...resultados].join('\n') : null;
  } catch { return null; }
}

// ── Shopify ───────────────────────────────────────────────────────────────────
async function buscarShopify(termo) {
  try {
    const termoLimpo = normalizarTexto(termo).replace(/['"]/g, '').trim();
    if (!termoLimpo || termoLimpo.length < 2) return null;
    const res = await fetch(`https://${SHOPIFY_STORE}.myshopify.com/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({
        query: `{ products(first: 50, query: "${termoLimpo}") { edges { node { title availableForSale variants(first: 3) { edges { node { title price { amount } availableForSale } } } } } } }`
      })
    });
    const data = await res.json();
    const produtos = data?.data?.products?.edges?.filter(({ node: p }) => p.availableForSale);
    if (!produtos || produtos.length === 0) return null;
    return produtos.map(({ node: p }) => {
      const variants = p.variants?.edges?.filter(({ node: v }) => v.availableForSale) || [];
      if (variants.length <= 1) {
        const preco = parseFloat(variants[0]?.node?.price?.amount || '0');
        return `${p.title}|${preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      }
      const vars = variants.map(({ node: v }) => {
        const preco = parseFloat(v.price?.amount || 0);
        return `${v.title}:R$${preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      }).join(';');
      return `${p.title}|${vars}`;
    }).join('\n');
  } catch { return null; }
}

// ── Busca todos os produtos de um objetivo ────────────────────────────────────
async function buscarPorObjetivo(objetivo) {
  const termos = STACKS[objetivo] || [];
  const resultados = new Set();
  for (const termo of termos.slice(0, 5)) {
    const r = await buscarShopify(termo);
    if (r) r.split('\n').filter(Boolean).forEach(l => resultados.add(l));
  }
  return resultados.size > 0 ? [...resultados].join('\n') : null;
}

// ── Correções ortográficas ────────────────────────────────────────────────────
const CORRECOES = {
  // Retatrutida
  'retratutida': 'retatrutida', 'retatrutide': 'retatrutida', 'retatrutuda': 'retatrutida',
  'retratrutida': 'retatrutida', 'retatutida': 'retatrutida', 'retrutida': 'retatrutida',
  'retatrutidas': 'retatrutida', 'reta': 'retatrutida',
  // Tirzepatida
  'tirzetapida': 'tirzepatida', 'tirzepatide': 'tirzepatida', 'tirzepetida': 'tirzepatida',
  'tirzapatida': 'tirzepatida', 'tizepatida': 'tirzepatida', 'tirze': 'tirzepatida',
  'tirzepatidas': 'tirzepatida',
  // Semaglutida
  'semalgutida': 'semaglutida', 'semagutida': 'semaglutida', 'sema': 'semaglutida',
  // Ipamorelin
  'ipamorelina': 'ipamorelin', 'ipamorelim': 'ipamorelin', 'ipa': 'ipamorelin',
  'ipa-morelin': 'ipamorelin', 'ipam': 'ipamorelin',
  // Testosterona
  'testoterona': 'testosterona', 'testorona': 'testosterona', 'testo': 'testosterona',
  // Trembolona
  'trembolana': 'trembolona', 'trenbolona': 'trembolona', 'tren': 'trembolona',
  // BPC-157
  'bpc157': 'bpc-157', 'bpc 157': 'bpc-157', 'bpc': 'bpc-157',
  'pl14736': 'bpc-157', 'pl 14736': 'bpc-157', 'pl-14736': 'bpc-157',
  // TB-500
  'tb500': 'tb-500', 'tb 500': 'tb-500', 'tb4': 'tb-500', 'tb-4': 'tb-500',
  'timosina beta 4': 'tb-500', 'timosina beta-4': 'tb-500',
  'thymosin beta 4': 'tb-500', 'thymosin beta-4': 'tb-500',
  // CJC-1295
  'cjc1295': 'cjc-1295', 'cjc 1295': 'cjc-1295', 'cjc': 'cjc-1295',
  'mod grf 1-29': 'cjc-1295', 'mod grf 1 29': 'cjc-1295', 'mod grf': 'cjc-1295',
  // GHRP-6
  'ghrp6': 'ghrp-6', 'ghrp 6': 'ghrp-6',
  // GHRP-2
  'ghrp2': 'ghrp-2', 'ghrp 2': 'ghrp-2',
  // GHK-Cu
  'ghk cu': 'ghk-cu', 'ghkcu': 'ghk-cu', 'ghk': 'ghk-cu',
  'peptideo de cobre': 'ghk-cu', 'peptide de cobre': 'ghk-cu',
  // Melanotan II
  'melanotan 2': 'melanotan', 'melanotan-ii': 'melanotan', 'melanotan ii': 'melanotan',
  'mt-2': 'melanotan', 'mt2': 'melanotan', 'mt ii': 'melanotan', 'mt 2': 'melanotan',
  // PT-141
  'pt141': 'pt-141', 'pt 141': 'pt-141',
  'bremelanotide': 'pt-141', 'bremelanotida': 'pt-141', 'vyleesi': 'pt-141',
  // HGH Fragment 176-191
  'hgh frag': 'hgh fragment', 'hgh-frag': 'hgh fragment',
  'frag 176': 'hgh fragment', 'fragmento 176-191': 'hgh fragment',
  'frag176191': 'hgh fragment', 'fragment 176': 'hgh fragment',
  'aod9604': 'aod-9604', 'aod 9604': 'aod-9604', 'aod': 'aod-9604',
  // Epitalon
  'epitelon': 'epitalon', 'epithalon': 'epitalon', 'epithalone': 'epitalon', 'aedg': 'epitalon',
  // Sermorelin
  'sermorelina': 'sermorelin', 'grf 1-29': 'sermorelin', 'grf 1 29': 'sermorelin',
  // Tesamorelin
  'tesamorelina': 'tesamorelin', 'egrifta': 'tesamorelin',
  // MOTS-C
  'motsc': 'mots-c', 'mots c': 'mots-c', 'motss': 'mots-c',
  // SS-31
  'ss31': 'ss-31', 'ss 31': 'ss-31',
  // LL-37
  'll37': 'll-37', 'll 37': 'll-37',
  // CBL-514
  'cbl514': 'cbl-514', 'cbl 514': 'cbl-514',
  // 5-Amino-1MQ
  '5amino1mq': '5-amino-1mq', '5 amino': '5-amino-1mq',
  // Slupp-332
  'slupp332': 'slupp-332', 'slupp 332': 'slupp-332',
  // Cagrilintide
  'cagrilintida': 'cagrilintide', 'cagrili': 'cagrilintide',

  // ── ESTEROIDES ANABOLIZANTES ─────────────────────────────────────────────
  // Testosterona
  'testosterone': 'testosterona', 'propionato': 'testosterona propionato',
  'enantato': 'testosterona enantato', 'cipionato': 'testosterona cipionato',
  'isocaptoato': 'testosterona', 'decanoato': 'testosterona decanoato',
  'durateston': 'testosterona', 'deposteron': 'testosterona', 'nebido': 'testosterona',

  // Oxandrolona
  'oxandrolone': 'oxandrolona', 'oxan': 'oxandrolona', 'oxandrola': 'oxandrolona',
  'anavar': 'oxandrolona',

  // Stanozolol
  'estanozolol': 'stanozolol', 'stano': 'stanozolol', 'estano': 'stanozolol',
  'winstrol': 'stanozolol', 'winny': 'stanozolol',

  // Nandrolona
  'nandrolona': 'nandrolona', 'decanoato de nandrolona': 'nandrolona',
  'fenilpropionato de nandrolona': 'nandrolona', 'deca': 'nandrolona',
  'deca-durabolin': 'nandrolona', 'npp': 'nandrolona',

  // Trembolona
  'trenbolone': 'trembolona', 'acetato de trembolona': 'trembolona',
  'enantato de trembolona': 'trembolona', 'parabolan': 'trembolona',
  'hexidrobenzilcarbonato': 'trembolona',

  // Metandienona (Dianabol)
  'metandienona': 'dianabol', 'metandrostenolona': 'dianabol',
  'dbol': 'dianabol', 'diana': 'dianabol',

  // Oximetolona (Hemogenin)
  'oximetolona': 'hemogenin', 'oxymetholone': 'hemogenin', 'anadrol': 'hemogenin',

  // Boldenona
  'boldenone': 'boldenona', 'undecilenato de boldenone': 'boldenona',
  'equipoise': 'boldenona', 'bold': 'boldenona',

  // Drostanolona (Masteron)
  'drostanolona': 'masteron', 'propionato de drostanolona': 'masteron',
  'enantato de drostanolona': 'masteron', 'mast': 'masteron',

  // Metenolona (Primobolan)
  'metenolona': 'primobolan', 'enantato de metenolona': 'primobolan', 'primo': 'primobolan',
};

function corrigirOrtografia(texto) {
  const norm = normalizarTexto(texto);
  // Ordena por tamanho decrescente para evitar substituições parciais
  const entradas = Object.entries(CORRECOES).sort((a,b) => b[0].length - a[0].length);
  for (const [errado, correto] of entradas) {
    if (norm.includes(errado)) {
      return norm.replace(new RegExp(errado.replace(/[-]/g,'\\-'), 'gi'), correto);
    }
  }
  return texto;
}

// ── Busca melhorada com fallback por objetivo ─────────────────────────────────
async function buscarProduto(mensagem) {
  mensagem = corrigirOrtografia(mensagem);

  // 1. Mensagem completa
  let resultado = await buscarShopify(mensagem);
  if (resultado) return { produtos: resultado, fallback: false };

  // 2. Termo extraído
  const termo = extrairTermoBusca(mensagem);
  if (termo && termo !== normalizarTexto(mensagem) && termo.length > 1) {
    resultado = await buscarShopify(termo);
    if (resultado) return { produtos: resultado, fallback: false };
  }

  // 3. Expande marca
  const marcaExpandida = expandirMarca(mensagem);
  if (marcaExpandida !== mensagem) {
    resultado = await buscarShopify(marcaExpandida);
    if (resultado) return { produtos: resultado, fallback: false };
  }

  // 4. Palavras individuais + singular
  const palavras = (termo || normalizarTexto(mensagem)).split(/\s+/).filter(p => p.length > 2 && !STOP_BUSCA.has(p));
  for (const palavra of palavras) {
    resultado = await buscarShopify(expandirMarca(palavra));
    if (resultado) return { produtos: resultado, fallback: false };
    const sing = singularizar(palavra);
    if (sing !== palavra) {
      resultado = await buscarShopify(sing);
      if (resultado) return { produtos: resultado, fallback: false };
    }
  }

  // 5. Fallback: busca no cache Firebase (mais confiável que Shopify ao vivo)
  const termoCache = termo || normalizarTexto(mensagem);
  resultado = await buscarNoCache(termoCache);
  if (resultado) {
    console.log('CACHE HIT busca:', termoCache);
    return { produtos: resultado, fallback: false };
  }

  // 6. Fallback: busca por objetivo
  const objetivo = detectarObjetivo(mensagem);
  if (objetivo) {
    resultado = await buscarPorObjetivo(objetivo);
    if (resultado) return { produtos: resultado, fallback: true, objetivo };
  }

  return { produtos: null, fallback: false };
}

// ── Formata lista de produtos ─────────────────────────────────────────────────
function formatarLista(produtos) {
  const linhas = produtos.split('\n').filter(Boolean).sort((a, b) => {
    const getMg = s => { const m = s.match(/(\d+(?:\.\d+)?)\s*(?:mg|ui|ml)/i); return m ? parseFloat(m[1]) : 9999; };
    return getMg(a) - getMg(b);
  });
  const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  return linhas.map((linha, i) => {
    const [nome, preco] = linha.split('|');
    const emoji = i < 10 ? emojis[i] : `${i+1}.`;
    return preco ? `${emoji} *${nome.trim()}* — R$ ${preco.trim()}` : `${emoji} *${nome.trim()}*`;
  }).join('\n\n');
}

// ── Outros serviços ───────────────────────────────────────────────────────────
async function gerarLinkInfinitePay(produto, valor) {
  try {
    const res = await fetch('https://api.checkout.infinitepay.io/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: INFINITEPAY_TAG,
        redirect_url: 'https://vitaflowoficial.com/pages/obrigado',
        items: [{ quantity: 1, price: Math.round(valor * 100), description: produto }]
      })
    });
    const data = await res.json();
    return data?.url || null;
  } catch { return null; }
}
async function gerarNumeroPedido() {
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'gerar_numero', tipo: 'A' })
    });
    const data = await res.json();
    return data.order_nsu || null;
  } catch { return null; }
}
async function salvarPedidoGAS(pedido) {
  try {
    await fetch(GAS_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido)
    });
  } catch {}
}
async function enviarTelegram(texto) {
  try {
    await fetch('https://api.telegram.org/bot8689592582:AAEjalaa2hDQxstUVhm45CG4aZd9OiDDRXY/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: '8660563352', text: texto })
    });
  } catch {}
}

// ── Handler principal ─────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const respond = (resposta) => ({
    statusCode: 200, headers,
    body: JSON.stringify({ resposta, resposta2: '', resposta3: '', transferir: false })
  });

  try {
    const body = JSON.parse(event.body || '{}');
    const mensagem = body.mensagem || body.message || body.texto || '';
    const rawId = body.phone || body.subscriber_id || body.session_id || 'default';
    const sessionId = rawId.replace(/\D/g, '').replace(/^0+/, '').replace(/^55(\d{10,11})$/, '55$1') || rawId;

    console.log('MSG:', mensagem, '| SESSION:', sessionId);

    if (!mensagem && !body.type) return { statusCode: 400, headers, body: JSON.stringify({ error: 'mensagem obrigatoria' }) };

    const [history, promocoes] = await Promise.all([
      getHistory(sessionId),
      carregarPromocoes()
    ]);
    const norm = normalizarTexto(mensagem);

    // ── MÍDIA ─────────────────────────────────────────────────────────────────
    const ehMidia = ['image','video','document','audio','sticker'].includes(body.type) ||
      ['', '[image]', '[video]', '[document]', '[audio]', '[sticker]'].includes(mensagem);
    if (ehMidia && history.length > 0) {
      history.push({ role: 'user', content: 'O cliente enviou o comprovante de pagamento. Considere como pagamento confirmado e solicite os dados de entrega.' });
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 600, system: SYSTEM_PROMPT + promocoes, messages: history })
      });
      const d = await res.json();
      const reply = limparTagsXML(d.content?.[0]?.text || 'Comprovante recebido! ✅ Me passa seus dados para o envio.');
      history.push({ role: 'assistant', content: reply });
      await saveHistory(sessionId, history);
      return respond(reply);
    }

    // ── HUMANO ────────────────────────────────────────────────────────────────
    if (['atendente', 'vendedor', 'humano', 'pessoa real', 'falar com alguem', 'falar com pessoa'].some(p => norm.includes(p))) {
      await enviarTelegram(`🔔 CLIENTE QUER HUMANO\n📱 ${sessionId}\n💬 ${mensagem}`);
      await deleteHistory(sessionId);
      return { statusCode: 200, headers, body: JSON.stringify({ resposta: `Claro! Vou te transferir para um de nossos atendentes agora. 😊`, resposta2: '', resposta3: '', transferir: true }) };
    }

    // ── SAUDAÇÃO RÁPIDA (sem chamar API) ─────────────────────────────────────
    const saudacoesSimples = ['oi','olá','ola','oii','oiii','opa','eai','e ai','hey','hi','hello','bom dia','boa tarde','boa noite','tudo bem','tudo bom','como vai','boa','oi tudo bem'];
    const ehSaudacaoSimples = saudacoesSimples.some(s => norm === s || norm === s + '!' || norm === s + '?' || norm.trim() === s);
    if (ehSaudacaoSimples && history.length === 0) {
      const saudacao = `✨ Olá! Eu sou a *Athena* 🤖💊, consultora da *VitaFlow*! 🚀
Estou aqui para te ajudar a encontrar os melhores produtos para seus objetivos. 💪🔥

O que você está procurando hoje?`;
      history.push({ role: 'user', content: mensagem });
      history.push({ role: 'assistant', content: saudacao });
      await saveHistory(sessionId, history);
      return respond(saudacao);
    }

    // ── COLEÇÃO CACHE ─────────────────────────────────────────────────────────
    const palavras = norm.split(/\s+/).filter(Boolean);
    let handleColecao = null, nomeColecao = null;
    if (palavras.length <= 5 && palavras.some(p => p === 'gh') && !norm.match(/gh[a-z]/)) {
      handleColecao = 'gh'; nomeColecao = 'GH';
    }
    if (!handleColecao && palavras.length <= 6) {
      for (const [palavra, handle] of Object.entries(MAPA_COLECOES)) {
        if (norm.includes(palavra)) {
          handleColecao = handle;
          nomeColecao = { '10-mais-vendidos': 'MAIS VENDIDOS', 'peptideos': 'PEPTÍDEOS', 'hormonios': 'HORMÔNIOS', 'gh': 'GH', 'promocoes': 'PROMOÇÕES', 'outros': 'OUTROS' }[handle] || handle.toUpperCase();
          break;
        }
      }
    }
    if (handleColecao) {
      // Promoções e Mais Vendidos — lista produtos direto (poucos itens)
      if (handleColecao === 'promocoes' || handleColecao === '10-mais-vendidos') {
        const dados = await buscarColecaoCache(handleColecao);
        if (dados) {
          const linhas = dados.split('\n').filter(Boolean).sort((a, b) => {
            const getMg = s => { const m = s.match(/(\d+(?:\.\d+)?)\s*(?:mg|ui|ml)/i); return m ? parseFloat(m[1]) : 9999; };
            return getMg(a) - getMg(b);
          }).slice(0, 20);
          const lista = formatarLista(linhas.join('\n'));
          const reply = `Aqui estão os produtos de *${nomeColecao}* disponíveis! 💪\n\n${lista}\n\nQual te interessa? Me diz o nome ou número! 🚀`;
          history.push({ role: 'user', content: mensagem });
          history.push({ role: 'assistant', content: reply });
          await saveHistory(sessionId, history);
          return respond(reply);
        }
      }

      // Peptídeos, Hormônios, GH, Outros — lista substâncias genéricas
      const SUBSTANCIAS = {
        'peptideos': [
          'Retatrutida', 'Tirzepatida', 'Semaglutida', 'Ipamorelin', 'CJC-1295',
          'BPC-157', 'TB-500', 'GHK-Cu', 'SS-31', 'MOTS-C', 'Epitalon',
          'Tesamorelin', 'PT-141', 'Melanotan', 'AOD-9604', 'CBL-514',
          'HGH Fragment 176-191', '5-Amino-1MQ', 'Slupp-332', 'NAD+',
          'Sermorelin', 'LL-37', 'PEG-MGF', 'IGF-1', 'GHRP-6', 'GHRP-2'
        ],
        'hormonios': [
          'Testosterona', 'Durateston', 'Trembolona', 'Boldenona', 'Stanozolol',
          'Oxandrolona', 'Nandrolona (Deca)', 'Masteron', 'Primobolan',
          'Dianabol', 'Hemogenin (Anadrol)', 'HCG', 'Anastrozol', 'Proviron',
          'Clembuterol', 'T3', 'CutStack'
        ],
        'gh': [
          'Somatropina (GH)', 'Caneta Eurogold 240UI', 'Caneta MyoMax Alluvi 200UI',
          'Hygetropin', 'Jintropin', 'Ansomone', 'Genotropin'
        ],
        'outros': [
          'SARMs', 'Peptídeos Especiais', 'Suplementos', 'Acessórios'
        ]
      };

      const substancias = SUBSTANCIAS[handleColecao] || [];
      if (substancias.length > 0) {
        const lista = substancias.map((s, i) => {
          const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
          const emoji = i < 10 ? emojis[i] : `${i+1}.`;
          return `${emoji} ${s}`;
        }).join('\n');
        const reply = `Temos as seguintes opções em *${nomeColecao}*:\n\n${lista}\n\nQual substância te interessa? Me diz o nome que busco todas as opções disponíveis com preços! 😊`;
        history.push({ role: 'user', content: mensagem });
        history.push({ role: 'assistant', content: reply });
        await saveHistory(sessionId, history);
        return respond(reply);
      }
    }

    // ── TABELA DE CATEGORIAS ──────────────────────────────────────────────────
    if (['tabela de produto', 'tabela completa', 'ver categoria', 'quais categoria', 'lista de produto', 'o que voce vende', 'catalogo', 'o que tem'].some(p => norm.includes(p))) {
      const reply = `Temos as seguintes categorias! 📋\n\n1️⃣ *Mais Vendidos*\n2️⃣ *Peptídeos*\n3️⃣ *Hormônios*\n4️⃣ *GH*\n5️⃣ *Promoções*\n6️⃣ *Outros*\n\nQual quer ver? Me diz o número ou nome! 😊`;
      history.push({ role: 'user', content: mensagem });
      history.push({ role: 'assistant', content: reply });
      await saveHistory(sessionId, history);
      return respond(reply);
    }

    // ── DECIDE SE BUSCA NO SHOPIFY ────────────────────────────────────────────
    const ehSaudacao = ['bom dia','boa tarde','boa noite','oi','ola','opa','eai','e ai','hey','hi','hello','tudo bem','tudo bom','como vai'].some(p => norm === p || norm.startsWith(p + ' ') || norm.startsWith(p + '!'));

    // Contextual conservador: só mensagens claramente sem produto
    const ehContextual = history.length > 0 && (
      /^[0-9]{1,2}$/.test(norm) ||
      ['paguei','fiz o pix','transferi','pix feito','obrigado','obrigada','valeu',
       'combinado','fechado','confirmado','gerar link','gerar pagamento',
       'isso mesmo','esse mesmo'].some(p => norm === p || norm === p + '!' || norm === p + '.')
    );

    let contextoProdutos = '';

    if (!ehSaudacao && !ehContextual) {
      // Busca paralela: produto + aprendizado
      const [buscaResult, aprendizado] = await Promise.all([
        buscarProduto(mensagem),
        carregarAprendizado(mensagem)
      ]);

      const { produtos, fallback, objetivo } = buscaResult;
      console.log('BUSCA:', produtos ? `encontrou (fallback=${fallback})` : 'não encontrou', objetivo || '');

      if (produtos) {
        const lista = formatarLista(produtos);
        if (fallback && objetivo) {
          // Produto pedido não disponível, mostrando alternativas do mesmo objetivo
          const nomeObjetivo = { emagrecimento: 'emagrecimento', massa: 'ganho de massa', recuperacao: 'recuperação', antiaging: 'anti-aging', performance: 'performance', mitocondrial: 'saúde mitocondrial', hormonal: 'saúde hormonal' }[objetivo] || objetivo;
          contextoProdutos = `\n\nATENÇÃO: O produto específico pedido pelo cliente não está disponível no momento. USE SOMENTE os produtos abaixo (disponíveis para ${nomeObjetivo}) e explique que são as melhores alternativas disponíveis para o mesmo objetivo. NUNCA mencione o produto indisponível como se estivesse disponível:\n${lista}`;
        } else {
          contextoProdutos = `\n\nCATÁLOGO DISPONÍVEL (use SOMENTE estes — NUNCA invente preços ou produtos além destes):\n${lista}`;
        }
      } else {
        contextoProdutos = `\n\nCATÁLOGO: Nenhum produto disponível encontrado para "${mensagem}". Informe ao cliente que não temos esse produto no momento, mas ofereça ver outras categorias ou acessar vitaflowoficial.com. NUNCA invente produtos ou preços.`;
      }

      if (aprendizado) contextoProdutos += aprendizado;
    }

    // ── CLAUDE SONNET ─────────────────────────────────────────────────────────
    history.push({ role: 'user', content: mensagem });

    const systemFinal = SYSTEM_PROMPT + promocoes + contextoProdutos;

    let claudeData, reply;
    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, system: systemFinal, messages: history })
      });
      claudeData = await claudeRes.json();
      if (claudeData.error || !claudeData.content) throw new Error('Claude error');
      reply = limparTagsXML(claudeData.content[0].text || '');
    } catch(e) {
      // Fallback garantido — nunca congela
      console.error('ERRO CLAUDE:', e.message);
      reply = 'Desculpe o delay! 😊 Pode me contar melhor o que está buscando? Estou aqui para te ajudar!';
      history.push({ role: 'assistant', content: reply });
      await saveHistory(sessionId, history);
      return respond(reply);
    }

    console.log('SONNET:', reply.substring(0, 150));

    // ── ESCALAR ───────────────────────────────────────────────────────────────
    const escalar = reply.includes('[ESCALAR_HUMANO]');
    reply = reply.replace('[ESCALAR_HUMANO]', '').trim();
    if (escalar) {
      await enviarTelegram(`🔔 CLIENTE QUER HUMANO\n📱 ${sessionId}\n💬 ${mensagem}`);
      await deleteHistory(sessionId);
      return { statusCode: 200, headers, body: JSON.stringify({ resposta: reply || 'Vou te transferir para um atendente! 😊', resposta2: '', resposta3: '', transferir: true }) };
    }

    // ── GERAR PAGAMENTO ───────────────────────────────────────────────────────
    const matchPag = reply.match(/\[GERAR_PAGAMENTO:(.+?):(\d+\.?\d*)\]/);
    if (matchPag) {
      reply = reply.replace(matchPag[0], '').trim();
      const nomeProd = matchPag[1];
      const valor = parseFloat(matchPag[2]);
      const link = await gerarLinkInfinitePay(nomeProd, valor);
      try {
        const key = `pending_${sessionId.replace(/[^a-zA-Z0-9]/g, '_')}`;
        await fetch(`${FIREBASE_URL}/vitaflow_pending_orders/${key}.json`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: sessionId, subscriber_id: body.subscriber_id || null, produto: nomeProd, valor, ts: Date.now() })
        });
      } catch {}
      reply += link
        ? `\n\n💳 *Link de pagamento:*\n${link}\n\nPague e me envie o comprovante! 📸 _(print ou foto)_`
        : `\n\nAcesse: vitaflowoficial.com`;
      history.push({ role: 'assistant', content: reply });
      await saveHistory(sessionId, history);
      return respond(reply);
    }

    // ── DADOS CLIENTE (venda concluída) ───────────────────────────────────────
    const matchDados = reply.match(/\[DADOS_CLIENTE:(.+?)\]/);
    if (matchDados) {
      reply = reply.replace(matchDados[0], '').trim();
      const [nome, cpfRaw, telefone, email, endereco, complemento, bairro, cidade, estado, cep, produto, valorRaw] = matchDados[1].split('|');
      const cpfNum = (cpfRaw || '').replace(/\D/g, '');
      const cpf = cpfNum.length === 11 ? `${cpfNum.slice(0,3)}.${cpfNum.slice(3,6)}.${cpfNum.slice(6,9)}-${cpfNum.slice(9)}` : cpfRaw;
      const emailNorm = (email || 'nao_informado').toLowerCase().trim();
      const valorReais = parseFloat(valorRaw || '0') || 0;
      const valorCentavos = Math.round(valorReais * 100);
      const nomeProduto = produto || 'Pedido via Athena';
      const numeroPedido = await gerarNumeroPedido();

      // Salva aprendizado: qual pergunta levou à venda
      const ultimaPergunta = history.filter(h => h.role === 'user').slice(-3).map(h => h.content).join(' ');
      await salvarAprendizado(ultimaPergunta, nomeProduto, valorReais);

      if (numeroPedido) {
        await salvarPedidoGAS({
          order_nsu: numeroPedido, paid_amount: valorCentavos, capture_method: 'whatsapp_athena',
          customer: { name: nome, email: emailNorm, phone_number: telefone, document: cpf },
          address: { street: endereco, number: '', complement: complemento, neighborhood: bairro, city: cidade, state: estado, cep },
          items: [{ description: nomeProduto, quantity: 1, price: valorCentavos }]
        });
        await enviarTelegram(`🤖 *VENDA ATHENA!*\n\n📦 ${numeroPedido}\n👤 ${nome}\n🪪 ${cpf}\n📱 ${telefone}\n📧 ${emailNorm}\n🏠 ${endereco}${complemento && complemento !== 'sem complemento' ? ', '+complemento : ''}, ${bairro}, ${cidade}-${estado}, ${cep}\n🛒 ${nomeProduto}\n💰 R$ ${valorReais.toFixed(2)}\n📱 ${sessionId}`);
        await deleteHistory(sessionId);

        return respond(`✅ *Pedido ${numeroPedido} confirmado!*\n\n📦 ${nomeProduto}\n💰 R$ ${valorReais.toFixed(2)}\n\n🔍 *Rastreie seu pedido:*\nvitaflowoficial.com/pages/rastrear-pedido\nNúmero: *${numeroPedido}*\n\n─────────────────────\n⚠️ *AVISOS IMPORTANTES — VITAFLOW* ⚠️\n\n📹 *1. FILMAGEM DA ABERTURA — OBRIGATÓRIO*\nAo receber, grave um vídeo *contínuo e sem cortes* desde a embalagem fechada até retirar todos os itens.\n\n✅ Filme a caixa fechada antes de abrir\n✅ Não pause nem corte\n✅ Filme todos os itens ao retirar\n\n❗ *Sem o vídeo não conseguimos abrir reclamação.*\n\n─────────────────────\n📍 *2. ENDEREÇO E RECEBIMENTO*\nDeve haver uma pessoa disponível para receber.\n\n─────────────────────\n💬 Qualquer problema, fale conosco *imediatamente* com o vídeo da abertura. 💪\n— *Equipe VitaFlow* 🧡`);
      } else {
        await enviarTelegram(`⚠️ ERRO NÚMERO\n${matchDados[1]}\n${sessionId}`);
        reply = 'Dados recebidos! Em instantes você receberá a confirmação. ✅';
      }
    }

    history.push({ role: 'assistant', content: reply });
    await saveHistory(sessionId, history);
    return { statusCode: 200, headers, body: JSON.stringify({ resposta: reply, resposta2: '', resposta3: '', transferir: false, session_id: sessionId }) };

  } catch (err) {
    console.error('ERRO GERAL:', err);
    return respond('Desculpe o delay! 😊 Pode me contar o que está buscando? Estou aqui para te ajudar!');
  }
};
