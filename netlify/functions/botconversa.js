const SHOPIFY_STORE = 'vitaflow-7352';
const INFINITEPAY_TAG = 'vitaflowoficial';
const FIREBASE_URL = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxFlaN0FXFbpcC8HZ80sxnq383m5d-xTaj5cg72VcCdnYx47N_qKkiELFN5KAPmm_nb/exec';
const ATACADO_PDF = 'https://drive.google.com/uc?export=download&id=1olhYj0OW1cL0Wk0kk6-fct89EJff_1Ip';

// ── Mapa de abreviações de marcas ─────────────────────────────────────────────
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

const SYSTEM_PROMPT = `Você é a Athena, consultora especializada da VitaFlow em suplementação avançada e performance humana.

IDENTIDADE E TOM:
- Tom: consultora experiente, direta, acolhedora e VENDEDORA — você conhece os produtos profundamente e adora ajudar os clientes a atingir seus objetivos
- Idioma: português brasileiro informal e caloroso
- NUNCA mencione Paraguai ou Argentina — "entregamos para todo o Brasil"
- Apresentação: "✨ Olá! Eu sou a *Athena* 🤖💊, consultora da *VitaFlow*! 🚀\nEstou aqui para te ajudar a encontrar os melhores produtos para seus objetivos. 💪🔥\nO que você está procurando hoje?"
- NUNCA liste categorias na apresentação

INTELIGÊNCIA DE PRODUTO:
Você conhece profundamente os produtos e sabe sugerir com base no objetivo do cliente.

OBJETIVOS E STACKS RECOMENDADOS (priorize peptídeos, GH, hormônios, depois outros):
- Emagrecimento: Retatrutida, Tirzepatida, Semaglutida, CBL-514, MOTS-C, AOD-9604, Slupp-332, Ipamorelin (depois: Clembuterol, T3)
- Ganho de massa: Testosterona, Trembolona, Boldenona, Decanoato, GH, Ipamorelin, CJC-1295 (depois: outros anabolizantes)
- Recuperação/lesões: BPC-157, TB-500, Klow, Glow, GHK-Cu
- Anti-aging/longevidade: Epitalon, SS-31, MOTS-C, GHK-Cu, Tesamorelin, 5-Amino-1MQ
- Performance/resistência: GH, Testosterona, Ipamorelin, CJC-1295, Slupp-332, MOTS-C (depois: outros anabolizantes)
- Saúde mitocondrial/energia: SS-31, MOTS-C, Slupp-332, 5-Amino-1MQ, Epitalon
- Saúde hormonal: Testosterona, HCG, Anastrozol, Proviron

CANETAS ESPECIAIS (mencione sempre que relevante para o objetivo do cliente):
- 🔥 *Caneta 240UI Eurogold* (Somatropina + Ipamorelin + GHRP6) — excelente custo-benefício para metabolismo geral: hipertrofia, queima de gordura, recuperação e bem-estar
- 🔥 *Caneta 200 UI MyoMax Inibition - Alluvi* (CJC-1295 + HGH Frag + Folistatin) — excelente custo-benefício para composição corporal

PREFERÊNCIAS DE MARCA (respeite esta ordem ao sugerir):
- Retatrutida: Veltrane, ZPHC, Alluvi, Synedica (depois outras)
- Tirzepatida: Lipoless, TG, Tirzec, Gluconex, Lipoland (depois outras)
- Peptídeos: XL Peptides, Health Peptides, NeoPeptides (depois outras)
- Hormônios: Landerlan, ZPHC, Cooper Pharma (depois outras)
- GH: do mais barato para o mais caro

TIRZEPATIDA — INFORMAÇÃO CRUCIAL:
Quando cliente perguntar por "tirzepatida 15mg" — EXPLIQUE que existem dois tipos:
1. Tirzepatida 15mg REAL (apenas 15mg) — só a ZPHC tem essa opção, mais barata
2. Tirzepatida "15mg" das marcas populares (TG, Tirzec, Lipoless, Gluconex, Lipoland) = na verdade são 60mg TOTAIS (4 ampolas x 15mg cada). O cliente está pagando pelo TOTAL de 60mg, não 15mg.
Explique SEMPRE de forma didática como as dosagens funcionam:
"Esta tirzepatida tem 60mg no total. Com a dose inicial recomendada de 2,5mg/semana, este kit dura aproximadamente 24 semanas (6 meses) de tratamento — um excelente custo-benefício!"

RETATRUTIDA — INFORMAÇÃO CRUCIAL:
- Melhor custo-benefício: Veltrane 120mg (dividido em doses semanais, dura muito mais)
- Melhor qualidade: ZPHC, Alluvi, Synedica
- Cliente quer barata: ZPHC 15mg (apenas 15mg reais)
Explique sempre a relação dose/duração.

PROTOCOLOS (LIBERADO antes da venda — seja consultora, não robô):
- Dê informações detalhadas, atualizadas e relevantes sobre mecanismo de ação, benefícios e protocolo
- SEMPRE use doses MÍNIMAS eficazes (faz o produto durar mais — mencione isso)
- SEMPRE inclua disclaimer sutil: "💡 *Dica profissional:* [informação] — Como qualquer suplemento avançado, o acompanhamento profissional potencializa os resultados."
- Após explicar, sempre direcione para a venda: "Quer que eu te mostre as opções disponíveis?" ou "Posso gerar o link de pagamento agora!"
- Protocolo personalizado detalhado → direcione para vitaflowoficial.com/pages/gerador-de-protocolo

ATACADO:
- Mínimo R$3.000 em produtos da tabela especial de atacado
- Preços variam diariamente pelo câmbio
- Disponibilidade pode oscilar pelo volume e velocidade das vendas
- Envie o link da tabela: ${ATACADO_PDF}
- "Os preços e disponibilidade da tabela podem variar. Para fechar um pedido atacado, entre em contato com nosso time."
- Depois escalone para humano: [ESCALAR_HUMANO]

CUPONS E DESCONTOS:
- Cliente tem cupom: "Ótimo! Basta aplicar seu cupom diretamente no checkout em *vitaflowoficial.com* — ou se preferir, posso te conectar com um atendente para finalizar com o cupom. 😊"
- Cliente pede desconto: pergunte se é a primeira compra
  - Se SIM: "Ótimo! Me passa seu nome e CPF que vou verificar no sistema 😊"
  - Após receber: aguarde 2 segundos e responda: "Confirmado! ✅ Como é sua primeira compra na VitaFlow, você tem direito a *5% de desconto em todos os produtos* (não inclui frete). Já posso gerar seu link com o desconto aplicado! Qual produto você quer?"
  - Se NÃO: "Entendo! Por enquanto nosso programa de desconto é exclusivo para primeira compra. Mas temos ótimas promoções — quer ver nossa coleção de Promoções? 🔥"

CATÁLOGO — COMO LISTAR PRODUTOS:
- Use o catálogo fornecido no contexto
- Ordene SEMPRE do menor para o maior em mg/ui
- Formato: emoji *Nome* — R$ preço
- Emojis: 1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🔟 depois 11. 12. etc
- Linha em branco entre cada produto
- Após listar: faça uma observação consultora sobre os produtos (qual oferece melhor custo-benefício, qual é mais recomendado para o objetivo do cliente)
- NUNCA invente produtos ou preços — use SOMENTE o catálogo fornecido

BUSCA POR MARCA:
- Reconheça abreviações: cooper=Cooper Pharma, lander=Landerlan, king=King Pharma, alpha=Alpha Pharma, xl=XL Peptides, neuro=Neuroceptix, neo=NeoPeptides, alluvi=Alluvi Healthcare, euro=Eurogold, veltrane=Veltrane, lipoless=Lipoless, tirzec=Tirzec, gluconex=Gluconex, lipoland=Lipoland, tg=TG, zphc=ZPHC, health=Health Peptides, muscle=Muscle Labs, royal=Royal Pharmaceuticals

LOGÍSTICA (pedidos já realizados):
"Para acompanhar sua entrega, nosso setor de logística te atende diretamente! 📦
WhatsApp: *+44 7537 155718*
Leve: número do pedido, CPF e nome completo. Eles resolvem rapidinho! 💪"

ESCALAÇÃO: Se cliente quiser falar com humano: [ESCALAR_HUMANO]

FRETE:
- Pergunte estado e modalidade ANTES de gerar link
- Modalidades: PAC, SEDEX, Transportadora (Jadlog, J&T Express, Loggi)
- Recomende Transportadora — seguro grátis incluso (cobre apreensão/extravio). Correios NÃO têm seguro.
- Despacho: até 48h úteis após pagamento
- Prazos ESTIMADOS (a partir do despacho): Sudeste 2-5d | Sul 3-5d | Centro-Oeste 4-6d | Nordeste 5-8d | Norte 7-10d
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
- Quando tiver produto + frete: [GERAR_PAGAMENTO:nome produto + Frete ESTADO MODALIDADE:valor total]
- Só gere quando cliente confirmar que quer comprar
- Após gerar link: "Pague e me envie o comprovante! 📸 (print ou foto)"

PÓS-VENDA:
- Qualquer confirmação de pagamento ou envio de imagem = pagamento confirmado
- Colete: NOME, CPF, TELEFONE, EMAIL, ENDEREÇO, COMPLEMENTO, BAIRRO, CIDADE, ESTADO, CEP
- Cliente pode mandar tudo de uma vez em linhas separadas — extraia cada campo
- Linha com @ e ponto = email | 11 dígitos numéricos = CPF ou telefone | rua/avenida/estrada = endereço
- Email maiúsculo é válido | CPF pode ser "nao_informado" se recusar 2x | complemento "sem complemento" se não tiver
- Com TODOS dados: [DADOS_CLIENTE:nome|cpf|telefone|email|endereco|complemento|bairro|cidade|estado|cep|produto|valor]
- NUNCA diga "pedido finalizado" sem disparar [DADOS_CLIENTE] primeiro

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
    if (norm === abrev || norm.includes(abrev)) {
      return nome;
    }
  }
  return termo;
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

function formatarCatalogo(dados) {
  return dados.split('\n').filter(Boolean)
    .sort((a, b) => {
      // Extrai número mg/ui para ordenar
      const getMg = s => {
        const m = s.match(/(\d+(?:\.\d+)?)\s*(?:mg|ui|ml)/i);
        return m ? parseFloat(m[1]) : 9999;
      };
      return getMg(a) - getMg(b);
    })
    .map((linha, i) => {
      const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
      const emoji = i < 10 ? emojis[i] : `${i+1}.`;
      const [nome, preco] = linha.split('|');
      return preco ? `${emoji} *${nome.trim()}* — R$ ${preco.trim()}` : `${emoji} *${nome.trim()}*`;
    }).join('\n\n');
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

async function buscarProduto(mensagem) {
  const norm = normalizarTexto(mensagem);

  // 1. Tenta com a mensagem original
  let resultado = await buscarShopify(mensagem);
  if (resultado) return resultado;

  // 2. Expande marca e tenta
  const marcaExpandida = expandirMarca(mensagem);
  if (marcaExpandida !== mensagem) {
    resultado = await buscarShopify(marcaExpandida);
    if (resultado) return resultado;
  }

  // 3. Palavras-chave individuais (ignora stop words)
  const stopWords = new Set(['voce', 'tem', 'para', 'quero', 'qual', 'como', 'esse', 'esta', 'uma', 'que', 'com', 'dos', 'das', 'marca', 'produto', 'linha', 'sobre', 'ver', 'mostrar', 'quais', 'mais', 'tudo', 'seus', 'suas', 'minha', 'meu', 'comprar', 'preciso', 'gostaria', 'saber', 'todos', 'todas', 'valores', 'preco', 'precos', 'lista', 'tabela', 'quero', 'gostaria', 'poderia', 'me', 'de', 'do', 'da', 'os', 'as', 'um', 'no', 'na', 'por', 'ate', 'so', 'ja', 'nao', 'sim', 'ok', 'ola', 'oi', 'protocolo', 'objetivo', 'ajuda']);
  const palavras = norm.split(/\s+/).filter(p => p.length > 2 && !stopWords.has(p));

  for (const palavra of palavras) {
    const marcaExp = expandirMarca(palavra);
    resultado = await buscarShopify(marcaExp);
    if (resultado) return resultado;
  }

  return null;
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'gerar_numero', tipo: 'A' })
    });
    const data = await res.json();
    return data.order_nsu || null;
  } catch { return null; }
}

async function salvarPedidoGAS(pedido) {
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido)
    });
  } catch {}
}

async function enviarTelegram(texto) {
  try {
    await fetch('https://api.telegram.org/bot8689592582:AAEjalaa2hDQxstUVhm45CG4aZd9OiDDRXY/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const sessionId = body.phone || body.subscriber_id || body.session_id || 'default';

    console.log('MSG:', mensagem, '| SESSION:', sessionId);

    if (!mensagem && !body.type) return { statusCode: 400, headers, body: JSON.stringify({ error: 'mensagem obrigatoria' }) };

    const history = await getHistory(sessionId);
    const norm = normalizarTexto(mensagem);

    // ── MÍDIA: comprovante de pagamento ───────────────────────────────────────
    const ehMidia = ['image','video','document','audio','sticker'].includes(body.type) ||
      ['', '[image]', '[video]', '[document]', '[audio]', '[sticker]'].includes(mensagem);
    if (ehMidia && history.length > 0) {
      history.push({ role: 'user', content: 'O cliente enviou o comprovante de pagamento por imagem/mídia. Considere como pagamento confirmado e solicite os dados de entrega.' });
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 600, system: SYSTEM_PROMPT, messages: history })
      });
      const d = await res.json();
      const reply = limparTagsXML(d.content?.[0]?.text || 'Comprovante recebido! ✅ Me passa seus dados para o envio.');
      history.push({ role: 'assistant', content: reply });
      await saveHistory(sessionId, history);
      return respond(reply);
    }

    // ── ATENDENTE HUMANO ──────────────────────────────────────────────────────
    const pedidoHumano = ['atendente', 'vendedor', 'humano', 'pessoa real', 'falar com alguem', 'falar com pessoa', 'suporte humano'];
    if (pedidoHumano.some(p => norm.includes(p))) {
      await enviarTelegram(`🔔 CLIENTE QUER HUMANO\n📱 ${sessionId}\n💬 ${mensagem}`);
      await deleteHistory(sessionId);
      return { statusCode: 200, headers, body: JSON.stringify({ resposta: `Claro! Vou te transferir para um de nossos atendentes agora. 😊\nAguarde um momento!`, resposta2: '', resposta3: '', transferir: true }) };
    }

    // ── BYPASS: COLEÇÕES DO CACHE ─────────────────────────────────────────────
    const palavras = norm.split(/\s+/).filter(Boolean);
    let handleColecao = null;
    let nomeColecao = null;

    // GH isolado (não pega GHK, GHRP etc)
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
      const dados = await buscarColecaoCache(handleColecao);
      if (dados) {
        const lista = formatarCatalogo(dados);
        const total = dados.split('\n').filter(Boolean).length;
        const LIMITE = 50;
        const linhas = dados.split('\n').filter(Boolean)
          .sort((a, b) => {
            const getMg = s => { const m = s.match(/(\d+(?:\.\d+)?)\s*(?:mg|ui|ml)/i); return m ? parseFloat(m[1]) : 9999; };
            return getMg(a) - getMg(b);
          });
        const exibir = linhas.slice(0, LIMITE);
        const listaFmt = exibir.map((linha, i) => {
          const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
          const emoji = i < 10 ? emojis[i] : `${i+1}.`;
          const [nome, preco] = linha.split('|');
          return preco ? `${emoji} *${nome.trim()}* — R$ ${preco.trim()}` : `${emoji} *${nome.trim()}*`;
        }).join('\n\n');
        const rodape = total > LIMITE ? `\n\n_Mostrando ${LIMITE} de ${total}. Me diga o nome ou marca para buscar mais!_` : '';
        const reply = `Aqui estão os produtos de *${nomeColecao}* disponíveis! 💪\n\n${listaFmt}${rodape}\n\nQual te interessa? Me diz o nome ou número! 🚀`;
        history.push({ role: 'user', content: mensagem });
        history.push({ role: 'assistant', content: reply });
        await saveHistory(sessionId, history);
        console.log('CACHE HIT:', handleColecao);
        return respond(reply);
      }
    }

    // ── BYPASS: TABELA DE CATEGORIAS ──────────────────────────────────────────
    const pedindoCategorias = ['tabela de produto', 'tabela completa', 'ver categoria', 'quais categoria', 'lista de produto', 'o que voce vende', 'o que voces vendem', 'catalogo', 'o que tem', 'o que voce tem'];
    if (pedindoCategorias.some(p => norm.includes(p))) {
      const reply = `Temos as seguintes categorias! 📋\n\n1️⃣ *Mais Vendidos*\n2️⃣ *Peptídeos*\n3️⃣ *Hormônios*\n4️⃣ *GH*\n5️⃣ *Promoções*\n6️⃣ *Outros*\n\nQual quer ver? Me diz o número ou nome! 😊`;
      history.push({ role: 'user', content: mensagem });
      history.push({ role: 'assistant', content: reply });
      await saveHistory(sessionId, history);
      return respond(reply);
    }

    // ── BUSCA DE PRODUTO NO SHOPIFY ───────────────────────────────────────────
    // Detecta se é pergunta de contexto (não busca produto)
    const ehSaudacao = ['bom dia', 'boa tarde', 'boa noite', 'oi', 'ola', 'opa', 'eai', 'e ai', 'hey', 'hi', 'hello', 'tudo bem', 'tudo bom', 'como vai', 'bom'].some(p => norm === p || norm.startsWith(p + ' ') || norm.startsWith(p + '!'));

    const ehContextual = history.length > 0 && (
      /^[0-9]{1,2}$/.test(norm) ||
      ['qual', 'quanto', 'como usar', 'diferenca', 'melhor', 'pior', 'mais barat', 'mais caro', 'quero esse', 'quero essa', 'pode ser', 'pagar', 'sim', 'nao', 'ok', 'combinado', 'fechado', 'paguei', 'fiz', 'feito', 'confirmado', 'obrigado', 'obrigada', 'valeu', 'entendi', 'certo', 'perfeito', 'exato', 'isso mesmo', 'esse mesmo', 'gerar link', 'gerar pagamento', 'quero comprar', 'fecha', 'bora', 'vai', 'pode'].some(p => norm.includes(p))
    );

    // Detecta perguntas de protocolo/objetivo (vai para Sonnet com contexto)
    const ehProtocolo = ['protocolo', 'como usar', 'dosagem', 'como tomar', 'como aplicar', 'efeito', 'para que serve', 'beneficio', 'funciona', 'objetivo', 'emagre', 'emagrecer', 'perder peso', 'ganhar massa', 'hipertrofia', 'anti-aging', 'envelhecimento', 'performance', 'recuperacao', 'stack', 'ciclo', 'combinar', 'junto com'].some(p => norm.includes(p));

    let contextoProdutos = '';

    if (!ehSaudacao && !ehContextual && !ehProtocolo) {
      const produtos = await buscarProduto(mensagem);
      console.log('BUSCA:', produtos ? 'encontrou' : 'não encontrou');

      if (produtos) {
        const linhas = produtos.split('\n').filter(Boolean).sort((a, b) => {
          const getMg = s => { const m = s.match(/(\d+(?:\.\d+)?)\s*(?:mg|ui|ml)/i); return m ? parseFloat(m[1]) : 9999; };
          return getMg(a) - getMg(b);
        });
        const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
        const lista = linhas.map((linha, i) => {
          const [nome, preco] = linha.split('|');
          const emoji = i < 10 ? emojis[i] : `${i+1}.`;
          return preco ? `${emoji} *${nome.trim()}* — R$ ${preco.trim()}` : `${emoji} *${nome.trim()}*`;
        }).join('\n\n');
        contextoProdutos = `\n\nCATÁLOGO ENCONTRADO (use estes dados para responder):\n${lista}`;
      } else {
        contextoProdutos = `\n\nCATÁLOGO: Nenhum produto encontrado para "${mensagem}". Informe ao cliente que não encontrou e sugira ver categorias ou acessar vitaflowoficial.com. NÃO invente produtos.`;
      }
    }

    // ── SONNET — responde com inteligência ───────────────────────────────────
    history.push({ role: 'user', content: mensagem });

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: SYSTEM_PROMPT + contextoProdutos,
        messages: history
      })
    });

    const claudeData = await claudeRes.json();
    if (claudeData.error || !claudeData.content) {
      console.error('ERRO CLAUDE:', JSON.stringify(claudeData));
      await new Promise(r => setTimeout(r, 1000));
      return respond('Desculpe, tive um problema técnico. Pode repetir?');
    }

    let reply = limparTagsXML(claudeData.content[0].text || '');
    console.log('SONNET:', reply.substring(0, 150));

    // Escalar para humano
    const escalar = reply.includes('[ESCALAR_HUMANO]');
    reply = reply.replace('[ESCALAR_HUMANO]', '').trim();
    if (escalar) {
      await enviarTelegram(`🔔 CLIENTE QUER HUMANO\n📱 ${sessionId}\n💬 ${mensagem}`);
      await deleteHistory(sessionId);
      return { statusCode: 200, headers, body: JSON.stringify({ resposta: reply || 'Vou te transferir para um atendente! 😊', resposta2: '', resposta3: '', transferir: true }) };
    }

    // Gerar link de pagamento
    const matchPag = reply.match(/\[GERAR_PAGAMENTO:(.+?):(\d+\.?\d*)\]/);
    if (matchPag) {
      reply = reply.replace(matchPag[0], '').trim();
      const nomeProd = matchPag[1];
      const valor = parseFloat(matchPag[2]);
      const link = await gerarLinkInfinitePay(nomeProd, valor);

      // Salva pedido pendente no Firebase
      try {
        const key = `pending_${sessionId.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const subscriberId = body.subscriber_id || body.id || null;
        await fetch(`${FIREBASE_URL}/vitaflow_pending_orders/${key}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: sessionId, subscriber_id: subscriberId, produto: nomeProd, valor, ts: Date.now() })
        });
      } catch {}

      reply += link
        ? `\n\n💳 *Link de pagamento:*\n${link}\n\nPague e me envie o comprovante! 📸 _(print ou foto)_`
        : `\n\nAcesse: vitaflowoficial.com`;
      history.push({ role: 'assistant', content: reply });
      await saveHistory(sessionId, history);
      return respond(reply);
    }

    // Processar dados pós-venda
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

      if (numeroPedido) {
        await salvarPedidoGAS({
          order_nsu: numeroPedido, paid_amount: valorCentavos, capture_method: 'whatsapp_athena',
          customer: { name: nome, email: emailNorm, phone_number: telefone, document: cpf },
          address: { street: endereco, number: '', complement: complemento, neighborhood: bairro, city: cidade, state: estado, cep },
          items: [{ description: nomeProduto, quantity: 1, price: valorCentavos }]
        });
        await enviarTelegram(`🤖 *VENDA ATHENA!*\n\n📦 ${numeroPedido}\n👤 ${nome}\n🪪 ${cpf}\n📱 ${telefone}\n📧 ${emailNorm}\n🏠 ${endereco}${complemento && complemento !== 'sem complemento' ? ', '+complemento : ''}, ${bairro}, ${cidade}-${estado}, ${cep}\n🛒 ${nomeProduto}\n💰 R$ ${valorReais.toFixed(2)}\n📱 ${sessionId}`);
        await deleteHistory(sessionId);

        const msgConfirmacao = `✅ *Pedido ${numeroPedido} confirmado!*\n\n📦 ${nomeProduto}\n💰 R$ ${valorReais.toFixed(2)}\n\n🔍 *Rastreie seu pedido:*\nvitaflowoficial.com/pages/rastrear-pedido\nNúmero: *${numeroPedido}*\n\n─────────────────────\n⚠️ *AVISOS IMPORTANTES — VITAFLOW* ⚠️\n\n📹 *1. FILMAGEM DA ABERTURA — OBRIGATÓRIO*\nAo receber, grave um vídeo *contínuo e sem cortes* desde a embalagem fechada até retirar todos os itens.\n\n*Por que?* Já identificamos casos de entregadores que retiraram produtos e lacraram a caixa sem deixar vestígios. O vídeo é a única prova possível.\n\n✅ Filme a caixa fechada antes de abrir\n✅ Não pause nem corte\n✅ Filme todos os itens ao retirar\n\n❗ *Sem o vídeo não conseguimos abrir reclamação.* A responsabilidade pela filmagem é do cliente.\n\n─────────────────────\n📍 *2. ENDEREÇO E RECEBIMENTO*\nDeve haver uma pessoa disponível para receber. ❗ *A responsabilidade pelo endereço correto e recebimento é do cliente.*\n\n─────────────────────\n⚠️ *3. DISPONIBILIDADE DE ESTOQUE*\nDevido ao alto volume de vendas, o estoque pode oscilar. Se algum item estiver indisponível, faremos substituição equivalente ou superior. Para não receber substitutos, entre em contato antes do despacho.\n\n─────────────────────\n💬 Qualquer problema, fale conosco *imediatamente* com o vídeo da abertura. 💪\n— *Equipe VitaFlow* 🧡`;

        return respond(msgConfirmacao);
      } else {
        reply = 'Dados recebidos! Em instantes você receberá a confirmação. ✅';
        await enviarTelegram(`⚠️ ERRO NÚMERO\n${matchDados[1]}\n${sessionId}`);
      }
    }

    history.push({ role: 'assistant', content: reply });
    await saveHistory(sessionId, history);

    return { statusCode: 200, headers, body: JSON.stringify({ resposta: reply, resposta2: '', resposta3: '', transferir: escalar, session_id: sessionId }) };

  } catch (err) {
    console.error('ERRO GERAL:', err);
    return respond('Desculpe, tive um problema técnico. Tente novamente!');
  }
};
