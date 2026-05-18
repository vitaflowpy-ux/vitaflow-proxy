const SHOPIFY_STORE = 'vitaflow-7352';
const INFINITEPAY_TAG = 'vitaflowoficial';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxFlaN0FXFbpcC8HZ80sxnq383m5d-xTaj5cg72VcCdnYx47N_qKkiELFN5KAPmm_nb/exec';

const SYSTEM_PROMPT = `Você é a Athena, assistente virtual da VitaFlow, especializada em suplementação avançada e performance humana.

IDENTIDADE:
- Tom: profissional, direto e acolhedor — como um consultor de confiança, não um robô
- Idioma: português brasileiro
- NUNCA mencione que atende Paraguai ou Argentina — se perguntado sobre entregas, diga apenas "entregamos para todo o Brasil"
- Quando se apresentar, use emojis chamativos e uma saudação animada. Exemplo:
  "✨ Olá! Eu sou a *Athena* 🤖💊, assistente virtual da *VitaFlow*! 🚀
  Estou aqui para te ajudar com tudo sobre nossos produtos de suplementação avançada e performance humana. 💪🔥
  O que você está procurando hoje?"

CAPACIDADES:
- Você consulta o catálogo atualizado da loja em tempo real
- Use sempre os dados reais do catálogo para responder sobre preços e disponibilidade
- Se um produto não aparecer no catálogo consultado, diga que não encontrou e sugira acessar vitaflowoficial.com

APRESENTAÇÃO DE PRODUTOS:
- Liste APENAS produtos disponíveis — produtos indisponíveis não devem aparecer na lista
- Quando houver muitas opções, agrupe por dosagem do menor para o maior
- Liste TODOS os produtos disponíveis retornados, sem omitir nenhum
- Nunca crie rankings ou use termos como "mais procurado", "mais vendido", "recomendado"
- Formato numerado com emojis numéricos: 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 e depois 11. 12. 13... para os seguintes
- Ordene sempre do menor para o maior por dosagem (mg/ui/ml). Se a dosagem for igual, ordene pelo menor preço
- Liste TODOS os produtos sem limite — nunca corte a lista
- Não mencione "Disponível" — se está na lista, está disponível
- Se um produto estiver indisponível, simplesmente não o liste e sugira uma alternativa similar disponível se houver

TABELA DE PREÇOS / CATEGORIAS:
- Quando o cliente pedir tabela completa, lista de produtos ou mencionar uma categoria (Mais Vendidos, Peptídeos, Hormônios, GH, Promoções, Outros), liste IMEDIATAMENTE todos os produtos disponíveis dessa categoria
- NUNCA pergunte o objetivo do cliente antes de mostrar a lista — mostre sempre direto
- NUNCA pergunte qual categoria o cliente quer se ele já mencionou uma — busque e liste imediatamente
- Se o cliente pedir "lista completa" sem especificar categoria, pergunte qual das categorias quer ver: Mais Vendidos • Peptídeos • Hormônios • GH • Promoções • Outros
- Nunca diga que não trabalha com tabela — sempre ofereça a lista da categoria escolhida

PROTOCOLOS E DOSAGENS:
- Quando o cliente perguntar sobre como usar um produto, sempre indique a dosagem mínima eficaz
- O objetivo é que o produto renda o maior tempo possível para o cliente
- Seja direto e prático, como um consultor experiente

FRETE E ENTREGA:
- Antes de gerar o link de pagamento, SEMPRE pergunte o estado e modalidade de envio
- Modalidades disponíveis: PAC, SEDEX e Transportadora (Jadlog, J&T Express ou Loggi)
- Recomende sempre a Transportadora — é mais seguro e tem seguro grátis incluso
- Seguro cobre: apreensão ou extravio → fazemos reenvio imediato ou estorno total
- Correios (PAC/SEDEX) NÃO possuem seguro
- Prazo de despacho: até 48 horas úteis após confirmação do pagamento
- Prazos ESTIMADOS de entrega por região (contados a partir do despacho, que ocorre em até 48h úteis após o pagamento): Sudeste 2-5 dias | Sul 3-5 dias | Centro-Oeste 4-6 dias | Nordeste 5-8 dias | Norte 7-10 dias
- SEMPRE use a expressão "prazo estimado" ao mencionar prazos de entrega e SEMPRE informe que esse prazo começa a contar após o despacho
- Tabela de frete:
  RJ: PAC R$45 | SEDEX R$60 | Transp. R$70
  SP: PAC R$45 | SEDEX R$60 | Transp. R$55
  MG: PAC R$45 | SEDEX R$70 | Transp. R$70
  ES: PAC R$45 | SEDEX R$70 | Transp. R$70
  DF: PAC R$45 | SEDEX R$60 | Transp. R$72
  PR: PAC R$45 | SEDEX R$60 | Transp. R$70
  SC: PAC R$45 | SEDEX R$70 | Transp. R$70
  RS: PAC R$45 | SEDEX R$70 | Transp. R$100
  GO: PAC R$45 | SEDEX R$70 | Transp. R$76
  MS: PAC R$45 | SEDEX R$85 | Transp. R$80
  BA: PAC R$58 | SEDEX R$90 | Transp. R$80
  MT: PAC R$58 | SEDEX R$90 | Transp. R$75
  CE: PAC R$72 | SEDEX R$105 | Transp. R$80
  PA: PAC R$87 | SEDEX R$105 | Transp. R$110
  PE: PAC R$87 | SEDEX R$115 | Transp. R$90
  TO: PAC R$87 | SEDEX R$105 | Transp. R$110
  MA: PAC R$100 | SEDEX R$125 | Transp. R$90
  PB: PAC R$100 | SEDEX R$125 | Transp. R$100
  RN: PAC R$100 | SEDEX R$125 | Transp. R$100
  PI: PAC R$100 | SEDEX R$125 | Transp. R$110
  AL: PAC R$100 | SEDEX R$125 | Transp. R$90
  SE: PAC R$100 | SEDEX R$125 | Transp. R$90
  AM: PAC R$100 | SEDEX R$125 | Transp. R$110
  RO: PAC R$100 | SEDEX R$110 | Transp. R$170
  AP: PAC R$100 | SEDEX R$125 | Transp. R$120
  RR: PAC R$130 | SEDEX R$110
  AC: PAC R$130 | SEDEX R$110 | Transp. R$150

GERAÇÃO DE LINK DE PAGAMENTO:
- SEMPRE pergunte o estado e modalidade de frete ANTES de gerar o link
- Some o frete ao valor do produto
- Quando tiver produto + frete definidos, responda EXATAMENTE neste formato:
  [GERAR_PAGAMENTO:nome do produto + Frete:valor total com frete]
  Exemplo: [GERAR_PAGAMENTO:BPC-157 5mg + Frete RJ PAC:134.90]
- Só gere o link quando o cliente confirmar claramente que quer comprar

FLUXO PÓS-VENDA:
- Após gerar o link de pagamento, pergunte se o cliente conseguiu pagar
- Quando o cliente disser que pagou, peça o comprovante de pagamento antes de prosseguir
- Somente após receber o comprovante (print, foto ou confirmação com dados do Pix), solicite os dados para envio
- Colete obrigatoriamente: NOME COMPLETO, CPF, TELEFONE, E-MAIL, ENDEREÇO (rua e número), COMPLEMENTO, BAIRRO, CIDADE, ESTADO, CEP
- O cliente pode mandar os dados em várias mensagens separadas — vá acumulando no histórico
- E-MAIL: aceite qualquer formato incluindo letras maiúsculas (ex: "Professor.thiagopena@gmail.com" é um e-mail válido). Nunca peça o e-mail mais de uma vez — se o cliente já forneceu algo parecido com um e-mail (com @ e ponto), aceite. Se o cliente se recusar a fornecer na segunda solicitação, use "nao_informado" e prossiga
- CPF: se o cliente se recusar a fornecer na segunda solicitação, use "nao_informado" e prossiga
- Quando tiver todos os campos obrigatórios (e-mail pode ser "nao_informado"), responda EXATAMENTE neste formato em uma linha ANTES de qualquer outra mensagem:
  [DADOS_CLIENTE:nome|cpf|telefone|email|endereco|complemento|bairro|cidade|estado|cep|produto|valor]
- NUNCA encerre o fluxo pós-venda nem diga "pedido finalizado" sem ter disparado o [DADOS_CLIENTE] primeiro
- Se complemento não foi informado, use "sem complemento" no campo
- Em "produto" coloque o nome completo do produto comprado. Em "valor" coloque o valor total pago (ex: 115.00)
- Exemplo: [DADOS_CLIENTE:João Silva|123.456.789-00|21999999999|joao@email.com|Rua A 100|Apto 201|Centro|Rio de Janeiro|RJ|20000-000|BPC-157 5mg - XL Peptides + Frete RJ PAC|115.00]

REGRAS:
- Nunca invente preços ou disponibilidade — use apenas os dados do catálogo
- Se o cliente quiser falar com humano, diga que vai transferir e encerre com: [ESCALAR_HUMANO]
- Não discuta assuntos fora do escopo da VitaFlow
- LOGÍSTICA: se o cliente perguntar qualquer coisa sobre entrega, rastreio, prazo, demora ou status de um pedido já realizado, responda EXATAMENTE assim (substituindo os dados do cliente):
  "Para questões de entrega, nosso setor de logística vai te atender diretamente! 📦\n\nEntre em contato pelo WhatsApp: *+44 7537 155718*\n\nJá leve essas informações para agilizar:\n📦 Número do pedido: *[número informado pelo cliente ou "seu número de pedido"]*\n🪪 CPF: *[CPF informado ou "seu CPF"]*\n👤 Nome completo: *[nome informado ou "seu nome completo"]*\n\nEles vão resolver rapidinho! 💪"

SITE: vitaflowoficial.com
INSTAGRAM: @vitaflow.py`;

const sessionHistory = {};

// FIX 1: Remove quaisquer tags XML que o modelo possa ter incluído na resposta
function limparTagsXML(texto) {
  return texto.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '').replace(/<[^>]+>/g, '').trim();
}

// FIX 2: Normaliza acentos para busca no Shopify (GraphQL não lida bem com caracteres especiais)
function normalizarParaBusca(termo) {
  return termo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos
    .replace(/['"]/g, '')            // remove aspas que quebram a query GraphQL
    .trim();
}

async function extrairTermoBusca(mensagem) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        system: 'Você é um especialista em produtos farmacêuticos e suplementos esportivos. Extraia o nome do produto mencionado pelo cliente, corrigindo erros de digitação e expandindo abreviações comuns (ex: "reta" = "retatrutida", "sema" = "semaglutida", "bpc" = "BPC-157", "tb500" = "TB-500", "agua bacteriostatica" = "agua bacteriostatica", "água bacteriostática" = "agua bacteriostatica", "bacteriostatica" = "agua bacteriostatica"). Considere também insumos de reconstituição como produtos válidos (água bacteriostática, água para injeção, diluente). Responda APENAS com o nome do produto corrigido e completo, sem explicações, sem tags XML, sem formatação. Se não houver produto específico, responda "nenhum".',
        messages: [{ role: 'user', content: mensagem }]
      })
    });
    const data = await res.json();
    // FIX 1 aplicado aqui também — caso o Haiku retorne tags XML
    const termo = limparTagsXML(data.content?.[0]?.text?.trim() || 'nenhum');
    return termo.toLowerCase() === 'nenhum' ? null : termo;
  } catch (err) {
    console.error('Erro ao extrair termo:', err);
    return null;
  }
}

async function buscarPorColecao(handle) {
  try {
    const res = await fetch(`https://${SHOPIFY_STORE}.myshopify.com/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({
        query: `{ collectionByHandle(handle: "${handle}") { title products(first: 50) { edges { node { title availableForSale variants(first: 5) { edges { node { title price { amount } availableForSale } } } } } } } }`
      })
    });
    const data = await res.json();
    const produtos = data?.data?.collectionByHandle?.products?.edges;
    if (!produtos || produtos.length === 0) return null;
    return formatarProdutos(produtos);
  } catch (err) {
    console.error('Erro busca coleção:', err);
    return null;
  }
}

async function buscarProdutos(termo) {
  try {
    // Tenta primeiro com termo normalizado (sem acento)
    const termoNormalizado = normalizarParaBusca(termo);
    let produtos = await _buscarGraphQL(termoNormalizado);

    // Se não achou, tenta com o termo original (com acento)
    if (!produtos && termoNormalizado !== termo) {
      produtos = await _buscarGraphQL(termo.replace(/['"]/g, '').trim());
    }

    return produtos;
  } catch (err) {
    console.error('Erro Shopify:', err);
    return null;
  }
}

async function _buscarGraphQL(termo) {
  try {
    const res = await fetch(`https://${SHOPIFY_STORE}.myshopify.com/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({
        query: `{ products(first: 50, query: "${termo}") { edges { node { title availableForSale variants(first: 5) { edges { node { title price { amount } availableForSale } } } } } } }`
      })
    });
    const data = await res.json();
    const produtos = data?.data?.products?.edges;
    if (!produtos || produtos.length === 0) return null;
    return formatarProdutos(produtos);
  } catch (err) {
    return null;
  }
}

// Função auxiliar extraída para evitar duplicação
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
  } catch (err) {
    console.error('Erro InfinitePay:', err);
    return null;
  }
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
  } catch (err) {
    console.error('Erro ao gerar número:', err);
    return null;
  }
}

async function salvarPedidoGAS(pedido) {
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido)
    });
  } catch (err) {
    console.error('Erro ao salvar pedido:', err);
  }
}

async function enviarTelegram(texto) {
  try {
    await fetch('https://api.telegram.org/bot8689592582:AAEjalaa2hDQxstUVhm45CG4aZd9OiDDRXY/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: '8660563352', text: texto })
    });
  } catch (err) {
    console.error('Erro Telegram:', err);
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    console.log('BODY RECEBIDO:', JSON.stringify(body));

    const mensagem = body.mensagem || body.message || body.texto || '';
    const sessionId = body.phone || body.subscriber_id || body.session_id || 'default';

    console.log('MENSAGEM:', mensagem, '| SESSION:', sessionId);

    if (!mensagem) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Campo mensagem obrigatorio' }) };
    }

    if (!sessionHistory[sessionId]) sessionHistory[sessionId] = [];
    const history = sessionHistory[sessionId];

    // Detecta coleção ou busca por produto
    const mapaColecoes = {
      'mais vendidos': 'mais-vendidos',
      'mais vendido': 'mais-vendidos',
      'top': 'mais-vendidos',
      'peptideo': 'peptideos',
      'peptideos': 'peptideos',
      'hormonio': 'hormonios',
      'hormonios': 'hormonios',
      'gh': 'gh',
      'growth': 'gh',
      'promocao': 'promocoes',
      'promocoes': 'promocoes',
      'promo': 'promocoes',
      'oferta': 'promocoes',
      'desconto': 'promocoes',
      'outros': 'outros',
      'outro': 'outros',
    };
    const mensagemLower = mensagem.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // remove acentos
      .replace(/ç/g, 'c');                                 // ç → c (antes do normalize não pega)

    let colecaoDetectada = null;
    let handleColecao = null;
    for (const [palavra, handle] of Object.entries(mapaColecoes)) {
      if (mensagemLower.includes(palavra)) {
        colecaoDetectada = palavra;
        handleColecao = handle;
        break;
      }
    }

    // Detecção por histórico desativada — causava contaminação com respostas anteriores

    let contextoProdutos = '';
    if (colecaoDetectada && handleColecao) {
      console.log('BUSCANDO COLECAO:', handleColecao);
      const produtos = await buscarPorColecao(handleColecao);
      if (produtos) {
        // BYPASS SONNET: monta resposta direto para coleções — mais rápido, sem timeout
        const nomesColecao = {
          'mais-vendidos': 'MAIS VENDIDOS', 'peptideos': 'PEPTÍDEOS',
          'hormonios': 'HORMÔNIOS', 'gh': 'GH', 'promocoes': 'PROMOÇÕES', 'outros': 'OUTROS'
        };
        const nomeExibicao = nomesColecao[handleColecao] || handleColecao.toUpperCase();
        const linhas = produtos.split('\n').filter(Boolean);
        const listaFormatada = linhas.map((linha, i) => {
          const emojisNum = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
          const emoji = i < 10 ? emojisNum[i] : `${i+1}.`;
          const partes = linha.split('|');
          const nome = partes[0]?.trim();
          const preco = partes[1]?.trim();
          return preco ? `${emoji} *${nome}* — R$ ${preco}` : `${emoji} *${nome}*`;
        }).join('\n');

        const reply = `Aqui estão todos os produtos de *${nomeExibicao}* disponíveis! 💪\n\n${listaFormatada}\n\nQual te interessa? Posso passar mais detalhes, protocolo de uso ou gerar o link de pagamento! 🚀`;
        history.push({ role: 'user', content: mensagem });
        history.push({ role: 'assistant', content: reply });
        if (history.length > 10) history.splice(0, history.length - 10);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ resposta: reply, transferir: false, session_id: sessionId })
        };
      }
    } else {
      const termoBusca = await extrairTermoBusca(mensagem);
      console.log('TERMO DE BUSCA:', termoBusca);
      if (termoBusca) {
        const produtos = await buscarProdutos(termoBusca);
        if (produtos) {
          contextoProdutos = `\n\nRESULTADO DA BUSCA NO CATALOGO para "${termoBusca}":\n${produtos}`;
          console.log('PRODUTOS ENCONTRADOS:', produtos.substring(0, 200));
        } else {
          contextoProdutos = `\n\nRESULTADO DA BUSCA NO CATALOGO para "${termoBusca}": nenhum produto encontrado.`;
          console.log('NENHUM PRODUTO ENCONTRADO para:', termoBusca);
        }
      }
    }

    history.push({ role: 'user', content: mensagem });
    if (history.length > 10) history.splice(0, history.length - 10);

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: SYSTEM_PROMPT + contextoProdutos,
        messages: history
      })
    });

    const claudeData = await claudeRes.json();
    // FIX 1 aplicado na resposta principal do Sonnet
    let reply = limparTagsXML(claudeData.content?.[0]?.text || 'Desculpe, não consegui processar sua mensagem.');
    console.log('RESPOSTA CLAUDE:', reply.substring(0, 200));

    history.push({ role: 'assistant', content: reply });

    // Escalar para humano
    const escalar = reply.includes('[ESCALAR_HUMANO]');
    reply = reply.replace('[ESCALAR_HUMANO]', '').trim();
    if (escalar) {
      await enviarTelegram(`🔔 CLIENTE QUER FALAR COM HUMANO\n\n📱 Número: ${sessionId}\n💬 Última mensagem: ${mensagem}`);
      delete sessionHistory[sessionId];
    }

    // Gerar link de pagamento
    const matchPagamento = reply.match(/\[GERAR_PAGAMENTO:(.+?):(\d+\.?\d*)\]/);
    if (matchPagamento) {
      const nomeProduto = matchPagamento[1];
      const valor = parseFloat(matchPagamento[2]);
      reply = reply.replace(matchPagamento[0], '').trim();
      const link = await gerarLinkInfinitePay(nomeProduto, valor);
      if (link) {
        reply += `\n\n💳 *Link de pagamento:*\n${link}\n\nPague com Pix ou cartão em até 12x. ✅`;
      } else {
        reply += `\n\nPara finalizar sua compra acesse: vitaflowoficial.com`;
      }
    }

    // Processar dados do cliente pós-venda
    const matchDados = reply.match(/\[DADOS_CLIENTE:(.+?)\]/);
    if (matchDados) {
      reply = reply.replace(matchDados[0], '').trim();
      const partes = matchDados[1].split('|');
      const [nome, cpfRaw, telefone, email, endereco, complemento, bairro, cidade, estado, cep, produto, valorRaw] = partes;

      // Formata CPF: 12345678900 → 123.456.789-00
      const cpfNumeros = (cpfRaw || '').replace(/\D/g, '');
      const cpf = cpfNumeros.length === 11
        ? `${cpfNumeros.slice(0,3)}.${cpfNumeros.slice(3,6)}.${cpfNumeros.slice(6,9)}-${cpfNumeros.slice(9)}`
        : cpfRaw;

      // Normaliza e-mail para minúsculas
      const emailNormalizado = (email || 'nao_informado').toLowerCase().trim();

      // Valor real em centavos para o GAS
      const valorReais = parseFloat(valorRaw || '0') || 0;
      const valorCentavos = Math.round(valorReais * 100);
      const nomeProduto = produto || 'Pedido via Athena WhatsApp';

      const numeroPedido = await gerarNumeroPedido();

      if (numeroPedido) {
        await salvarPedidoGAS({
          order_nsu: numeroPedido,
          paid_amount: valorCentavos,
          capture_method: 'whatsapp_athena',
          customer: { name: nome, email: emailNormalizado, phone_number: telefone, document: cpf },
          address: { street: endereco, number: '', complement: complemento, neighborhood: bairro, city: cidade, state: estado, cep },
          items: [{ description: nomeProduto, quantity: 1, price: valorCentavos }]
        });

        await enviarTelegram(
          `🤖 *VENDA ATHENA!*\n\n📦 Pedido: ${numeroPedido}\n👤 Nome: ${nome}\n🪪 CPF: ${cpf}\n📱 Tel: ${telefone}\n📧 Email: ${emailNormalizado}\n🏠 End: ${endereco}${complemento && complemento !== 'sem complemento' ? ', ' + complemento : ''}\n🏘️ Bairro: ${bairro}\n🏙️ ${cidade} - ${estado}\n📮 CEP: ${cep}\n🛒 Produto: ${nomeProduto}\n💰 Valor: R$ ${valorReais.toFixed(2)}\n📱 WhatsApp: ${sessionId}`
        );

        const msgConfirmacao = `✅ *Pedido ${numeroPedido} confirmado!*\n\n📦 ${nomeProduto}\n💰 R$ ${valorReais.toFixed(2)}\n\n🔍 *Rastreie seu pedido em tempo real:*\nvitaflowoficial.com/pages/rastrear-pedido\nNúmero: *${numeroPedido}*\n\n─────────────────────\n⚠️ *AVISOS IMPORTANTES — VITAFLOW* ⚠️\n\n📹 *1. FILMAGEM DA ABERTURA — OBRIGATÓRIO*\nAo receber sua encomenda, grave um vídeo *contínuo e sem cortes*, desde a embalagem ainda fechada até a retirada de todos os itens.\n\n*Por que isso é necessário?*\nJá identificamos casos em que entregadores retiraram produtos da caixa e a lacraram novamente de forma perfeita, sem deixar nenhum vestígio visível. Sem o vídeo, não há como provar o que aconteceu — nem para nós, nem para a transportadora.\n\n✅ Filme a caixa fechada antes de abrir\n✅ Não pause nem corte o vídeo em nenhum momento\n✅ Filme todos os itens ao retirar da caixa\n\n❗ *A responsabilidade pela filmagem é do cliente.* Sem o vídeo, não conseguimos abrir reclamação junto à transportadora e não teremos como te ajudar, independentemente da situação.\n\n─────────────────────\n📍 *2. ENDEREÇO E RECEBIMENTO*\nConfira todos os dados do endereço antes de finalizar. Deve haver *uma pessoa disponível* no local para receber o pedido pessoalmente.\n\n❗ *A responsabilidade pelo endereço correto e pela presença de alguém para receber é do cliente.* Não solicite deixar o pacote sem ninguém — já tivemos casos em que o cliente alegou não ter recebido, porém a transportadora apresentou comprovante de entrega. Nessa situação, não temos como ajudar.\n\n─────────────────────\n⚠️ *3. DISPONIBILIDADE DE ESTOQUE*\nDevido ao alto volume de vendas no atacado, o estoque pode sofrer oscilações em tempo real. Caso algum item esteja indisponível, faremos a substituição por produto equivalente ou de valor superior. Se preferir não receber substitutos, entre em contato com nosso suporte antes do despacho da encomenda.\n\n─────────────────────\n💬 Teve algum problema? Fale conosco *imediatamente* pelo WhatsApp, envie o vídeo da abertura e os detalhes do pedido. Faremos tudo ao nosso alcance para resolver! 💪\n\n— *Equipe VitaFlow* 🧡`;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            resposta: msgConfirmacao,
            transferir: false,
            session_id: sessionId
          })
        };
      } else {
        reply = `Dados recebidos! Em instantes você receberá a confirmação do pedido. ✅`;
        await enviarTelegram(`⚠️ ERRO AO GERAR NÚMERO\nDados: ${matchDados[1]}\nWhatsApp: ${sessionId}`);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ resposta: reply, transferir: escalar, session_id: sessionId })
    };

  } catch (error) {
    console.error('Erro geral:', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        resposta: 'Desculpe, tive um problema técnico. Tente novamente em instantes.',
        transferir: false
      })
    };
  }
};
