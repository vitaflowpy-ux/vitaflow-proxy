// botconversa.js — VitaFlow Athena v4.2 — menu-driven + Promoção Relâmpago + reconhecimento por texto

// v96 (08/10/2026 — VIGIA, pedido do Thiago: "agora eu vou ter que ficar tomando conta de todas as conversas da athena?").
//   Toda resposta passa por vigiaAthena(): se a Athena/Stella respondeu algo suspeito ("Não encontrei *…*", "Não tenho *…*",
//   "não reconhecido", "isso não parece", "Opção inválida"), se o cliente repetiu a mesma mensagem, pediu atendente/pessoa ou
//   reclamou, vai um alerta no Telegram (mesmo chat dos outros avisos) com a mensagem do cliente e a resposta. No máximo
//   1 alerta por cliente a cada 20 min. Não muda nenhuma resposta ao cliente; se o Telegram falhar, nada acontece.
// v95 (08/10/2026 — leitura de 69 conversas reais da Athena, 27/09 a 08/10, pedida pelo Thiago: "vc deveria ler todas as
//   conversas da athena e otimizá-la").
//   1) MODO ESQUECIDO: a sessão guardava o último modo para sempre (GDF voltou dias depois ainda "dentro" do atacado; Caio,
//      depois de perguntar do atacado, teve "Masteron" buscado na tabela de atacado). Agora, 6 h sem falar → os modos de
//      navegação/consulta voltam ao MENU. Carrinho preservado. Não mexe em pagamento/coleta de dados, no checkout do varejo
//      nem no atacado com pedido montado.
//   2) RASTREIO: mostrou o pedido → sai do rastreio (antes "obrigado", "não chegou", "acione a logística" viravam
//      "Não encontrei nenhum pedido"). Mensagem sem nº de pedido / CPF / e-mail / sequência de números dentro do rastreio
//      não é consulta: segue o caminho normal (IA, produto, menu).
//   3) PARCELAMENTO: depois da simulação, "2", "3x", "em 4 vezes"… geram o link (as parcelas são escolhidas no link). Antes,
//      "2" (= 2x) era "voltar ao menu" e o cliente saía (Thaynan, 08/10, R$ 1.851). A simulação agora diz "*menu* para voltar".
//   4) ATACADO: frase de 4+ palavras que não achou produto vai para a IA em vez de "Não encontrei *<frase inteira>*".
//   5) CONSULTA DE FRETE: o estado é lido como no checkout (sigla ou nome por extenso). "Por transportadora" não vira "PO".
// v94 (08/10/2026 — conversa real "GDF LHP", 20:02, já dentro do atacado: "Tem tabela em atacado" → "Não encontrei *Tem tabela em
//   atacado* na nossa tabela de atacado"). Dentro do atacado, mensagem que não achou produto e fala de TABELA / LISTA / CATÁLOGO /
//   PDF (até 16 palavras) recebe o link da tabela em PDF — a mesma resposta de quando o cliente digita "tabela". A busca de produto
//   continua vindo primeiro.
// v93 (08/10/2026 — conversa real do Gustavo, 19:40: "vi que tem promoção de primobolan e gostaria de aproveitar o frete grátis
//   que ganhei do primeiro pedido" → a Athena respondeu "Não tenho Primobolan disponível" e listou 10 Primobolans).
//   1) Mensagem que CITA a promoção relâmpago ativa ("promo"/"relâmpago"/"oferta" + o produto dela, ou sem outro produto)
//      → abre a lista da relâmpago (igual à opção 8). Se a frase traz outro assunto junto (pedido anterior, frete...),
//      quem responde é a IA, que já recebe a relâmpago no contexto (contextoPromo).
//   2) resolverReconhecido: o aviso "Não tenho X (com Y) disponível" só sai quando TODAS as palavras fortes existem no
//      catálogo (pedido de marca/dose que não existe junto). Frase solta com o nome do produto abre a lista sem o aviso falso.
// v92 (08/10/2026 — Thiago: "crie uma promoção relampago para esse produto. Primobolan 100mg - Cooper de 1.499 por 899 somente
//   hoje até 23h59min ou enquanto durar os estoques"). Religa a PROMO_RELAMPAGO (opção 8 / "promo", menu, saudação, IA) com o
//   Primobolan 100mg - Cooper Pharma. Campo novo `fim`: a promoção DESLIGA SOZINHA em 08/10 23:59:59 (ninguém precisa mexer).
//   Campo novo `validade`: com ele, a lista diz "só hoje até 23h59 ou enquanto durarem os estoques" em vez de
//   "exclusiva comigo (Athena)" (esta promoção também está no site). Cupom continua podendo somar (decisão do Thiago).

// v91 (07/10/2026 — Thiago, depois de três conversas reais: "ela precisa reconhecer melhor todos os dados e parar de ficar pedindo
//   várias vezes a mesma coisa" · "tô deixando de vender pq ela não reconhece o principal").
//   1) DADOS DE ENVIO (COLETA_DADOS): lê em qualquer formato (coletaLer). Telefone sozinho não vira mais CPF; resposta solta
//      é encaixada no dado que falta; telefone = o do WhatsApp se o cliente não informar; estado = o do frete; pede SÓ o que
//      falta; 2 respostas seguidas sem dado novo → atendente (antes 3 tentativas no total). A IA só é chamada se faltar dado,
//      as gravações do fim rodam em paralelo e os pedidos de dado saem pelo canal direto (o BotConversa reenviava o
//      "Quase lá" antigo quando a chamada final demorava — VF-0710-W002, 14,5 s).
//   2) FRETE/ESTADO: "quero adicionar mais produtos" / nome de produto não ficam mais presos no "Digite 1, 2 ou 3"
//      (checkoutDesvio); frete aceito pelo nome ("sedex"); estado aceito por extenso ("São Paulo", "sou do Paraná").
//   3) NOME COM 2 LETRAS ERRADAS ("monjauro"): reconhecerAproximado, só quando dicionário e catálogo não acham nada.
//   4) Resposta direta da IA (Athena) sai pelo canal direto: chega mesmo se o BotConversa parar de esperar.
// v90 (05/10/2026 — ordem do Thiago depois de duas conversas reais: "ela não reconhece nada… não reconheceu a linha diamond da
//   Landerlan nem o produto DHB… tem que reprogramá-la para ficar inteligente… veja o que ela tem que melhorar e resolva
//   definitivamente"). Resto = v89.
//   CAUSA: o reconhecimento dependia de listas escritas à mão (DICT_PRODUTOS, MARCAS, termos dos menus) e do cache só com produto
//   disponível. O catálogo foi renomeado ("Deca", "Cipionato", "Durateston", "Landerlan Diamond/Gold/Silver") e as listas não.
//   Medido contra o catálogo real de 05/10: "nandrolona" → "não está disponível" (20 Decas à venda); "deca" → "Você quis dizer
//   Nandrolona?" → não disponível; menu Hormônios › 8 vazio; Cipionato e Deca caíam em "Outros hormônios"; "linha diamond", "dhb",
//   "t3", "t4", "tg", "clomid" iam para a IA; "primobolan landerlan diamond" mostrava a Landerlan SILVER; pergunta de preço com
//   "?" ia para a IA em vez de abrir a lista; a coleção "outros" do cache está parada desde 21/08 e trazia produto e preço velhos.
//   O QUE MUDOU (bloco "CATÁLOGO INTELIGENTE", igual nos 3 arquivos da Athena):
//   1) o pedido do cliente é comparado com o CATÁLOGO DO DIA, palavra por palavra (nome, dosagem, marca, linha, sinônimos da
//      substância) — qualquer produto, marca ou linha que existir no site é reconhecido sem precisar cadastrar nada aqui;
//   2) saudação e "quanto está o valor da…", "tem…?", "linha…" são tirados antes de procurar; pergunta de PREÇO/ESTOQUE com
//      produto abre a lista (dúvida de uso continua indo para a IA);
//   3) marca/linha/dosagem pedida que não está disponível: a Athena diz isso e mostra as opções do produto (nunca mais mostra
//      outra linha calada);
//   4) nada disponível: pergunta à LOJA se o produto existe e está ESGOTADO e responde "está esgotado no momento";
//   5) menus de Hormônios e o dicionário passam a achar os produtos pelos sinônimos (Deca = nandrolona, Cipionato = testosterona…);
//      palavra que já é o nome no catálogo ("deca", "durateston") abre direto, sem "Você quis dizer…?";
//   6) coleção do cache parada há mais de 7 dias é ignorada;
//   7) a IA recebe o que o catálogo e a loja acharam para a mensagem (disponível / esgotado / não existe).
// v89 (04/10/2026 — Thiago, depois de aprovar o pop-up e a página de Promoções: "agora pode configurar a athena e publicar"). Só
//   DIVULGAÇÃO, nenhuma conta muda: (1) MSG_FRETE_AUTO (opção 8 / "promo") com o mesmo texto do pop-up — ênfase no frete grátis,
//   SEGURO GRÁTIS em destaque, "não acumula / você escolhe" discreto, sem listar PAC/SEDEX; (2) aviso do frete grátis na saudação
//   (buildTriagem) e no menu principal (buildMenuPrincipal); (3) contextoPromo da IA: o benefício não é concedido a revendedores. Resto = v88.
// v88 (04/10/2026 — Thiago: "é bom deixar claro que o seguro continua valendo mesmo com frete grátis, exceto se o cliente optar pela
//   modalidade PAC ou SEDEX"). Só texto, nenhuma conta muda: aviso do seguro no resumo com frete grátis (conforme a modalidade), no
//   bloco das opções A/B, na opção 8 / "promo" (MSG_FRETE_AUTO) e no contextoPromo da IA. Resto = v87.
// v87 (04/10/2026 — pedido do Thiago: "frete grátis para pedidos acima de 1000 reais… de forma automática onde o cliente não necessite
//   colocar o cupom FRETEZERO… caso ele coloque algum cupom ele deve ter a opção de escolher o que for melhor para ele"). Resto = v86.
//   FRETE GRÁTIS AUTOMÁTICO (FRETE_GRATIS_AUTO): varejo, pedido a partir de R$ 1.000 em produtos (preço cheio), qualquer modalidade, sem
//   cupom e sem data de fim (pra desligar: ativo:false). NÃO ACUMULA (regra nº 9): quando o pedido também tem outro benefício (3% da
//   Athena, cupom, Semana do Cliente, preço promocional), o resumo mostra as DUAS opções com o valor de cada uma, já deixa marcada a que
//   mais economiza e o cliente troca digitando A ou B. Única exceção: VALE-COMPRAS (é dinheiro) funciona junto com o frete grátis.
//   Atacado não entra (lá o frete já é grátis). O frete escolhido passa a guardar o valor cheio (freteSelecionado.valorCheio): antes,
//   depois de um cupom de frete, o valor virava 0 na sessão e um 2º cupom digitado mantinha o frete zerado junto com o desconto.
//   Textos: opção 8 / "promo" (MSG_FRETE_AUTO) e contextoPromo da IA. ⚠️ A MESMA regra existe no carrinho do site e no Orçamento.
// v86 (04/10/2026 — conversa real de 03/10, 22:23: na pergunta "Quantas unidades deseja?" o cliente digitou "Hormônio" e recebeu a
//   lista de "Kit de Aplicação para Hormônios" — a palavra foi buscada como NOME DE PRODUTO). Resto = v85.
//   NOME DE CATEGORIA digitado (emagrecedores, peptídeos, hormônios, gh, estética, sarms, farmácia) agora abre a categoria também
//   quando o cliente está navegando nos produtos (lista, submenus, busca, quantidade, "quer ver…?"), não só no menu. E aceita a
//   palavra dentro de um pedido curto: "quero hormônio", "tem hormônios?", "quero ver os hormônios" (antes ia pra IA).
//   Checkout (carrinho, frete, confirmação, dados) e atacado NÃO mudam. O carrinho é preservado.
// v85 (02/10/2026 — 2ª leitura das conversas, as que tinham ficado sem ler + as respostas do Thiago). Resto = v84.
//   1) BLOCO DE DADOS (Nome/CPF/endereço) fora da coleta — cliente corrigindo o endereço depois do pedido — virava "Você quis dizer
//      Stanozolol?". Agora avisa a equipe no Telegram e responde MSG_DADOS_REENVIADOS (texto aprovado pelo Thiago em 02/10).
//   2) DÚVIDAS (opção 3 › 1): nome de produto solto ("Durateston") vai pra IA, não pra "Você quis dizer…?".
//   3) PROTOCOLO PÓS-COMPRA: a lista do que o cliente comprou trazia o pedido inteiro numa linha só, com "( un.)" e o FRETE como
//      produto ("…, Frete Transportadora — SP ( un.)"). extrairProdutosDosPedidos agora separa item por item e tira frete/preço/quantidade.
//   4) RASTREIO: (a) texto colado com o nº do pedido + nome de produto (a própria confirmação do pedido) abria a LISTA do produto;
//      (b) com pedido + CPF + e-mail na mesma mensagem só o 1º era tentado — agora tenta os outros se o 1º não achar;
//      (c) "VT-1709-S008" (T no lugar do F) é lido como VF; (d) "E-mail fulano@…" solto consulta direto, como o CPF solto já fazia;
//      (e) "meus pedidos" / "minhas compras" abrem o rastreio (inclusive na pergunta "continuar a compra ou começar do zero").
//   5) LISTA DE PRODUTOS: colar a linha inteira do produto ("Tirzec 15mg (4 ampolas…) — R$ 759,00") escolhe o produto.
//   6) ATACADO: "Obg / Tchau" era buscado como produto.
//   7) RECLAMAÇÃO: "consta como entregue e não recebi / só chegou 1" vai pro atendente.
// v84 (02/10/2026 — leitura das conversas reais de 27/09 a 01/10 no BotConversa, a pedido do Thiago). Só correção de erro de funcionamento;
//   nenhum texto novo pro cliente (reusa as mensagens que já existiam). Resto = v83.
//   1) QUANTIDADE / ATK_QTD: "60 mg" virava 60 unidades (caso real: carrinho de R$ 47.340). Agora só vale quantidade PURA (qtdPura).
//   2) OBSERVAÇÃO: texto que começa com "Olá…" caía na saudação e ZERAVA o fechamento do atacado; e quem escrevia a observação
//      direto na pergunta "1 Sim / 2 Não" ficava num laço. Agora o texto é aceito como a observação.
//   3) SAUDAÇÃO + ASSUNTO ("Ola meu pedido veio errado"): só a saudação era lida e o assunto se perdia. Com 12+ letras de assunto, segue.
//   4) RECLAMAÇÃO DE PEDIDO ERRADO ("comprei X, recebi Y", "veio errado/trocado/faltando/quebrado") virava COMBO de compra. Agora
//      vai pro atendente, pelo mesmo caminho de "reclamação" que já existia (palavrasHumano).
//   5) ATACADO: "finalizar pedido" / "fechar pedido" era lido como nome de produto ("Não encontrei finalizar pedido…"); "varejo" idem.
//   6) PEDIDO EM ABERTO: "cancelar" / "não quero mais" repetia o mesmo aviso; agora vale como "menu" (é o que o aviso já manda digitar).
//   7) BUSCA: "TG 15mg" jogava fora o "TG" (2 letras) e listava todo produto de 15mg. Palavra de 2 letras agora conta (com volta atrás se der zero).
//   8) FRETE: "FRETEZERO" e "pacote" abriam a consulta de frete (casava no meio da palavra). Agora é palavra inteira.
//   9) RASTREIO: frase solta dentro do rastreio ("já tentei falar com a logística…") respondia "não encontrei pedido com esse dado".
//  10) MENSAGEM VAZIA ou "Este tipo de mensagem não é suportado" (figurinha/áudio que o BotConversa não repassa) ia pra IA e ficava sem resposta.
// v83 (02/10/2026 — ordem do Thiago: "a Athena dá a mesma explicação dos outros sistemas"): a consulta de pedido (statusBloco) mostra o
//   MESMO AVISO da página de rastreio, do bot da logística e da Minha Conta (campo `aviso` da rastreio-consulta v7 — textos do Thiago,
//   sem mudar uma palavra; só negrito/itálico do WhatsApp e uma frase por linha). Com o aviso de postagem (pedido marcado como Postado
//   pela logística e ainda sem leitura da transportadora, ou atacado aguardando a rota) quem explica é o aviso, não a frase do status.
//   Sem o campo (consulta de reserva no GAS) nada muda. Resto = v82.
// v82 (01/10/2026): PRAZOS NOVOS (tabela por ESTADO aprovada pelo Thiago em 29/09): postagem do varejo em até 3 dias úteis,
//   atacado em até 6; entrega por estado (MSG_PRAZO_VAREJO, MSG_PRAZOS_COMPLETO, mensagem do pedido confirmado, regras da IA)
//   e a previsão do statusBloco (PRAZO_DESPACHO_DU = 3 + PRAZO_UF_DU). Mesma tabela do GAS v52 e da rastreio-consulta v3. Resto = v81.
// v81 (30/09/2026): NÚMERO DO PEDIDO E CPF ESCRITOS DE QUALQUER JEITO (pedido do Thiago: "muitos erram esses números").
//   Bloco de identificação ÚNICO (igual no bot da logística v3 e na página de rastreio v5): "vf 2909 s012", "VF2909S012",
//   "29/09 S012", "S12" → S012, letra O no lugar de zero, contingência VF-DDMM-AX0930; CPF com/sem ponto/traço/espaço e
//   sem o zero da frente. Incompleto → explica o que falta (falta a letra / falta dia e mês / CPF não confere) — NUNCA chuta.
//   Vale no rastreio (universal, estado RASTREAR, dentro do atacado), no SORTEIO e no PROTO_IDENTIFICAR. Resto = v80.
// v80 (30/09/2026): o Apps Script às vezes segura a chamada 10-40 s. (1) Número do pedido pela função Netlify numero-pedido
//   (Firebase direto, ~0,3 s) — antes a Athena caía no número de contingência AX; GAS vira reserva (6 s). (2) Consulta de
//   rastreio pela função rastreio-consulta (resposta pronta no Firebase); GAS de reserva, agora com limite de 8 s. Resto = v79.
// v79 (30/09/2026): pedido de ATACADO passa a sair com prefixo W (VF-DDMM-W###), como o atacado do site. Antes saía
//   com A (Athena) e o sistema não reconhecia como atacado (prazo de varejo, origem errada no rastreio). gerarNumeroPedido
//   recebe o tipo: sessão com atacado:true -> 'W'; resto -> 'A'. Contingência do atacado: VF-DDMM-WX<HHmm>. Resto = v78.
// v78 (30/09/2026): 3 correções de caso real (cliente Antonio, 29/09):
//   (1) PERGUNTA DE PRAZO fora do atacado responde DIRETO o prazo do varejo (antes abria o menu "1 varejo / 2 atacado"
//       pra quem estava comprando no varejo). Com carrinho de ATACADO, manda o prazo completo (varejo + atacado).
//   (2) "finalizar" com o carrinho VAZIO não vai mais pra IA: a IA "fingia" o checkout, pedia estado e CEP e INVENTAVA
//       frete (PAC 25 / SEDEX 45 / Transp. 35 pro PR — o real é 50 / 65 / 75). Agora vai pra IA com a instrução de
//       usar [[COMPRAR]] do produto da conversa (item 3). Travas de frete na IA: athena-ia.js / athena-ia-background.js.
//   (3) IA PERGUNTA SE PODE COLOCAR NO CARRINHO (pedido do Thiago, 30/09: "quando ela acha o produto ela deve perguntar
//       ao cliente se pode colocar no carrinho, caso a resposta seja afirmativa, ela coloca e já muda para o sistema
//       normal para finalizar a compra"). A IA usa o marcador [[COMPRAR:colecao:termo]]; achando UM produto, a sessão
//       vai pro estado CONFIRMAR_CARRINHO e o cliente vê "Posso colocar no seu carrinho?". SIM → entra no carrinho
//       (1 unidade, ou a quantidade que ele escrever junto: "sim, 2") → irParaCheckout (estado → frete real → link).
//       NÃO → menu. "finalizar" com carrinho vazio agora vai pra IA COM ESSA INSTRUÇÃO (ela usa o produto da conversa).
// v77 (29/09/2026): pedido pago grava no GAS/planilha SÓ o nome do produto (sem " x<qtd>" no nome) — igual ao site.
// v76 (27/09/2026): CUPOM DE FRETE (FRETEZERO) NÃO ACUMULA MAIS COM OS 3% DA ATHENA (Thiago: "não vou dar o frete
// grátis e ainda os 3%"). No fecharResumoNormal, com cupom tipo 'frete' vale o MAIOR pro cliente: OU o frete
// grátis/abatido OU os 3% nos produtos (se os 3% vencem, o cupom não é consumido); o resumo avisa. Textos da opção 8 (MSG_PROMO_FRETE) e do contextoPromo corrigidos. Resto = v75.
// v75 (27/09/2026): PROMOÇÃO FRETE GRÁTIS — FRETEZERO acima de R$ 1.000, de 27/09 até quarta 30/09 23h59.
// PROMO_FRETE ganhou .ini (liga sozinha 27/09 00:00) e .fim = 30/09 23:59:59 (desliga sozinha); MSG_PROMO_FRETE
// (opção 8 / "promo"), aviso no buildMenuPrincipal() (regra nº 2) e texto do contextoPromo da IA atualizados.
// O cupom continua validado pelo Firestore (cupons_vitaflow). Resto = v74.
// v74 (25/09/2026): atacado — (1) o texto de "não encontrei" não fala mais em *fornecedor* (nunca expor isso ao
// cliente); (2) dentro do atacado, "atacado"/"quero atacado"/"tabela de atacado" mostram a apresentação de novo e
// "tabela"/"pdf" mandam o link — antes viravam BUSCA na tabela ("Não encontrei Atacado", caso real 25/09). Resto = v73.
// v73 (23/09/2026): LANC_DIAMOND.ativa = false — a Diamond já é vendida no site (varejo); a Athena parava de dizer
// "só no atacado / ainda não chegou". Único ajuste; resto = v72.
// v72 (23/09/2026): contexto da IA leva a lista INTEIRA (até 30, na ordem mostrada) — a descrição sob demanda
// responde "quantos vem em cada?" de todos, com o número que o cliente vê. Único ajuste; resto = v71.
const INFINITEPAY_TAG = 'vitafuel'; // 18/09/2026: conta PF (bloqueio judicial na PJ 'vitafueloficial')
// v71 (22/09/2026): aviso do recebedor — clientes estranhavam o nome na tela da InfinitePay (Pix e cartão).
// Mesmo texto do carrinho do site (main-cart-footer v10) e da página de atacado (v-atk6). Vai junto de TODO link de pagamento.
// ⚠️ Multi-sistema: mudou titular/handle da InfinitePay → trocar aqui, no carrinho, no atacado, no Orçamento e no portal.
const AVISO_RECEBEDOR = '🔒 *Pagamento seguro via InfinitePay*\n' +
  'Na tela de pagamento constará:\n' +
  '• Recebedor: *VITAFUEL ($vitafuel)*\n' +
  '• Titular: *Allan Gouveia Afonso*\n' +
  'Esta é a conta oficial de recebimento da VitaFlow, válida para pagamentos via Pix, cartão de crédito e Apple Pay.';
const FIREBASE_URL    = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
// Segredo do Realtime Database (env var FIREBASE_SECRET no Netlify — NÃO hardcodar).
// Passa por cima das regras, permitindo o backend ler/gravar mesmo com os nós fechados.
const FIREBASE_SECRET = process.env.FIREBASE_SECRET || '';
// Helper: monta a URL REST do Firebase já com ?auth= (ou &auth= se já houver query).
function fbUrl(path){
  const base = FIREBASE_URL + path;
  if(!FIREBASE_SECRET) return base;
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'auth=' + encodeURIComponent(FIREBASE_SECRET);
}

// fetch COM TIMEOUT (AbortController). Sem isto, um endpoint lento (GAS acordando, InfinitePay,
// Telegram) TRAVA a function inteira até o Netlify matar → o BotConversa não recebe resposta,
// reenvia o webhook (link duplicado) e o estado embaralha. Todo fetch externo passa por aqui.
async function fetchT(url, opts, ms){
  const ctrl = new AbortController();
  const timer = setTimeout(function(){ ctrl.abort(); }, ms || 6000);
  try {
    return await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal }));
  } finally {
    clearTimeout(timer);
  }
}
const GAS_URL         = 'https://script.google.com/macros/s/AKfycbxFlaN0FXFbpcC8HZ80sxnq383m5d-xTaj5cg72VcCdnYx47N_qKkiELFN5KAPmm_nb/exec';
const RECIBO_BASE     = 'https://melodious-pony-e4f4f5.netlify.app/recibo-auto.html';

// ── IA ASSÍNCRONA (cérebro da Athena) ─────────────────────────────────────────
// Quando o cliente escreve algo que os menus não entendem, a gente dispara a IA
// (background function) e ela RESPONDE sozinha via BotConversa. Aqui só disparamos
// (retorna rápido, sem timeout); a resposta chega em seguida como mensagem empurrada.
const ATHENA_IA_URL = process.env.ATHENA_IA_URL || 'https://vitaflow-proxy.netlify.app/.netlify/functions/athena-ia-background';
// Assistente da REQUISIÇÃO atual (Athena por padrão; vira "Stella" quando o disparo vem do
// número Vitaflow/VitaMK com assistente:"Stella"). É setado no início do handler. No Lambda
// cada invocação roda isolada, então esta variável de módulo é segura (não há concorrência
// dentro do mesmo container). A IA assíncrona usa isso pra responder pela companhia certa.
let ASSISTENTE_ATUAL = 'Athena';
// Sinaliza pro FLUXO do BotConversa que ESTA resposta abriu uma lista de produtos.
// O fluxo usa isso na saída "Se usuário não responder" pra mandar o convite de retomada
// SÓ pra quem demonstrou interesse real (abriu lista) e sumiu. Zerado a cada requisição.
let SINAL_LISTA = false;
// Idem, pra ATHENA (08/09/2026). O convite dela só sai quando o cliente demonstrou
// interesse E ainda NÃO tem link de pagamento gerado — porque a partir do link quem
// cobra é o GAS (lembrete de 3h, de 20h e o template de 24h). Sem esta trava a mesma
// pessoa levaria dois lembretes diferentes pela mesma compra.
let SINAL_CARRINHO = false;   // tem item no carrinho (VAREJO)
let SINAL_ATACADO  = false;   // tem item no carrinho de ATACADO (carrinhoAtk)
let SINAL_FECHANDO = false;   // já tem link/pedido em aberto, ou está informando dados
async function dispararIA(phone, mensagem, contexto, imagemUrl){
  try {
    await fetch(ATHENA_IA_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ phone: phone, mensagem: mensagem, promoContext: await contextoPromo(), contexto: contexto || '', assistente: ASSISTENTE_ATUAL, imagemUrl: imagemUrl || '' })
    });
  } catch (e) { /* se falhar o disparo, o ack síncrono já foi enviado */ }
}
// Zera a memória da IA (nó vitaflow_ia_hist) — usado quando o cliente TROCA de produto
// digitando o nome. Assim a IA não responde puxando o assunto do produto anterior.
async function limparHistoricoIA(sid){
  try {
    const k = String(sid || '').replace(/[^a-zA-Z0-9]/g, '_');
    await fetchT(fbUrl(`/vitaflow_ia_hist/${k}.json`), { method:'DELETE' }, 4000);
  } catch (e) {}
}
// Contexto do que o cliente está vendo AGORA (lista aberta) — pra IA não responder de assunto antigo.
function contextoLista(session){
  const partes = [];
  const lista = (session && session.produtoLista) || [];
  const nomes = lista.slice(0, 30).map(p => p && p.nome).filter(Boolean).join('; ');   // v72: era 10 (ordem = a mostrada, número = posição + 1)
  if (nomes) partes.push('O cliente está vendo AGORA esta lista de produtos (responda no contexto DELA, ignore assuntos/produtos de mensagens antigas): ' + nomes);
  const carrinho = (session && session.carrinho) || [];
  if (carrinho.length) {
    const nomesCar = carrinho.map(i => i && i.nome).filter(Boolean).join('; ');
    if (nomesCar) partes.push('O cliente JÁ TEM no CARRINHO: ' + nomesCar + '. NUNCA diga que o carrinho está vazio nem reabra a seleção desses produtos. Você NÃO controla o carrinho — se ele quiser VER o carrinho, finalizar ou pagar, oriente a digitar "carrinho" ou "finalizar" que o sistema cuida.');
  }
  return partes.join('\n');
}

// ── Negrito do WhatsApp ───────────────────────────────────────────────────────
// O WhatsApp usa UM asterisco pra negrito (*assim*). O modelo às vezes escreve no
// padrão Markdown (**assim**) e o cliente vê os asteriscos literais na tela
// ("**BPC-157** é um peptídeo..."). Isso já vazou pra cliente. Converte na saída,
// no ÚNICO ponto por onde passa tudo que a Athena/Stella responde pelo webhook.
// Também converte ## que escapou do prompt. NÃO mexe em *negrito simples* já correto.
function normalizarMarkdownWhats(t){
  if (!t) return t;
  const base = String(t)
    .replace(/\*\*\*([^*\n]+?)\*\*\*/g, '*$1*')   // ***x*** -> *x*
    .replace(/\*\*([^*\n]+?)\*\*/g, '*$1*')         // **x**   -> *x*
    .replace(/^\s{0,3}#{1,6}\s*(.+?)\s*$/gm, '*$1*'); // ## Titulo -> *Titulo*
  return _balancearAsteriscos(base);
}
// O negrito do WhatsApp NÃO atravessa quebra de linha: um "*" aberto numa linha e fechado
// na seguinte faz aparecer o asterisco literal e o negrito vazar pro texto errado. Foi o
// que aconteceu em 08/09 na Stella ("*INDEPENDÊNCIA 9.9 (07 a 09/09):" numa linha e
// "*15% OFF" na outra). Aqui cada LINHA é fechada em si mesma:
//   "* item"  no começo da linha  -> vira "• item" (o WhatsApp não faz bullet com *)
//   linha com nº ÍMPAR de "*" que ABRE negrito -> fecha no fim da linha
//   sobrou um "*" solto sem abrir nada -> remove
function _balancearAsteriscos(txt){
  return String(txt || '').split('\n').map(function(linha){
    var l = linha.replace(/^(\s*)\*\s+/, '$1• ');          // "* item" -> "• item"
    var n = (l.match(/\*/g) || []).length;
    if (n % 2 === 0) return l;                              // já está par: nada a fazer
    if (/^\s*\*\S/.test(l)) return l.replace(/\s*$/, '') + '*';  // abriu negrito -> fecha
    // Sobrou um "*" ímpar no meio da linha. Só tira se ele estiver COLADO numa palavra
    // (aí é marcação quebrada). "R$ 10 * 3 unidades" é multiplicação — fica como está.
    var ult = l.lastIndexOf('*');
    if (ult < 0) return l;
    var antes = ult > 0 ? l.charAt(ult - 1) : ' ';
    var depois = ult < l.length - 1 ? l.charAt(ult + 1) : ' ';
    if (/\S/.test(antes) || /\S/.test(depois)) return l.slice(0, ult) + l.slice(ult + 1);
    return l;
  }).join('\n');
}

// ── IA SÍNCRONA (contorno do bloqueio da API do BotConversa na Stella) ─────────
// PROBLEMA (diagnosticado em 07/09/2026): a IA assíncrona (athena-ia-background.js)
// entrega a resposta EMPURRANDO pela API do BotConversa. Na companhia da Stella
// (VitaMK 211520) essa API está bloqueada — qualquer chave, inclusive recém-gerada,
// volta HTTP 403 "Api key is not valid" (comprovado no Swagger deles; na companhia da
// Athena a mesma chamada volta 200). Efeito: a Stella mandava "Deixa eu ver isso… 👀"
// e NUNCA mais falava — 0 respostas de IA em 225 conversas, contra 84 da Athena.
//
// CONTORNO: a resposta SÍNCRONA do webhook chega normalmente na Stella (é por ela que
// chegam menu, tabela de preços e o próprio 👀). Então, quando o assistente NÃO é a
// Athena, a gente chama a versão síncrona do cérebro (/athena-ia), que DEVOLVE o texto,
// e responde na hora — sem 👀 e sem depender da API.
//
// A ATHENA NÃO MUDA: continua no caminho assíncrono, que funciona pra ela.
// Quando o BotConversa liberar a API da VitaMK, basta trocar IA_SYNC_ATIVA pra false.
const IA_SYNC_URL   = process.env.ATHENA_IA_SYNC_URL || 'https://vitaflow-proxy.netlify.app/.netlify/functions/athena-ia';
const IA_SYNC_ATIVA = process.env.IA_SYNC_ATIVA !== 'false';
// Teto de espera. A function do Netlify corta em 10s e o botconversa ainda gasta ~1,5s
// com sessão/cache antes e depois — então 8,2s é o máximo seguro. Medido em produção:
// a IA responde em 4,4s a 7,3s (mais lenta no primeiro tiro depois de ociosa), e com o teto
// antigo de 7,5s (6,5s de prazo interno) as mais lentas caíam no 👀 sem necessidade.
// Estourou mesmo assim: cai no comportamento antigo, sem prejuízo.
const IA_SYNC_TIMEOUT_MS = parseInt(process.env.IA_SYNC_TIMEOUT_MS || '8200', 10);
// v90: a Athena também tenta a resposta direta. Para voltar ao "👀" sempre: IA_SYNC_ATHENA=false no Netlify.
const IA_SYNC_ATHENA = process.env.IA_SYNC_ATHENA !== 'false';

// Chama o cérebro síncrono. Devolve o texto pronto, ou '' se não deu tempo/falhou.
async function iaSincrona(phone, mensagem, contexto){
  try {
    const r = await fetchT(IA_SYNC_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        phone: phone, mensagem: mensagem, contexto: contexto || '',
        promoContext: await contextoPromo(),
        prazoMs: IA_SYNC_TIMEOUT_MS - 700,
        semParcial: ASSISTENTE_ATUAL === 'Athena'   // v90: a Athena tem o caminho do "👀" — só aceita resposta COMPLETA
      })
    }, IA_SYNC_TIMEOUT_MS);
    if (!r.ok) { console.log('[IA-SYNC] HTTP', r.status); return ''; }
    const d = await r.json();
    if (d && d.abriuLista) SINAL_LISTA = true;   // a IA abriu lista de produtos → conta como interesse
    return (d && d.resposta) ? String(d.resposta) : '';
  } catch (e) { console.log('[IA-SYNC] falhou:', e.message); return ''; }
}

// PONTO ÚNICO de "manda pra IA". Todo lugar que antes fazia
//   await dispararIA(...); return respond('Deixa eu ver isso pra você… 👀');
// agora chama esta função.
//  - Athena  → caminho assíncrono de sempre (👀 + resposta empurrada pela API).
//  - Stella  → tenta responder na hora; se não der, cai no caminho antigo.
async function responderComIA(sid, mensagem, contexto, respond){
  if (IA_SYNC_ATIVA && ASSISTENTE_ATUAL !== 'Athena') {
    const texto = await iaSincrona(sid, mensagem, contexto);
    if (texto && texto.trim()) return respond(texto);
    // NUNCA cair no assíncrono quando não é a Athena: a API da VitaMK está bloqueada (403),
    // a resposta empurrada NUNCA chega e o lead fica no vácuo depois do 👀. Em 16/09/2026,
    // 11 conversas morreram exatamente assim. Em vez do 👀, devolve o mesmo menu da Athena —
    // o lead continua tendo pra onde ir e a venda continua possível.
    console.log('[IA-SYNC] sem texto a tempo — devolvendo o menu em vez do 👀 (Stella).');
    return respond(MSG_IA_SEM_RESPOSTA + '\n\n' + buildMenuPrincipal());
  }
  // v90: a Athena também tenta a resposta direta (1 mensagem, sem "👀"). Não deu tempo → segue o caminho de sempre.
  if (IA_SYNC_ATIVA && IA_SYNC_ATHENA) {
    const textoA = await iaSincrona(sid, mensagem, contexto);
    // v91: entrega pelo canal DIRETO (mesmo do recibo). Se a resposta ficar pronta depois que o BotConversa parou de
    // esperar, ela chega do mesmo jeito (06/10: "Monjauro" ficou sem resposta nenhuma). Envio direto falhou → resposta normal.
    if (textoA && textoA.trim()) {
      let _partesA = textoA.length > 3800 ? partirMensagem(textoA, 3800).slice(0, 3) : [textoA];
      _partesA = _partesA.map(function (x) { return normalizarMarkdownWhats(x); }).filter(Boolean);
      const _okA = await enviarWhatsAppDireto(sid, _partesA);
      return _okA ? respond('') : respond(textoA);
    }
    console.log('[IA-SYNC] Athena: sem resposta completa a tempo — segue pelo 👀 (IA assíncrona).');
  }
  await dispararIA(sid, mensagem, contexto);   // AGUARDA o disparo sair (Background Function responde 202 na hora); sem o await o Lambda congela no return e o POST nunca chega
  return respond('Deixa eu ver isso pra você… 👀');
}

// Fallback quando a IA síncrona não responde a tempo. Vai SEMPRE acompanhado do menu
// principal (o mesmo da Athena) — o lead nunca fica sem caminho.
const MSG_IA_SEM_RESPOSTA = `Essa eu preciso de um minutinho pra te responder direito 😅

Mas não quero te deixar esperando: me manda o *nome do produto* que você quer e eu te mostro *preço e disponibilidade* na hora.`;

// Dispara a IA pra montar e ENVIAR o PROTOCOLO COMPLETO pós-venda dos produtos comprados.
// Chamado quando o pedido é concluído (após a coleta de dados). Fire-and-forget.
async function dispararIAProtocolo(phone, produtos, tabelas){
  try {
    await fetch(ATHENA_IA_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ phone: phone, tipo: 'protocolo', produtos: produtos || [], tabelas: tabelas || '', assistente: ASSISTENTE_ATUAL })
    });
  } catch (e) { /* pós-venda: se falhar o disparo, não afeta o pedido já concluído */ }
}

// ── FRACIONAMENTO (tabelas) ───────────────────────────────────────────────────
// Lê o nó vitaflow_fracionamento no Firebase (slug -> {titulo, texto}) e casa o
// NOME do produto do pedido com a(s) tabela(s) certa(s). O texto fica no Firebase
// (o site também lê de lá); aqui fica só a lógica de reconhecimento.
// Tabelas de fracionamento EMBUTIDAS no proprio arquivo — NAO depende de Firebase.
// (pra atualizar uma tabela no futuro, edita aqui e sobe o arquivo de novo.)
const FRAC_TABELAS = {
  "reta_oxygen_80_aq": {
    "titulo": "Retatrutida 80mg AQ (diluída - Oxygen)",
    "texto": "_Frasco único 80mg/4,8mL — já vem pronta, não diluir_\n\n▪️ *Já vem pronta (não diluir) — 4,8 mL:*\n1 mg → *6 UI*  (80 doses)\n2 mg → *12 UI*  (40 doses)\n4 mg → *24 UI*  (20 doses)\n6 mg → *36 UI*  (13 doses)\n8 mg → *48 UI*  (10 doses)\n10 mg → *60 UI*  (8 doses)\n12 mg → *72 UI*  (6 doses)"
  },
  "reta_zphc_60_aq": {
    "titulo": "Retatrutida 60mg AQ (diluída - ZPHC)",
    "texto": "_Frasco único 60mg/3mL — já vem pronta, não diluir_\n\n▪️ *Já vem pronta (não diluir) — 3 mL:*\n1 mg → *5 UI*  (60 doses)\n2 mg → *10 UI*  (30 doses)\n4 mg → *20 UI*  (15 doses)\n6 mg → *30 UI*  (10 doses)\n8 mg → *40 UI*  (7 doses)\n10 mg → *50 UI*  (6 doses)\n12 mg → *60 UI*  (5 doses)"
  },
  "reta_zphc_120_aq": {
    "titulo": "Retatrutida 120mg AQ (diluída - ZPHC)",
    "texto": "_2 frascos de 60mg com 3mL cada — já vem pronta, não diluir. Cada frasco usa a tabela abaixo (o kit tem 2)._\n\n▪️ *Já vem pronta (não diluir) — 3 mL:*\n1 mg → *5 UI*  (60 doses)\n2 mg → *10 UI*  (30 doses)\n4 mg → *20 UI*  (15 doses)\n6 mg → *30 UI*  (10 doses)\n8 mg → *40 UI*  (7 doses)\n10 mg → *50 UI*  (6 doses)\n12 mg → *60 UI*  (5 doses)"
  },
  "reta_zphc_15_liof": {
    "titulo": "Retatrutida 15mg Liofilizada (Kit - ZPHC)",
    "texto": "_1 vial de 15mg — dilua em 1,5mL OU 3,0mL de BAC (o kit traz 3mL de BAC)_\n\n▪️ *Diluir em 1,5 mL de BAC:*\n2 mg → *20 UI*  (7 doses)\n4 mg → *40 UI*  (3 doses)\n6 mg → *60 UI*  (2 doses)\n8 mg → *80 UI*  (1 dose)\n10 mg → *100 UI*  (1 dose)\n15 mg → *150 UI*  (1 dose)\n\n▪️ *Diluir em 3 mL de BAC:*\n2 mg → *40 UI*  (7 doses)\n4 mg → *80 UI*  (3 doses)\n6 mg → *120 UI*  (2 doses)\n8 mg → *160 UI*  (1 dose)\n10 mg → *200 UI*  (1 dose)\n15 mg → *300 UI*  (1 dose)"
  },
  "reta_zphc_60_liof": {
    "titulo": "Retatrutida 60mg Liofilizada (ZPHC)",
    "texto": "_5 bujões de 12mg (total 60mg). Dilua CADA bujão separadamente. O kit traz 10mL de BAC no total._\n\n▪️ *Cada bujão em 2mL de BAC (por bujão):*\n1 mg → *17 UI*  (12 doses por bujão)\n2 mg → *33 UI*  (6 doses por bujão)\n4 mg → *67 UI*  (3 doses por bujão)\n6 mg → *100 UI*  (2 doses por bujão)\n8 mg → *133 UI*  (1 dose por bujão)\n10 mg → *167 UI*  (1 dose por bujão)\n12 mg → *200 UI*  (1 dose por bujão)"
  },
  "reta_zphc_120_liof": {
    "titulo": "Retatrutida 120mg Liofilizada (ZPHC)",
    "texto": "_5 bujões de 24mg (total 120mg). Dilua CADA bujão separadamente. O kit traz 10mL de BAC no total._\n\n▪️ *Cada bujão em 2mL de BAC (por bujão):*\n1 mg → *8 UI*  (24 doses por bujão)\n2 mg → *17 UI*  (12 doses por bujão)\n4 mg → *33 UI*  (6 doses por bujão)\n6 mg → *50 UI*  (4 doses por bujão)\n8 mg → *67 UI*  (3 doses por bujão)\n10 mg → *83 UI*  (2 doses por bujão)\n12 mg → *100 UI*  (2 doses por bujão)"
  },
  "reta_synedica_120_liof": {
    "titulo": "Retatrutida 120mg Liofilizada (Synedica)",
    "texto": "_1 frasco único de 120mg — reconstitua com 7mL de BAC_\n\n▪️ *Diluir em 7 mL de BAC:*\n1 mg → *6 UI*  (120 doses)\n2 mg → *12 UI*  (60 doses)\n4 mg → *23 UI*  (30 doses)\n6 mg → *35 UI*  (20 doses)\n8 mg → *47 UI*  (15 doses)\n10 mg → *58 UI*  (12 doses)\n12 mg → *70 UI*  (10 doses)"
  },
  "reta_synedica_40_caneta": {
    "titulo": "Retatrutida Synedica 40mg (Caneta)",
    "texto": "_Caneta 4 × 10mg = 40mg, já vem pronta (não diluir). A janela marca 0 / 2,5 / 5 / 7,5 / 10 mg e entre os números aparecem só símbolos — é normal. 20 cliques = 2,5mg → 1 clique = 0,125mg. Conte os cliques a partir do 0._\n\n▪️ *Cliques a partir do 0:*\n1 mg → *8 cliques*  (40 doses)\n2 mg → *16 cliques*  (20 doses)\n2,5 mg → *20 cliques*  (16 doses)\n4 mg → *32 cliques*  (10 doses)\n5 mg → *40 cliques*  (8 doses)\n6 mg → *48 cliques*  (6 doses)\n8 mg → *64 cliques*  (5 doses)\n10 mg → *80 cliques*  (4 doses)"
  },
  "reta_veltrane_diamond_120": {
    "titulo": "Retatrutida 120mg (diluída - Veltrane Diamond)",
    "texto": "_Frasco único 120mg/6mL — injeção, já vem pronta_\n\n▪️ *Já vem pronta (não diluir) — 6 mL:*\n1 mg → *5 UI*  (120 doses)\n2 mg → *10 UI*  (60 doses)\n4 mg → *20 UI*  (30 doses)\n6 mg → *30 UI*  (20 doses)\n8 mg → *40 UI*  (15 doses)\n10 mg → *50 UI*  (12 doses)\n12 mg → *60 UI*  (10 doses)"
  },
  "reta_veltrane_gold_90": {
    "titulo": "Retatrutida 90mg (diluída - Veltrane Gold)",
    "texto": "_Frasco único 90mg/6mL — injeção, já vem pronta_\n\n▪️ *Já vem pronta (não diluir) — 6 mL:*\n1 mg → *7 UI*  (90 doses)\n2 mg → *13 UI*  (45 doses)\n4 mg → *27 UI*  (22 doses)\n6 mg → *40 UI*  (15 doses)\n8 mg → *53 UI*  (11 doses)\n10 mg → *67 UI*  (9 doses)\n12 mg → *80 UI*  (7 doses)"
  },
  "reta_veltrane_60": {
    "titulo": "Retatrutida 60mg (diluída - Veltrane)",
    "texto": "_Frasco único 60mg/6mL — injeção, já vem pronta_\n\n▪️ *Já vem pronta (não diluir) — 6 mL:*\n1 mg → *10 UI*  (60 doses)\n2 mg → *20 UI*  (30 doses)\n4 mg → *40 UI*  (15 doses)\n6 mg → *60 UI*  (10 doses)\n8 mg → *80 UI*  (7 doses)\n10 mg → *100 UI*  (6 doses)\n12 mg → *120 UI*  (5 doses)"
  },
  "reta_retagen_oxygen_120": {
    "titulo": "Retatrutida 120mg (diluída - Retagen Oxygen)",
    "texto": "_Frasco único 120mg/6mL — já vem pronta_\n\n▪️ *Já vem pronta (não diluir) — 6 mL:*\n1 mg → *5 UI*  (120 doses)\n2 mg → *10 UI*  (60 doses)\n4 mg → *20 UI*  (30 doses)\n6 mg → *30 UI*  (20 doses)\n8 mg → *40 UI*  (15 doses)\n10 mg → *50 UI*  (12 doses)\n12 mg → *60 UI*  (10 doses)"
  },
  "reta_oxygen_60_liof": {
    "titulo": "Retatrutida 60mg Liofilizada (Oxygen)",
    "texto": "_1 vial de 60mg — dilua em 2mL OU 3mL de BAC_\n\n▪️ *Diluir em 2 mL de BAC:*\n1 mg → *3 UI*  (60 doses)\n2 mg → *7 UI*  (30 doses)\n4 mg → *13 UI*  (15 doses)\n6 mg → *20 UI*  (10 doses)\n8 mg → *27 UI*  (7 doses)\n10 mg → *33 UI*  (6 doses)\n12 mg → *40 UI*  (5 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n1 mg → *5 UI*  (60 doses)\n2 mg → *10 UI*  (30 doses)\n4 mg → *20 UI*  (15 doses)\n6 mg → *30 UI*  (10 doses)\n8 mg → *40 UI*  (7 doses)\n10 mg → *50 UI*  (6 doses)\n12 mg → *60 UI*  (5 doses)"
  },
  "reta_oxygen_160_aq": {
    "titulo": "Retatrutida 160mg (diluída - Oxygen)",
    "texto": "_Bujão único 160mg/9mL — já vem pronta_\n\n▪️ *Já vem pronta (não diluir) — 9 mL:*\n1 mg → *6 UI*  (160 doses)\n2 mg → *11 UI*  (80 doses)\n4 mg → *23 UI*  (40 doses)\n6 mg → *34 UI*  (26 doses)\n8 mg → *45 UI*  (20 doses)\n10 mg → *56 UI*  (16 doses)\n12 mg → *68 UI*  (13 doses)"
  },
  "tirze_tg_10": {
    "titulo": "Tirzepatida TG 10mg",
    "texto": "_Ampola 10mg/0,5mL — kit 4 ampolas (total 40mg)_\n\n2,5 mg → *13 UI*  (4 doses)\n5 mg → *25 UI*  (2 doses)\n7,5 mg → *38 UI*  (1 dose)\n10 mg → *50 UI*  (1 dose)"
  },
  "tirze_tg_15": {
    "titulo": "Tirzepatida TG 15mg",
    "texto": "_Ampola 15mg/0,5mL ou bujão único 60mg/2mL — mesma medição (30mg/mL)_\n\n2,5 mg → *8 UI*  (6 doses)\n5 mg → *17 UI*  (3 doses)\n7,5 mg → *25 UI*  (2 doses)\n10 mg → *33 UI*  (1 dose)\n12,5 mg → *42 UI*  (1 dose)\n15 mg → *50 UI*  (1 dose)"
  },
  "tirze_lipoless_15": {
    "titulo": "Tirzepatida Lipoless 15mg (4 ampolas)",
    "texto": "_Ampola 15mg/0,5mL — igual às outras marcas (kit 4 ampolas, total 60mg). Concentração 30mg/mL_\n\n2,5 mg → *8 UI*  (6 doses)\n5 mg → *17 UI*  (3 doses)\n7,5 mg → *25 UI*  (2 doses)\n10 mg → *33 UI*  (1 dose)\n12,5 mg → *42 UI*  (1 dose)\n15 mg → *50 UI*  (1 dose)"
  },
  "tirze_lipoless_md_15": {
    "titulo": "Tirzepatida Lipoless MD 15mg (bujão único)",
    "texto": "_A embalagem diz 15mg/0,6mL, mas na real são 60mg/2,4mL (mais líquido do que parece). Concentração 25mg/mL_\n\n2,5 mg → *10 UI*  (24 doses)\n5 mg → *20 UI*  (12 doses)\n7,5 mg → *30 UI*  (8 doses)\n10 mg → *40 UI*  (6 doses)\n12,5 mg → *50 UI*  (4 doses)\n15 mg → *60 UI*  (4 doses)"
  },
  "tirze_tirzec_15": {
    "titulo": "Tirzepatida Tirzec 15mg",
    "texto": "_Ampola 15mg/0,5mL ou bujão único 60mg/2mL — mesma medição (30mg/mL)_\n\n2,5 mg → *8 UI*  (6 doses)\n5 mg → *17 UI*  (3 doses)\n7,5 mg → *25 UI*  (2 doses)\n10 mg → *33 UI*  (1 dose)\n12,5 mg → *42 UI*  (1 dose)\n15 mg → *50 UI*  (1 dose)"
  },
  "tirze_lipoland_15": {
    "titulo": "Tirzepatida LipoLand 15mg",
    "texto": "_Ampola 15mg/0,5mL ou bujão único 60mg/2mL — mesma medição (30mg/mL)_\n\n2,5 mg → *8 UI*  (6 doses)\n5 mg → *17 UI*  (3 doses)\n7,5 mg → *25 UI*  (2 doses)\n10 mg → *33 UI*  (1 dose)\n12,5 mg → *42 UI*  (1 dose)\n15 mg → *50 UI*  (1 dose)"
  },
  "tirze_gluconex_15": {
    "titulo": "Tirzepatida Gluconex 15mg",
    "texto": "_Ampola 15mg/1mL — kit 4 ampolas (total 60mg)_\n\n2,5 mg → *17 UI*  (6 doses)\n5 mg → *33 UI*  (3 doses)\n7,5 mg → *50 UI*  (2 doses)\n10 mg → *67 UI*  (1 dose)\n12,5 mg → *83 UI*  (1 dose)\n15 mg → *100 UI*  (1 dose)"
  },
  "tirze_tirzedral_15": {
    "titulo": "Tirzepatida Tirzedral 15mg",
    "texto": "_Ampola 15mg/0,5mL — kit 4 ampolas (total 60mg)_\n\n2,5 mg → *8 UI*  (6 doses)\n5 mg → *17 UI*  (3 doses)\n7,5 mg → *25 UI*  (2 doses)\n10 mg → *33 UI*  (1 dose)\n12,5 mg → *42 UI*  (1 dose)\n15 mg → *50 UI*  (1 dose)"
  },
  "tirze_synedica_60": {
    "titulo": "Tirzepatida Synedica",
    "texto": "_Kit 4 frascos de 60mg cada — diluir CADA frasco_\n\n▪️ *Diluir em 2 mL de BAC:*\n2,5 mg → *8 UI*  (24 doses)\n5 mg → *17 UI*  (12 doses)\n7,5 mg → *25 UI*  (8 doses)\n10 mg → *33 UI*  (6 doses)\n12,5 mg → *42 UI*  (4 doses)\n15 mg → *50 UI*  (4 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n2,5 mg → *13 UI*  (24 doses)\n5 mg → *25 UI*  (12 doses)\n7,5 mg → *38 UI*  (8 doses)\n10 mg → *50 UI*  (6 doses)\n12,5 mg → *63 UI*  (4 doses)\n15 mg → *75 UI*  (4 doses)"
  },
  "tirze_zphc_150_liof": {
    "titulo": "Tirzepatida 150mg Liofilizada (ZPHC)",
    "texto": "_5 bujões de 30mg (total 150mg). Dilua CADA bujão separadamente. O kit traz 11mL de BAC no total._\n\n▪️ *Cada bujão em 2mL de BAC (por bujão):*\n2,5 mg → *17 UI*  (12 doses por bujão)\n5 mg → *33 UI*  (6 doses por bujão)\n7,5 mg → *50 UI*  (4 doses por bujão)\n10 mg → *67 UI*  (3 doses por bujão)\n12,5 mg → *83 UI*  (2 doses por bujão)\n15 mg → *100 UI*  (2 doses por bujão)\n\n▪️ *Cada bujão em 2,2mL de BAC (por bujão):*\n2,5 mg → *18 UI*  (12 doses por bujão)\n5 mg → *37 UI*  (6 doses por bujão)\n7,5 mg → *55 UI*  (4 doses por bujão)\n10 mg → *73 UI*  (3 doses por bujão)\n12,5 mg → *92 UI*  (2 doses por bujão)\n15 mg → *110 UI*  (2 doses por bujão)"
  },
  "tirze_combo_mix4": {
    "titulo": "Tirzepatida COMBO MIX 4 (total 60mg)",
    "texto": "_Kit 4 bujões de 15mg (1 de cada marca). Cada bujão em 0,5mL — medição padrão 15mg/0,5mL._\n\n2,5 mg → *8 UI*  (6 doses)\n5 mg → *17 UI*  (3 doses)\n7,5 mg → *25 UI*  (2 doses)\n10 mg → *33 UI*  (1 dose)\n12,5 mg → *42 UI*  (1 dose)\n15 mg → *50 UI*  (1 dose)"
  },
  "pept_10": {
    "titulo": "Peptídeo 10mg (qualquer marca)",
    "texto": "_Liofilizado 10mg_\n\n▪️ *Diluir em 2 mL de BAC:*\n250 mcg → *5 UI*  (40 doses)\n500 mcg → *10 UI*  (20 doses)\n750 mcg → *15 UI*  (13 doses)\n1000 mcg → *20 UI*  (10 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n250 mcg → *8 UI*  (40 doses)\n500 mcg → *15 UI*  (20 doses)\n750 mcg → *23 UI*  (13 doses)\n1000 mcg → *30 UI*  (10 doses)\n\n▪️ *Diluir em 5 mL de BAC:*\n250 mcg → *13 UI*  (40 doses)\n500 mcg → *25 UI*  (20 doses)\n750 mcg → *38 UI*  (13 doses)\n1000 mcg → *50 UI*  (10 doses)"
  },
  "pept_5": {
    "titulo": "Peptídeo 5mg (qualquer marca)",
    "texto": "_Liofilizado 5mg_\n\n▪️ *Diluir em 2 mL de BAC:*\n250 mcg → *10 UI*  (20 doses)\n500 mcg → *20 UI*  (10 doses)\n750 mcg → *30 UI*  (6 doses)\n1000 mcg → *40 UI*  (5 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n250 mcg → *15 UI*  (20 doses)\n500 mcg → *30 UI*  (10 doses)\n750 mcg → *45 UI*  (6 doses)\n1000 mcg → *60 UI*  (5 doses)\n\n▪️ *Diluir em 5 mL de BAC:*\n250 mcg → *25 UI*  (20 doses)\n500 mcg → *50 UI*  (10 doses)\n750 mcg → *75 UI*  (6 doses)\n1000 mcg → *100 UI*  (5 doses)"
  },
  "pept_20": {
    "titulo": "Peptídeo 20mg (BPC+TB / combos)",
    "texto": "_Liofilizado 20mg_\n\n▪️ *Diluir em 2 mL de BAC:*\n250 mcg → *3 UI*  (80 doses)\n500 mcg → *5 UI*  (40 doses)\n750 mcg → *8 UI*  (26 doses)\n1000 mcg → *10 UI*  (20 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n250 mcg → *4 UI*  (80 doses)\n500 mcg → *8 UI*  (40 doses)\n750 mcg → *11 UI*  (26 doses)\n1000 mcg → *15 UI*  (20 doses)\n\n▪️ *Diluir em 5 mL de BAC:*\n250 mcg → *6 UI*  (80 doses)\n500 mcg → *13 UI*  (40 doses)\n750 mcg → *19 UI*  (26 doses)\n1000 mcg → *25 UI*  (20 doses)"
  },
  "ghk_100": {
    "titulo": "GHK-Cu 100mg",
    "texto": "_Liofilizado 100mg_\n\n▪️ *Diluir em 2 mL de BAC:*\n1 mg → *2 UI*  (100 doses)\n2 mg → *4 UI*  (50 doses)\n3 mg → *6 UI*  (33 doses)\n4 mg → *8 UI*  (25 doses)\n5 mg → *10 UI*  (20 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n1 mg → *3 UI*  (100 doses)\n2 mg → *6 UI*  (50 doses)\n3 mg → *9 UI*  (33 doses)\n4 mg → *12 UI*  (25 doses)\n5 mg → *15 UI*  (20 doses)\n\n▪️ *Diluir em 5 mL de BAC:*\n1 mg → *5 UI*  (100 doses)\n2 mg → *10 UI*  (50 doses)\n3 mg → *15 UI*  (33 doses)\n4 mg → *20 UI*  (25 doses)\n5 mg → *25 UI*  (20 doses)"
  },
  "ghk_50": {
    "titulo": "GHK-Cu 50mg",
    "texto": "_Liofilizado 50mg_\n\n▪️ *Diluir em 2 mL de BAC:*\n1 mg → *4 UI*  (50 doses)\n2 mg → *8 UI*  (25 doses)\n3 mg → *12 UI*  (16 doses)\n4 mg → *16 UI*  (12 doses)\n5 mg → *20 UI*  (10 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n1 mg → *6 UI*  (50 doses)\n2 mg → *12 UI*  (25 doses)\n3 mg → *18 UI*  (16 doses)\n4 mg → *24 UI*  (12 doses)\n5 mg → *30 UI*  (10 doses)\n\n▪️ *Diluir em 5 mL de BAC:*\n1 mg → *10 UI*  (50 doses)\n2 mg → *20 UI*  (25 doses)\n3 mg → *30 UI*  (16 doses)\n4 mg → *40 UI*  (12 doses)\n5 mg → *50 UI*  (10 doses)"
  },
  "ahk_100": {
    "titulo": "AHK-Cu 100mg",
    "texto": "_Liofilizado 100mg_\n\n▪️ *Diluir em 2 mL de BAC:*\n1 mg → *2 UI*  (100 doses)\n2 mg → *4 UI*  (50 doses)\n3 mg → *6 UI*  (33 doses)\n4 mg → *8 UI*  (25 doses)\n5 mg → *10 UI*  (20 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n1 mg → *3 UI*  (100 doses)\n2 mg → *6 UI*  (50 doses)\n3 mg → *9 UI*  (33 doses)\n4 mg → *12 UI*  (25 doses)\n5 mg → *15 UI*  (20 doses)\n\n▪️ *Diluir em 5 mL de BAC:*\n1 mg → *5 UI*  (100 doses)\n2 mg → *10 UI*  (50 doses)\n3 mg → *15 UI*  (33 doses)\n4 mg → *20 UI*  (25 doses)\n5 mg → *25 UI*  (20 doses)"
  },
  "klow_80": {
    "titulo": "Klow 80mg",
    "texto": "_Liofilizado 80mg_\n\n▪️ *Diluir em 2 mL de BAC:*\n1 mg → *3 UI*  (80 doses)\n2 mg → *5 UI*  (40 doses)\n3 mg → *8 UI*  (26 doses)\n4 mg → *10 UI*  (20 doses)\n5 mg → *13 UI*  (16 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n1 mg → *4 UI*  (80 doses)\n2 mg → *8 UI*  (40 doses)\n3 mg → *11 UI*  (26 doses)\n4 mg → *15 UI*  (20 doses)\n5 mg → *19 UI*  (16 doses)\n\n▪️ *Diluir em 5 mL de BAC:*\n1 mg → *6 UI*  (80 doses)\n2 mg → *13 UI*  (40 doses)\n3 mg → *19 UI*  (26 doses)\n4 mg → *25 UI*  (20 doses)\n5 mg → *31 UI*  (16 doses)"
  },
  "glow_70": {
    "titulo": "Glow 70mg",
    "texto": "_Liofilizado 70mg_\n\n▪️ *Diluir em 2 mL de BAC:*\n1 mg → *3 UI*  (70 doses)\n2 mg → *6 UI*  (35 doses)\n3 mg → *9 UI*  (23 doses)\n4 mg → *11 UI*  (17 doses)\n5 mg → *14 UI*  (14 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n1 mg → *4 UI*  (70 doses)\n2 mg → *9 UI*  (35 doses)\n3 mg → *13 UI*  (23 doses)\n4 mg → *17 UI*  (17 doses)\n5 mg → *21 UI*  (14 doses)\n\n▪️ *Diluir em 5 mL de BAC:*\n1 mg → *7 UI*  (70 doses)\n2 mg → *14 UI*  (35 doses)\n3 mg → *21 UI*  (23 doses)\n4 mg → *29 UI*  (17 doses)\n5 mg → *36 UI*  (14 doses)"
  },
  "nad_500": {
    "titulo": "NAD+ 500mg",
    "texto": "_Liofilizado 500mg_\n\n▪️ *Diluir em 2 mL de BAC:*\n50 mg → *20 UI*  (10 doses)\n100 mg → *40 UI*  (5 doses)\n250 mg → *100 UI*  (2 doses)\n500 mg → *200 UI*  (1 dose)\n\n▪️ *Diluir em 3 mL de BAC:*\n50 mg → *30 UI*  (10 doses)\n100 mg → *60 UI*  (5 doses)\n250 mg → *150 UI*  (2 doses)\n500 mg → *300 UI*  (1 dose)\n\n▪️ *Diluir em 5 mL de BAC:*\n50 mg → *50 UI*  (10 doses)\n100 mg → *100 UI*  (5 doses)\n250 mg → *250 UI*  (2 doses)\n500 mg → *500 UI*  (1 dose)"
  },
  "nad_1000": {
    "titulo": "NAD+ 1000mg",
    "texto": "_Liofilizado 1000mg_\n\n▪️ *Diluir em 2 mL de BAC:*\n50 mg → *10 UI*  (20 doses)\n100 mg → *20 UI*  (10 doses)\n250 mg → *50 UI*  (4 doses)\n500 mg → *100 UI*  (2 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n50 mg → *15 UI*  (20 doses)\n100 mg → *30 UI*  (10 doses)\n250 mg → *75 UI*  (4 doses)\n500 mg → *150 UI*  (2 doses)\n\n▪️ *Diluir em 5 mL de BAC:*\n50 mg → *25 UI*  (20 doses)\n100 mg → *50 UI*  (10 doses)\n250 mg → *125 UI*  (4 doses)\n500 mg → *250 UI*  (2 doses)"
  },
  "cbl_20": {
    "titulo": "CBL-514 20mg",
    "texto": "_Liofilizado 20mg_\n\n▪️ *Diluir em 2 mL de BAC:*\n250 mcg → *3 UI*  (80 doses)\n500 mcg → *5 UI*  (40 doses)\n750 mcg → *8 UI*  (26 doses)\n1000 mcg → *10 UI*  (20 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n250 mcg → *4 UI*  (80 doses)\n500 mcg → *8 UI*  (40 doses)\n750 mcg → *11 UI*  (26 doses)\n1000 mcg → *15 UI*  (20 doses)\n\n▪️ *Diluir em 5 mL de BAC:*\n250 mcg → *6 UI*  (80 doses)\n500 mcg → *13 UI*  (40 doses)\n750 mcg → *19 UI*  (26 doses)\n1000 mcg → *25 UI*  (20 doses)"
  },
  "cbl_60": {
    "titulo": "CBL-514 60mg",
    "texto": "_Liofilizado 60mg_\n\n▪️ *Diluir em 2 mL de BAC:*\n250 mcg → *1 UI*  (240 doses)\n500 mcg → *2 UI*  (120 doses)\n750 mcg → *3 UI*  (80 doses)\n1000 mcg → *3 UI*  (60 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n250 mcg → *1 UI*  (240 doses)\n500 mcg → *3 UI*  (120 doses)\n750 mcg → *4 UI*  (80 doses)\n1000 mcg → *5 UI*  (60 doses)\n\n▪️ *Diluir em 5 mL de BAC:*\n250 mcg → *2 UI*  (240 doses)\n500 mcg → *4 UI*  (120 doses)\n750 mcg → *6 UI*  (80 doses)\n1000 mcg → *8 UI*  (60 doses)"
  },
  "ss31_50": {
    "titulo": "SS-31 50mg",
    "texto": "_Liofilizado 50mg_\n\n▪️ *Diluir em 2 mL de BAC:*\n250 mcg → *1 UI*  (200 doses)\n500 mcg → *2 UI*  (100 doses)\n750 mcg → *3 UI*  (66 doses)\n1000 mcg → *4 UI*  (50 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n250 mcg → *2 UI*  (200 doses)\n500 mcg → *3 UI*  (100 doses)\n750 mcg → *5 UI*  (66 doses)\n1000 mcg → *6 UI*  (50 doses)\n\n▪️ *Diluir em 5 mL de BAC:*\n250 mcg → *3 UI*  (200 doses)\n500 mcg → *5 UI*  (100 doses)\n750 mcg → *8 UI*  (66 doses)\n1000 mcg → *10 UI*  (50 doses)"
  },
  "motsc_40": {
    "titulo": "MOTS-c 40mg",
    "texto": "_Liofilizado 40mg_\n\n▪️ *Diluir em 2 mL de BAC:*\n250 mcg → *1 UI*  (160 doses)\n500 mcg → *3 UI*  (80 doses)\n750 mcg → *4 UI*  (53 doses)\n1000 mcg → *5 UI*  (40 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n250 mcg → *2 UI*  (160 doses)\n500 mcg → *4 UI*  (80 doses)\n750 mcg → *6 UI*  (53 doses)\n1000 mcg → *8 UI*  (40 doses)\n\n▪️ *Diluir em 5 mL de BAC:*\n250 mcg → *3 UI*  (160 doses)\n500 mcg → *6 UI*  (80 doses)\n750 mcg → *9 UI*  (53 doses)\n1000 mcg → *13 UI*  (40 doses)"
  },
  "epitalon_50": {
    "titulo": "Epitalon 50mg",
    "texto": "_Liofilizado 50mg_\n\n▪️ *Diluir em 2 mL de BAC:*\n250 mcg → *1 UI*  (200 doses)\n500 mcg → *2 UI*  (100 doses)\n750 mcg → *3 UI*  (66 doses)\n1000 mcg → *4 UI*  (50 doses)\n\n▪️ *Diluir em 3 mL de BAC:*\n250 mcg → *2 UI*  (200 doses)\n500 mcg → *3 UI*  (100 doses)\n750 mcg → *5 UI*  (66 doses)\n1000 mcg → *6 UI*  (50 doses)\n\n▪️ *Diluir em 5 mL de BAC:*\n250 mcg → *3 UI*  (200 doses)\n500 mcg → *5 UI*  (100 doses)\n750 mcg → *8 UI*  (66 doses)\n1000 mcg → *10 UI*  (50 doses)"
  }
};
async function buscarFracionamento(){ return FRAC_TABELAS; }
function _mgFrac(nome){ const m = _normNomeProd(nome).match(/(\d+(?:[.,]\d+)?)\s*mg/); return m ? parseFloat(m[1].replace(',','.')) : null; }
// De-para nome->slug(s). Específico ANTES do genérico. (validado com 46 nomes reais)
function slugsDoProduto(nome){
  const t = _normNomeProd(nome), mg = _mgFrac(nome);
  const has = function(){ for (var i=0;i<arguments.length;i++){ if(t.indexOf(arguments[i])<0) return false; } return true; };
  if (t.includes('tirzepatida') || /\b(tg|tirzec|lipoless|lipoland|gluconex|tirzedral)\b/.test(t)){
    if (has('combo')) return ['tirze_combo_mix4'];
    if (t.includes('synedica')) return ['tirze_synedica_60'];
    if (t.includes('gluconex')) return ['tirze_gluconex_15'];
    if (t.includes('tirzedral')) return ['tirze_tirzedral_15'];
    if (t.includes('lipoless')){
      if (/\bmd\b/.test(t)) return ['tirze_lipoless_md_15'];
      if (t.includes('ampola')) return ['tirze_lipoless_15'];
      return ['tirze_lipoless_15','tirze_lipoless_md_15'];
    }
    if (t.includes('lipoland')) return ['tirze_lipoland_15'];
    if (t.includes('tirzec')) return ['tirze_tirzec_15'];
    if (/\btg\b/.test(t)) return mg===10 ? ['tirze_tg_10'] : ['tirze_tg_15'];
    if (/150\s*mg/.test(t) || t.includes('liofil')) return ['tirze_zphc_150_liof'];
    return ['tirze_tg_15'];
  }
  if (t.includes('retatrutida') || t.includes('retatrutide') || /\breta\b/.test(t) || t.includes('retagen')){
    const liof = t.includes('liofil');
    if (t.includes('synedica')) return (t.includes('caneta') || mg===40) ? ['reta_synedica_40_caneta'] : ['reta_synedica_120_liof']; // 18/09: caneta 4×10mg (cliques) ≠ frasco 120mg (UI)
    if (t.includes('retagen')) return ['reta_retagen_oxygen_120'];
    if (t.includes('veltrane')){ if (t.includes('diamond')) return ['reta_veltrane_diamond_120']; if (t.includes('gold')) return ['reta_veltrane_gold_90']; return ['reta_veltrane_60']; }
    if (t.includes('oxygen')){ if (mg===160) return ['reta_oxygen_160_aq']; if (mg===60 && liof) return ['reta_oxygen_60_liof']; return ['reta_oxygen_80_aq']; }
    if (t.includes('zphc') || t.includes('zhpc')){ if (mg===15) return ['reta_zphc_15_liof']; if (liof) return mg===120 ? ['reta_zphc_120_liof'] : ['reta_zphc_60_liof']; return mg===120 ? ['reta_zphc_120_aq'] : ['reta_zphc_60_aq']; }
    return ['reta_zphc_60_aq'];
  }
  if (t.includes('ahk')) return ['ahk_100'];
  if (t.includes('ghk')) return mg===50 ? ['ghk_50'] : ['ghk_100'];
  if (t.includes('klow')) return ['klow_80'];
  if (t.includes('glow')) return ['glow_70'];
  if (t.includes('nad')) return mg>=1000 ? ['nad_1000'] : ['nad_500'];
  if (t.includes('cbl')) return mg===60 ? ['cbl_60'] : ['cbl_20'];
  if (t.includes('ss-31') || t.includes('ss31') || t.includes('elamipret')) return mg===50 ? ['ss31_50'] : ['pept_10'];
  if (t.includes('mots')) return mg===40 ? ['motsc_40'] : ['pept_10'];
  if (t.includes('epitalon') || t.includes('epithalon')) return mg===50 ? ['epitalon_50'] : ['pept_10'];
  if (t.includes('slupp')) return ['pept_5'];
  if (t.includes('cagril')) return ['pept_5'];
  const ehPept = /\b(bpc|tb-?500|ipamorelin|pt-?141|semax|selank|kpv|dsip|tesamorelin|kisspeptin|melanotan|mt-?2|5-?amino|cjc|hgh|frag|slupp|cagril|dac|aod)\b/.test(t);
  if (ehPept){ if (mg===20) return ['pept_20']; if (mg===5) return ['pept_5']; return ['pept_10']; }
  return [];
}
// Retorna array de textos de tabela (já formatados) pra um nome de produto.
async function tabelasDoProduto(nome){
  const frac = await buscarFracionamento();
  const out = [];
  slugsDoProduto(nome).forEach(function(sl){
    const it = frac[sl];
    if (it && it.texto) out.push('💉 *FRACIONAMENTO — ' + (it.titulo || nome) + '*\n' + it.texto);
  });
  return out;
}
// Junta as tabelas de vários produtos (usa produto que não tem tabela → aviso curto).
async function montarTabelas(nomes){
  const blocos = [];
  for (let i=0; i<(nomes||[]).length; i++){
    const ts = await tabelasDoProduto(nomes[i]);
    if (ts.length) blocos.push(ts.join('\n\n'));
    else blocos.push('ℹ️ *' + nomes[i] + '*: ainda não tenho tabela de fracionamento desse produto (posso te ajudar por aqui mesmo, se quiser).');
  }
  return blocos.join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
}
// Detecta pedido de TABELA DE FRACIONAMENTO (sem ser protocolo).
function ehPedidoFracionamento(nMsg){
  const t = ' ' + _normNomeProd(nMsg) + ' ';
  return /(fracionament|fracionar|como fraciono|tabela de dilui|tabela de fracion|quantas? ui|quantas unidades|marca[cç][aã]o na seringa|dilui[cç][aã]o|como dilu|quanto.{0,6}dilu)/.test(t)
    && !/pagamento|cupom|site|link/.test(t);
}
// Pergunta (após escolher o produto): protocolo completo (com tabela) OU só a tabela.
function msgProtoTipo(nomes){
  const lbl = (nomes && nomes.length>1) ? nomes.join(', ') : (nomes && nomes[0]) || 'seu produto';
  return `Fechou: *${lbl}*. 💪\n\nO que você quer?\n\n1️⃣ *Protocolo completo* (já vem com a *tabela de fracionamento* junto)\n2️⃣ *Só a tabela de fracionamento*\n\n_Digite *1* ou *2*._`;
}

// ── PARCELAMENTO (simulação InfinitePay) ──────────────────────────────────────
// Fatores PRECISOS extraídos das simulações reais da InfinitePay (batem centavo a
// centavo). parcela = total × fator ÷ nº. À vista no Pix = SEM juros. Juros só no cartão.
const FATOR_PARCELAS = {1:1.04384,2:1.064859,3:1.075382,4:1.085923,5:1.096495,6:1.107061,7:1.144083,8:1.155127,9:1.166218,10:1.177394,11:1.188767,12:1.2};
function _rBRL(v){ return (Math.round(v*100)/100).toFixed(2).replace('.',','); }
function simularParcelas(valor){
  const V = Number(valor) || 0;
  if (V <= 0) return null;
  let txt = `💳 *SIMULAÇÃO DE PAGAMENTO — R$ ${_rBRL(V)}*\n\n✅ *À vista no Pix:* R$ ${_rBRL(V)} _(sem juros!)_\n\n*No cartão* (parcelado, taxas da InfinitePay):\n`;
  for (let nP = 1; nP <= 12; nP++){ txt += `${nP}x de R$ ${_rBRL(V * FATOR_PARCELAS[nP] / nP)}\n`; }
  txt += `\n_No próprio *link de pagamento* você escolhe em quantas vezes quer pagar (até 12x)._`;
  return txt;
}
// Detecta interesse em PARCELAR. (não confunde com rastreio/cupom)
function ehPedidoParcelamento(nMsg){
  const t = ' ' + _normNomeProd(nMsg) + ' ';
  return /(parcel|em quantas vezes|quantas vezes|no cartao|cartao de credito|prestacao|\ba prazo\b|em ate 12|em \d+ ?x|\d+ ?vezes|dividir o pagamento|dividir em)/.test(t)
    && !/rastre|codigo|cupom/.test(t);
}
// Resolve o valor base pra simular: total do pedido > total do carrinho > número na msg.
function baseParcelamento(session, nMsg){
  let base = (session && session.total) || totalCarrinho((session && session.carrinho) || []) || 0;
  if (base <= 0 && nMsg){
    const m = String(nMsg).replace(/\.(?=\d{3}\b)/g,'').match(/(\d{2,7})(?:,(\d{2}))?/);
    if (m) base = parseFloat(m[1] + (m[2] ? '.' + m[2] : ''));
  }
  return base;
}

// ── Desconto Athena e Cupons ──────────────────────────────────────────────────
const DESCONTO_ATHENA_PCT = 3;
// ── PROMO DIA DOS PAIS: compre 2+ do MESMO produto → 10% off nessas unidades ──
// Automática. NÃO acumula com o 3%/cupom: produto em dobro leva só os 10%; o 3%/cupom vale nos demais. Expira sozinha em PROMO_DOBRO.fim.
// Pra desligar: ativa:false.
const PROMO_DOBRO = { ativa: false, pct: 10, qtdMin: 2, fim: '2026-08-09T23:59:59-03:00' };
function promoDobroAtiva(){ return PROMO_DOBRO.ativa && Date.now() <= new Date(PROMO_DOBRO.fim).getTime(); }

// ── SEMANA DO CLIENTE (desconto por FAIXA do valor de PRODUTOS — varejo, automático) ──────────
// Não acumula com 3%/cupom/promo: vale sempre o MAIOR. Atacado NÃO entra. Liga/desliga pela data.
const PROMO_SEMANA_CLIENTE = {
  ativa: true,
  ini: '2026-09-13T00:00:00-03:00',
  fim: '2026-09-20T23:59:59-03:00',   // 19/09: estendida até domingo 20/09 (Thiago)
  faixas: [ { min: 500, desc: 50 }, { min: 1000, desc: 100 }, { min: 1500, desc: 225 }, { min: 2000, desc: 300 } ]  // R$
};
function semanaClienteAtiva(){
  const p = PROMO_SEMANA_CLIENTE;
  if (!p.ativa) return false;
  const agora = Date.now();
  return agora >= new Date(p.ini).getTime() && agora <= new Date(p.fim).getTime();
}
// Retorna o R$ de desconto da MAIOR faixa que o valor de produtos alcança (0 se fora da promo/data).
function descontoSemanaCliente(baseReais){
  if (!semanaClienteAtiva()) return 0;
  let d = 0;
  PROMO_SEMANA_CLIENTE.faixas.forEach(f => { if (baseReais >= f.min && f.desc > d) d = f.desc; });
  return d;
}
// desconto (R$) que a promo dá no carrinho: pct% nas unidades dos produtos com qtd >= qtdMin
function descPromoDobro(carrinho){
  if (!promoDobroAtiva()) return 0;
  return (carrinho || []).reduce(function(s,i){
    return s + ((i && i.qtd >= PROMO_DOBRO.qtdMin) ? (i.preco * i.qtd * PROMO_DOBRO.pct / 100) : 0);
  }, 0);
}

// ── PROMOÇÃO DO MOMENTO (editável) ───────────────────────────────────────────
// Para trocar a promoção no futuro, edite só este bloco.
// - Desconto por PRODUTO: liste os nomes EXATOS em `produtos`.
// - Desconto por COLEÇÃO: liste os handles em `colecoes` (ex: 'peptideos','emagrecedores').
// - Pode usar os dois ao mesmo tempo. Para desligar tudo: ativa:false.
const PROMO_PRODUTO = {
  ativa: false,
  pct: 10,
  validade: '',
  produtos: [],
  colecoes: [],
  titulo: '',
  linkProduto: '',
  linkGrupo: '',
};
function _normNomeProd(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim(); }
// \u2500\u2500 Promo G\u00eanesis "Compre 2, Leve 3" (o 3\u00ba gr\u00e1tis, mesma linha) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Todo produto G\u00eanesis tem "G\u00eanesis" no nome no cat\u00e1logo, ent\u00e3o detecto por isso.
// Marca = "Gênesis Peptídeos". Uso \bgenesis\b (palavra inteira) pra NÃO pegar "Biogenesis" (outra marca).
function ehLinhaGenesis(nome){ return /\bgenesis\b/.test(_normNomeProd(nome)); }
// Um item conta como Gênesis se foi ESCOLHIDO na lista da promo (flag item.genesis)
// OU se o nome tem a marca. A flag garante que o brinde dispare mesmo que o nome
// gravado no carrinho não traga o texto "Gênesis" (ex.: nome curto/sem marca).
function itemEhGenesis(i){ return !!(i && (i.genesis || ehLinhaGenesis(i.nome))); }
function contarGenesis(carrinho){ return (carrinho||[]).reduce((a,i)=> a + (itemEhGenesis(i) ? (i.qtd||1) : 0), 0); }
function msgPerguntaBrinde(carrinho){
  return `\ud83c\udf81 *Promo\u00e7\u00e3o G\u00eanesis: Compre 2, Leve 3!*\n\nVoc\u00ea tem *${contarGenesis(carrinho)}* itens da linha *G\u00eanesis* no carrinho \u2014 ent\u00e3o voc\u00ea tem *brinde*! \ud83e\udd73\n\n*Qual produto da G\u00eanesis Pept\u00eddeos voc\u00ea quer ganhar de brinde* (o 3\u00ba gr\u00e1tis)?\n\n_Me escreve o nome (ex.: Klow, Glow, GHK-Cu, CJC sem DAC, Ipamorelin, HGH Frag, BPC-157 + TB-500)._`;
}
// Entra no checkout: se for promo G\u00eanesis (2+ itens da linha) e o cliente AINDA n\u00e3o escolheu
// o brinde, PERGUNTA O BRINDE ANTES DO FRETE (sen\u00e3o a promo se perde no fechamento).
// Se j\u00e1 escolheu (ou j\u00e1 foi oferecido), segue direto pro estado/frete.
async function irParaCheckout(session, sid, respond) {
  const carrinho = session.carrinho || [];
  if (PROMO_GENESIS.ativa && !session.brinde && !session.brindeOferecido && contarGenesis(carrinho) >= 2) {
    await saveSession(sid, { ...session, state:'ESCOLHER_BRINDE', brindeOferecido: true });
    return respond(msgPerguntaBrinde(carrinho));
  }
  await saveSession(sid, { ...session, state:'ESTADO' });
  return respond(`Perfeito, vamos fechar seu pedido! \ud83d\uded2\n\n${resumoCarrinho(carrinho)}\n\n*De qual estado voc\u00ea \u00e9?* (pra eu calcular o frete)\nExemplo: RJ, SP, MG, DF, BA...`);
}

// \u2500\u2500 PROTOCOLO s\u00f3 p\u00f3s-compra + travado por CPF (s\u00f3 monta com o que o cliente J\u00c1 comprou) \u2500\u2500
// Detecta quando o cliente quer que a Athena MONTE um protocolo/plano pra ele, ou analisar exame.
// (Pergunta informativa tipo "qual o protocolo da retatrutida?" N\u00c3O cai aqui \u2014 vai pra IA com teaser.)
function ehPedidoProtocoloCompleto(nMsg){
  const t = ' ' + (nMsg||'') + ' ';
  const querMontar = /(monta|montar|monte|faz |fazer|fa\u00e7a|faca|cria |criar|crie|quero|preciso|me monta|me faz|manda|me passa)/.test(t);
  const alvo = /(protocolo|plano|ciclo|stack completo|esquema)/.test(t);
  const exame = /(analis|avali|ver|le[ir]|leia).{0,15}exame|meu exame|meus exames/.test(t);
  const frasesFortes = /(meu protocolo|protocolo completo|protocolo personalizado|monta.{0,15}protocolo|meu plano|plano completo)/.test(t);
  // A palavra "protocolo" (sozinha ou em qualquer forma) j\u00e1 \u00e9 sinal forte de pedido de protocolo.
  const temProtocolo = /protocolo/.test(t);
  // "como usar / ensinar a usar / dose / posologia" tamb\u00e9m conta como protocolo (\u00e9 ensinar a usar).
  // Mas N\u00c3O gatilha em cupom/site/pagamento, nem em "pra que serve / o que \u00e9 / combina" (isso \u00e9 explica\u00e7\u00e3o, liberado).
  const comoUsar = /(como (uso|usar|usa|toma|tomar|aplica|aplicar|utiliza|utilizar|faz pra usar)|me ensina|ensina[r]? (a |como )?(usar|aplicar|tomar)|posologia|qual.{0,5}dose|dosagem certa|quanto.{0,8}(tomar|aplicar|usar por))/.test(t)
    && !/cupom|site|desconto|codigo|c\u00f3digo|pagar|pagamento|\bapp\b|link|rastre/.test(t);
  return temProtocolo || (querMontar && alvo) || exame || frasesFortes || comoUsar;
}
// Extrai a lista de produtos (nomes limpos, sem duplicar) dos pedidos PAGOS retornados pelo consultar_status.
function extrairProdutosDosPedidos(pedidos){
  // v85: o campo PRODUTOS vem em vários formatos — "A (R$ 99,00 un.) x1, B (R$ 79,00 un.) x2, Frete Transportadora — SP (R$ 75,00 un.) x1"
  // (site/Athena), "1x A | 2x B" (manual) e outros. Antes só separava por | ; e quebra de linha: o pedido inteiro virava UM "produto",
  // com "( un.)" e o frete dentro. Agora separa também por vírgula FORA de parênteses (o "2,5mg" e o "(BPC, TB-500)" ficam inteiros).
  const set = new Set();
  const separar = txt => {
    const out = []; let cur = '', prof = 0;
    const t = String(txt || '');
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (ch === '(') prof++;
      else if (ch === ')') prof = Math.max(0, prof - 1);
      if (ch === '|' || ch === ';' || ch === '\n' || (ch === ',' && prof === 0 && /\s/.test(t[i + 1] || ' '))) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  };
  (pedidos||[]).forEach(p => {
    separar(p && p.produtos).forEach(part => {
      let nome = String(part)
        .replace(/\(\s*R\$\s*[\d.,]+\s*(un\.?)?\s*\)/gi, ' ')   // "(R$ 99,00 un.)"
        .replace(/\(\s*(un\.?)?\s*\)/gi, ' ')                    // "( un.)" e "()"
        .replace(/R\$\s*[\d.,]+/g, ' ')
        .replace(/(^|\s)x\s*\d+\s*$/i, ' ')                      // "… x2" no fim
        .replace(/^\s*\d+\s*x\s+/i, '')                          // "2x …" no começo
        .replace(/\s{2,}/g, ' ').trim();
      nome = nome.replace(/^[-•.\)\s]+/, '').replace(/[\s,]+$/, '').trim();
      if (!nome || nome.length <= 2) return;
      if (/^(frete|transportadora|pac|sedex|seguro|gr[aá]tis)(\s|$|[^a-zà-ú])/i.test(nome)) return;   // frete não é produto
      set.add(nome);
    });
  });
  return [...set].slice(0, 12);
}
// um item do carrinho entra na promoção se casar por NOME (produtos) ou por COLEÇÃO (colecoes)
function ehProdutoPromo(item){
  if (!PROMO_PRODUTO.ativa) return false;
  const nome = typeof item === 'string' ? item : (item && item.nome);
  const colItem = (item && typeof item === 'object') ? (item.colecao || '') : '';
  const porNome = (PROMO_PRODUTO.produtos || []).some(p => _normNomeProd(p) === _normNomeProd(nome));
  const porColecao = colItem && (PROMO_PRODUTO.colecoes || []).indexOf(colItem) >= 0;
  return porNome || porColecao;
}
const FIRESTORE_PROJECT = 'pricehub-f0236';
const FIRESTORE_KEY = 'AIzaSyBxaI82P6OjCoPtBA-kNZZ0-F0RdjYdNhw';

// v92: Primobolan 100mg - Cooper Pharma, de R$ 1.499 por R$ 899, só 08/10 até 23h59 (ou enquanto durar o estoque).
// `fim`: depois dessa hora a promoção some sozinha de todos os lugares. Pra desligar antes: ativa:false.
// (A anterior era a do MyoMax Inibition™, de R$ 1.598 por R$ 999 — já encerrada.)
const PROMO_RELAMPAGO = {
  ativa: true,
  fim: '2026-10-08T23:59:59-03:00',
  validade: 'só hoje até 23h59 ou enquanto durarem os estoques',
  titulo: 'PROMOÇÃO RELÂMPAGO — Primobolan 100mg Cooper Pharma',
  link: 'https://vitaflowoficial.com/products/1772046866667-s8ppx',
  produtos: [
    { nome: 'Primobolan 100mg - Cooper Pharma', de: 1499, por: 899 },
  ],
};
function promoAtiva() {
  if (PROMO_RELAMPAGO.fim && Date.now() > new Date(PROMO_RELAMPAGO.fim).getTime()) return null;
  return (PROMO_RELAMPAGO.ativa && PROMO_RELAMPAGO.produtos && PROMO_RELAMPAGO.produtos.length) ? PROMO_RELAMPAGO : null;
}
function reais(n) { return Number(n || 0).toLocaleString('pt-BR'); }
// Formata o CPF no padrão 000.000.000-00. Só formata quando há EXATAMENTE 11 dígitos
// (aceita o cliente digitar com ou sem pontuação); se não for 11 dígitos, devolve o
// que veio (não corrompe/inventa dado).
function formatarCPF(cpf){
  var d = String(cpf == null ? '' : cpf).replace(/\D/g, '');
  if (d.length !== 11) return String(cpf == null ? '' : cpf).trim();
  return d.slice(0,3) + '.' + d.slice(3,6) + '.' + d.slice(6,9) + '-' + d.slice(9);
}

// ── PROMO_ANUNCIO: desligado (Namorados encerrado). A promoção atual é a PROMO_PRODUTO (opção 8). ──
const PROMO_ANUNCIO = { ativa: false };

// ── PROMOÇÃO RELÂMPAGO GÊNESIS (compre 3 peptídeos Gênesis, ganhe 1 GHK-Cu 100mg) — SÓ DIVULGAÇÃO ──
// A Athena apenas DIVULGA a promo. O brinde (GHK-Cu 100mg) é conferido/aplicado manualmente no fechamento.
// Pra desligar: ativa:false.
const PROMO_GENESIS_3x1 = { ativa: false };
const MSG_PROMO_GENESIS_3X1 = `⚡ *PROMOÇÃO RELÂMPAGO — GÊNESIS PEPTÍDEOS!* 🧬

Na compra de *3 peptídeos da marca Gênesis*, você ganha *1 GHK-Cu 100mg GRÁTIS*! 🎁

Pode *misturar* os produtos da linha Gênesis — juntou 3, o GHK-Cu 100mg vai de brinde. 💪

⏳ *Só enquanto durar o estoque!*

_E lembrando: comprando comigo você já ganha *3% de desconto* em todos os produtos. 😉_`;

// ══════════════════════════════════════════════════════════════════════════════
// MODO ADM / PROGRAMADOR — Thiago testa a Athena e puxa protocolo/tabela na hora,
// sem a trava de "só do que o cliente já comprou".
// Ativação: mensagem tem que vir de um número da lista E trazer a senha.
// ══════════════════════════════════════════════════════════════════════════════
const ADM_NUMEROS = [
  '5511911338515'   // ⚠️ CONFIRA/AJUSTE: números autorizados (só dígitos, com o 55)
];
const ADM_SENHA = 'vfadm2026';        // ⚠️ TROQUE esta senha

function ehNumeroAdm(sid){
  const s = String(sid || '').replace(/\D/g, '');
  return ADM_NUMEROS.some(n => String(n).replace(/\D/g, '') === s);
}
// "adm <senha>" — só entra se o número TAMBÉM estiver autorizado.
function tentaEntrarAdm(sid, mensagem){
  if (!ehNumeroAdm(sid)) return false;
  const m = String(mensagem || '').trim().toLowerCase();
  return m === 'adm ' + ADM_SENHA.toLowerCase() || m === ADM_SENHA.toLowerCase();
}

function msgAdmMenu(){
  return `🔧 *MODO ADM* — Athena\n\n` +
    `*tabela <produto>* — tabela de fracionamento de qualquer produto\n` +
    `   _ex: tabela reta 120 zphc_\n\n` +
    `*protocolo <produto>* — protocolo completo, sem precisar de CPF\n` +
    `   _ex: protocolo tirzepatida 15mg_\n\n` +
    `*tabelas* — lista todas as tabelas que eu tenho\n\n` +
    `*promo* — mostra o que eu sei de promoção/sorteio agora\n\n` +
    `*sair* — volta ao atendimento normal\n\n` +
    `_Você está no modo ADM. Os clientes não têm acesso a isto._`;
}

// Lista todas as tabelas de fracionamento embutidas.
async function msgAdmTabelas(){
  const frac = await buscarFracionamento();
  const chaves = Object.keys(frac || {});
  if (!chaves.length) return `Não encontrei nenhuma tabela cadastrada.`;
  const linhas = chaves.map((k, i) => `${i + 1}. *${(frac[k] && frac[k].titulo) || k}*\n   _slug:_ \`${k}\``);
  return `📋 *TABELAS DE FRACIONAMENTO* — ${chaves.length} cadastradas\n\n` + linhas.join('\n');
}

// Tabela de um produto qualquer (sem trava de compra).
async function msgAdmTabela(termo){
  const nome = String(termo || '').trim();
  if (!nome) return `Me diz o produto. _Ex: tabela reta 120 zphc_`;
  const ts = await tabelasDoProduto(nome);
  if (ts.length) return ts.join('\n\n');
  // não casou pelo reconhecedor: tenta achar pelo título
  const frac = await buscarFracionamento();
  const alvo = _normNomeProd(nome);
  const achados = Object.keys(frac).filter(k => {
    const t = _normNomeProd((frac[k] && frac[k].titulo) || k);
    return alvo.split(/\s+/).filter(Boolean).every(w => t.indexOf(w) >= 0);
  });
  if (achados.length === 1){
    const it = frac[achados[0]];
    return '💉 *FRACIONAMENTO — ' + (it.titulo || achados[0]) + '*\n' + it.texto;
  }
  if (achados.length > 1){
    return `Achei ${achados.length} tabelas com "${nome}":\n\n` +
      achados.map((k, i) => `${i + 1}. *${(frac[k] && frac[k].titulo) || k}*`).join('\n') +
      `\n\n_Manda mais específico, ou use o slug: *tabela <slug>*_`;
  }
  return `Não tenho tabela pra "${nome}". Use *tabelas* pra ver a lista completa.`;
}

// Protocolo de qualquer produto — dispara a mesma IA do pós-venda, sem exigir CPF.
async function admProtocolo(sid, termo){
  const nome = String(termo || '').trim();
  if (!nome) return `Me diz o produto. _Ex: protocolo tirzepatida 15mg_`;
  const tabelas = await montarTabelas([nome]);
  dispararIAProtocolo(sid, [nome], tabelas);
  return `💪 Montando o *protocolo de ${nome}*…\n\nA IA vai mandar aqui em seguida (leva alguns segundos).\n\n_Modo ADM: sem trava de CPF._`;
}

// ══════════════════════════════════════════════════════════════════════════════
// CUPOM VALE-COMPRAS — abate PRODUTOS + FRETE, até o valor do vale.
// Sem troco: gastou menos, perde a diferença. Gastou mais, paga o resto.
// ══════════════════════════════════════════════════════════════════════════════
function ehCupomVale(tipo){ return String(tipo || '') === 'vale'; }

// ══════════════════════════════════════════════════════════════════════════════
// SORTEIO QUINZENAL — divulgação + consulta dos números pelo CPF
// Ligado em 22/08/2026. Pra desligar: ativa:false (some de tudo: menu, IA e texto).
// ══════════════════════════════════════════════════════════════════════════════
const SORTEIO = {
  ativa: true,
  link: 'https://vitaflowoficial.com/pages/sorteio',
  premio: 'R$ 1.000',
  porNumero: 100
};

// Ciclo vigente — MESMA conta do GAS e da página. Nunca precisa trocar data.
// CALENDÁRIO DA FEDERAL — corrigido em 05/09/2026. A Caixa mudou em julho/2026:
// os concursos de sábado passaram para DOMINGO. Hoje é quarta 20h e domingo 11h.
// Ciclo fecha SÁBADO 23:59:59 e apura no DOMINGO seguinte às 11h.
//   C-01 sáb 22/08 → sex 04/09 · apura dom 06/09 11h   (transição)
//   C-02 sáb 05/09 → sáb 19/09 · apura dom 20/09 11h   (transição, 15 dias)
//   C-03+ abre DOMINGO → fecha SÁBADO · apura DOMINGO 11h
const SORT_C1 = new Date(2026, 7, 22, 0, 0, 0);
const SORT_C2 = new Date(2026, 8,  5, 0, 0, 0);
const SORT_C3 = new Date(2026, 8, 20, 0, 0, 0);
const SORT_HORA = 11;
const SORT_PASSO = 14 * 86400000;
const DIAS_SEMANA_SORT = ['domingo','segunda-feira','terça-feira','quarta-feira',
                          'quinta-feira','sexta-feira','sábado'];
function sorteioCicloAtual(){
  const hoje = new Date();
  if (hoje < SORT_C2) return { ini: SORT_C1, fim: new Date(SORT_C2.getTime()-1000),
                               sorteio: new Date(2026, 8, 6, SORT_HORA, 0, 0) };
  if (hoje < SORT_C3) return { ini: SORT_C2, fim: new Date(SORT_C3.getTime()-1000),
                               sorteio: new Date(SORT_C3.getFullYear(), SORT_C3.getMonth(), SORT_C3.getDate(), SORT_HORA, 0, 0) };
  let k = Math.floor((hoje - SORT_C3) / SORT_PASSO); if (k < 0) k = 0;
  const ini  = new Date(SORT_C3.getTime() + k * SORT_PASSO);
  const vira = new Date(ini.getTime() + SORT_PASSO);
  return { ini, fim: new Date(vira.getTime()-1000),
           sorteio: new Date(vira.getFullYear(), vira.getMonth(), vira.getDate(), SORT_HORA, 0, 0) };
}
// Dia da semana do sorteio — calculado, nunca escrito na mão.
function sorteioDiaSemana(c){ return DIAS_SEMANA_SORT[c.sorteio.getDay()]; }
// Hora do sorteio ('11h') — SEMPRE lida do próprio ciclo, NUNCA escrita na mão.
// Em 05/09 a constante virou 11h e os textos continuaram dizendo '20h' em 11 lugares,
// em 5 sistemas. Se a hora mudar de novo, todo texto acompanha sozinho. (06/09/2026)
function sorteioHoraTxt(c){ return `${c.sorteio.getHours()}h`; }
function sorteioDDMM(d){ const p = n => String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)}`; }
function sorteioDiasRestantes(){
  const c = sorteioCicloAtual();
  const ms = c.fim.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 86400000));
}

// Consulta os números do CPF no GAS (mesma URL que o rastreio já usa).
async function consultarSorteioGAS(cpf){
  try {
    const r = await fetch(GAS_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'sorteio_consultar', cpf: String(cpf||'').replace(/\D/g,'') })
    });
    const d = await r.json();
    return (d && d.success) ? d : null;
  } catch { return null; }
}

// Texto de divulgação (usado no menu e quando o cliente pergunta do sorteio).
function msgSorteio(){
  const c = sorteioCicloAtual();
  const dias = sorteioDiasRestantes();
  return `🎲 *SORTEIO QUINZENAL VITAFLOW*\n\n` +
    `A cada *R$ ${SORTEIO.porNumero} em produtos* você ganha *1 número da sorte* — e concorre a um ` +
    `*vale-compras de ${SORTEIO.premio} na VitaFlow*! 🎁\n\n` +
    `📅 *Ciclo atual:* ${sorteioDDMM(c.ini)} a ${sorteioDDMM(c.fim)}` +
    (dias > 0 ? ` _(fecha em ${dias} ${dias === 1 ? 'dia' : 'dias'})_` : '') + `\n` +
    `🍀 *Sorteio:* ${sorteioDiaSemana(c)} ${sorteioDDMM(c.sorteio)} às ${sorteioHoraTxt(c)}, pela *Loteria Federal*\n\n` +
    `_Vale a soma de todas as suas compras no período — não precisa ser num pedido só._\n\n` +
    `Quer saber quantos números você já tem? Me manda o seu *CPF*. 😉`;
}

/* ══════════════════════════════════════════════════════════════════════════
   MENSAGEM 3 PÓS-VENDA — números da sorte. Adicionado em 22/08/2026.
   MESMA conta do GAS e do sistema de orçamento: base = total pago − frete.
   session.total  = produtos (já com desconto) + frete
   frete.valor    = frete final (0 quando é grátis / atacado)

   TIMING: nesta altura do código o pedido AINDA NÃO foi para o GAS
   (salvarPedidoGAS roda depois, no bloco "trabalho pesado"). Então o que o GAS
   devolve é o acumulado ANTERIOR, e o total do ciclo é anterior + esta compra.
   Se o webhook for reentregue e o GAS já tiver este pedido, ele aparece em
   pedidos[] e a soma NÃO é feita de novo.

   A consulta usa timeout curto: se o GAS demorar, a mensagem sai só com os
   números desta compra. O recibo NUNCA fica esperando o GAS.
   Para desligar junto com o resto: SORTEIO.ativa = false.
   ══════════════════════════════════════════════════════════════════════════ */
const SORTEIO_TIMEOUT_MS = 4000;

// Consulta o acumulado do ciclo. Devolve o objeto do GAS ou null (nunca lança).
async function consultarAcumuladoSorteio(cpf, ms){
  const doc = String(cpf || '').replace(/\D/g, '');
  if (doc.length !== 11) return null;
  try {
    const r = await fetchT(GAS_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'sorteio_consultar', cpf: doc })
    }, ms || SORTEIO_TIMEOUT_MS);
    const d = await r.json();
    return (d && d.success !== false) ? d : null;
  } catch (e) { return null; }
}

// Monta o texto. Pura e síncrona de propósito — `acum` é o retorno de
// consultarAcumuladoSorteio (ou null). Devolve '' quando não há nada a dizer.
function blocoSorteioPosVenda(totalPago, freteValor, nomeCliente, acum, numPedido){
  if (!SORTEIO.ativa) return '';
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const baseDesta = r2((Number(totalPago) || 0) - (Number(freteValor) || 0));
  if (baseDesta <= 0) return '';

  // Acumulado do ciclo = o que o GAS já tem + esta compra (se ainda não contada).
  let baseTotal = baseDesta;
  if (acum) {
    const baseGas = Number(acum.base) || 0;
    const chave   = x => String(x || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const alvo    = chave(numPedido);
    let jaContou  = false;
    const peds = acum.pedidos || [];
    for (let i = 0; i < peds.length; i++){
      if (alvo && chave(peds[i] && peds[i].pedido) === alvo) { jaContou = true; break; }
    }
    baseTotal = jaContou ? r2(baseGas) : r2(baseGas + baseDesta);
    if (baseTotal < baseDesta) baseTotal = baseDesta;   // nunca mostra menos que a própria compra
  }

  const c        = sorteioCicloAtual();
  const quando   = `*${sorteioDiaSemana(c)}, ${sorteioDDMM(c.sorteio)}, às ${sorteioHoraTxt(c)}*`;
  const nDesta   = Math.floor(baseDesta / SORTEIO.porNumero);
  const nTotal   = Math.floor(baseTotal / SORTEIO.porNumero);
  const sobra    = r2(baseTotal - nTotal * SORTEIO.porNumero);
  const falta    = r2(SORTEIO.porNumero - sobra);
  const brl      = v => Number(v || 0).toFixed(2).replace('.', ',');
  const anterior = r2(baseTotal - baseDesta);
  const primeiro = String(nomeCliente || '').trim().split(/\s+/)[0];

  let t = `🍀 *SORTEIO QUINZENAL VITAFLOW*\n\n`;
  if (primeiro) t += `Olá, *${primeiro}*! `;

  if (nDesta > 0){
    t += `Sua compra te deu *${nDesta} número${nDesta > 1 ? 's' : ''} da sorte*! 🎉\n\n`;
    if (anterior > 0 && nTotal > nDesta){
      t += `Somando com suas compras anteriores deste ciclo, você está com *${nTotal} números* no total. 🔥\n\n`;
    }
  } else if (nTotal > 0){
    // A compra sozinha não fechou R$ 100, mas o acumulado do ciclo já tinha número.
    t += `Esta compra somou *R$ ${brl(baseDesta)}* ao seu acumulado do ciclo — você está com `;
    t += `*${nTotal} número${nTotal > 1 ? 's' : ''} da sorte*! 🎉\n\n`;
  } else {
    t += `Faltam apenas *R$ ${brl(falta)}* pro seu 1º número da sorte! 🎲\n\n`;
    t += `A cada *R$ ${SORTEIO.porNumero} em produtos* você ganha um número e concorre a um `;
    t += `*vale-compras de ${SORTEIO.premio} na VitaFlow* no sorteio de ${quando}, pela Loteria Federal. `;
    t += `O acumulado vale até *${sorteioDDMM(c.fim)}*.\n`;
  }

  if (nTotal > 0){
    t += `Você está concorrendo a um *vale-compras de ${SORTEIO.premio} na VitaFlow* no sorteio de ${quando}, pela Loteria Federal.\n`;
    if (sobra > 0){
      t += `\nE faltam apenas *R$ ${brl(falta)}* pro seu ${nTotal + 1}º número — o acumulado vale até `;
      t += `*${sorteioDDMM(c.fim)}*, somando qualquer compra nova. 😏\n`;
    }
  }

  t += `\n🔎 *Confira quando quiser:*\n${SORTEIO.link}\n`;
  t += `Ou me manda seu *CPF* aqui mesmo que eu te falo na hora. 😉\n\n`;
  // ITEM 4 (06/09/2026): o número entra no ciclo que estiver aberto na hora do
  // PAGAMENTO, não na hora do pedido. Se o cliente fecha o pedido hoje e paga
  // depois da virada, o número sai no ciclo seguinte — a mensagem não pode
  // prometer um ciclo que talvez não seja o dele.
  t += `_Os números saem poucos segundos depois da confirmação do pagamento — e valem para o ciclo que estiver aberto nesse momento._\n\n`;
  t += `Ninguém vê os números de ninguém — só você enxerga os seus. 🍀`;
  return t;
}

// Resposta com os números do cliente.
function msgMeusNumeros(d){
  const c = sorteioCicloAtual();
  const dias = sorteioDiasRestantes();
  const nums = (d && d.numeros) || [];
  const base = Number((d && d.base) || 0);

  if (!nums.length) {
    if (base > 0) {
      const falta = 100 - (base % 100);
      return `🎲 *Seus números da sorte*\n\n` +
        `Você já comprou *R$ ${reais(base)}* neste ciclo — faltam só *R$ ${reais(falta)}* pro seu ` +
        `*primeiro número*! 🍀\n\n` +
        `Quer que eu monte um pedidinho pra fechar essa faixa? É só me dizer o produto. 😉\n\n` +
        `_Ciclo até ${sorteioDDMM(c.fim)} · sorteio ${sorteioDiaSemana(c)} ${sorteioDDMM(c.sorteio)} às ${sorteioHoraTxt(c)}_`;
    }
    return `🎲 *Seus números da sorte*\n\n` +
      `Ainda não encontrei compras suas neste ciclo (${sorteioDDMM(c.ini)} a ${sorteioDDMM(c.fim)}).\n\n` +
      `A partir de *R$ ${SORTEIO.porNumero}* em produtos você já ganha seu *primeiro número* e concorre ao ` +
      `*vale-compras de ${SORTEIO.premio}*! 🎁\n\n` +
      `Quer ver os produtos? Digite *menu*. 😊`;
  }

  const sobra = Math.round((base - Math.floor(base/100) * 100) * 100) / 100;
  const falta = Math.round((100 - sobra) * 100) / 100;
  const lista = nums.map(x => `*${x}*`).join(' · ');
  let msg = `🎲 *Seus números da sorte*\n\n`;
  if (d.nome) msg += `Olá, *${d.nome}*! `;
  msg += `Você tem *${nums.length} ${nums.length === 1 ? 'número' : 'números'}* neste ciclo:\n\n${lista}\n\n`;
  msg += `💰 Compras no ciclo: *R$ ${reais(base)}*\n`;
  msg += `🎯 Faltam *R$ ${reais(falta)}* pro seu *${nums.length + 1}º número*!\n\n`;
  msg += `📅 Ciclo até *${sorteioDDMM(c.fim)}*` + (dias > 0 ? ` _(${dias} ${dias === 1 ? 'dia' : 'dias'})_` : '') + `\n`;
  msg += `🍀 Sorteio *${sorteioDiaSemana(c)} ${sorteioDDMM(c.sorteio)} às ${sorteioHoraTxt(c)}* pela Loteria Federal\n\n`;
  msg += `_Boa sorte!_ 🤞`;
  return msg;
}

// Reconhece a intenção. Evita roubar "número do pedido" (isso é rastreio).
function ehIntencaoSorteio(n){
  if (!SORTEIO.ativa) return false;
  if (n.includes('numero do pedido') || n.includes('numero de pedido')) return false;
  if (n.includes('sorteio') || n.includes('sortear') || n.includes('sorteado')) return true;
  if (n.includes('numero da sorte') || n.includes('numeros da sorte')) return true;
  if (n.includes('meus numeros') || n.includes('meu numero da sorte')) return true;
  if (n.includes('vale compras') || n.includes('vale-compras')) return true;
  if (n.includes('bilhete')) return true;
  if (n.includes('quantos') && n.includes('numero')) return true;
  return false;
}

// Monta o contexto REAL de promoção/desconto pra IA assíncrona (fonte única = este arquivo).
// A IA só fala de promoção com base no que estiver LIGADO aqui. Nada inventado.
async function contextoPromo(){
  const linhas = [];
  linhas.push(`Benefício padrão SEMPRE ativo: desconto Athena de ${DESCONTO_ATHENA_PCT}% em todos os produtos, aplicado no fechamento (vale o MAIOR entre esse ${DESCONTO_ATHENA_PCT}% e um cupom do cliente; não acumulam).`);
  linhas.push(`DEFINIÇÃO — "VAREJO": são os produtos NORMAIS da VitaFlow (os MESMOS que você oferece fora do modo atacado, iguais aos do site vitaflowoficial.com), vendidos em QUALQUER quantidade. Quando o cliente falar "varejo", é disso que ele fala — é o padrão de compra, NÃO é o atacado (que tem mínimo de R$ 3.000 e frete grátis). Os 3% e as promoções valem no varejo.`);
  if (semanaClienteAtiva()) {
    const _fx = PROMO_SEMANA_CLIENTE.faixas.map(f => `acima de R$ ${f.min} ganha R$ ${f.desc} OFF`).join('; ');
    linhas.push(`PROMOÇÃO ATIVA — SEMANA DO CLIENTE VitaFlow (13 a 20/09): desconto AUTOMÁTICO por faixa do valor em PRODUTOS (varejo): ${_fx}. É automático no fechamento — o cliente NÃO digita cupom. NÃO acumula com cupom nem com os ${DESCONTO_ATHENA_PCT}% (vale sempre o MAIOR). NÃO vale no atacado. SEMPRE que o cliente perguntar de promoção/desconto, ou estiver perto de uma faixa, DIVULGUE e incentive completar o valor pra subir de faixa.`);
  }
  // Promoções de PREÇO POR QUANTIDADE (config em cupons_vitaflow/_vfTipo:promo_preco) — pra a IA DIVULGAR.
  try {
    const _gruposPP = await lerPromoPrecos();
    if (_gruposPP && _gruposPP.length) {
      _gruposPP.forEach(g => {
        const prods = (g.nomesOrig && g.nomesOrig.length) ? g.nomesOrig.join(', ') : '';
        linhas.push(`PROMOÇÃO DE PREÇO ATIVA AGORA: ${g.titulo || 'Promoção'} — cada um sai por R$ ${reais(g.base)} na unidade, e por R$ ${reais(g.precoN)} CADA levando ${g.n} ou mais (pode MISTURAR os produtos do grupo — conta a SOMA das unidades). Produtos incluídos: ${prods}. O preço da promo já é o FINAL: NÃO acumula com os ${DESCONTO_ATHENA_PCT}% da Athena nem com cupom. SEMPRE que o cliente perguntar de promoção/desconto OU demonstrar interesse em algum desses produtos, DIVULGUE esta promoção e incentive levar ${g.n}+ pra pagar R$ ${reais(g.precoN)} cada (o desconto é automático no carrinho — não precisa cupom).`);
      });
    }
  } catch (e) {}
  if (freteGratisAutoAtivo()) {
    linhas.push('FRETE GRÁTIS AUTOMÁTICO (varejo, sem data de fim): em pedidos A PARTIR DE R$ ' + reais(FRETE_GRATIS_AUTO.min) + ' em produtos, o FRETE é GRÁTIS pra todo o Brasil, em qualquer opção de envio (PAC, SEDEX ou Transportadora). É AUTOMÁTICO no fechamento (aqui na Athena e no site) — o cliente NÃO precisa digitar cupom nenhum; NÃO peça nem mencione o cupom FRETEZERO. NÃO ACUMULA com cupom, promoção nem com o benefício de ' + DESCONTO_ATHENA_PCT + '% da Athena: quando o pedido tem outro benefício, o resumo do pedido mostra as DUAS opções (frete grátis OU o desconto) com o valor de cada uma e o CLIENTE escolhe a que preferir. NUNCA diga que o cliente ganha o frete grátis E o desconto juntos. Única exceção: VALE-COMPRAS (é como dinheiro) funciona junto com o frete grátis. Abaixo de R$ ' + reais(FRETE_GRATIS_AUTO.min) + ' o frete é cobrado normalmente. No ATACADO a regra é outra (lá o frete já é grátis). REVENDEDORES: o benefício NÃO é concedido a revendedores, que já têm desconto nos produtos (compram pelo portal de revendedores). SEMPRE que o cliente perguntar de frete grátis, promoção ou desconto, explique isso; se o pedido estiver perto de R$ ' + reais(FRETE_GRATIS_AUTO.min) + ', avise quanto falta pro frete sair de graça. SEGURO: o seguro grátis contra apreensão e extravio CONTINUA VALENDO com o frete grátis, desde que o envio seja por TRANSPORTADORA; PAC e SEDEX (Correios) NÃO têm seguro, com ou sem frete grátis — o frete grátis não muda nada nisso. Como a Transportadora também sai grátis nesses pedidos, recomende a Transportadora.');
  }
  if (promoIndepAtiva()) {
    linhas.push('PROMOÇÃO ATUAL — INDEPENDÊNCIA 9.9 (07 a 09/09): 15% OFF em TODO o site (varejo) com o cupom INDEPENDENCIA99, digitado pelo cliente no fechamento (aqui comigo ou no site). Vale para qualquer produto do varejo, qualquer quantidade. NÃO vale no atacado. NÃO acumula com outros cupons ou promoções nem com o benefício de 3% da Athena — vale sempre o MAIOR (os 15% do cupom vencem os 3%). SEMPRE que o cliente perguntar de promoção/desconto, DIVULGUE a Independência 9.9 e diga pra usar o cupom INDEPENDENCIA99 no fechamento. ALGUNS produtos já estão com PREÇO ESPECIAL de 9.9 e por isso NÃO aceitam o cupom (o desconto já está no preço) — se o cliente disser que o cupom não pegou num produto, explique que esse item já está com preço promocional especial. NÃO fale de frete grátis/FRETEZERO nem "Compre 2 Leve 3" (não estão ativos).');
  } else if (promoFreteAtiva()) {
    linhas.push('PROMOÇÃO ATUAL — FRETE GRÁTIS (de 27/09 só até quarta 30/09 às 23h59): em pedidos ACIMA DE R$ 1.000, o FRETE é GRÁTIS pra todo o Brasil com o cupom FRETEZERO. O cliente usa/digita o cupom FRETEZERO no fechamento (aqui na Athena ou no site) e o frete zera — o mínimo é R$ 1.000 em produtos. É desconto NO FRETE, NÃO é desconto no preço do produto e NÃO é brinde/"compre 2 leve 3". O FRETEZERO NÃO acumula com NADA: nem com outro cupom, nem com promoção, nem com o benefício de 3% da Athena. No fechamento o sistema aplica sozinho o que for MAIOR pro cliente: OU o frete grátis OU os 3% nos produtos — nunca os dois. NUNCA diga que o cliente ganha o frete grátis E os 3% juntos. SEMPRE que o cliente perguntar de promoção/desconto/frete, DIVULGUE o Frete Grátis (frete grátis acima de R$ 1.000 com FRETEZERO, só até quarta 30/09 às 23h59). Se o pedido for ABAIXO de R$ 1.000, o cupom NÃO aplica — nesse caso, ofereça o frete normal e os 3% de desconto, e convide o cliente a completar R$ 1.000 pra ganhar o frete grátis. NÃO mencione a Semana do Cliente, a Independência 9.9/INDEPENDENCIA99 nem "15% OFF" (já encerraram).');
  } else if (!PROMO_GENESIS_3x1.ativa) {
    linhas.push(freteGratisAutoAtivo()
      ? 'Além do benefício padrão de 3% e do FRETE GRÁTIS AUTOMÁTICO descrito acima, NÃO há outra promoção especial ativa. NÃO existe "Compre 2 Leve 3", brinde, nem cupom FRETEZERO — não fale disso.'
      : 'NÃO há promoção especial ativa além do benefício padrão de 3%. NÃO existe "Compre 2 Leve 3", brinde, nem frete grátis/FRETEZERO — não fale disso.');
  }
  if (PROMO_GENESIS_3x1.ativa) {
    linhas.push('PROMOÇÃO RELÂMPAGO ATIVA AGORA — GÊNESIS PEPTÍDEOS: na compra de 3 peptídeos da marca Gênesis (pode misturar os produtos da linha), o cliente ganha 1 GHK-Cu 100mg GRÁTIS. Válida só enquanto durar o estoque. É a marca Gênesis Peptídeos (NÃO confundir com "Biogenesis", que é outra marca). O brinde (GHK-Cu 100mg) é conferido/aplicado no fechamento pela equipe — a Athena só divulga. SEMPRE que o cliente perguntar de promoção/desconto, DIVULGUE esta promo. O benefício padrão de 3% continua valendo normalmente nos produtos. NÃO existe frete grátis/FRETEZERO nem "Compre 2 Leve 3" no momento — a única promoção ativa é esta.');
  }
  const rel = promoAtiva();
  if (rel && rel.produtos && rel.produtos.length) {
    const its = rel.produtos.map(p => `${p.nome}: de R$ ${reais(p.de)} por R$ ${reais(p.por)}`).join('; ');
    linhas.push(`PROMOÇÃO RELÂMPAGO ATIVA AGORA: ${rel.titulo} — ${its}${rel.validade ? ' — ' + rel.validade : ''}. Link: ${rel.link}. SEMPRE que o cliente perguntar de promoção/desconto ou demonstrar interesse nesse produto, DIVULGUE esta promoção.`);
  }
  if (PROMO_PRODUTO.ativa && (PROMO_PRODUTO.produtos || []).length) {
    linhas.push(`PROMOÇÃO DO MOMENTO ATIVA AGORA: ${PROMO_PRODUTO.titulo} — ${PROMO_PRODUTO.pct}% OFF em ${(PROMO_PRODUTO.produtos || []).join(', ')}${PROMO_PRODUTO.validade ? ' até ' + PROMO_PRODUTO.validade : ''}.`);
  }
  if (PROMO_GENESIS.ativa) {
    linhas.push('PROMOÇÃO DE LANÇAMENTO ATIVA AGORA: linha *Gênesis Peptídeos* — "COMPRE 2, LEVE 3": na compra de 2 peptídeos da linha Gênesis, o 3º é GRÁTIS (qualquer produto da linha, pode misturar). Frete grátis acima de R$1.000 com o cupom FRETEZERO. O cliente escolhe o brinde no fechamento (o sistema pergunta). Os produtos são da marca *Gênesis Peptídeos* — NÃO confunda com "Biogenesis", que é outra marca. Pra mostrar a linha, abra a lista buscando "genesis peptideos".');
  }
  if (LANC_DIAMOND.ativa) linhas.push(contextoDiamond());
  if (SORTEIO.ativa) {
    const _c = sorteioCicloAtual();
    const _d = sorteioDiasRestantes();
    linhas.push(`SORTEIO QUINZENAL ATIVO AGORA: a cada R$ ${SORTEIO.porNumero} pagos EM PRODUTOS dentro do ciclo, o cliente ganha 1 NÚMERO DA SORTE e concorre a um VALE-COMPRAS DE ${SORTEIO.premio} na VitaFlow. Ciclo atual: ${sorteioDDMM(_c.ini)} a ${sorteioDDMM(_c.fim)}${_d > 0 ? ' (fecha em ' + _d + ' dia(s))' : ''}. O sorteio é no ${sorteioDiaSemana(_c)} ${sorteioDDMM(_c.sorteio)} às ${sorteioHoraTxt(_c)}, pela LOTERIA FEDERAL — a VitaFlow não escolhe o ganhador. Vale a SOMA de todas as compras do cliente no período (não precisa ser num pedido só) e conta o valor PAGO em produtos, já com desconto; FRETE NÃO CONTA para gerar número. Só pedidos com pagamento confirmado. Os números ZERAM a cada ciclo. O prêmio é vale-compras (NÃO é dinheiro) e vale para produtos e frete. O cliente consulta os próprios números pelo CPF — aqui comigo ou em ${SORTEIO.link}. SEMPRE que o cliente perguntar de promoção/desconto/sorteio, DIVULGUE o sorteio. Se ele perguntar quantos números tem, peça o CPF.`);
  }
  if (linhas.length === 1) linhas.push('Não há promoção relâmpago nem lançamento com desconto especial ativos no momento (só o benefício padrão acima). NÃO invente promoções.');
  return linhas.join('\n');
}

// Anúncio da promoção do momento (opção 8): mostra o produto, o link do grupo VIP e o link do produto.
// O desconto NÃO é por fluxo — é aplicado por item no fechamento (ver fecharResumoNormal).
async function anunciarLancamento(session, sid) {
  await saveSession(sid, { ...session, state: 'PROMO_OFERECER' });
  const nomes = (PROMO_PRODUTO.produtos || []).join(', ');
  let msg = `${PROMO_PRODUTO.titulo}\n\n`;
  msg += `🔒 _Oferta exclusiva para membros do nosso grupo VIP._\n\n`;
  msg += `Chegou a *Retatrutida AQ 120mg da ZPHC* — a primeira da marca no formato *aquoso*! 💧\n\n`;
  msg += `Já vem *diluída de fábrica*, sem etapa de reconstituição: você abre e aplica. O kit traz *2 viais de 60mg*. 💉\n\n`;
  msg += `A fórmula usa estabilizadores específicos que mantêm o peptídeo íntegro no transporte e no armazenamento em temperatura ambiente. Produto autêntico, com *lacre holográfico* e *código de validação individual* em cada kit. ✅\n\n`;
  msg += `🎁 *${PROMO_PRODUTO.pct}% OFF até ${PROMO_PRODUTO.validade}!* O desconto é aplicado automaticamente nesse produto quando você fecha comigo. 🧡\n\n`;
  msg += `👀 *Ver o produto:*\n${PROMO_PRODUTO.linkProduto}\n\n`;
  msg += `📲 *Entre no nosso grupo VIP* (se ainda não for membro, é só entrar; se já for, é só seguir):\n${PROMO_PRODUTO.linkGrupo}\n\n`;
  msg += `Quer que eu já adicione no seu carrinho?\n\n1️⃣ Sim, quero a Retatrutida AQ\n2️⃣ Não, voltar ao menu`;
  return msg;
}

// ── PROMO GÊNESIS "Compre 2, Leve 3" = a PROMOÇÃO DO MOMENTO (opção 8 / "promoção") ──
// Pra desligar no futuro: ativa:false.
const PROMO_GENESIS = { ativa: false };
// ── FRETE GRÁTIS: frete grátis acima de R$ 1.000 com o cupom FRETEZERO ──
// 27/09/2026 (v75): janela 27/09 00:00 → quarta 30/09 23:59:59. Liga e desliga sozinha pela data.
// Pra desligar antes: ativa:false. Pra trocar o prazo: edite .ini/.fim.
const PROMO_FRETE = { ativa: true, ini: '2026-09-27T00:00:00-03:00', fim: '2026-09-30T23:59:59-03:00' };
function promoFreteAtiva(){ return PROMO_FRETE.ativa && Date.now() >= new Date(PROMO_FRETE.ini).getTime() && Date.now() <= new Date(PROMO_FRETE.fim).getTime(); }
// ── v87: FRETE GRÁTIS AUTOMÁTICO (varejo) — pedido a partir de R$ 1.000 em produtos, qualquer modalidade, SEM cupom. ──
// Sem data de fim. Pra desligar: ativo:false. Pra mudar o valor mínimo: min (em reais).
// ⚠️ A MESMA regra existe no carrinho do site (main-cart-footer.liquid) e no Orçamento — mudou aqui, mude lá.
const FRETE_GRATIS_AUTO = { ativo: true, min: 1000 };
function freteGratisAutoAtivo(){ return !!FRETE_GRATIS_AUTO.ativo; }
const MSG_FRETE_AUTO = `🚚 *FRETE GRÁTIS PRA TODO O BRASIL!* 🎉

Em pedidos *a partir de R$ ${Number(FRETE_GRATIS_AUTO.min).toLocaleString('pt-BR')}*, o *frete é por nossa conta*. 🇧🇷

✅ É *automático*: sem cupom, aqui comigo ou no site.

🛡️ *SEGURO GRÁTIS* contra apreensão e extravio, nos envios por *Transportadora*.

_Não acumula com cupons ou outras promoções: se o seu pedido tiver mais de um benefício, eu te mostro as opções e *você escolhe a melhor pra você*._`;
// Promoção antiga (27 a 30/09): FRETE GRÁTIS acima de R$ 1.000 com o cupom FRETEZERO.
const MSG_PROMO_FRETE = `🚚 *FRETE GRÁTIS PRA TODO O BRASIL!* 🎉

Em pedidos *acima de R$ 1.000*, o *frete é por nossa conta* pra todo o Brasil! 🇧🇷

🏷️ É só usar o cupom *FRETEZERO* no fechamento (aqui comigo ou no site).
⏰ *Só até quarta (30/09) às 23h59!*

_Não acumula com os 3% da Athena nem com outros cupons ou promoções — eu aplico sempre o que for MAIOR pra você. 😉_`;
// ── INDEPENDÊNCIA 9.9: 15% OFF em todo o site (varejo) com o cupom INDEPENDENCIA99 ──
// Janela 07 a 09/09. Auto-LIGA na virada da meia-noite do dia 07 (exatamente quando o
// FRETEZERO acima expira, 06/09 23:59:59) e auto-DESLIGA depois do dia 09. Ninguém precisa
// mexer na virada. Pra desligar antes: ativa:false. Cupom validado pelo Firestore (validarCupom).
const PROMO_INDEP = { ativa: true, ini: '2026-09-07T00:00:00-03:00', fim: '2026-09-09T23:59:59-03:00' };
function promoIndepAtiva(){ return PROMO_INDEP.ativa && Date.now() >= new Date(PROMO_INDEP.ini).getTime() && Date.now() <= new Date(PROMO_INDEP.fim).getTime(); }
const MSG_PROMO_INDEP = `🇧🇷 *INDEPENDÊNCIA 9.9 — 15% OFF EM TODO O SITE!* 🎉

O *9.9* é a maior data de ofertas do e-commerce — e a VitaFlow juntou ela com o feriado da *Independência* pra você economizar! 💚

🏷️ É só usar o cupom *INDEPENDENCIA99* no fechamento (aqui comigo ou no site) e ganhar *15% OFF* em qualquer produto.
⏰ *Só de 07 a 09 de setembro (segunda a quarta)!*

_Alguns produtos já saem com preço especial de 9.9 — nesses, o cupom não é necessário. Válido pros produtos do varejo; não acumula com outros cupons ou promoções (vale sempre o MAIOR desconto pra você). 😉_`;
// ── SEMANA DO CLIENTE: mensagem da opção "promoções" (auto-liga 13/09, desliga depois de 20/09) ──
const MSG_PROMO_SEMANA = `🧡 *SEMANA DO CLIENTE VITAFLOW!* 🧡

Uma semana inteira pra retribuir a sua confiança — e *quanto maior o pedido, maior o presente!* O desconto é *automático no carrinho* (sem cupom, sem complicação):

🛒 Acima de *R$ 500* → *R$ 50 OFF*
🛒 Acima de *R$ 1.000* → *R$ 100 OFF*
🛒 Acima de *R$ 1.500* → *R$ 225 OFF*
🛒 Acima de *R$ 2.000* → *R$ 300 OFF*

⏳ Só de *13 a 20 de setembro!* 🔥

_Desconto nos produtos (varejo), aplicado sozinho no fechamento. Não acumula com outros cupons ou promoções — vale sempre o MAIOR. Não vale no atacado._`;
// ⚠️ REGRA PERMANENTE (Thiago, 13/09/2026): TODA promoção nova TEM que aparecer AQUI, na parte de
// "promoções" da Stella/Athena (opção 8 / comando "promo"). NÃO basta pôr só no contextoPromo da IA.
// Se a promoção tiver data, adicione também o aviso no buildMenuPrincipal(). Isso vale SEMPRE.
// Mensagem da "promoção do momento" (opção 8 / "promoção").
// Prioridade: Semana do Cliente (13-20/09) > Independência > Gênesis > Frete (27-30/09) > sorteio > padrão 3%.
function msgPromoAtual(){
  // v92: promoção relâmpago (com hora de fim) — normalmente a opção 8 já abre a lista dela (abrirPromo); aqui é a reserva.
  const _rel = promoAtiva();
  if (_rel) {
    return `⚡ *${_rel.titulo}*${_rel.validade ? ' — ' + _rel.validade : ''}! 🔥\n\n` +
      _rel.produtos.map(p => `• *${p.nome}* — ~de R$ ${reais(p.de)}~ por *R$ ${reais(p.por)}*`).join('\n') +
      `\n\n👉 ${_rel.link}`;
  }
  if (semanaClienteAtiva()) {
    return MSG_PROMO_SEMANA;
  }
  if (promoIndepAtiva()) {
    return MSG_PROMO_INDEP;
  }
  if (PROMO_GENESIS_3x1.ativa) {
    return MSG_PROMO_GENESIS_3X1;
  }
  if (promoFreteAtiva()) {
    return MSG_PROMO_FRETE;
  }
  // v87: o frete grátis automático é a promoção permanente — aparece SEMPRE aqui (regra de 13/09), junto com o sorteio.
  if (freteGratisAutoAtivo()) {
    return MSG_FRETE_AUTO + (SORTEIO.ativa ? `\n\n━━━━━━━━━━\n\n` + msgSorteio() : '') +
      `\n\n_E nos pedidos abaixo de R$ ${reais(FRETE_GRATIS_AUTO.min)}, comprando comigo você ganha *3% de desconto* nos produtos! 😉_`;
  }
  if (SORTEIO.ativa) {
    return msgSorteio() + `\n\n_E comprando comigo você já ganha *3% de desconto* em todos os produtos! 😉_`;
  }
  return `No momento não temos promoção especial ativa, mas comprando comigo você já ganha *3% de desconto* em todos os produtos! 😊`;
}
async function anunciarGenesis(session, sid, respond, curto) {
  const intro = curto
    ? `🎁 *Continue na promo Gênesis — Compre 2, Leve 3!* Escolha mais um da linha (o 3º é grátis 😉):\n\n`
    : `🎁 *LANÇAMENTO GÊNESIS PEPTÍDEOS — COMPRE 2, LEVE 3!* 🔥\n\nNa compra de *2 peptídeos* da linha *Gênesis*, o *3º é GRÁTIS* — pode misturar, escolhe qualquer produto da marca. 💪\n🚚 Acima de *R$ 1.000*, o frete zera com o cupom *FRETEZERO*.\n\nAqui está a *linha Gênesis* — é só escolher *2* que o 3º vem grátis 😉:\n\n`;
  let linhas = [];
  // Só a marca Gênesis Peptídeos — \bgenesis\b exclui "Biogenesis" (marca diferente).
  try {
    const dados = await buscarTodosCache();
    linhas = [...new Set(String(dados || '').split('\n').filter(Boolean)
      .filter(l => /\bgenesis\b/.test(_normNomeProd((l.split('|')[0]) || ''))))];
  } catch (e) {}
  if (!linhas || !linhas.length) {
    await saveSession(sid, { ...session, state:'MENU' });
    return respond(`🎁 *Promoção Gênesis — Compre 2, Leve 3!*\n\nPra ver a linha, me manda o nome de um produto (ex.: *Klow*, *Glow*, *GHK-Cu*) que eu já te mostro. 😉`);
  }
  // Marca cada produto da lista como Gênesis (item.genesis) — assim, quando o cliente
  // escolher, o item entra no carrinho já sinalizado e o brinde dispara com 2+ da linha,
  // sem depender do texto "Gênesis" estar no nome gravado.
  const listaGenesis = parseProdutos(linhas).map(function(p){ p.genesis = true; return p; });
  await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: listaGenesis, promoGenesis: true, errosSeguidos:0 });
  return respond(intro + formatarLista(linhas) + `\n\n*Digite o número do produto* (ou *menu* pra ver todas as categorias):`);
}

// ── Grupo VIP (WhatsApp + Telegram) ───────────────────────────────────────────
const GRUPO_WHATSAPP = 'https://chat.whatsapp.com/BNa4tPKWjaZ1cTP4XwXtgM';
const GRUPO_TELEGRAM = 'https://t.me/referencias_vitaflow';

// ── Gerador de Protocolos (peptídeos e hormônios) — grátis, no site ──────────
// Entra em TODO beco onde o cliente pede protocolo e NÃO tem compra: em vez de sair
// de mãos vazias, ele monta o dele sozinho. O link é o da página da Shopify, que
// redireciona pro Netlify — se o endereço do gerador mudar, só a Shopify muda.
const GERADOR_URL = 'https://vitaflowoficial.com/pages/gerador-de-protocolo';
function msgGerador() {
  return `🔬 Você pode montar um protocolo agora mesmo, de graça, no nosso *Gerador de Protocolos* — de *peptídeos* e de *hormônios*:\n${GERADOR_URL}\n\n_E o protocolo personalizado, com o que você comprar, eu monto aqui assim que fechar o pedido._ 💪`;
}
// ── Calculadora de Peptídeos — grátis, no site (16/09/2026) ─────────────────
// Entra SÓ nos becos de quem pediu TABELA DE FRACIONAMENTO de um produto que ainda
// NÃO comprou (session.fracFluxo). Quem pede PROTOCOLO continua vendo o Gerador —
// são ferramentas diferentes e misturar os dois links confunde.
const CALCULADORA_URL = 'https://vitaflowoficial.com/pages/calculadora-de-peptideos';
function msgCalculadora() {
  return `🧮 Pra esse produto você já consegue calcular agora mesmo, de graça, na nossa *Calculadora de Peptídeos*:\n${CALCULADORA_URL}\n\n_E a *tabela de fracionamento* do que você comprar, eu mando aqui assim que fechar o pedido._ 💉`;
}
// Escolhe a ferramenta do beco pelo fluxo em que a pessoa entrou.
function _becoFerramenta(sess) { return (sess && sess.fracFluxo) ? msgCalculadora() : msgGerador(); }
// Mesma frase, assunto certo: no fluxo de fracionamento não se promete "protocolo".
function _becoAssunto(sess) {
  return (sess && sess.fracFluxo)
    ? 'A *tabela de fracionamento* dele eu monto certinho *depois da compra*!'
    : 'O protocolo dele eu monto certinho *depois da compra*!';
}
function msgGrupoVip() {
  return `🎉 *GRUPOS VIP VITAFLOW* 🎉\n\n` +
    `Entra nos nossos grupos pra receber *promoções, novidades e ofertas exclusivas* em primeira mão! 🔥\n\n` +
    `📱 *Grupo no WhatsApp:*\n${GRUPO_WHATSAPP}\n\n` +
    `✈️ *Grupo no Telegram:*\n${GRUPO_TELEGRAM}\n\n` +
    `_Dica: entra nos dois pra não perder nada. 😉_\n\n` +
    `_Digite *menu* para voltar ao início._`;
}

// ── LANÇAMENTO — LINHA DIAMOND (Landerlan) ── criado 14/09/2026 ───────────────
// Fases: 'previsto' → 'chegou' → 'esgotou'. Pra desligar tudo: ativa:false.
// Enquanto a fase for 'previsto', o tempo verbal muda sozinho pela DATA (antes / no dia / depois).
// Trocar a fase = editar aqui e publicar (decisão do Thiago 14/09: opção A; comando ADM fica pra depois).
// Vale nos 2 caminhos: resposta fixa (msgDiamond, gatilho no pipeline) + IA (contextoDiamond em contextoPromo).
// 23/09/2026 (v73): DESLIGADO — a linha Diamond já está no SITE (varejo, 6 produtos). Com ativa:false a resposta fixa e o
// contexto da IA somem; a pergunta cai no catálogo normal ("diamond landerlan" abre a lista real dos produtos).
const LANC_DIAMOND = { ativa: false, data: '2026-09-14', fase: 'previsto' };
function _hojeISO_SP(){
  try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()); }
  catch (e) { return new Date().toISOString().slice(0, 10); }
}
function _diamondDataBR(){ const p = String(LANC_DIAMOND.data || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : LANC_DIAMOND.data; }
// Frase de situação no tempo verbal certo (usada na resposta fixa).
function diamondSituacao(){
  const d = _diamondDataBR();
  if (LANC_DIAMOND.fase === 'chegou') return `*chegou!* Lote limitado — apenas *3.000 unidades para toda Ciudad del Este* — e deve esgotar rápido.`;
  if (LANC_DIAMOND.fase === 'esgotou') return `teve o *primeiro lote esgotado*. Nova reposição ainda sem data; quando voltar, o aviso sai primeiro no Grupo VIP.`;
  const hoje = _hojeISO_SP();
  if (hoje < LANC_DIAMOND.data) return `tem chegada prevista pra *${d}*, com apenas *3.000 unidades para toda Ciudad del Este* — deve esgotar no mesmo dia.`;
  if (hoje === LANC_DIAMOND.data) return `tem chegada prevista pra *hoje (${d})*, com apenas *3.000 unidades para toda Ciudad del Este* — deve esgotar no mesmo dia.`;
  return `estava prevista pra *${d}* e ainda não tivemos a confirmação da chegada — assim que entrar, o aviso sai primeiro no Grupo VIP. São apenas *3.000 unidades para toda Ciudad del Este*.`;
}
function msgDiamond(){
  return `💎 *LINHA DIAMOND — LANDERLAN*\n\n` +
    `A linha Diamond Premium Series ${diamondSituacao()}\n\n` +
    `📦 Por enquanto a Diamond sai *somente no atacado*. Depois que o abastecimento normalizar, entra no site pro varejo.\n\n` +
    `🔔 Avisos de chegada e reposição saem primeiro no nosso Grupo VIP:\n${GRUPO_WHATSAPP}\n\n` +
    `_Digite *menu* para voltar ao início._`;
}
// Linha que vai pra IA (contextoPromo). Mesma regra de tempo verbal.
function contextoDiamond(){
  if (!LANC_DIAMOND.ativa) return '';
  const d = _diamondDataBR();
  const hoje = _hojeISO_SP();
  const lote = 'lote de apenas 3.000 unidades para toda Ciudad del Este, deve esgotar no mesmo dia';
  let sit;
  if (LANC_DIAMOND.fase === 'chegou') sit = `JÁ CHEGOU (${lote})`;
  else if (LANC_DIAMOND.fase === 'esgotou') sit = `o PRIMEIRO LOTE ESGOTOU; nova reposição ainda sem data definida`;
  else if (hoje < LANC_DIAMOND.data) sit = `chegada PREVISTA para ${d} (ainda NÃO chegou); ${lote}`;
  else if (hoje === LANC_DIAMOND.data) sit = `chegada PREVISTA para HOJE (${d}), ainda NÃO confirmada — NÃO diga que chegou; ${lote}`;
  else sit = `estava prevista para ${d} e a chegada AINDA NÃO FOI CONFIRMADA — NÃO diga que chegou; ${lote}`;
  return `LANÇAMENTO — LINHA DIAMOND DA LANDERLAN (Diamond Premium Series): ${sit}. Neste primeiro momento a linha Diamond é vendida SOMENTE no ATACADO; NÃO está no site nem no varejo ainda — entra no varejo depois que o abastecimento normalizar, sem data definida. Se o cliente perguntar sobre a Diamond ("chegou?", preço, quais produtos, reserva, quando no varejo): passe exatamente essas informações e nada mais. NÃO invente produtos da linha, preço, quantidade por cliente, reserva nem data de varejo. NÃO confundir com produtos que têm "Diamond" no nome de outras marcas, como a Retatrutida Veltrane Diamond — esses são produtos normais do varejo, disponíveis já.`;
}

// ── Atacado ───────────────────────────────────────────────────────────────────
const TABELA_ATACADO_URL = 'https://drive.google.com/file/d/1olhYj0OW1cL0Wk0kk6-fct89EJff_1Ip/view';
const WHATSAPP_ATACADO_1 = 'wa.me/5521998367319';
const WHATSAPP_ATACADO_2 = 'wa.me/447537155723';

// Respostas padrão pra mídia que a Athena ainda não processa (áudio/vídeo/documento).
// Imagem tem tratamento próprio (a IA "vê" via Claude visão) — ver handler.
const RESP_AUDIO_PADRAO = `Oi! 🎧 Recebi seu áudio, mas por aqui eu ainda *não consigo ouvir áudios*. 🙏

Me manda *por texto* o que você precisa (um produto, uma dúvida, ou seu pedido) que eu já te ajudo na hora! 😊`;

const RESP_MIDIA_PADRAO = `Recebi seu arquivo! 📎 Por aqui eu consigo te ajudar melhor *por texto*.

Me conta o que você precisa — um produto, uma dúvida ou algo sobre seu pedido — que eu resolvo com você agora mesmo! 😊`;

const MSG_REVENDEDORES = `*🤝 PROGRAMA DE REVENDEDORES VitaFlow*

Revenda é diferente do atacado! 😉 No programa de revendedores você tem *preço de revenda* pra revender pros seus clientes — e o melhor: *não tem pedido mínimo*, pode pedir qualquer valor.

*Como começar:*
1️⃣ Faça seu cadastro aqui:
https://revendedores.vitaflowoficial.com/seja-revendedor
2️⃣ Assim que o cadastro for *aprovado*, é só enviar seus pedidos normalmente. 🚀

Qualquer dúvida sobre a revenda, é só me chamar!

0️⃣ Voltar ao menu`;

const MSG_ATACADO = `*🏭 ATACADO VitaFlow* — pedido mínimo *R$ 3.000* e *FRETE GRÁTIS!* 🚚

Aqui é simples: você monta seu pedido do jeito que quiser comigo. 😊

✅ Pode levar *qualquer produto* da tabela de atacado, na *quantidade que quiser* — um só ou vários, misturando à vontade.
✅ A única regra é o *total do pedido fechar em R$ 3.000 ou mais* (é o nosso pedido mínimo de atacado).
✅ *Frete grátis* pra todo o Brasil. 🚚
ℹ️ No atacado não entram os 3% nem cupom — aqui o benefício é o frete grátis. E não dá pra misturar itens do varejo no mesmo pedido.

👉 Me diga o *nome do produto* que você quer (ex.: retatrutida, testosterona, bpc) que eu te mostro o preço e já vou montando seu pedido de atacado.

_Ou digite *1* pra baixar a *tabela completa* em PDF, ou *2* pra voltar ao menu._`;

const MSG_ATACADO_CONTATOS = `*🏭 Consultores de Atacado — VitaFlow*

Fale agora com um dos nossos consultores especializados em atacado:

📲 ${WHATSAPP_ATACADO_1}
📲 ${WHATSAPP_ATACADO_2}

Tenha em mãos a tabela de atacado e a lista de produtos que deseja. 😊

_Digite *menu* para voltar ao início._`;

// ── ATACADO: leitura da tabela do Firebase (a MESMA que o Conversor de Tabela salva) ──
// vitaflow_atacado/tabela_fornecedor = { produtos:[{nome, usd, status, reais}], data, ... }
// O preço em R$ é DEFINIDO PELO THIAGO no Conversor de Tabela e gravado no campo `reais`
// (o mesmo valor do PDF que o cliente vê). A Athena lê SOMENTE `reais` — NÃO calcula nada.
// Os outros sistemas continuam lendo `usd` do jeito que sempre foi.
const ATACADO_MIN = 3000;
async function lerTabelaAtacado() {
  try {
    const r = await fetch(fbUrl('/vitaflow_atacado/tabela_fornecedor.json'));
    const d = await r.json();
    if (!d) return { produtos: [], data: '', totalTabela: 0 };
    // aceita produtos como array OU objeto (o RTDB às vezes devolve objeto)
    let lista = [];
    if (Array.isArray(d.produtos)) lista = d.produtos;
    else if (d.produtos && typeof d.produtos === 'object') lista = Object.keys(d.produtos).map(function (k) { return d.produtos[k]; });
    const produtos = lista.map(function (p) {
      const preco = (p && p.reais != null) ? (parseFloat(p.reais) || 0) : 0;   // SOMENTE o campo reais
      return { nome: (p && p.nome) || '', preco: preco, status: (p && p.status) || 'disponivel' };
    }).filter(function (p) { return p.nome && p.preco > 0 && p.status !== 'esgotado'; });
    return { produtos: produtos, data: d.data || '', totalTabela: lista.length };
  } catch (e) { return { produtos: [], data: '', totalTabela: 0 }; }
}
/* ══════════════════════════════════════════════════════════════════════════
   GRAFIA PT x EN DOS NOMES DE PRODUTO — adicionado em 06/09/2026.

   A tabela do atacado mistura as duas grafias DENTRO dela mesma:
     retatrutida (7 itens)  x  retatrutide (3)
     tirzepatida (1)        x  tirzepatide (7)
     testosterona (7)       x  testosterone (5)
     trembolona (4)         x  trembolone (2)  x  trenbolone
     tesamorelim (1)        x  tesamorelin (2)
   Como a busca era substring EXATA, quem digitava "trenbolona" — que é a
   grafia certa em português — recebia "não encontrei", porque a tabela só tem
   "TREMBOLONA" e "TRENBOLONE". O mesmo valia pra tesamorelina, ipamorelina,
   sermorelina, metandienona: ZERO resultado.

   radicalPalavra() reduz uma palavra ao RADICAL comum às duas grafias:
     ph -> f   (phenyl/fenil, PHARMA/farma)      th -> t  (enanthate/enantato)
     y  -> i   (cypionate/cipionato)             nb -> mb (clenbuterol/clembuterol)
     letra dobrada -> simples (follistatin/folistatina)
     m final -> n            (TESAMORELIM/tesamorelin)
     terminações: ide/ida/ido -> id   ine/ina -> in   one/ona -> on
                  ate/ato -> at   ole -> ol   ane/ano -> an
                  ene/eno -> en   ila/il -> il
   NÃO mexe em número nem dosagem (o colapso de letra repetida é só [a-z], senão
   "1000mg" viraria "10mg").

   A busca tenta a grafia EXATA primeiro e só depois o radical: é um casamento
   A MAIS, nunca a menos. Testado contra os 376 produtos reais da tabela:
   52/52 pares EN-PT casam, 0 resultado perdido, 0 colisão entre produtos.
   ══════════════════════════════════════════════════════════════════════════ */
var _FIM_PRODUTO = [
  [/ides?$/,'id'], [/id[ao]s?$/,'id'],
  [/ines?$/,'in'], [/inas?$/,'in'],
  [/ones?$/,'on'], [/onas?$/,'on'],
  [/ates?$/,'at'], [/atos?$/,'at'],
  [/oles?$/,'ol'],
  [/anes?$/,'an'], [/anos?$/,'an'],
  [/enes?$/,'en'], [/enos?$/,'en'],
  [/ilas?$/,'il']
];
function radicalPalavra(w) {
  var t = String(w || '')
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/y/g, 'i')
    .replace(/nb/g, 'mb')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/m$/, 'n');
  for (var i = 0; i < _FIM_PRODUTO.length; i++) {
    if (_FIM_PRODUTO[i][0].test(t)) return t.replace(_FIM_PRODUTO[i][0], _FIM_PRODUTO[i][1]);
  }
  return t;
}
function radicalProduto(s) {
  return String(s || '').split(/\s+/).map(radicalPalavra).join(' ');
}

function _normAtk(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ç/g, 'c');
}

// ── LIMITE DE PALAVRA NA BUSCA (08/09/2026) ───────────────────────────────────
// A busca usava `nome.indexOf(w) >= 0` — substring pura. Isso fazia "Nad" casar
// dentro de "CA-NAD-A" e devolver "CANADA PARABOL 200 (TREMBO ENAN)" pra quem
// procurava NAD+ (caso real, Charles Moraes 10:56). Agora o termo só casa se
// começar uma palavra: continua achando por PREFIXO ("reta" acha "RETATRUTIDE",
// que é como o cliente digita), mas nunca mais no MEIO de outra palavra.
function _casaTermo(nome, w) {
  if (!w) return false;
  var i = 0;
  while ((i = nome.indexOf(w, i)) >= 0) {
    var antes = (i === 0) ? ' ' : nome.charAt(i - 1);
    if (!/[a-z0-9]/.test(antes)) return true;
    i += 1;
  }
  return false;
}
// Distância de edição curta — só pra tolerar erro de digitação em palavra longa
// ("Tizerpartida" → "tirzepatida", caso real). Sai cedo quando a diferença de
// tamanho já passou do limite, então é barato.
function _distEdicao(a, b, max) {
  a = String(a || ''); b = String(b || '');
  if (Math.abs(a.length - b.length) > max) return max + 1;
  var linha = [], i, j;
  for (j = 0; j <= b.length; j++) linha[j] = j;
  for (i = 1; i <= a.length; i++) {
    var ant = linha[0]; linha[0] = i; var melhor = i;
    for (j = 1; j <= b.length; j++) {
      var tmp = linha[j];
      linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, ant + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      if (linha[j] < melhor) melhor = linha[j];
      ant = tmp;
    }
    if (melhor > max) return max + 1;
  }
  return linha[b.length];
}
// Quanto do termo do cliente o nome do produto cobre. Pesos:
//   3 — o termo inicia uma palavra do nome ("reta" acha "RETATRUTIDE"), ou casa
//       por radical PT/EN ("trenbolona" acha "TREMBOLONA"). Palavra de 3 letras
//       vale só 1 (senão "dia", de "bom dia", trazia DIANABOL).
//   2 — o inverso: a palavra do nome inicia o termo ("sustanon" -> "SUSTA").
//   2 — erro de digitação ("Tizerpartida" -> "TIRZEPATIDA").
function _pontosTermo(nome, palavras, radicais) {
  var rad = radicalProduto(nome);
  var pedacos = nome.split(/[^a-z0-9]+/).filter(function (x) { return x.length >= 3; });
  var pts = 0;
  for (var k = 0; k < palavras.length; k++) {
    var w = palavras[k];
    // Palavra de 1-2 letras não pontua sozinha: era assim que "de" (de "preciso DE
    // ajuda") casava com "DECA/DEPOT" e "em" com "ENANTATO", devolvendo meia tabela
    // pra uma frase de conversa.
    if (w.length < 3) continue;
    if (_casaTermo(nome, w) || _casaTermo(rad, radicais[k])) { pts += (w.length >= 4 ? 3 : 1); continue; }
    if (w.length < 4) continue;
    var achou = false;
    for (var q = 0; q < pedacos.length; q++) {
      // o CONTRÁRIO do prefixo: a palavra da tabela inicia o que o cliente digitou.
      // É o "sustanon" achando "ACTIZA SUSTA DEPOT" — a tabela abrevia.
      if (pedacos[q].length >= 4 && w.indexOf(pedacos[q]) === 0) { pts += 2; achou = true; break; }
    }
    if (achou) continue;
    if (w.length >= 6) {
      var maxD = (w.length >= 10 ? 3 : 2);   // "Tizerpartida" -> "TIRZEPATIDA" são 3 edições
      for (var z = 0; z < pedacos.length; z++) {
        if (pedacos[z].length >= 5 && _distEdicao(w, pedacos[z], maxD) <= maxD) { pts += 2; break; }
      }
    }
  }
  return pts;
}
function buscarAtacado(produtos, termo) {
  const palavras = _normAtk(termo).split(/\s+/).filter(function (p) { return p.length >= 2; });
  if (!palavras.length) return [];
  const radicais = palavras.map(radicalPalavra);
  const estrito = produtos.filter(function (p) {
    const nome = _normAtk(p.nome);
    // 1ª tentativa: grafia EXATA (agora com limite de palavra).
    if (palavras.every(function (w) { return _casaTermo(nome, w); })) return true;
    // 2ª tentativa: RADICAL — casa "retatrutida" com "Retatrutide", "trenbolona"
    // com "TREMBOLONA"/"TRENBOLONE", "tesamorelina" com "TESAMORELIM". (06/09/2026)
    const rad = radicalProduto(nome);
    return radicais.every(function (r) { return _casaTermo(rad, r); });
  });
  if (estrito.length) return estrito;
  // 3ª tentativa (08/09/2026): APELIDO DO DICIONÁRIO. A tabela do atacado vem do
  // fornecedor com os nomes comerciais e em inglês ("DIANABOL", "SUSTA", "ANAVAR"),
  // e o cliente digita a gíria ou o nome científico ("dbol", "sustanon",
  // "equipoise"). O DICT_PRODUTOS já tem esse de-para curado — reaproveita ele em
  // vez de manter uma segunda lista de sinônimos que ia nascer desatualizada.
  var alt = _sinonimosAtacado(termo);
  for (var a = 0; a < alt.length; a++) {
    var palA = _normAtk(alt[a]).split(/\s+/).filter(function (x) { return x.length >= 2; });
    if (!palA.length) continue;
    var radA = palA.map(radicalPalavra);
    var achA = produtos.filter(function (p) {
      var nome = _normAtk(p.nome);
      if (palA.every(function (w) { return _casaTermo(nome, w); })) return true;
      var r = radicalProduto(nome);
      return radA.every(function (x) { return _casaTermo(r, x); });
    });
    if (achA.length) return achA;
  }
  // 4ª tentativa: o cliente mandou o NOME COMPLETO com marca e dose
  // ("Tirzepatida Tirzec MD 15mg (Bujão) 60mg") ou errou uma letra ("Tizerpartida").
  // Exigir TODAS as palavras devolvia zero. Aqui pontua por quantas palavras o
  // produto cobre e devolve os melhores — nunca uma lista genérica nem um vazio.
  const pontuados = [];
  // Termo de UMA palavra pode entrar só com o prefixo invertido (2 pts) — é o
  // "sustanon" achando "SUSTA". Com várias palavras exige-se pelo menos um
  // casamento forte, senão qualquer frase solta traria meia tabela.
  const minPts = (palavras.length === 1) ? 2 : 3;
  for (var i = 0; i < produtos.length; i++) {
    var pts = _pontosTermo(_normAtk(produtos[i].nome), palavras, radicais);
    if (pts >= minPts) pontuados.push({ p: produtos[i], pts: pts });
  }
  if (!pontuados.length) return [];
  pontuados.sort(function (a, b) { return b.pts - a.pts; });
  const teto = pontuados[0].pts;
  return pontuados.filter(function (o) { return o.pts === teto; }).map(function (o) { return o.p; });
}
// Termos alternativos vindos do DICT_PRODUTOS (label + canônicos + filtro) pra um
// termo que o cliente digitou. Não inventa sinônimo: só devolve o que já está
// cadastrado no dicionário do varejo.
function _sinonimosAtacado(termo) {
  var out = [];
  try {
    var rec = reconhecerProduto(_normAtk(termo));
    if (!rec || !rec.entry) return out;
    var e = rec.entry;
    var vistos = {};
    var junta = function (t) {
      var v = _normAtk(t || '').trim();
      if (!v || vistos[v]) return;
      vistos[v] = 1; out.push(v);
    };
    (e.filtro || []).forEach(junta);
    (e.canonico || []).forEach(junta);
    junta(e.label);
    // tira o que o cliente já digitou (não adianta repetir a mesma busca)
    var digitado = _normAtk(termo).trim();
    out = out.filter(function (t) { return t !== digitado; });
  } catch (err) {}
  return out;
}
function formatarListaAtk(lista) {
  return lista.map(function (p, i) {
    return emojis(i) + ' *' + p.nome + '* — R$ ' + p.preco.toFixed(2).replace('.', ',');
  }).join('\n');
}
function faltaAtk(subtotal) { return Math.max(0, ATACADO_MIN - subtotal); }
function msgCarrinhoAtk(cart) {
  const sub = totalCarrinho(cart);
  const falta = faltaAtk(sub);
  let m = `*🛒 SEU PEDIDO DE ATACADO*\n\n${resumoCarrinho(cart)}\n\n    Subtotal: R$ ${sub.toFixed(2).replace('.', ',')}\n`;
  if (falta > 0) m += `\n⚠️ Faltam *R$ ${falta.toFixed(2).replace('.', ',')}* pra atingir o mínimo de *R$ 3.000*.\n`;
  else m += `\n✅ *Mínimo de R$ 3.000 atingido!* Frete *GRÁTIS* 🚚\n`;
  m += `\n1️⃣ Adicionar mais um produto\n2️⃣ Finalizar pedido${falta > 0 ? ' _(precisa atingir R$ 3.000)_' : ''}\n3️⃣ Remover um item\n\n_Ou me manda o *nome* de outro produto do atacado._`;
  return m;
}
// Entra na modalidade atacado. Se houver carrinho de VAREJO aberto, bloqueia (não mistura).
async function entrarAtacado(session, sid, respond) {
  if ((session.carrinho || []).length) {
    await saveSession(sid, { ...session, state: 'ATK_BLOQUEIO' });
    return respond(`Você já tem *itens no carrinho do varejo*. 🛒\n\nNão dá pra misturar *varejo* e *atacado* no mesmo pedido. O que você prefere?\n\n1️⃣ *Finalizar o varejo* primeiro\n2️⃣ *Esvaziar o varejo* e começar o atacado\n3️⃣ Voltar ao menu`);
  }
  await saveSession(sid, { ...session, state: 'ATACADO' });
  return respond(MSG_ATACADO);
}
// Busca um termo na tabela de atacado e mostra a lista numerada (ou avisa se não achou).
// Saudação/agradecimento solto dentro do atacado NÃO é busca de produto. Sem isto,
// "oi" casava com "STANOZOLOL *OI*L" e o cliente recebia uma lista sem pé nem cabeça.
function _ehConversaSolta(t) {
  var s = norm(t || '').replace(/[!?.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(oi|ola|opa|eae|e ai|hey|alo|bom dia|boa tarde|boa noite|tudo bem|tudo bom|blz|beleza|ok|okay|certo|entendi|obrigado|obrigada|valeu|vlw|de nada|show|otimo|otima|perfeito|legal|top|sim|nao|nada|nenhum|nenhuma)$/.test(s)) return true;
  // v85: agradecimento/despedida em mais de uma palavra ("Obg Tchau", "valeu obrigado", "ok obrigada ate mais")
  const _solta = ['obg','obrigado','obrigada','brigado','brigada','valeu','vlw','tchau','xau','flw','falou','ate','mais','logo','abraco','abs','ok','okay','blz','beleza','certo','entendi','show','top','legal','perfeito','muito','por','enquanto','so','isso','era','nada','de'];
  const _tk = s.split(' ').filter(Boolean);
  return _tk.length >= 1 && _tk.length <= 5 && _tk.every(w => _solta.indexOf(w) >= 0) && _tk.some(w => /^(obg|obrigad[oa]|brigad[oa]|valeu|vlw|tchau|xau|flw|falou)$/.test(w));
}
// v74 (25/09/2026): mensagem que é só NAVEGAÇÃO dentro do atacado (não é nome de produto).
// 'apresentacao' → mostra MSG_ATACADO de novo | 'pdf' → manda o link da tabela | '' → segue a busca.
function _navegacaoAtacado(t) {
  var s = norm(t || '').replace(/[!?.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(o |no |por |pelo )?(atacado|mayoreo)( por favor| pf| pfv)?$/.test(s)) return 'apresentacao';
  if (/^(quero|queria|gostaria de|pode ser|vamos de|vou de) (comprar |fazer |ver |o |no |por |pelo )*(atacado|mayoreo)( por favor| pf| pfv)?$/.test(s)) return 'apresentacao';
  if (/^(comprar|compra|compras) (no |por |pelo |de )?atacado$/.test(s)) return 'apresentacao';
  if (/^(a )?tabela (de|do) atacado$/.test(s)) return 'apresentacao';
  if (/^(a |me manda a |manda a |quero a |ver a )?(tabela|tabela completa|tabela em pdf|pdf|tabela pdf)( por favor| pf| pfv)?$/.test(s)) return 'pdf';
  return '';
}
async function atkAbrirBusca(session, sid, termo, respond) {
  if (_ehConversaSolta(termo)) {
    await saveSession(sid, { ...session, state: 'ATACADO' });
    return respond(MSG_ATACADO);
  }
  // v74 (25/09/2026): palavra de NAVEGAÇÃO dentro do atacado não é produto. Caso real 25/09:
  // a cliente já estava no atacado, digitou "Atacado" e levou "Não encontrei Atacado na tabela".
  // (O reconhecimento geral de "atacado" fica desligado aqui dentro — ATACADO/ATK_* contam como
  // checkout.) Só casa a mensagem INTEIRA, pra nunca engolir nome de produto. Carrinho intacto.
  const _navAtk = _navegacaoAtacado(termo);
  if (_navAtk === 'apresentacao') {
    await saveSession(sid, { ...session, state: 'ATACADO' });
    return respond(MSG_ATACADO);
  }
  if (_navAtk === 'pdf') {
    await saveSession(sid, { ...session, state: 'ATACADO' });
    return respond(`📥 *Tabela completa de atacado (PDF):*\n${TABELA_ATACADO_URL}\n\nQuando escolher, me diga o *nome do produto* que você quer que eu monto seu pedido de atacado aqui mesmo. 😊`);
  }
  const tab = await lerTabelaAtacado();
  if (!tab.produtos.length) {
    await saveSession(sid, { ...session, state: 'ATACADO' });
    return respond(`Não consegui carregar a tabela de atacado agora. 😕\n\nVocê pode baixar a tabela completa em PDF aqui:\n${TABELA_ATACADO_URL}\n\nTenta de novo daqui a pouco, ou me manda o *nome* do produto que você quer.`);
  }
  const achados = buscarAtacado(tab.produtos, termo);
  if (!achados.length) {
    // Não é nome de produto, é PERGUNTA ("Protocolo", "como uso isso?"). Antes o cliente
    // levava "Não encontrei Protocolo na tabela de atacado" e sumia (caso real, 08/09).
    // A busca continua tendo prioridade — só cai aqui quando ela não achou nada.
    // v94: pediu a TABELA com outras palavras ("tem tabela em atacado", "manda a tabela de preços", "tem catálogo?") → manda o PDF.
    const _tTab = norm(termo || '').replace(/[!?.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/\b(tabela|tabelas|catalogo|lista de precos?|pdf)\b/.test(_tTab) && _tTab.split(' ').length <= 16) {
      await saveSession(sid, { ...session, state: 'ATACADO' });
      return respond(`📥 *Tabela completa de atacado (PDF):*\n${TABELA_ATACADO_URL}\n\nQuando escolher, me diga o *nome do produto* que você quer que eu monto seu pedido de atacado aqui mesmo. 😊`);
    }
    // v95: frase de 4+ palavras também vai para a IA (nunca "Não encontrei *<frase inteira>*").
    if (ehDuvida(norm(termo)) || ehPedidoProtocoloCompleto(norm(termo)) || _tTab.split(' ').length >= 4) {
      await saveSession(sid, { ...session, state: 'ATACADO' });
      return await responderComIA(sid, termo, contextoLista(session), respond);
    }
    await saveSession(sid, { ...session, state: 'ATACADO' });
    return respond(`Não encontrei *${termo}* na nossa tabela de atacado de hoje. 🤔\n\nPode ser que ele esteja *esgotado* no momento ou com outro nome na tabela. Tenta o *nome do princípio ativo* (ex.: *oxandrolona* no lugar de *anavar*) ou baixe a tabela completa em PDF:\n${TABELA_ATACADO_URL}\n\n_Se você quer esse produto no *varejo*, digite *menu* — lá o catálogo é outro._`);
  }
  const lista = achados.slice(0, 30);
  await saveSession(sid, { ...session, state: 'ATK_LISTA', atkLista: lista });
  const mais = achados.length > 30 ? `\n\n_(Mostrei 30 de ${achados.length} resultados — me manda um nome mais específico se precisar.)_` : '';
  return respond(`*🏭 Atacado — resultados para "${termo}":*\n\n${formatarListaAtk(lista)}${mais}\n\n*Digite o número do produto:* 👇`);
}

const MSG_PRAZO_VAREJO = `*📦 PRAZO DE POSTAGEM E ENTREGA — Varejo*

⏱️ *Postagem:* em até *3 dias úteis* após a confirmação do pagamento. Com o aumento das fiscalizações, as postagens saem em lotes controlados por dia.

Depois da postagem, os prazos estimados de entrega (dias úteis) são:
🟢 *Sudeste:* SP e RJ 1 a 6 · MG 2 a 6 · ES 2 a 8
🔵 *Sul:* PR 2 a 6 · SC 2 a 7 · RS 2 a 5
🟠 *Centro-Oeste:* DF 3 a 6 · GO 2 a 6 · MS 4 a 8 · MT 4 a 9
🟡 *Nordeste:* BA 3 a 10 · demais estados 5 a 11
🔴 *Norte:* 7 a 11

_*Esses prazos são estimativas e podem variar conforme distância, condições climáticas e acesso rodoviário._`;

const MSG_PERGUNTA_TIPO_PRAZO = `📦 *Sobre prazo de entrega* — me diz qual o tipo da sua compra:

1️⃣ Compra normal (varejo)
2️⃣ Compra no atacado (pedido mínimo R$ 3.000)

0️⃣ Voltar ao menu`;

// ── Tabela de fretes ──────────────────────────────────────────────────────────
// Tabela IGUAL à do site (main-cart-footer). Valores em reais. Atualizada 16/09/2026 (+R$5).
// CE PAC = R$77,50. RR tem Transportadora (igual ao site).
const FRETES = {
  AC:{PAC:135,SEDEX:115,Transp:155}, AL:{PAC:105,SEDEX:130,Transp:95},
  AM:{PAC:105,SEDEX:130,Transp:115}, AP:{PAC:105,SEDEX:130,Transp:125},
  BA:{PAC:63,SEDEX:95,Transp:85},    CE:{PAC:77.5,SEDEX:110,Transp:85},
  DF:{PAC:50,SEDEX:65,Transp:77},    ES:{PAC:50,SEDEX:75,Transp:75},
  GO:{PAC:50,SEDEX:75,Transp:81},    MA:{PAC:105,SEDEX:130,Transp:95},
  MG:{PAC:50,SEDEX:75,Transp:75},    MS:{PAC:50,SEDEX:90,Transp:85},
  MT:{PAC:63,SEDEX:95,Transp:80},    PA:{PAC:92,SEDEX:110,Transp:115},
  PB:{PAC:105,SEDEX:130,Transp:105}, PE:{PAC:92,SEDEX:120,Transp:125},
  PI:{PAC:105,SEDEX:130,Transp:115}, PR:{PAC:50,SEDEX:65,Transp:75},
  RJ:{PAC:50,SEDEX:75,Transp:75},    RN:{PAC:105,SEDEX:130,Transp:105},
  RO:{PAC:105,SEDEX:115,Transp:175}, RR:{PAC:135,SEDEX:115,Transp:155},
  RS:{PAC:50,SEDEX:75,Transp:105},   SC:{PAC:50,SEDEX:75,Transp:75},
  SE:{PAC:105,SEDEX:130,Transp:95},  SP:{PAC:37,SEDEX:45,Transp:53},
  TO:{PAC:92,SEDEX:110,Transp:115},
};

// ── Menus fixos ───────────────────────────────────────────────────────────────
const MENU_PRINCIPAL_BASE = `🛒 *Comprar produtos*

*Escolha uma categoria:*

1️⃣ Emagrecedores 💊
2️⃣ Peptídeos 💉
3️⃣ Hormônios 💪
4️⃣ GH ⚡
5️⃣ Estética 💅
6️⃣ SARMS 🧬
7️⃣ Farmácia 💊
8️⃣ Promoção do momento 🔥
9️⃣ Atacado 🏭 _(mínimo R$ 3.000 · frete grátis)_`;

function buildMenuPrincipal() {
  let menu = MENU_PRINCIPAL_BASE;
  if (semanaClienteAtiva()) {
    menu += `

🧡 *SEMANA DO CLIENTE ATIVA!* Desconto automático que cresce com o seu pedido — digite *promo* ou escolha a *opção 8*. 🔥`;
  }
  if (promoFreteAtiva()) {
    menu += `

🚚 *FRETE GRÁTIS ATIVO!* Acima de *R$ 1.000* com o cupom *FRETEZERO* — só até *quarta (30/09) às 23h59*. Digite *promo* ou escolha a *opção 8*. 🔥`;
  }
  // v89: frete grátis automático (sem data de fim) — aviso fixo no menu enquanto FRETE_GRATIS_AUTO.ativo
  if (freteGratisAutoAtivo() && !promoFreteAtiva()) {
    menu += `

🚚 *FRETE GRÁTIS* em pedidos a partir de *R$ ${reais(FRETE_GRATIS_AUTO.min)}* — automático, sem cupom. Digite *promo* ou escolha a *opção 8*. 🔥`;
  }
  const promo = promoAtiva();
  if (promo) {
    menu += `

🚨 *${promo.titulo} ATIVA!* Digite *promo* ou escolha a *opção 8* para ver as ofertas. ⚡`;
  } else {
    menu += `

🎁 *Sabia que comprando comigo você já ganha 3% de desconto em todos os produtos?* É um benefício exclusivo meu! _(Não acumula com cupom ou promoção — vale sempre o MAIOR desconto pra você 😉)_
🏭 E no *atacado* (opção *9*), o *frete é grátis* — pedido mínimo de R$ 3.000.`;
  }
  menu += `

💬 *Dica:* você também pode digitar direto o *nome do produto* (ex.: retatrutida, stanozolol, gh) que eu já te mostro!

0️⃣ Voltar ao início

_Digite o número da opção_`;
  return menu;
}

const MENU_PRINCIPAL = MENU_PRINCIPAL_BASE + `

0️⃣ Voltar ao início

_Digite o número da opção_`;

// ── TELA DE TRIAGEM (saudação) — 3 caminhos ───────────────────────────────────
function buildTriagem() {
  let m = `✨ *Olá! Bem-vindo à VitaFlow!* 🌿\n\n` +
    `Eu sou a *Athena* 🤖💊 — sua consultora virtual de peptídeos, hormônios, emagrecedores e performance.\n\n` +
    `*Como posso te ajudar agora?*\n\n` +
    `1️⃣ 🛒 *Comprar produtos*\n` +
    `2️⃣ 📦 *Prazos, fretes e rastreio* de pedido\n` +
    `3️⃣ 💬 *Dúvidas, protocolos e tabelas de fracionamento*`;
  const promo = promoAtiva();
  if (promo) m += `\n\n🚨 *${promo.titulo} ATIVA!* (dentro da opção *1* → Promoção do momento) ⚡`;
  // v89: frete grátis automático também na saudação (é a primeira tela que o cliente vê)
  if (freteGratisAutoAtivo()) m += `\n\n🚚 *FRETE GRÁTIS* em pedidos a partir de *R$ ${reais(FRETE_GRATIS_AUTO.min)}* — automático, sem cupom. 🎉`;
  m += `\n\n🎁 *No varejo comigo você tem 3% de desconto — e no atacado o frete é grátis!* 🏭`;
  m += `\n\n_Digite *1*, *2* ou *3*. E se já sabe o que quer, é só mandar o *nome do produto* que eu já te mostro! 😉_`;
  return m;
}

const MSG_PRAZOS_RASTREIO_MENU = `📦 *Prazos, Fretes e Rastreio*\n\n` +
  `1️⃣ Ver *prazos de entrega* (varejo e atacado)\n` +
  `2️⃣ *Rastrear* meu pedido\n` +
  `3️⃣ Consultar *valor do frete*\n\n` +
  `0️⃣ Voltar ao início\n\n` +
  `_Digite o número, *0* para voltar ou *menu* para o início._`;

const MSG_DUVIDAS_INTRO = `💬 *Como posso te ajudar?*\n\n` +
  `1️⃣ *Tirar uma dúvida* (produtos, doses, indicações, comparações)\n` +
  `2️⃣ *Tabela de fracionamento* do que você comprou 💉\n` +
  `3️⃣ *Protocolo completo* do que você comprou 💪\n\n` +
  `0️⃣ Voltar ao início\n\n` +
  `_Digite *1*, *2*, *3* — ou *0* para voltar. (As opções 2 e 3 são cortesia pra cliente — eu puxo pelo seu CPF.)_`;

const MSG_PRAZOS_COMPLETO = MSG_PRAZO_VAREJO + `\n\n` +
  `*🏭 ATACADO (pedido mínimo R$ 3.000):*\n` +
  `⏱️ Postagem em até *6 dias úteis* após a compensação do pagamento. Depois da postagem, valem os mesmos prazos de entrega do varejo (acima).\n\n` +
  `_Digite *2* pra *rastrear* um pedido, *3* pra consultar *frete*, ou *menu* para voltar._`;

// ── Boas-vindas para lead frio (clique no botão "Sim, quero conhecer" do template Meta) ──
const MSG_BOAS_VINDAS_LEAD = `✨ *Seja bem-vindo à VitaFlow!* 🌿

Nós somos especialistas em *peptídeos, hormônios, emagrecedores e performance avançada*, com entrega rápida para todo o Brasil. 🇧🇷

🛒 *Conheça todos os nossos produtos no site:*
https://vitaflowoficial.com

🔬 Temos também um *Gerador de Protocolos gratuito* — de *peptídeos* e de *hormônios* — no site para te ajudar.

📲 *Entre em nossos grupos* e acompanhe novidades, lançamentos, cupons e ofertas relâmpago em primeira mão:
💬 WhatsApp: https://chat.whatsapp.com/BNa4tPKWjaZ1cTP4XwXtgM
✈️ Telegram: https://t.me/referencias_vitaflow

👉 *Me conta: o que você está buscando hoje?* É só escolher a categoria abaixo 👇`;

// ══════════════════════════════════════════════════════════════════════════════
// STELLA — ENTRADA PRÓPRIA, CUPOM DE BOAS-VINDAS E SINAL DE ABANDONO (08/09/2026)
// ══════════════════════════════════════════════════════════════════════════════
// A Stella tem objetivo DIFERENTE da Athena: a Athena atende quem já é cliente e
// fecha pedido; a Stella recruta lead frio pro site e pros grupos. Por isso ela
// ganha uma porta de entrada própria. TUDO aqui só roda quando assistente !== 'Athena'
// — a Athena continua exatamente como está.
const CUPOM_BEMVINDO_PCT  = 7;   // 7% (os 3% da Athena são automáticos; cupom NÃO acumula, vale o MAIOR)
const CUPOM_BEMVINDO_DIAS = 7;   // validade
const CUPOM_BEMVINDO_PREFIXO = 'BEMVINDO';

const MSG_BOAS_VINDAS_STELLA = `✨ *Oi! Que bom te ver por aqui* 🌿

Eu sou a *Stella*, da *VitaFlow*. São *8 anos de mercado*, mais de *900 itens* em peptídeos, hormônios, emagrecedores, GH, estética e farmácia — com *atendimento humanizado*, *rastreamento do pedido do início ao fim* e entrega pra todo o Brasil 🇧🇷

Por onde você prefere começar?

1️⃣ *Conhecer nosso site* 🛒
2️⃣ *Entrar nos grupos* 💬
3️⃣ *Ver produtos e preços* 💊
4️⃣ *Pegar meu cupom de boas-vindas* 🎁

_Digite o número da opção._`;

const MSG_STELLA_SITE = `🛒 Nosso catálogo completo, com preço atualizado em tempo real:
*https://vitaflowoficial.com*

E três coisas que a gente deixa de graça no site, mesmo pra quem ainda não comprou:

📘 *Manual Completo de Peptídeos* — e-book gratuito, 60+ páginas
https://vitaflowoficial.com/pages/ebook

🧮 *Calculadora de peptídeos* — a dosagem certa na hora
https://vitaflowoficial.com/pages/calculadora-de-peptideos

🔬 *Gerador de Protocolos* — peptídeos e hormônios
https://vitaflowoficial.com/pages/gerador-de-protocolo

Quer que eu te mostre os produtos por aqui mesmo? Digite *3*.

0️⃣ Voltar ao menu`;

const MSG_STELLA_GRUPOS = `Queria te fazer um convite, sem compromisso nenhum. 😊

A gente mantém uma *comunidade de mais de 1.000 pessoas* nos nossos dois grupos, onde mostra o dia a dia de verdade: o que chega, resultado de quem usa, dúvida respondida na hora e promoção que aparece lá primeiro.

*Não tem obrigação de comprar nada.* Entra, acompanha uns dias e tira sua própria conclusão — sobre o catálogo, sobre o preço e sobre como a gente atende. É o tipo de coisa que não adianta eu falar, você tem que ver.

São *8 anos de mercado* e mais de *900 itens* em peptídeos, hormônios, emagrecedores, GH, estética e farmácia, com *atendimento humanizado* e *rastreamento do início ao fim*.

💬 WhatsApp: ${GRUPO_WHATSAPP}
✈️ Telegram: ${GRUPO_TELEGRAM}

Entra, acompanha uma semana e me diz o que achou. Te espero lá! 💪

_Quer ver os produtos agora? Digite *3*._

0️⃣ Voltar ao menu`;

// Convite de retomada — usado pelo fluxo do BotConversa quando o lead abre uma lista
// de produtos e some. Fica aqui pra o texto viver junto do resto (o fluxo copia daqui).
const MSG_STELLA_ABANDONO = `Oi! 😊 Vi que nossa conversa parou por aqui — sem problema nenhum.

Só queria te deixar dois atalhos, porque é por eles que muita gente decide:

💬 Nossa *comunidade de mais de 1.000 pessoas* — resultado real, dúvida respondida na hora e promoção em primeira mão:
${GRUPO_WHATSAPP}

🛒 O *site*, com o catálogo completo e preço atualizado:
https://vitaflowoficial.com

Quer que eu siga daqui? É só digitar o número:

1️⃣ *Conhecer nosso site* 🛒
2️⃣ *Entrar nos grupos* 💬
3️⃣ *Ver produtos e preços* 💊
4️⃣ *Pegar meu cupom de boas-vindas de ${CUPOM_BEMVINDO_PCT}%* 🎁`;

// Convite de retomada da ATHENA (08/09/2026). Diferente do da Stella de propósito:
// quem fala com a Athena em geral JÁ está nos grupos e já é cliente — convidar pro
// grupo de novo não serve. Aqui o objetivo é destravar a dúvida que fez a pessoa sumir.
// Vai na variável {athena_abandono} do fluxo, disparada pela saída "Se usuário não
// responder" depois de 3h.
const MSG_ATHENA_ABANDONO = `Oi! 😊 Vi que a gente parou no meio da conversa — sem pressa nenhuma.

Se ficou alguma dúvida de *dose, protocolo, prazo de entrega ou preço*, me pergunta aqui que eu te respondo na hora.

E se você já sabe o que quer, é só me mandar o *nome do produto* que eu monto seu pedido e te passo o link em um minuto. 💪`;

// Aviso de escassez do ATACADO. Vai ANTES do link de pagamento (no fechamento) e é o
// mesmo espírito do MSG_ATACADO_ABANDONO: no atacado o preço acompanha o câmbio e o
// lote acaba rápido, então o valor que o cliente está vendo é o daquele momento.
const AVISO_ATACADO_MOMENTO = `⏳ _Lembrando: preço e disponibilidade dos produtos do atacado são *deste momento* — variam com o câmbio e com o lote, além de esgotarem muito rápido._`;

// Convite de retomada de quem montou carrinho de ATACADO e sumiu (3h). Diferente do
// MSG_ATHENA_ABANDONO de propósito: aqui o gancho é a escassez, não a dúvida.
const MSG_ATACADO_ABANDONO = `Oi! 😊 Vi que você montou seu pedido de *atacado* e a gente acabou parando por aí.

Só que no atacado tem um detalhe importante:

💱 O preço que eu te passei é o de *hoje* — no atacado o valor acompanha o *câmbio*, e ele muda todos os dias.

📦 E o estoque vira *rápido*. Como sai em *volume grande*, um lote acaba de uma hora pra outra — e o lote seguinte já entra com *outro preço*, às vezes até com outra marca.

⏳ Aquele valor e aquela disponibilidade eram *daquele momento*. Não consigo segurar nenhum dos dois.

É só me responder aqui que eu já te mando o *link de pagamento* pra você garantir o seu agora. 💪`;

// Resposta natural ao convite acima = fechar. Sem isso o cliente que responde "quero"
// no ATK_CART cairia na BUSCA de produto e nunca receberia o link.
// Só palavras de intenção: pergunta de verdade ("qual o prazo?") continua sendo pergunta.
// v84 — quantidade PURA: "2", "02", "2x", "x2", "2 un", "2 unidades", "quero 2". "60 mg", "15ml", "2,5" NÃO são quantidade.
function qtdPura(msg) {
  const x = norm(msg || '').replace(/[!.]+$/, '').trim();
  const m = x.match(/^(?:quero |vou querer |so |apenas |me ve |manda )?x?\s*(\d{1,3})\s*x?\s*(?:un|und|unid|unids|unidade|unidades|cx|caixa|caixas|frasco|frascos|kit|kits|peca|pecas)?(?: por favor| pf| pfv)?$/);
  return m ? parseInt(m[1], 10) : NaN;
}
// v84 — "finalizar pedido", "fechar o pedido", "concluir compra" (o rótulo da opção 2 do atacado, digitado por extenso).
function _ehFinalizarTxt(t) {
  const x = norm(t || '').replace(/[!.]+$/, '').trim();
  return /^(quero |vou |pode |vamos )?(finalizar|finaliza|fechar|fecha|concluir|conclui|encerrar)( o| a| meu| minha)?( pedido| compra| atacado| pedido de atacado)?$/.test(x);
}
// v84 — o que sobra da mensagem depois de tirar a saudação do começo ("Ola meu pedido veio errado" → "meu pedido veio errado").
function _restoSemSaudacao(nMsg) {
  let x = String(nMsg || '').replace(/[!?.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  let antes;
  do { antes = x; x = x.replace(/^(ola|oi+|opa|eai|e ai|hey|alo|bom dia|boa tarde|boa noite|hi|hello|tudo bem|tudo bom|td bem|blz|beleza|athena|stella|pessoal|gente|amigo|amiga|querido|querida)( |$)/, '').trim(); } while (x !== antes);
  return x;
}
// v84 — reclamação de pedido que chegou errado/faltando/danificado (vai pro atendente, não pra venda).
function ehReclamacaoPedido(nMsg) {
  const x = ' ' + String(nMsg || '') + ' ';
  if (/(veio|chegou|recebi|mandaram|enviaram|entregaram)( o| a| um| uma| meu| minha)?( produto| pedido| item| encomenda)? (errad[oa]|trocad[oa]|faltando|incompleto|quebrad[oa]|danificad[oa]|vazando|vazad[oa]|abert[oa]|violad[oa])/.test(x)) return true;
  if (/(produto|pedido|item|encomenda) (veio |chegou |esta |ta )?(errad[oa]|trocad[oa]|incompleto|quebrad[oa]|danificad[oa]|violad[oa])/.test(x)) return true;
  if (/(faltou|faltaram|veio faltando|chegou faltando) (um |uma |o |a |\d+ )?(produto|produtos|item|itens|frasco|frascos|ampola|ampolas|caixa|caixas)/.test(x)) return true;
  if (/ comprei /.test(x) && / (recebi|veio|chegou|mandaram|enviaram) /.test(x) && reconhecerVarios(String(nMsg || '')).length >= 2) return true;
  if (/(consta|aparece|diz|esta|ta) (como |que foi |que )?(entregue|entrega)/.test(x) && /(nao recebi|nao chegou|nao foi entregue|foi entregue apenas|so (chegou|recebi|veio)|apenas (1|um|uma)|faltou)/.test(x)) return true;   // v85
  return false;
}
// v85 — o cliente colou o BLOCO DE DADOS de envio (3+ linhas rotuladas) fora da coleta.
function ehBlocoDados(msg) {
  const linhas = String(msg || '').split(/\n+/);
  let n = 0;
  linhas.forEach(l => { if (/^\s*(nome( completo)?|cpf|telefone|celular|e-?mail|rua( e n[uú]mero)?|endere[cç]o|complemento|bairro|cidade|estado|uf|cep)\s*[:\-]/i.test(l)) n++; });
  return n >= 3;
}
const MSG_DADOS_REENVIADOS = 'Recebi seus dados! 😊 Como o seu pedido *já está registrado*, encaminhei a correção pra nossa equipe conferir e ajustar o envio.\n\nSe precisar falar com uma pessoa, é só digitar *atendente*.';
// v85 — e-mail "solto": a mensagem é basicamente o e-mail ("E-mail fulano@x.com", "meu email é …").
function ehEmailSolto(msg) {
  const em = idEmail(msg);
  if (!em) return false;
  const resto = String(msg || '').toLowerCase().replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ' ').replace(/e-?mail|meu|minha|compra|:/g, ' ').replace(/(^|\s)(o|é|e|da|de)(?=\s|$)/g, ' ').replace(/[^a-zà-úç]/g, '');
  return resto.length <= 3;
}
// v85 — todos os dados de pedido que vieram na mensagem, na ordem de confiança (pedido, CPF, e-mail).
function termosRastreio(msg) {
  const out = [];
  const p = idPedido(msg); if (p) out.push(p);
  const c = idCpf(msg); if (c.cpf) out.push(c.cpf);
  const e = idEmail(msg); if (e) out.push(e);
  return out;
}
// v85 — linha da lista colada inteira ("3️⃣ Tirzec 15mg (4 ampolas - Total 60mg) — R$ 759,00") → índice na lista, ou -1.
function indicePorNomeExato(lista, msg) {
  const limpa = x => norm(String(x || '').replace(/\s[—–-]\s*R\$\s*[\d.,]+.*$/, '').replace(/[*_]/g, '').replace(/^[^a-zA-ZÀ-ú0-9]*(\d{1,2}[.)]\s+)?/, '')).replace(/\s+/g, ' ').trim();
  const alvo = limpa(msg);
  if (alvo.length < 6) return -1;
  const ach = [];
  (lista || []).forEach((p, i) => { if (limpa(p.nome) === alvo) ach.push(i); });
  return ach.length === 1 ? ach[0] : -1;
}
function _ehQueroFechar(t) {
  const x = (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (!x || x.length > 40) return false;
  return /^(sim|isso|ok|okay|blz|beleza|bora|vamos|vamo|quero|quero sim|pode|pode mandar|pode ser|manda|manda ai|me manda|manda o link|link|o link|fechar|fecha|fechado|finalizar|finaliza|pagar|quero pagar|quero fechar|quero o link|ainda quero|continuar|continua)[!.…]*$/.test(x);
}

// ── Cupom de boas-vindas ──────────────────────────────────────────────────────
// Grava direto no Firestore (mesma coleção `cupons_vitaflow` que o site e o
// fechamento leem) — NÃO passa pela API do BotConversa, então funciona na Stella
// mesmo com a API da VitaMK bloqueada.
// Formato: tipo 'pct', tipoVal 'unico_prazo' (uso único + validade) — o validarCupom
// já entende esse tipo. Produtos "sem desconto" e de promoção por quantidade ficam
// de fora sozinhos no fechamento; nada a fazer aqui.
function _codigoCupomAleatorio(){
  const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I, O, 0, 1 — o cliente digita isso
  let s = '';
  for (let i = 0; i < 4; i++) s += ALFA.charAt(Math.floor(Math.random() * ALFA.length));
  return CUPOM_BEMVINDO_PREFIXO + '-' + s;
}
async function criarCupomBoasVindas(sid){
  try {
    // tenta até 3 códigos: se por azar já existir, gera outro (não sobrescreve cupom de ninguém)
    let codigo = null;
    for (let i = 0; i < 3; i++) {
      const tentativa = _codigoCupomAleatorio();
      const jaExiste = await validarCupom(tentativa, 999999);
      if (!jaExiste || !jaExiste.ok) { codigo = tentativa; break; }
    }
    if (!codigo) return null;

    const expira = new Date(Date.now() + CUPOM_BEMVINDO_DIAS * 24 * 60 * 60 * 1000);
    const docId = 'bemvindo_' + String(sid).replace(/\D/g,'') + '_' + Date.now();
    const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/cupons_vitaflow?key=${FIRESTORE_KEY}&documentId=${docId}`;
    const body = { fields: {
      codigo:     { stringValue: codigo },
      ativo:      { booleanValue: true },
      tipo:       { stringValue: 'pct' },
      valor:      { doubleValue: CUPOM_BEMVINDO_PCT },
      tipoVal:    { stringValue: 'unico_prazo' },   // uso único E com prazo
      expira:     { timestampValue: expira.toISOString() },
      maxUsos:    { integerValue: 1 },
      usosAtual:  { integerValue: 0 },
      minPedido:  { doubleValue: 0 },
      maxDesc:    { doubleValue: 0 },
      // rastreabilidade — pra você saber de onde veio cada cupom na Gestão de Cupons
      origem:     { stringValue: 'stella-boas-vindas' },
      telefone:   { stringValue: String(sid) },
      criadoEm:   { stringValue: new Date().toISOString() }
    }};
    const r = await fetchT(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }, 6000);
    if (!r.ok) { console.log('[CUPOM] falhou ao criar:', r.status); return null; }
    console.log('[CUPOM] criado:', codigo, 'para', sid, 'expira', expira.toISOString());
    return { codigo: codigo, expira: expira };
  } catch (e) { console.log('[CUPOM] excecao:', e.message); return null; }
}
function _dataBR(d){
  try { return new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'2-digit', timeZone:'America/Sao_Paulo' }).format(d); }
  catch (e) { return ('0'+d.getDate()).slice(-2) + '/' + ('0'+(d.getMonth()+1)).slice(-2); }
}
function msgCupomBoasVindas(cupom){
  const linhas = [];
  linhas.push(`🎁 Prontinho! Seu cupom de boas-vindas:`);
  linhas.push('');
  linhas.push(`🏷️ *${cupom.codigo}*`);
  linhas.push(`💰 *${CUPOM_BEMVINDO_PCT}% de desconto* · válido até *${_dataBR(cupom.expira)}* · uso único`);
  linhas.push('');
  linhas.push(`Vale em *todos os nossos canais de vendas*.`);
  // Quando há promoção MAIOR no ar, é desonesto deixar o cliente usar o cupom pior.
  // A gente avisa e transforma isso em motivo pra uma SEGUNDA compra dentro da validade.
  if (typeof promoIndepAtiva === 'function' && promoIndepAtiva()) {
    linhas.push('');
    linhas.push(`💡 *Dica:* a *Independência 9.9* está rolando com *15% OFF* (cupom *INDEPENDENCIA99*) e é melhor que o seu. Aproveita ela agora — e o seu cupom de boas-vindas fica guardado pra uma *segunda compra* dentro da validade. 😉`);
  }
  linhas.push('');
  linhas.push(`Quer ver os produtos? Digite *3*.`);
  linhas.push('');
  linhas.push(`0️⃣ Voltar ao menu`);
  return linhas.join('\n');
}


const MENU_PEPTIDEOS = `*💊 PEPTÍDEOS*

1️⃣ BPC-157
2️⃣ TB-500
3️⃣ GHK-Cu
4️⃣ Klow
5️⃣ Glow
6️⃣ SS-31
7️⃣ MOTS-C
8️⃣ Ipamorelin
9️⃣ CJC-1295
🔟 PT-141
11. AOD-9604
12. CBL-514
13. Epitalon
14. NAD+
15. Tesamorelin
16. Outros peptídeos

0️⃣ Voltar ao menu anterior

_Digite o número, o *nome do produto*, *0* para voltar ou *menu* para o início_

_Procurando Retatrutida, Tirzepatida ou Semaglutida? Estão em *Emagrecedores* (opção 2)._`;

const MENU_HORMONIOS = `*💉 HORMÔNIOS*

1️⃣ Enantato de Testosterona
2️⃣ Testosterona / Durateston (mix)
3️⃣ NPP (Nandrolona Fenilpropionato)
4️⃣ Trembolona
5️⃣ Boldenona
6️⃣ Stanozolol
7️⃣ Oxandrolona
8️⃣ Nandrolona (Deca)
9️⃣ Masteron
🔟 Primobolan
11. Dianabol
12. Hemogenin (Anadrol)
13. HCG
14. Anastrozol / Proviron
15. CutStack
16. Outros hormônios

0️⃣ Voltar ao menu anterior

_Digite o número, o *nome do produto*, *0* para voltar ou *menu* para o início_`;

const MENU_FABRICANTES = `*🏭 BUSCAR POR FABRICANTE*

1️⃣ ZPHC
2️⃣ Veltrane
3️⃣ Landerlan
4️⃣ Muscle Labs
5️⃣ Alpha Pharma
6️⃣ Health Peptides
7️⃣ Alluvi Healthcare
8️⃣ Lipoless
9️⃣ Cooper Pharma
🔟 Neuroceptix
11. King Pharma
12. Synedica
13. NeoPeptides
14. Eurogold
15. Novax Pharmaceuticals
16. Bratva Labs
17. Outro fabricante (digitar nome)

0️⃣ Voltar ao menu anterior

_Digite o número, o *nome do produto*, *0* para voltar ou *menu* para o início_`;

const MENU_TESTO = `*💉 TESTOSTERONA — qual éster você procura?*

1️⃣ Enantato
2️⃣ Cipionato
3️⃣ Durateston (blend)
4️⃣ Outras (Propionato, Suspensão, Undecanoato/Nebido)

0️⃣ Voltar ao menu anterior

_Digite o número, *0* para voltar ou *menu* para o início_`;

const MENU_BASE_ESTER = `1️⃣ Testosterona
2️⃣ Trembolona
3️⃣ Masteron
4️⃣ Nandrolona
5️⃣ Outras

0️⃣ Voltar ao menu anterior

_Digite o número, *0* para voltar ou *menu* para o início_`;

// ── NAVEGAÇÃO: "0" ou "voltar" sobe UM nível na árvore de menus ───────────────
// Formata uma produtoLista (objetos {nome,preco}) de volta em lista numerada.
function fmtProdLista(arr) {
  return (arr || []).map(function (p, i) {
    var pr = Number(p.preco) || 0;
    return emojis(i) + ' *' + p.nome + '*' + (pr > 0 ? (' — R$ ' + pr.toFixed(2).replace('.', ',')) : '');
  }).join('\n');
}
// De qual MENU a lista de produtos veio. Sem isso o "0" numa lista voltava sempre pro menu de
// categorias em vez do menu anterior (ex.: lista de Enantato voltava pro menu principal, não pro
// menu de Hormônios). Reclamação do VitaFlow em 18/09/2026.
function origemDaLista(session) {
  var st = session && session.state;
  var MENUS = ['HORMONIOS','PEPTIDEOS','SUBMENU_TESTO','ESTER_BASE','FABRICANTES','ATACADO','MENU'];
  if (MENUS.indexOf(st) >= 0) return st;
  // Já estava numa lista (ou escolhendo quantidade): preserva a origem que já tinha.
  if (st === 'LISTA_PRODUTOS' || st === 'QUANTIDADE') return (session && session.origemLista) || 'MENU';
  return 'MENU';
}

// Sobe um nível conforme o estado atual (o "menu anterior").
async function voltarAthena(session, sid, respond) {
  var st = session.state;
  if (st === 'MENU_STELLA') {
    await saveSession(sid, { ...session, state: 'MENU' }); return respond('↩️ *Voltando às categorias*\n\n' + buildMenuPrincipal());
  }
  if (st === 'MENU' || st === 'PRAZOS_RASTREIO' || st === 'DUVIDAS') {
    await saveSession(sid, { ...session, state: 'TRIAGEM' }); return respond('↩️ *Voltando ao início*\n\n' + buildTriagem());
  }
  if (st === 'LISTA_PRODUTOS') {
    var org = session.origemLista || 'MENU';
    if (org === 'HORMONIOS') { await saveSession(sid, { ...session, state: 'HORMONIOS' }); return respond('↩️\n\n' + MENU_HORMONIOS); }
    if (org === 'PEPTIDEOS') { await saveSession(sid, { ...session, state: 'PEPTIDEOS' }); return respond('↩️\n\n' + MENU_PEPTIDEOS); }
    if (org === 'SUBMENU_TESTO' || org === 'ESTER_BASE') { await saveSession(sid, { ...session, state: 'SUBMENU_TESTO' }); return respond('↩️\n\n' + MENU_TESTO); }
    if (org === 'ATACADO') { await saveSession(sid, { ...session, state: 'ATACADO' }); return respond('↩️\n\n' + MSG_ATACADO); }
    await saveSession(sid, { ...session, state: 'MENU' }); return respond('↩️ *Voltando às categorias*\n\n' + buildMenuPrincipal());
  }
  if (st === 'PEPTIDEOS' || st === 'HORMONIOS' || st === 'ATACADO') {
    await saveSession(sid, { ...session, state: 'MENU' }); return respond('↩️ *Voltando às categorias*\n\n' + buildMenuPrincipal());
  }
  if (st === 'SUBMENU_TESTO' || st === 'FABRICANTES' || st === 'BUSCA_LIVRE') {
    await saveSession(sid, { ...session, state: 'HORMONIOS' }); return respond('↩️\n\n' + MENU_HORMONIOS);
  }
  if (st === 'ESTER_BASE') {
    await saveSession(sid, { ...session, state: 'SUBMENU_TESTO' }); return respond('↩️\n\n' + MENU_TESTO);
  }
  if (st === 'PRAZO_TIPO' || st === 'FRETE_AVULSO' || st === 'RASTREAR') {
    await saveSession(sid, { ...session, state: 'PRAZOS_RASTREIO' }); return respond('↩️\n\n' + MSG_PRAZOS_RASTREIO_MENU);
  }
  if (st === 'DUVIDAS_LIVRE') {
    await saveSession(sid, { ...session, state: 'DUVIDAS' }); return respond('↩️\n\n' + MSG_DUVIDAS_INTRO);
  }
  if (st === 'QUANTIDADE') {
    var lista = session.produtoLista || [];
    if (lista.length) { await saveSession(sid, { ...session, state: 'LISTA_PRODUTOS' }); return respond('↩️ *Voltando à lista*\n\n' + fmtProdLista(lista) + '\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_'); }
    await saveSession(sid, { ...session, state: 'MENU' }); return respond('↩️\n\n' + buildMenuPrincipal());
  }
  if (st === 'ATK_LISTA' || st === 'ATK_CART') {
    await saveSession(sid, { ...session, state: 'ATACADO' }); return respond('↩️\n\n' + MSG_ATACADO);
  }
  // ── Grupo A (18/09/2026): menus de navegação que ignoravam o "0" ──
  if (st === 'CARRINHO') {
    await saveSession(sid, { ...session, state: 'MENU' }); return respond('↩️ *Seu carrinho está guardado!*\n\n' + buildMenuPrincipal());
  }
  if (st === 'REMOVER_ITEM') {
    var _car = session.carrinho || [];
    if (_car.length) { await saveSession(sid, { ...session, state: 'CARRINHO' }); return respond('↩️\n\n' + msgCarrinhoMenu(_car)); }
    await saveSession(sid, { ...session, state: 'MENU' }); return respond('↩️\n\n' + buildMenuPrincipal());
  }
  if (st === 'ATK_REMOVER') {
    var _atk = session.carrinhoAtk || [];
    if (_atk.length) { await saveSession(sid, { ...session, state: 'ATK_CART' }); return respond('↩️\n\n' + msgCarrinhoAtk(_atk)); }
    await saveSession(sid, { ...session, state: 'ATACADO' }); return respond('↩️\n\n' + MSG_ATACADO);
  }
  // Gerador de protocolos: o "0" faz o MESMO que a palavra "voltar" já fazia nesses estados
  // (vai pro menu principal). Mantido igual de propósito, pra não mudar comportamento conhecido.
  if (st === 'POS_TABELA_FRAC' || st === 'PROTO_TIPO' || st === 'PROTO_ESCOLHER' || st === 'PROTO_IDENTIFICAR' || st === 'PROTO_CLIENTE') {
    await saveSession(sid, { ...session, state: 'MENU' }); return respond('↩️\n\n' + buildMenuPrincipal());
  }
  if (st === 'ATK_QTD') {
    var listaAtk = session.atkLista || [];
    if (listaAtk.length) { await saveSession(sid, { ...session, state: 'ATK_LISTA' }); return respond('↩️ *Voltando à lista de atacado*\n\n' + formatarListaAtk(listaAtk) + '\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_'); }
    await saveSession(sid, { ...session, state: 'ATACADO' }); return respond('↩️\n\n' + MSG_ATACADO);
  }
  await saveSession(sid, { ...session, state: 'MENU' }); return respond('↩️\n\n' + buildMenuPrincipal());
}

// ── ENTREGA 3 — RECONHECIMENTO DE PRODUTO POR TEXTO ───────────────────────────
// Específico ANTES do genérico (GHK-Cu/HGH Frag antes de GH). canonico=claro (direto);
// apelidos=gíria/erro (confirma antes). Ésteres sozinhos => pergunta a base.
const DICT_PRODUTOS = [
  { label:'Retatrutida', tipo:'lista', colecao:'emagrecedores', filtro:['retatrutida'],
    canonico:['retatrutida'], apelidos:['retra','retras','reta','retratutida','retatrutdia','retatrutina'] },
  { label:'Tirzepatida', tipo:'lista', colecao:'emagrecedores', filtro:['tirzepatida'],
    canonico:['tirzepatida','mounjaro','zepbound'], apelidos:['tirze','tirza','tirzepatda','tirzepatina'] },
  { label:'Semaglutida', tipo:'lista', colecao:'emagrecedores', filtro:['semaglutida'],
    canonico:['semaglutida','ozempic','wegovy'], apelidos:['sema','semaglutda','semaglutina'] },
  { label:'Saxenda', tipo:'saxenda', colecao:'emagrecedores', filtro:[],
    canonico:['saxenda','liraglutida'], apelidos:[] },
  { label:'GHK-Cu', tipo:'lista', colecao:'peptideos', filtro:['ghk'],
    canonico:['ghk-cu','ghkcu','ghk'], apelidos:[] },
  { label:'HGH Frag 176-191', tipo:'lista', colecao:'peptideos', filtro:['frag'],
    canonico:['hgh frag','hgh fragment','frag 176','frag176','176-191'], apelidos:['frag'] },
  { label:'GH', tipo:'categoria', colecao:'gh', filtro:[],
    canonico:['hgh','somatropina','hormonio do crescimento','hormonio de crescimento'], apelidos:['gh'] },
  { label:'BPC-157', tipo:'lista', colecao:'peptideos', filtro:['bpc'],
    canonico:['bpc-157','bpc157','bpc'], apelidos:[] },
  { label:'TB-500', tipo:'lista', colecao:'peptideos', filtro:['tb-500','tb500'],
    canonico:['tb-500','tb500'], apelidos:['tb'] },
  { label:'Ipamorelin', tipo:'lista', colecao:'peptideos', filtro:['ipamorelin'],
    canonico:['ipamorelin'], apelidos:['ipa','ipamo'] },
  { label:'CJC-1295', tipo:'lista', colecao:'peptideos', filtro:['cjc'],
    canonico:['cjc-1295','cjc1295','cjc'], apelidos:[] },
  { label:'Klow', tipo:'lista', colecao:'peptideos', filtro:['klow'], canonico:['klow'], apelidos:[] },
  { label:'Glow', tipo:'lista', colecao:'peptideos', filtro:['glow'], canonico:['glow'], apelidos:[] },
  { label:'SS-31', tipo:'lista', colecao:'peptideos', filtro:['ss-31','ss31'], canonico:['ss-31','ss31'], apelidos:[] },
  { label:'MOTS-C', tipo:'lista', colecao:'peptideos', filtro:['mots-c','motsc'], canonico:['mots-c','motsc'], apelidos:['mots'] },
  { label:'PT-141', tipo:'lista', colecao:'peptideos', filtro:['pt-141','pt141'], canonico:['pt-141','pt141','pt 141'], apelidos:['bremelanotide'] },
  { label:'AOD-9604', tipo:'lista', colecao:'peptideos', filtro:['aod-9604','aod9604','aod'], canonico:['aod-9604','aod9604','aod'], apelidos:[] },
  { label:'CBL-514', tipo:'lista', colecao:'peptideos', filtro:['cbl-514','cbl514','cbl'], canonico:['cbl-514','cbl514','cbl'], apelidos:[] },
  { label:'Epitalon', tipo:'lista', colecao:'peptideos', filtro:['epitalon'], canonico:['epitalon','epithalon'], apelidos:[] },
  { label:'NAD+', tipo:'lista', colecao:'peptideos', filtro:['nad'], canonico:['nad+','nad'], apelidos:[] },
  { label:'Tesamorelin', tipo:'lista', colecao:'peptideos', filtro:['tesamorelin'], canonico:['tesamorelin','tesamorelina'], apelidos:['tesa','tesamorelim','tezamorelin'] },
  { label:'Água Bacteriostática', tipo:'busca_tudo', colecao:'', filtro:['bacteriostatica'],
    canonico:['agua bacteriostatica','bacteriostatica','agua bac'], apelidos:['bac'] },
  { label:'Testosterona', tipo:'submenu_testo', colecao:'hormonios', filtro:['testosterona'],
    canonico:['testosterona'], apelidos:['testo','tt','dura','durateston'] },
  { label:'Enantato', tipo:'ester', ester:'enantato', colecao:'hormonios', filtro:[], canonico:['enantato'], apelidos:['enan'] },
  { label:'Cipionato', tipo:'ester', ester:'cipionato', colecao:'hormonios', filtro:[], canonico:['cipionato'], apelidos:['cipio'] },
  { label:'Propionato', tipo:'ester', ester:'propionato', colecao:'hormonios', filtro:[], canonico:['propionato'], apelidos:['propio'] },
  { label:'Acetato', tipo:'ester', ester:'acetato', colecao:'hormonios', filtro:[], canonico:['acetato'], apelidos:[] },
  { label:'Fenilpropionato', tipo:'ester', ester:'fenilpropionato', colecao:'hormonios', filtro:[], canonico:['fenilpropionato'], apelidos:[] },
  { label:'Undecanoato', tipo:'ester', ester:'undecanoato', colecao:'hormonios', filtro:[], canonico:['undecanoato'], apelidos:[] },
  { label:'Decanoato', tipo:'ester', ester:'decanoato', colecao:'hormonios', filtro:[], canonico:['decanoato'], apelidos:[] },
  { label:'Trembolona', tipo:'lista', colecao:'hormonios', filtro:['trembolona'], canonico:['trembolona','parabolan'], apelidos:['trembo','tren'] },
  { label:'Nandrolona (Deca)', tipo:'lista', colecao:'hormonios', filtro:['nandrolona'], canonico:['nandrolona','deca-durabolin','deca durabolin','durabolin','decanoato de nandrolona','nandrolona decanoato'], apelidos:['deca'], excluir:['fenilpropionato','npp'] },
  { label:'NPP', tipo:'lista', colecao:'hormonios', filtro:['npp','fenilpropionato'], canonico:['npp'], apelidos:[] },
  { label:'Stanozolol', tipo:'lista', colecao:'hormonios', filtro:['stanozolol'], canonico:['stanozolol','winstrol'], apelidos:['stano','wins','estano'] },
  { label:'Oxandrolona', tipo:'lista', colecao:'hormonios', filtro:['oxandrolona'], canonico:['oxandrolona','anavar'], apelidos:['oxa','oxan'] },
  { label:'Masteron', tipo:'lista', colecao:'hormonios', filtro:['masteron','drostanolona'], canonico:['masteron','drostanolona'], apelidos:['maste','master'] },
  { label:'Boldenona', tipo:'lista', colecao:'hormonios', filtro:['boldenona'], canonico:['boldenona','equipoise'], apelidos:['bold'] },
  { label:'Primobolan', tipo:'lista', colecao:'hormonios', filtro:['primobolan','metenolona'], canonico:['primobolan','metenolona'], apelidos:['primo'] },
  { label:'Hemogenin (Anadrol)', tipo:'lista', colecao:'hormonios', filtro:['hemogenin','oximetolona'], canonico:['hemogenin','anadrol','oximetolona'], apelidos:['hemo'] },
  { label:'Dianabol', tipo:'lista', colecao:'hormonios', filtro:['dianabol','metandienona'], canonico:['dianabol','metandienona','bombadrol'], apelidos:['dbol','diana'] },
  { label:'Clembuterol', tipo:'lista', colecao:'farmacia', filtro:['clembuterol'], canonico:['clembuterol','clenbuterol'], apelidos:['clen','clembu','clenbu'] },
  { label:'Venvanse', tipo:'lista', colecao:'farmacia', filtro:['venvanse'], canonico:['venvanse','vyvanse','lisdexanfetamina'], apelidos:['venvans'] },
  { label:'HCG', tipo:'lista', colecao:'hormonios', filtro:['hcg'], canonico:['hcg'], apelidos:[] },
  { label:'Anastrozol / Proviron', tipo:'lista', colecao:'hormonios', filtro:['anastrozol','proviron'], canonico:['anastrozol','proviron','arimidex'], apelidos:[] },
  { label:'CutStack', tipo:'lista', colecao:'hormonios', filtro:['cutstack'], canonico:['cutstack','cut stack'], apelidos:[] },
  { label:'Botox', tipo:'lista', colecao:'estetica', filtro:['botox'], canonico:['botox','toxina botulinica'], apelidos:['bota'] },
];

// diferem por no máximo 1 edição (substituição/inserção/remoção) — pega erros como "tesamorelim" vs "tesamorelin"
function _diff1(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, diffs = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diffs > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else { i++; j++; }
  }
  if (i < la || j < lb) diffs++;
  return diffs <= 1;
}
function termoBate(termo, nMsg) {
  const t = norm(termo);
  if (!t) return false;
  if (nMsg === t) return true;
  const palavras = nMsg.split(/[^a-z0-9+]+/).filter(Boolean);
  // 1) palavra inteira exata
  if (palavras.includes(t)) return true;
  // 2) palavra inteira ignorando hífen: "pt-141" ~ "pt141", "bpc-157" ~ "bpc157"
  const tCompacto = t.replace(/[-\s]/g, '');
  const palavrasCompactas = palavras.map(p => p.replace(/-/g, ''));
  if (tCompacto.length >= 2 && palavrasCompactas.includes(tCompacto)) return true;
  // 3) substring compacto — SÓ se o termo tem DÍGITO (códigos: pt-141, bpc-157, tb-500...)
  //    ou é longo (>=6). Evita apelido curto de letras ('dura') casar dentro de 'gordura'.
  const temDigito = /[0-9]/.test(tCompacto);
  if (temDigito || tCompacto.length >= 6) {
    const msgCompacto = nMsg.replace(/[-\s]/g, '');
    if (msgCompacto.includes(tCompacto)) return true;
  }
  // 4) grafia aproximada (1 letra de diferença) — tolera erro de digitação só em termos longos
  if (t.length >= 6) {
    if (palavras.some(p => _diff1(p, t))) return true;
    if (tCompacto.length >= 6 && palavrasCompactas.some(p => _diff1(p, tCompacto))) return true;
  }
  return false;
}

// Termos de BUSCA da categoria = filtro + sinônimos formais (canonico), sem duplicar.
// Assim a lista de uma categoria acha também os produtos com nome alternativo
// (ex.: Deca via "durabolin"/"decanoato", Stanozolol via "winstrol", Oxandrolona via "anavar").
// NÃO usamos os apelidos curtos (ex.: "deca","bold") no filtro da LISTA pra evitar casar como
// substring dentro de outro produto — apelido serve só pra RECONHECER o que o cliente digitou.
function termosCategoria(e){
  var base = (e && Array.isArray(e.filtro)) ? e.filtro.slice() : [];
  if (e && Array.isArray(e.canonico)) base = base.concat(e.canonico);
  var vistos = {}, out = [];
  for (var i = 0; i < base.length; i++){
    var termo = base[i];
    var k = norm(termo);
    if (k && !vistos[k]) { vistos[k] = 1; out.push(termo); }
  }
  return out.length ? out : ((e && e.filtro) || []);
}
// Remove da lista os itens cujo nome contém algum termo de exclusão (ex.: tira NPP/Fenilpropionato
// da categoria Deca). Recebe linhas "nome|preco".
function aplicarExclusao(linhas, excluir){
  if (!excluir || !excluir.length) return linhas;
  return (linhas || []).filter(function(l){
    var nl = norm(l);
    return !excluir.some(function(x){ return nl.includes(norm(x)); });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// CATÁLOGO INTELIGENTE (bloco "ci") — 05/10/2026 — MESMO BLOCO em 3 arquivos: botconversa.js,
// athena-ia.js e athena-ia-background.js. Mudou aqui → mudar nos 3.
// Por que existe (ordem do Thiago, 05/10: "ela não reconhece nada… tem que reprogramá-la para ficar
// inteligente… resolva definitivamente"): o reconhecimento de produto dependia de LISTAS ESCRITAS À
// MÃO (dicionário, marcas, termos de menu). Quando os nomes do catálogo mudaram ("Deca", "Cipionato",
// "Durateston", linha "Landerlan Diamond"…), as listas ficaram para trás: "nandrolona" respondia
// "não está disponível" com 20 Decas à venda, "linha diamond" e "DHB" iam para a IA, que negava.
// Agora o entendimento sai DO PRÓPRIO CATÁLOGO, a cada mensagem:
//   1) cada produto vira um conjunto de palavras (nome, dosagem, marca, linha) + sinônimos da
//      substância (CI_SINONIMOS: deca ↔ nandrolona, cipionato → testosterona, stanozolol ↔ winstrol…);
//   2) o pedido do cliente é limpo (saudação, "quanto está o valor da", "linha", "tem"…) e cada
//      palavra que sobra tem que existir no produto (exata, início de palavra, código colado ou
//      1 letra errada em palavra longa);
//   3) nada disponível com aquelas palavras → pergunta à LOJA (busca pública do site) se o produto
//      existe e está ESGOTADO — a Athena passa a dizer "está esgotado no momento" em vez de "não consta";
//   4) coleção do cache parada há mais de 7 dias é ignorada (proteção contra nome e preço antigos).
//      A antiga coleção de "sobras" foi EXTINTA (Thiago, 05/10: todo produto tem coleção própria) e saiu daqui de vez.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const CI_COLECOES = ['peptideos','hormonios','gh','emagrecedores','estetica','farmacia','sarms','10-mais-vendidos'];
const CI_VALIDADE_MS = 7 * 24 * 3600 * 1000;
const CI_LOJA_SUGGEST = 'https://vitaflowoficial.com/search/suggest.json';
const CI_LOJA_TIMEOUT_MS = 2500;

// palavra do NOME do produto → palavras que o cliente também usa para ele (substância, nome de
// referência, apelido). Só conhecimento estável de farmacologia/mercado; nada de preço ou estoque.
const CI_SINONIMOS = {
  deca: ['nandrolona','durabolin','decadurabolin','decanoato'], decamix: ['nandrolona','deca'],
  npp: ['nandrolona','fenilpropionato'],
  cipionato: ['testosterona','cipio','cypionate','deposteron'],
  durateston: ['testosterona','sustanon','dura'],
  stanozolol: ['winstrol','stano','wins','estano','estanozolol'],
  oxandrolona: ['anavar','oxa','oxan'],
  hemogenin: ['anadrol','oximetolona','hemo'],
  dianabol: ['metandienona','dbol','diana','metandrostenolona'],
  primobolan: ['metenolona','primo'],
  boldenona: ['equipoise','bold','undecilenato'],
  masteron: ['drostanolona','master','maste'],
  trembolona: ['tren','trembo','trenbolona','trenbolone','parabolan'],
  trembo: ['trembolona','tren'], tritrembo: ['trembolona','tren'], tritrembolona: ['trembolona','tren','tritrembo'],
  halotestin: ['fluoximesterona','halo'], turinabol: ['tbol','clorodehidrometiltestosterona'],
  proviron: ['mesterolona'], superdrol: ['metildrostanolona','metasterona'],
  trestolona: ['ment'], dhb: ['dihidroboldenona','dihydroboldenone','dihidro','1testosterona'],
  clomifeno: ['clomid','indux'], tamoxifeno: ['nolvadex','tamox'], anastrozol: ['arimidex'],
  cabergolina: ['dostinex'], exemestano: ['aromasin'],
  t3: ['cytomel','liotironina'], t4: ['levotiroxina','puran'],
  clembuterol: ['clenbuterol','clen','clembu','clenbu','lavizoo'],
  hcg: ['gonadotrofina','gonadotropina','pregnyl'],
  pramil: ['viagra','sildenafila','sildenafil'], tadalafila: ['cialis','tadalafil'],
  stavigile: ['modafinil','modafinila'], metilfenidato: ['ritalina'], ritalina: ['metilfenidato'],
  venvanse: ['vyvanse','lisdexanfetamina','venvans'],
  isotretinoina: ['roacutan','acutan'], zolpidem: ['stilnox'], clonazepam: ['rivotril'], rivotril: ['clonazepam'],
  semaglutida: ['ozempic','wegovy','sema','semaglutide'],
  tirzepatida: ['mounjaro','tirze','tirzepatide'],
  // marcas comerciais de tirzepatida no catálogo (confirmadas pelo Thiago em 23/09/2026)
  tg: ['tirzepatida'], tirzec: ['tirzepatida'], lipoland: ['tirzepatida'], lipoless: ['tirzepatida'], mounjaro: ['tirzepatida'],
  t36: ['tirzepatida'], slimex: ['tirzepatida'], tirzedral: ['tirzepatida'], gluconex: ['tirzepatida'],
  retatrutida: ['reta','retatrutide'],
  gh: ['hgh','somatropina','somatotropina'],
  botox: ['toxina','botulinica'], bacteriostatica: ['bac','bacteriostatic'],
  igf1: ['igf'], ghkcu: ['ghk'], bpc157: ['bpc'], tb500: ['tb','timosina'], motsc: ['mots'], pt141: ['bremelanotide','bremelanotida'],
  ipamorelin: ['ipa','ipamo','ipamorelina'], tesamorelin: ['tesa','tesamorelina'], sermorelin: ['sermorelina'],
  melanotan: ['mt2','melanotan2'], epitalon: ['epithalon'], kisspeptin: ['kisspeptina'],
  ostarine: ['mk2866','ostarina'], ligandrol: ['lgd','lgd4033'], cardarine: ['gw501516','gw','cardarina'],
  mk677: ['ibutamoren'], rad140: ['testolone','rad'], andarine: ['s4','andarina'], stenabolic: ['sr9009'],
  ii: ['2'], '2': ['ii'], iii: ['3'],
  minoxidil: ['rogaine'], melatonina: ['melatonin'], sibutramina: ['sibutramine']
};
// palavras do pedido que NÃO são nome de produto (saudação, intenção, ligação)
const CI_STOP = ('a o e as os um uma uns umas de da do das dos em no na nos nas pra pro pras pros para por com sem que qual quais ' +
  'oi ola opa ei bom boa dia tarde noite tudo bem blz beleza obrigado obrigada valeu por favor pfv pf ' +
  'eu me meu minha voce voces vc vcs te tem teria teriam tenho ter queria quero gostaria preciso procuro procurando busco ' +
  'comprar compro ver saber olhar conhecer pegar levar pedir encomendar adquirir interesse interessado interessada ' +
  'quanto quanta quantos esta estao ta tao fica ficam sai saem custa custam custo valor valores preco precos tabela ' +
  'disponivel disponiveis disponibilidade estoque trabalha trabalham vende vendem chegou chegaram ainda agora hoje ' +
  'linha linhas marca marcas fabricante laboratorio lab produto produtos item itens opcao opcoes tipo tipos versao ' +
  'ai aqui la esse essa esses essas este esta isso aquele aquela dele dela ' +
  'so somente apenas tambem mais muito pouco algum alguma alguns algumas outro outra outros outras ' +
  'pode podem posso poderia consegue manda mandar passa passar mostra mostrar me informa informar diz dizer fala falar ' +
  'sobre mesmo mesma ne nao sim ok certo entao como onde quando porque').split(/\s+/).reduce(function(o,w){ o[w]=1; return o; }, {});
// palavras de FORMA/APRESENTAÇÃO: sozinhas não identificam produto nenhum
const CI_FRACAS = ('oral injetavel aquoso oleoso caneta total ampola ampolas frasco frascos bujao bujoes unico unica ' +
  'liofilizada liofilizado diluida diluido comprimidos comprimido capsulas capsula tablets tabletes plus forte mix black pen ' +
  'doses dose cliques generico manipulado manipulada caixa refil spray nasal creme gel gotas').split(/\s+/).reduce(function(o,w){ o[w]=1; return o; }, {});

function ciNorm(s){
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ç/g, 'c');
}
// texto → palavras; junta número + unidade ("100 mg" → "100mg", "5000 UI" → "5000ui", "12,5mg" → "12.5mg")
function ciPalavras(s){
  var t = ciNorm(s).replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d+(?:\.\d+)?)\s*(mcg|mg|ml|ui|iu|kg|g|u)\b/g, function(_m, n, u){ return n + (u === 'iu' || u === 'u' ? 'ui' : u); });
  return t.split(/[^a-z0-9.+\-]+/).map(function(w){ return w.replace(/^[.\-+]+|[.\-]+$/g, ''); }).filter(Boolean);
}
function ciColar(w){ return String(w).replace(/[.\-+]/g, ''); }
function ciEhDose(w){ return /^\d+(\.\d+)?(mcg|mg|ml|ui|kg|g)?$/.test(w); }
// 1 letra de diferença (troca, falta ou sobra)
function ciDiff1(a, b){
  if (a === b) return true;
  var la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
  var i = 0, j = 0, d = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  return d + (la - i) + (lb - j) <= 1;
}
// português/inglês e plural: "tirzepatide" ~ "tirzepatida", "seringas" ~ "seringa"
function ciRaiz(w){
  var t = String(w).replace(/ph/g, 'f').replace(/th/g, 't').replace(/y/g, 'i').replace(/([a-z])\1+/g, '$1');
  if (t.length > 5) t = t.replace(/(ina|ine|in)$/, 'in').replace(/(ida|ide|id)$/, 'id').replace(/(ona|one|on)$/, 'on').replace(/(ol|ole)$/, 'ol');
  if (t.length > 4) t = t.replace(/(oes|aes)$/, 'ao').replace(/s$/, '');
  return t;
}

// Um produto do catálogo, pronto para comparar. linha = "Nome|preço" (formato do cache).
function ciProduto(linha, fonte){
  var nome = String(linha).split('|')[0].trim();
  var i = nome.lastIndexOf(' - ');
  if (i > 0 && (nome.slice(i).indexOf(')') >= 0 || nome.slice(i).indexOf('(') >= 0)) i = -1;   // " - " dentro de parênteses não separa marca
  var base = i > 0 ? nome.slice(0, i) : nome, marca = i > 0 ? nome.slice(i + 3) : '';
  var set = {}, raizes = {};
  function add(w){ if (!w) return; set[w] = 1; var c = ciColar(w); if (c) set[c] = 1; if (!ciEhDose(c) && c.length >= 4) raizes[ciRaiz(c)] = 1; }
  var ws = ciPalavras(nome);
  for (var k = 0; k < ws.length; k++) {
    add(ws[k]);
    var partes = ws[k].split(/[.\-+]/).filter(Boolean);
    if (partes.length > 1 && !ciEhDose(ws[k])) partes.forEach(add);            // "bpc-157" → bpc, 157
    var ld = ciColar(ws[k]).match(/^([a-z]{2,})(\d+)$/);                        // "igf1" → igf, 1 · "rad140" → rad, 140
    if (ld) { add(ld[1]); add(ld[2]); }
    if (k + 1 < ws.length) {
      var par = ciColar(ws[k]) + ciColar(ws[k + 1]);
      if (/[a-z]/.test(ws[k]) && /^\d/.test(ws[k + 1]) && !ciEhDose(ws[k + 1]) || ws[k].length <= 3 && /^\d+$/.test(ws[k + 1])) set[par] = 1;   // "mk 677" → mk677
    }
  }
  // sinônimos da substância
  for (var volta = 0; volta < 3; volta++) {      // em cadeia: lipoless → tirzepatida → mounjaro
    var novos = 0;
    Object.keys(set).forEach(function(w){ var s = CI_SINONIMOS[w]; if (s) s.forEach(function(x){ if (!set[x]) { set[x] = 1; novos++; if (x.length >= 4) raizes[ciRaiz(x)] = 1; } }); });
    if (!novos) break;
  }
  // família = o que vem antes da dosagem ("Enantato de testosterona", "Primobolan oral", "GH")
  var fam = [], bw = base.split(/\s+/);
  for (var q = 0; q < bw.length; q++) {
    if (/^\(/.test(bw[q])) break;
    if (q > 0 && /^\d+([.,]\d+)?(mcg|mg|ml|ui|iu|kg|g|u|%)$/i.test(bw[q])) break;
    fam.push(bw[q]);
  }
  return { linha: String(linha), nome: nome, base: base, marca: marca, familia: fam.join(' ').trim() || base, set: set, raizes: raizes, fonte: fonte || '' };
}
// a palavra do cliente existe neste produto?  vocab = todas as palavras do catálogo (para decidir exata × início)
function ciCasa(w, p, vocab){
  var c = ciColar(w);
  if (p.set[w] || p.set[c]) return true;
  if (ciEhDose(c)) return false;                                   // dosagem só exata (100mg ≠ 1000mg)
  if (vocab && (vocab[w] || vocab[c])) return false;               // a palavra existe no catálogo → só vale exata ("deca" não casa "decamix")
  if (c.length >= 4) {
    if (p.raizes[ciRaiz(c)]) return true;
    for (var k in p.set) { if (k.length > c.length && k.indexOf(c) === 0 && !/^\d/.test(k)) return true; }   // início: "primo" → primobolan
  }
  if (c.length >= 6) { for (var k2 in p.set) { if (k2.length >= 5 && !/^\d/.test(k2) && ciDiff1(c, k2)) return true; } }   // 1 letra errada
  return false;
}
// limpa o pedido: tira saudação/intenção e devolve só as palavras que podem ser de produto
function ciPalavrasDoPedido(texto){
  var ws = ciPalavras(String(texto || '').replace(/(\d),(\d)/g, '$1.$2').replace(/[?!¿¡"'“”‘’()\[\]{}<>*_~`|\\\/:;,]+/g, ' '));
  var out = [], visto = {};
  for (var i = 0; i < ws.length; i++) {
    var w = ws[i];
    if (CI_STOP[w] && !/\d/.test(w)) continue;
    if (w.length < 2 && !/\d/.test(w)) continue;
    if (!visto[w]) { visto[w] = 1; out.push(w); }
  }
  return out;
}
function ciVocab(prods){ var v = {}; prods.forEach(function(p){ for (var k in p.set) v[k] = 1; }); return v; }
function ciUnicos(prods){ var v = {}, o = []; prods.forEach(function(p){ if (!v[p.linha]) { v[p.linha] = 1; o.push(p); } }); return o; }

// Lê o cache. Coleção parada há mais de 7 dias fica de fora (dado velho = produto e preço errados).
var _ciMem = { em: 0, prods: null, velhas: [] };
function ciDataMs(v){ if (v == null || v === '') return 0; if (typeof v === 'number') return v; var t = Date.parse(String(v)); return isNaN(t) ? 0 : t; }
async function ciCarregar(lerColecao){
  var agora = Date.now();
  if (_ciMem.prods && agora - _ciMem.em < 60000) return _ciMem.prods;
  var brutos = await Promise.all(CI_COLECOES.map(function(c){ return lerColecao(c).catch(function(){ return null; }); }));
  var prods = [], velhas = [];
  brutos.forEach(function(d, i){
    if (!d) return;
    var dados = (typeof d === 'string') ? d : (d.dados || '');
    var quando = (typeof d === 'string') ? 0 : ciDataMs(d.atualizado_em);
    if (quando && agora - quando > CI_VALIDADE_MS) { velhas.push(CI_COLECOES[i]); return; }
    String(dados).split('\n').forEach(function(l){ l = l.trim(); if (l && l.indexOf('|') > 0) prods.push(ciProduto(l, CI_COLECOES[i])); });
  });
  prods = ciUnicos(prods);
  if (velhas.length) console.log('[CI] colecoes ignoradas (cache parado ha mais de 7 dias):', velhas.join(', '));
  if (prods.length) _ciMem = { em: agora, prods: prods, velhas: velhas };
  return prods;
}

// Procura o pedido no catálogo DISPONÍVEL.
//   exatos   = produtos que têm TODAS as palavras do pedido
//   proximos = quando não há exato: os que têm mais palavras FORTES do pedido (+ quais faltaram)
function ciProcurar(texto, prods){
  var ws = ciPalavrasDoPedido(texto), vocab = ciVocab(prods);
  var fortes = ws.filter(function(w){ return !CI_FRACAS[w] && !ciEhDose(ciColar(w)); });
  var r = { palavras: ws, fortes: fortes, exatos: [], proximos: [], faltou: [], conhecidas: [], todasConhecidas: false };
  if (!ws.length) return r;
  // palavra "conhecida" = existe em pelo menos 1 produto
  r.conhecidas = ws.filter(function(w){ return prods.some(function(p){ return ciCasa(w, p, vocab); }); });
  r.exatos = prods.filter(function(p){ return ws.every(function(w){ return ciCasa(w, p, vocab); }); });
  if (!fortes.length) { if ((ws.length > 1 && r.exatos.length > 12) || ws.every(function(w){ return ciEhDose(ciColar(w)); })) r.exatos = []; return r; }   // só forma/dose: vale a palavra sozinha ("caneta", como sempre foi) ou um conjunto bem específico ("mix 6")
  if (r.exatos.length) { r.todasConhecidas = true; return r; }
  var melhor = 0, cand = [];
  prods.forEach(function(p){
    var okF = fortes.filter(function(w){ return ciCasa(w, p, vocab); }).length;
    if (!okF || okF * 2 < fortes.length) return;   // precisa casar pelo menos METADE das palavras fortes (senão é frase, não pedido)
    var ok = ws.filter(function(w){ return ciCasa(w, p, vocab); }).length;
    var nota = okF * 10 + ok;
    if (nota > melhor) { melhor = nota; cand = [p]; } else if (nota === melhor) cand.push(p);
  });
  r.proximos = cand;
  if (cand.length) r.faltou = ws.filter(function(w){ return !ciCasa(w, cand[0], vocab); });
  // "mais próximo" só é resposta quando cada palavra forte EXISTE no catálogo (só não existem juntas: "primobolan landerlan
  // diamond", "deca 500mg"). Palavra desconhecida no meio ("posso misturar na seringa", "gold standard") = frase, não pedido.
  r.todasConhecidas = fortes.every(function(w){ return r.conhecidas.indexOf(w) >= 0; });
  return r;
}
// produtos que têm QUALQUER um dos termos (cada termo = palavras que têm que estar todas)
function ciPorTermos(prods, termos, excluir){
  var vocab = ciVocab(prods);
  var ts = (termos || []).map(function(t){ return ciPalavras(t); }).filter(function(a){ return a.length; });
  var ex = (excluir || []).map(function(t){ return ciPalavras(t); }).filter(function(a){ return a.length; });
  return prods.filter(function(p){
    if (!ts.some(function(a){ return a.every(function(w){ return ciCasa(w, p, vocab); }); })) return false;
    return !ex.some(function(a){ return a.every(function(w){ return p.set[w] || p.set[ciColar(w)]; }); });
  });
}
function ciLinhas(prods){ return prods.map(function(p){ return p.linha; }); }
function ciFamilias(prods){ var v = {}, o = []; prods.forEach(function(p){ var k = ciNorm(p.familia); if (!v[k]) { v[k] = 1; o.push(p.familia); } }); return o; }
function ciPrecoBR(v){
  var n = Number(String(v).replace(',', '.')); if (isNaN(n)) return String(v || '');
  var s = n.toFixed(2).split('.'); return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + s[1];
}
// Pergunta à LOJA (busca pública do site) pelos produtos com TODAS as palavras do pedido.
// Devolve { ok, esgotados:[{nome,preco}], disponiveis:[linha "nome|preço"] }. Falhou/demorou → ok:false (segue sem).
async function ciLoja(texto, prods){
  var out = { ok: false, esgotados: [], disponiveis: [] };
  var ws = ciPalavrasDoPedido(texto);
  if (!ws.length || !ws.some(function(w){ return !CI_FRACAS[w] && !ciEhDose(ciColar(w)); })) return out;
  var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function(){ try { ctrl.abort(); } catch (e) {} }, CI_LOJA_TIMEOUT_MS) : null;
  try {
    var url = CI_LOJA_SUGGEST + '?q=' + encodeURIComponent(ws.join(' ')) + '&resources[type]=product&resources[limit]=10' +
      '&resources[options][unavailable_products]=show&resources[options][fields]=title';
    var r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctrl ? ctrl.signal : undefined });
    if (!r || !r.ok) return out;
    var j = await r.json();
    var ps = (j && j.resources && j.resources.results && j.resources.results.products) || [];
    var vocab = ciVocab(prods || []);
    ps.forEach(function(x){
      var titulo = String(x.title || '').trim(); if (!titulo) return;
      var p = ciProduto(titulo + '|' + ciPrecoBR(x.price), 'loja');
      Object.keys(p.set).forEach(function(k){ vocab[k] = 1; });
    });
    ps.forEach(function(x){
      var titulo = String(x.title || '').trim(); if (!titulo) return;
      var p = ciProduto(titulo + '|' + ciPrecoBR(x.price), 'loja');
      if (!ws.every(function(w){ return ciCasa(w, p, vocab); })) return;      // a busca do site traz ruído: só vale quem tem TODAS as palavras
      if (x.available === false) out.esgotados.push({ nome: titulo, preco: ciPrecoBR(x.price) });
      else out.disponiveis.push(p.linha);
    });
    out.ok = true;
    return out;
  } catch (e) { return out; }
  finally { if (timer) clearTimeout(timer); }
}
function ciFraseEsgotado(esg){
  var nomes = esg.slice(0, 4).map(function(e){ return '*' + e.nome + '*'; });
  if (nomes.length === 1) return '😕 ' + nomes[0] + ' está *esgotado no momento*.';
  return '😕 ' + nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1] + ' estão *esgotados no momento*.';
}
// ═════════════════════════════════════ fim do bloco "ci" ═══════════════════════════════════════

// ── ligação do bloco "ci" com este arquivo ──
async function ciCatalogo() { try { return await ciCarregar(buscarCacheObj); } catch (e) { return []; } }
// Pergunta de PREÇO / ESTOQUE / "quero" (abre a lista) × dúvida de USO (vai para a IA).
function ehPerguntaDePreco(nMsg) {
  const t = ' ' + String(nMsg || '').replace(/[?!.,]+/g, ' ') + ' ';
  if (/ como |como us|como tom|como aplic|protocolo|pra que serve|para que serve|dosagem| dose |colateral|faz mal| ciclo| tpc |diferenc|melhor|recomend| indica|monta|explica|pode tomar|pode usar|quantas vezes|quanto tempo|serve p|funciona| o que e | o que eh |efeito/.test(t)) return false;
  return /(quanto|valor|preco|custa|custo| tem | teria| vende| trabalha|disponi|estoque|chegou|quero|queria|gostaria|comprar|procur| busco)/.test(t);
}
// Título da lista aberta pelo catálogo: "PRIMOBOLAN ORAL" (família, quando é uma só) ou as palavras do pedido.
function ciTitulo(achado, prods) {
  const fams = ciFamilias(prods);
  let base = (fams.length === 1) ? fams[0] : achado.palavras.join(' ');
  const marcas = {}; prods.forEach(p => { marcas[p.marca] = 1; });
  const ms = Object.keys(marcas);
  if (fams.length === 1 && ms.length === 1 && ms[0] && prods.length > 1) base += ' — ' + ms[0];
  return String(base).toUpperCase();
}
// O que o catálogo e a loja acharam para esta mensagem — vai no contexto da IA, pra ela não negar o que existe nem prometer conferir.
function ciContextoIA(achado, loja) {
  const partes = [];
  if (achado && achado.exatos && achado.exatos.length) {
    partes.push('CATÁLOGO — produtos DISPONÍVEIS hoje que batem com a mensagem do cliente (preço real): ' +
      achado.exatos.slice(0, 15).map(p => p.nome + ' — R$ ' + (p.linha.split('|')[1] || '')).join('; ') +
      (achado.exatos.length > 15 ? '; … (+' + (achado.exatos.length - 15) + ')' : '') + '.');
  }
  if (achado && !achado.exatos.length && achado.proximos && achado.proximos.length && achado.proximos.length <= 15) {
    partes.push('CATÁLOGO — não há produto DISPONÍVEL com todas as palavras da mensagem; os mais próximos disponíveis hoje: ' +
      achado.proximos.map(p => p.nome + ' — R$ ' + (p.linha.split('|')[1] || '')).join('; ') + '.');
  }
  if (loja && loja.esgotados && loja.esgotados.length) {
    partes.push('LOJA — ESGOTADO hoje: ' + loja.esgotados.map(e => e.nome).join('; ') + '. Se o cliente perguntar por ele, diga que está ESGOTADO NO MOMENTO (NÃO diga que não trabalhamos nem que não consta) e NÃO prometa conferir depois.');
  } else if (loja && loja.ok && achado && achado.fortes.length && !achado.exatos.length && !achado.conhecidas.length) {
    partes.push('A busca no catálogo e na loja NÃO achou nenhum produto com "' + achado.palavras.join(' ') + '" (nem esgotado). Não invente e NÃO prometa "vou conferir": diga que não encontrou esse nome e peça o nome do produto ou ofereça o *menu*.');
  }
  return partes.join('\n');
}
// Numa DÚVIDA o nome do produto vem no meio da frase ("o dhb faz mal pro fígado"): separa as palavras que SÃO do catálogo
// (para a IA receber os produtos e preços reais) e procura as desconhecidas na loja (para ela saber o que está esgotado).
async function ciParaDuvida(achado, prods) {
  const out = { achado: achado, loja: null };
  if (!achado || !achado.fortes.length || achado.exatos.length) return out;
  const conhecidas = achado.fortes.filter(w => achado.conhecidas.indexOf(w) >= 0);
  if (conhecidas.length) {
    const so = ciProcurar(conhecidas.join(' '), prods);
    if (so.exatos.length) { out.achado = so; return out; }
  }
  const novas = achado.fortes.filter(w => achado.conhecidas.indexOf(w) < 0 && w.length >= 3 && !/^\d/.test(w)).slice(0, 4);
  if (!novas.length) return out;
  try {
    const rs = await Promise.all(novas.map(w => ciLoja(w, prods).catch(() => null)));
    const lj = { ok: false, esgotados: [], disponiveis: [] }, visto = {};
    rs.forEach(r => { if (!r) return; if (r.ok) lj.ok = true; r.esgotados.forEach(e => { if (!visto[e.nome]) { visto[e.nome] = 1; lj.esgotados.push(e); } }); });
    lj.esgotados = lj.esgotados.slice(0, 8);
    out.loja = lj.esgotados.length ? lj : null;   // sem achado: não afirma "não existe" numa frase de dúvida
  } catch (e) {}
  return out;
}
function ciJuntaContexto(a, b) { return [a, b].filter(Boolean).join('\n'); }
// Abre uma lista (linhas "nome|preço") no formato de sempre.
async function ciAbrirLista(session, sid, linhas, titulo, respond, antes) {
  const unicas = [...new Set(linhas)];
  await limparHistoricoIA(sid);
  await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(unicas), errosSeguidos:0, pendenteRec:null });
  return respond(`${antes ? antes + '\n\n' : ''}*${titulo}*\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
}
// Produtos de uma entrada do DICT_PRODUTOS: a busca de sempre (filtro + nomes formais) MAIS os sinônimos/apelidos como palavra
// inteira do catálogo — é o que faz "Nandrolona (Deca)" achar os produtos "Deca 200mg…".
function ciProdutosDaEntrada(e, prods, dadosTexto) {
  const vistos = {}; const out = [];
  const termos = termosCategoria(e);
  if (termos.length && dadosTexto) {
    const linhas = {}; filtrarCache(dadosTexto, termos).forEach(l => { linhas[l] = 1; });
    prods.forEach(p => { if (linhas[p.linha] && !vistos[p.linha]) { vistos[p.linha] = 1; out.push(p); } });
  }
  const palavras = [].concat(e.filtro || [], e.canonico || [], e.apelidos || []).filter(t => t && norm(t).length >= 3);
  ciPorTermos(prods, palavras, []).forEach(p => { if (!vistos[p.linha]) { vistos[p.linha] = 1; out.push(p); } });
  if (e.excluir && e.excluir.length) {
    const ok = {}; aplicarExclusao(out.map(p => p.linha), e.excluir).forEach(l => { ok[l] = 1; });
    return out.filter(p => ok[p.linha]);
  }
  return out;
}

function reconhecerProduto(nMsg) {
  if (!nMsg) return null;
  for (const e of DICT_PRODUTOS) {
    if ((e.canonico || []).some(t => termoBate(t, nMsg))) return { entry: e, modo: 'canonico' };
  }
  for (const e of DICT_PRODUTOS) {
    if ((e.apelidos || []).some(t => termoBate(t, nMsg))) return { entry: e, modo: 'apelido' };
  }
  return null;
}

// ── STACK/CICLO: cliente pediu MAIS DE UM produto junto ("testo e deca", "bpc + tb500") ──
// O sistema só abre 1 produto por vez; então nesse caso a IA conduz (um de cada vez).
function contemConectorStack(nMsg) {
  return / e | mais | com |\+|&|,/.test(' ' + nMsg + ' ');
}
function reconhecerVarios(nMsg) {
  if (!nMsg) return [];
  const achados = [];
  const vistos = {};
  for (const e of DICT_PRODUTOS) {
    const bate = (e.canonico || []).some(t => termoBate(t, nMsg)) || (e.apelidos || []).some(t => termoBate(t, nMsg));
    if (bate && !vistos[e.label]) { vistos[e.label] = 1; achados.push(e); }
  }
  return achados;
}
function ehPedidoStack(nMsg) {
  return contemConectorStack(nMsg) && reconhecerVarios(nMsg).length >= 2;
}

// ── "O MAIS BARATO / MAIS EM CONTA" (ou o mais caro/premium) da lista atual ────
// Detecta pedido de superlativo. Retorna 'valor' (melhor custo-benefício = menor R$/mg),
// 'barato' (menor preço absoluto), 'caro' (premium) ou null.
function ehPedidoSuperlativo(nMsg) {
  const t = ' ' + (nMsg || '') + ' ';
  // MELHOR CUSTO-BENEFÍCIO / melhor valor / mais mg pelo preço → 'valor' (menor preço POR MG)
  if (/custo benef|custo-benef|custobenef|melhor custo|melhor valor|melhor relacao|relacao custo|beneficio|vale (mais )?a pena|mais mg|que rende mais|render mais|mais produto/.test(t)) return 'valor';
  // barato / mais em conta / menor preço / melhor preço / econômico / acessível → 'barato' (preço absoluto)
  if (/barat|em conta|menor preco|menor valor|preco baixo|melhor preco|economic|acessivel/.test(t)) return 'barato';
  // premium / mais caro / top de linha / melhor qualidade / melhor marca
  if (/mais caro|top de linha|premium|melhor qualidade|melhor marca|mais top/.test(t)) return 'caro';
  return null;
}
// Extrai a dosagem (mg) do nome do produto, normalizando mcg->mg. Pega o MAIOR valor achado.
// Ex.: "Retatrutida 120mg Veltrane" -> 120; "GH 100ui" -> 100; "MOTS-C 500mcg" -> 0.5.
function _mgDoNome(nome) {
  const s = String(nome || '').toLowerCase();
  let mg = 0;
  const re = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|ui|iu)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    let val = parseFloat(m[1].replace(',', '.'));
    if (m[2] === 'mcg') val = val / 1000; // mcg -> mg
    if (!isNaN(val) && val > mg) mg = val;
  }
  return mg;
}
// Escolhe da lista: 'caro' = maior preço; 'barato' = menor preço; 'valor' = menor preço POR MG
// (melhor custo-benefício — mais produto pelo dinheiro). 'valor' cai pro mais barato se nenhum
// item tiver mg detectável. Ignora itens sem preço.
function escolherPorPreco(lista, modo) {
  const validos = (lista || []).filter(p => p && Number(p.preco) > 0);
  if (!validos.length) return null;
  if (modo === 'valor') {
    const comMg = validos.map(p => ({ p: p, mg: _mgDoNome(p.nome) })).filter(x => x.mg > 0);
    if (comMg.length) {
      return comMg.reduce((best, x) => (x.p.preco / x.mg) < (best.p.preco / best.mg) ? x : best).p;
    }
    return validos.reduce((best, p) => p.preco < best.preco ? p : best);
  }
  return validos.reduce((best, p) =>
    (modo === 'caro' ? (p.preco > best.preco) : (p.preco < best.preco)) ? p : best
  );
}

// ── MARCA na frase ("tem masteron da ZPHC") → filtra a lista da substância pela marca ──
// Cada entrada: [rótulo p/ filtrar no nome do produto, sinônimos que o cliente pode digitar].
const MARCAS = [
  ['zphc', ['zphc']], ['veltrane', ['veltrane']], ['landerlan', ['landerlan']],
  ['muscle', ['muscle labs','muscle lab','muscle']], ['alpha pharma', ['alpha pharma','alpha']],
  ['health peptides', ['health peptides']], ['alluvi', ['alluvi']], ['lipoless', ['lipoless']],
  ['cooper', ['cooper pharma','cooper']], ['neuroceptix', ['neuroceptix','neurocepitix','neurocept']],
  ['king pharma', ['king pharma','king']], ['synedica', ['synedica','sinedica']],
  ['neopeptides', ['neopeptides','neo peptides']], ['eurogold', ['eurogold']],
  ['novax', ['novax']], ['bratva', ['bratva']], ['oxygen', ['oxygenkw','oxygen kw','oxygen']],
  ['purity', ['purity peptides','purity']], ['renew', ['renew peptides','renew']],
  ['anglo', ['anglo peptides','anglo']], ['bionexis', ['bionexis']], ['royal', ['royal pharmaceuticals','royal']],
  ['dragon elite', ['dragon elite','dragon']], ['pharmacom', ['pharmacom']],
  ['thera', ['thera genetics','thera']], ['balkan', ['balkan']], ['eminence', ['eminence labs','eminence']],
  ['gen-tirz', ['gen-tirz','gen tirz']], ['bombadrol', ['bombadrol']]
];
// Retorna o RÓTULO da marca (pra filtrar no nome do produto) se o cliente citou alguma.
function detectarMarca(nMsg) {
  const t = ' ' + (nMsg || '') + ' ';
  for (const [rotulo, sinonimos] of MARCAS) {
    for (const s of sinonimos) {
      if (t.indexOf(' ' + s + ' ') >= 0 || t.indexOf(' ' + s + 's ') >= 0 || (s.length >= 5 && t.indexOf(s) >= 0)) return rotulo;
    }
  }
  return null;
}

// ── DÚVIDA/PERGUNTA: "como uso o klow?", "qual o protocolo da retatrutida?", "monta o protocolo" ──
// Mesmo citando um produto, é PERGUNTA (vai pra IA responder), NÃO pedido pra abrir a lista.
// Foco em uso/protocolo/dose/recomendação — não pega intenção de preço/compra ("quanto custa", "quero X").
function ehDuvida(nMsg) {
  const s = nMsg || '';
  if (/\?\s*$/.test(s)) return true; // termina com "?"
  const t = ' ' + s + ' ';
  const gatilhos = [
    ' como ','como uso','como usar','como toma','como aplica','protocolo','pra que serve','para que serve',
    ' o que ','dosagem',' dose ','efeito colateral','colateral','faz mal',' ciclo',' tpc ','diferenca','diferença',
    'qual a melhor','qual o melhor','melhor pra','melhor para','recomenda','me indica','indica','monta','montar',
    'explica','explicar','pode tomar','pode usar','quantas vezes','quanto tempo','serve pra','serve para','funciona'
  ];
  return gatilhos.some(x => t.includes(x));
}

// Pedido EXPLÍCITO do cupom de boas-vindas da Stella. Proposital não casar com "cupom"
// solto: no fechamento, "tem cupom?" é conversa de checkout, não pedido de cupom novo.
function ehPedidoCupomBemVindo(nMsg){
  const t = ' ' + (nMsg || '') + ' ';
  return /(cupom de boas|cupom boas|cupom de bem|cupom de 7|meu cupom|quero o cupom|quero um cupom|pega[r]? o cupom|pega[r]? meu cupom|libera[r]? o cupom|libera[r]? meu cupom|gera[r]? o cupom|gera[r]? meu cupom|cupom de desconto de boas)/.test(t);
}

/* ===== IDENTIFICAÇÃO DO CLIENTE — número do pedido e CPF escritos de qualquer jeito (30/09/2026) =====
   MESMO BLOCO em 3 lugares: logistica-bot.js · botconversa.js (Athena) · página rastrear-pedido.
   Mudou aqui → mudar nos 3. ES5 de propósito (a página roda em celular antigo: sem lookbehind, sem const).
   NÚMERO DO PEDIDO (formato real VF-DDMM-L000; contingência VF-DDMM-LX<HHmm>):
     - minúscula, com/sem "VF", espaço/ponto/barra/traço ou tudo junto: "vf 2909 s012", "VF2909S012",
       "2909-S012", "29/09 S012"; final sem zero ("S12" → S012); letra O no lugar de zero grudada em número
     - letras S M A V W (+X da contingência); dia 01-31 e mês 01-12 — senão não é pedido
     - sem "VF", a letra tem que vir GRUDADA no número ("29/09 S012" sim; "29/09 a 12h" não)
   INCOMPLETO (o sistema explica o que falta — NUNCA chuta letra/data: o número chutado pode ser de outro cliente):
     - sem_letra: "VF-2909-012" · final: só "S012" (falta dia/mês) · cpf_errado: 11 dígitos que não fecham
   CPF: com/sem ponto/traço/espaço; 10 dígitos = perdeu o zero da frente (o índice do GAS guarda com 11) */
var ID_SEP = '[\\s\\-_.\\/]*';
var ID_RE_VF = new RegExp('V\\s*F' + ID_SEP + '(\\d{2})' + ID_SEP + '(\\d{2})' + ID_SEP + '([A-Z]{1,2})' + ID_SEP + '(\\d{1,4})(?![0-9])');
var ID_RE_SEM_VF = /(?:^|[^A-Z0-9])(\d{2})[\/\-.]?(\d{2})[\s\-_.\/]*([SMAVW]X?)[\-_.]?(\d{1,4})(?![A-Z0-9])/;
var ID_RE_SEM_LETRA = new RegExp('V\\s*F' + ID_SEP + '(\\d{2})' + ID_SEP + '(\\d{2})' + ID_SEP + '(\\d{2,4})(?![0-9])');
var ID_RE_FINAL = /(?:^|[^A-Z0-9])([SMAVW]X?)[\-_.]?(\d{2,4})(?![A-Z0-9])/;
var ID_LETRAS = /^[SMAVW]X?$/;
var ID_MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

function idSoDig(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
function idDataOk(dd, mm) { var d = Number(dd), m = Number(mm); return d >= 1 && d <= 31 && m >= 1 && m <= 12; }
/* final do número: normal = 3 dígitos (S12 → S012); contingência (letra + X) = hora e minuto, 4 dígitos */
function idSeq(letra, dig) {
  var s;
  if (/X$/.test(letra)) { s = String(dig); while (s.length < 4) s = '0' + s; return s; }
  s = String(Number(dig)); while (s.length < 3) s = '0' + s; return s;
}
/* maiúscula + letra O no lugar de zero quando grudada em número. NÃO usar pra e-mail. */
function idPrepNum(texto) {
  var t = String(texto || '').toUpperCase();
  for (var i = 0; i < 3; i++) t = t.replace(/(\d)O/g, '$10').replace(/O(\d)/g, '0$1');
  // v85: letra trocada no prefixo ("VT-1709-S008", "VG-…") — só quando o resto é exatamente o formato do pedido.
  t = t.replace(/(^|[^A-Z0-9])V[A-EG-Z]\s*[-–]\s*(\d{4})\s*[-–]\s*([SMAVW]X?\d{1,4})(?![A-Z0-9])/g, '$1VF-$2-$3');
  return t;
}
/* número do pedido normalizado ou '' */
function idPedido(texto) {
  var t = idPrepNum(texto), m = t.match(ID_RE_VF);
  if (m && idDataOk(m[1], m[2]) && ID_LETRAS.test(m[3])) return 'VF-' + m[1] + m[2] + '-' + m[3] + idSeq(m[3], m[4]);
  m = t.match(ID_RE_SEM_VF);
  if (m && idDataOk(m[1], m[2])) return 'VF-' + m[1] + m[2] + '-' + m[3] + idSeq(m[3], m[4]);
  return '';
}
function idEmail(texto) {
  var m = String(texto || '').match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : '';
}
function idCpfValido(c) {
  c = idSoDig(c);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  var s = 0, i, r;
  for (i = 0; i < 9; i++) s += Number(c.charAt(i)) * (10 - i);
  r = (s * 10) % 11; if (r === 10) r = 0;
  if (r !== Number(c.charAt(9))) return false;
  s = 0;
  for (i = 0; i < 10; i++) s += Number(c.charAt(i)) * (11 - i);
  r = (s * 10) % 11; if (r === 10) r = 0;
  return r === Number(c.charAt(10));
}
/* { cpf: '11 dígitos válidos' } · { errado: 'dígitos de um CPF que não confere' } · {} */
function idCpf(texto) {
  var t = String(texto || ''), cand = [], i, d, toks = t.split(/\s+/), runs = t.match(/\d(?:[\s.\-\/]{0,2}\d){8,12}/g) || [];
  for (i = 0; i < toks.length; i++) cand.push(idSoDig(toks[i]));
  for (i = 0; i < runs.length; i++) cand.push(idSoDig(runs[i]));
  var errado = '';
  for (i = 0; i < cand.length; i++) {
    d = cand[i];
    if (d.length === 11 && idCpfValido(d)) return { cpf: d };
    if (d.length === 10 && idCpfValido('0' + d)) return { cpf: '0' + d };
    if (!errado && (d.length === 11 || d.length === 10)) errado = d;
  }
  return errado ? { errado: errado } : {};
}
function idCpfFmt(d) {
  d = idSoDig(d);
  return d.length === 11 ? d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9) : d;
}
/* parece pedido/CPF mas falta ou sobra algo: { tipo:'sem_letra'|'cpf_errado'|'final', valor } ou null */
function idIncompleto(texto) {
  var t = idPrepNum(texto), m = t.match(ID_RE_SEM_LETRA);
  if (m && idDataOk(m[1], m[2])) return { tipo: 'sem_letra', valor: 'VF-' + m[1] + m[2] + '-' + m[3] };
  var c = idCpf(texto);
  if (c.errado) return { tipo: 'cpf_errado', valor: c.errado };
  m = t.match(ID_RE_FINAL);
  if (m) return { tipo: 'final', valor: m[1] + idSeq(m[1], m[2]) };
  return null;
}
/* { tipo:'pedido'|'email'|'cpf'|'sem_letra'|'cpf_errado'|'final'|'', valor } */
function idAnalisar(texto) {
  var p = idPedido(texto); if (p) return { tipo: 'pedido', valor: p };
  var e = idEmail(texto); if (e) return { tipo: 'email', valor: e };
  var c = idCpf(texto); if (c.cpf) return { tipo: 'cpf', valor: c.cpf };
  return idIncompleto(texto) || { tipo: '', valor: '' };
}
/* dia e mês da compra ("29/09", "29-9", "29 de setembro") → 'DDMM' ou '' */
function idDiaMes(texto) {
  var t = String(texto || '').toLowerCase(), m = t.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})(?![0-9])/);
  if (m && idDataOk(m[1], m[2])) return ('0' + Number(m[1])).slice(-2) + ('0' + Number(m[2])).slice(-2);
  m = t.match(/(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/);
  if (m && idDataOk(m[1], ID_MESES[m[2]])) return ('0' + Number(m[1])).slice(-2) + ('0' + ID_MESES[m[2]]).slice(-2);
  return '';
}
/* ===== fim do bloco de identificação ===== */

// ── Detecção de intenção de RASTREIO (CPF, nº de pedido, e-mail, palavra) ──────
// v81: usa o bloco de identificação acima. Número de pedido VitaFlow: VF-DDMM-XNNN (ex.: VF-0806-A003).
// Palavras que podem vir junto do número/CPF sem tirar o "a mensagem é o dado" (ver _restoDaMensagem).
const _ID_PALAVRAS_OK = ['meu','minha','o','a','e','é','cpf','pedido','numero','número','nº','n','do','da','de','aqui','segue','esta','está','ta','tá','ai','aí','vf'];
function _restoDaMensagem(msg, tirar) {
  let t = String(msg || '');
  if (tirar) t = t.split(tirar).join(' ');
  return t.toLowerCase().split(/[^a-zà-úç]+/).filter(w => w && _ID_PALAVRAS_OK.indexOf(w) < 0).join('');
}
// Pedido "forte": com VF sempre; sem VF ("2909-S012") só quando a mensagem é basicamente o número —
// pra conversa comum de produto nunca virar rastreio por acaso.
function idPedidoForte(msg) {
  const p = idPedido(msg);
  if (!p) return '';
  if (/V\s*F/i.test(idPrepNum(msg))) return p;   // v85: idPrepNum já conserta "VT-" → "VF-"
  return _restoDaMensagem(idPrepNum(msg).replace(/[\d\/\-._]+/g, ' ')).length <= 12 ? p : '';
}
function ehNumeroPedido(msg) {
  if (idPedidoForte(msg)) return true;
  const inc = idIncompleto(msg);
  return !!(inc && inc.tipo === 'sem_letra');          // "VF-2909-012": é pedido, só falta a letra
}
// CPF "solto": a mensagem é basicamente o CPF (não um endereço/cadastro com vários números).
// v81: aceita com/sem ponto/traço/espaço, sem o zero da frente e CPF que NÃO confere (pra avisar o cliente).
function ehCPFsolto(msg) {
  const c = idCpf(msg);
  if (!c.cpf && !c.errado) return false;
  return _restoDaMensagem(msg).length <= 4;
}
// v81: mensagem pronta quando o dado veio QUASE certo (falta a letra / falta dia e mês / CPF não confere). null = nada a dizer.
function respostaIdIncompleto(msg, aceitaFinal) {
  if (idPedido(msg) || idEmail(msg) || idCpf(msg).cpf) return null;
  const inc = idIncompleto(msg);
  if (!inc) return null;
  if (inc.tipo === 'sem_letra') return `🔎 O número *${inc.valor}* está incompleto: falta a *letra* antes dos últimos números (ex.: VF-2909-*S*012).\n\nConfere no e-mail ou no recibo da compra e me manda de novo — ou me manda o *CPF* ou o *e-mail* da compra. 😊`;
  if (inc.tipo === 'cpf_errado') return `🔎 O CPF *${idCpfFmt(inc.valor)}* não confere — parece ter algum número trocado ou faltando.\n\nConfere os 11 números e me manda de novo. Se preferir, me manda o *número do pedido* (ex.: VF-2909-S012) ou o *e-mail* da compra. 😊`;
  if (inc.tipo === 'final' && aceitaFinal) return `📅 Achei o final do número do pedido (*${inc.valor}*), mas falta o *dia e o mês* da compra — eles fazem parte do número (ex.: VF-*2909*-S012 é uma compra de 29/09).\n\nMe manda assim: *29/09 ${inc.valor}* (dia/mês da compra + o final). Se preferir, me manda o *CPF* ou o *e-mail* da compra. 😊`;
  return null;
}
// Detecta quando o cliente colou o CÓDIGO DA TRANSPORTADORA (Correios/Loggi/Jadlog/J&T)
// em vez do número do pedido VitaFlow. Aí a gente avisa pra ele usar o dado certo.
function ehCodigoTransportadora(msg) {
  const t = (msg || '').toUpperCase().replace(/\s/g,'');
  if (!t) return false;
  if (ehNumeroPedido(msg)) return false;                 // VF-... é pedido, não código
  if (ehCPFsolto(msg)) return false;                     // CPF não é código
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(t)) return true;    // Correios: AC817953643BR
  if (/^[A-Z0-9]{10,}BR$/.test(t) && /[A-Z]/.test(t) && /\d/.test(t)) return true; // Loggi e afins terminando em BR
  if (/^\d{12,15}$/.test(t)) return true;                // Jadlog/J&T: só números, 12–15 dígitos
  return false;
}
function ehIntencaoRastreio(nMsg, msgOriginal) {
  const palavras = ['rastrear','rastreamento','rastreio','cade meu pedido','cadê meu pedido','meu pedido','onde esta meu pedido','onde está meu pedido','status do pedido','status do meu pedido','acompanhar pedido','codigo de rastreio',
    'atrasou','atrasado','atraso','demorou','demorando','ta demorando','esta demorando','nao chegou','ainda nao chegou','nao recebi','cade meu produto','onde esta minha encomenda'];
  if (palavras.some(p => nMsg.includes(norm(p)))) return true;
  if (/(^|[^a-z])(meus pedidos|minhas compras|historico de (pedidos|compras))([^a-z]|$)/.test(nMsg)) return true;   // v85
  if (ehNumeroPedido(msgOriginal)) return true;
  if (ehCPFsolto(msgOriginal)) return true;
  if (ehEmailSolto(msgOriginal)) return true;   // v85
  return false;
}

// Tira de uma frase SÓ o dado que o GAS entende: nº do pedido VF, CPF (11 dígitos) ou e-mail.
// "VF-1409-S011 sobre esse pedido?" -> "VF-1409-S011". Sem nada disso, devolve a frase inteira.
function extrairTermoRastreio(msg) {
  const raw = String(msg || '');
  const p = idPedido(raw);                 // v81: já normalizado (VF-DDMM-L000)
  if (p) return p;
  const em = idEmail(raw);
  if (em) return em;
  const c = idCpf(raw);                    // v81: com/sem ponto, sem o zero da frente
  if (c.cpf) return c.cpf;
  return raw.trim();
}
// Executa o rastreio direto (mesma lógica do estado RASTREAR), a partir de qualquer estado.
async function fazerRastreio(termo, respond, msgOriginal) {
  const _inc = respostaIdIncompleto(termo, true);   // v81: falta a letra / dia e mês / CPF não confere
  if (_inc) return respond(_inc + `\n\n_Ou digite *menu* para voltar._`);
  let pedidos = await consultarStatusGAS((termo || '').trim());
  // v85: veio mais de um dado na mensagem (pedido + CPF + e-mail) e o 1º não achou → tenta os outros.
  if (!pedidos.length && msgOriginal) {
    const _outros = termosRastreio(msgOriginal).filter(x => x !== (termo || '').trim());
    for (let _i = 0; _i < _outros.length && !pedidos.length; _i++) pedidos = await consultarStatusGAS(_outros[_i]);
  }
  if (!pedidos.length) {
    // Cliente colou o código da TRANSPORTADORA em vez do número do pedido VitaFlow → orienta.
    if (ehCodigoTransportadora(termo)) {
      return respond(`📦 Isso aí parece o *código da transportadora* — por ele eu não consigo consultar aqui. 😊\n\nPra eu achar seu pedido, me manda um destes:\n• o *número do pedido VitaFlow* (começa com *VF-*)\n• seu *CPF*\n• ou o *e-mail* da compra\n\n_Com o código da transportadora você rastreia direto no site dela. Ou fale com a logística: 👉 wa.me/447537155718_`);
    }
    return respond(`🔍 Não encontrei nenhum pedido com *esse dado*.\n\nConfere o *número do pedido*, *CPF* ou *e-mail* da compra e me manda de novo. 😊\n\n📞 Se preferir, fale com a logística: 👉 wa.me/447537155718\n_Ou digite *menu* para voltar._`);
  }
  if (pedidos.length === 1) {
    return respond(statusBloco(pedidos[0]) + RASTREIO_RODAPE);
  }
  const blocos = pedidos.map(p => statusBloco(p)).join('\n\n\n');
  return respond(`Encontrei *${pedidos.length} pedidos* no seu cadastro:\n\n${blocos}` + RASTREIO_RODAPE);
}

function filtrarEster(dados, ester, base) {
  const ne = norm(ester);
  const baseMap = {
    testosterona: ['testosterona','testo','dura','durateston','sustanon','sust'],
    trembolona:   ['trembolona','tren','trembo','parabolan'],
    masteron:     ['masteron','drostanolona'],
    nandrolona:   ['nandrolona','deca','npp','durabolin'],
  };
  let lines = dados.split('\n').filter(Boolean).filter(l => norm(l).includes(ne));
  if (base === 'outras') return [...new Set(lines)];
  const keys = baseMap[base] || [base];
  const outras = Object.entries(baseMap).filter(([k]) => k !== base).flatMap(([,v]) => v);
  let res = lines.filter(l => { const nl = norm(l); return keys.some(k => nl.includes(k)); });
  if (base === 'testosterona') {
    const puros = lines.filter(l => {
      const nl = norm(l);
      return !outras.some(o => nl.includes(o)) && !keys.some(k => nl.includes(k));
    });
    res = [...new Set(res.concat(puros))];
  }
  return [...new Set(res)];
}

async function resolverReconhecido(session, sid, e, respond, marca, q) {
  e = e || {};
  // Cliente trocou de produto (digitou o nome) → zera a memória da IA pra não vazar o
  // assunto anterior. Continuidade dentro do novo produto é reconstruída nas próximas trocas.
  await limparHistoricoIA(sid);
  if (e.tipo === 'submenu_testo') {
    await saveSession(sid, { ...session, state:'SUBMENU_TESTO', errosSeguidos:0, pendenteRec:null });
    return respond(MENU_TESTO);
  }
  if (e.tipo === 'ester') {
    await saveSession(sid, { ...session, state:'ESTER_BASE', pendenteEster: e.ester, errosSeguidos:0, pendenteRec:null });
    return respond(`*${(e.ester||'').toUpperCase()} de quê?* 💉\n\nEsse éster existe em várias bases. Qual você procura?\n\n${MENU_BASE_ESTER}`);
  }
  if (e.tipo === 'saxenda') {
    const dados = await buscarCache('emagrecedores');
    const unicas = [...new Set(filtrarCache(dados, ['semaglutida','tirzepatida','retatrutida']))];
    if (!unicas.length) {
      await saveSession(sid, { ...session, state:'MENU', errosSeguidos:0, pendenteRec:null });
      return respond('No momento não trabalhamos com *Saxenda*, mas temos ótimas alternativas para emagrecimento! 😊\n\nDigite *menu* e escolha *Emagrecedores* (opção 2).');
    }
    await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(unicas), errosSeguidos:0, pendenteRec:null });
    return respond(`Não trabalhamos com *Saxenda*, mas tenho opções ainda mais procuradas para emagrecimento! 🔥\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
  }
  // v90: lista aberta pelo CATÁLOGO INTELIGENTE (veio de "Quer ver X? Seu carrinho fica salvo")
  if (e.tipo === 'busca_ci') {
    const _pr = await ciCatalogo();
    const _ac = ciProcurar(e.q || e.label || '', _pr);
    if (_ac.exatos.length) return await ciAbrirLista(session, sid, ciLinhas(_ac.exatos), ciTitulo(_ac, _ac.exatos), respond);
    await saveSession(sid, { ...session, state:'MENU', errosSeguidos:0, pendenteRec:null });
    return respond(`*${e.label}* não está disponível no momento. 😕\n\nDigite *menu* para ver as outras opções.`);
  }
  let dados;
  if (e.tipo === 'busca_tudo') dados = await buscarTodosCache();
  else dados = await buscarCache(e.colecao);
  let linhas;
  if (e.tipo === 'lista' && e.filtro && e.filtro.length) {
    // v90: os produtos da entrada saem do catálogo (busca de sempre + sinônimos). Se o cliente pediu MARCA, LINHA ou DOSAGEM junto
    // ("primobolan landerlan diamond", "deca 300mg"), filtra por TODAS as palavras; se não houver, diz isso e mostra as opções.
    const _pr = await ciCatalogo();
    const _tudoTxt = await buscarTodosCache();
    const _daEntrada = ciProdutosDaEntrada(e, _pr, _tudoTxt);
    const _pedido = String(q || marca || '').trim();
    if (_daEntrada.length && _pedido) {
      const _sub = ciProcurar(_pedido, _daEntrada);
      if (_sub.exatos.length && _sub.exatos.length < _daEntrada.length) {
        return await ciAbrirLista(session, sid, ciLinhas(_sub.exatos), ciTitulo(_sub, _sub.exatos), respond);
      }
      if (!_sub.exatos.length && _sub.palavras.length > 1 && ciProcurar(_pedido, _pr).todasConhecidas) {   // v93: frase solta não vira "não tenho"
        const _loja = await ciLoja(_pedido, _pr);
        if (_loja.disponiveis.length) return await ciAbrirLista(session, sid, _loja.disponiveis, _sub.palavras.join(' ').toUpperCase(), respond);
        // marca/linha pedida que existe em OUTROS produtos: avisa ("de LANDERLAN DIAMOND tenho 5 produtos")
        const _vocE = ciVocab(_daEntrada);
        const _resto = _sub.palavras.filter(w => !CI_FRACAS[w] && !ciEhDose(ciColar(w)) && !_daEntrada.every(p => ciCasa(w, p, _vocE)));
        const _daMarca = _resto.length ? ciProcurar(_resto.join(' '), _pr).exatos : [];
        const _dica = _daMarca.length ? `\n\n💡 De *${_resto.join(' ').toUpperCase()}* tenho ${_daMarca.length} ${_daMarca.length === 1 ? 'produto disponível' : 'produtos disponíveis'} — digite *${_resto.join(' ')}* para ver.` : '';
        const _aviso = _loja.esgotados.length
          ? ciFraseEsgotado(_loja.esgotados) + _dica + `\n\nOutras opções de *${e.label}* disponíveis 👇`
          : `Não tenho *${e.label}* ${_sub.faltou.length ? 'com *' + _sub.faltou.join(' ') + '* ' : ''}disponível no momento. 😕` + _dica + `\n\nOpções de *${e.label}* disponíveis 👇`;
        return await ciAbrirLista(session, sid, ciLinhas(_daEntrada), (e.label || '').toUpperCase(), respond, _aviso);
      }
    }
    linhas = ciLinhas(_daEntrada);
  } else if (e.tipo === 'categoria' || !e.filtro || !e.filtro.length) {
    linhas = dados.split('\n').filter(Boolean);
  } else {
    const _termos = termosCategoria(e);
    linhas = filtrarCache(dados, _termos);
    // FALLBACK GLOBAL: não achou na coleção esperada? Procura em TODAS antes de dizer que
    // não tem (produto pode estar catalogado noutra coleção — ex.: Clembuterol/T3 em "farmacia").
    if (!linhas.length) {
      const tudo = await buscarTodosCache();
      linhas = filtrarCache(tudo, _termos);
    }
    // Tira itens que NÃO são desta categoria (ex.: NPP/Fenilpropionato fora do Deca).
    linhas = aplicarExclusao(linhas, e.excluir);
  }
  let unicas = [...new Set(linhas)];
  if (!unicas.length) {
    // v90: antes de dizer "não está disponível", pergunta à loja — pode estar ESGOTADO, ou ter acabado de entrar.
    try {
      const _lj = await ciLoja(String(q || e.label || ''), await ciCatalogo());
      if (_lj.disponiveis.length) return await ciAbrirLista(session, sid, _lj.disponiveis, (e.label || '').toUpperCase(), respond);
      if (_lj.esgotados.length) {
        await saveSession(sid, { ...session, state:'MENU', errosSeguidos:0, pendenteRec:null });
        return respond(ciFraseEsgotado(_lj.esgotados) + `\n\nMe diga outro produto ou digite *menu* para ver as categorias.`);
      }
    } catch (eLj) {}
    await saveSession(sid, { ...session, state:'MENU', errosSeguidos:0, pendenteRec:null });
    return respond(`*${e.label}* não está disponível no momento. 😕\n\nDigite *menu* para ver as outras opções.`);
  }
  // Se o cliente citou uma MARCA junto ("masteron da zphc"), filtra a lista por ela.
  let tituloMarca = '';
  if (marca) {
    const nm = norm(marca);
    const porMarca = unicas.filter(l => norm(l).includes(nm));
    if (porMarca.length) { unicas = porMarca; tituloMarca = ' — ' + marca.toUpperCase(); }
  }
  await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(unicas), errosSeguidos:0, pendenteRec:null });
  return respond(`*${(e.label||'').toUpperCase()}${tituloMarca}*\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
}

// Inicia um COMBO/STACK determinístico: confirma que entendeu TODOS os produtos, anuncia a
// ordem, abre o PRIMEIRO e guarda o resto em stackFila. O estado QUANTIDADE encadeia o próximo
// assim que o cliente adiciona no carrinho — assim NENHUM produto fica pendente.
async function iniciarStack(session, sid, entries, respond) {
  const primeiro = entries[0];
  const fila = entries.slice(1).map(e => ({ label:e.label, tipo:e.tipo, colecao:e.colecao, filtro:e.filtro||[], ester:e.ester||'' }));
  const nomesTodos = entries.map(e => '*'+e.label+'*').join(' + ');
  const depois = fila.length ? ` Depois a gente adiciona ${fila.map(f=>'*'+f.label+'*').join(', ')}.` : '';
  const preambulo = `Boa! 💪 Entendi seu combo: ${nomesTodos}.\n\nVamos montar um de cada vez, começando pela *${primeiro.label}*.${depois} 👇`;
  const respondStack = (r) => respond(preambulo + '\n\n' + r);
  return await resolverReconhecido({ ...session, stackFila: fila, errosSeguidos:0, pendenteRec:null }, sid, primeiro, respondStack);
}

// v86 — NOME DE CATEGORIA digitado pelo cliente → número da opção do menu de compra (1 a 7), ou NaN.
// Aceita a palavra sozinha ("hormonio", "peptideos") e dentro de um pedido curto ("quero hormonio", "tem hormonios?",
// "quero ver os hormonios", "lista de peptideos"). Recebe o texto JÁ normalizado (norm()).
function categoriaPorTexto(nt0) {
  const _nt = String(nt0 || '').trim().replace(/[?!.,]+$/, '').trim()
    .replace(/^(eu )?(quero ver|quero comprar|queria ver|gostaria de ver|quero|queria|ver|tem|voces tem|vcs tem|vc tem|voce tem|me mostra|me mostre|mostra|mostrar|quais|quais sao|lista de|lista dos|lista das|categoria|categoria de)\s+/, '')
    .replace(/^(os|as|o|a|de|dos|das|algum|alguns|alguma|algumas)\s+/, '')
    .replace(/\s+(disponiveis|disponivel|por favor|pfv|pf|ai|tem)$/, '').trim();
  if (/^(emagrecedor(es)?|emagrecimento|emagrecer)$/.test(_nt)) return 1;
  if (/^(peptideo(s)?)$/.test(_nt)) return 2;
  if (/^(hormonio(s)?|hormonal|hormonais)$/.test(_nt)) return 3;
  if (/^(gh|hgh|somatropina|hormonio do crescimento)$/.test(_nt)) return 4;
  if (/^(estetica|esteticos?)$/.test(_nt)) return 5;
  if (/^(sarm(s)?)$/.test(_nt)) return 6;
  if (/^(farmacia|farmacos?)$/.test(_nt)) return 7;
  return NaN;
}
const CATEGORIA_NOME = { 1:'Emagrecedores', 2:'Peptídeos', 3:'Hormônios', 4:'GH', 5:'Estética', 6:'SARMS', 7:'Farmácia' };
// v86 — abre a categoria (mesmas telas das opções 1 a 7 do menu de compra). O carrinho é preservado.
async function abrirCategoria(session, sid, cat, respond) {
  if (cat === 2) { await saveSession(sid, { ...session, state:'PEPTIDEOS' }); return respond(MENU_PEPTIDEOS); }
  if (cat === 3) { await saveSession(sid, { ...session, state:'HORMONIOS' }); return respond(MENU_HORMONIOS); }
  const LISTAS = { 1:['emagrecedores','*💊 EMAGRECEDORES*'], 4:['gh','*⚡ GH*'], 5:['estetica','*💅 ESTÉTICA*'], 6:['sarms','*🧬 SARMS*'], 7:['farmacia','*💊 FARMÁCIA*'] };
  const L = LISTAS[cat]; if (!L) return respond(buildMenuPrincipal());
  const dados = await buscarCache(L[0]);
  const linhas = dados.split('\n').filter(Boolean);
  if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
  await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(linhas) });
  return respond(`${L[1]}\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
}

async function tratarTextoLivre(session, sid, nMsg, menuStr, respond) {
  // Quer PARCELAR → simula na hora (total do pedido/carrinho, ou valor que ele disser).
  if (ehPedidoParcelamento(nMsg)) {
    const base = baseParcelamento(session, nMsg);
    if (base > 0) return respond(simularParcelas(base));
    return respond(`💳 Claro! Você pode pagar *à vista no Pix (sem juros)* ou parcelar em *até 12x no cartão* (taxas da InfinitePay). 😊\n\nMe diz o *valor* que você quer simular (ex.: 1000), ou monte seu carrinho que eu já mostro as parcelas do total.`);
  }
  // Pediu TABELA DE FRACIONAMENTO → mesmo fluxo travado por CPF (só do que já comprou).
  // No fim (PROTO_TIPO) a Athena oferece protocolo+tabela OU só a tabela.
  if (ehPedidoFracionamento(nMsg)) {
    if (session.protoVerificado && Array.isArray(session.protoProdutos) && session.protoProdutos.length) {
      const lista = session.protoProdutos.map((p,i) => `${emojis(i)} ${p}`).join('\n');
      await saveSession(sid, { ...session, state:'PROTO_ESCOLHER', fracFluxo:true, errosSeguidos:0 });
      return respond(`Beleza! 💉 Seus produtos:\n\n${lista}\n\n0️⃣ Outro produto (que ainda não comprei)\n\n*Pra qual você quer a tabela de fracionamento?* Pode ser *um número*, *vários* (ex.: 1 e 3) ou *todos*.`);
    }
    await saveSession(sid, { ...session, state:'PROTO_CLIENTE', fracFluxo:true, errosSeguidos:0 });
    return respond(`Boa! 💉 Eu te mando a *tabela de fracionamento* certinha do que você comprou (e, se quiser, o protocolo completo junto).\n\nIsso é pra *cliente VitaFlow*.\n\n${msgCalculadora()}\n\nVocê *já é cliente*? _(responde *sim* ou *não*)_`);
  }
  // Pediu pra MONTAR um protocolo/plano (ou analisar exame) → fluxo travado por CPF:
  // só monta protocolo depois da compra e SÓ com os produtos que o cliente já comprou.
  if (ehPedidoProtocoloCompleto(nMsg)) {
    // Se já confirmou o cliente NESTA sessão, vai DIRETO pra escolha — não pergunta de novo nem busca de novo.
    if (session.protoVerificado && Array.isArray(session.protoProdutos) && session.protoProdutos.length) {
      const lista = session.protoProdutos.map((p,i) => `${emojis(i)} ${p}`).join('\n');
      await saveSession(sid, { ...session, state:'PROTO_ESCOLHER', fracFluxo:false, errosSeguidos:0 });
      return respond(`Beleza! 💪 Seus produtos:\n\n${lista}\n\n0️⃣ Outro produto (que ainda não comprei)\n\n*Pra qual você quer o protocolo agora?* Pode ser *um número*, *vários* (ex.: 1 e 3 — protocolo combinado) ou *todos*.`);
    }
    await saveSession(sid, { ...session, state:'PROTO_CLIENTE', fracFluxo:false, errosSeguidos:0 });
    return respond(`Adoro montar protocolo! 💪\n\nO protocolo *completo e personalizado* (suas doses, ciclo e cuidados) eu monto *depois da compra* — é cortesia exclusiva pra *cliente VitaFlow*.\n\n${msgGerador()}\n\nVocê *já é cliente* nossa? _(responde *sim* ou *não*)_`);
  }
  // v90 — CATÁLOGO INTELIGENTE: o que o catálogo do dia tem para esta mensagem (ver o bloco "ci").
  const _ciProds = await ciCatalogo();
  const _ci = ciProcurar(nMsg, _ciProds);
  // v91: nada no dicionário nem no catálogo → tenta o nome longo com 2 letras erradas ("monjauro" → mounjaro)
  const rec = reconhecerProduto(nMsg) || ((!_ci.exatos.length && !_ci.proximos.length) ? reconhecerAproximado(nMsg) : null);
  const _temCarrinho = (session.carrinho || []).length > 0;
  // v93 — a mensagem CITA a promoção relâmpago ativa → abre a relâmpago (nunca "não tenho"). Frase com outro assunto junto → IA.
  const _relAt = promoAtiva();
  if (_relAt && /promo|relampago|oferta/.test(ciNorm(nMsg))) {
    const _wsMsg = ciPalavrasDoPedido(nMsg);
    const _citaRel = _relAt.produtos.some(p => { const f = ciPalavrasDoPedido(p.nome)[0]; return !!f && _wsMsg.indexOf(f) >= 0; });
    if (_citaRel || (!rec && !_ci.exatos.length)) {
      const _outroAssunto = _ci.fortes.filter(w => _ci.conhecidas.indexOf(w) < 0 && !/promo|relampago|oferta/.test(w));
      if (_outroAssunto.length >= 3) {
        await saveSession(sid, { ...session, errosSeguidos: 0 });
        return await responderComIA(sid, nMsg, contextoLista(session), respond);
      }
      const _mRel = await abrirPromo(session, sid);
      if (_mRel) return respond(_mRel);
    }
  }
  // Dúvida/pergunta (protocolo, como usar, dose, "?"...) → a IA RESPONDE, mesmo que cite um
  // produto. Só abre a lista quando é intenção de ver/comprar, não quando é pergunta.
  // v90: pergunta de PREÇO/ESTOQUE com produto ("quanto está o valor da primobolan diamond?", "tem dhb?") NÃO é dúvida — abre a lista.
  const _precoComProduto = ehPerguntaDePreco(nMsg) && (_ci.exatos.length > 0 || !!rec || (_ci.fortes.length > 0 && _ci.fortes.length <= 5));
  // v90: o cliente digitou o NOME de um produto que contém palavra-gatilho de dúvida ("TPC PRO 500mg") → é produto, não pergunta.
  const _ehSoNome = !/\\?\\s*$/.test(nMsg) && _ci.exatos.length > 0 && _ci.todasConhecidas && ciPalavras(nMsg).every(function (w) { return _ci.exatos.some(function (p) { return ciCasa(w, p); }); });
  if (ehDuvida(nMsg) && !_precoComProduto && !_ehSoNome) {
    await saveSession(sid, { ...session, errosSeguidos: 0 });
    const _dv = await ciParaDuvida(_ci, _ciProds);
    return await responderComIA(sid, nMsg, ciJuntaContexto(contextoLista(session), ciContextoIA(_dv.achado, _dv.loja)), respond);
  }
  // Combo/stack (2+ produtos juntos, ex.: "testo e deca"): conduz UM de cada vez, deixando
  // claro que entendeu TODOS e encadeando o próximo — nenhum produto fica pendente.
  if (ehPedidoStack(nMsg) && !(_ci.exatos.length && _ci.exatos.length <= 40)) {
    return await iniciarStack(session, sid, reconhecerVarios(nMsg), respond);
  }
  // Palavra genérica SOZINHA com fluxo guiado no dicionário ("testosterona" → qual éster?, "enantato" → de quê?, "gh", "saxenda").
  let _guiado = false;
  if (rec && ['submenu_testo','ester','saxenda','categoria'].indexOf(rec.entry.tipo) >= 0) {
    _guiado = (_ci.palavras.length <= 1) || rec.entry.tipo === 'saxenda';
    // a palavra é o próprio nome no catálogo e existe de UMA ou DUAS famílias só ("cipionato", "decanoato", "durateston", "dura")
    // → abre direto, sem "de quê?" nem "Você quis dizer…?". "testo" (muitas famílias) continua perguntando o éster.
    if (_guiado && rec.entry.tipo !== 'saxenda' && _ci.exatos.length && ciFamilias(_ci.exatos).length <= 2 && (rec.entry.tipo === 'ester' || rec.modo === 'apelido')) _guiado = false;
  }
  // v86 — NOME DE CATEGORIA ("hormonio", "quero ver os peptideos") vem ANTES da busca: "hormônio" não é o Kit de Aplicação para Hormônios.
  const _catTxt = categoriaPorTexto(nMsg);
  // 1) O catálogo tem produto com TODAS as palavras do pedido → abre a lista.
  const _soEntrada = !!(rec && _ci.palavras.length === 1 && rec.entry.tipo === 'lista');
  // palavra genérica por APELIDO com muitas famílias ("testo", "tt"): segue o dicionário ("Você quis dizer Testosterona?")
  const _apelidoGenerico = !!(rec && rec.modo === 'apelido' && _ci.palavras.length <= 1 && rec.entry.tipo !== 'lista' && ciFamilias(_ci.exatos).length > 2);
  // (com carrinho + palavra do dicionário: a pergunta "Quer ver X?" sai do passo 2, que guarda a entrada inteira)
  if (!_guiado && !_apelidoGenerico && isNaN(_catTxt) && _ci.exatos.length && !(_temCarrinho && _soEntrada)) {
    // palavra do dicionário com exclusão própria ("nandrolona" = Deca, sem NPP — igual à opção do menu)
    if (_soEntrada && rec.entry.excluir && rec.entry.excluir.length) {
      const _ok = {}; aplicarExclusao(ciLinhas(_ci.exatos), rec.entry.excluir).forEach(l => { _ok[l] = 1; });
      const _f = _ci.exatos.filter(p => _ok[p.linha]); if (_f.length) _ci.exatos = _f;
    }
    const _titulo = _soEntrada ? String(rec.entry.label).toUpperCase() : ciTitulo(_ci, _ci.exatos);
    if (_temCarrinho) {
      const _lb = _soEntrada ? rec.entry.label : _titulo;
      await saveSession(sid, { ...session, errosSeguidos:0, state:'CONFIRMAR_VER_PRODUTO',
        pendenteRec: { label:_lb, tipo:'busca_ci', q:_ci.palavras.join(' '), colecao:'', filtro:[], ester:'', marca:'' } });
      return respond(`Quer ver *${_lb}*? Seu carrinho fica salvo. 🛒\n\n1️⃣ Sim, ver ${_lb}\n2️⃣ Não, continuar de onde parei`);
    }
    return await ciAbrirLista(session, sid, ciLinhas(_ci.exatos), _titulo, respond);
  }
  // 2) Dicionário (sinônimos, apelidos e fluxos guiados).
  if (rec && isNaN(_catTxt)) {
    // Se o cliente tem carrinho e pede outro produto, pergunta antes (carrinho fica salvo).
    if (_temCarrinho) {
      const e = rec.entry;
      await saveSession(sid, {
        ...session, errosSeguidos:0, state:'CONFIRMAR_VER_PRODUTO',
        pendenteRec: { label:e.label, tipo:e.tipo, colecao:e.colecao, filtro:e.filtro||[], canonico:e.canonico||[], apelidos:e.apelidos||[], excluir:e.excluir||[], ester:e.ester||'', marca: detectarMarca(nMsg) || '', q: _ci.palavras.join(' ') }
      });
      return respond(`Quer ver *${e.label}*? Seu carrinho fica salvo. 🛒\n\n1️⃣ Sim, ver ${e.label}\n2️⃣ Não, continuar de onde parei`);
    }
    // nome formal, OU apelido acompanhado de marca/linha/dosagem ("deca landerlan diamond") → resolve direto
    if (rec.modo === 'canonico' || _ci.palavras.length > 1) {
      return await resolverReconhecido(session, sid, rec.entry, respond, detectarMarca(nMsg), _ci.palavras.join(' '));
    }
    const e = rec.entry;
    await saveSession(sid, {
      ...session, errosSeguidos:0, state:'CONFIRMAR_PRODUTO',
      pendenteRec: { label:e.label, tipo:e.tipo, colecao:e.colecao, filtro:e.filtro||[], canonico:e.canonico||[], apelidos:e.apelidos||[], excluir:e.excluir||[], ester:e.ester||'', marca: detectarMarca(nMsg) || '', q: _ci.palavras.join(' ') }
    });
    return respond(`Você quis dizer *${e.label}*? 🤔\n\n1️⃣ Sim\n2️⃣ Não`);
  }
  // v86 — a palavra é um NOME DE CATEGORIA ("hormonio", "peptideos"…): abre a categoria.
  // Com carrinho, pergunta antes (carrinho preservado), igual ao que já acontece com nome de produto.
  if (!isNaN(_catTxt)) {
    if (_temCarrinho) {
      const _lb = CATEGORIA_NOME[_catTxt];
      await saveSession(sid, { ...session, errosSeguidos:0, state:'CONFIRMAR_VER_PRODUTO',
        pendenteRec: { label:_lb, tipo:'categoria', cat:_catTxt, colecao:'', filtro:[], ester:'', marca:'' } });
      return respond(`Quer ver *${_lb}*? Seu carrinho fica salvo. 🛒\n\n1️⃣ Sim, ver ${_lb}\n2️⃣ Não, continuar de onde parei`);
    }
    await limparHistoricoIA(sid);
    return await abrirCategoria({ ...session, errosSeguidos:0, pendenteRec:null }, sid, _catTxt, respond);
  }
  // 3) Nada disponível com todas as palavras. Se o pedido parece nome de produto (poucas palavras), pergunta à LOJA:
  //    existe e está ESGOTADO? acabou de entrar e o cache ainda não tem? Senão, mostra o mais próximo. Frase solta segue pra IA.
  let _loja = null;
  if (_ci.fortes.length && _ci.palavras.length <= 5) {
    try { _loja = await ciLoja(nMsg, _ciProds); } catch (e) { _loja = null; }
    if (_loja && _loja.disponiveis.length && !_temCarrinho) {
      return await ciAbrirLista(session, sid, _loja.disponiveis, _ci.palavras.join(' ').toUpperCase(), respond);
    }
    const _proximos = (_ci.todasConhecidas && _ci.proximos.length && _ci.proximos.length <= 40) ? _ci.proximos : [];
    if (_loja && _loja.esgotados.length) {
      const _fr = ciFraseEsgotado(_loja.esgotados);
      if (_proximos.length && !_temCarrinho) return await ciAbrirLista(session, sid, ciLinhas(_proximos), ciTitulo(_ci, _proximos), respond, _fr + '\n\nO mais próximo que tenho disponível 👇');
      await saveSession(sid, { ...session, errosSeguidos: 0 });
      return respond(_fr + '\n\nMe diga outro produto ou digite *menu* para ver as categorias.');
    }
    if (_proximos.length && !_temCarrinho && _ci.palavras.length <= 4) {
      const _pedidoTxt = _ci.palavras.join(' ');
      return await ciAbrirLista(session, sid, ciLinhas(_proximos), ciTitulo(_ci, _proximos), respond,
        `Não encontrei *${_pedidoTxt}* exatamente assim${_ci.faltou.length ? ' (sem *' + _ci.faltou.join(' ') + '* disponível no momento)' : ''}. 😕\n\nO mais próximo que tenho 👇`);
    }
  }
  // Não reconheceu como produto → em vez do "não entendi" robótico, deixa a IA responder
  // de forma inteligente e assíncrona (sem timeout). Mantém o contexto/estado atual.
  await saveSession(sid, { ...session, errosSeguidos: (session.errosSeguidos || 0) + 1 });
  return await responderComIA(sid, nMsg, ciJuntaContexto(contextoLista(session), ciContextoIA(_ci, _loja)), respond);
}

// ── System prompt exclusivo para protocolos ───────────────────────────────────
const PROTOCOLO_PROMPT = `Você é a Athena, consultora especialista da VitaFlow em peptídeos, hormônios e suplementação avançada. Você é uma vendedora brilhante: técnica, apaixonada pelo que faz e extremamente persuasiva — sem ser chata ou forçada.

Seu papel é responder sobre protocolos, dosagens, mecanismos de ação, benefícios e cuidados de uso, E SEMPRE converter esse interesse em venda.

REGRAS TÉCNICAS:
- Português brasileiro informal e caloroso
- Informações detalhadas e precisas
- Use doses MÍNIMAS eficazes e explique quanto tempo o produto dura com essas doses
- NUNCA use ## ou ### — use apenas *negrito*
- NUNCA mencione preços (você não tem acesso a eles)

REGRAS ABSOLUTAS — NUNCA VIOLE:
- NUNCA invente telefone, endereço, contato ou qualquer dado da empresa
- NUNCA invente prazos — use SEMPRE os prazos oficiais abaixo
- NUNCA invente produtos, marcas, disponibilidade ou estoque
- Se não souber algo, diga que não tem essa informação e oriente a digitar *menu*

FRETE E PRAZOS (use SEMPRE "prazo estimado" ao mencionar entrega):
- Postagem: até 3 dias úteis após confirmação do pagamento (atacado: até 6 dias úteis)
- Prazos estimados de entrega por estado (dias úteis, contados a partir da postagem):
  Sudeste: SP e RJ 1 a 6 | MG 2 a 6 | ES 2 a 8 — Sul: PR 2 a 6 | SC 2 a 7 | RS 2 a 5
  Centro-Oeste: DF 3 a 6 | GO 2 a 6 | MS 4 a 8 | MT 4 a 9 — Nordeste: BA 3 a 10 | demais estados 5 a 11 — Norte: 7 a 11
- Transportadoras disponíveis: Jadlog, J&T Express e Loggi
- Modalidades: PAC, SEDEX (Correios) e Transportadora
- Recomende sempre a Transportadora — inclui seguro grátis contra apreensão e extravio
- Correios (PAC/SEDEX) NÃO possuem seguro

REGRA DE OURO — SEMPRE ao final de cada resposta:
1. Inclua: "💡 Como qualquer suplemento avançado, o acompanhamento profissional potencializa os resultados."
2. Faça uma transição persuasiva para a compra, destacando urgência ou benefício único
3. Termine com exatamente este bloco (substitua NOME_DO_PRODUTO pelo produto discutido):

---PRODUTOS---
NOME_DO_PRODUTO
---FIM---

Exemplos de transições persuasivas (varie, não repita sempre a mesma):
- "Esse é exatamente o tipo de resultado que nossos clientes estão tendo. Quer dar esse passo agora?"
- "Temos opções disponíveis com entrega para todo o Brasil. Que tal aproveitar?"
- "Muita gente que pergunta sobre esse protocolo acaba se surpreendendo com os resultados em poucas semanas. Quer começar?"
- "A janela de oportunidade para resultados reais é agora. Posso te mostrar o que temos disponível?"`;

// ── Utilitários ───────────────────────────────────────────────────────────────
function norm(s) {
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ç/g,'c').trim();
}
function emojis(i) {
  const e = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  return i < 10 ? e[i] : `${i+1}.`;
}
// Preço numérico de uma linha "nome|preco" (BR: "2.249,00" -> 2249). Sem preço vai pro FIM.
function precoDaLinha(l) {
  const p = String(l).split('|')[1];
  if (!p) return Infinity;
  const n = parseFloat(p.trim().replace(/\./g,'').replace(',','.'));
  return isNaN(n) ? Infinity : n;
}
// Ordena as linhas do MENOR pro MAIOR preço. Usado por formatarLista E parseProdutos com o
// MESMO critério (sort estável) — assim o número mostrado bate sempre com o produto escolhido.
function ordenarPorPreco(linhas) {
  return (linhas || []).slice().sort((a, b) => precoDaLinha(a) - precoDaLinha(b));
}
function formatarLista(linhas) {
  const SEP = '\n┈┈┈┈┈┈┈┈┈┈\n';
  return ordenarPorPreco(linhas).map((l, i) => {
    const [nome, preco] = l.split('|');
    return preco ? `${emojis(i)} *${nome.trim()}* — R$ ${preco.trim()}` : `${emojis(i)} *${nome.trim()}*`;
  }).join(SEP);
}
// Divide um texto longo em pedaços de no máx maxLen chars, quebrando ENTRE linhas
// (nunca corta um produto no meio). O WhatsApp/BotConversa recusa mensagem única
// muito grande e mostra "Erro ao enviar mensagem" — por isso a divisão.
function partirMensagem(txt, maxLen) {
  maxLen = maxLen || 3800;
  if (!txt || txt.length <= maxLen) return [txt || ''];
  const linhas = String(txt).split('\n');
  const partes = [];
  let buf = '';
  for (const ln of linhas) {
    const cand = buf ? buf + '\n' + ln : ln;
    if (buf && cand.length > maxLen) { partes.push(buf); buf = ln; }
    else buf = cand;
  }
  if (buf) partes.push(buf);
  return partes;
}
function parseProdutos(linhas) {
  return ordenarPorPreco(linhas).map(l => {
    const [nome, preco] = l.split('|');
    const precoNum = preco ? parseFloat(preco.replace(/\./g,'').replace(',','.')) : 0;
    return { nome: nome.trim(), preco: precoNum };
  });
}
// Forma COLADA: tira hífen, ponto, barra e espaço. Serve pra "CBL-514" achar "CBL 514" e
// vice-versa — o VitaFlow cadastrou "CBL 514 50mg" (espaço) e a busca por "CBL-514" dava ZERO,
// além do produto não entrar na opção 12 do menu de peptídeos. Achado em 18/09/2026.
function _colado(s) { return norm(s).replace(/[-_.\/\s]+/g, ''); }
// Só vale pra CÓDIGO de produto (tem hífen, ponto ou dígito) — em palavra comum não se aplica,
// pra não afrouxar a busca e começar a casar no meio de outra palavra.
function _ehCodigo(termo) { return /[-.\/\d]/.test(String(termo || '')); }

function filtrarCache(dados, termos) {
  const lista = Array.isArray(termos) ? termos : [termos];
  const resultados = new Set();
  const _STOP2 = ['de','da','do','em','no','na','os','as','um','ou','se','eu','me','te','ja','so','pf','mg','ml','ui','iu','mc','cx','un'];
  // v84: passada ESTRITA com as palavras de 2 letras que não são preposição ("tg 15mg" → tg + 15mg). Se der zero, vale a busca de sempre.
  const _estritos = new Set();
  lista.forEach(termo => {
    const todas = norm(termo).split(/\s+/).filter(Boolean);
    const p2 = todas.filter(p => p.length > 2 || (p.length === 2 && /^[a-z]{2}$|^[a-z]\d$/.test(p) && _STOP2.indexOf(p) < 0));
    if (p2.length < 2 || !p2.some(p => p.length === 2)) return;
    dados.split('\n').filter(Boolean).forEach(linha => {
      const nomeProd = norm(linha.split('|')[0]);
      if (p2.every(p => _casaTermo(nomeProd, p))) _estritos.add(linha);
    });
  });
  if (_estritos.size) return [..._estritos];
  lista.forEach(termo => {
    const palavras = norm(termo).split(/\s+/).filter(p => p.length > 2);
    if (!palavras.length) return;
    // MESMA regra do atacado: exata primeiro, radical depois. O catálogo do varejo
    // tinha o mesmo defeito — "testosterona" não achava "Testosterone Enanthate".
    const radicais = palavras.map(radicalPalavra);
    // O radical PT/EN só vale pra palavra de 4+ letras. Sem isso, "sim" virava radical
    // "sin" e casava com "SYNedica" (radical "sinedica") — o cliente respondia *Sim* e
    // recebia uma lista de produtos com o título "SIM". Caso real, 08/09. Palavra curta
    // (bpc, hcg, gh) continua valendo pelo texto exato, que é como ela é escrita mesmo.
    const podeRadical = palavras.every(p => p.length >= 4);
    dados.split('\n').filter(Boolean).forEach(linha => {
      const nomeProd = norm(linha.split('|')[0]);
      // _casaTermo: o termo precisa INICIAR uma palavra do nome (mesmo limite que a busca
      // do atacado passou a usar em 08/09) — não casa mais no meio de outra palavra.
      if (palavras.every(p => _casaTermo(nomeProd, p))) { resultados.add(linha); return; }
      if (podeRadical) {
        const rad = radicalProduto(nomeProd);
        if (radicais.every(r => _casaTermo(rad, r))) { resultados.add(linha); return; }
      }
      // Passada extra IGNORANDO separador (só pra código): "cbl-514" acha "CBL 514" e o contrário.
      if (_ehCodigo(termo)) {
        const nomeColado = _colado(nomeProd);
        if (palavras.every(pal => nomeColado.includes(_colado(pal)))) resultados.add(linha);
      }
    });
  });
  return [...resultados];
}
function getFreteOpcoes(uf) {
  const f = FRETES[uf.toUpperCase()];
  if (!f) return null;
  const opts = [];
  if (f.PAC)   opts.push({ label: 'PAC',           valor: f.PAC });
  if (f.SEDEX) opts.push({ label: 'SEDEX',          valor: f.SEDEX });
  if (f.Transp)opts.push({ label: 'Transportadora', valor: f.Transp });
  return opts.length ? opts : null;
}
function totalCarrinho(carrinho) {
  return (carrinho || []).reduce((acc, item) => acc + (item.preco * item.qtd), 0);
}
function resumoCarrinho(carrinho) {
  return (carrinho || []).map(item =>
    `📦 *${item.nome}*\n    ${item.qtd}x — R$ ${item.preco.toFixed(2).replace('.',',')} un. = R$ ${(item.preco*item.qtd).toFixed(2).replace('.',',')}`
  ).join('\n');
}
function msgCarrinhoMenu(carrinho) {
  const subtotal = totalCarrinho(carrinho);
  return `🛒 *Seu carrinho* (${carrinho.length} ${carrinho.length>1?'itens':'item'}):\n${resumoCarrinho(carrinho)}\n\n` +
    `💰 *Subtotal: R$ ${subtotal.toFixed(2).replace('.',',')}*\n_(frete calculado no fechamento)_\n\n` +
    `*O que deseja fazer?*\n1️⃣ Adicionar mais produtos\n2️⃣ Finalizar compra\n3️⃣ Remover um produto`;
}
function msgRemoverItem(carrinho) {
  const linhas = (carrinho || []).map((it, i) => `${emojis(i)} *${it.nome}* x${it.qtd}`).join('\n');
  return `🗑️ *Qual produto você quer remover?*\n\n${linhas}\n\n_Digite o número do item, ou *menu* para voltar._`;
}
const REM_INTENT = ['tirar','retirar','remover','excluir','apagar','tira produto','remove produto'];

// ── Rastreio de pedido (status da coluna F) ───────────────────────────────────
const STATUS_INFO = {
  'aguardando pagamento':              { emoji:'⏳',  exp:'O pedido foi gerado mas o pagamento ainda não foi confirmado.' },
  'pedido confirmado':                 { emoji:'✅',  exp:'Seu pedido foi recebido e o pagamento confirmado. Em breve iniciaremos a separação.' },
  'em separacao':                      { emoji:'📦',  exp:'Estamos preparando os produtos do seu pedido com controle de qualidade rigoroso.' },
  'despachado':                        { emoji:'🚚',  exp:'Seu pedido foi entregue à transportadora.' },
  'postado':                           { emoji:'📮',  exp:'Seu pedido saiu da sede da transportadora e está a caminho.' },
  'em transferencia':                  { emoji:'🔄',  exp:'Seu pedido está em trânsito entre unidades a caminho da sua cidade.' },
  'chegou a unidade de destino':       { emoji:'📍',  exp:'Seu pedido chegou à unidade de distribuição na sua cidade. A entrega será realizada em breve.' },
  'em separacao no centro logistico':  { emoji:'🏢',  exp:'Seu pedido está sendo processado no centro logístico para sair para entrega.' },
  'saiu para entrega':                 { emoji:'🛵',  exp:'Seu pedido está com o entregador e será entregue hoje. Fique atento!' },
  'entregue':                          { emoji:'💚',  exp:'Pedido entregue com sucesso! Esperamos que aproveite seus produtos.' },
  'encaminhado para fiscalizacao':     { emoji:'🔎',  exp:'O pedido passa por verificação de rotina pela fiscalização.' },
  'fiscalizacao finalizada':           { emoji:'✔️',  exp:'A verificação foi concluída e o pedido segue seu fluxo normal.' },
  'destinatario ausente':              { emoji:'🚪',  exp:'O entregador passou no endereço mas não encontrou ninguém. Nova tentativa será feita.' },
  'endereco incorreto':                { emoji:'📌',  exp:'Houve um problema com o endereço de entrega; é preciso confirmar os dados.' },
  'area com distribuicao':             { emoji:'🗺️',  exp:'A região tem particularidade na distribuição; verificando a melhor forma de entrega.' },
  'pedido extraviado':                 { emoji:'⚠️',  exp:'O pedido foi extraviado durante o transporte.' },
  'pedido apreendido':                 { emoji:'🚫',  exp:'O pedido foi retido/apreendido.' },
  'reembolso realizado':               { emoji:'💸',  exp:'O reembolso do pedido foi efetuado.' },
  'pedido cancelado':                  { emoji:'❌',  exp:'O pedido foi cancelado.' },
};
// ── PREVISÃO DE ENTREGA (dias úteis a partir da data de confirmação) ──────────
// Se mudar a política, ajuste só estes números. Prazo total = despacho + entrega da região.
const PRAZO_DESPACHO_DU = 3; // v82: dias úteis pra postar (varejo)
const PRAZO_REGIAO_DU = { SE: 6, S: 7, CO: 8, NE: 11, N: 11 }; // v82: entrega máx da região (vale pro estado sem prazo próprio)
const PRAZO_UF_DU = { SP: 6, RJ: 6, MG: 6, ES: 8, DF: 6, PR: 6, SC: 7, RS: 5, GO: 6, BA: 10, MT: 9 }; // v82: entrega máx por estado
const UF_REGIAO = {
  SP:'SE', RJ:'SE', MG:'SE', ES:'SE',
  PR:'S', SC:'S', RS:'S',
  GO:'CO', MT:'CO', MS:'CO', DF:'CO',
  BA:'NE', SE:'NE', AL:'NE', PE:'NE', PB:'NE', RN:'NE', CE:'NE', PI:'NE', MA:'NE',
  AC:'N', AM:'N', RR:'N', RO:'N', AP:'N', PA:'N', TO:'N'
};
function _parseDataBR(s) {
  const str = String(s || '').trim();
  const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  // fallback: veio como string de Date ("Wed Jul 15 2026...") ou ISO ("2026-07-15...")
  const d2 = new Date(str);
  return isNaN(d2.getTime()) ? null : new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
}
// Páscoa (Meeus/Jones/Butcher) — base dos feriados móveis.
function _pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}
const _feriadosCache = {};
function _feriadosAno(ano) {
  const set = {};
  const chave = function (dt) { return ('0' + dt.getDate()).slice(-2) + '/' + ('0' + (dt.getMonth() + 1)).slice(-2); };
  const add = function (dt) { set[chave(dt)] = 1; };
  // Fixos nacionais (inclui Consciência Negra 20/11, nacional desde 2024)
  [[1, 1], [21, 4], [1, 5], [7, 9], [12, 10], [2, 11], [15, 11], [20, 11], [25, 12]].forEach(function (x) { add(new Date(ano, x[1] - 1, x[0])); });
  // Móveis (baseados na Páscoa)
  const p = _pascoa(ano);
  const desl = function (n) { const x = new Date(p.getTime()); x.setDate(x.getDate() + n); return x; };
  add(desl(-48)); // Carnaval (segunda)
  add(desl(-47)); // Carnaval (terça)
  add(desl(-2));  // Sexta-feira Santa
  add(desl(60));  // Corpus Christi
  return set;
}
function _ehFeriado(dt) {
  const ano = dt.getFullYear();
  if (!_feriadosCache[ano]) _feriadosCache[ano] = _feriadosAno(ano);
  const c = ('0' + dt.getDate()).slice(-2) + '/' + ('0' + (dt.getMonth() + 1)).slice(-2);
  return !!_feriadosCache[ano][c];
}
function _addDiasUteis(dt, n) {
  const d = new Date(dt.getTime());
  let add = 0;
  while (add < n) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay(); // 0=domingo, 6=sábado
    if (dow !== 0 && dow !== 6 && !_ehFeriado(d)) add++;
  }
  return d;
}
function _ddmm(d) { return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2); }
// Previsão de entrega a partir da data de confirmação + região. dentroPrazo = hoje <= data-limite.
function calcularPrazo(dataConf, estado) {
  const base = _parseDataBR(dataConf);
  const uf = String(estado || '').toUpperCase();
  const reg = UF_REGIAO[uf];
  if (!base || !reg) return null;
  const totalDU = PRAZO_DESPACHO_DU + (PRAZO_UF_DU[uf] || PRAZO_REGIAO_DU[reg] || 11); // v82: estado → região
  const deadline = _addDiasUteis(base, totalDU);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return { dataLimite: _ddmm(deadline), dentroPrazo: hoje.getTime() <= deadline.getTime() };
}
// v83: AVISO do pedido (o mesmo da página de rastreio). NÃO muda nenhuma palavra do texto: uma frase por linha, a 1ª em negrito,
// negrito nos trechos principais e itálico no "Fique tranquilo" (os mesmos destaques da página v9 e do bot da logística v8).
const AV_EMOJI = '(?:[\\uD83C-\\uDBFF][\\uDC00-\\uDFFF]|[\\u2190-\\u2BFF\\uFE0F\\u200D])';
const AV_FIM = new RegExp('([.!?](?:\\s*' + AV_EMOJI + ')*)\\s+(?=[A-ZÀ-Ý])', 'g');
const AV_NEGRITO = ['o código de rastreamento ainda não está disponível', 'o status detalhado ainda não foi alterado', 'o seu código aparecerá aqui!',
  'as informações serão atualizadas automaticamente aqui', 'transporte 100% seguro', 'a postagem ocorrerá logo em seguida', 'já abriu um chamado junto à transportadora'];
const AV_ITALICO = ['Fique tranquilo', 'fique tranquilo', 'Agradecemos a compreensão'];
function avisoWhats(t) {
  const frases = [];
  String(t || '').split(/\n+/).forEach(bloco => {
    bloco.replace(AV_FIM, '$1\n').split('\n').forEach(f => { f = f.trim(); if (f) frases.push(f); });
  });
  return frases.map((f, i) => {
    if (i === 0 && frases.length > 1) return '*' + f + '*';
    AV_NEGRITO.forEach(x => { f = f.split(x).join('*' + x + '*'); });
    AV_ITALICO.forEach(x => { f = f.split(x).join('_' + x + '_'); });
    return f;
  }).join('\n');
}
function statusBloco(p) {
  const pedido = (p && p.pedido) || '—';
  const statusTexto = (p && p.status) || '';
  const info = STATUS_INFO[norm(statusTexto)];
  const emoji = info ? info.emoji : '📦';
  // v83: aviso do pedido (só em pedido em andamento). Com o aviso de postagem, quem explica é o aviso (igual à página de rastreio).
  const _nstA = norm(statusTexto);
  const _andamento = ['pedido confirmado', 'pago', 'em separacao', 'despachado', 'postado', 'em transferencia', 'chegou a unidade de destino', 'em separacao no centro logistico', 'saiu para entrega'].indexOf(_nstA) >= 0;
  const aviso = (p && p.aviso && p.aviso.texto && _andamento) ? p.aviso : null;
  const avisoPost = !!aviso && ['sem_codigo', 'objeto_criado', 'atacado'].indexOf(aviso.tipo) >= 0;
  const exp = (info && !avisoPost) ? `\n_${info.exp}_` : '';
  let bloco = `📦 *Pedido ${pedido}*\n${emoji} *${statusTexto || '—'}*${exp}`;
  if (aviso) bloco += `\n\n${avisoWhats(aviso.texto)}`;
  // PREVISÃO DE ENTREGA + "está no prazo" (não mostra se já foi entregue).
  const _nst = norm(statusTexto);
  if (_nst.indexOf('entregue') < 0 && p && p.data && p.estado) {
    const prz = calcularPrazo(p.data, p.estado);
    if (prz) {
      bloco += prz.dentroPrazo
        ? `\n\n📅 *Previsão de entrega:* até *${prz.dataLimite}*\n\n✅ Seu pedido está *dentro do prazo* estimado — é só aguardar que está tudo certo! 😊`
        : `\n\n📅 *Prazo estimado:* era até *${prz.dataLimite}*.\n\nSe ainda não chegou, me avisa que eu *aciono a logística* pra verificar pra você. 🙏`;
    }
  }
  // Código oficial da transportadora — o GAS só devolve quando o pacote já está em ROTA REAL
  // (em transferência, chegou à unidade, saiu para entrega, entregue), igual ao site.
  if (p && p.codigo) {
    const transp = p.transportadora ? ` — ${p.transportadora}` : '';
    bloco += `\n\n🔎 *Código de rastreio${transp}:*\n${p.codigo}`;
    if (p.link_transp) {
      bloco += `\n\n📲 *Rastreie direto no site da transportadora:*\n${p.link_transp}`;
    }
  }
  return bloco;
}
const RASTREIO_RODAPE =
  `\n\n_Quer consultar outro? É só mandar o número do pedido, CPF ou e-mail._\n` +
  `📞 Para mais informações sobre seu pedido, fale com a logística: 👉 wa.me/447537155718\n` +
  `_Ou digite *menu* para voltar ao início._`;
// v80: 1º a consulta RÁPIDA (função rastreio-consulta: resposta pronta no Firebase feita pelo GAS v50, ~0,3 s, sem
// Apps Script). Se ela disser usar_gas (pedido recém-criado, termo parcial, resposta de outro dia) ou falhar → GAS como
// antes, agora com limite de 8 s (antes era sem limite: com o Apps Script lento, a function inteira ficava presa).
const RASTREIO_RAPIDO_URL = 'https://vitaflow-proxy.netlify.app/.netlify/functions/rastreio-consulta';
async function consultarStatusGAS(termo) {
  try {
    const r = await fetchT(RASTREIO_RAPIDO_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'consultar_status', termo })
    }, 4000);
    const d = await r.json();
    if (d && d.success === true && Array.isArray(d.pedidos)) return d.pedidos;
  } catch (e) {}
  try {
    const r = await fetchT(GAS_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'consultar_status', termo })
    }, 8000);
    const d = await r.json();
    return (d && d.success && Array.isArray(d.pedidos)) ? d.pedidos : [];
  } catch { return []; }
}
function listaPromoMsg(promo) {
  const linhas = promo.produtos.map((p,i) =>
    `${emojis(i)} *${p.nome}* — ~de R$ ${reais(p.de)}~ por *R$ ${reais(p.por)}*`
  ).join('\n');
  const _cab = promo.validade ? `⚡ *${promo.titulo}* — ${promo.validade}! 🔥` : `⚡ *${promo.titulo}* — exclusiva comigo (Athena) e enquanto durarem os estoques! 🔥`;
  return `${_cab}\n\n` +
    `${linhas}\n\n👉 Detalhes: ${promo.link}\n\n*Digite o número do produto para comprar*, ou *menu* para voltar ao início.`;
}
async function abrirPromo(session, sid) {
  const promo = promoAtiva();
  if (!promo) return null;
  await saveSession(sid, {
    ...session, state: 'LISTA_PRODUTOS', fluxoPromo: true, descontoPromoPct: 0,
    promoTitulo: promo.titulo, produtoLista: promo.produtos.map(p => ({ nome: p.nome, preco: p.por })),
  });
  return listaPromoMsg(promo);
}
function gerarLinkRecibo(orderNsu, nome, cpf, email, pagto, carrinho, frete, total, endereco, telefone) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const params = [];
  params.push('pedido=' + encodeURIComponent(orderNsu));
  if (nome)     params.push('nome='  + encodeURIComponent(nome));
  if (cpf)      params.push('cpf='   + encodeURIComponent(cpf));
  if (email)    params.push('email=' + encodeURIComponent(email));
  if (telefone) params.push('tel='   + encodeURIComponent(telefone));
  if (endereco) params.push('end='   + encodeURIComponent(endereco));
  params.push('data='  + encodeURIComponent(hoje));
  params.push('pagto=' + encodeURIComponent(pagto));
  params.push('total=' + encodeURIComponent(total.toFixed(2)));
  const prods = (carrinho || []).map(item => ({ nome: item.nome + ' x' + item.qtd, quantidade: item.qtd, preco_unit: item.preco }));
  const prodsB64 = Buffer.from(encodeURIComponent(JSON.stringify(prods))).toString('base64');
  params.push('produtos=' + prodsB64);
  if (frete) { params.push('frete=' + encodeURIComponent(frete.label)); params.push('frete_v=' + encodeURIComponent(frete.valor.toFixed(2))); }
  return RECIBO_BASE + '?' + params.join('&');
}
async function getSession(sid) {
  try {
    const k = sid.replace(/[^a-zA-Z0-9]/g,'_');
    const r = await fetch(fbUrl(`/vitaflow_sessions/${k}.json`));
    const d = await r.json();
    // O estado que o cliente JÁ tinha também conta pros sinais — senão uma mensagem
    // que não chama saveSession deixaria SINAL_FECHANDO falso e o convite de retomada
    // sairia por cima do lembrete de pagamento que o GAS já manda.
    _marcarSinais(d);
    return d || { state:'MENU' };
  } catch { return { state:'MENU' }; }
}
function _marcarSinais(sess) {
  if (!sess) return;
  if (sess.state === 'LISTA_PRODUTOS') SINAL_LISTA = true;
  if (Array.isArray(sess.carrinho) && sess.carrinho.length) SINAL_CARRINHO = true;
  if (Array.isArray(sess.carrinhoAtk) && sess.carrinhoAtk.length) SINAL_ATACADO = true;
  if (sess.link || sess.orderNsu || sess.state === 'AGUARDAR_COMPROVANTE' || sess.state === 'COLETA_DADOS') SINAL_FECHANDO = true;
}
async function saveSession(sid, sess) {
  _marcarSinais(sess);   // ver SINAL_LISTA / SINAL_CARRINHO / SINAL_FECHANDO no topo
  try {
    const k = sid.replace(/[^a-zA-Z0-9]/g,'_');
    await fetch(fbUrl(`/vitaflow_sessions/${k}.json`), {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(sess)
    });
  } catch {}
}
async function deleteSession(sid) {
  try {
    const k = sid.replace(/[^a-zA-Z0-9]/g,'_');
    await fetch(fbUrl(`/vitaflow_sessions/${k}.json`), { method:'DELETE' });
  } catch {}
}
// ── FLAG DURÁVEL PÓS-PAGAMENTO ────────────────────────────────────────────────
// Gravada pelo GAS quando a InfinitePay confirma o pagamento. Garante que a próxima
// mensagem do cliente (os dados de envio) caia SEMPRE na COLETA e gere o RECIBO,
// mesmo que a sessão tenha sido resetada/derivada — e impede que um link de pagamento
// seja reenviado no lugar dos textos pós-venda.
async function lerAguardandoDados(sid) {
  try {
    const k = sid.replace(/[^a-zA-Z0-9]/g,'_');
    const r = await fetch(fbUrl(`/vitaflow_aguardando_dados/${k}.json`));
    const d = await r.json();
    return d || null;
  } catch { return null; }
}
async function deleteAguardandoDados(sid) {
  try {
    const k = sid.replace(/[^a-zA-Z0-9]/g,'_');
    await fetch(fbUrl(`/vitaflow_aguardando_dados/${k}.json`), { method:'DELETE' });
  } catch {}
}
// LOCK ATÔMICO (CAS via ETag do Firebase RTDB). Quando o BotConversa entrega a MESMA mensagem
// 2x AO MESMO TEMPO (webhook duplicado), as duas execuções disputam este lock: só UMA ganha
// (true) e segue; a outra perde (false) e é descartada. É isso que mata o LINK e o Telegram
// duplicados na confirmação. FAIL-OPEN: se a mecânica do lock falhar por qualquer motivo,
// retorna true — NUNCA bloqueia um pedido real (no pior caso, volta ao comportamento antigo).
async function adquirirLock(nome, ttlMs){
  try {
    const url = fbUrl(`/vitaflow_locks/${String(nome).replace(/[^a-zA-Z0-9_]/g,'_')}.json`);
    const g = await fetchT(url, { method:'GET', headers:{ 'X-Firebase-ETag':'true' } }, 4000);
    const etag = g.headers.get('etag');
    const atual = await g.json();
    if (atual && atual.ts && (Date.now() - atual.ts) < (ttlMs || 45000)) return false; // já há lock vivo
    const p = await fetchT(url, {
      method:'PUT',
      headers: etag ? { 'Content-Type':'application/json', 'if-match': etag } : { 'Content-Type':'application/json' },
      body: JSON.stringify({ ts: Date.now() })
    }, 4000);
    if (p.status === 412) return false; // outro concorrente ganhou a corrida
    return true;                        // ganhou o lock (ou fail-open)
  } catch (e) { return true; }          // fail-open: nunca trava um pedido real
}

// ── ENTREGA 4: Negociação ─────────────────────────────────────────────────────
const NEGOCIACAO_PCT_TOTAL = 5; // teto total (3% Athena + 2% extra). Nunca sobre valor já descontado.
async function lerPending(sid) {
  try {
    const pKey = `pending_${sid.replace(/[^a-zA-Z0-9]/g,'_')}`;
    const r = await fetch(fbUrl(`/vitaflow_pending_orders/${pKey}.json`));
    const d = await r.json();
    return d ? { pKey, ...d } : null;
  } catch { return null; }
}
async function salvarPendingMerge(pKey, patch) {
  try {
    await fetch(fbUrl(`/vitaflow_pending_orders/${pKey}.json`), {
      method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch)
    });
  } catch {}
}

// ── CACHE DAS LEITURAS DA COLEÇÃO DE CUPONS (08/09/2026) ──────────────────────
// lerPromoPrecos() e lerSemDescontoNomes() liam a COLEÇÃO INTEIRA a cada chamada — e o
// contextoPromo() chama lerPromoPrecos() em TODA mensagem que vai pra IA (dispararIA e
// iaSincrona). Com ~250 documentos na coleção, ~200 mensagens de IA no dia já estouravam
// as 50.000 leituras/dia do Firestore. Estourou de verdade em 08/09: a partir daí TODA
// consulta voltava HTTP 429 e o cliente ouvia "Não reconheci INDEPENDENCIA99 como cupom"
// no meio da promoção. O gatilho foi a Stella passar a responder pela IA síncrona (07/09)
// logo depois dos disparos pros leads importados.
// O cache vive no container do Netlify (mesma ideia do catálogo no athena-ia.js): enquanto
// o container estiver quente é UMA leitura a cada 5 min, não uma por mensagem. TTL curto
// pra mudança feita no painel de cupons refletir rápido.
// Em caso de erro (inclusive 429) devolve o último valor bom em vez de null — assim uma
// falha momentânea não faz a Athena esquecer a promoção nem liberar desconto indevido.
const FS_CACHE_TTL_MS = 60 * 1000;   // 60s (era 5 min): mudança na lista reflete quase na hora; o fechamento ainda lê fresco (ver lerSemDescontoNomes(true))
let _fsPromoPVal = null,  _fsPromoPTs = 0;
let _fsSemDescVal = null, _fsSemDescTs = 0;
function _fsCacheVale(ts){ return ts > 0 && (Date.now() - ts) < FS_CACHE_TTL_MS; }

// ── PRODUTOS SEM DESCONTO (bloqueio GLOBAL) ───────────────────────────────────
// Lista única no RTDB: vitaflow_sem_desconto = { produtos:{id:nome}, colecoes:{handle:true} }.
// A Athena casa por NOME (o catálogo dela é "nome|preço" — não tem product_id). As coleções
// marcadas são expandidas para produtos {id,nome} no painel (Gestão de Cupons), então aqui
// basta casar o NOME contra produtos{}. Produto na lista = NENHUM desconto (nem 3% Athena,
// nem cupom, nem promo). Vale-compras NÃO é bloqueado (é crédito do próprio cliente).
async function lerSemDescontoNomes(forcar) {
  if (!forcar && _fsCacheVale(_fsSemDescTs)) return _fsSemDescVal;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/cupons_vitaflow?key=${FIRESTORE_KEY}&pageSize=300`;
    const r = await fetch(url);
    if (!r.ok) { console.log('[FS] sem_desconto HTTP', r.status, '— usando cache anterior'); return _fsSemDescVal; }
    const d = await r.json();
    const docs = (d && d.documents) || [];
    const set = {};
    docs.forEach(doc => {
      const f = doc.fields || {};
      if (!(f._vfTipo && f._vfTipo.stringValue === 'sem_desconto')) return;
      const nm = _normNomeProd(String((f.nome && f.nome.stringValue) || ''));
      if (nm) set[nm] = true;
    });
    _fsSemDescVal = Object.keys(set).length ? set : null;
    _fsSemDescTs = Date.now();
    return _fsSemDescVal;
  } catch { return _fsSemDescVal; }
}
function produtoBloqueado(nome, setNomes) {
  if (!setNomes) return false;
  return !!setNomes[_normNomeProd(String(nome || ''))];
}

// ── PROMOÇÃO DE PREÇO POR QUANTIDADE ──────────────────────────────────────────
// Config: RTDB vitaflow_promo_precos = { <id>: { nome, ativo, agrupado, n, base(cent),
// precoN(cent), produtos:{id:nome} } }. A Athena casa por NOME. Produto de promo NÃO recebe
// 3%/cupom (é "não acumula"): o preço da faixa É o preço final. Retorna array de grupos ativos.
async function lerPromoPrecos(forcar) {
  if (!forcar && _fsCacheVale(_fsPromoPTs)) return _fsPromoPVal;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/cupons_vitaflow?key=${FIRESTORE_KEY}&pageSize=300`;
    const r = await fetch(url);
    if (!r.ok) { console.log('[FS] promo_preco HTTP', r.status, '— usando cache anterior'); return _fsPromoPVal; }
    const d = await r.json();
    const docs = (d && d.documents) || [];
    const grupos = [];
    docs.forEach(doc => {
      const f = doc.fields || {};
      if (!(f._vfTipo && f._vfTipo.stringValue === 'promo_preco')) return;
      if (!(f.ativo && f.ativo.booleanValue)) return;
      const n = f.n ? parseInt(f.n.integerValue || f.n.doubleValue || 0, 10) : 2;
      const base = f.base ? parseInt(f.base.integerValue || f.base.doubleValue || 0, 10) : 0;
      const precoN = f.precoN ? parseInt(f.precoN.integerValue || f.precoN.doubleValue || 0, 10) : 0;
      const agrupado = f.agrupado ? !!f.agrupado.booleanValue : true;
      const nomes = {};
      const nomesOrig = [];
      const arr = (f.pnomes && f.pnomes.arrayValue && f.pnomes.arrayValue.values) ? f.pnomes.arrayValue.values : [];
      arr.forEach(v => { const orig = String(v.stringValue || ''); const nm = _normNomeProd(orig); if (nm) { nomes[nm] = true; nomesOrig.push(orig); } });
      if (Object.keys(nomes).length) grupos.push({ n: n || 2, base: base / 100, precoN: precoN / 100, agrupado, nomes, nomesOrig, titulo: (f.nome && f.nome.stringValue) || 'Promoção' });
    });
    _fsPromoPVal = grupos.length ? grupos : null;
    _fsPromoPTs = Date.now();
    return _fsPromoPVal;
  } catch { return _fsPromoPVal; }
}
// A qual grupo de promo o item pertence (ou null).
function grupoPromoDoItem(nome, promoP) {
  if (!promoP) return null;
  const n = _normNomeProd(String(nome || ''));
  for (let i = 0; i < promoP.length; i++) { if (promoP[i].nomes[n]) return promoP[i]; }
  return null;
}
// Sobrescreve o preço dos itens de promo pela faixa: base (abaixo de n) ou precoN (n+ un).
// agrupado: a contagem soma TODOS os itens do grupo no carrinho (misturar marcas conta).
function aplicarPromoPreco(carrinho, promoP) {
  if (!promoP || !Array.isArray(carrinho)) return;
  promoP.forEach(g => {
    let qtdGrupo = 0;
    carrinho.forEach(i => { if (g.nomes[_normNomeProd(String(i.nome || ''))]) qtdGrupo += (i.qtd || 0); });
    carrinho.forEach(i => {
      if (!g.nomes[_normNomeProd(String(i.nome || ''))]) return;
      const q = g.agrupado ? qtdGrupo : (i.qtd || 0);
      i.preco = (q >= g.n) ? g.precoN : g.base;
    });
  });
}
// Busca UM cupom pelo código, sem varrer a coleção (08/09/2026).
// Antes, cada tentativa de cupom lia a coleção inteira (pageSize=200) — 200 leituras do
// Firestore por cliente que digitasse um código. Agora é um runQuery com filtro: UMA
// leitura. Se o runQuery não achar nada, cai no método antigo — porque o campo `codigo`
// pode estar gravado com outra caixa em algum documento antigo, e a comparação do
// runQuery é sensível a maiúscula/minúscula. Assim a economia é total no caso normal e
// nenhum cupom que funcionava para de funcionar.
// Devolve: {doc} achou | null não existe | 'erro' falha técnica (rede/cota).
async function _buscarCupomDoc(cod) {
  const base = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents`;
  try {
    const body = { structuredQuery: {
      from: [{ collectionId: 'cupons_vitaflow' }],
      where: { fieldFilter: { field: { fieldPath: 'codigo' }, op: 'EQUAL', value: { stringValue: cod } } },
      limit: 1
    } };
    const r = await fetch(`${base}:runQuery?key=${FIRESTORE_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!r.ok) { console.log('[FS] runQuery cupom HTTP', r.status); return 'erro'; }
    const arr = await r.json();
    if (Array.isArray(arr)) {
      for (const linha of arr) {
        if (linha && linha.document && linha.document.name) {
          return { id: linha.document.name.split('/').pop(), fields: linha.document.fields || {} };
        }
      }
    }
  } catch (e) { console.log('[FS] runQuery cupom erro:', e.message); return 'erro'; }
  // Não achou pelo filtro exato → varredura antiga (cobre caixa diferente no banco).
  try {
    const resp = await fetch(`${base}/cupons_vitaflow?key=${FIRESTORE_KEY}&pageSize=300`);
    if (!resp.ok) { console.log('[FS] varredura cupom HTTP', resp.status); return 'erro'; }
    const data = await resp.json();
    const docs = data.documents || [];
    for (const doc of docs) {
      const f = doc.fields || {};
      if ((f.codigo && f.codigo.stringValue || '').toUpperCase() === cod) {
        return { id: doc.name.split('/').pop(), fields: f };
      }
    }
  } catch (e) { console.log('[FS] varredura cupom erro:', e.message); return 'erro'; }
  return null;
}
async function validarCupom(codigo, subtotalProdutos) {
  try {
    const cod = (codigo || '').trim().toUpperCase();
    if (!cod) return { ok:false, motivo:'Código vazio.' };
    const found = await _buscarCupomDoc(cod);
    // Falha técnica (rede, cota do Firestore estourada) NÃO é "cupom inválido". Marcado
    // separado pra Athena poder falar a verdade pro cliente em vez de "não reconheci".
    if (found === 'erro') return { ok:false, erroTecnico:true, motivo:'Erro ao consultar cupom.' };
    if (!found) return { ok:false, motivo:'Cupom inválido ou não encontrado.' };
    const f = found.fields;
    const ativo = f.ativo ? f.ativo.booleanValue : true;
    const tipo = f.tipo ? f.tipo.stringValue : 'pct';
    const valor = parseFloat(f.valor ? (f.valor.doubleValue || f.valor.integerValue || 0) : 0);
    const maxDesc = parseFloat(f.maxDesc ? (f.maxDesc.doubleValue || f.maxDesc.integerValue || 0) : 0);
    const minPed = parseFloat(f.minPedido ? (f.minPedido.doubleValue || f.minPedido.integerValue || 0) : 0);
    const tipoVal = f.tipoVal ? f.tipoVal.stringValue : 'sempre';
    const maxUsos = parseInt(f.maxUsos ? (f.maxUsos.integerValue || 0) : 0);
    const usosAtual = parseInt(f.usosAtual ? (f.usosAtual.integerValue || 0) : 0);
    const expiraStr = f.expira && f.expira.timestampValue ? f.expira.timestampValue : null;
    if (!ativo) return { ok:false, motivo:'Este cupom está inativo.' };
    if (tipoVal === 'prazo' && expiraStr && new Date(expiraStr) < new Date()) return { ok:false, motivo:'Este cupom expirou.' };
    if (tipoVal === 'unico' && usosAtual >= 1) return { ok:false, motivo:'Este cupom já foi utilizado.' };
    // uso único COM prazo: as duas regras juntas. (Faltava aqui — o site já tratava,
    // então pela Athena o cupom valia para sempre e podia ser usado várias vezes.)
    if (tipoVal === 'unico_prazo') {
      if (expiraStr && new Date(expiraStr) < new Date()) return { ok:false, motivo:'Este cupom expirou.' };
      if (usosAtual >= 1) return { ok:false, motivo:'Este cupom já foi utilizado.' };
    }
    if (tipoVal === 'usos' && maxUsos > 0 && usosAtual >= maxUsos) return { ok:false, motivo:'Este cupom atingiu o limite de usos.' };
    if (minPed > 0 && subtotalProdutos < minPed) return { ok:false, motivo:`Pedido mínimo de R$ ${minPed.toFixed(2).replace('.',',')} para este cupom.` };
    let descontoReais = 0;
    if (tipo === 'pct') { descontoReais = subtotalProdutos * (valor/100); if (maxDesc > 0) descontoReais = Math.min(descontoReais, maxDesc); }
    else if (tipo === 'vale') { descontoReais = Math.min(valor, subtotalProdutos); }  // o frete entra depois, no fechamento
    else { descontoReais = Math.min(valor, subtotalProdutos); }
    const descTxt = tipo === 'frete'
      ? (valor === 0 ? 'Frete Grátis' : `R$ ${valor.toFixed(2).replace('.',',')} off no frete`)
      : tipo === 'vale' ? `vale-compras de R$ ${valor.toFixed(2).replace('.',',')}`
      : tipo === 'pct' ? `${valor}% off` : `R$ ${valor.toFixed(2).replace('.',',')} off`;
    // frete grátis: tipo='frete', valor=0 → grátis total; valor>0 → desconto fixo no frete
    const freteGratis = tipo === 'frete' && valor === 0;
    const descontoFrete = tipo === 'frete' ? valor : 0;
    return { ok:true, docId: found.id, descontoReais, descTxt, codigo: cod,
             tipo, pct: valor, maxDesc, valorFixo: valor, freteGratis, descontoFrete,
             valorVale: (tipo === 'vale' ? valor : 0) };
  } catch { return { ok:false, motivo:'Erro ao verificar cupom. Tente novamente.' }; }
}
async function incrementarUsoCupom(docId) {
  if (!docId) return;
  try {
    const getUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/cupons_vitaflow/${docId}?key=${FIRESTORE_KEY}`;
    const docResp = await fetch(getUrl);
    const docData = await docResp.json();
    const usosAnt = parseInt((docData.fields && docData.fields.usosAtual && docData.fields.usosAtual.integerValue) || 0);
    // histórico de usos com data/hora
    const histAnt = (docData.fields && docData.fields.historicoUsos && docData.fields.historicoUsos.arrayValue && docData.fields.historicoUsos.arrayValue.values) || [];
    const novoUso = { mapValue: { fields: {
      tipo: { stringValue: 'uso' },
      data: { stringValue: new Date().toISOString() }
    }}};
    const patchUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/cupons_vitaflow/${docId}?key=${FIRESTORE_KEY}&updateMask.fieldPaths=usosAtual&updateMask.fieldPaths=historicoUsos`;
    await fetch(patchUrl, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fields: {
      usosAtual: { integerValue: usosAnt + 1 },
      historicoUsos: { arrayValue: { values: [...histAnt, novoUso] } }
    }}) });
  } catch {}
}
async function fecharResumoNormal(session, sid, cupomResultado, respond) {
  const carrinho = session.carrinho || [];
  const frete = session.freteSelecionado || {};
  // v87: valor CHEIO do frete escolhido. session.freteSelecionado.valor é regravado com o valor FINAL (0 quando sai grátis),
  // então numa 2ª passada (cupom digitado depois, troca A/B) o valor original só existe em valorCheio.
  const freteCheio = (typeof frete.valorCheio === 'number') ? frete.valorCheio : (frete.valor || 0);
  const _promoP = await lerPromoPrecos(true);      // no FECHAMENTO lê fresco (ignora cache de 60s): mudança na lista vale na hora
  aplicarPromoPreco(carrinho, _promoP);            // sobrescreve o preço dos itens de promo (base/precoN)
  if (_promoP) session.totalProd = carrinho.reduce((s,i)=>s+(i.preco||0)*(i.qtd||0),0);
  let totalProd = session.totalProd || carrinho.reduce((s,i)=>s+i.preco*i.qtd,0);
  const _semDesc = await lerSemDescontoNomes(true); // idem: bloqueio SEMPRE atual no checkout (não pesa na cota — fechamento é raro)
  // v87: total dos produtos a PREÇO CHEIO (sem o preço promocional por quantidade) — é a base do frete grátis automático.
  const _precoCheio = i => { const g = grupoPromoDoItem(i.nome, _promoP); return g ? g.base : (i.preco || 0); };
  const totalCheio = carrinho.reduce((s, i) => s + _precoCheio(i) * (i.qtd || 0), 0);
  // Pedido que já tem o frete grátis automático NÃO precisa de cupom de frete (FRETEZERO): o cupom é ignorado (e não é consumido),
  // senão ele tiraria o cliente da regra nova e esconderia a escolha entre o frete grátis e o desconto.
  let _notaCupomFrete = '';
  if (FRETE_GRATIS_AUTO.ativo && !session.atacado && freteCheio > 0 && totalCheio >= FRETE_GRATIS_AUTO.min
      && cupomResultado && cupomResultado.ok && cupomResultado.tipo === 'frete') {
    _notaCupomFrete = `_O frete grátis já é automático neste pedido — nem precisa do cupom ${cupomResultado.codigo}. 😉_\n`;
    cupomResultado = null;
  }

  // ── DESCONTO (Option B: cada produto leva UM desconto — o MAIOR; nunca soma) ──
  // Candidatos por produto: promo Dia dos Pais (10% se comprado em 2+), cupom, e o benefício
  // Athena de 3%. Cada item fica com o MAIOR que se aplica a ele.
  const _promoAtiva = promoDobroAtiva();
  const _cupomOk = !!(cupomResultado && cupomResultado.ok);
  const _cupomPct = (_cupomOk && cupomResultado.tipo === 'pct') ? (cupomResultado.pct || 0) : 0;
  const _cupomVale = (_cupomOk && cupomResultado.tipo === 'vale') ? (cupomResultado.valorVale || cupomResultado.valorFixo || 0) : 0;
  const _cupomFixo = (_cupomOk && cupomResultado.tipo !== 'pct' && cupomResultado.tipo !== 'frete' && cupomResultado.tipo !== 'vale')
    ? (cupomResultado.valorFixo || cupomResultado.descontoReais || 0) : 0;

  let descPromo = 0;        // soma dos itens em que a PROMO (10%) venceu
  let descCupomAcc = 0;     // soma dos itens em que o CUPOM % venceu
  let descAthenaAcc = 0;    // soma dos itens em que os 3% Athena venceram
  let baseFora = 0;         // subtotal dos itens FORA da promo (base p/ cupom fixo)
  let baseSemana = 0;       // subtotal ELEGÍVEL (fora sem_desconto/promo_preco) — base da Semana do Cliente
  // Nomes dos itens que ficam de fora do desconto — pra Athena EXPLICAR ao cliente em vez
  // de ele achar que o cupom falhou. (Pedido do Thiago, 08/09.)
  const _nomesPromoPreco = [];   // já estão com preço promocional
  const _nomesSemDesc = [];      // na lista global de "sem desconto"
  carrinho.forEach(i => {
    const linha = (i.preco || 0) * (i.qtd || 0);
    if (produtoBloqueado(i.nome, _semDesc)) { _nomesSemDesc.push(i.nome); return; }        // sem desconto: não leva 3%/cupom
    if (grupoPromoDoItem(i.nome, _promoP))  { _nomesPromoPreco.push(i.nome); return; }     // preço de promo: idem
    baseSemana += linha;                                         // elegível p/ Semana do Cliente (varejo, fora bloqueados/promo)
    const ehPromo = _promoAtiva && i && i.qtd >= PROMO_DOBRO.qtdMin;
    if (!ehPromo) baseFora += linha;
    const pPromo = ehPromo ? PROMO_DOBRO.pct : 0;                 // 10 ou 0
    const melhorPct = Math.max(pPromo, _cupomPct, DESCONTO_ATHENA_PCT);
    if (melhorPct === pPromo && pPromo > 0) descPromo += linha * pPromo / 100;
    else if (melhorPct === _cupomPct && _cupomPct > 0) descCupomAcc += linha * _cupomPct / 100;
    else descAthenaAcc += linha * DESCONTO_ATHENA_PCT / 100;
  });

  // Cupom de VALOR FIXO (R$): não compete por produto com a promo — vale só nos itens FORA da promo
  // (os em dobro ficam com os 10%), e ainda assim vale o MAIOR entre ele e os 3% Athena.
  if (_cupomFixo > 0) {
    const descFixo = Math.min(_cupomFixo, baseFora);
    const descAthenaFora = baseFora * DESCONTO_ATHENA_PCT / 100;
    descCupomAcc = 0; descAthenaAcc = 0;
    if (descFixo > descAthenaFora) descCupomAcc = descFixo; else descAthenaAcc = descAthenaFora;
  }

  // teto (maxDesc) do cupom % incide sobre a parcela do cupom, se houver
  if (_cupomPct > 0 && cupomResultado.maxDesc > 0 && descCupomAcc > cupomResultado.maxDesc) {
    descCupomAcc = cupomResultado.maxDesc;
  }

  // parcela "normal" = cupom OU 3% Athena (nunca as duas por item)
  let descNormais, labelNormais, cupomDocId = null, cupomCodigo = null;
  if (descCupomAcc > 0) {
    descNormais = descCupomAcc;
    labelNormais = `Cupom ${cupomResultado.codigo} (${cupomResultado.descTxt})`;
    cupomDocId = cupomResultado.docId;
    cupomCodigo = cupomResultado.codigo;
  } else {
    descNormais = descAthenaAcc;
    labelNormais = `Desconto Athena (-${DESCONTO_ATHENA_PCT}%)`;
  }

  // Frete grátis via cupom
  let freteValorFinal = freteCheio;
  let linhaFreteGratis = '';
  if (cupomResultado && cupomResultado.ok && cupomResultado.tipo === 'frete') {
    if (cupomResultado.freteGratis) {
      freteValorFinal = 0;
      linhaFreteGratis = `🚚 *Frete GRÁTIS* — Cupom ${cupomResultado.codigo} aplicado! 🎉
`;
      cupomDocId = cupomResultado.docId;
      cupomCodigo = cupomResultado.codigo;
    } else if (cupomResultado.descontoFrete > 0) {
      freteValorFinal = Math.max(0, freteValorFinal - cupomResultado.descontoFrete);
      linhaFreteGratis = `🚚 *Desconto no frete* — Cupom ${cupomResultado.codigo}: -R$ ${cupomResultado.descontoFrete.toFixed(2).replace('.',',')}
`;
      cupomDocId = cupomResultado.docId;
      cupomCodigo = cupomResultado.codigo;
    }
    // v76 (Thiago, 27/09): cupom de FRETE NÃO acumula com os 3% da Athena — vale o MAIOR pro cliente:
    // ou o desconto no frete, ou os 3% nos produtos. Nunca os dois.
    if (linhaFreteGratis && descAthenaAcc > 0 && descCupomAcc === 0) {
      const _ganhoFrete = Math.max(0, freteCheio - freteValorFinal);
      if (_ganhoFrete >= descAthenaAcc) {
        descNormais = 0; labelNormais = ''; descAthenaAcc = 0;
        linhaFreteGratis += `_(Neste pedido o frete grátis é o maior benefício pra você — apliquei ele no lugar dos ${DESCONTO_ATHENA_PCT}% da Athena. Não acumulam.)_
`;
      } else {
        freteValorFinal = freteCheio; linhaFreteGratis = '';
        cupomDocId = null; cupomCodigo = null;   // o cupom não foi usado: não consome
        linhaFreteGratis = `_(Os ${DESCONTO_ATHENA_PCT}% da Athena valem mais que o cupom ${cupomResultado.codigo} neste pedido — mantive os ${DESCONTO_ATHENA_PCT}%, que é o melhor pra você. Não acumulam.)_
`;
      }
    }
  }

  // ── v87: FRETE GRÁTIS AUTOMÁTICO (varejo, pedido a partir de R$ 1.000 em produtos a preço cheio, qualquer modalidade, sem cupom) ──
  // NÃO acumula: ou o frete grátis, ou os outros benefícios (3% Athena, cupom, Semana do Cliente, preço promocional).
  // Havendo os dois, o resumo mostra as DUAS opções com o valor de cada uma e o cliente escolhe (A/B) — já sai marcada a maior.
  // Exceção: vale-compras (é dinheiro) funciona JUNTO com o frete grátis. Cupom de frete (FRETEZERO) segue a regra antiga (v76).
  let fgModo = '', fgTemEscolha = false, fgLinhaOpcoes = '', fgEscolhaSalvar = '';
  const _cupomFreteOk = !!(_cupomOk && cupomResultado.tipo === 'frete');
  if (FRETE_GRATIS_AUTO.ativo && !session.atacado && !_cupomFreteOk && freteCheio > 0 && totalCheio >= FRETE_GRATIS_AUTO.min) {
    const _descSemanaPrev = (_cupomVale === 0) ? descontoSemanaCliente(baseSemana) : 0;
    const _semanaGanha = _descSemanaPrev > (descNormais + descPromo);
    const _descProdOutros = (_cupomVale > 0) ? 0 : Math.max(descNormais + descPromo, _descSemanaPrev);   // com vale, os outros já não valem
    const _ecoPromoPreco = Math.max(0, totalCheio - totalProd);
    const _ecoOutros = _ecoPromoPreco + _descProdOutros;
    if (_ecoOutros < 0.005) {
      fgModo = 'frete';
    } else {
      fgTemEscolha = true;
      const _codAgora = _cupomOk ? String(cupomResultado.codigo || '') : '';
      const _codAntes = (session.cupomUlt && session.cupomUlt.codigo) ? String(session.cupomUlt.codigo) : '';
      const _esc = (_codAgora === _codAntes) ? session.fgEscolha : '';        // cupom novo: volta a marcar sozinho o maior
      const _escolheu = (_esc === 'frete' || _esc === 'desconto');
      fgModo = _escolheu ? _esc : (freteCheio >= _ecoOutros ? 'frete' : 'desconto');
      fgEscolhaSalvar = _escolheu ? _esc : '';
      const _m = v => `R$ ${v.toFixed(2).replace('.',',')}`;
      const _totA = Math.max(0, totalCheio - Math.min(_cupomVale, totalCheio));
      const _totB = Math.max(0, totalProd - _descProdOutros + freteCheio - Math.min(_cupomVale, totalProd + freteCheio));
      const _rot = [];
      if (_descProdOutros > 0) _rot.push(_semanaGanha ? 'Semana do Cliente' : (labelNormais || 'Desconto'));
      if (_ecoPromoPreco > 0) _rot.push('Preço promocional');
      fgLinhaOpcoes =
        `\n\n🎁 *Seu pedido tem 2 benefícios — você escolhe* _(não acumulam)_:\n` +
        `*A)* 🚚 Frete grátis — economiza ${_m(freteCheio)} → total *${_m(_totA)}*${fgModo === 'frete' ? ' ✅' : ''}\n` +
        `*B)* 🏷️ ${_rot.join(' + ')} — economiza ${_m(_ecoOutros)} → total *${_m(_totB)}*${fgModo === 'desconto' ? ' ✅' : ''}\n` +
        (_escolheu ? `_Apliquei a opção que você escolheu (✅).` : `_Já deixei marcada a que mais economiza pra você (✅).`) +
        ` Pra trocar, digite *${fgModo === 'frete' ? 'B' : 'A'}*._` +
        `\n_🛡️ O seguro grátis vale nas duas opções, desde que o envio seja por Transportadora (PAC e SEDEX não têm seguro)._`;
    }
    if (fgModo === 'frete') {
      // ficou com o frete grátis: produtos a PREÇO CHEIO, sem 3%/cupom/faixa/promo, e o cupom digitado NÃO é consumido.
      carrinho.forEach(i => { const g = grupoPromoDoItem(i.nome, _promoP); if (g) i.preco = g.base; });
      totalProd = totalCheio;
      descNormais = 0; descPromo = 0; descCupomAcc = 0; descAthenaAcc = 0; labelNormais = ''; baseSemana = 0;
      cupomDocId = null; cupomCodigo = null;
      freteValorFinal = 0;
      linhaFreteGratis = `🎉 *Frete grátis automático* — pedido a partir de R$ ${reais(FRETE_GRATIS_AUTO.min)}, sem cupom.\n` +
        (/transp/i.test(String(frete.label || ''))
          ? `🛡️ _O seguro grátis contra apreensão e extravio continua valendo com o frete grátis._\n`
          : `⚠️ _O frete grátis não muda o seguro: PAC e SEDEX (Correios) não têm o seguro grátis — ele vale só na Transportadora, que também sai com frete grátis._\n`);
    }
  }

  // ── VALE-COMPRAS: abate PRODUTOS + FRETE, até o valor do vale. ──
  // Sem troco: gastou menos que o vale, perde a diferença; gastou mais, paga o resto.
  // Não acumula com nada (nem os 3% Athena, nem promo) — o vale já é o benefício.
  let valeAbatido = 0, linhaVale = '';
  if (_cupomVale > 0) {
    const baseVale = totalProd + freteValorFinal;          // produto + frete
    valeAbatido = Math.min(_cupomVale, baseVale);
    descNormais = 0; descPromo = 0; labelNormais = '';     // o vale substitui os outros
    cupomDocId = cupomResultado.docId;
    cupomCodigo = cupomResultado.codigo;
    const sobra = _cupomVale - valeAbatido;
    linhaVale = `🎟️ *Vale-compras ${cupomResultado.codigo}:* -R$ ${valeAbatido.toFixed(2).replace('.',',')}\n`;
    if (sobra > 0) {
      linhaVale += `_Seu vale é de R$ ${_cupomVale.toFixed(2).replace('.',',')} e o pedido deu R$ ${baseVale.toFixed(2).replace('.',',')} — a diferença de R$ ${sobra.toFixed(2).replace('.',',')} não volta como troco (uso único). Se quiser, adicione mais produtos pra aproveitar tudo. 😉_\n`;
    }
  }

  // descPromo já foi calculado acima (parcela dos itens em que a promo Dia dos Pais venceu).
  // ── SEMANA DO CLIENTE: desconto por FAIXA do valor de produtos (varejo). Não acumula — vale o
  //    MAIOR entre a faixa e o que já apliquei (3%/cupom/promo). Vale-compras e atacado não entram.
  let semanaVenceu = false, descSemana = 0;
  if (_cupomVale === 0) {
    descSemana = descontoSemanaCliente(baseSemana);
    if (descSemana > (descNormais + descPromo)) {
      semanaVenceu = true;
      descNormais = descSemana; labelNormais = 'Semana do Cliente 🧡';
      descPromo = 0; descCupomAcc = 0;
      cupomDocId = null; cupomCodigo = null;   // a faixa venceu: não consome o cupom digitado
    }
  }
  const descontoReais = descNormais;
  const totalComDesconto = Math.max(0, totalProd - descontoReais - descPromo + freteValorFinal - valeAbatido);
  // Vale cobre 100% do pedido: o gateway não emite link de R$ 0. O pedido é fechado
  // direto, sem link — mesma regra do site (capture_method 'vale_integral').
  if (_cupomVale > 0 && totalComDesconto < 1) {
    session.valeIntegral = true;
    session.valeCodigo = cupomResultado.codigo;
    session.valeDocId = cupomResultado.docId;
    return respond(
      `🎟️ *Seu vale-compras de R$ ${_cupomVale.toFixed(2).replace('.',',')} cobre o pedido inteiro!*\n\n` +
      `${resumoCarrinho(carrinho)}\n` +
      `🚚 ${frete.label || 'Frete'}: R$ ${(freteValorFinal).toFixed(2).replace('.',',')}\n` +
      `💰 Total: R$ ${(totalProd + freteValorFinal).toFixed(2).replace('.',',')}\n\n` +
      `💰 *Total a pagar: R$ 0,00* — não precisa pagar nada! 🎉\n\n` +
      `Digite *confirmar* que eu finalizo seu pedido agora mesmo.\n\n` +
      `_Ou digite *menu* se quiser adicionar mais produtos e aproveitar melhor o vale._`
    );
  }

  let linhasDesc = linhaVale;
  if (descNormais > 0) {
    linhasDesc += `🏷️ ${labelNormais}: -R$ ${descNormais.toFixed(2).replace('.',',')}\n`;
  }
  if (descPromo > 0) {
    linhasDesc += `🎁 Promo Dia dos Pais (compre 2): -R$ ${descPromo.toFixed(2).replace('.',',')}\n`;
  }
  const linhaCupomInfo = (fgModo !== 'frete' && _cupomPct > 0 && descCupomAcc === 0 && !_nomesPromoPreco.length && !_nomesSemDesc.length)
    ? `\n_(Seu cupom não superou o desconto que já apliquei — usei sempre o melhor pra você 😉)_` : '';
  // Explica, com o NOME do produto, por que o cupom não entrou nele. Só aparece quando o
  // cliente realmente informou um cupom — senão viraria ruído no resumo de quem nem usou.
  let linhaCupomNaoPega = '';
  if (fgModo !== 'frete' && _cupomOk && (_nomesPromoPreco.length || _nomesSemDesc.length)) {
    const _lista = (arr) => arr.map(x => `*${x}*`).join(', ');
    if (_nomesPromoPreco.length) {
      linhaCupomNaoPega += _nomesPromoPreco.length === 1
        ? `\n\n🏷️ _O ${_lista(_nomesPromoPreco)} já está com o *preço promocional* — nele o cupom não é necessário, o desconto já está no preço._`
        : `\n\n🏷️ _Os itens ${_lista(_nomesPromoPreco)} já estão com o *preço promocional* — neles o cupom não é necessário, o desconto já está no preço._`;
    }
    if (_nomesSemDesc.length) {
      linhaCupomNaoPega += _nomesSemDesc.length === 1
        ? `\n\n🏷️ _O ${_lista(_nomesSemDesc)} já está com o *preço fechado promocional* e não acumula cupom — o melhor valor já está aplicado. 😉_`
        : `\n\n🏷️ _Os itens ${_lista(_nomesSemDesc)} já estão com o *preço fechado promocional* e não acumulam cupom — o melhor valor já está aplicado. 😉_`;
    }
    // Só promete "nos outros itens" se REALMENTE existir outro item no carrinho.
    const _sobraram = carrinho.length - _nomesPromoPreco.length - _nomesSemDesc.length;
    if (_sobraram > 0) {
      linhaCupomNaoPega += _sobraram === 1
        ? `\n_No outro item do seu pedido o desconto foi aplicado normalmente._`
        : `\n_Nos outros itens do seu pedido o desconto foi aplicado normalmente._`;
    }
  }
  const linhaConviteCupom = (!cupomDocId && totalProd > 0 && !(fgModo === 'frete' && _cupomOk))
    ? `\n\n🏷️ *TEM UM CUPOM DE DESCONTO?*\nÉ *AGORA*: digite o *código do cupom* antes de confirmar. 👇` : '';
  // Promo Gênesis: mostra o brinde (3º grátis) já escolhido no resumo
  const linhaBrinde = session.brinde
    ? `🎁 *Brinde (3º grátis — Gênesis):* ${session.brinde}\n` : '';

  let linhaPromoPreco = '';
  if (_promoP && fgModo !== 'frete') {
    _promoP.forEach(g => {
      let q = 0;
      carrinho.forEach(i => { if (g.nomes[_normNomeProd(String(i.nome || ''))]) q += (i.qtd || 0); });
      if (q <= 0) return;
      if (q >= g.n) {
        const eco = (g.base - g.precoN) * q;
        linhaPromoPreco += `\n\n🎉🔥 *PROMOÇÃO ATIVADA!* 🔥🎉\nVocê levou *${q}* e cada um saiu por *R$ ${g.precoN.toFixed(2).replace('.',',')}* (em vez de R$ ${g.base.toFixed(2).replace('.',',')})!\n💚 *Você economizou R$ ${eco.toFixed(2).replace('.',',')}!*`;
      } else {
        const faltam = g.n - q;
        linhaPromoPreco += `\n\n💡 _Falta pouco! Leve mais *${faltam}* e cada um sai por *R$ ${g.precoN.toFixed(2).replace('.',',')}* (em vez de R$ ${g.base.toFixed(2).replace('.',',')}) — promoção ativa a partir de ${g.n} unidades._`;
      }
    });
  }
  // Empurrãozinho da Semana do Cliente: celebra a faixa ganha ou mostra quanto falta pra próxima.
  let linhaSemana = '';
  if (semanaClienteAtiva() && baseSemana > 0) {
    const _prox = PROMO_SEMANA_CLIENTE.faixas.find(f => f.min > baseSemana && f.desc > descSemana);
    if (semanaVenceu) {
      linhaSemana = `\n\n🧡🎉 *SEMANA DO CLIENTE!* Você ganhou *R$ ${descSemana.toFixed(2).replace('.',',')}* de desconto nos produtos!`;
      if (_prox) linhaSemana += `\n_Falta R$ ${(_prox.min - baseSemana).toFixed(2).replace('.',',')} pra subir pra *R$ ${_prox.desc} OFF*! 😉_`;
    } else if (_prox) {
      linhaSemana = `\n\n🧡 _*Semana do Cliente:* falta R$ ${(_prox.min - baseSemana).toFixed(2).replace('.',',')} em produtos pra ganhar *R$ ${_prox.desc} OFF* automático!_`;
    }
  }
  const resumo =
    `*📋 RESUMO DO PEDIDO*\n\n${resumoCarrinho(carrinho)}${linhaPromoPreco}\n\n` +
    `    Subtotal: R$ ${totalProd.toFixed(2).replace('.',',')}\n\n` +
    (freteValorFinal > 0
      ? `🚚 Frete *${frete.label}* — ${session.estadoCliente}: R$ ${freteValorFinal.toFixed(2).replace('.',',')}\n`
      : `🚚 Frete *${frete.label}* — ${session.estadoCliente}: ~~R$ ${freteCheio.toFixed(2).replace('.',',')}~~ *GRÁTIS* 🎉\n`) +
    linhaFreteGratis + _notaCupomFrete + linhaBrinde +
    linhasDesc + linhaCupomInfo +
    `\n💰 *Total: R$ ${totalComDesconto.toFixed(2).replace('.',',')}*` + linhaCupomNaoPega + linhaSemana + fgLinhaOpcoes +
    `\n\n*Confirma?*\n1️⃣ Sim, quero comprar!\n2️⃣ Não, voltar ao menu\n\n💳 _Quer parcelar? Digite *parcelar* que eu simulo em até 12x no cartão._` +
    linhaConviteCupom;
  const freteParaSalvar = { ...frete, valor: freteValorFinal, valorCheio: freteCheio };
  await saveSession(sid, {
    ...session, state:'CONFIRMAR', simulouParcela: null, freteSelecionado: freteParaSalvar, totalProd,
    descontoReais, descontoPromo: descPromo, descontoLabel: labelNormais,
    total: totalComDesconto,
    descontoTipo: cupomDocId ? 'cupom' : 'athena', cupomDocId, cupomCodigo,
    // v87: guarda a escolha frete grátis x desconto e o cupom validado, pra troca A/B refazer a conta sem perder o cupom
    fgOpcoes: fgTemEscolha, fgModo, fgEscolha: fgEscolhaSalvar, cupomUlt: _cupomOk ? cupomResultado : null
  });
  return respond(resumo);
}
async function buscarCacheObj(colecao) {
  try {
    const r = await fetch(fbUrl(`/vitaflow_cache/colecoes/${colecao}.json`));
    const d = await r.json();
    return d || null;
  } catch { return null; }
}
// v90: coleção parada há mais de 7 dias NÃO entra (a "outros" estava parada desde 21/08/2026: produto e preço velhos).
async function buscarCache(colecao) {
  const d = await buscarCacheObj(colecao);
  if (!d || !d.dados) return '';
  const quando = ciDataMs(d.atualizado_em);
  if (quando && Date.now() - quando > CI_VALIDADE_MS) { console.log('[CACHE] colecao parada ha mais de 7 dias — ignorada:', colecao); return ''; }
  return d.dados;
}
async function buscarTodosCache() {
  const cols = ['peptideos','hormonios','gh','emagrecedores','estetica','farmacia','sarms','10-mais-vendidos'];
  const resultados = await Promise.all(cols.map(c => buscarCache(c)));
  return resultados.join('\n');
}

// BUSCA COM FALLBACK GLOBAL: procura os termos na coleção indicada; se não achar NADA
// (produto catalogado em outra coleção — comum entre os ~800 itens: ex. Clembuterol/T3 ficam
// em "farmacia", não em "hormonios"), procura em TODAS as coleções antes de considerar
// "indisponível". Evita que um produto "suma" só por estar numa coleção diferente da esperada.
async function buscarFiltradoGlobal(colecao, termos) {
  const dados = await buscarCache(colecao);
  let linhas = filtrarCache(dados, termos);
  if (!linhas.length) {
    const tudo = await buscarTodosCache();
    linhas = filtrarCache(tudo, termos);
  }
  return linhas;
}
// Token FORA do codigo (19/09/2026): estava escrito aqui. Quando a env TELEGRAM_TOKEN foi
// preenchida (pro bot do Grupo VIP), o scanner de segredos da Netlify passou a DERRUBAR
// TODO deploy do vitaflow-proxy — "Exposed secrets detected", commit af74c78. Agora vem da env.
async function enviarTelegram(texto) {
  const tk = process.env.TELEGRAM_TOKEN || '';
  if (!tk) return;                       // env vazia: nao avisa, mas nao quebra o fluxo
  try {
    await fetchT('https://api.telegram.org/bot' + tk + '/sendMessage', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chat_id:'8660563352', text: texto })
    }, 4000);
  } catch {}
}
// ── ENVIO DIRETO PELA API DO BOTCONVERSA ──────────────────────────────────────
// Canal INDEPENDENTE da resposta síncrona do webhook. É o MESMO que o GAS usa pra mandar o
// "envie seus dados" (que sempre chega). Usado pra garantir a entrega do RECIBO pós-venda:
// antes, o recibo ia na resposta do webhook e, como o COLETA fazia trabalho pesado (GAS +
// Telegram) ANTES de responder, o webhook estourava timeout e o BotConversa descartava o
// recibo. Enviando por aqui, o recibo chega SEMPRE — independe do timeout.
const BOTCONVERSA_API_KEY = '8c9e69c3-3c9f-4f23-b480-be4a0de29640';
async function botconversaSubId(sid){
  try {
    const fone = String(sid).replace(/\D/g,'');
    const r = await fetchT(`https://backend.botconversa.com.br/api/v1/webhook/subscriber/get_by_phone/${encodeURIComponent(fone)}/`,
      { method:'GET', headers:{ 'api-key': BOTCONVERSA_API_KEY } }, 6000);
    const d = await r.json();
    return d && d.id ? d.id : null;
  } catch (e) { return null; }
}
async function enviarWhatsAppDireto(sid, textos){
  try {
    const sub = await botconversaSubId(sid);
    if (!sub) return false;
    let okPrimeira = false;
    for (let i = 0; i < textos.length; i++){
      const t = textos[i];
      if (!t) continue;
      try {
        await fetchT(`https://backend.botconversa.com.br/api/v1/webhook/subscriber/${sub}/send_message/`,
          { method:'POST', headers:{ 'Content-Type':'application/json', 'api-key': BOTCONVERSA_API_KEY }, body: JSON.stringify({ type:'text', value: t }) }, 8000);
        if (i === 0) okPrimeira = true;
      } catch (e) { if (i === 0) return false; }
    }
    return okPrimeira;
  } catch (e) { return false; }
}
// Responde pelo canal DIRETO (não pela resposta do webhook) e devolve resposta VAZIA. Assim,
// se o BotConversa REENTREGAR a resposta do webhook (o que duplicava o link de pagamento), a
// reentrega mostra NADA — a mensagem real já saiu uma única vez pela API direta. Fallback: se
// o envio direto falhar, cai na resposta síncrona normal.
async function responderDireto(sid, texto, respond, assistente){
  // Na Stella (companhia VitaMK) o envio direto NÃO serve: a BOTCONVERSA_API_KEY é da
  // companhia Athena, então ele acha o contato na Athena e entrega pelo número errado
  // (ou devolve vazio) — o link some na conversa da Stella. Nessa trilha respondemos
  // pela resposta SÍNCRONA do webhook (é como o RESUMO chega e funciona).
  if (assistente && assistente !== 'Athena') return respond(texto);
  const ok = await enviarWhatsAppDireto(sid, [texto]);
  return ok ? respond('') : respond(texto);
}
async function gerarLinkInfinitePay(carrinho, valorFrete, orderNsu, descontoReais) {
  try {
    const subtotalBruto = (carrinho || []).reduce((s,i) => s + i.preco * i.qtd, 0);
    const desc = descontoReais || 0;
    let descRestante = Math.round(desc * 100);
    const arr = carrinho || [];
    const items = arr.map((item, idx) => {
      let precoCent = Math.round(item.preco * 100);
      if (desc > 0 && subtotalBruto > 0) {
        const proporcao = (item.preco * item.qtd) / subtotalBruto;
        const descItemCent = idx === arr.length - 1 ? descRestante : Math.round(desc * 100 * proporcao);
        descRestante -= descItemCent;
        const descUnit = Math.floor(descItemCent / item.qtd);
        precoCent = Math.max(1, precoCent - descUnit);
      }
      return { quantity: item.qtd, price: precoCent, description: 'Suplemento Alimentar' };
    });
    if (valorFrete && valorFrete > 0) items.push({ quantity:1, price: Math.round(valorFrete*100), description: 'Frete' });
    const payload = { handle: INFINITEPAY_TAG, redirect_url: 'https://vitaflowoficial.com/pages/obrigado', webhook_url: GAS_URL, items };
    if (orderNsu) payload.order_nsu = orderNsu;
    const r = await fetchT('https://api.checkout.infinitepay.io/links', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    }, 8000);
    const d = await r.json();
    return d?.url || null;
  } catch { return null; }
}
// ── BRAS PAY (09/10/2026) — PIX NA CONTA NOVA ────────────────────────────────
// O Pix passou para a Bras Pay; a InfinitePay continua com o cartão e como Pix reserva (o link vai junto).
// A chave fica no Netlify (env BRASPAY_API_KEY) — nunca no código. O pagamento é confirmado pelo
// webhook da Bras Pay → função braspay → GAS, no MESMO formato da InfinitePay (order_nsu + capture_method 'pix'),
// então o GAS manda o cliente para COLETA_DADOS igual sempre fez.
// Referência = número do pedido. Pix novo do MESMO pedido (o anterior venceu ou o valor mudou) = "<pedido>~<sufixo>".
const BRASPAY_API = 'https://api.braspay.com.py/api/v1/gateway/cobrancas';
const BRASPAY_FN  = 'https://vitaflow-proxy.netlify.app/.netlify/functions/braspay';
const PIX_VALIDADE_ATHENA_SEG = 86400;   // 24 h
async function gerarPixBraspay(orderNsu, totalReais, novaRef) {
  const key = process.env.BRASPAY_API_KEY || '';
  const valor = Math.round((Number(totalReais) || 0) * 100);
  if (!key || !orderNsu || valor < 100) return null;
  const base = String(orderNsu).split('~')[0];
  async function tentar(ref) {
    const r = await fetchT(BRASPAY_API, {
      method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + key },
      body: JSON.stringify({ meioPagamento:'pix', valorCentavos: valor, referenciaExterna: ref, descricao: 'Pedido ' + base, expiraEmSegundos: PIX_VALIDADE_ATHENA_SEG })
    }, 8000);
    let d = null; try { d = await r.json(); } catch (e) { d = null; }
    return { status: r.status, d: d || {} };
  }
  try {
    let ref = novaRef ? base + '~' + Date.now().toString(36) : base;
    let t = await tentar(ref);
    if (t.status === 409) { ref = base + '~' + Date.now().toString(36); t = await tentar(ref); }
    if ((t.status === 200 || t.status === 201) && t.d.brCode) {
      return { code: String(t.d.brCode), id: t.d.id || '', ref: ref, expiraEm: t.d.expiraEm || '' };
    }
    if (t.d && t.d.erro === 'limite_mensal_excedido') {
      await enviarTelegram(`⚠️ BRAS PAY — limite mensal de Pix atingido. Pedido ${base} foi só com o link da InfinitePay.`);
    }
    return null;
  } catch (e) { return null; }
}
// Pix da sessão ainda válido? Se venceu (ou não existe), gera outro do MESMO pedido. Devolve {pix, mudou}.
async function pixDaSessao(session) {
  if (!session || !session.orderNsu) return { pix: null, mudou: false };
  const exp = session.pixExpira ? Date.parse(session.pixExpira) : 0;
  if (session.pixCode && exp && exp - Date.now() > 10 * 60 * 1000 && session.pixValor === Math.round((session.total || 0) * 100)) {
    return { pix: { code: session.pixCode, ref: session.pixRef, expiraEm: session.pixExpira }, mudou: false };
  }
  const novo = await gerarPixBraspay(session.orderNsu, session.total || 0, !!session.pixRef);
  return { pix: novo, mudou: !!novo };
}
function camposPixSessao(pix, totalReais) {
  if (!pix) return { pixCode: null, pixRef: null, pixExpira: null, pixValor: null };
  return { pixCode: pix.code, pixRef: pix.ref, pixExpira: pix.expiraEm || '', pixValor: Math.round((Number(totalReais) || 0) * 100) };
}
// Texto do bloco de pagamento. `separado` = o código Pix vai numa mensagem só dele (Athena, envio direto).
function blocoPagamento(pix, link, separado) {
  let t = '';
  if (pix) {
    t += `⚡ *PIX (copia e cola)* — ${separado ? 'o código vai na *próxima mensagem*' : 'o código está *logo abaixo*'}. ` +
         `É só copiar e colar no app do seu banco: *Pix → Pix copia e cola*. _(Vale por 24 h.)_\n\n`;
    if (link) t += `💳 *Prefere cartão em até 12x (ou Pix pela InfinitePay)?*\n${link}\n\n${AVISO_RECEBEDOR}\n\n`;
  } else if (link) {
    t += `💳 *Link de pagamento:*\n${link}\n\n${AVISO_RECEBEDOR}\n\n`;
  }
  return t;
}
// Envia vários textos em mensagens separadas (Athena, canal direto). Stella / falha → junta numa só.
// Uma mensagem só (sem Pix) → mantém o comportamento de antes: `diretoSeUma` = envio direto (como o link do pedido), senão resposta normal.
async function responderDiretoMulti(sid, textos, respond, assistente, diretoSeUma) {
  const lista = (textos || []).filter(Boolean);
  if (lista.length < 2) return diretoSeUma ? await responderDireto(sid, lista[0] || '', respond, assistente) : respond(lista[0] || '');
  if (assistente && assistente !== 'Athena') return respond(lista.join('\n\n'));
  const ok = await enviarWhatsAppDireto(sid, lista);
  return ok ? respond('') : respond(lista.join('\n\n'));
}
// Cliente diz que pagou: pergunta à Bras Pay (a função braspay já confirma no GAS se estiver pago).
async function pixJaPago(session) {
  if (!session || !session.pixRef) return false;
  try {
    const r = await fetchT(BRASPAY_FN + '?ref=' + encodeURIComponent(session.pixRef), { method:'GET' }, 9000);
    const d = await r.json();
    return !!(d && d.ok && d.status === 'pago');
  } catch (e) { return false; }
}
// Número de contingência no MESMO formato do GAS (VF-DDMM-AX<HHmm> / atacado VF-DDMM-WX<HHmm>, fuso de São Paulo).
// Usado SÓ quando o GAS não responde — assim a InfinitePay NUNCA carimba um UUID no pedido.
function numeroContingenciaAthena(tipo) {
  const L = tipo === 'W' ? 'W' : 'A';
  try {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone:'America/Sao_Paulo', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).formatToParts(new Date());
    const g = t => (p.find(x => x.type === t) || {}).value || '00';
    return 'VF-' + g('day') + g('month') + '-' + L + 'X' + g('hour') + g('minute');
  } catch (e) {
    return 'VF-0000-' + L + 'X0000';
  }
}
// v79: tipo 'W' = pedido de ATACADO (sessão com atacado:true); 'A' = varejo da Athena.
function tipoNumeroAthena(session) { return (session && session.atacado) ? 'W' : 'A'; }
// v80: 1º a função numero-pedido (mesmo site Netlify): conta direto no Firebase (mesmo contador do GAS, com trava),
// ~0,3 s, sem Apps Script. O GAS fica de reserva. Só aceita número VF com a letra pedida (A ou W).
const NUMERO_PEDIDO_URL = 'https://vitaflow-proxy.netlify.app/.netlify/functions/numero-pedido';
async function gerarNumeroPedido(tipo) {
  const t = tipo === 'W' ? 'W' : 'A';
  const valido = n => new RegExp('^VF-\\d{4}-' + t + 'X?\\d{2,4}$', 'i').test(String(n || '').trim());
  try {
    const r = await fetchT(NUMERO_PEDIDO_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tipo: t }) }, 4000);
    const d = await r.json();
    if (d && d.success && valido(d.order_nsu)) return String(d.order_nsu).trim();
  } catch (e) {}
  try {
    const r = await fetchT(GAS_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'gerar_numero', tipo: t }) }, 6000);
    const d = await r.json();
    if (d && d.order_nsu) return d.order_nsu;
  } catch (e) {}
  // GAS fora/sem resposta → número de contingência no formato VF (nunca deixa virar UUID da InfinitePay)
  return numeroContingenciaAthena(t);
}
async function salvarPedidoGAS(pedido) {
  try {
    await fetch(GAS_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(pedido) });
  } catch {}
}

// Gera o pedido + link de pagamento (extraído do CONFIRMAR pra ser reusado após a escolha do brinde).
// Se houver session.brinde (promo Gênesis), grava o brinde vinculado ao pedido pra virar Observação.
// ── RESUMO DO PEDIDO (varejo): mostra o resumo (promo ou normal) e coloca em CONFIRMAR.
// Chamado após o frete + a pergunta de observação.
async function mostrarResumoPedido(session, sid, respond) {
  const carrinho = session.carrinho || [];
  const frete = session.freteSelecionado || {};
  const totalProd = (typeof session.totalProd === 'number') ? session.totalProd : totalCarrinho(carrinho);
  if (session.fluxoPromo) {
    const descPct = session.descontoPromoPct || 0;
    const descValor = totalProd * (descPct / 100);
    const totalComDesconto = totalProd - descValor + frete.valor;
    const resumo =
      `*📋 RESUMO DO PEDIDO*\n\n${resumoCarrinho(carrinho)}\n\n` +
      `    Subtotal: R$ ${totalProd.toFixed(2).replace('.',',')}\n\n` +
      `🚚 Frete *${frete.label}* — ${session.estadoCliente}: R$ ${frete.valor.toFixed(2).replace('.',',')}\n` +
      `🔥 *${session.promoTitulo||'Promoção Relâmpago'}* — preços promocionais já aplicados` +
      (descPct ? `\n🏷️ Desconto extra (-${descPct}%): -R$ ${descValor.toFixed(2).replace('.',',')}` : '') +
      `\n\n💰 *Total: R$ ${totalComDesconto.toFixed(2).replace('.',',')}*\n\n*Confirma?*\n1️⃣ Sim, quero comprar!\n2️⃣ Não, voltar ao menu\n\n💳 _Quer parcelar? Digite *parcelar* que eu simulo em até 12x no cartão._`;
    await saveSession(sid, { ...session, state:'CONFIRMAR', simulouParcela: null, freteSelecionado: frete, totalProd, descontoReais: descValor, total: totalComDesconto, descontoTipo:'promo' });
    return respond(resumo);
  }
  return await fecharResumoNormal({ ...session, freteSelecionado: frete, totalProd }, sid, null, respond);
}
// ── RESUMO DO PEDIDO (atacado): mostra o resumo e coloca em ATK_CONFIRMAR. Chamado após a pergunta de observação.
async function mostrarResumoAtacado(session, sid, respond) {
  const cart = session.carrinhoAtk || [];
  const sub = totalCarrinho(cart);
  await saveSession(sid, { ...session, state:'ATK_CONFIRMAR' });
  return respond(`*📋 RESUMO DO PEDIDO — ATACADO*\n\n${resumoCarrinho(cart)}\n\n    Subtotal: R$ ${sub.toFixed(2).replace('.', ',')}\n🚚 Frete: *GRÁTIS* 🎉\n\n💰 *Total: R$ ${sub.toFixed(2).replace('.', ',')}*\n\n*Confirma?*\n1️⃣ Sim, gerar o link de pagamento\n2️⃣ Não, voltar`);
}
// Fecha o pedido de ATACADO direto, sem passar pelo resumo/observação. Usado quando o
// cliente responde ao convite de 3h com uma palavra de intenção (_ehQueroFechar): ele já
// viu o carrinho, então pedir pra confirmar de novo só atrasa a venda.
async function fecharAtacadoDireto(session, sid, respond, assistente) {
  const cart = session.carrinhoAtk || [];
  const sub = totalCarrinho(cart);
  const sessAtk = { ...session, carrinho: cart, freteSelecionado: { label: 'Grátis (atacado)', valor: 0 },
    estadoCliente: '', descontoReais: 0, descontoLabel: '', descontoTipo: 'atacado', total: sub,
    cupomDocId: null, cupomCodigo: null, brinde: null, atacado: true, carrinhoAtk: [] };
  return await gerarLinkPedido(sessAtk, sid, respond, assistente);
}
// Depois da observação, volta pro resumo certo (varejo ou atacado) conforme obsReturn.
async function _seguirAposObs(session, sid, respond) {
  if (session.obsReturn === 'atacado') return await mostrarResumoAtacado(session, sid, respond);
  return await mostrarResumoPedido(session, sid, respond);
}
async function gerarLinkPedido(session, sid, respond, assistente) {
  const carrinho = session.carrinho || [];
  const frete = session.freteSelecionado || {};
  const uf    = session.estadoCliente || '';
  const descontoReais = session.descontoReais || 0;
  const descontoPromo = session.descontoPromo || 0;
  const totalFinal = session.total;
  let infoDesconto = '';
  if (descontoReais > 0 || descontoPromo > 0) {
    const lbl = session.descontoLabel || (session.descontoTipo === 'promo' ? (session.promoTitulo||'Promoção') : 'Desconto');
    if (descontoReais > 0) infoDesconto += `\n🏷️ ${lbl}: -R$ ${descontoReais.toFixed(2).replace('.',',')}`;
    if (descontoPromo > 0) infoDesconto += `\n🎁 Promo Dia dos Pais (compre 2): -R$ ${descontoPromo.toFixed(2).replace('.',',')}`;
    infoDesconto += `\n💰 *Total: R$ ${totalFinal.toFixed(2).replace('.',',')}*`;
  }
  const orderNsu = await gerarNumeroPedido(tipoNumeroAthena(session));
  // Promo Gênesis: grava o brinde vinculado ao número do pedido → vira Observação no registro.
  if (session.brinde && orderNsu) {
    try {
      const bKey = String(orderNsu).replace(/[^a-zA-Z0-9]/g,'_');
      await fetch(fbUrl(`/vitaflow_brindes/${bKey}.json`), {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ brinde: session.brinde, order_nsu: orderNsu, ts: Date.now() })
      });
    } catch {}
  }
  // Observação do cliente: grava durável vinculada ao pedido (mesmo padrão do brinde) pra sobreviver até o registro pós-pagamento.
  if (session.obsCliente && orderNsu) {
    try {
      const oKey = String(orderNsu).replace(/[^a-zA-Z0-9]/g,'_');
      await fetch(fbUrl(`/vitaflow_obs_cliente/${oKey}.json`), {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ obs: session.obsCliente, order_nsu: orderNsu, ts: Date.now() })
      });
    } catch {}
  }
  // 09/10/2026: Pix na Bras Pay + link da InfinitePay (cartão / Pix reserva), gerados ao mesmo tempo.
  const [link, pix] = await Promise.all([
    gerarLinkInfinitePay(carrinho, frete.valor, orderNsu, descontoReais + descontoPromo),
    gerarPixBraspay(orderNsu, totalFinal, false)
  ]);
  try {
    const pKey = `pending_${sid.replace(/[^a-zA-Z0-9]/g,'_')}`;
    await fetch(fbUrl(`/vitaflow_pending_orders/${pKey}.json`), {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        phone: sid, order_nsu: orderNsu,
        produto: carrinho.map(i => `${i.nome} x${i.qtd}`).join(' | '),
        quantidade: carrinho.reduce((a,i)=>a+i.qtd,0),
        frete: frete.label, estado: uf, valor: totalFinal, ts: Date.now(),
        carrinho: carrinho, freteSelecionado: frete, estadoCliente: uf, total: totalFinal,
        descontoReais: descontoReais, descontoPromo: descontoPromo, descontoLabel: session.descontoLabel || '',
        descontoTipo: session.descontoTipo || '', cupomDocId: session.cupomDocId || null,
        cupomCodigo: session.cupomCodigo || null, link: link || '', brinde: session.brinde || null,
        pix: pix ? pix.code : '', pix_ref: pix ? pix.ref : '',
        observacao: session.obsCliente || '',
        atacado: !!session.atacado   // o GAS usa isso pra escolher o texto do lembrete (3h/20h)
      })
    });
  } catch {}
  const itensTxt = carrinho.map(i => `🛒 ${i.nome} x${i.qtd}`).join('\n');
  await enviarTelegram(`🟡 *PEDIDO EM ABERTO (Athena)*\n\n📦 ${orderNsu || '—'}\n${itensTxt}${session.brinde ? `\n🎁 Brinde (3º grátis): ${session.brinde}` : ''}${session.obsCliente ? `\n📝 Obs: ${session.obsCliente}` : ''}\n🚚 ${frete.label} — ${uf}\n💰 R$ ${totalFinal.toFixed(2).replace('.',',')}\n📱 ${sid}\n💳 ${pix ? 'Pix Bras Pay + link InfinitePay' : 'Só link InfinitePay (Pix Bras Pay não gerou)'}\n\n⏳ Link gerado. Aguardando pagamento/confirmação do cliente.`);
  try {
    await fetch(GAS_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action: 'alerta_pedido_aberto', order_nsu: orderNsu,
        produto: carrinho.map(i => `${i.nome} x${i.qtd}`).join(' | '),
        quantidade: carrinho.reduce((a,i)=>a+i.qtd,0), frete: frete.label, estado: uf,
        valor: totalFinal.toFixed(2).replace('.',','), phone: sid })
    });
  } catch {}
  await saveSession(sid, { ...session, state:'AGUARDAR_COMPROVANTE', total: totalFinal, orderNsu, link: link || '', ...camposPixSessao(pix, totalFinal), cupomDocId: session.cupomDocId || null, cupomCodigo: session.cupomCodigo || null, brinde: session.brinde || null });
  if (!link && !pix) return await responderDireto(sid, `Acesse vitaflowoficial.com para finalizar seu pedido.`, respond, assistente);
  const separado = !(assistente && assistente !== 'Athena');
  const principal =
    `✅ *Pedido gerado!*${infoDesconto}${session.atacado ? '\n\n' + AVISO_ATACADO_MOMENTO : ''}\n\n` +
    blocoPagamento(pix, link, separado) +
    (pix ? '' : `_No link você paga *à vista no Pix (sem juros)* ou *parcela em até 12x* no cartão — é só escolher lá. (Quer ver os valores das parcelas antes? Digite *parcelar*.)_\n\n`) +
    `_Assim que você concluir o pagamento, *eu confirmo automaticamente aqui* — não precisa enviar comprovante nem avisar._ 😊\n\nEm seguida eu já te chamo pra pegar os dados de envio. 🚀`;
  return await responderDiretoMulti(sid, [principal, pix ? pix.code : ''], respond, assistente, true);
}
// Leitor determinístico de reserva — funciona mesmo se a IA falhar.
// Detecta CPF (11 dígitos), CEP (8 dígitos / 00000-000), telefone (10-11 díg.), email,
// estado (sigla UF) e mapeia as linhas de texto restantes para nome/endereço/bairro/cidade.
const _UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const _UF_NOME = {
  acre:'AC', alagoas:'AL', amapa:'AP', amazonas:'AM', bahia:'BA', ceara:'CE', 'distrito federal':'DF',
  'espirito santo':'ES', goias:'GO', maranhao:'MA', 'mato grosso':'MT', 'mato grosso do sul':'MS',
  'minas gerais':'MG', para:'PA', paraiba:'PB', parana:'PR', pernambuco:'PE', piaui:'PI',
  'rio de janeiro':'RJ', 'rio grande do norte':'RN', 'rio grande do sul':'RS', rondonia:'RO',
  roraima:'RR', 'santa catarina':'SC', 'sao paulo':'SP', sergipe:'SE', tocantins:'TO'
};
function extrairDadosRegex(texto, meta) {
  const out = {};
  // v91: `meta` (opcional) diz DE ONDE veio cada dado: meta.rotulo[campo] = linha com rótulo; meta.tipo[campo] = reconhecido pelo formato.
  if (meta) { meta.rotulo = meta.rotulo || {}; meta.tipo = meta.tipo || {}; }
  if (!texto) return out;
  const original = String(texto);

  // ── ETAPA 1: extração por RÓTULOS (formato que a própria Athena pede) ──────
  // Mapeia variações de rótulo para o campo. Cada linha "Rótulo: valor" é casada aqui.
  const ROTULOS = [
    { campo:'nome',        re:/^\s*nome\s*(completo)?\s*[:\-]\s*(.+)$/i },
    { campo:'cpf',         re:/^\s*(cpf|documento|doc)\s*[:\-]\s*(.+)$/i },
    { campo:'telefone',    re:/^\s*(telefone|tel|celular|cel|whats|whatsapp|fone)\s*[:\-]\s*(.+)$/i },
    { campo:'email',       re:/^\s*(email|e-mail|e mail)\s*[:\-]\s*(.+)$/i },
    { campo:'endereco',    re:/^\s*(rua e numero|rua e número|endereco|endereço|rua|logradouro|av|avenida)\s*[:\-]\s*(.+)$/i },
    { campo:'complemento', re:/^\s*(complemento|compl|obs|observacao|observação|referencia|referência)\s*[:\-]\s*(.+)$/i },
    { campo:'bairro',      re:/^\s*(bairro)\s*[:\-]\s*(.+)$/i },
    { campo:'cidade',      re:/^\s*(cidade|municipio|município)\s*[:\-]\s*(.+)$/i },
    { campo:'estado',      re:/^\s*(estado|uf)\s*[:\-]\s*(.+)$/i },
    { campo:'cep',         re:/^\s*(cep)\s*[:\-]\s*(.+)$/i },
  ];
  const linhasOrig = original.split(/\r?\n/);
  const linhasSemRotulo = [];
  for (const linha of linhasOrig) {
    let casou = false;
    for (const r of ROTULOS) {
      const m = linha.match(r.re);
      if (m) {
        const valor = (m[m.length - 1] || '').trim();
        // só preenche se houver valor real depois do rótulo e o campo ainda não foi pego
        if (valor && valor.replace(/[\s:.-]/g,'').length >= 1 && !out[r.campo]) {
          if (r.campo === 'cpf')        out.cpf = valor.replace(/\D/g,'') || valor.trim();
          else if (r.campo === 'cep')   out.cep = valor.replace(/\D/g,'') || valor.trim();
          else if (r.campo === 'telefone') out.telefone = _telLimpo(valor) || valor.replace(/\D/g,'') || valor.trim();
          else if (r.campo === 'email') out.email = valor.toLowerCase();
          else if (r.campo === 'estado') {
            const nn = norm(valor).replace(/[^a-z ]/g,'').trim();
            if (_UF_NOME[nn]) out.estado = _UF_NOME[nn];
            else { const up = valor.toUpperCase().replace(/[^A-Z]/g,'').slice(0,2); if (up.length===2 && _UFS.includes(up)) out.estado = up; else out.estado = valor.trim(); }
          }
          else out[r.campo] = valor;
          if (meta && out[r.campo]) meta.rotulo[r.campo] = true;
        }
        casou = true;
        break;
      }
    }
    if (!casou) linhasSemRotulo.push(linha);
  }
  // sanitiza valores que ainda têm dígitos onde não deveriam (cpf/tel/cep só números)
  if (out.cpf && /\D/.test(out.cpf))  out.cpf = out.cpf.replace(/\D/g,'') || out.cpf;
  if (out.cep && /\D/.test(out.cep))  out.cep = out.cep.replace(/\D/g,'') || out.cep;
  if (out.telefone && /\D/.test(out.telefone)) out.telefone = out.telefone.replace(/\D/g,'') || out.telefone;

  // ── ETAPA 2: heurística no que SOBROU (texto sem rótulos) ──────────────────
  let resto = linhasSemRotulo.join('\n');

  // email
  if (!out.email) { const mEmail = resto.match(/[\w.+-]+@[\w-]+\.[\w.-]+/); if (mEmail) { out.email = mEmail[0].toLowerCase(); resto = resto.replace(mEmail[0], ' '); if (meta) meta.tipo.email = true; } }

  // CEP (00000-000 ou 8 dígitos)
  if (!out.cep) { const mCep = resto.match(/\b\d{5}-?\d{3}\b/); if (mCep) { out.cep = mCep[0].replace(/\D/g,''); resto = resto.replace(mCep[0], ' '); if (meta) meta.tipo.cep = true; } }

  // v91 — CPF e TELEFONE sem rótulo, decididos pelo FORMATO e pelos dígitos verificadores do CPF.
  // (Antes, QUALQUER número de 11 dígitos virava CPF: o celular mandado sozinho era lido como CPF e descartado.)
  if (!out.cpf || !out.telefone) {
    const cCpf = [], cTel = [];
    // CPF com máscara: 000.000.000-00, 000 000 000 00, 000000000-00
    resto = resto.replace(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}\s?[-–.\s]\s?\d{2}\b/g, function (m) {
      const d = m.replace(/\D/g, ''); if (d.length !== 11) return m;
      cCpf.push({ d: d, forte: true }); return ' ';
    });
    // telefone com máscara, parênteses ou +55: (13) 98210-6625, +55 13 98210 6625, 13 98210-6625, 13 3821-0662
    resto = resto.replace(/(?:\+\s?55[\s.\-]*)?\(\s?0?\d{2}\s?\)[\s.\-]*9?[\s.\-]?\d{4}[\s.\-]?\d{4}\b|\+\s?55[\s.\-]*\d{2}[\s.\-]*9?[\s.\-]?\d{4}[\s.\-]?\d{4}\b|\b0?\d{2}[\s.\-]+9[\s.\-]?\d{4}[\s.\-]?\d{4}\b|\b0?\d{2}[\s.\-]*9?\d{4}[\s.\-]\d{4}\b/g, function (m) {
      const tl = _telLimpo(m); if (!tl) return m;
      cTel.push({ d: tl, forte: true }); return ' ';
    });
    // número solto de 10 a 13 dígitos: CPF se os dígitos verificadores fecham; senão telefone se tem DDD válido
    resto = resto.replace(/\b\d{10,13}\b/g, function (m) {
      const tl = _telLimpo(m);
      if (m.length === 11 && _cpfValido(m)) { cCpf.push({ d: m, tel: tl }); return ' '; }
      if (tl) { cTel.push({ d: tl }); return ' '; }
      if (m.length === 11) { cCpf.push({ d: m, fraco: true }); return ' '; }
      return m;
    });
    if (!out.cpf) {
      const c = cCpf.find(function (x) { return x.forte; }) || cCpf.find(function (x) { return !x.fraco; }) || cCpf.find(function (x) { return x.fraco; });
      if (c) { out.cpf = c.d; c.usado = true; if (meta && !c.fraco) meta.tipo.cpf = true; }
    }
    if (!out.telefone) {
      const tf = cTel.find(function (x) { return x.forte; }) || cTel[0] || null;
      if (tf) { out.telefone = tf.d; if (meta) meta.tipo.telefone = true; }
      else { const s2 = cCpf.find(function (x) { return !x.usado && x.tel; }); if (s2) { out.telefone = s2.tel; if (meta) meta.tipo.telefone = true; } }
    }
  }

  // linhas de texto restantes (sem os números já consumidos)
  // aceita separadores em linha nova, vírgula E barra "/" (formato que a própria Athena sugere)
  let linhas = resto.split(/\n|,|\//).map(l => l.replace(/\s+/g,' ').trim()).filter(l => l && l.replace(/\d/g,'').trim().length >= 2);

  // estado: por sigla (linha inteira), por nome, ou UF colada no fim da linha ("Campinas- SP", "Campinas SP")
  if (!out.estado) {
    for (let i = 0; i < linhas.length; i++) {
      const ln = norm(linhas[i]).replace(/[^a-z ]/g,'').trim();
      if (_UF_NOME[ln]) { out.estado = _UF_NOME[ln]; linhas.splice(i,1); break; }
      const up = linhas[i].toUpperCase().replace(/[^A-Z]/g,'');
      if (up.length === 2 && _UFS.includes(up)) { out.estado = up; linhas.splice(i,1); break; }
      // UF grudada no fim do endereço: "... Campinas- SP" / "... Campinas SP" — tira só a UF e deixa o resto (cidade) na linha
      const mFim = linhas[i].match(/[\s\-]([A-Za-z]{2})\s*$/);
      if (mFim && _UFS.includes(mFim[1].toUpperCase())) {
        out.estado = mFim[1].toUpperCase();
        linhas[i] = linhas[i].slice(0, mFim.index).replace(/[\s\-]+$/,'').trim();
        if (!linhas[i]) linhas.splice(i,1);
        break;
      }
    }
  }

  // endereço: a linha que tem número de rua (dígitos no meio do texto)
  if (!out.endereco) {
    let idxEnd = linhas.findIndex(l => /\d/.test(l) && /[a-zA-Z]{3,}/.test(l));
    if (idxEnd >= 0) { out.endereco = linhas[idxEnd]; linhas.splice(idxEnd, 1); }
  }

  // complemento (obs/apto/bloco/casa/loja)
  if (!out.complemento) {
    let idxComp = linhas.findIndex(l => /\b(ap|apto|apartamento|bloco|bl|casa|fundos|loja|obs|complemento|entregar)\b/i.test(norm(l)));
    if (idxComp >= 0) { out.complemento = linhas[idxComp]; linhas.splice(idxComp, 1); }
  }

  // sobra: nome (SÓ se parecer nome de gente: 2+ palavras, sem dígitos; não força o índice 0 como antes, pra não pegar lixo), depois bairro, depois cidade
  const sobra = linhas.filter(Boolean);
  if (sobra.length) {
    if (!out.nome) {
      const idxNome = sobra.findIndex(l => !/\d/.test(l) && l.trim().split(/\s+/).filter(Boolean).length >= 2);
      if (idxNome >= 0) { out.nome = sobra[idxNome]; sobra.splice(idxNome, 1); }
    }
    if (!out.bairro && sobra[0]) { out.bairro = sobra.shift(); }
    if (!out.cidade && sobra[0]) { out.cidade = sobra.shift(); }
  }

  // normaliza estado se veio por extenso pela etapa de rótulo
  if (out.estado && out.estado.length > 2) {
    const nn = norm(out.estado).replace(/[^a-z ]/g,'').trim();
    if (_UF_NOME[nn]) out.estado = _UF_NOME[nn];
    else { const up = out.estado.toUpperCase().replace(/[^A-Z]/g,'').slice(0,2); if (up.length===2 && _UFS.includes(up)) out.estado = up; }
  }
  return out;
}

// ═══ v91 (07/10/2026) — DADOS DE ENVIO: ler em QUALQUER formato e parar de repetir pergunta ═══════════════
// Pedido do Thiago depois do VF-0710-W002: o cliente mandou o telefone sozinho ("13982106625") e a Athena pediu de
// novo; só passou quando ele digitou no "formato certo". "A maioria dos clientes não consegue."
// Ordem de confiança na leitura: 1) linha com rótulo ("Bairro: Centro") · 2) resposta ENCAIXADA no que ainda falta
// ("Guarujá" quando só falta a cidade) · 3) número reconhecido pelo formato (CPF pelos dígitos verificadores,
// telefone pelo DDD, CEP, e-mail) · 4) IA, SÓ se ainda faltar algo · 5) palpite pela ordem.
// Telefone: se o cliente não informar, vale o número do WhatsApp em que ele está falando (decisão do Thiago).
// Estado: se não informar, vale o que ele já disse no cálculo do frete.
const COLETA_OBRIG = ['nome','cpf','telefone','endereco','bairro','cidade','estado','cep'];
const COLETA_NOMES = { nome:'Nome completo', cpf:'CPF', telefone:'Telefone', email:'E-mail', endereco:'Rua e número', bairro:'Bairro', cidade:'Cidade', estado:'Estado', cep:'CEP' };
// pergunta de UM dado só: "Só falta <o seu CEP>. Pode mandar só <ele>, ex.: <01310-100>"
const COLETA_UM = {
  nome:     ['o seu *nome completo*',   'ele',  'Maria da Silva'],
  cpf:      ['o seu *CPF*',             'ele',  '000.000.000-00'],
  telefone: ['o seu *telefone com DDD*','ele',  '(11) 99999-9999'],
  endereco: ['a sua *rua e número*',    'isso', 'Rua das Flores, 123'],
  bairro:   ['o seu *bairro*',          'ele',  'Centro'],
  cidade:   ['a sua *cidade*',          'ela',  'Campinas'],
  estado:   ['o seu *estado*',          'ele',  'SP'],
  cep:      ['o seu *CEP*',             'ele',  '01310-100']
};
function coletaFalta(c) { return COLETA_OBRIG.filter(function (k) { return !c[k] || String(c[k]).length < 2; }); }
function coletaPergunta(faltam, nadaAinda) {
  if (nadaAinda) {
    return 'Pra eu enviar seu pedido, me manda:\n' + faltam.map(function (f) { return '• ' + COLETA_NOMES[f]; }).join('\n') +
      '\n\nPode mandar do seu jeito, um em cada linha.';
  }
  if (faltam.length === 1 && COLETA_UM[faltam[0]]) {
    const u = COLETA_UM[faltam[0]];
    return 'Quase lá! 😊 Só falta ' + u[0] + '.\nPode mandar só ' + u[1] + ', ex.: ' + u[2];
  }
  return 'Quase lá! 😊 Só falta:\n' + faltam.map(function (f) { return '• ' + COLETA_NOMES[f]; }).join('\n') +
    '\n\nPode mandar do seu jeito, um em cada linha.';
}
// CPF de verdade (dígitos verificadores). Serve pra separar CPF de celular: os dois têm 11 dígitos.
function _cpfValido(v) {
  const d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let s = 0, i, r;
  for (i = 0; i < 9; i++) s += Number(d[i]) * (10 - i);
  r = (s * 10) % 11; if (r === 10) r = 0;
  if (r !== Number(d[9])) return false;
  s = 0;
  for (i = 0; i < 10; i++) s += Number(d[i]) * (11 - i);
  r = (s * 10) % 11; if (r === 10) r = 0;
  return r === Number(d[10]);
}
// Telefone com DDD em 10 ou 11 dígitos (tira +55 e o 0 da operadora). Não parece telefone → ''.
function _telLimpo(v) {
  let d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.length >= 12 && d.indexOf('55') === 0) d = d.slice(2);
  if ((d.length === 11 || d.length === 12) && d[0] === '0') d = d.slice(1);
  if (d.length !== 10 && d.length !== 11) return '';
  const ddd = Number(d.slice(0, 2));
  if (!(ddd >= 11 && ddd <= 99)) return '';
  if (d.length === 11 && d[2] !== '9') return '';
  return d;
}
// Siglas que podem aparecer SOLTAS no meio de uma frase sem virar outra palavra do português
// ("se", "to", "pa", "am", "ma", "es", "al", "ap", "pe", "ro", "ac" ficam de fora: só valem sozinhas).
const _UF_NA_FRASE = { SP:1, RJ:1, MG:1, RS:1, SC:1, PR:1, DF:1, BA:1, MT:1, MS:1, RN:1, PB:1, RR:1, GO:1, CE:1, PI:1 };
// UF a partir do que o cliente escreveu: "SP", "s.p.", "São Paulo", "sou do rio de janeiro", "moro em sp".
// (Antes: as 2 primeiras letras da mensagem — "São Paulo" virava "SO", "Paraná" virava PA, "Mato Grosso" virava MA.)
function ufDoTexto(texto) {
  const bruto = String(texto == null ? '' : texto).trim();
  if (!bruto) return '';
  const nn = norm(bruto).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (nn && _UF_NOME[nn]) return _UF_NOME[nn];
  const up = bruto.toUpperCase().replace(/[^A-Z]/g, '');
  if (up.length === 2 && _UFS.includes(up)) return up;
  if (!nn) return '';
  const alvo = ' ' + nn + ' ';
  const nomes = Object.keys(_UF_NOME).sort(function (a, b) { return b.length - a.length; });
  for (let i = 0; i < nomes.length; i++) {
    if (nomes[i].length >= 5 && alvo.indexOf(' ' + nomes[i] + ' ') >= 0) return _UF_NOME[nomes[i]];
  }
  const ws = nn.split(' ');
  for (let j = 0; j < ws.length; j++) {
    const u = ws[j].toUpperCase();
    if (u.length === 2 && _UF_NA_FRASE[u]) return u;
  }
  return '';
}
// linha que já vem com rótulo ("Bairro: Centro") — quem lê é a etapa de rótulos do extrairDadosRegex
const _COLETA_ROT = /^\s*(nome(\s+completo)?|cpf|documento|doc|telefone|tel|celular|cel|whats|whatsapp|fone|email|e-mail|e mail|rua e numero|rua e número|endereco|endereço|rua|logradouro|av|avenida|complemento|compl|obs|observacao|observação|referencia|referência|bairro|cidade|municipio|município|estado|uf|cep)\s*[:\-]\s*\S/i;
// rótulo sem dois-pontos e começo de frase
const _COLETA_ROT_SOLTO = /^\s*(nome completo|nome|cpf|cep|bairro|cidade|municipio|município|estado|uf|telefone|tel|celular|cel|whatsapp|whats|zap|fone|e-?mail|complemento|compl|endere[cç]o|logradouro)\s+(?![:\-])(\S.*)$/i;
const _COLETA_ROT_CAMPO = { nomecompleto:'nome', nome:'nome', cpf:'cpf', cep:'cep', bairro:'bairro', cidade:'cidade', municipio:'cidade', estado:'estado', uf:'estado', telefone:'telefone', tel:'telefone', celular:'telefone', cel:'telefone', whatsapp:'telefone', whats:'telefone', zap:'telefone', fone:'telefone', email:'email', complemento:'complemento', compl:'complemento', endereco:'endereco', logradouro:'endereco' };
const _COLETA_INTRO = /^\s*(meu nome( completo)?( é| e)?|me chamo|eu sou( o| a)?|sou( o| a)?|eu moro (em|na|no)|moro (em|na|no)|minha cidade( é| e)?|meu bairro( é| e)?|meu estado( é| e)?|meu cep( é| e)?|meu cpf( é| e)?|fica (em|na|no)|aqui (é|e)|é em|é no|é na|é|e|em|no|na)\s+/i;
// texto que é conversa, não dado ("ok", "já mandei", "qual cep?") — não pode ser gravado como bairro/cidade
function _coletaEhConversa(t) {
  const s = norm(t).replace(/[^a-z0-9? ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return true;
  if (s.indexOf('?') >= 0) return true;
  if (s.split(' ').length > 8) return true;
  if (/^(oi|oie|ola|opa|ok|okay|sim|nao|s|n|blz|beleza|certo|isso|pronto|feito|obrigado|obrigada|valeu|vlw|show|perfeito|combinado|menu|voltar|bom dia|boa tarde|boa noite|kk+|rs+)$/.test(s)) return true;
  if (/^(ja |vou |vo |nao sei|nao tenho|nao lembro|qual |quais |como |quando |onde |por que|porque |pq |pode |posso |quero |queria |preciso |tem |to |ta |estou |esta |eu |me |um momento|um minuto|so um|pera|perai|espera|aguarda|calma|obrigad|segue|ai esta|ta ai|mandei|enviei)/.test(s)) return true;
  return false;
}
// só agradecimento/aviso ("ok", "já mando") — não conta como tentativa
function _coletaEhSoAviso(n) {
  const s = String(n || '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || s.split(' ').length > 6) return false;
  return /^(ok|okay|blz|beleza|certo|ta|ta bom|ta certo|sim|claro|obrigado|obrigada|valeu|vlw|show|perfeito|combinado|pode deixar|vou mandar|ja mando|ja envio|ja te mando|vou enviar|um momento|um minuto|so um minuto|so um momento|pera|perai|espera|aguarda|calma)( |$)/.test(s);
}
// ENCAIXA a resposta nos dados que AINDA FALTAM. `certos` = sem dúvida (tipo do dado, ou 1 texto pra 1 campo);
// `palpites` = vários textos pra vários campos, pela ordem em que a Athena pede (a IA tem prioridade sobre eles).
function coletaEncaixar(mensagem, coleta, faltam) {
  const certos = {}, palpites = {};
  const falta = function (k) { return faltam.indexOf(k) >= 0 && !certos[k]; };
  let partes = String(mensagem == null ? '' : mensagem).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  if (partes.length === 1 && partes[0].indexOf('http') < 0 && partes[0].split('/').length >= 3) {
    partes = partes[0].split('/').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  partes = partes.filter(function (p) { return !_COLETA_ROT.test(p); });
  const textos = [], comNum = [];
  const ehSiglaUf = function (p) { const up = p.toUpperCase().replace(/[^A-Z]/g, ''); return up.length === 2 && _UFS.includes(up) && p.replace(/[^A-Za-zÀ-ÿ]/g, '').length === 2 && !/\d/.test(p); };
  const temSigla = partes.some(ehSiglaUf);
  const faltavaCidade = faltam.indexOf('cidade') >= 0;
  const okNome0 = function (t) { return t.trim().split(/\s+/).filter(Boolean).length >= 2 && !/\d/.test(t); };
  const semRotulo = [];
  partes.forEach(function (p) {
    // "bairro centro", "cep 11000-000", "cidade santos": rótulo sem dois-pontos — só vale pro dado que ainda falta
    const mr = p.match(_COLETA_ROT_SOLTO);
    if (mr) {
      const campo = _COLETA_ROT_CAMPO[norm(mr[1]).replace(/[^a-z]/g, '')];
      const v = String(mr[2] || '').trim();
      if (campo && v && !coleta[campo] && !certos[campo]) {
        let val = '';
        if (campo === 'cpf') { const d = v.replace(/\D/g, ''); if (d.length === 11) val = d; }
        else if (campo === 'cep') { const d2 = v.replace(/\D/g, ''); if (d2.length === 8) val = d2; }
        else if (campo === 'telefone') val = _telLimpo(v);
        else if (campo === 'email') { const me = v.match(/[\w.+-]+@[\w-]+\.[\w.-]+/); if (me) val = me[0].toLowerCase(); }
        else if (campo === 'estado') val = ufDoTexto(v);
        else if (campo === 'nome') { if (okNome0(v)) val = v; }
        else if (v.split(/\s+/).length <= 9) val = v;
        if (val) { certos[campo] = val; return; }
      }
    }
    semRotulo.push(p);
  });
  semRotulo.forEach(function (p0) {
    // tira o começo de frase: "meu nome é …", "moro em …", "aqui é …"
    const p = String(p0).replace(_COLETA_INTRO, '').trim() || p0;
    const mEmail = p.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (mEmail) { if (!coleta.email && !certos.email) certos.email = mEmail[0].toLowerCase(); return; }
    const dig = p.replace(/\D/g, '');
    const letras = p.replace(/[^a-zA-ZÀ-ÿ]/g, '');
    if (!letras.length) {
      if (!dig.length) return;
      if (dig.length === 8) { if (falta('cep')) certos.cep = dig; return; }
      const tel = _telLimpo(dig);
      const mascCpf = /\d{3}\.\d{3}\.\d{3}|\d-\d{2}\s*$/.test(p) && !/[()+]/.test(p);
      if (dig.length === 11 && falta('cpf') && (mascCpf || _cpfValido(dig) || !tel)) { certos.cpf = dig; return; }
      if (tel) { if (!coleta.telefone && !certos.telefone) certos.telefone = tel; return; }
      if (dig.length === 11 && falta('cpf')) { certos.cpf = dig; return; }
      return;
    }
    if (!dig.length) {
      const nn = norm(p).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (ehSiglaUf(p)) { if (falta('estado')) certos.estado = p.toUpperCase().replace(/[^A-Z]/g, ''); return; }   // sigla nunca é bairro/cidade
      if (_UF_NOME[nn] && falta('estado') && !temSigla) {
        certos.estado = _UF_NOME[nn];
        // "São Paulo" / "Rio de Janeiro" também são cidade: se a cidade falta, o mesmo texto serve pros dois
        if (faltavaCidade && (nn === 'sao paulo' || nn === 'rio de janeiro')) textos.push(p);
        return;
      }
      if (_coletaEhConversa(p)) return;
      textos.push(p);
      return;
    }
    comNum.push(p);
  });
  const ehCompl = function (p) {
    const s = norm(p);
    return /^(ap|apto|apt|apartamento|bloco|bl|casa|fundos|loja|sala|andar|cj|conjunto|lote|lt|quadra|qd|torre|edificio|ed)\b/.test(s) && !/\b(rua|avenida|av|travessa|alameda|rodovia|estrada|praca)\b/.test(s);
  };
  comNum.forEach(function (p) {
    if (_coletaEhConversa(p)) return;
    // frase comprida com vários dados juntos ("moro na rua x 55 bairro y cep …"): quem separa é a IA, não vira "rua" inteira
    if (p.length > 70 || p.split(/\s+/).length > 10 || /\b(cpf|cep|bairro|cidade|telefone|celular|e-?mail)\b/i.test(p)) return;
    if (ehCompl(p)) { if (!coleta.complemento && !certos.complemento) certos.complemento = p; return; }
    if (falta('endereco')) { certos.endereco = p; return; }
    const sobra = ['bairro','cidade'].filter(falta);
    if (sobra.length === 1 && !textos.length) { palpites[sobra[0]] = p; return; }
    if (!coleta.complemento && !certos.complemento) palpites.complemento = p;
  });
  const okNome = function (t) { return t.trim().split(/\s+/).filter(Boolean).length >= 2 && !/\d/.test(t); };
  const camposTxt = ['nome','endereco','bairro','cidade'].filter(falta);
  // valor "limpo" (poucas palavras, sem muleta de conversa) é certo; frase solta ("em campinas mesmo viu") fica como palpite — a IA lê primeiro
  const ehSimples = function (t) { const s = ' ' + norm(t).replace(/[^a-z0-9 ]/g, ' ') + ' '; return t.trim().split(/\s+/).length <= 6 && !/ (mesmo|viu|aqui|tambem|acho|tipo|ne|la|ai|ja|so|mas|que|porque|entao|ok|sim|nao|ta|to) /.test(s); };
  if (textos.length === 1 && camposTxt.length === 1) {
    if (camposTxt[0] !== 'nome' || okNome(textos[0])) { if (ehSimples(textos[0])) certos[camposTxt[0]] = textos[0]; else palpites[camposTxt[0]] = textos[0]; }
  } else if (textos.length && camposTxt.length) {
    const fila = textos.slice();
    camposTxt.forEach(function (k) {
      if (!fila.length) return;
      if (k === 'nome') { const i = fila.findIndex(okNome); if (i >= 0) palpites.nome = fila.splice(i, 1)[0]; return; }
      palpites[k] = fila.shift();
    });
  }
  return { certos: certos, palpites: palpites };
}
// Lê a mensagem e devolve: `coleta` (só o que o cliente informou — é o que fica guardado na sessão),
// `completa` (com o telefone do WhatsApp e o estado do frete quando ele não informou) e `ganhou` (campos novos).
async function coletaLer(mensagem, coletaAntes, sid, session) {
  const coleta = Object.assign({}, coletaAntes || {});
  const antes = Object.assign({}, coleta);
  const poe = function (k, v) {
    if (v == null) return;
    v = String(v).trim();
    if (v.length >= 1 && !coleta[k]) coleta[k] = v;
  };
  const limpa = function () {
    if (coleta.nome && (String(coleta.nome).trim().split(/\s+/).filter(Boolean).length < 2 || /\d/.test(coleta.nome))) delete coleta.nome;
    if (coleta.estado) { const u = ufDoTexto(coleta.estado); if (u) coleta.estado = u; else delete coleta.estado; }
    // sigla de estado gravada como cidade/bairro (palpite do leitor antigo: "… / São Paulo / SP") não vale
    ['cidade','bairro'].forEach(function (k) { if (coleta[k] && /^[A-Za-z]{2}$/.test(String(coleta[k]).trim()) && _UFS.includes(String(coleta[k]).trim().toUpperCase())) delete coleta[k]; });
    if (coleta.cpf) coleta.cpf = formatarCPF(coleta.cpf);
    if (coleta.telefone) { const t = _telLimpo(coleta.telefone); if (t) coleta.telefone = t; }
  };
  const meta = {};
  const rx = extrairDadosRegex(mensagem, meta) || {};
  const rot = meta.rotulo || {}, tipo = meta.tipo || {};
  // 1) linhas com rótulo
  Object.keys(rx).forEach(function (k) { if (rot[k]) poe(k, rx[k]); });
  // 2) resposta encaixada no que ainda falta
  const enc = coletaEncaixar(mensagem, coleta, coletaFalta(coleta));
  Object.keys(enc.certos).forEach(function (k) { poe(k, enc.certos[k]); });
  // 3) números reconhecidos pelo formato
  ['cpf','cep','email','telefone'].forEach(function (k) { if (tipo[k]) poe(k, rx[k]); });
  // número que o leitor chamou de CPF com o CPF já preenchido (e diferente) → é o telefone
  if (!coleta.telefone && rx.cpf && antes.cpf && String(rx.cpf).replace(/\D/g, '') !== String(antes.cpf).replace(/\D/g, '')) {
    const t2 = _telLimpo(rx.cpf); if (t2) coleta.telefone = t2;
  }
  limpa();
  // o que já está garantido sem perguntar: telefone (WhatsApp) e estado (o do frete)
  const telWhats = _telLimpo(sid);
  const ufFrete = ufDoTexto((session && session.estadoCliente) || '');
  const comPadrao = function () {
    const c = Object.assign({}, coleta);
    if (!c.telefone && telWhats) c.telefone = telWhats;
    if (!c.estado && ufFrete) c.estado = ufFrete;
    return c;
  };
  // 4) IA — só quando ainda falta dado e a mensagem tem texto pra ler
  let usouIA = false;
  if (coletaFalta(comPadrao()).length > 0 && /[a-zA-ZÀ-ÿ]{2,}/.test(String(mensagem || '')) && !_coletaEhSoAviso(norm(mensagem))) {
    usouIA = true;
    let ia = null;
    try { ia = await extrairDadosIA(mensagem, { tem: Object.keys(coleta).filter(function (k) { return !!coleta[k]; }), faltam: coletaFalta(comPadrao()) }); } catch (e) { ia = null; }
    ia = ia || {};
    Object.keys(ia).forEach(function (k) { poe(k, ia[k]); });
    // 5) palpites, por último
    Object.keys(enc.palpites).forEach(function (k) { poe(k, enc.palpites[k]); });
    // palpite do leitor antigo: frase inteira não vale como rua/bairro/cidade/nome
    Object.keys(rx).forEach(function (k) {
      if (['endereco','bairro','cidade','nome','complemento'].indexOf(k) >= 0 && (String(rx[k]).length > 60 || String(rx[k]).split(/\s+/).length > 9)) return;
      poe(k, rx[k]);
    });
    limpa();
  }
  if (rx.complemento && String(rx.complemento).length <= 60) poe('complemento', rx.complemento);
  poe('email', rx.email);
  const ganhou = Object.keys(coleta).filter(function (k) { return coleta[k] && !antes[k]; });
  return { coleta: coleta, completa: comPadrao(), ganhou: ganhou, usouIA: usouIA };
}

// ═══ v91 — NO FECHAMENTO (estado/frete): cliente quer voltar e pôr mais produto, ou digita o nome de um produto ═══
// Caso real (07/10 00:37): "Quero adicionar mais produtos" e "Quero mais enantato" na escolha do frete → a Athena só
// repetia "Digite 1, 2 ou 3". Agora: nome de produto abre a busca (carrinho salvo) e "adicionar mais" volta ao menu.
function ehQuerAdicionarMais(n) {
  const t = ' ' + String(n || '') + ' ';
  // "mais barato / mais rápido / mais em conta" é pergunta sobre o frete, não pedido de mais produto
  if (/\bmais\s+(barat|rapid|car[oa]\b|em conta|lent|segur|demorad|cedo|tarde|vantaj|economic)/.test(t)) return false;
  return /\b(adicionar|adiciona|acrescentar|acrescenta|incluir|inclui|colocar|coloca|botar|bota|pegar|levar|comprar|escolher|ver|quero|queria|faltou|esqueci)\b[^.!?]*\b(mais|outro|outra|outros|outras)\b/.test(t)
      || /\bmais\s+(um\s+|uma\s+|uns\s+|umas\s+|alguns\s+|algumas\s+|\d+\s+)?(produto|produtos|item|itens|coisa|coisas)\b/.test(t)
      || /\b(continuar comprando|voltar (pro|para o|ao|pra) (carrinho|menu|inicio)|voltar as compras|esqueci (de )?(um|uma|de|do|da) )/.test(t)
      || /^\s*(mais|adicionar|adicionar mais|mais produtos?|mais itens?)\s*$/.test(String(n || ''));
}
async function checkoutDesvio(session, sid, n, respond) {
  if (!n || /^\s*\d+\s*$/.test(n)) return null;
  let rec = null, ci = null;
  try { rec = reconhecerProduto(n); } catch (e) { rec = null; }
  if (!rec) { try { ci = ciProcurar(n, await ciCatalogo()); } catch (e) { ci = null; } }
  const temProduto = !!rec || !!(ci && ci.exatos.length > 0 && ci.exatos.length <= 40 && ci.todasConhecidas && ci.palavras.length > 0);
  if (temProduto) return await tratarTextoLivre(session, sid, n, '', respond);
  if (ehQuerAdicionarMais(n)) {
    if (session.promoGenesis) return await anunciarGenesis(session, sid, respond, true);
    await saveSession(sid, { ...session, state:'MENU' });
    return respond('🛒 Seu carrinho está guardado! Escolha mais produtos:\n\n' + buildMenuPrincipal());
  }
  return null;
}
function freteOpcoesTexto(opts) {
  return (opts || []).map(function (o, i) { return emojis(i) + ' *' + o.label + '* — R$ ' + o.valor.toFixed(2).replace('.', ','); }).join('\n');
}
// qual opção de frete o cliente escolheu: número ("2", "a 2", "opção 3") ou nome ("sedex", "quero transportadora"). -1 = não escolheu.
function freteEscolhido(n, opts) {
  const s = String(n || '').trim();
  if (!s || !opts || !opts.length) return -1;
  const nums = s.match(/\d+/g) || [];
  if (nums.length === 1 && s.split(/\s+/).length <= 4 && !ehQuerAdicionarMais(s)) {
    const k = parseInt(nums[0], 10);
    if (k >= 1 && k <= opts.length && !/\d\s*(mg|ml|ui|mcg|cx|un|unid|caixa|ampola|frasco|momento|minuto|segundo|duvida|pergunta|coisa)/.test(s)) return k - 1;
  }
  if (!nums.length) {
    const alvo = ' ' + s.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ') + ' ';
    const bate = [];
    opts.forEach(function (o, i) { const l = norm(o.label); if (l && alvo.indexOf(' ' + l + ' ') >= 0) bate.push(i); });
    if (bate.length === 1) return bate[0];
  }
  return -1;
}

// ═══ v91 — NOME LONGO COM 2 LETRAS ERRADAS/TROCADAS ("monjauro" → mounjaro) ═══
// Caso real (06/10 17:00): a cliente escreveu "Monjauro" e ficou sem resposta. A tolerância era de 1 letra.
// Só entra quando o dicionário e o catálogo não acharam NADA; exige a mesma inicial e um único produto possível.
function _distEd(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let ant2 = null, ant = [], i, j;
  for (j = 0; j <= lb; j++) ant[j] = j;
  for (i = 1; i <= la; i++) {
    const cur = [i];
    let menor = i;
    for (j = 1; j <= lb; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + custo);
      if (ant2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, ant2[j - 2] + 1);
      cur[j] = v;
      if (v < menor) menor = v;
    }
    if (menor > max) return max + 1;
    ant2 = ant; ant = cur;
  }
  return ant[lb];
}
function reconhecerAproximado(nMsg) {
  if (!nMsg) return null;
  const palavras = String(nMsg).split(/[^a-z0-9+]+/).filter(function (p) { return p.length >= 7 && !/\d/.test(p); });
  if (!palavras.length) return null;
  let melhor = null, dist = 3, empate = false;
  for (const e of DICT_PRODUTOS) {
    const termos = (e.canonico || []).concat(e.apelidos || []);
    for (const termo of termos) {
      const t = norm(termo).replace(/[-\s]/g, '');
      if (t.length < 8 || /\d/.test(t)) continue;
      for (const p of palavras) {
        if (p[0] !== t[0]) continue;
        const d = _distEd(p, t, 2);
        if (d > 2) continue;
        if (d < dist) { melhor = e; dist = d; empate = false; }
        else if (d === dist && melhor && melhor !== e) empate = true;
      }
    }
  }
  return (melhor && !empate) ? { entry: melhor, modo: 'canonico', aproximado: true } : null;
}

async function extrairDadosIA(texto, ctx) {
  try {
    // v91: a IA fica sabendo o que JÁ temos e o que FALTA — resposta curta e solta ("Guarujá") vai pro campo certo.
    const _ctxIA = (ctx && ctx.faltam && ctx.faltam.length)
      ? `CONTEXTO: já temos ${(ctx.tem && ctx.tem.length) ? ctx.tem.join(', ') : 'nenhum dado'}. AINDA FALTAM: ${ctx.faltam.join(', ')}. Se o texto for uma resposta curta e solta, ela é quase sempre um dos dados que faltam — coloque no campo certo. Não invente dado que não está no texto.\n\n`
      : '';
    const prompt = `${_ctxIA}Extraia os dados de cadastro do cliente do texto abaixo e retorne APENAS um objeto JSON válido, sem nenhum texto antes ou depois, sem markdown.

Campos a extrair (use string vazia se não encontrar):
- nome: nome completo da pessoa
- cpf: CPF (apenas números ou formatado)
- telefone: telefone/celular com DDD
- email: e-mail
- endereco: rua e número juntos
- complemento: complemento (casa, apto, bloco). Se for "Casa" ou similar, mantenha
- bairro: bairro
- cidade: cidade
- estado: sigla do estado (2 letras, ex: RJ, SP)
- cep: CEP

Texto do cliente:
"""
${texto}
"""

Retorne SOMENTE o JSON no formato:
{"nome":"","cpf":"","telefone":"","email":"","endereco":"","complemento":"","bairro":"","cidade":"","estado":"","cep":""}`;
    const r = await fetchT('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:600, messages:[{ role:'user', content: prompt }] })
    }, 7000);   // v91: prazo — sem resposta em 7 s, segue com o que o leitor já achou
    const d = await r.json();
    if (d.error || !d.content) return null;
    const raw = d.content[0].text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.estado) parsed.estado = parsed.estado.toUpperCase().replace(/[^A-Z]/g,'').slice(0,2);
    Object.keys(parsed).forEach(k => { if (!parsed[k] || String(parsed[k]).trim().length < 1) delete parsed[k]; });
    return parsed;
  } catch(e) { console.error('EXTRAIR IA ERRO:', e.message); return null; }
}

// ── Handler principal ─────────────────────────────────────────────────────────
exports._t = { statusBloco, avisoWhats, extrairProdutosDosPedidos, ehBlocoDados, ehEmailSolto, idPedido, indicePorNomeExato, ehReclamacaoPedido, norm };   // v83: só para teste
exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type', 'Content-Type':'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' };
  if (event.httpMethod !== 'POST')    return { statusCode:405, headers, body: JSON.stringify({error:'Method not allowed'}) };
  // ── Nome do assistente por numero (multi-marca) ───────────────────────────────
  // Padrao "Athena". Quando a requisicao vier com "assistente" (ex.: disparo pelo
  // numero Vitaflow manda assistente:"Stella"), o nome e trocado SOMENTE no texto que
  // sai pro cliente (respond/transferir) — nada tecnico (funcoes, constantes, valores
  // gravados como descontoTipo:'athena') e afetado.
  let nomeAssistente = 'Athena';
  const aplicarNome = (t) => (nomeAssistente && nomeAssistente !== 'Athena' && t) ? String(t).replace(/Athena/g, nomeAssistente) : t;
  const respond = (r, r2='', r3='') => {
    // Se a mensagem única for grande demais (ex.: lista de 73 produtos), o WhatsApp recusa
    // e mostra "Erro ao enviar mensagem". Divide automaticamente em até 3 mensagens.
    if (r && r.length > 3800 && !r2 && !r3) {
      const p = partirMensagem(r, 3800);
      r  = p[0] || '';
      r2 = p[1] || '';
      r3 = p.length > 3
        ? p[2] + '\n\n_Tem mais produtos aqui! Se não achar, me manda o *nome* do que procura que eu filtro pra você. 😊_'
        : (p[2] || '');
    }
    const _fmt = (x) => normalizarMarkdownWhats(aplicarNome(x));
    // Convite de retomada: vai PRONTO pro fluxo, na variável {athena_abandono}, e é a
    // saída "Se usuário não responder" (3h) que dispara. Como o webhook roda a cada
    // mensagem, a variável é reescrita sempre — só continua cheia se a ÚLTIMA coisa que
    // a pessoa fez foi demonstrar interesse e sumir.
    //   STELLA — hoje o bloco do fluxo dela usa TEXTO FIXO (decisão de 08/09: o convite
    //     vale pra todo abandono, inclusive quem só recebeu a saudação e nunca passou
    //     pelo webhook). O campo continua sendo devolvido por compatibilidade.
    //   ATHENA — condicional de propósito: só quem demonstrou interesse (abriu lista ou
    //     tem item no carrinho) e AINDA NÃO está fechando. Depois que existe link/pedido
    //     em aberto quem cobra é o GAS (lembrete 3h, 20h e template de 24h) — mandar os
    //     dois seria cobrar a mesma pessoa duas vezes pela mesma compra.
    let _abandono = '';
    if (nomeAssistente !== 'Athena') {
      _abandono = SINAL_LISTA ? _fmt(MSG_STELLA_ABANDONO) : '';
    } else if (!SINAL_FECHANDO && SINAL_ATACADO) {
      _abandono = _fmt(MSG_ATACADO_ABANDONO);      // carrinho de atacado vence: gancho é escassez
    } else if (!SINAL_FECHANDO && (SINAL_LISTA || SINAL_CARRINHO)) {
      _abandono = _fmt(MSG_ATHENA_ABANDONO);
    }
    return { statusCode:200, headers, body: JSON.stringify({ resposta:_fmt(r), resposta2:_fmt(r2), resposta3:_fmt(r3), transferir:false, sinal: SINAL_LISTA ? 'lista' : '', abandono: _abandono }) };
  };
  const transferir = (r) => ({ statusCode:200, headers, body: JSON.stringify({ resposta:normalizarMarkdownWhats(aplicarNome(r)), resposta2:'', resposta3:'', transferir:true }) });

  try {
    SINAL_LISTA = false;
    SINAL_CARRINHO = false;
    SINAL_ATACADO  = false;
    SINAL_FECHANDO = false;
    const body = JSON.parse(event.body || '{}');
    nomeAssistente = ((body.assistente || body.nome_assistente || 'Athena') + '').trim() || 'Athena';
    ASSISTENTE_ATUAL = nomeAssistente; // deixa a IA assíncrona responder pela companhia certa
    const mensagem = (body.mensagem || body.message || body.texto || '').trim();
    const rawId = body.phone || body.subscriber_id || 'default';
    const sid = rawId.replace(/\D/g,'').replace(/^0+/,'').replace(/^55(\d{10,11})$/,'55$1') || rawId;
    const n = norm(mensagem);
    let num = parseInt(n);
    if (/^\d+\s*-\s*[a-z]{2,}|^\d+\s+amino/.test(n)) num = NaN;   // v90: "5-Amino-1MQ" é nome de produto, não a opção 5 do menu
    const ehMidia = ['image','video','document','audio','sticker'].includes(body.type);

    console.log('MSG:', mensagem, '| SID:', sid, '| TYPE:', body.type, '| BODY_KEYS:', Object.keys(body).join(','));
    if (body.type || body.mediaUrl || body.media_url || body.url || body.fileUrl) console.log('MIDIA DETECTADA:', JSON.stringify(body));

    const session = await getSession(sid);

    // ── FLAG DURÁVEL PÓS-PAGAMENTO (independe do estado da sessão) ─────────────
    // Se a InfinitePay confirmou o pagamento, o GAS gravou vitaflow_aguardando_dados/{fone}.
    // Aqui FORÇAMOS a COLETA_DADOS a partir da flag: assim os dados de envio SEMPRE geram o
    // recibo/textos pós-venda, mesmo que a sessão tenha derivado — e NUNCA reenvia link.
    try {
      const _aguardDados = await lerAguardandoDados(sid);
      const _flagOk = _aguardDados && (!_aguardDados.ts || (Date.now() - _aguardDados.ts) < 604800000); // 7 dias
      if (_flagOk && (session.state || 'MENU') !== 'COLETA_DADOS') {
        session.state = 'COLETA_DADOS';
        session.coleta = session.coleta || {};
        session.orderNsu = session.orderNsu || _aguardDados.order_nsu;
        session.carrinho = (session.carrinho && session.carrinho.length) ? session.carrinho : (_aguardDados.carrinho || []);
        session.freteSelecionado = session.freteSelecionado || _aguardDados.freteSelecionado || {};
        session.estadoCliente = session.estadoCliente || _aguardDados.estadoCliente || '';
        if (typeof session.total !== 'number') session.total = _aguardDados.total || 0;
        session.descontoReais = session.descontoReais || _aguardDados.descontoReais || 0;
        session.cupomDocId = session.cupomDocId || _aguardDados.cupomDocId || null;
        try { await saveSession(sid, session); } catch (e) {}
      }
    } catch (e) {}

    // ── STELLA: LEAD QUE VOLTA DEPOIS DE HORAS CAI NO MENU DE COMPRA (08/09/2026) ──
    // O follow-up de abandono (3h) termina com o MENU NUMERADO DE CATEGORIAS (o mesmo da
    // Athena). Só que a resposta dele chega numa sessão parada, que pode estar em qualquer
    // estado antigo — e aí o "1" seria lido como "produto 1 da lista de ontem". Passou 2h sem
    // falar, sem carrinho e fora do checkout: volta pro MENU, que é exatamente o que a
    // mensagem ofereceu. A Athena não entra nisso (o follow-up de 3h é só da Stella).
    // 17/09/2026 — era 'MENU_STELLA' (1 site / 2 grupos / 3 produtos / 4 cupom). Como o texto
    // do bloco 183491453 do BotConversa passou a terminar com o menu de categorias, o estado
    // tem que ser 'MENU' — senão o "1" do lead vira "site" em vez de "Emagrecedores".
    if (nomeAssistente !== 'Athena') {
      const _paradoMs = session._dedupTs ? (Date.now() - session._dedupTs) : 0;
      const _semCarrinho = !(Array.isArray(session.carrinho) && session.carrinho.length);
      const _estadoTravado = ['COLETA_DADOS','AGUARDAR_COMPROVANTE','CONFIRMAR','ESTADO','FRETE',
        'OBS_PERGUNTA','OBS_TEXTO','INFORMAR_CUPOM','PERGUNTA_CUPOM','ESCOLHER_BRINDE',
        'PROTO_CLIENTE','PROTO_IDENTIFICAR','PROTO_ESCOLHER','PROTO_TIPO','PROTO_HUMANO'
      ].includes(session.state || '');
      if (_paradoMs > 2 * 3600000 && _semCarrinho && !_estadoTravado && session.state !== 'MENU') {
        console.log('[STELLA-RETOMADA] sessao parada ha', Math.round(_paradoMs/60000), 'min — voltando pro menu de categorias. Estado antigo:', session.state);
        session.state = 'MENU';
      }
    }

    // ── v95: MODO ESQUECIDO (Athena) — 6 h sem falar, modo de navegação/consulta volta ao MENU (carrinho preservado) ──
    if (nomeAssistente === 'Athena') {
      const _paradoA = session._dedupTs ? (Date.now() - session._dedupTs) : 0;
      const _stA = session.state || '';
      const _modoNav = ['RASTREAR','ATACADO','ATK_LISTA','ATK_QTD','LISTA_PRODUTOS','QUANTIDADE','PEPTIDEOS','HORMONIOS','FABRICANTES',
        'SUBMENU_TESTO','ESTER_BASE','DUVIDAS','DUVIDAS_LIVRE','PRAZOS_RASTREIO','PRAZO_TIPO','FRETE_AVULSO','CONFIRMAR_PRODUTO',
        'CONFIRMAR_VER_PRODUTO','BUSCA_LIVRE','STACK_PROXIMO','SORTEIO','PROMO_OFERECER','POS_TABELA_FRAC','PROTO_CLIENTE',
        'PROTO_IDENTIFICAR','PROTO_ESCOLHER','PROTO_TIPO','TRIAGEM'].indexOf(_stA) >= 0;
      const _atkComPedido = (session.carrinhoAtk || []).length > 0 && /^(ATACADO|ATK_)/.test(_stA);
      if (_paradoA > 6 * 3600000 && _modoNav && !_atkComPedido) {
        console.log('[MODO-ESQUECIDO] parada ha', Math.round(_paradoA / 60000), 'min — estado antigo:', _stA, '-> MENU (carrinho preservado)');
        session.state = 'MENU';
      }
    }

    // ── ESTADO ÓRFÃO DE VERSÃO ANTIGA → VOLTA PRO MENU (17/09/2026) ───────────
    // A sessão fica gravada no Firebase e SOBREVIVE a deploy. Quando uma versão antiga
    // gravou um estado que o código de hoje não grava mais (ex.: 'PROTOCOLO', que mandava
    // TUDO que o cliente escrevesse direto pra IA), o cliente ficava preso nele pra sempre:
    // nome de produto não era lido como produto, só saía digitando "menu" — e ninguém sabe
    // disso. Caso real 17/09: cliente digitou "Retatrutida" e recebeu "👀" em vez da lista
    // de preços; as 3 mensagens dele naquele dia viraram "👀".
    // A lista abaixo é TODO estado que o código ATUAL grava, mais os dois que já não são
    // gravados mas ainda têm handler vivo (FABRICANTES, PERGUNTA_CUPOM). Qualquer outro
    // volta pro MENU. O CARRINHO É PRESERVADO — só o estado muda.
    const ESTADOS_VALIDOS = ['ADM','AGUARDAR_COMPROVANTE','ATACADO','ATK_BLOQUEIO','ATK_CART','ATK_CONFIRMAR','ATK_LISTA','ATK_QTD','ATK_REMOVER','BUSCA_LIVRE','CARRINHO','COLETA_DADOS','CONFIRMAR','CONFIRMAR_CARRINHO','CONFIRMAR_PRODUTO','CONFIRMAR_VER_PRODUTO','DUVIDAS','DUVIDAS_LIVRE','ESCOLHER_BRINDE','ESTADO','ESTER_BASE','FABRICANTES','FRETE','FRETE_AVULSO','HORMONIOS','INFORMAR_CUPOM','LISTA_PRODUTOS','MENU','OBS_PERGUNTA','OBS_TEXTO','PEPTIDEOS','PERGUNTA_CUPOM','POS_TABELA_FRAC','PRAZOS_RASTREIO','PRAZO_TIPO','PROMO_OFERECER','PROTO_CLIENTE','PROTO_ESCOLHER','PROTO_HUMANO','PROTO_IDENTIFICAR','PROTO_TIPO','QUANTIDADE','RASTREAR','REMOVER_ITEM','RETOMAR_CARRINHO','SORTEIO','STACK_PROXIMO','SUBMENU_TESTO','TRIAGEM','VAREJO_BLOQUEIO'];
    if (session.state && ESTADOS_VALIDOS.indexOf(session.state) < 0) {
      console.log('[ESTADO-ORFAO] estado desconhecido:', session.state, '— voltando pro MENU (carrinho preservado).');
      session.state = 'MENU';
    }

    // ── OPÇÃO DE MENU POR TEXTO (17/09/2026) ──────────────────────────────────
    // O cliente lê "1️⃣ Emagrecedores" e digita "Emagrecedores" (ou "peptideos", "hormonios",
    // "gh", "estetica", "sarms", "farmacia", "promocao", "atacado"). Antes isso caía em
    // tratarTextoLivre → não é produto → IA, que respondia PROSA em vez de abrir a categoria
    // (caso real 17/09, duas vezes na mesma noite). Aqui o texto vira o número da opção.
    // Nome de CATEGORIA vale na TRIAGEM e no MENU (na triagem, pula direto pro MENU com a
    // categoria — o cliente não precisa digitar "1" antes). Opções da triagem por texto
    // ("comprar", "prazos", "dúvidas") valem só na TRIAGEM. Nos outros estados nada muda.
    // v86: nome de CATEGORIA DE PRODUTO (1 a 7) vale também enquanto o cliente NAVEGA nos produtos. Caso real 03/10: na
    // pergunta "Quantas unidades deseja?" o cliente digitou "Hormônio" e a palavra foi buscada como nome de produto — veio a
    // lista de "Kit de Aplicação para Hormônios". Promoção (8) e atacado (9) continuam só no MENU/TRIAGEM, como antes.
    const _NAVEGANDO = ['PEPTIDEOS','HORMONIOS','SUBMENU_TESTO','ESTER_BASE','FABRICANTES','BUSCA_LIVRE','LISTA_PRODUTOS','QUANTIDADE','CONFIRMAR_PRODUTO','CONFIRMAR_VER_PRODUTO'].indexOf(session.state) >= 0;
    if (isNaN(num) && (session.state === 'MENU' || session.state === 'TRIAGEM' || !session.state || _NAVEGANDO)) {
      const _nt0 = n.trim();
      let _cat = categoriaPorTexto(_nt0);   // v86: 1 a 7, ou NaN
      if (!isNaN(_cat)) {}
      else if (!_NAVEGANDO && /^(promocao|promocoes|promocao do momento|promo do momento|ofertas?)$/.test(_nt0)) _cat = 8;
      else if (!_NAVEGANDO && /^(atacado)$/.test(_nt0)) _cat = 9;
      if (!isNaN(_cat)) {
        num = _cat;
        session.state = 'MENU';   // categoria digitada na triagem = já está escolhendo no MENU
      } else if (session.state === 'TRIAGEM') {
        if (/^(comprar|comprar produtos|produtos|ver produtos|quero comprar|comprar produto)$/.test(_nt0)) num = 1;
        else if (/^(prazos?|fretes?|rastreio|rastrear|prazos, fretes e rastreio|prazo e frete|prazos e fretes)$/.test(_nt0)) num = 2;
        else if (/^(duvidas?|protocolos?|tabelas? de fracionamento|fracionamento|duvidas, protocolos e tabelas de fracionamento)$/.test(_nt0)) num = 3;
      }
      if (!isNaN(num)) console.log('[OPCAO-POR-TEXTO] state:', session.state, '| texto:', _nt0, '-> opcao', num);
    }

    const state = session.state || 'MENU';


    // ── BLINDAGEM DO CHECKOUT ─────────────────────────────────────────────────
    // Quando o cliente já está montando/fechando o pedido, NENHUMA pergunta lateral
    // (frete, prazo, rastreio, atacado, tabela, grupo, promo) pode roubar o fluxo e APAGAR o
    // carrinho. Nesses estados, a mensagem vai direto pro handler do estado (que sabe lidar
    // com o carrinho). Isso corrige o caso "digitei 'frete' no resumo e perdi o pedido".
    const emCheckout = ['CARRINHO','REMOVER_ITEM','ESTADO','FRETE','PERGUNTA_CUPOM','INFORMAR_CUPOM','CONFIRMAR','OBS_PERGUNTA','OBS_TEXTO','ESCOLHER_BRINDE','PROTO_CLIENTE','PROTO_IDENTIFICAR','PROTO_ESCOLHER','PROTO_TIPO','POS_TABELA_FRAC','PROTO_HUMANO','AGUARDAR_COMPROVANTE','COLETA_DADOS','ATACADO','ATK_LISTA','ATK_QTD','ATK_CART','ATK_REMOVER','ATK_CONFIRMAR','ATK_BLOQUEIO','VAREJO_BLOQUEIO'].includes(state);

    // ── MÍDIA RECEBIDA (imagem/áudio/vídeo/documento/figurinha) ───────────────
    // body.type traz o tipo. FORA do checkout/pagamento, a Athena TRATA a mídia (antes ela caía
    // na saudação genérica ou era ignorada). Imagem → a IA "vê" (Claude visão). Áudio/vídeo/doc →
    // resposta padrão educada pedindo texto. Em estados de checkout (inclui AGUARDAR_COMPROVANTE),
    // a mídia segue o fluxo já existente (ex.: cliente mandando o comprovante).
    if (ehMidia && !emCheckout) {
      console.log('MIDIA (fora do checkout) | type:', body.type, '| body:', JSON.stringify(body).slice(0, 500));
      const midiaUrl = body.mediaUrl || body.media_url || body.url || body.fileUrl || body.file || body.arquivo || body.image || body.imageUrl || body.foto || '';
      if (body.type === 'image' && midiaUrl) {
        await saveSession(sid, { ...session, errosSeguidos: 0 });
        // Só a Athena manda imagem pro caminho assíncrono — na Stella a API está bloqueada
        // e a leitura da imagem nunca voltaria (mais um beco sem saída). Pra ela, pede o texto.
        if (nomeAssistente !== 'Athena') {
          return respond('Recebi sua imagem! 📷 Só que por aqui eu consigo te ajudar muito mais rápido por *texto*.\n\nMe diz o *nome do produto* que aparece nela (ou o que você quer saber) que eu te respondo na hora. 😊');
        }
        await dispararIA(sid, (mensagem || 'imagem'), contextoLista(session), midiaUrl);
        return respond('Deixa eu ver sua imagem… 👀');
      }
      if (body.type === 'audio') return respond(RESP_AUDIO_PADRAO);
      return respond(RESP_MIDIA_PADRAO);
    }
    // v84: o BotConversa às vezes repassa figurinha/áudio/contato como texto VAZIO ou como o aviso dele mesmo
    // ("Este tipo de mensagem não é suportado"), sem body.type. Isso ia pra IA ("Deixa eu ver isso…") e ficava sem resposta.
    if (!ehMidia && !emCheckout && state !== 'ADM' && (!mensagem || /^este tipo de mensagem nao e suportado\.?$/.test(n))) {
      return respond(RESP_MIDIA_PADRAO);
    }

    // ── DEDUP anti-retry do BotConversa ───────────────────────────────────────
    // Quando a resposta demora (ex.: gerar o link de pagamento leva ~5s), o BotConversa
    // REENVIA o mesmo webhook. Sem isto, a mensagem é processada 2x e gera pedido/link
    // DUPLICADO. Se a MESMA mensagem chegar de novo em até 15s, ignora o retry.
    // A chave inclui o ESTADO: assim "1" na lista de produtos e "1" na quantidade são
    // entradas DIFERENTES (não engole a quantidade), mas um retry real (mesma mensagem NO
    // MESMO estado) é barrado — que é o caso do link duplicado.
    const _dedupKey = state + '|' + (mensagem || '').slice(0, 100);
    const _dedupAgora = Date.now();
    if (mensagem && session._dedupKey === _dedupKey && session._dedupTs && (_dedupAgora - session._dedupTs) < 15000) {
      console.log('DEDUP: retry ignorado | key:', _dedupKey);
      return respond('');
    }
    session._dedupKey = _dedupKey;
    session._dedupTs = _dedupAgora;
    try { await saveSession(sid, session); } catch (e) {}

    // v85 ── BLOCO DE DADOS fora da coleta: o cliente está CORRIGINDO os dados de um pedido já registrado
    // (caso real 30/09: reenviou o bloco pra corrigir o nome da rua e recebeu "Você quis dizer Stanozolol?").
    // A Athena não altera pedido registrado: avisa a equipe e diz isso ao cliente. Não muda o estado.
    if (!emCheckout && state !== 'ADM' && ehBlocoDados(mensagem)) {
      try { await enviarTelegram(`✏️ *DADOS DE ENVIO REENVIADOS — possível correção*\n📱 ${sid}\n📦 Último pedido da sessão: ${session.orderNsu || '—'}\n\n${String(mensagem).slice(0, 900)}`); } catch (e) {}
      return respond(MSG_DADOS_REENVIADOS);
    }
    // v85 ── LISTA DE PRODUTOS: o cliente colou a linha inteira do produto → é a escolha dele (igual a digitar o número).
    if (state === 'LISTA_PRODUTOS' && !/^\d{1,3}$/.test(n.trim())) {
      const _ixNome = indicePorNomeExato(session.produtoLista || [], mensagem);
      if (_ixNome >= 0) {
        const _prodN = session.produtoLista[_ixNome];
        await saveSession(sid, { ...session, state:'QUANTIDADE', produtoSelecionado: _prodN });
        return respond(`Você escolheu:\n📦 *${_prodN.nome}*\n💰 R$ ${_prodN.preco.toFixed(2).replace('.',',')}\n\n*Quantas unidades deseja?*\n_(Digite o número)_`);
      }
    }

    // ── CARRINHO CHEIO: "finalizar" e "ver carrinho" vão SEMPRE pro fluxo determinístico ──
    // A IA NÃO enxerga o carrinho e inventava "carrinho vazio" + reabria seleção (duplicava item).
    // Só quando há itens no carrinho e fora dos passos que já tratam isso (estado/frete/confirmar/pgto).
    const _temCarrinho = Array.isArray(session.carrinho) && session.carrinho.length > 0;
    const _naoInterferir = ['ESTADO','FRETE','PERGUNTA_CUPOM','INFORMAR_CUPOM','CONFIRMAR','OBS_PERGUNTA','OBS_TEXTO','ESCOLHER_BRINDE','PROTO_CLIENTE','PROTO_IDENTIFICAR','PROTO_ESCOLHER','PROTO_TIPO','POS_TABELA_FRAC','PROTO_HUMANO','AGUARDAR_COMPROVANTE','COLETA_DADOS'].includes(state);
    if (_temCarrinho && !_naoInterferir) {
      const ehVerCarrinho = /\b(meu carrinho|ver (o )?carrinho|carrinho de compras|quantos? (produtos?|itens?)|o que (tem|ta|esta|eu tenho|eu ja tenho) no (meu )?carrinho|itens do carrinho|o que eu (ja )?(escolhi|adicionei)|resumo do (meu )?carrinho)\b/.test(n);
      const ehFinalizar = /\b(finalizar|fechar (a |o )?(compra|pedido|carrinho)|concluir (a )?compra|ir pro pagamento|quero pagar|pode fechar|finaliza(r)?|encerrar (a )?compra|checkout)\b/.test(n);
      if (ehVerCarrinho) {
        await saveSession(sid, { ...session, state:'CARRINHO' });
        return respond(msgCarrinhoMenu(session.carrinho));
      }
      if (ehFinalizar) {
        return await irParaCheckout(session, sid, respond);
      }
    }
    // v78: "finalizar" com o carrinho VAZIO (varejo e atacado) NÃO vai pra IA. Caso real 29/09: a IA disse
    // "digite finalizar", o cliente digitou, o carrinho estava vazio, a mensagem caiu na IA e ela SIMULOU o checkout
    // (pediu estado e CEP) e INVENTOU valores de frete. Aqui responde de forma fixa e pede o produto.
    const _temCarAtkF = Array.isArray(session.carrinhoAtk) && session.carrinhoAtk.length > 0;
    if (!_temCarrinho && !_temCarAtkF && !_naoInterferir && !emCheckout && state !== 'CONFIRMAR_CARRINHO') {
      const ehFinalizarVazio = /\b(finalizar|fechar (a |o )?(compra|pedido|carrinho)|concluir (a )?compra|ir pro pagamento|quero pagar|pode fechar|finaliza(r)?|encerrar (a )?compra|checkout)\b/.test(n);
      if (ehFinalizarVazio) {
        // A IA sabe da conversa qual produto o cliente quer: ela usa [[COMPRAR:...]] e o sistema pergunta se pode
        // colocar no carrinho. Se ela não souber o produto, pergunta qual é. Frete ela NÃO fala (trava na saída).
        const _ctxFin = [contextoLista(session),
          'ATENÇÃO: o cliente quer FINALIZAR a compra, mas o carrinho está VAZIO (o produto ainda não foi colocado). ' +
          'Se pela conversa você sabe EXATAMENTE qual produto ele quer, use [[COMPRAR:colecao:termo]] desse produto. ' +
          'Se não souber qual, pergunte em UMA linha qual produto ele quer. NÃO peça estado, CEP nem fale de frete.'
        ].filter(Boolean).join('\n');
        return await responderComIA(sid, mensagem, _ctxFin, respond);
      }
    }
    // "carrinho" (palavra solta, ou o erro comum "carinho") SEMPRE mostra o carrinho —
    // cheio OU vazio. Antes caía na IA ("Deixa eu ver isso pra você") e travava,
    // justamente a palavra que o sistema manda o cliente digitar.
    if ((/^\s*carrinhos?\s*$/.test(n) || n === 'carinho') && !_naoInterferir) {
      if (_temCarrinho) {
        await saveSession(sid, { ...session, state:'CARRINHO' });
        return respond(msgCarrinhoMenu(session.carrinho));
      }
      await saveSession(sid, { ...session, state:'TRIAGEM' });
      return respond('🛒 Seu carrinho está *vazio* por enquanto.\n\n' + buildTriagem());
    }

    // ── PERGUNTA DO CLIENTE FORA DO MENU (08/09/2026) ──────────────────────────
    // Até aqui, ehDuvida() só era consultada no galho MENU/TRIAGEM. Em QUALQUER outro
    // estado o handler do estado respondia primeiro e a pergunta nunca chegava na IA.
    // Casos reais lidos no inbox em 08/09:
    //   "Quantas UI é 7,5mg?" no PROTO_ESCOLHER      -> relistou os produtos
    //   "Acompanha água bacteriostática?" no AGUARDAR_COMPROVANTE -> "pedido em aberto"
    //   "Protocolo" dentro do atacado -> "Não encontrei Protocolo na tabela de atacado"
    // Em todos, o cliente sumiu logo depois. Agora a IA responde ANTES do handler e o
    // ESTADO É PRESERVADO — o cliente continua exatamente de onde parou.
    //
    // Fora desta regra (de propósito):
    //   COLETA_DADOS/OBS_TEXTO/INFORMAR_CUPOM -> o cliente está DIGITANDO um dado livre;
    //   MENU/TRIAGEM/DUVIDAS_LIVRE            -> já tratam dúvida no lugar certo;
    //   PROTO_CLIENTE/PROTO_IDENTIFICAR/ADM   -> esperam sim/não, CPF ou senha;
    //   mídia (comprovante), número puro e palavra de navegação -> não são pergunta.
    // Estes estados JÁ chamam tratarTextoLivre(), que já consulta ehDuvida() e já manda
    // pedido de protocolo pro fluxo certo — desviar antes deles só atrapalharia.
    // (Os estados do ATACADO ficam de fora porque lá a BUSCA na tabela vem primeiro —
    //  "tem klow?" tem que mostrar o preço do atacado, não virar papo. Quando a busca
    //  não acha nada, é o próprio atkAbrirBusca que manda pra IA.)
    const _JA_TRATA_DUVIDA = ['MENU','TRIAGEM','PRAZOS_RASTREIO','DUVIDAS','DUVIDAS_LIVRE','SUBMENU_TESTO','ESTER_BASE','PEPTIDEOS','HORMONIOS','FABRICANTES','LISTA_PRODUTOS','QUANTIDADE','STACK_PROXIMO','CARRINHO','REMOVER_ITEM','POS_TABELA_FRAC','ATACADO','ATK_LISTA','ATK_QTD','ATK_CART','ATK_REMOVER','ATK_CONFIRMAR','ATK_BLOQUEIO'];
    // Nestes o cliente está DIGITANDO um dado livre (endereço, observação, cupom, CPF,
    // sim/não) — uma frase com "?" ali é parte do dado, não pergunta pra IA.
    const _DADO_LIVRE = ['COLETA_DADOS','OBS_TEXTO','INFORMAR_CUPOM','ADM','PROTO_CLIENTE','PROTO_IDENTIFICAR','PROTO_HUMANO'];
    const _ehMidiaMsg = !!(body.type || body.mediaUrl || body.media_url || body.fileUrl || body.url || body.arquivo || body.file || body.caption !== undefined);
    const _ehNavegacao = /^\s*\d{1,3}\s*$/.test(n) || /^(menu|voltar|volta|sair|cancelar|inicio|come[cç]ar)$/.test(n);
    if (state && _JA_TRATA_DUVIDA.indexOf(state) < 0 && _DADO_LIVRE.indexOf(state) < 0
        && !_ehMidiaMsg && !_ehNavegacao
        && (ehDuvida(n) || ehPedidoProtocoloCompleto(n))) {
      console.log('[DUVIDA-FORA-DO-MENU] state:', state, '| msg:', String(mensagem).slice(0, 60));
      await saveSession(sid, { ...session, errosSeguidos: 0 });   // estado PRESERVADO
      return await responderComIA(sid, mensagem, contextoLista(session), respond);
    }

    // ── NOME DE PRODUTO VALE EM QUALQUER ESTADO (17/09/2026) ──────────────────
    // Se o cliente escreve o nome de um produto do catálogo, ele quer VER O PREÇO — não
    // importa em que ponto da árvore a sessão dele esteja. Antes isso só acontecia nos
    // estados que chamam tratarTextoLivre(); em RASTREAR, por exemplo, "Retatrutida" virava
    // "não encontrei nenhum pedido com esse dado" e a venda morria ali.
    // Só entra quando NÃO atrapalha ninguém:
    //   emCheckout / _DADO_LIVRE  -> o cliente está fechando pedido ou digitando um dado;
    //   _JA_TRATA_DUVIDA          -> esses estados JÁ reconhecem produto (seria redundante);
    //   _ESPERA_RESPOSTA_CURTA    -> esperam 1/2, sim/não, UF ou número — não é nome de produto;
    //   mídia / número puro / palavra de navegação -> não é nome de produto.
    // E só no modo 'canonico' (nome cheio e sem ambiguidade). Apelido/gíria continua
    // passando pelo caminho normal, que pergunta "Você quis dizer X?" antes.
    const _ESPERA_RESPOSTA_CURTA = ['CONFIRMAR_CARRINHO','CONFIRMAR_PRODUTO','CONFIRMAR_VER_PRODUTO','PROMO_OFERECER','RETOMAR_CARRINHO','SORTEIO','PRAZO_TIPO','FRETE_AVULSO','BUSCA_LIVRE','PERGUNTA_CUPOM'];
    if (state && !emCheckout
        && _JA_TRATA_DUVIDA.indexOf(state) < 0
        && _DADO_LIVRE.indexOf(state) < 0
        && _ESPERA_RESPOSTA_CURTA.indexOf(state) < 0
        && !(state === 'RASTREAR' && termosRastreio(mensagem).length)   // v85: no rastreio, mensagem com pedido/CPF/e-mail é consulta
        && !_ehMidiaMsg && !_ehNavegacao) {
      const _recGlobal = reconhecerProduto(n);
      if (_recGlobal && _recGlobal.modo === 'canonico') {
        console.log('[PRODUTO-EM-QUALQUER-ESTADO] state:', state, '| produto:', _recGlobal.entry && _recGlobal.entry.label);
        return await tratarTextoLivre(session, sid, n, buildMenuPrincipal(), respond);
      }
    }

    // ── MENU DE ENTRADA DA STELLA ─────────────────────────────────────────────
    // 1 site · 2 grupos · 3 produtos (cai no menu normal) · 4 cupom de boas-vindas.
    // Qualquer outra coisa que o lead escrever aqui segue o fluxo normal (IA, produto
    // reconhecido, etc.) — o menu não prende ninguém.
    if (state === 'MENU_STELLA') {
      if (n === '0' || n === 'voltar' || n === 'volta') {
        return respond('↩️ *Voltando ao menu*\n\n' + MSG_BOAS_VINDAS_STELLA);
      }
      if (n === '1' || n === 'site') {
        return respond(MSG_STELLA_SITE);
      }
      if (n === '2' || n === 'grupo' || n === 'grupos') {
        return respond(MSG_STELLA_GRUPOS);
      }
      if (n === '3' || n === 'produtos' || n === 'ver produtos') {
        await saveSession(sid, { ...session, state:'MENU' });
        return respond(buildMenuPrincipal());
      }
      if (n === '4' || n.includes('cupom')) {
        const cupom = await criarCupomBoasVindas(sid);
        if (cupom) return respond(msgCupomBoasVindas(cupom));
        // Não conseguiu gravar o cupom: NÃO inventa código. Assume e segue.
        return respond('Ops, não consegui gerar seu cupom agora. 😕 Me chama daqui a pouco que eu tento de novo — ou digite *3* que eu já te mostro os produtos.');
      }
      // não é opção do menu → deixa o fluxo normal cuidar (produto, dúvida, IA…)
    }

    // ── CUPOM DE BOAS-VINDAS EM QUALQUER ESTADO (08/09/2026) ─────────────────
    // O gatilho existia SÓ dentro do MENU_STELLA. Como o follow-up de 3h é enviado pelo
    // FLUXO do BotConversa (o código nem sabe que ele saiu), o lead voltava com a sessão em
    // outro estado e o pedido caía na IA — que respondia falando da promoção 9.9 em vez de
    // gerar o cupom prometido. Caso real, 08/09 ("Quero" e "Cupom" às 05:30).
    // Exige intenção EXPLÍCITA de cupom de boas-vindas: um "tem cupom?" solto no fechamento
    // continua sendo assunto do checkout, não gera cupom.
    if (nomeAssistente !== 'Athena' && !emCheckout && ehPedidoCupomBemVindo(n)) {
      const _cupomBV = await criarCupomBoasVindas(sid);
      if (_cupomBV) return respond(msgCupomBoasVindas(_cupomBV));
      return respond('Ops, não consegui gerar seu cupom agora. 😕 Me chama daqui a pouco que eu tento de novo — ou digite *3* que eu já te mostro os produtos.');
    }

    // ── LEAD FRIO: clique no botão "Sim, quero conhecer" do template aprovado pela Meta ──
    // O WhatsApp envia o texto do botão como mensagem. Detecta, apresenta a VitaFlow e abre o menu.
    // Não dispara em estados de pagamento (pra não atrapalhar quem já está comprando).
    // 17/09/2026: lead que digita "ver produtos" / "produtos" / "catálogo" quer o MENU, não a IA.
    // Caso real: lead frio da Athena digitou "Ver produtos" e "Emagrecedores" à mão e recebeu
    // prosa da IA nas duas — nunca viu o menu numerado.
    const ehLeadConhecer = (n.includes('quero conhecer') || n === 'sim quero conhecer'
      || n === 'quero ver'
      || /^(quero )?(ver|conhecer|mostrar?|me mostra) (os |o |seus |seu )?(produtos|catalogo|precos|valores|tabela de precos)$/.test(n.trim())
      || /^(produtos|catalogo|ver catalogo|lista de produtos|quais produtos|o que voces vendem|o que voce vende|que produtos voces tem)$/.test(n.trim()))
      && !emCheckout;
    if (ehLeadConhecer) {
      // 17/09/2026 — decisão do Thiago: a partir do momento que o lead se interessa e pede
      // o menu, a STELLA age EXATAMENTE IGUAL À ATHENA. A porta de entrada própria dela
      // (site/grupos/produtos/cupom) mandava o lead pra uma árvore paralela onde a venda
      // não acontecia. Agora as duas caem no mesmo menu de compra.
      await saveSession(sid, { ...session, state:'MENU' });
      return respond(MSG_BOAS_VINDAS_LEAD + '\n\n' + buildMenuPrincipal());
    }

    // ── RECUPERAÇÃO DE CARRINHO: botões do template 'athenarecuperacarrinho' (dia seguinte) ──
    // O template (disparado pelo GAS recuperarCarrinhosDiaSeguinte, +24h) tem 2 botões de resposta
    // rápida. O WhatsApp envia o TEXTO do botão como mensagem — tratamos aqui, antes do roteamento.
    //   "Quero finalizar" → a Athena GERA UM LINK NOVO (o antigo pode ter expirado) pro MESMO pedido.
    //   "Tive uma dúvida"  → conversa consultiva; se o cliente reclamar de preço, a NEGOCIAÇÃO de 5%
    //                        (mais abaixo) assume — 5% sobre os produtos do carrinho, sem somar o 3%.
    // Guard state!=='COLETA_DADOS': quem já pagou está informando endereço; não intercepta.
    if (n === 'quero finalizar' && state !== 'COLETA_DADOS') {
      const pend = await lerPending(sid);
      if (pend && Array.isArray(pend.carrinho) && pend.carrinho.length) {
        const carrinho = pend.carrinho;
        const frete = pend.freteSelecionado || { label: pend.frete || 'Frete', valor: 0 };
        const desc = pend.descontoReais || 0;
        const descPromo = pend.descontoPromo || 0;
        const totalPend = (typeof pend.total === 'number') ? pend.total : (parseFloat(pend.valor) || 0);
        const estadoPend = pend.estado || pend.estadoCliente || session.estadoCliente || '';
        // link NOVO pro MESMO order_nsu (não duplica pedido; mesmo padrão da negociação)
        const [novoLink, novoPix] = await Promise.all([
          gerarLinkInfinitePay(carrinho, frete.valor || 0, pend.order_nsu, desc + descPromo),
          gerarPixBraspay(pend.order_nsu, totalPend, true)
        ]);
        await salvarPendingMerge(pend.pKey, { link: novoLink || pend.link || '', pix: novoPix ? novoPix.code : '', pix_ref: novoPix ? novoPix.ref : '' });
        await saveSession(sid, { ...session, state:'AGUARDAR_COMPROVANTE', carrinho, freteSelecionado: frete,
          estadoCliente: estadoPend, total: totalPend, descontoReais: desc, descontoPromo: descPromo,
          descontoLabel: pend.descontoLabel || '', descontoTipo: pend.descontoTipo || '',
          orderNsu: pend.order_nsu, link: novoLink || pend.link || '', ...camposPixSessao(novoPix, totalPend),
          cupomDocId: pend.cupomDocId || null, cupomCodigo: pend.cupomCodigo || null });
        await enviarTelegram(`🔁 *RECUPERAÇÃO — Quero finalizar*\n📦 ${pend.order_nsu||'—'}\n📱 ${sid}\n💳 Link novo gerado`);
        return await responderDiretoMulti(sid, [
          `Que bom que você voltou! 🙌 Já *renovei seu pagamento* (o anterior podia ter expirado):\n\n` +
          `${resumoCarrinho(carrinho)}\n` +
          `🚚 ${frete.label || 'Frete'}${estadoPend ? ' — ' + estadoPend : ''}\n` +
          `💰 *Total: R$ ${totalPend.toFixed(2).replace('.',',')}*\n\n` +
          blocoPagamento(novoPix, novoLink, nomeAssistente === 'Athena') +
          (novoPix ? '' : `_No link você paga *à vista no Pix (sem juros)* ou *parcela em até 12x* no cartão. `) +
          (novoPix ? `_Assim que você pagar, *eu confirmo automaticamente aqui* e já sigo com seu envio._ 🚀` : `Assim que você pagar, *eu confirmo automaticamente aqui* e já sigo com seu envio._ 🚀`),
          novoPix ? novoPix.code : ''
        ], respond, nomeAssistente);
      }
      // sem pedido salvo (carrinho do site, ou link já limpo): se a sessão ainda tem carrinho, vai pro checkout; senão, menu.
      if (Array.isArray(session.carrinho) && session.carrinho.length) {
        return await irParaCheckout(session, sid, respond);
      }
      await saveSession(sid, { ...session, state:'MENU' });
      return respond(`Que bom que você voltou! 🙌 Me conta o que você tinha no carrinho (ou o que procura) que eu já monto pra você e te passo o link certinho. 💚\n\n` + buildMenuPrincipal());
    }
    if (n === 'tive uma duvida' && state !== 'COLETA_DADOS') {
      await saveSession(sid, { ...session, state:'MENU' });
      await enviarTelegram(`🔁 *RECUPERAÇÃO — Tive uma dúvida*\n📱 ${sid}`);
      return respond(`Claro, tô aqui pra isso! 😊 Me conta o que ficou de dúvida — pode ser sobre o *produto*, a *entrega*, o *pagamento* ou o *preço*. A gente resolve juntos pra você fechar tranquilo. 💚`);
    }

    const ehPromo = n.includes('promo') || n.includes('namorados');
    if (ehPromo && !emCheckout) {
      if (PROMO_GENESIS.ativa) return await anunciarGenesis(session, sid, respond);
      const msg = await abrirPromo(session, sid);     // se a Relâmpago for reativada, ela tem prioridade
      if (msg) return respond(msg);
      if (PROMO_PRODUTO.ativa) return respond(await anunciarLancamento(session, sid));
      await saveSession(sid, { ...session, state:'MENU' });
      return respond(msgPromoAtual() + '\n\n0️⃣ Voltar ao menu');
    }

    const saudacoes = ['ola','olá','oi','oii','opa','eai','e ai','bom dia','boa tarde','boa noite','hi','hello','tudo bem','tudo bom'];
    // v84: (a) saudação SEGUIDA de assunto (12+ letras depois de tirar "ola/bom dia/tudo bem…") não é só saudação — segue pro
    //          tratamento normal, senão o assunto se perde ("Ola meu pedido veio errado" recebia só o menu);
    //      (b) em OBS_TEXTO o cliente está ESCREVENDO a observação: "Olá Michel, …" é a observação, não um oi (só "menu" sai);
    //      (c) com pedido em aberto, "cancelar" / "não quero mais" vale como "menu" (é o que o aviso do pedido em aberto manda digitar).
    const _soComando = n === 'menu' || n === 'inicio' || n === 'voltar' || n === 'start';
    const _saudacaoComAssunto = !_soComando && _restoSemSaudacao(n).replace(/\s/g, '').length >= 12;
    const _cancelaPendente = state === 'AGUARDAR_COMPROVANTE' && /^(quero |pode |vou )?(cancelar|cancela|cancelo|desistir|desisti|desisto)( o| a| meu| minha)?( pedido| compra)?[!.]*$|^nao (quero|vou querer) mais[!.]*$/.test(n);
    const ehSaudacaoOuMenu = _cancelaPendente || _soComando
      || (state !== 'OBS_TEXTO' && !_saudacaoComAssunto && saudacoes.some(s => n === s || n.startsWith(s+' ') || n.startsWith(s+'!')));

    // ── "0" ou "voltar" = sobe UM nível na árvore (só nos menus navegáveis). "menu" continua indo pro início. ──
    // 18/09/2026 — o VitaFlow pediu que o "0" volte um nível em TODO menu, não só nas listas.
    // Auditei os 49 estados: só 19 aceitavam. Entraram os 9 menus de NAVEGAÇÃO (grupo A).
    // NÃO entram, de propósito: COLETA_DADOS e AGUARDAR_COMPROVANTE (pedido JÁ PAGO, tem trava),
    // o miolo do checkout (ESTADO/FRETE/OBS/CUPOM/CONFIRMAR — o 0 por engano faria o cliente
    // perder um passo do fechamento), as perguntas de 2 opções (CONFIRMAR_PRODUTO, PROMO_OFERECER,
    // RETOMAR_CARRINHO, SORTEIO, STACK_PROXIMO, ESCOLHER_BRINDE), TRIAGEM (é o topo) e as telas
    // de bloqueio/admin.
    const NAV_VOLTAR = ['MENU_STELLA','MENU','PEPTIDEOS','HORMONIOS','SUBMENU_TESTO','ESTER_BASE','FABRICANTES','BUSCA_LIVRE','LISTA_PRODUTOS','QUANTIDADE','PRAZOS_RASTREIO','PRAZO_TIPO','FRETE_AVULSO','RASTREAR','DUVIDAS','DUVIDAS_LIVRE','ATACADO','ATK_LISTA','ATK_QTD',
      'CARRINHO','REMOVER_ITEM','ATK_CART','ATK_REMOVER','POS_TABELA_FRAC','PROTO_TIPO','PROTO_ESCOLHER','PROTO_IDENTIFICAR','PROTO_CLIENTE'];
    if ((n === '0' || n === 'voltar' || n === 'volta') && NAV_VOLTAR.indexOf(state) >= 0) {
      return await voltarAthena(session, sid, respond);
    }
    // COLETA_DADOS = pedido JÁ PAGO. Não deixa cair no menu por saudação; só sai com "menu" explícito.
    if (ehSaudacaoOuMenu && state === 'COLETA_DADOS' && n !== 'menu') {
      return respond('Seu pedido já está *pago e garantido*! 🧡 Só preciso dos dados de envio pra concluir.\n\nMe manda em linhas separadas: nome, CPF, telefone, rua e número, bairro, cidade, estado e CEP. 😊');
    }
    if (ehSaudacaoOuMenu) {
      // CARRINHO NUNCA SE PERDE: se o cliente volta (saudação/menu) e ainda tem itens no
      // carrinho, LEMBRA e pergunta se quer continuar ou começar do zero — nunca apaga sozinho.
      const _car = session.carrinho || [];
      if (_car.length && !['AGUARDAR_COMPROVANTE','COLETA_DADOS'].includes(state)) {
        await saveSession(sid, { ...session, state:'RETOMAR_CARRINHO' });
        return respond(
          `Oi de novo! 😊 Você já tinha começado uma compra e ainda tem *${_car.length} ${_car.length>1?'itens':'item'}* no carrinho:\n\n` +
          `${resumoCarrinho(_car)}\n\n` +
          `Quer *continuar essa compra* ou *começar do zero*?\n\n` +
          `1️⃣ Continuar de onde parei\n2️⃣ Começar uma nova compra (esvaziar o carrinho)`
        );
      }
      await saveSession(sid, { ...session, state:'TRIAGEM' });
      return respond(buildTriagem());
    }
    // Retomada do carrinho salvo (cliente escolheu continuar ou zerar)
    if (state === 'RETOMAR_CARRINHO') {
      if (num === 1) { await saveSession(sid, { ...session, state:'CARRINHO' }); return respond(`Boa, continuando sua compra! 🛒\n\n${msgCarrinhoMenu(session.carrinho || [])}`); }
      if (num === 2) { await saveSession(sid, { state:'TRIAGEM' }); return respond(`Prontinho, comecei um carrinho novo! 🧹\n\n${buildTriagem()}`); }
      if (!ehIntencaoRastreio(n, mensagem)) return respond('Digite *1* para continuar sua compra de antes ou *2* para começar do zero:');
      // v85: "meus pedidos" / "rastreamento" / nº do pedido aqui é rastreio — segue pro rastreio universal (o carrinho continua salvo).
    }

    // REVENDA vem ANTES da transferência pra humano: 'vendedor' (da lista abaixo) é
    // SUBSTRING de 're-vendedor', então "quero ser revendedor" era transferido pra
    // atendente em vez de receber o link de cadastro. Detectado em 08/09/2026.
    const ehRevenda = ["revenda","revender","revendedor","revendedora","revendedores","seja revendedor","ser revendedor","quero revender","como revender","programa de revenda","preço de revenda","preco de revenda","virar revendedor","quero ser revendedor","como funciona a revenda","como funciona revenda"].some(p => n.includes(p));
    if (ehRevenda && !emCheckout) {
      await saveSession(sid, { ...session, state:'MENU', errosSeguidos:0 });
      return respond(MSG_REVENDEDORES);
    }

    const palavrasHumano = ['atendente','atendimento','humano','vendedor','pessoa real','falar com alguem','falar com pessoa','falar com atendimento','quero atendimento','suporte','reclamacao','reclamar'];
    // Em estados críticos (carrinho/pedido pago) NÃO apaga a sessão — escala mas preserva o pedido.
    const estadoCritico = ['CARRINHO','ESTADO','FRETE','PERGUNTA_CUPOM','INFORMAR_CUPOM','CONFIRMAR','ESCOLHER_BRINDE','PROTO_CLIENTE','PROTO_IDENTIFICAR','PROTO_ESCOLHER','PROTO_TIPO','POS_TABELA_FRAC','PROTO_HUMANO','AGUARDAR_COMPROVANTE','COLETA_DADOS'].includes(state);
    if (palavrasHumano.some(p => n.includes(p)) || (state !== 'OBS_TEXTO' && state !== 'COLETA_DADOS' && ehReclamacaoPedido(n))) {   // v84: pedido errado/faltando → atendente
      await enviarTelegram(`🔔 CLIENTE QUER HUMANO\n📱 ${sid}\n📍 Estado: ${state}\n💬 ${mensagem}`);
      const _temCar = session.carrinho && session.carrinho.length;
      // Nunca apaga o carrinho: só limpa a sessão se NÃO for estado crítico E não houver carrinho.
      if (!estadoCritico && !_temCar) await deleteSession(sid);
      return transferir((estadoCritico || _temCar)
        ? 'Vou chamar um atendente pra te ajudar! 😊 Fica tranquilo que *seu pedido continua salvo* aqui comigo. Aguarde um momento.'
        : 'Vou te transferir para um atendente agora! 😊 Aguarde um momento.');
    }

    // ── NEGOCIAÇÃO (Entrega 4): reclamou do preço → libera teto de 5% (só quem entrou com os 3% Athena) ──
    const palavrasNegoc = ['caro','ta caro','muito caro','salgado','ta salgado','preco alto','mais barato','abaixa','abaixar','baixa o preco','desconto','condicao','melhora o preco','faz por menos','ta puxado','pesado no bolso','sem condicao'];
    if (palavrasNegoc.some(p => n.includes(p)) && state !== 'COLETA_DADOS' && !(await lerAguardandoDados(sid))) {
      const pend = await lerPending(sid);
      if (pend && pend.descontoTipo === 'athena' && !pend.negociado) {
        const carrinho = pend.carrinho || [];
        const frete = pend.freteSelecionado || {};
        const totalProd = carrinho.reduce((s,i)=>s + i.preco*i.qtd, 0);
        // 5% só sobre os produtos DESCONTÁVEIS — os que estão na lista "sem desconto" ficam de fora.
        const _semDescNeg = await lerSemDescontoNomes();
        const _promoPNeg = await lerPromoPrecos();
        const baseNeg = carrinho.reduce((s,i)=> s + ((produtoBloqueado(i.nome, _semDescNeg) || grupoPromoDoItem(i.nome, _promoPNeg)) ? 0 : i.preco*i.qtd), 0);
        if (totalProd > 0 && baseNeg > 0) {
          const novoDesc = baseNeg * (NEGOCIACAO_PCT_TOTAL/100); // 5% sobre o subtotal descontável (bloqueados fora)
          const novoTotal = totalProd - novoDesc + (frete.valor||0);
          const [novoLink, novoPix] = await Promise.all([
            gerarLinkInfinitePay(carrinho, frete.valor, pend.order_nsu, novoDesc),
            gerarPixBraspay(pend.order_nsu, novoTotal, true)
          ]);
          const lbl = `Desconto especial (-${NEGOCIACAO_PCT_TOTAL}%)`;
          await salvarPendingMerge(pend.pKey, { negociado:true, descontoReais:novoDesc, descontoLabel:lbl, total:novoTotal, link: novoLink || pend.link || '', pix: novoPix ? novoPix.code : '', pix_ref: novoPix ? novoPix.ref : '' });
          await saveSession(sid, { ...session, state:'AGUARDAR_COMPROVANTE', carrinho, freteSelecionado:frete, estadoCliente: pend.estado || session.estadoCliente, total:novoTotal, descontoReais:novoDesc, descontoLabel:lbl, descontoTipo:'athena', orderNsu:pend.order_nsu, link: novoLink || pend.link || '', ...camposPixSessao(novoPix, novoTotal), cupomDocId:null, cupomCodigo:null });
          await enviarTelegram(`🤝 *NEGOCIAÇÃO (Athena)*\n📦 ${pend.order_nsu||'—'}\n📱 ${sid}\n💸 Desconto especial ${NEGOCIACAO_PCT_TOTAL}% → R$ ${novoTotal.toFixed(2).replace('.',',')}`);
          return await responderDiretoMulti(sid, [
            `Olha, vou fazer uma condição ESPECIAL pra você fechar agora comigo! 🤝\n\n` +
            `Consegui liberar *${NEGOCIACAO_PCT_TOTAL}% de desconto* — o máximo que posso dar — no seu pedido:\n\n` +
            `${resumoCarrinho(carrinho)}\n` +
            `🚚 ${frete.label||'Frete'} — ${pend.estado||''}\n` +
            `🏷️ ${lbl}\n` +
            `💰 *Novo total: R$ ${novoTotal.toFixed(2).replace('.',',')}*\n\n` +
            blocoPagamento(novoPix, novoLink, nomeAssistente === 'Athena') +
            `_Assim que você pagar, *eu confirmo automaticamente aqui* e já sigo com seu envio — não precisa enviar comprovante._ 🚀`,
            novoPix ? novoPix.code : ''
          ], respond, nomeAssistente);
        }
      }
      // sem pedido elegível (cupom maior, promoção, ou já negociado) → segue o fluxo normal
    }

    // ── LANÇAMENTO DIAMOND (Landerlan) ── só "diamond" + termo de linha/marca/chegada. Produto SEMPRE ganha
    // ("retatrutida veltrane diamond" é produto normal do varejo). "diamond" solto NÃO dispara (segue pra IA, que tem contextoDiamond).
    const ehDiamond = LANC_DIAMOND.ativa && !emCheckout && state !== 'ADM'
      && !['AGUARDAR_COMPROVANTE','COLETA_DADOS','PROTOCOLO'].includes(state)
      && n.includes('diamond')
      && /landerlan|linha diamond|diamond premium|lancamento|cheg(ou|a|aram|ando)/.test(n)
      && !/veltrane|retatrutida|\breta\b/.test(n)
      && !reconhecerProduto(n);
    if (ehDiamond) {
      return respond(msgDiamond());
    }

    // ── Grupo VIP (WhatsApp/Telegram) ── reconhece pergunta sobre grupo/comunidade ──
    const ehGrupo = (n.includes('grupo') || n.includes('comunidade') || n.includes('vip') || n.includes('telegram') ||
      (n.includes('whats') && (n.includes('grupo') || n.includes('vip') || n.includes('comunidade'))))
      && !emCheckout
      && !/\bvip\s*\d|\d\s*mg\b|peptide/.test(n);   // v90: "VIP 10mg - Health Peptides" é produto, não o grupo
    if (ehGrupo) {
      return respond(msgGrupoVip());
    }

    // ── SORTEIO ── "quantos números eu tenho", "sorteio", "meus números" ──
    if (!emCheckout && state !== 'ADM' && !['AGUARDAR_COMPROVANTE','COLETA_DADOS','PROTOCOLO'].includes(state) && ehIntencaoSorteio(n)) {
      if (ehCPFsolto(mensagem)) {
        const _cpfS = idCpf(mensagem);
        if (!_cpfS.cpf) { await saveSession(sid, { ...session, state:'SORTEIO' }); return respond(respostaIdIncompleto(mensagem, false)); }
        const _s = await consultarSorteioGAS(_cpfS.cpf);
        await saveSession(sid, { ...session, state:'MENU' });
        return respond(_s ? msgMeusNumeros(_s)
          : `😕 Não consegui consultar seus números agora. Tenta de novo em instantes, ou veja em ${SORTEIO.link}`);
      }
      await saveSession(sid, { ...session, state:'SORTEIO' });
      return respond(msgSorteio());
    }

    // ── SORTEIO: cliente já está no estado e mandou o CPF ──
    if (state === 'SORTEIO') {
      const _cpfS2 = idCpf(mensagem);                       // v81: no SORTEIO o cliente está mandando o CPF — vale em qualquer formato
      if (!_cpfS2.cpf && _cpfS2.errado) return respond(respostaIdIncompleto(mensagem, false) + `\n\n_Digite *menu* para voltar._`);
      if (_cpfS2.cpf) {
        const _s = await consultarSorteioGAS(_cpfS2.cpf);
        await saveSession(sid, { ...session, state:'MENU' });
        return respond(_s ? msgMeusNumeros(_s)
          : `😕 Não consegui consultar seus números agora. Tenta de novo em instantes, ou veja em ${SORTEIO.link}`);
      }
      if (!['menu','voltar','0'].includes(n.trim())) {
        return respond(`Me manda o seu *CPF* (só os números) que eu confiro quantos números da sorte você já tem. 😊\n\n_Digite *menu* para voltar._`);
      }
    }

    // ── MODO ADM ── só do número autorizado E com a senha ──
    if (tentaEntrarAdm(sid, mensagem)) {
      await saveSession(sid, { ...session, state:'ADM' });
      return respond(msgAdmMenu());
    }
    if (state === 'ADM') {
      const raw = String(mensagem || '').trim();
      const low = raw.toLowerCase();
      if (/^(sair|menu|voltar|exit)$/.test(low)) {
        await saveSession(sid, { ...session, state:'MENU' });
        return respond(`✅ Saí do modo ADM. Atendimento normal de volta.\n\n` + buildMenuPrincipal());
      }
      if (/^(tabelas|listar|lista)$/.test(low)) return respond(await msgAdmTabelas());
      if (/^promo$/.test(low)) {
        return respond(`🔎 *O QUE EU SEI DE PROMOÇÃO AGORA*\n_(é exatamente isto que vai pra IA)_\n\n` + (await contextoPromo()));
      }
      let m = raw.match(/^tabela\s+(.+)$/i);
      if (m) return respond(await msgAdmTabela(m[1]));
      m = raw.match(/^protocolo\s+(.+)$/i);
      if (m) return respond(await admProtocolo(sid, m[1]));
      return respond(msgAdmMenu());
    }

    // ── RASTREIO universal ── cliente manda CPF, nº de pedido ou pede rastreio em QUALQUER menu ──
    // Trava: nunca em estados de pagamento. E não rouba número simples de menu (1-2 dígitos puros).
    const ehNumeroSimplesMenu = /^\d{1,2}$/.test(n.trim());
    if (!['AGUARDAR_COMPROVANTE','COLETA_DADOS','RASTREAR','PROTOCOLO','SORTEIO','ADM'].includes(state)
        && !emCheckout
        && !ehNumeroSimplesMenu
        && ehIntencaoRastreio(n, mensagem)) {
      // Se só pediu "rastrear" sem informar o dado, leva ao estado RASTREAR pedindo o dado.
      if (!ehNumeroPedido(mensagem) && !ehCPFsolto(mensagem) && !mensagem.includes('@')) {
        await saveSession(sid, { ...session, state:'RASTREAR' });
        const _incU = respostaIdIncompleto(mensagem, true);   // v81: "cadê meu pedido S012" → pede dia e mês
        if (_incU) return respond(_incU + `\n\n_Ou digite *menu* para voltar._`);
        return respond(`*📦 RASTREAR MEU PEDIDO*\n\nMe envia o *número do pedido*, seu *CPF* ou o *e-mail* da compra que eu consulto o status pra você na hora! 😊\n\n_Digite *menu* para voltar._`);
      }
      // Já mandou o dado (CPF/pedido/email) → rastreia direto, sem perder o estado de compra.
      return await fazerRastreio(extrairTermoRastreio(mensagem), respond, mensagem);
    }
    // ── RASTREIO DENTRO DO ATACADO (17/09/2026) ──────────────────────────────
    // ATACADO/ATK_* contam como checkout (blindagem), então o bloco acima não entra lá. Só que
    // cliente antigo entra no atacado e pergunta do pedido que já fez: "rastreio" virava busca
    // na tabela ("Não encontrei rastreio na tabela de atacado") e "VF-1409-S011 sobre esse
    // pedido?" ia pra IA, que INVENTAVA "vou consultar... o sistema vai buscar" — caso real 17/09
    // (Lauricio, 6 minutos de vácuo até ele digitar "menu"). Aqui só entra com sinal FORTE
    // (palavra de rastreio explícita, nº VF, CPF ou e-mail) — "meu pedido" solto NÃO conta, porque
    // no atacado "fechar meu pedido" é fechamento. E NUNCA muda o estado: o carrinho de atacado
    // continua exatamente onde estava.
    const _ehAtkNavegacao = ['ATACADO','ATK_LISTA','ATK_QTD','ATK_CART'].includes(state);
    if (_ehAtkNavegacao && !ehNumeroSimplesMenu && !_ehMidiaMsg) {
      const _temDadoRastreio = ehNumeroPedido(mensagem) || ehCPFsolto(mensagem) || /[\w.+-]+@[\w-]+\.[\w.-]+/.test(mensagem);
      const _pedeRastreio = /(rastre|codigo de rastreio|status do (meu )?pedido|cade meu pedido|onde esta meu pedido|nao chegou|nao recebi)/.test(n);
      if (_temDadoRastreio) {
        console.log('[RASTREIO-NO-ATACADO] state:', state, '| termo:', extrairTermoRastreio(mensagem));
        return await fazerRastreio(extrairTermoRastreio(mensagem), respond, mensagem);
      }
      if (_pedeRastreio) {
        return respond(`*📦 RASTREAR MEU PEDIDO*\n\nMe envia o *número do pedido* (começa com *VF-*), seu *CPF* ou o *e-mail* da compra que eu consulto o status pra você na hora! 😊\n\n_Seu pedido de atacado continua salvo aqui — depois é só seguir de onde parou._`);
      }
    }

    // (a detecção de revenda subiu pra antes da transferência pra humano — ver acima.
    //  Continua valendo a regra de vir ANTES do atacado: "revenda" não é "atacado".)

    // "varejo" = os produtos NORMAIS da VitaFlow (os mesmos do site), fora do atacado. Reconhece,
    // explica e leva pro catálogo normal. Vem ANTES do atacado: se o cliente falou "varejo", é varejo.
    const ehVarejo = n.includes('varejo');
    if (ehVarejo && !emCheckout) {
      await saveSession(sid, { ...session, state:'MENU' });
      return respond(`Sim! 😊 No *varejo* você leva *qualquer quantidade* — são os mesmos produtos do nosso site (*vitaflowoficial.com*), com os *${DESCONTO_ATHENA_PCT}% de desconto* e as promoções ativas. _(O *atacado* é o outro caminho: pedido mínimo de R$ 3.000, com frete grátis.)_\n\n` + buildMenuPrincipal());
    }

    const ehAtacado = ["atacado","mayoreo","por atacado","compra grande","grande quantidade","tabela de atacado"].some(p => n.includes(p));
    if (ehAtacado && !emCheckout) {
      return await entrarAtacado(session, sid, respond);
    }

    const ehTabela = ["tabela","lista de preco","lista de preços","catalogo","catálogo","tabela de preco","tabela de preços","lista completa","ver precos","ver preços"].some(p => n.includes(p));
    // "tabela" casava como substring solta: "tabela de fracionamento" caia AQUI (tabela de
    // precos) e nunca chegava no fluxo de fracionamento. 16/09/2026 — excecao explicita.
    if (ehTabela && !ehAtacado && !emCheckout && !ehPedidoFracionamento(n)) {
      await saveSession(sid, { ...session, state:'MENU' });
      return respond('📋 *Nossa tabela de preços é o nosso site oficial!* 🧡\n\nLá você vê *todos os produtos* com *preços atualizados em tempo real*, fotos, descrição e o que está disponível na hora — sempre em dia, sem tabela desatualizada.\n\n👉 vitaflowoficial.com\n\nÉ só entrar, escolher o que quiser e finalizar por lá — ou continuar comigo aqui que eu te ajudo. 😊\n\n0️⃣ Voltar ao menu');
    }

    const ehPerguntaPrazo = ["prazo","quanto tempo","quantos dias","demora","chega em","tempo de entrega","prazo de entrega","prazo de postagem"].some(p => n.includes(p));
    if (ehPerguntaPrazo && !emCheckout && !["ATACADO","PRAZO_TIPO"].includes(state)) {
      if (ehAtacado) { return await entrarAtacado(session, sid, respond); }
      // v78: responde DIRETO. Quem está no varejo (a imensa maioria) recebe o prazo do varejo, sem menu de opções.
      // Só quem tem carrinho de ATACADO recebe o texto completo (varejo + atacado). O estado NÃO muda:
      // o cliente continua de onde parou (lista, quantidade etc.).
      const _temCarAtk = Array.isArray(session.carrinhoAtk) && session.carrinhoAtk.length > 0;
      if (_temCarAtk) return respond(MSG_PRAZOS_COMPLETO);
      return respond(MSG_PRAZO_VAREJO + '\n\n_Pode continuar de onde parou — ou digite *menu* para ver nossos produtos._');
    }

    // v84: palavra INTEIRA — "FRETEZERO" (cupom) e "pacote" casavam no meio e abriam a consulta de frete.
    const ehPerguntaFrete = /(^|[^a-z0-9])(frete|fretes|transportadora|pac|sedex)([^a-z0-9]|$)/.test(n) || ["valor do envio","custo do envio"].some(p => n.includes(p));
    if (ehPerguntaFrete && !emCheckout && !["ATACADO","PRAZO_TIPO","FRETE_AVULSO"].includes(state)) {
      await saveSession(sid, { ...session, state:"FRETE_AVULSO" });
      return respond("🚚 *Consultar frete*\n\nMe diz o seu estado (sigla) que eu calculo na hora!\nExemplo: RJ, SP, MG, DF, BA...");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ATACADO (venda pela Athena) — mínimo R$ 3.000, frete grátis, sem 3%, sem cupom,
    // não mistura com o varejo. Tabela lida do Firebase (a mesma do Conversor/PDF).
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'ATK_BLOQUEIO') {
      if (num === 1) { return await irParaCheckout(session, sid, respond); }
      if (num === 2) { await saveSession(sid, { ...session, carrinho: [], stackFila: [], state:'ATACADO' }); return respond('Prontinho, esvaziei o varejo. 🧹\n\n' + MSG_ATACADO); }
      if (num === 3) { await saveSession(sid, { ...session, state:'MENU' }); return respond('Sem problema! 😊\n\n' + buildMenuPrincipal()); }
      return respond('Você tem itens no *carrinho do varejo*. Digite *1* pra finalizar o varejo, *2* pra esvaziar e ir pro atacado, ou *3* pra voltar ao menu:');
    }

    if (state === 'VAREJO_BLOQUEIO') {
      if (num === 1) { await saveSession(sid, { ...session, state:'ATK_CART' }); return respond(msgCarrinhoAtk(session.carrinhoAtk || [])); }
      if (num === 2) {
        await saveSession(sid, { ...session, carrinhoAtk: [], state:'QUANTIDADE' });
        const _p = session.produtoSelecionado || {};
        return respond(`Prontinho, esvaziei o atacado. 🧹\n\nAgora sim — *quantas unidades* de *${_p.nome || 'produto'}* você quer?`);
      }
      if (num === 3) { await saveSession(sid, { ...session, state:'MENU' }); return respond('Sem problema! 😊\n\n' + buildMenuPrincipal()); }
      return respond('Você tem um *pedido de atacado* em aberto. Digite *1* pra finalizar o atacado, *2* pra esvaziar e comprar no varejo, ou *3* pra voltar:');
    }

    if (state === 'ATACADO') {
      const _txtAtk = (mensagem || '').trim();
      if (num === 1) { await saveSession(sid, { ...session, state:'ATACADO' }); return respond(`📥 *Tabela completa de atacado (PDF):*\n${TABELA_ATACADO_URL}\n\nQuando escolher, me diga o *nome do produto* que você quer que eu monto seu pedido de atacado aqui mesmo. 😊`); }
      if (num === 2) { await saveSession(sid, { ...session, state:'MENU' }); return respond('Sem problema! 😊\n\n' + buildMenuPrincipal()); }
      if (!_txtAtk || _txtAtk.length < 2) return respond('Me diga o *nome do produto* do atacado (ex.: retatrutida, bpc, testosterona), ou digite *1* pra baixar a tabela em PDF, ou *2* pra voltar ao menu.');
      // v84: "varejo" sai do atacado (igual à opção 2); "finalizar pedido" fecha (igual à opção 2 do pedido de atacado) em vez de virar busca de produto.
      if (/^(varejo|no varejo|quero varejo|comprar no varejo|ir (pro|para o) varejo)$/.test(n)) { await saveSession(sid, { ...session, state:'MENU' }); return respond('Sem problema! 😊\n\n' + buildMenuPrincipal()); }
      if (_ehFinalizarTxt(_txtAtk)) {
        const _cartF = session.carrinhoAtk || [];
        if (!_cartF.length) return respond('Seu pedido de atacado está vazio. Me diga o *nome do produto* que você quer. 😊');
        const _subF = totalCarrinho(_cartF);
        if (_subF < ATACADO_MIN) { await saveSession(sid, { ...session, state:'ATK_CART' }); return respond(`Ainda não dá pra fechar: seu pedido de atacado está em *R$ ${_subF.toFixed(2).replace('.', ',')}* e o mínimo é *R$ 3.000*.\nFaltam *R$ ${faltaAtk(_subF).toFixed(2).replace('.', ',')}*.\n\nMe manda o *nome* de outro produto que eu adiciono. 😊`); }
        await saveSession(sid, { ...session, obsReturn:'atacado', state:'OBS_PERGUNTA' });
        return respond('📝 Quer adicionar alguma *observação* ao seu pedido? (ex.: ponto de referência, algum pedido especial)\n\n1️⃣ Sim\n2️⃣ Não');
      }
      return await atkAbrirBusca(session, sid, _txtAtk, respond);
    }

    if (state === 'ATK_LISTA') {
      const _t = (mensagem || '').trim();
      if (!/^\d/.test(_t)) return await atkAbrirBusca(session, sid, _t, respond); // digitou outro nome → nova busca
      const lista = session.atkLista || [];
      if (!num || num < 1 || num > lista.length) return respond(`Digite um número entre 1 e ${lista.length}, ou me manda outro *nome de produto* do atacado.`);
      const prod = lista[num - 1];
      await saveSession(sid, { ...session, state:'ATK_QTD', atkSel: prod });
      return respond(`Você escolheu:\n📦 *${prod.nome}*\n💰 R$ ${prod.preco.toFixed(2).replace('.', ',')} _(atacado)_\n\n*Quantas unidades você quer?*\n_(Digite o número)_`);
    }

    if (state === 'ATK_QTD') {
      if (!/^\d/.test((mensagem || '').trim()) && isNaN(qtdPura(mensagem))) return respond('Me diz a *quantidade* em número, por favor (ex.: 10):');
      num = qtdPura(mensagem);   // v84: "60 mg" não é quantidade
      if (!num || num < 1 || num > 999) return respond('Informe uma quantidade válida (1 a 999):');
      const prod = session.atkSel || {};
      const cart = session.carrinhoAtk || [];
      const ix = cart.findIndex(function (i) { return i.nome === prod.nome; });
      if (ix >= 0) cart[ix].qtd += num; else cart.push({ nome: prod.nome, preco: prod.preco, qtd: num, atacado: true });
      await saveSession(sid, { ...session, state:'ATK_CART', carrinhoAtk: cart, atkSel: null });
      return respond(`✅ Adicionado ao pedido de *atacado*:\n📦 *${prod.nome}* x${num}\n\n${msgCarrinhoAtk(cart)}`);
    }

    if (state === 'ATK_CART') {
      const cart = session.carrinhoAtk || [];
      const _t = (mensagem || '').trim();
      if (num === 1) { await saveSession(sid, { ...session, state:'ATACADO' }); return respond('Beleza! Me diga o *nome do produto* de atacado que você quer adicionar. 👇\n\n_(Ou digite *1* pra baixar a tabela completa em PDF.)_'); }
      if (num === 2 || (!/^\d/.test(_t) && !_ehQueroFechar(_t) && _ehFinalizarTxt(_t))) {   // v84: "finalizar pedido" por extenso = opção 2
        if (!cart.length) { await saveSession(sid, { ...session, state:'ATACADO' }); return respond('Seu pedido de atacado está vazio. Me diga o *nome do produto* que você quer. 😊'); }
        const sub = totalCarrinho(cart);
        if (sub < ATACADO_MIN) return respond(`Ainda não dá pra fechar: seu pedido de atacado está em *R$ ${sub.toFixed(2).replace('.', ',')}* e o mínimo é *R$ 3.000*.\nFaltam *R$ ${faltaAtk(sub).toFixed(2).replace('.', ',')}*.\n\nMe manda o *nome* de outro produto pra adicionar. 😊`);
        // OBSERVAÇÃO: pergunta antes do resumo do atacado (o fechar só passa aqui uma vez por checkout).
        await saveSession(sid, { ...session, obsReturn:'atacado', state:'OBS_PERGUNTA' });
        return respond('📝 Quer adicionar alguma *observação* ao seu pedido? (ex.: ponto de referência, algum pedido especial)\n\n1️⃣ Sim\n2️⃣ Não');
      }
      if (num === 3) {
        if (!cart.length) { await saveSession(sid, { ...session, state:'ATACADO' }); return respond('Seu pedido de atacado está vazio. 🛒'); }
        await saveSession(sid, { ...session, state:'ATK_REMOVER' });
        return respond(`*Qual item remover?*\n\n${cart.map(function (i, x) { return emojis(x) + ' *' + i.nome + '* x' + i.qtd; }).join('\n')}\n\n_Digite o número._`);
      }
      // Resposta ao convite de 3h ("quero", "manda o link"...): fecha direto, sem repetir o resumo.
      if (_ehQueroFechar(_t)) {
        if (!cart.length) { await saveSession(sid, { ...session, state:'ATACADO' }); return respond('Seu pedido de atacado está vazio. Me diga o *nome do produto* que você quer. 😊'); }
        const _sub = totalCarrinho(cart);
        if (_sub < ATACADO_MIN) return respond(`Pra fechar, o pedido de atacado precisa chegar em *R$ 3.000* — o seu está em *R$ ${_sub.toFixed(2).replace('.', ',')}* e faltam *R$ ${faltaAtk(_sub).toFixed(2).replace('.', ',')}*.\n\nMe manda o *nome* de outro produto que eu adiciono. 😊`);
        return await fecharAtacadoDireto(session, sid, respond, nomeAssistente);
      }
      if (!/^\d/.test(_t) && _t.length >= 2) return await atkAbrirBusca(session, sid, _t, respond); // nome de produto → nova busca
      return respond(msgCarrinhoAtk(cart));
    }

    if (state === 'ATK_REMOVER') {
      const cart = session.carrinhoAtk || [];
      if (!cart.length) { await saveSession(sid, { ...session, state:'ATACADO' }); return respond('Seu pedido de atacado está vazio. 🛒\n\n' + MSG_ATACADO); }
      if (!num || num < 1 || num > cart.length) return respond(`Digite um número entre 1 e ${cart.length} para remover.`);
      const rem = cart.splice(num - 1, 1)[0];
      await saveSession(sid, { ...session, state:'ATK_CART', carrinhoAtk: cart });
      if (!cart.length) { await saveSession(sid, { ...session, carrinhoAtk: [], state:'ATACADO' }); return respond(`🗑️ *${rem.nome}* removido. Seu pedido de atacado ficou vazio.\n\nMe diga o *nome* de outro produto pra recomeçar. 😊`); }
      return respond(`🗑️ *${rem.nome}* removido!\n\n${msgCarrinhoAtk(cart)}`);
    }

    if (state === 'ATK_CONFIRMAR') {
      const cart = session.carrinhoAtk || [];
      if (num === 2) { await saveSession(sid, { ...session, state:'ATK_CART' }); return respond(msgCarrinhoAtk(cart)); }
      if (num === 1) {
        if (!cart.length) { await saveSession(sid, { ...session, state:'ATACADO' }); return respond('Seu pedido de atacado está vazio. 🛒'); }
        const sub = totalCarrinho(cart);
        if (sub < ATACADO_MIN) { await saveSession(sid, { ...session, state:'ATK_CART' }); return respond(`O pedido está abaixo de R$ 3.000 (faltam R$ ${faltaAtk(sub).toFixed(2).replace('.', ',')}). Adicione mais um produto pra fechar. 😊`); }
        // Reutiliza o gerador de link do varejo, com carrinho de ATACADO, frete grátis e SEM desconto/cupom.
        const sessAtk = { ...session, carrinho: cart, freteSelecionado: { label: 'Grátis (atacado)', valor: 0 }, estadoCliente: '', descontoReais: 0, descontoLabel: '', descontoTipo: 'atacado', total: sub, cupomDocId: null, cupomCodigo: null, brinde: null, atacado: true, carrinhoAtk: [] };
        return await gerarLinkPedido(sessAtk, sid, respond, nomeAssistente);
      }
      if (_ehQueroFechar((mensagem || '').trim())) {
        if (!cart.length) { await saveSession(sid, { ...session, state:'ATACADO' }); return respond('Seu pedido de atacado está vazio. 🛒'); }
        const _sub = totalCarrinho(cart);
        if (_sub < ATACADO_MIN) { await saveSession(sid, { ...session, state:'ATK_CART' }); return respond(`O pedido está abaixo de R$ 3.000 (faltam R$ ${faltaAtk(_sub).toFixed(2).replace('.', ',')}). Adicione mais um produto pra fechar. 😊`); }
        return await fecharAtacadoDireto(session, sid, respond, nomeAssistente);
      }
      return respond('Digite *1* pra gerar o link de pagamento ou *2* pra voltar.');
    }

    if (state === 'PRAZO_TIPO') {
      if (num === 1) { await saveSession(sid, { ...session, state:'MENU' }); return respond(MSG_PRAZO_VAREJO + '\n\n_Digite *menu* para ver nossos produtos._'); }
      if (num === 2) { return await entrarAtacado(session, sid, respond); }
      return respond('Digite *1* para compra normal (varejo) ou *2* para atacado:');
    }

    if (state === 'FRETE_AVULSO') {
      // v95: mesmo leitor do checkout (ufDoTexto: sigla ou nome por extenso). Antes valiam as 2 primeiras letras:
      //      "Por transportadora" virava "PO", "Rio de Janeiro" virava "RI" (caso real Bruno).
      const uf = ufDoTexto(mensagem);
      const opts = uf ? getFreteOpcoes(uf) : null;
      if (!opts) {
        if (reconhecerProduto(n)) { const _sM = { ...session, state: 'MENU' }; await saveSession(sid, _sM); return await tratarTextoLivre(_sM, sid, n, buildMenuPrincipal(), respond); }
        return respond(`Estado *${String(mensagem || '').trim().slice(0, 40)}* não reconhecido.\nDigite a sigla do seu estado (ex: RJ, SP, MG):`);
      }
      const freteStr = opts.map((o) => `• *${o.label}* — R$ ${o.valor.toFixed(2).replace('.',',')}`).join('\n');
      await saveSession(sid, { ...session, state:'MENU' });
      return respond(`🚚 *Opções de frete para ${uf}:*\n\n${freteStr}\n\n💡 Recomendamos a *Transportadora* — inclui seguro grátis contra apreensão e extravio.\n\nQuer escolher um produto para comprar? É só digitar *menu* e navegar pelas categorias! 😊`);
    }

    if (state === 'TRIAGEM') {
      if (num === 1) { await saveSession(sid, { ...session, state:'MENU' }); return respond(buildMenuPrincipal()); }
      if (num === 2) { await saveSession(sid, { ...session, state:'PRAZOS_RASTREIO' }); return respond(MSG_PRAZOS_RASTREIO_MENU); }
      if (num === 3) { await saveSession(sid, { ...session, state:'DUVIDAS' }); return respond(MSG_DUVIDAS_INTRO); }
      return await tratarTextoLivre(session, sid, n, buildTriagem(), respond);
    }

    if (state === 'PRAZOS_RASTREIO') {
      if (num === 1) { await saveSession(sid, { ...session, state:'PRAZOS_RASTREIO' }); return respond(MSG_PRAZOS_COMPLETO); }
      if (num === 2) {
        await saveSession(sid, { ...session, state:'RASTREAR' });
        return respond(`*📦 RASTREAR MEU PEDIDO*\n\nMe envia o *número do pedido*, seu *CPF* ou o *e-mail* da compra que eu consulto o status pra você na hora! 😊\n\n_(Pode digitar do jeito que for: com pontos, sem pontos, com traço... eu entendo.)_\n\n_Digite *menu* para voltar._`);
      }
      if (num === 3) { await saveSession(sid, { ...session, state:'FRETE_AVULSO' }); return respond('🚚 *Consultar frete*\n\nMe diz o seu estado (sigla) que eu calculo na hora!\nExemplo: RJ, SP, MG, DF, BA...'); }
      return await tratarTextoLivre(session, sid, n, MSG_PRAZOS_RASTREIO_MENU, respond);
    }

    if (state === 'DUVIDAS') {
      // Menu numerado dos serviços (o cliente só aperta o número — sem adivinhar o que digitar).
      if (num === 1) { await saveSession(sid, { ...session, state:'DUVIDAS_LIVRE' }); return respond(`Pode mandar sua pergunta! 😊 Produtos, doses, indicações, comparações... o que quiser saber.`); }
      if (num === 2) { await saveSession(sid, { ...session, state:'PROTO_IDENTIFICAR', fracFluxo:true, protoTentouOutro:false }); return respond(`💉 Beleza! Me manda os *11 números do seu CPF* (ou o *e-mail* da compra) que eu puxo o que você comprou e já te mando a *tabela de fracionamento*. 😊`); }
      if (num === 3) { await saveSession(sid, { ...session, state:'PROTO_IDENTIFICAR', fracFluxo:false, protoTentouOutro:false }); return respond(`💪 Show! Me manda os *11 números do seu CPF* (ou o *e-mail* da compra) que eu puxo o que você comprou e monto seu *protocolo completo*. 😊`); }
      // Digitou uma pergunta direto (não um número) → trata como dúvida livre (IA/produto).
      return await tratarTextoLivre(session, sid, n, MSG_DUVIDAS_INTRO, respond);
    }
    if (state === 'DUVIDAS_LIVRE') {
      // v85: aqui o cliente escolheu "tirar uma dúvida". Nome de produto solto (até 4 palavras, sem verbo de compra) é a dúvida dele
      // sobre o produto — vai pra IA, não pra "Você quis dizer X?" nem pra lista de preços.
      const _pal = n.split(/\s+/).filter(Boolean);
      if (_pal.length >= 1 && _pal.length <= 4 && !/^\d+$/.test(n) && !/(^|\s)(comprar|compra|quero|preco|precos|valor|valores|quanto|tabela|lista|catalogo)(\s|$)/.test(n)
          && !ehPedidoProtocoloCompleto(n) && !ehPedidoFracionamento(n) && (reconhecerProduto(n) || reconhecerVarios(n).length)) {
        return await responderComIA(sid, mensagem, contextoLista(session), respond);
      }
      return await tratarTextoLivre(session, sid, n, MSG_DUVIDAS_INTRO, respond);
    }

    if (state === 'MENU') {
      if (num === 1) {
        const dados = await buscarCache('emagrecedores');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(linhas) });
        return respond(`*💊 EMAGRECEDORES*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
      }
      if (num === 2) { await saveSession(sid, { ...session, state:'PEPTIDEOS' }); return respond(MENU_PEPTIDEOS); }
      if (num === 3) { await saveSession(sid, { ...session, state:'HORMONIOS' }); return respond(MENU_HORMONIOS); }
      if (num === 4) {
        const dados = await buscarCache('gh');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(linhas) });
        return respond(`*⚡ GH*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
      }
      if (num === 5) {
        const dados = await buscarCache('estetica');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(linhas) });
        return respond(`*💅 ESTÉTICA*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
      }
      if (num === 6) {
        const dados = await buscarCache('sarms');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(linhas) });
        return respond(`*🧬 SARMS*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
      }
      if (num === 7) {
        const dados = await buscarCache('farmacia');
        const linhas = dados.split('\n').filter(Boolean);
        if (!linhas.length) return respond('Nenhum produto encontrado. *Digite menu* para voltar.');
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(linhas) });
        return respond(`*💊 FARMÁCIA*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
      }
      if (num === 8) {
        if (PROMO_GENESIS.ativa) return await anunciarGenesis(session, sid, respond);
        const msg = await abrirPromo(session, sid);   // Relâmpago tem prioridade se for reativada
        if (msg) return respond(msg);
        if (PROMO_PRODUTO.ativa) return respond(await anunciarLancamento(session, sid));
        return respond(msgPromoAtual() + '\n\n0️⃣ Voltar ao menu');
      }
      if (num === 9) { return await entrarAtacado(session, sid, respond); }
      return await tratarTextoLivre(session, sid, n, buildMenuPrincipal(), respond);
    }

    if (state === 'RASTREAR') {
      const _incR = respostaIdIncompleto(mensagem, true);   // v81: falta a letra / dia e mês / CPF não confere
      if (_incR) return respond(_incR + `\n\n_Ou digite *menu* para voltar._`);
      const termo = extrairTermoRastreio(mensagem);         // v81: número/CPF normalizados (o resto vai como veio)
      const alnum = termo.replace(/[^a-zA-Z0-9@]/g, '');
      // v84: frase solta (3+ palavras, sem pedido/CPF/e-mail e sem sequência de 5+ números) não é dado de pedido — não consulta.
      // v95: QUALQUER mensagem sem nº de pedido / CPF / e-mail / sequência de 5+ números não é consulta ("obrigado", "não chegou",
      //      "acione a logística") → sai do rastreio e segue o caminho normal (IA, produto, menu).
      const _semIdR = !idPedido(mensagem) && !idEmail(mensagem) && !idCpf(mensagem).cpf && !/\d{5,}/.test(String(mensagem).replace(/[\s.\-]/g, ''));
      if (_semIdR && /[a-z]{2,}/i.test(String(mensagem || ''))) {
        const _sessM = { ...session, state: 'MENU' };
        await saveSession(sid, _sessM);
        return await tratarTextoLivre(_sessM, sid, n, buildTriagem(), respond);
      }
      if (alnum.length < 2) {
        return respond(`Hmm, isso não parece um número de pedido, CPF ou e-mail. 🤔\n\nMe manda o *número do pedido*, o *CPF* (11 dígitos) ou o *e-mail* da compra.\n\n_Ou digite *menu* para voltar._`);
      }
      let pedidos = await consultarStatusGAS(termo);
      if (!pedidos.length) {   // v85: pedido + CPF + e-mail na mesma mensagem → tenta os outros
        const _outrosR = termosRastreio(mensagem).filter(x => x !== termo);
        for (let _i = 0; _i < _outrosR.length && !pedidos.length; _i++) pedidos = await consultarStatusGAS(_outrosR[_i]);
      }
      if (!pedidos.length) {
        return respond(`🔍 Não encontrei nenhum pedido com *esse dado*.\n\nConfere se digitou certo o *número do pedido*, *CPF* ou *e-mail* da compra e me manda de novo. 😊\n\n📞 Se preferir, fale com a logística: 👉 wa.me/447537155718\n_Ou digite *menu* para voltar._`);
      }
      await saveSession(sid, { ...session, state: 'MENU' });   // v95: mostrou o pedido → sai do rastreio
      if (pedidos.length === 1) {
        return respond(statusBloco(pedidos[0]) + RASTREIO_RODAPE);
      }
      const blocos = pedidos.map(p => statusBloco(p)).join('\n\n\n');
      return respond(`Encontrei *${pedidos.length} pedidos* no seu cadastro:\n\n${blocos}` + RASTREIO_RODAPE);
    }

    if (state === 'PROMO_OFERECER') {
      const r = n.trim().toLowerCase();
      const sim = num === 1 || r === 'sim' || r === 's';
      const nao = num === 2 || r === 'nao' || r === 'não' || r === 'n';
      if (nao) {
        await saveSession(sid, { ...session, state:'MENU' });
        return respond('Sem problema! 😊\n\n' + buildMenuPrincipal());
      }
      if (sim) {
        // busca o produto exato da promoção (preço real do cache) e leva para a quantidade
        const nomePromo = (PROMO_PRODUTO.produtos || [])[0] || '';
        const dados = await buscarCache('emagrecedores');
        const linhas = String(dados || '').split('\n').filter(Boolean);
        const lista = parseProdutos(linhas);
        const achado = lista.find(p => _normNomeProd(p.nome) === _normNomeProd(nomePromo))
                    || lista.find(p => _normNomeProd(p.nome).includes('retatrutida') && _normNomeProd(p.nome).includes('120') && _normNomeProd(p.nome).includes('aq'));
        if (!achado || !achado.preco) {
          await saveSession(sid, { ...session, state:'MENU' });
          return respond('Opa, não consegui localizar o preço desse produto agora. 😅 Você encontra ele em *Emagrecedores* (opção 2) ou pelo link que te enviei.\n\n_Digite *menu* para voltar._');
        }
        await saveSession(sid, { ...session, state:'QUANTIDADE', produtoSelecionado: { nome: achado.nome, preco: achado.preco, colecao: 'emagrecedores' } });
        return respond(`Ótima escolha! 🔥\n📦 *${achado.nome}*\n💰 R$ ${achado.preco.toFixed(2).replace('.',',')}\n_(já com seu desconto de ${PROMO_PRODUTO.pct}% aplicado no fechamento)_\n\n*Quantas unidades você quer?*\n_(Digite o número)_`);
      }
      return respond('Digite *1* para Sim ou *2* para Não. 😊');
    }

    // v78: a IA achou o produto ([[COMPRAR:...]]) e perguntou "Posso colocar no seu carrinho?".
    // SIM → entra no carrinho e segue direto pro fechamento normal (irParaCheckout: estado → frete → link).
    if (state === 'CONFIRMAR_CARRINHO') {
      const prod = session.produtoSelecionado || {};
      const _s = String(n || '').trim();
      const _nums = _s.match(/\d{1,2}/);
      const _sim = /^(sim|s|pode|pode sim|pode colocar|coloca|colocar|coloque|ok|okay|isso|claro|quero|quero sim|bora|vamos|fechado|fecha|manda|beleza|blz|positivo|com certeza|finalizar|finaliza|sim pode)\b/.test(_s) || /^\d{1,2}$/.test(_s);
      const _nao = /^(nao|n|agora nao|depois|nao quero|negativo|deixa|cancela|cancelar)\b/.test(_s);
      if (_sim && prod.nome) {
        const qtd = _nums ? Math.max(1, Math.min(99, parseInt(_nums[0], 10))) : 1;
        // mesma trava do QUANTIDADE: não mistura atacado aberto com varejo
        if ((session.carrinhoAtk || []).length) {
          await saveSession(sid, { ...session, state:'VAREJO_BLOQUEIO' });
          return respond(`Você tem um *pedido de atacado* em aberto. 🏭\n\nNão dá pra misturar *atacado* e *varejo* no mesmo pedido. O que você prefere?\n\n1️⃣ *Finalizar o atacado* primeiro\n2️⃣ *Esvaziar o atacado* e comprar no varejo\n3️⃣ Voltar ao menu`);
        }
        const carrinho = (session.carrinho || []).slice();
        carrinho.push({ nome: prod.nome, preco: prod.preco, qtd: qtd, colecao: prod.colecao || session.colecaoAtual || '', genesis: !!(prod.genesis || ehLinhaGenesis(prod.nome)) });
        return await irParaCheckout({ ...session, carrinho, stackFila: [], produtoSelecionado: null, errosSeguidos: 0 }, sid, respond);
      }
      if (_nao) {
        await saveSession(sid, { ...session, state:'MENU', produtoSelecionado: null, errosSeguidos: 0 });
        return respond('Sem problema! 😊 Me diz o que você procura ou escolha uma opção:\n\n' + buildMenuPrincipal());
      }
      // outra coisa (pergunta, outro produto): trata como texto livre
      return await tratarTextoLivre(session, sid, n, '', respond);
    }

    if (state === 'CONFIRMAR_PRODUTO') {
      if (num === 1) { const e = session.pendenteRec || {}; return await resolverReconhecido({ ...session, pendenteRec:null, errosSeguidos:0 }, sid, e, respond, e.marca || '', e.q || ''); }
      if (num === 2) { await saveSession(sid, { ...session, state:'MENU', pendenteRec:null, errosSeguidos:0 }); return respond('Sem problema! 😊 Me diz o que você procura ou escolha uma opção:\n\n' + buildMenuPrincipal()); }
      return respond('Digite *1* para Sim ou *2* para Não:');
    }

    if (state === 'CONFIRMAR_VER_PRODUTO') {
      // Cliente tinha carrinho e pediu outro produto. 1 = ver o produto (carrinho preservado). 2 = volta ao carrinho.
      if (num === 1) {
        const e = session.pendenteRec || {};
        if (e.tipo === 'categoria') return await abrirCategoria({ ...session, pendenteRec:null, errosSeguidos:0 }, sid, e.cat, respond);   // v86
        return await resolverReconhecido({ ...session, pendenteRec:null, errosSeguidos:0 }, sid, e, respond, e.marca || '', e.q || '');
      }
      if (num === 2) {
        const carrinho = session.carrinho || [];
        await saveSession(sid, { ...session, state:'CARRINHO', pendenteRec:null, errosSeguidos:0 });
        return respond(`Beleza, voltando pro seu carrinho! 🛒\n\n${msgCarrinhoMenu(carrinho)}`);
      }
      return respond(`Digite *1* para ver o produto ou *2* para continuar de onde parou:`);
    }

    if (state === 'SUBMENU_TESTO') {
      const dados = await buscarCache('hormonios');
      let filtro, label;
      // 'deca' saiu daqui pelo mesmo motivo do BASES_NAO_TESTO: comia "un-DECA-noato" e o
      // Nebido nunca aparecia na opção 4 (Outras Testosteronas). Bug antigo, achado em 18/09/2026.
      let excluir = ['masteron','drostanolona','trembolona','tren','nandrolona','durabolin','boldenona','primobolan','metenolona'];
      if (num === 1)      { filtro=['enantato'];   label='ENANTATO DE TESTOSTERONA'; }
      else if (num === 2) { filtro=['cipionato'];  label='CIPIONATO DE TESTOSTERONA'; }
      else if (num === 3) { filtro=['durateston']; label='DURATESTON (BLEND)'; excluir=[]; }
      else if (num === 4) { filtro=['propionato','suspensao','undecanoato','nebido']; label='OUTRAS TESTOSTERONAS'; }
      else return await tratarTextoLivre(session, sid, n, MENU_TESTO, respond);
      let linhas = filtrarCache(dados, filtro);
      if (!linhas.length) linhas = filtrarCache(await buscarTodosCache(), filtro);
      if (excluir.length) linhas = linhas.filter(l => { const nl = norm(l); return !excluir.some(x => nl.includes(x)); });
      const unicas = [...new Set(linhas)];
      if (!unicas.length) return respond(`Nenhum *${label}* disponível no momento. 😕\n\n${MENU_TESTO}`);
      await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(unicas), errosSeguidos:0 });
      return respond(`*${label}*\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
    }

    if (state === 'ESTER_BASE') {
      const ester = session.pendenteEster || '';
      const baseMapNum = { 1:'testosterona', 2:'trembolona', 3:'masteron', 4:'nandrolona', 5:'outras' };
      const base = baseMapNum[num];
      if (!base) return await tratarTextoLivre(session, sid, n, `*${(ester||'').toUpperCase()} de quê?*\n\n${MENU_BASE_ESTER}`, respond);
      const dados = await buscarCache('hormonios');
      let unicas = filtrarEster(dados, ester, base);
      if (!unicas.length) unicas = filtrarEster(await buscarTodosCache(), ester, base);
      const baseLabel = base.charAt(0).toUpperCase() + base.slice(1);
      if (!unicas.length) return respond(`Não encontrei *${ester} de ${baseLabel}* disponível no momento. 😕\n\nQuer tentar outra base?\n\n${MENU_BASE_ESTER}`);
      await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(unicas), pendenteEster:null, errosSeguidos:0 });
      return respond(`*${ester.toUpperCase()} DE ${baseLabel.toUpperCase()}*\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
    }

    if (state === 'PEPTIDEOS') {
      const mapa = {
        1: ['bpc-157', 'bpc157'], 2: ['tb-500', 'tb500'], 3: ['ghk-cu', 'ghkcu'],
        4: ['klow'], 5: ['glow'], 6: ['ss-31', 'ss31'], 7: ['mots-c', 'motsc'],
        8: ['ipamorelin'], 9: ['cjc-1295', 'cjc1295'], 10: ['pt-141', 'pt141'],
        11: ['aod-9604', 'aod9604'], 12: ['cbl-514', 'cbl514', 'cbl 514'], 13: ['epitalon'],
        14: ['nad'], 15: ['tesamorelin'],
      };
      if (mapa[num]) {
        const linhas = await buscarFiltradoGlobal('peptideos', mapa[num]);
        if (!linhas.length) return respond(`Produto não disponível no momento.\n\n${MENU_PEPTIDEOS}`);
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(linhas) });
        return respond(`*${mapa[num][0].toUpperCase()}*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
      }
      if (num === 16) {
        const dados = await buscarCache('peptideos');
        const todosTermos = Object.values(mapa).flat().concat(['retatrutida','tirzepatida','semaglutida']);
        const linhas = dados.split('\n').filter(Boolean).filter(l => { const nProd = norm(l.split('|')[0]); return !todosTermos.some(t => nProd.includes(norm(t))); });
        if (!linhas.length) return respond(`Nenhum outro peptídeo encontrado.\n\n${MENU_PEPTIDEOS}`);
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(linhas) });
        return respond(`*OUTROS PEPTÍDEOS*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
      }
      return await tratarTextoLivre(session, sid, n, MENU_PEPTIDEOS, respond);
    }

    if (state === 'HORMONIOS') {
      // Bases que NÃO são testosterona. Servem pra limpar as listas 1 e 2, que buscam por éster
      // e acabavam trazendo Trembolona Enantato, Masteron, Nandrolona, CutStack etc.
      // ⚠️ aplicarExclusao casa SUBSTRING em qualquer posição. Por isso NÃO pode ter 'deca'
      // (come "un-DECA-noato" e sumia com o Nebido) nem 'ment' (come qualquer "…mento").
      // 'durabolin' cobre o Deca-Durabolin e 'trestolona' cobre o MENT.
      const BASES_NAO_TESTO = ['masteron','drostanolona','trembolona','tren','nandrolona','durabolin','npp','boldenona','primobolan','metenolona','cutstack','trestolona'];
      const mapa = {
        // ⚠️ filtrarCache trata cada item do array como busca SEPARADA (OU) e junta tudo.
        // Palavras dentro da MESMA string são exigidas TODAS (E). Por isso 'enantato testosterona'
        // numa string só — antes eram 2 itens e a lista vinha com Trembolona Enantato, Cipionato,
        // Testosterona Oral, Propionato e CutStack. Corrigido em 18/09/2026.
        1:  { termos:['enantato testosterona'], excluir:BASES_NAO_TESTO, label:'ENANTATO DE TESTOSTERONA' },
        // Durateston e Sustanon NÃO têm a palavra "testosterona" no nome — por isso nunca apareciam.
        2:  { termos:['testosterona','durateston','sustanon'], excluir:BASES_NAO_TESTO, label:'TESTOSTERONA / DURATESTON' },
        3:  { termos:['npp','fenilpropionato'], excluir:['testosterona'], label:'NPP' },
        4:  { termos:['trembolona'],               label:'TREMBOLONA' },
        5:  { termos:['boldenona'],                label:'BOLDENONA' },
        6:  { termos:['stanozolol'],               label:'STANOZOLOL' },
        7:  { termos:['oxandrolona'],              label:'OXANDROLONA' },
        8:  { termos:['nandrolona','deca','durabolin'], excluir:['fenilpropionato','npp'], label:'NANDROLONA (DECA)' },
        9:  { termos:['masteron','drostanolona'],  label:'MASTERON' },
        10: { termos:['primobolan','metenolona'],  label:'PRIMOBOLAN' },
        11: { termos:['dianabol','metandienona'],  label:'DIANABOL' },
        12: { termos:['hemogenin','oximetolona'],  label:'HEMOGENIN (ANADROL)' },
        13: { termos:['hcg'],                      label:'HCG' },
        14: { termos:['anastrozol','proviron'],    label:'ANASTROZOL / PROVIRON' },
        15: { termos:['cutstack'],                 label:'CUTSTACK' },
      };
      // v90: os produtos de cada opção saem do CATÁLOGO INTELIGENTE (sinônimos: Deca = nandrolona, Cipionato/Durateston = testosterona).
      // Antes a opção 8 (Nandrolona/Deca) vinha VAZIA e Cipionato e Deca caíam em "Outros hormônios" — os nomes do catálogo mudaram.
      const _prH = await ciCatalogo();
      const _opcaoH = (k) => {
        const m = mapa[k]; if (!m) return [];
        let ps = ciPorTermos(_prH, m.termos, m.excluir || []);
        if (k === 2) ps = ps.filter(p => !p.set['enantato']);
        return ps;
      };
      if (mapa[num]) {
        const { label } = mapa[num];
        let linhas = ciLinhas(_opcaoH(num));
        if (!linhas.length) return respond(`Produto não disponível no momento.\n\n${MENU_HORMONIOS}`);
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(linhas) });
        return respond(`*${label}*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
      }
      if (num === 16) {
        const _jaTem = {}; Object.keys(mapa).forEach(k => { _opcaoH(Number(k)).forEach(p => { _jaTem[p.linha] = 1; }); });
        const linhas = ciLinhas(_prH.filter(p => p.fonte === 'hormonios' && !_jaTem[p.linha]));
        if (!linhas.length) return respond(`Nenhum outro hormônio encontrado.\n\n${MENU_HORMONIOS}`);
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(linhas) });
        return respond(`*OUTROS HORMÔNIOS*\n\n${formatarLista(linhas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
      }
      return await tratarTextoLivre(session, sid, n, MENU_HORMONIOS, respond);
    }

    if (state === 'FABRICANTES') {
      const fabMap = {
        1:'zphc', 2:'veltrane', 3:'landerlan', 4:'muscle labs', 5:'alpha pharma',
        6:'health peptides', 7:'alluvi', 8:'lipoless', 9:'cooper pharma',
        10:'neuroceptix', 11:'king pharma', 12:'synedica', 13:'neopeptides',
        14:'eurogold', 15:'novax', 16:'bratva',
      };
      if (fabMap[num]) {
        const tudo = await buscarTodosCache();
        const linhas = filtrarCache(tudo, fabMap[num]);
        const unicas = [...new Set(linhas)];
        if (!unicas.length) return respond(`Nenhum produto de *${fabMap[num]}* disponível.\n\n${MENU_FABRICANTES}`);
        await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(unicas) });
        return respond(`*${fabMap[num].toUpperCase()}*\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
      }
      if (num === 17) { await saveSession(sid, { ...session, state:'BUSCA_LIVRE' }); return respond('Digite o nome do fabricante que procura:'); }
      return await tratarTextoLivre(session, sid, n, MENU_FABRICANTES, respond);
    }

    if (state === 'BUSCA_LIVRE') {
      if (!mensagem || mensagem.length < 2) return respond('Por favor, digite o nome do fabricante:');
      const tudo = await buscarTodosCache();
      const linhas = filtrarCache(tudo, mensagem);
      const unicas = [...new Set(linhas)];
      if (!unicas.length) return respond(`Nenhum produto de *${mensagem}* encontrado.\n\n${MENU_FABRICANTES}`);
      await saveSession(sid, { ...session, state:'LISTA_PRODUTOS', origemLista: origemDaLista(session), produtoLista: parseProdutos(unicas) });
      return respond(`*${mensagem.toUpperCase()}*\n\n${formatarLista(unicas)}\n\n*Digite o número do produto:*\n_(ou *0* para voltar)_`);
    }

    if (state === 'LISTA_PRODUTOS') {
      const lista = session.produtoLista || [];
      if (!/^\d/.test(n.trim())) {
        // "o mais barato / mais em conta" (ou o mais caro) → escolhe pelo PREÇO da lista ATUAL,
        // mantendo o contexto (não manda pra IA nem reabre a lista).
        const sup = ehPedidoSuperlativo(n);
        if (sup && lista.length) {
          const prod = escolherPorPreco(lista, sup);
          if (prod) {
            await saveSession(sid, { ...session, state:'QUANTIDADE', produtoSelecionado: prod });
            let rotulo, extra = '';
            if (sup === 'caro') { rotulo = 'o *top* (mais premium)'; }
            else if (sup === 'valor') {
              rotulo = 'a *melhor relação custo-benefício*';
              const _mg = _mgDoNome(prod.nome);
              if (_mg > 0) extra = `\n_(${_mg}mg — sai por R$ ${(prod.preco/_mg).toFixed(2).replace('.',',')} por mg, o melhor aproveitamento da lista)_`;
            }
            else { rotulo = 'o *mais em conta*'; }
            return respond(`Boa! 💰 Dessa lista, ${rotulo} é:\n📦 *${prod.nome}*\n💰 R$ ${prod.preco.toFixed(2).replace('.',',')}${extra}\n\n*Quantas unidades você quer?*\n_(Digite o número)_`);
          }
        }
        // nome de produto (abre lista), combo (conduz) ou dúvida (IA)
        return await tratarTextoLivre(session, sid, n, '', respond);
      }
      if (!num || num < 1 || num > lista.length) return respond(`Digite um número entre 1 e ${lista.length}.\n\nOu *menu* para voltar.`);
      const prod = lista[num - 1];
      await saveSession(sid, { ...session, state:'QUANTIDADE', produtoSelecionado: prod });
      return respond(`Você escolheu:\n📦 *${prod.nome}*\n💰 R$ ${prod.preco.toFixed(2).replace('.',',')}\n\n*Quantas unidades deseja?*\n_(Digite o número)_`);
    }

    if (state === 'QUANTIDADE') {
      // não é número → troca de produto por texto, combo ou dúvida (IA)
      if (!/^\d/.test(n.trim()) && isNaN(qtdPura(mensagem))) return await tratarTextoLivre(session, sid, n, '', respond);
      num = qtdPura(mensagem);   // v84: "60 mg" virava 60 unidades (R$ 47.340 no carrinho) — só quantidade pura vale
      if (!num || num < 1 || num > 99) return respond('Por favor, informe uma quantidade válida (1 a 99):');
      // TRAVA anti-mistura: tem pedido de ATACADO aberto? Não pode adicionar item de varejo no mesmo pedido.
      if ((session.carrinhoAtk || []).length) {
        await saveSession(sid, { ...session, state:'VAREJO_BLOQUEIO' });
        return respond(`Você tem um *pedido de atacado* em aberto. 🏭\n\nNão dá pra misturar *atacado* e *varejo* no mesmo pedido. O que você prefere?\n\n1️⃣ *Finalizar o atacado* primeiro\n2️⃣ *Esvaziar o atacado* e comprar no varejo\n3️⃣ Voltar ao menu`);
      }
      const prod = session.produtoSelecionado || {};
      const carrinho = session.carrinho || [];
      carrinho.push({ nome: prod.nome, preco: prod.preco, qtd: num, colecao: prod.colecao || session.colecaoAtual || '', genesis: !!(prod.genesis || ehLinhaGenesis(prod.nome)) });
      // COMBO: ainda tem produto na fila? OFERECE o próximo (não abre sozinho) — 1 toque e segue.
      const fila = session.stackFila || [];
      if (fila.length) {
        const prox = fila[0];
        await saveSession(sid, { ...session, state:'STACK_PROXIMO', carrinho });
        return respond(
          `✅ *${prod.nome}* x${num} no carrinho! 🛒\n\n` +
          `Seu combo ainda tem: *${fila.map(f => f.label).join(', ')}*.\n\n` +
          `Quer que eu já te mostre as opções de *${prox.label}* pra fechar o combo?\n\n` +
          `1️⃣ Sim, ver ${prox.label}\n2️⃣ Agora não (ir pro carrinho)`
        );
      }
      await saveSession(sid, { ...session, state:'CARRINHO', carrinho, stackFila: [] });
      return respond(`✅ Adicionado ao carrinho:\n📦 *${prod.nome}* x${num}\n\n${msgCarrinhoMenu(carrinho)}`);
    }

    if (state === 'STACK_PROXIMO') {
      const fila = session.stackFila || [];
      const carrinho = session.carrinho || [];
      const r = n.trim();
      const sim = num === 1 || r === 'sim' || r === 's';
      const nao = num === 2 || r === 'nao' || r === 'não' || r === 'n' || r.includes('agora nao') || r.includes('depois');
      if (sim && fila.length) {
        const prox = fila[0];
        return await resolverReconhecido({ ...session, stackFila: fila.slice(1), errosSeguidos:0, pendenteRec:null }, sid, prox, respond);
      }
      if (nao || !fila.length) {
        await saveSession(sid, { ...session, state:'CARRINHO', stackFila: [] });
        return respond(`Beleza! 😊 Seu combo tá guardado no carrinho.\n\n${msgCarrinhoMenu(carrinho)}`);
      }
      // texto livre → reconhece produto / dúvida (IA)
      if (!/^\d/.test(r)) return await tratarTextoLivre(session, sid, n, '', respond);
      const prox = fila[0];
      return respond(`Digite *1* pra ver *${prox ? prox.label : 'o próximo'}* ou *2* pra ir pro carrinho:`);
    }

    if (state === 'CARRINHO') {
      const carrinho = session.carrinho || [];
      if (num === 1) {
        // Se está no fluxo da promo Gênesis, mantém o cliente na linha Gênesis (não volta pro menu geral).
        if (session.promoGenesis) return await anunciarGenesis(session, sid, respond, true);
        await saveSession(sid, { ...session, state:'MENU' });
        return respond('🛒 Seu carrinho está guardado! Escolha mais produtos:\n\n' + buildMenuPrincipal());
      }
      if (num === 2) { return await irParaCheckout(session, sid, respond); }
      if (num === 3 || REM_INTENT.some(p => n.includes(p))) {
        if (!carrinho.length) { await saveSession(sid, { ...session, state:'MENU' }); return respond('Seu carrinho está vazio. 🛒\n\n' + buildMenuPrincipal()); }
        await saveSession(sid, { ...session, state:'REMOVER_ITEM' });
        return respond(msgRemoverItem(carrinho));
      }
      // Se foi um número fora de 1-3, reforça as opções. Se foi texto, tenta entender (produto, etc.).
      if (num && num >= 1) return respond('Digite *1* para adicionar mais, *2* para finalizar ou *3* para remover um produto:');
      return await tratarTextoLivre(session, sid, n, msgCarrinhoMenu(carrinho), respond);
    }

    if (state === 'REMOVER_ITEM') {
      const carrinho = session.carrinho || [];
      if (!carrinho.length) { await saveSession(sid, { ...session, state:'MENU' }); return respond('Seu carrinho está vazio. 🛒\n\n' + buildMenuPrincipal()); }
      // não é número → nome de produto, stack (IA conduz) ou dúvida (IA)
      if (!/^\d/.test(n.trim())) return await tratarTextoLivre(session, sid, n, '', respond);
      if (!num || num < 1 || num > carrinho.length) return respond(`Digite um número entre 1 e ${carrinho.length} para remover, ou *menu* para voltar.\n\n${msgRemoverItem(carrinho)}`);
      const removido = carrinho.splice(num - 1, 1)[0];
      if (!carrinho.length) {
        await saveSession(sid, { ...session, state:'MENU', carrinho: [] });
        return respond(`🗑️ *${removido.nome}* removido. Seu carrinho ficou vazio.\n\nEscolha um produto pra continuar:\n\n` + buildMenuPrincipal());
      }
      await saveSession(sid, { ...session, state:'CARRINHO', carrinho });
      return respond(`🗑️ *${removido.nome}* removido!\n\n${msgCarrinhoMenu(carrinho)}`);
    }

    if (state === 'ESTADO') {
      if (REM_INTENT.some(p => n.includes(p)) && (session.carrinho || []).length) {
        await saveSession(sid, { ...session, state:'REMOVER_ITEM' });
        return respond(msgRemoverItem(session.carrinho));
      }
      // v91: aceita o estado por extenso ("São Paulo", "sou do Paraná", "moro em sp"). Antes valiam as 2 primeiras letras
      // da mensagem: "São Paulo" virava "SO" e "Paraná"/"Mato Grosso"/"Roraima" caíam no frete de OUTRO estado (PA/MA/RO).
      const uf = ufDoTexto(mensagem);
      const opts = uf ? getFreteOpcoes(uf) : null;
      if (!opts) {
        const _dv = await checkoutDesvio(session, sid, n, respond);   // quer pôr mais produto / digitou nome de produto
        if (_dv) return _dv;
        return respond(`Estado *${String(mensagem || '').trim().slice(0, 40)}* não reconhecido.\nDigite a sigla do seu estado (ex: RJ, SP, MG):`);
      }
      const freteStr = freteOpcoesTexto(opts);
      await saveSession(sid, { ...session, state:'FRETE', estadoCliente: uf, freteOpcoes: opts });
      return respond(`*Opções de frete para ${uf}:*\n\n${freteStr}\n\n💡 Recomendamos a *Transportadora* — inclui seguro grátis contra apreensão e extravio.\n\n*Digite o número:*`);
    }

    if (state === 'FRETE') {
      if (REM_INTENT.some(p => n.includes(p)) && (session.carrinho || []).length) {
        await saveSession(sid, { ...session, state:'REMOVER_ITEM' });
        return respond(msgRemoverItem(session.carrinho));
      }
      const opts = session.freteOpcoes || [];
      // v91: escolhe pelo número OU pelo nome ("sedex"); pedido de mais produto / nome de produto volta pra compra
      // com o carrinho salvo, em vez de repetir "Digite 1, 2 ou 3" (07/10 00:37 — "Quero adicionar mais produtos").
      const _iFrete = freteEscolhido(n, opts);
      if (_iFrete < 0) {
        const _dv = await checkoutDesvio(session, sid, n, respond);
        if (_dv) return _dv;
        return respond(`Não entendi. 😊 Escolha o frete pelo número:\n\n${freteOpcoesTexto(opts)}\n\n_Quer colocar mais produtos antes? Digite *mais*._`);
      }
      const frete = opts[_iFrete];
      const carrinho = session.carrinho || [];
      if (!carrinho.length) { await saveSession(sid, { ...session, state:'MENU' }); return respond('Seu carrinho está vazio! 🛒\n\nEscolha um produto primeiro:\n\n' + MENU_PRINCIPAL); }
      const totalProd = totalCarrinho(carrinho);
      // OBSERVAÇÃO: pergunta logo após o frete e ANTES do resumo (FRETE só passa aqui uma vez por checkout).
      await saveSession(sid, { ...session, freteSelecionado: frete, totalProd, obsReturn:'retail', state:'OBS_PERGUNTA' });
      return respond('📝 Quer adicionar alguma *observação* ao seu pedido? (ex.: ponto de referência, algum pedido especial)\n\n1️⃣ Sim\n2️⃣ Não');
    }

    if (state === 'PERGUNTA_CUPOM') {
      if (num === 1) { await saveSession(sid, { ...session, state:'INFORMAR_CUPOM' }); return respond('Digite o *código do cupom*:'); }
      if (num === 2) { return await fecharResumoNormal(session, sid, null, respond); }
      return respond('Digite *1* se tem cupom ou *2* para seguir sem cupom:');
    }

    if (state === 'INFORMAR_CUPOM') {
      const carrinho = session.carrinho || [];
      const totalProd = session.totalProd || totalCarrinho(carrinho);
      const resultado = await validarCupom(mensagem, totalProd);
      if (!resultado.ok && resultado.erroTecnico) {
        await enviarTelegram(`⚠️ *CUPOM: falha técnica na consulta*\n🏷️ ${(mensagem||'').trim()}\n📱 ${sid}\nO cliente digitou um cupom e o Firestore não respondeu (cota/rede).`);
        return respond(`Tive um problema pra consultar esse cupom agora. 😕 *Não é você* — é do nosso lado.\n\nTenta de novo em uns minutinhos, ou digite *2* pra seguir sem cupom (seu desconto de ${DESCONTO_ATHENA_PCT}% continua valendo). Se for cupom de promoção, me chama que eu resolvo. 💚`);
      }
      if (!resultado.ok) return respond(`❌ ${resultado.motivo}\n\nDigite outro código ou *menu* para recomeçar.\n_Ou digite *2* para seguir sem cupom._`);
      return await fecharResumoNormal(session, sid, resultado, respond);
    }

    // ── PROTOCOLO travado por CPF/e-mail (monta só com o que o cliente já comprou) ──
    if (state === 'PROTO_CLIENTE') {
      const s = norm(mensagem);
      if (/^(menu|inicio|início|voltar|cancelar)$/.test(s)) { await saveSession(sid, { ...session, state:'MENU' }); return respond(buildMenuPrincipal()); }
      if (/(^|\s)(sim|s|ja sou|já sou|sou cliente|isso|claro|com certeza|ja comprei|já comprei|sou)/.test(s)) {
        await saveSession(sid, { ...session, state:'PROTO_IDENTIFICAR', protoTentouOutro:false });
        return respond(`Perfeito! 😍 Me passa o seu *CPF* ou o *e-mail* da compra, que eu confirmo seu cadastro e já vejo o que você comprou pra montar o protocolo certinho.\n\n_(o CPF pode mandar com ou sem ponto/traço, tanto faz 😉)_`);
      }
      if (/(^|\s)(nao|não|n|ainda nao|ainda não|nunca)/.test(s)) {
        await saveSession(sid, { ...session, state:'MENU' });
        return respond(`Sem problema! 😊 ${session.fracFluxo ? 'A *tabela de fracionamento* personalizada é' : 'O protocolo *completo e personalizado* é'} cortesia pra *cliente*.\n\n${_becoFerramenta(session)}\n\nE *bora começar agora*! Me diz seu objetivo (emagrecer, ganhar massa, definir...) que eu te mostro os produtos ideais. 💪\n\n` + buildMenuPrincipal());
      }
      return respond(`Só pra eu te ajudar certinho: você *já é cliente* da VitaFlow? Responde *sim* ou *não*. 😊`);
    }
    if (state === 'PROTO_IDENTIFICAR') {
      const s = norm(mensagem);
      if (/^(menu|inicio|início|voltar|cancelar)$/.test(s)) { await saveSession(sid, { ...session, state:'MENU' }); return respond(buildMenuPrincipal()); }
      const ehEmail = (mensagem||'').indexOf('@') >= 0;
      const _cpfP = idCpf(mensagem);                     // v81: com/sem ponto/traço/espaço, sem o zero da frente
      let termo = null;
      if (ehEmail) termo = idEmail(mensagem) || (mensagem||'').trim();
      else if (_cpfP.cpf) termo = _cpfP.cpf;
      if (!termo && _cpfP.errado) {
        return respond(`🔎 O CPF *${idCpfFmt(_cpfP.errado)}* não confere — parece ter algum número trocado ou faltando. Confere os 11 números e me manda de novo, ou me manda o *e-mail* da compra. 😊`);
      }
      if (!termo) {
        return respond(`Não reconheci como CPF nem e-mail. 😊 Me manda os *11 números do CPF* (com ou sem pontos) ou o *e-mail* da compra.`);
      }
      const pedidos = await consultarStatusGAS(termo);
      const produtos = extrairProdutosDosPedidos(pedidos);
      if (produtos.length) {
        const lista = produtos.map((p,i) => `${emojis(i)} ${p}`).join('\n');
        await saveSession(sid, { ...session, state:'PROTO_ESCOLHER', protoProdutos: produtos, protoVerificado: true });
        return respond(`Achei seu cadastro! ✅ Você já comprou com a gente:\n\n${lista}\n\n0️⃣ Outro produto (que ainda não comprei)\n\n*Pra qual você quer o protocolo?* Pode escolher *um número*, *vários* (ex.: *1 e 3* — protocolo combinado) ou *todos*.`);
      }
      // não achou: 1ª falha pede o OUTRO dado; 2ª falha oferece atendente humano.
      if (!session.protoTentouOutro) {
        const outro = ehEmail ? 'o *CPF* (11 números)' : 'o *e-mail* da compra';
        await saveSession(sid, { ...session, state:'PROTO_IDENTIFICAR', protoTentouOutro:true });
        return respond(`Hmm, não achei nenhuma compra com ${ehEmail ? 'esse e-mail' : 'esse CPF'}. 🤔\n\n${_becoFerramenta(session)}\n\nE me manda ${outro} que eu tento localizar de novo. 😊`);
      }
      await saveSession(sid, { ...session, state:'PROTO_HUMANO' });
      return respond(`Ainda não localizei seus pedidos. 😕\n\n${_becoFerramenta(session)}\n\nQuer que eu chame um *atendente humano* pra localizar sua compra? _(sim / não)_`);
    }
    if (state === 'PROTO_ESCOLHER') {
      const s = norm(mensagem);
      // NÃO limpo protoProdutos/protoVerificado ao sair — o cliente pode querer outro protocolo depois.
      if (/^(menu|inicio|início|voltar|cancelar)$/.test(s)) { await saveSession(sid, { ...session, state:'MENU' }); return respond(buildMenuPrincipal()); }
      const produtos = session.protoProdutos || [];
      if (!produtos.length) { await saveSession(sid, { ...session, state:'MENU' }); return respond(buildMenuPrincipal()); }
      // Quer o protocolo de TODOS os produtos — reconhece MUITAS formas de dizer isso.
      const querTodos = /\b(todos|todas|tudo)\b/.test(s)
        || /\b(os dois|as duas|os tres|os três|os 2|os 3|ambos|as ambas|os quatro|todos eles|todas elas|cada um|uma de cada|um de cada|de cada|de todos|pra todos|para todos|todos que comprei|tudo que comprei|geral|todos os que|completo de tudo)\b/.test(s);
      if (querTodos) {
        await saveSession(sid, { ...session, state:'PROTO_TIPO', protoEscolhidos: produtos });
        return respond(msgProtoTipo(produtos));
      }
      // "0" sozinho → produto fora da lista (ainda não comprou)
      if (s === '0') {
        await saveSession(sid, { ...session, state:'MENU' });
        return respond(`Esse produto você ainda *não comprou* com a gente 😊. ${_becoAssunto(session)}\n\n${_becoFerramenta(session)}\n\nQuer ver as opções que temos? Me diz o que procura (ex.: emagrecer, ganhar massa) ou digite *menu*. 💪`);
      }
      // pega TODOS os números da mensagem (ex.: "1 e 3", "1,2", "2 3") dentro do intervalo → protocolo separado (1) ou combinado (vários)
      const nums = ((mensagem||'').match(/\d+/g) || []).map(Number).filter(n => n >= 1 && n <= produtos.length);
      let escolhidos = [];
      if (nums.length) {
        escolhidos = [...new Set(nums)].map(n => produtos[n-1]);
      } else {
        const nm = norm(mensagem);
        const achou = produtos.find(p => { const np = norm(p); return np.includes(nm) || (nm.length>2 && nm.includes(np.split(' ')[0])); });
        if (achou) escolhidos = [achou];
        else if (nm.length > 2) {   // nomeou um produto que ainda não comprou
          await saveSession(sid, { ...session, state:'MENU' });
          return respond(`Esse produto você ainda *não comprou* com a gente 😊. ${_becoAssunto(session)}\n\n${_becoFerramenta(session)}\n\nQuer ver as opções que temos? Me diz o que procura ou digite *menu*. 💪`);
        }
      }
      if (!escolhidos.length) {
        const lista = produtos.map((p,i) => `${emojis(i)} ${p}`).join('\n');
        return respond(`Não entendi. 😊 Escolhe pelo *número* — pode ser *um*, *vários* (ex.: *1 e 3*, protocolo combinado) ou *todos*:\n\n${lista}\n\n0️⃣ Outro produto (que ainda não comprei)`);
      }
      await saveSession(sid, { ...session, state:'PROTO_TIPO', protoEscolhidos: escolhidos });
      return respond(msgProtoTipo(escolhidos));
    }

    // Escolhe entre protocolo completo (com tabela) OU só a tabela de fracionamento.
    if (state === 'PROTO_TIPO') {
      const s = norm(mensagem);
      if (/^(menu|inicio|início|voltar|cancelar)$/.test(s)) { await saveSession(sid, { ...session, state:'MENU' }); return respond(buildMenuPrincipal()); }
      const escolhidos = session.protoEscolhidos || [];
      if (!escolhidos.length) { await saveSession(sid, { ...session, state:'MENU' }); return respond(buildMenuPrincipal()); }
      // Opção 2 = SÓ a tabela de fracionamento (envio na hora, texto do Firebase).
      const soTabela = num === 2 || /\b(so|apenas|somente)\b.{0,8}(tabela|fracion)|^\s*(tabela|fracionament)/.test(s);
      if (soTabela) {
        const tabelas = await montarTabelas(escolhidos);
        // Mantém os produtos escolhidos e fica de olho: se ele responder "quero", monta o protocolo.
        await saveSession(sid, { ...session, state:'POS_TABELA_FRAC', fracFluxo:false, protoEscolhidos: escolhidos });
        const partes = partirMensagem(`💉 *TABELA(S) DE FRACIONAMENTO*\n\n${tabelas}\n\n_Guarde essa mensagem! Quer o *protocolo completo* desse(s) produto(s) também? Responde *quero* que eu monto na hora. 😉_`, 3500);
        return respond.apply(null, partes);
      }
      // Opção 1 (ou qualquer confirmação) = PROTOCOLO completo + tabela junto.
      const tabelas = await montarTabelas(escolhidos);
      await saveSession(sid, { ...session, state:'MENU', fracFluxo:false });
      await dispararIAProtocolo(sid, escolhidos, tabelas);
      const nomes = escolhidos.join(', ');
      return respond(escolhidos.length > 1
        ? `Show! 🙌 Tô montando o *protocolo combinado* de ${nomes} — e a *tabela de fracionamento* vem junto. Chega já já aqui embaixo. 💪`
        : `Show! 🙌 Tô montando o *protocolo completo do ${nomes}* — e a *tabela de fracionamento* vem junto. Chega já já aqui embaixo. 💪`);
    }
    // Logo DEPOIS de mandar só a tabela: se o cliente disser "quero", monta o protocolo do mesmo produto.
    if (state === 'POS_TABELA_FRAC') {
      const s = norm(mensagem);
      const escolhidos = session.protoEscolhidos || [];
      // Reconhece MUITAS formas de dizer "sim, quero o protocolo" (não é lista fixa).
      const disseSim = /\b(quero|qro|kero|queria|queru|gostaria|adoraria|preciso|manda|mandar|me manda|envia|enviar|monta|montar|faz|fazer|faca|faço|bota|coloca|quero sim|pode|pode ser|pode sim|pode mandar|podes|claro|lógico|logico|obvio|óbvio|com certeza|certeza|certamente|positivo|isso|isso mesmo|exato|aham|uhum|hum|opa|bora|beleza|blz|vamos|vamo|manda ver|tambem|também|tbm|esse|essa|o completo|completo|protocolo|sim)\b/.test(s)
        || /^\s*(s|sim|ss|ok|okk?|okay|1)\s*$/.test(s);
      const disseNao = /\b(nao|não|nem|depois|agora nao|agora não|deixa|dispensa|so a tabela|só a tabela|nada|to de boa|tô de boa)\b/.test(s);
      const querComprar = /\b(comprar|compra|preco|preço|produto|carrinho|adicionar|catalogo|catálogo)\b/.test(s);
      const querProto = disseSim && !disseNao && !querComprar;
      if (querProto && escolhidos.length) {
        const tabelas = await montarTabelas(escolhidos);
        await saveSession(sid, { ...session, state:'MENU' });
        await dispararIAProtocolo(sid, escolhidos, tabelas);
        return respond(`Show! 🙌 Tô montando o *protocolo completo* de ${escolhidos.join(', ')} — chega já já aqui embaixo. 💪`);
      }
      // Não quis o protocolo → segue o fluxo normal (dúvida/produto/menu).
      await saveSession(sid, { ...session, state:'MENU' });
      return await tratarTextoLivre(session, sid, n, buildMenuPrincipal(), respond);
    }
    if (state === 'PROTO_HUMANO') {
      const s = norm(mensagem);
      if (/(^|\s)(sim|s|quero|pode|por favor|isso|claro|manda)/.test(s)) {
        await saveSession(sid, { ...session, state:'MENU' });
        try { await enviarTelegram(`🙋 *ATENDIMENTO HUMANO (protocolo)*\n📱 ${sid}\nCliente diz que já comprou, mas não achei pedidos por CPF nem e-mail. Pediu atendente.`); } catch (e) {}
        return transferir(`Beleza! 🙏 Já *chamei um atendente humano* pra localizar seus pedidos e montar seu protocolo. Só um instante que já te respondem por aqui. 😊`);
      }
      await saveSession(sid, { ...session, state:'MENU' });
      return respond(`Tranquilo! 😊 Qualquer coisa é só chamar. Quer aproveitar e ver nossos produtos? Me diz seu objetivo ou digite *menu*.`);
    }

    // Promo Gênesis: o cliente escolhe o BRINDE (3º grátis) ANTES do frete.
    // Guarda o brinde e SEGUE pro estado/frete (o link só é gerado no CONFIRMAR).
    if (state === 'ESCOLHER_BRINDE') {
      const escolha = (mensagem || '').trim();
      const nEsc = norm(escolha);
      // Sair de vez (volta pro menu, carrinho guardado)
      if (!escolha || /^(menu|inicio|início|voltar|cancelar)$/i.test(nEsc)) {
        await saveSession(sid, { ...session, state:'MENU' });
        return respond('Sem problema! 😊 *Seu carrinho continua guardado* — quando quiser fechar, é só digitar *finalizar*.\n\n' + buildMenuPrincipal());
      }
      // Recusou escolher agora → segue pro frete; pode anotar o brinde na Observação no fechamento
      if (/\b(nao|não|nao quero|nao sei|sem brinde|depois|agora nao|deixa|pular|pula)\b/.test(nEsc)) {
        await saveSession(sid, { ...session, state:'ESTADO', brindeOferecido: true });
        return respond('Beleza! Você pode escolher o *3º grátis* na hora de fechar, escrevendo no campo *Observação*. 😉\n\n*De qual estado você é?* (pra eu calcular o frete)\nExemplo: RJ, SP, MG, DF, BA...');
      }
      // Escolheu o brinde → guarda, TROCA O ESTADO PRA ESTADO e segue pro frete (link só no fim)
      const novaSess = { ...session, state:'ESTADO', brinde: escolha, brindeOferecido: true };
      await saveSession(sid, novaSess);
      return respond(`🎁 Anotado! Seu *3º grátis* é *${escolha}*. 🥳\n\nAgora é só fechar:\n\n*De qual estado você é?* (pra eu calcular o frete)\nExemplo: RJ, SP, MG, DF, BA...`);
    }

    if (state === 'CONFIRMAR') {
      // v95: logo depois da simulação, número de parcelas ("2", "3x", "em 4 vezes") = quer pagar parcelado → gera o link
      // (as parcelas são escolhidas no próprio link). Antes o "2" virava "voltar ao menu" e o cliente saía.
      if (session.simulouParcela) {
        const _tp = norm(mensagem || '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        const _mp = _tp.match(/^(?:em |quero |pode ser |vou de |no )?(\d{1,2}) ?(?:x|vezes|parcelas?)?(?: no cartao| sem juros)?$/);
        if (_mp && Number(_mp[1]) >= 1 && Number(_mp[1]) <= 12) num = 1;
      }
      if (num === 2) { await saveSession(sid, { ...session, state:'MENU' }); return respond('Sem problema! 😊 *Seu carrinho continua guardado* — quando quiser fechar, é só digitar *finalizar*.\n\n' + buildMenuPrincipal()); }
      if (num === 1) {
        const carrinho = session.carrinho || [];
        if (!carrinho.length) { await saveSession(sid, { ...session, state:'MENU' }); return respond('Seu carrinho está vazio! 🛒\n\nEscolha um produto primeiro:\n\n' + MENU_PRINCIPAL); }
        // Rede de segurança: o brinde já é perguntado ANTES do frete (irParaCheckout).
        // Se, por algum caminho, o cliente chegou aqui sem ter sido oferecido, oferece agora.
        if (PROMO_GENESIS.ativa && !session.brinde && !session.brindeOferecido && contarGenesis(carrinho) >= 2) {
          await saveSession(sid, { ...session, state:'ESCOLHER_BRINDE', brindeOferecido: true });
          return respond(msgPerguntaBrinde(carrinho));
        }
        return await gerarLinkPedido(session, sid, respond, nomeAssistente);
      }
      // v87: o resumo mostrou as duas opções (frete grátis x desconto) → o cliente troca digitando A ou B.
      if (session.fgOpcoes) {
        const _fgT = norm(mensagem || '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
        const _fgNova = /^(a|opcao a|letra a)$/.test(_fgT) ? 'frete'
          : /^(b|opcao b|letra b)$/.test(_fgT) ? 'desconto'
          : /^(trocar|troca|mudar)$/.test(_fgT) ? (session.fgModo === 'frete' ? 'desconto' : 'frete') : '';
        if (_fgNova) {
          return await fecharResumoNormal({ ...session, fgEscolha: _fgNova, cupomDocId:null, cupomCodigo:null }, sid, session.cupomUlt || null, respond);
        }
      }
      // Quer simular PARCELAMENTO na hora de fechar → mostra e mantém o pedido pronto.
      if (ehPedidoParcelamento(mensagem)) {
        await saveSession(sid, { ...session, simulouParcela: true });   // v95: o próximo "2"/"3x" é parcela, não "voltar"
        return respond(simularParcelas(session.total || totalCarrinho(session.carrinho || [])) + `\n\nQuando quiser, digite *1* para *confirmar a compra* (no link você escolhe em quantas vezes) ou *menu* para voltar.`);
      }
      // Opção B: cliente pode digitar um código de cupom aqui (não em promoção/negociação)
      // Só tenta como CUPOM se PARECER um código (uma palavra curta alfanumérica) — assim
      // "frete", "prazo", "quero pagar" etc. NÃO viram "cupom inválido" e o pedido é preservado.
      const _txt = (mensagem || '').trim();
      const pareceCupom = /^[a-z0-9._-]{3,20}$/i.test(_txt)
        && !/^(frete|prazo|pac|sedex|menu|inicio|voltar|sim|nao|nvao|ok|okay|comprar|pagar|rastrear|rastreio|duvida|duvidas)$/i.test(_txt);
      if (pareceCupom && session.descontoTipo !== 'promo' && session.descontoTipo !== 'namorados') {
        const totalProd = session.totalProd || totalCarrinho(session.carrinho || []);
        const resultado = await validarCupom(mensagem, totalProd);
        if (resultado.ok) {
          // Cupom de FRETE (frete grátis ou desconto no frete, ex.: FRETEZERO): aplica SEMPRE.
          // (até a v75 somava com os 3%; na v76 o fecharResumoNormal escolhe o MAIOR: frete OU 3%.)
          if (resultado.tipo === 'frete') {
            return await fecharResumoNormal({ ...session, cupomDocId:null, cupomCodigo:null }, sid, resultado, respond);
          }
          // Option B: o fecharResumoNormal já dá a CADA produto o MAIOR desconto (promo/cupom/3%).
          // Reprocessa com o cupom — se ele não vencer em nenhum item, o total fica igual e o cupom
          // não é aplicado (o cliente nunca fica pior); a nota de "não superou" aparece no resumo.
          return await fecharResumoNormal({ ...session, cupomDocId:null, cupomCodigo:null }, sid, resultado, respond);
        }
        // Falha técnica (cota do Firestore, rede) NÃO pode virar "não reconheci" — o cupom
        // pode estar certíssimo. Aconteceu em 08/09 com o INDEPENDENCIA99.
        if (resultado.erroTecnico) {
          await enviarTelegram(`⚠️ *CUPOM: falha técnica na consulta*\n🏷️ ${_txt}\n📱 ${sid}\nO cliente digitou um cupom e o Firestore não respondeu (cota/rede).`);
          return respond(`Tive um problema pra consultar o cupom *${_txt}* agora. 😕 *Não é você* — é do nosso lado.\n\nTenta de novo em uns minutinhos, ou digite *1* pra *confirmar a compra* (seu desconto de ${DESCONTO_ATHENA_PCT}% já está aplicado) ou *2* pra voltar ao menu. Se o cupom for de promoção, me chama que eu resolvo. 💚`);
        }
        return respond(`Não reconheci *${_txt}* como cupom. 😊 Mas seu *pedido está pronto*!\n\nDigite *1* para *confirmar a compra* ou *2* para voltar ao menu.`);
      }
      // Qualquer outra coisa (pergunta, palavra solta) NÃO perde o carrinho: reafirma o pedido.
      return respond(`Seu *pedido está pronto pra fechar*! 🛒\n\nDigite *1* para *confirmar a compra* ou *2* para voltar ao menu.\n\n_Se tiver um cupom de desconto, é só digitar o código agora._`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OBSERVAÇÃO DO PEDIDO (varejo e atacado) — perguntada logo antes de gerar o link
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'OBS_PERGUNTA') {
      const s = norm(mensagem);
      const ehSim = s === '1' || /^(sim|s|quero|claro|isso|yes|adicionar|acrescentar|tem|positivo|com certeza|bora|vou|sim quero)\b/.test(s);
      const ehNao = s === '2' || /^(nao|n|nenhuma|sem|nada|no|dispensa|deixa|negativo|pode gerar|gera|so gerar|só gerar|seguir|segue)\b/.test(s);
      if (ehSim) {
        await saveSession(sid, { ...session, state:'OBS_TEXTO' });
        return respond('📝 Perfeito! Escreva a *observação* que você quer registrar no pedido:');
      }
      if (ehNao) {
        return await _seguirAposObs({ ...session, obsColetada:true, obsCliente:'' }, sid, respond);
      }
      // v84: o cliente escreveu a observação direto aqui (caso real: "Ponto de Referência: Em frente ao…" e a pergunta se repetiu).
      const _obsDireta = (mensagem || '').trim();
      if (!/^\d+$/.test(_obsDireta) && _obsDireta.replace(/[^a-zA-ZÀ-ú]/g, '').length >= 8 && _obsDireta.split(/\s+/).length >= 2) {
        return await _seguirAposObs({ ...session, obsColetada:true, obsCliente: _obsDireta.slice(0, 300) }, sid, respond);
      }
      return respond('Você quer adicionar alguma *observação* ao pedido?\n\n1️⃣ Sim\n2️⃣ Não');
    }

    if (state === 'OBS_TEXTO') {
      const obsTxt = (mensagem || '').trim();
      if (!obsTxt) return respond('Pode escrever a observação do pedido (ou digite *não* pra seguir sem):');
      const ehNaoObs = /^(nao|n|sem|nenhuma|nada)$/.test(norm(obsTxt));
      const obsFinalCli = ehNaoObs ? '' : obsTxt.slice(0, 300);
      return await _seguirAposObs({ ...session, obsColetada:true, obsCliente: obsFinalCli }, sid, respond);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // AGUARDAR COMPROVANTE
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'AGUARDAR_COMPROVANTE') {
      // Cliente perguntou sobre PARCELAR enquanto o link está aberto → simula (não confirma nada).
      if (ehPedidoParcelamento(mensagem)) {
        return respond(simularParcelas(session.total || 0) + (session.link
          ? `\n\n💳 *Seu link de pagamento:*\n${session.link}\n\n${AVISO_RECEBEDOR}\n\n_No próprio link você escolhe as parcelas (até 12x)._ 😉`
          : `\n\n💳 É só abrir o *link de pagamento* que te mandei e escolher lá as parcelas (até 12x). 😉`));
      }
      // ⚠️ REGRA CRÍTICA: a Athena NUNCA confirma pagamento por palavra do cliente nem por comprovante.
      // Somente o webhook real da InfinitePay (via GAS) confirma o pagamento e muda o estado para COLETA_DADOS.
      // Aqui, o cliente que diz "paguei"/manda print apenas recebe acolhimento. Se insistir 2+ vezes, aciona suporte humano.
      const palavrasPag = ['paguei','pix feito','fiz o pix','transferi','pago','pix realizado','comprovante','ja paguei','ja transferi','sim','yes','realizei','confirmado','feito','ok','okay','comprei','finalizei'];
      const ehMidiaBC = !!(body.type || body.mediaUrl || body.media_url || body.fileUrl || body.url || body.arquivo || body.file || body.caption !== undefined);
      const ehUrlImagem = !!(mensagem && mensagem.match(/https?:\/\/[^\s]+(jpg|jpeg|png|gif|pdf|mp4|webp|ogg|opus)/i));
      const dizQuePagou = ehMidiaBC || ehUrlImagem || palavrasPag.some(p => n.includes(p));

      const carrinhoPend = session.carrinho || [];
      const totalPend = session.total || 0;

      // ── LINK NÃO ABRE (17/09/2026) ─────────────────────────────────────────
      // Caso real: cliente com pedido de R$ 654 gerado disse "Link não abre" e recebeu, DUAS
      // vezes, o mesmo bloco "você tem um pedido em aberto" com o mesmo link. Venda parada.
      // Aqui NÃO gera link novo (geraria pedido duplicado): manda o link SOZINHO numa linha (é
      // o formato que o WhatsApp mais reconhece como clicável), ensina a copiar/colar, e AVISA
      // A EQUIPE no Telegram pra alguém mandar Pix/link manual. O pedido continua guardado.
      const _linkNaoAbre = /(link|pagamento|pagina|página)[^a-z]{0,20}(nao|não|n)\s*(abre|abriu|abriu?|funciona|funcionou|carrega|carregou|vai|foi|da certo|deu certo)|(nao|não) (consigo|consegui|to conseguindo|estou conseguindo|da pra|dá pra) (abrir|pagar|acessar|entrar)|deu erro|(esta|está|ta|tá) dando erro|erro no (link|pagamento)|link (quebrado|invalido|inválido|expirou|expirado|vencido|com erro)/.test(n);
      if (_linkNaoAbre) {
        const _jaAvisou = session.linkNaoAbreAvisado ? true : false;
        if (!_jaAvisou) {
          try {
            await enviarTelegram(
              `⚠️ *LINK NÃO ABRE — cliente travado no pagamento*\n` +
              `📦 ${session.orderNsu || '—'}\n📱 ${sid}\n💰 R$ ${totalPend.toFixed(2).replace('.',',')}\n` +
              `O cliente diz que o link de pagamento não abre. Mandar Pix/link manual por aqui.`
            );
          } catch (e) {}
        }
        await saveSession(sid, { ...session, linkNaoAbreAvisado: true });
        return respond(
          `Poxa, que chato! 😕 Vamos resolver: *seu pedido está guardado* (R$ ${totalPend.toFixed(2).replace('.',',')}).\n\n` +
          (session.link ? `Tenta por este link aqui, sozinho — toca nele ou *copia e cola no navegador*:\n\n${session.link}\n\n${AVISO_RECEBEDOR}\n\n` : '') +
          `Se ainda assim não abrir, *já avisei nossa equipe* — em instantes alguém te manda o *Pix* ou um link novo por aqui mesmo. 🧡`
        );
      }

      if (dizQuePagou && session.pixRef && await pixJaPago(session)) {
        // A Bras Pay diz que está pago: a função braspay já confirmou no GAS — em instantes chega o pedido de dados.
        await saveSession(sid, { ...session, insistPagou: 0 });
        return respond(`✅ *Pagamento localizado!* Obrigada! 🧡\n\nEm instantes eu te chamo aqui pra pegar os *dados de envio*. 🚀`);
      }
      // Pediu o Pix / o código / a chave → manda o copia e cola de novo (gera outro se venceu)
      const _pedePix = !dizQuePagou && /\bpix\b|copia e cola|copia-e-cola|copia cola|qr ?code|codigo do pagamento|código do pagamento|chave/.test(n);
      if (_pedePix && session.orderNsu) {
        const { pix: _px, mudou: _mud } = await pixDaSessao(session);
        if (_px) {
          if (_mud) await saveSession(sid, { ...session, ...camposPixSessao(_px, session.total || 0) });
          return await responderDiretoMulti(sid, [
            `⚡ Aqui está o *Pix copia e cola* do seu pedido (R$ ${(session.total || 0).toFixed(2).replace('.',',')}). ` +
            `${nomeAssistente === 'Athena' ? 'O código vai na *próxima mensagem*' : 'O código está *logo abaixo*'}: é só copiar e colar no app do seu banco (*Pix → Pix copia e cola*).`,
            _px.code
          ], respond, nomeAssistente);
        }
      }

      if (dizQuePagou) {
        const insist = (session.insistPagou || 0) + 1;
        if (insist >= 2) {
          // Insistiu 2+ vezes sem o webhook ter confirmado → aciona suporte humano, mas mantém o pedido.
          await enviarTelegram(
            `🔔 *CLIENTE DIZ QUE PAGOU — sem confirmação do webhook*\n` +
            `📦 ${session.orderNsu || '—'}\n📱 ${sid}\n💰 R$ ${totalPend.toFixed(2).replace('.',',')}\n` +
            `O cliente afirma ter pago ${insist}x e a InfinitePay ainda não confirmou. Verificar manualmente.`
          );
          await saveSession(sid, { ...session, insistPagou: insist });
          return respond(
            `Entendi! 🧡 Já *avisei nossa equipe* pra verificar seu pagamento manualmente — em instantes alguém te dá retorno por aqui.\n\n` +
            `Pode ficar tranquilo: *seu pedido está guardado* e o link continua válido. Assim que o pagamento for localizado, eu sigo com seu envio na hora. 😊`
          );
        }
        await saveSession(sid, { ...session, insistPagou: insist });
        return respond(
          `Recebido! 🧡 Assim que o pagamento cair, a *confirmação chega aqui automaticamente* e eu já sigo com seu envio — você não precisa enviar comprovante nem avisar.\n\n` +
          `Se você já pagou e em alguns minutinhos eu não confirmar, é só me mandar *"paguei"* de novo que eu *aciono um atendente* pra verificar pra você. 😊\n\n` +
          `_(Seu pedido está guardado e o link continua válido.)_`
        );
      }

      // Mensagem padrão de pedido em aberto (não fala em "digite SIM" — só o pagamento confirma).
      // Reenvia o LINK salvo na sessão, pra "cadê o link?" sempre devolver o link.
      const { pix: _pxPend, mudou: _mudPend } = await pixDaSessao(session);
      if (_mudPend) await saveSession(sid, { ...session, ...camposPixSessao(_pxPend, totalPend) });
      return await responderDiretoMulti(sid, [
        `⏳ Você tem um pedido em aberto aguardando pagamento:\n\n` +
        `${resumoCarrinho(carrinhoPend)}\n` +
        `💰 *R$ ${totalPend.toFixed(2).replace(".",",")}*\n\n` +
        blocoPagamento(_pxPend, session.link || '', nomeAssistente === 'Athena') +
        `É só concluir o pagamento${_pxPend ? '' : ' pelo seu link'} — assim que cair, *eu confirmo automaticamente aqui* e já pego seus dados de envio. 🚀\n\n` +
        `Se quiser cancelar e começar do zero, digite *menu*. 😊`,
        _pxPend ? _pxPend.code : ''
      ], respond, nomeAssistente);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COLETA DE DADOS
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'COLETA_DADOS') {
      // v91 — leitura em qualquer formato (ver coletaLer). `coletaMsg` = só o que o cliente informou (fica na sessão);
      // `coleta` = com o telefone do WhatsApp e o estado do frete quando ele não informou (é o que vai pro pedido).
      const _lido = await coletaLer(mensagem, session.coleta || {}, sid, session);
      const coletaMsg = _lido.coleta;
      const coleta = _lido.completa;
      const faltam = coletaFalta(coleta);

      if (faltam.length > 0) {
        const tentativas = (session.coletaTentativas || 0) + 1;
        const _soAviso = !_lido.ganhou.length && _coletaEhSoAviso(n);          // "ok", "já mando": não conta
        const semProgresso = _lido.ganhou.length ? 0 : (session.coletaSemProgresso || 0) + (_soAviso ? 0 : 1);
        // TRAVA: pedido já pago nunca volta ao menu. 2 respostas seguidas sem nenhum dado novo → atendente
        // (em vez de perguntar a mesma coisa pela 3ª vez). O aviso no Telegram sai uma vez só.
        if (semProgresso >= 2) {
          if (!session.coletaEscalada) {
            await enviarTelegram(
              `⚠️ *COLETA TRAVADA — pedido PAGO* (precisa de atendimento humano)\n` +
              `📦 ${session.orderNsu || '—'}\n📱 ${sid}\n` +
              `Faltando: ${faltam.join(', ')}\n` +
              `Dados captados: ${JSON.stringify(coleta)}\n` +
              `Última mensagem do cliente: ${mensagem}`
            );
          }
          await saveSession(sid, { ...session, coleta: coletaMsg, coletaTentativas: tentativas, coletaSemProgresso: semProgresso, coletaEscalada: true });
          return await responderDireto(sid,
            `Obrigada! 🙏 Já recebi parte dos seus dados. Vou pedir pra um atendente *finalizar seu envio* com você pra não ter erro — seu *pedido está pago e garantido*. 😊\n\n` +
            `Se quiser adiantar, só falta:\n${faltam.map(f => '• ' + COLETA_NOMES[f]).join('\n')}`,
            respond, nomeAssistente);
        }
        await saveSession(sid, { ...session, coleta: coletaMsg, coletaTentativas: tentativas, coletaSemProgresso: semProgresso });
        // pelo canal direto: se o BotConversa reentregar a resposta antiga do webhook, ela vem vazia
        const _nadaAinda = !Object.keys(coletaMsg).some(k => COLETA_OBRIG.indexOf(k) >= 0 && coletaMsg[k]);
        return await responderDireto(sid, coletaPergunta(faltam, _nadaAinda), respond, nomeAssistente);
      }

      const carrinho = session.carrinho || [];
      const frete    = session.freteSelecionado || {};
      const total    = session.total || 0;
      const num_pedido = session.orderNsu || await gerarNumeroPedido(tipoNumeroAthena(session));

      // Endereço completo + telefone no recibo, pro cliente CONFERIR e corrigir ANTES do envio.
      const _cepFmt = String(coleta.cep || '').replace(/\D/g,'').replace(/^(\d{5})(\d{3})$/, '$1-$2') || (coleta.cep || '');
      const _telD = String(coleta.telefone || '').replace(/\D/g,'');
      const _telFmt = _telD.length === 11 ? `(${_telD.slice(0,2)}) ${_telD.slice(2,7)}-${_telD.slice(7)}`
                    : _telD.length === 10 ? `(${_telD.slice(0,2)}) ${_telD.slice(2,6)}-${_telD.slice(6)}`
                    : (coleta.telefone || '');
      const _endRua = [coleta.endereco, coleta.complemento].filter(Boolean).join(', ');
      const _endLoc = [coleta.bairro, (coleta.cidade ? coleta.cidade + (coleta.estado ? '-' + coleta.estado : '') : coleta.estado)].filter(Boolean).join(', ');
      const _endCompleto = [ [_endRua, _endLoc].filter(Boolean).join(' — '), (_cepFmt ? 'CEP ' + _cepFmt : '') ].filter(Boolean).join(', ');
      const linkRecibo = gerarLinkRecibo(
        num_pedido || 'VF-A', coleta.nome, coleta.cpf, coleta.email || '',
        'WhatsApp / Athena', carrinho, frete, total, _endCompleto, _telFmt
      );

      const primeiroNome = (coleta.nome || '').split(' ')[0];
      const msg1 =
        `✅ *Pedido ${num_pedido||''} confirmado!*\n\n` +
        `Olá, *${primeiroNome}*! Obrigada pela confiança na VitaFlow! 🧡\n\n` +
        `${resumoCarrinho(carrinho)}\n` +
        `🚚 ${frete.label} — ${session.estadoCliente}\n` +
        `💰 R$ ${total.toFixed(2).replace('.',',')}\n\n` +
        `🧾 *Seu recibo completo:*\n${linkRecibo}\n\n` +
        `⏱️ *Prazo de postagem:* até 3 dias úteis após a confirmação do pagamento.\n\n` +
        `📦 *Prazos de entrega depois da postagem (dias úteis):*\n` +
        `• Sudeste: SP e RJ 1 a 6 · MG 2 a 6 · ES 2 a 8\n` +
        `• Sul: PR 2 a 6 · SC 2 a 7 · RS 2 a 5\n` +
        `• Centro-Oeste: DF 3 a 6 · GO 2 a 6 · MS 4 a 8 · MT 4 a 9\n` +
        `• Nordeste: BA 3 a 10 · demais estados 5 a 11\n` +
        `• Norte: 7 a 11\n\n` +
        `🏭 *Atacado:* postagem em até *6 dias úteis* após a confirmação do pagamento. Depois da postagem, valem os mesmos prazos de entrega (acima).\n` +
        `_*Estimativas, podem variar conforme distância e condições._\n\n` +
        `🔍 *Rastreie seu pedido em tempo real:*\nvitaflowoficial.com/pages/rastrear-pedido\n` +
        `Use qualquer uma dessas informações para rastrear:\n` +
        `• *Número do pedido:* ${num_pedido||''}\n` +
        (coleta.cpf ? `• *CPF:* ${coleta.cpf}\n` : '') +
        (coleta.email ? `• *E-mail:* ${coleta.email}\n` : '') +
        `\n📲 *Entre nos nossos grupos oficiais!*\n` +
        `Fique por dentro de promoções, lançamentos e avisos em primeira mão:\n` +
        `💬 Grupo VIP no WhatsApp: ${GRUPO_WHATSAPP}\n` +
        `✈️ Referências no Telegram: ${GRUPO_TELEGRAM}`;

      const msg2 =
        `🚨 *IMPORTANTE — LEIA ATÉ O FINAL* 🚨\n\n` +
        `⚠️ *AVISO IMPORTANTE — VITAFLOW* ⚠️\n\n` +
        `Antes de receber seu pedido, leia com atenção. Essas instruções são essenciais para te ajudarmos em qualquer situação. 🙏\n\n` +
        `📹 *1. FILME A ABERTURA DA EMBALAGEM*\n` +
        `Ao receber sua encomenda, grave um vídeo contínuo e sem cortes — desde a embalagem fechada até retirar todos os itens.\nIsso é obrigatório para qualquer tipo de reclamação.\n\n` +
        `✅ Mostre a caixa fechada antes de abrir\n` +
        `✅ Não pause nem corte o vídeo em nenhum momento\n` +
        `✅ Filme todos os produtos ao retirar da caixa\n\n` +
        `❗ Sem o vídeo, não conseguimos abrir reclamação junto à transportadora e não teremos como te ajudar.\n` +
        `📌 Por quê? Já identificamos casos em que entregadores retiraram produtos da caixa e a lacram novamente de forma perfeita, sem deixar vestígio. O vídeo é a única prova possível nesses casos.\n\n` +
        `📍 *2. ENDEREÇO COMPLETO E ALGUÉM PARA RECEBER*\n` +
        `Informe seu endereço com todos os detalhes: rua, número, complemento, bloco, apartamento, bairro e ponto de referência.\nE, obrigatoriamente, deve haver uma pessoa disponível no local para receber o pedido pessoalmente.\n\n` +
        `✅ Confira todos os dados antes de finalizar o pedido\n` +
        `✅ Garanta que haverá alguém no endereço no dia da entrega\n` +
        `❌ Não solicite deixar o pacote sem ninguém para receber. Já tivemos casos em que o cliente pediu isso e depois alegou não ter recebido — porém a transportadora apresentou comprovante de entrega. Nesse caso, não temos como ajudar.\n\n` +
        `💬 Teve algum problema? Fale com a gente pelo WhatsApp assim que identificar qualquer divergência e envie o vídeo da abertura junto com os detalhes do pedido. Faremos tudo ao nosso alcance para resolver! 💪\n\n` +
        `— *Equipe VitaFlow* 🧡`;

      // Mensagem 3 — números da sorte (vazia quando a compra não gera nada).
      // Vai ENTRE a confirmação e o aviso, pra ser lida logo depois do recibo.
      // A consulta do acumulado tem timeout curto e falha em silêncio: se o GAS
      // não responder, a mensagem sai só com os números DESTA compra.
      const _acumSorteio = SORTEIO.ativa ? await consultarAcumuladoSorteio(coleta.cpf) : null;
      const msg3 = blocoSorteioPosVenda(total, (frete && frete.valor) || 0, coleta.nome || '', _acumSorteio, num_pedido);

      // 1) ENTREGA O RECIBO PRIMEIRO, pelo canal DIRETO da API (não depende do webhook).
      //    Assim o cliente recebe o recibo + o aviso SEMPRE, mesmo que o trabalho pesado
      //    abaixo (GAS/Telegram) demore e o webhook estoure timeout.
      //    enviarWhatsAppDireto pula texto vazio sozinho, então msg3 vazia não atrapalha.
      // Na Stella (VitaMK), o envio direto usa a key da Athena e não entrega aqui — força
      // o fallback síncrono (respond) logo abaixo, que responde na conversa certa.
      // v91: o envio do recibo COMEÇA primeiro e o trabalho pesado roda AO MESMO TEMPO (antes era um depois do outro e a
      // chamada passava de 14 s — o BotConversa desistia de esperar e reenviava a resposta anterior).
      const _pRecibo = (nomeAssistente && nomeAssistente !== 'Athena')
        ? Promise.resolve(false)
        : enviarWhatsAppDireto(sid, [msg1, msg3, msg2]).catch(() => false);
      const _tarefas = [];

      // 2) TRABALHO PESADO em paralelo com o recibo (tudo best-effort, não trava nada).
      if (num_pedido) {
        _tarefas.push((async () => {
        try {
          // v77 (29/09/2026): SÓ o nome do produto na descrição. Antes ia "${i.nome} x${i.qtd}" e o GAS ainda
          // acrescenta " x<qtd>" → na planilha ficava "BOTOX Allergan 100UI x2 (R$ … un.) x2" (qtd DUAS vezes).
          // Isso quebrava o e-mail de recompra (produto não achado no site / "já recomprou" falhando), o lucro do
          // Telegram ("sem vínculo no radar", casa por nome) e o Painel de Dados. Agora grava igual ao site.
          const items = carrinho.map(i => ({
            description: String(i.nome || '').trim(), quantity: i.qtd, price: Math.round(i.preco * 100)
          }));
          items.push({ description: `Frete ${frete.label} — ${session.estadoCliente}`, quantity: 1, price: Math.round(frete.valor * 100) });
          // Promo Gênesis: recupera o brinde (da sessão OU do nó vitaflow_brindes) → Observação do pedido.
          let _obsBrinde = '';
          try {
            let _br = session.brinde || '';
            if (!_br && num_pedido) {
              const _rb = await fetch(fbUrl(`/vitaflow_brindes/${String(num_pedido).replace(/[^a-zA-Z0-9]/g,'_')}.json`));
              const _db = await _rb.json();
              if (_db && _db.brinde) _br = _db.brinde;
            }
            if (_br) _obsBrinde = 'BRINDE (3º grátis — promo Gênesis Compre 2 Leve 3): ' + _br;
          } catch (e) {}
          // Observação do cliente: recupera da sessão OU do nó durável vitaflow_obs_cliente.
          let _obsCliente = session.obsCliente || '';
          try {
            if (!_obsCliente && num_pedido) {
              const _ro = await fetch(fbUrl(`/vitaflow_obs_cliente/${String(num_pedido).replace(/[^a-zA-Z0-9]/g,'_')}.json`));
              const _do = await _ro.json();
              if (_do && _do.obs) _obsCliente = _do.obs;
            }
          } catch (e) {}
          // Junta brinde + observação do cliente no MESMO campo, sem um sobrescrever o outro.
          const _obsFinal = [_obsBrinde, _obsCliente ? ('Obs. do cliente: ' + _obsCliente) : ''].filter(Boolean).join(' | ');
          await salvarPedidoGAS({
            order_nsu: num_pedido,
            paid_amount: Math.round(total * 100),
            capture_method: 'whatsapp_athena',
            observacao: _obsFinal,
            customer: { name: coleta.nome, email: (coleta.email||'nao_informado').toLowerCase(), phone_number: coleta.telefone, document: coleta.cpf, observacao: _obsFinal },
            address: { street: coleta.endereco, number: '', complement: coleta.complemento||'', neighborhood: coleta.bairro, city: coleta.cidade, state: coleta.estado, cep: coleta.cep },
            items
          });
        } catch (e) {}
        })());
        _tarefas.push((async () => {
        try {
          const itensTxt = carrinho.map(i => `🛒 ${i.nome} x${i.qtd}`).join('\n');
          await enviarTelegram(
            `🤖 *VENDA ATHENA!*\n\n📦 ${num_pedido}\n👤 ${coleta.nome}\n🪪 ${coleta.cpf}\n📱 ${coleta.telefone}\n📧 ${coleta.email||'—'}\n🏠 ${coleta.endereco}${coleta.complemento?', '+coleta.complemento:''}, ${coleta.bairro}, ${coleta.cidade}-${coleta.estado}, ${coleta.cep}\n${itensTxt}\n🚚 ${frete.label} ${session.estadoCliente}\n💰 R$ ${total.toFixed(2)}${session.obsCliente?`\n📝 Obs: ${session.obsCliente}`:''}\n📱 ${sid}`
          );
        } catch (e) {}
        })());
      }

      // Incrementa uso do cupom SOMENTE agora (pedido confirmado)
      if (session.cupomDocId) _tarefas.push((async () => { try { await incrementarUsoCupom(session.cupomDocId); } catch (e) {} })());

      // PROTOCOLO PÓS-VENDA: dispara a IA pra gerar e ENVIAR o protocolo completo (canal próprio).
      _tarefas.push((async () => { try { const _nomesProto = (carrinho || []).map(function(i){ return i.nome; }); const _tabProto = await montarTabelas(_nomesProto); await dispararIAProtocolo(sid, _nomesProto, _tabProto); } catch (e) {} })());

      const reciboEnviado = await _pRecibo;
      await Promise.all(_tarefas);

      await deleteAguardandoDados(sid);
      await deleteSession(sid);
      // Se o recibo já saiu pelo canal direto, responde vazio (evita duplicar). Se o envio
      // direto FALHOU, cai no fallback da resposta síncrona do webhook.
      // No fallback síncrono, respond() só tem 3 slots e não pode deixar buraco no meio:
      // compacta a lista antes de mandar.
      const _fb = [msg1, msg3, msg2].filter(Boolean);
      return reciboEnviado ? respond('') : respond(_fb[0] || '', _fb[1] || '', _fb[2] || '');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROTOCOLO (única parte com IA)
    // ═══════════════════════════════════════════════════════════════════════════
    if (state === 'PROTOCOLO') {
      // Só NÚMERO PURO (1-2 dígitos) seleciona um produto da lista.
      // Impede que uma frase com números ("1 sim 2 gordura... 3 irregularmente") vire seleção de produto.
      if (ehNumeroSimplesMenu && session.listaProtocolo && num >= 1 && num <= session.listaProtocolo.length) {
        const prod = session.listaProtocolo[num - 1];
        await saveSession(sid, { ...session, state:'QUANTIDADE', produtoSelecionado: prod });
        return respond(`Você escolheu:\n📦 *${prod.nome}*\n💰 R$ ${prod.preco.toFixed(2).replace('.',',')}\n\n*Quantas unidades deseja?*\n_(Digite o número)_`);
      }
      // Qualquer dúvida/protocolo → IA ASSÍNCRONA (inteligente e SEM timeout).
      // Aposentada a IA síncrona antiga (era ela que dava timeout no galho de Protocolo).
      return await responderComIA(sid, mensagem, contextoLista(session), respond);
    }

    // Fallback (preserva o carrinho — só esvazia após compra confirmada)
    await saveSession(sid, { ...session, state:'TRIAGEM' });
    return respond(buildTriagem());

  } catch(err) {
    console.error('ERRO GERAL:', err);
    return respond('Desculpe o delay! 😊 Digite *menu* para começar.');
  }
};

// ── v96: VIGIA DAS CONVERSAS ─────────────────────────────────────────────────
// Não mexe na resposta: só olha o que entrou e o que saiu e avisa no Telegram quando parece que a conversa travou.
const VIGIA = { ativo: true, intervaloMs: 20 * 60 * 1000 };
const _vigiaUltAlerta = {};   // fone -> ts do último alerta (memória do container)
const _vigiaUltMsg = {};      // fone -> { m, ts } última mensagem do cliente
function vigiaMotivo(msgCli, resp) {
  const m = String(msgCli || ''), r = String(resp || '');
  const nm = m.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/N[ãa]o encontrei \*|N[ãa]o tenho \*|n[ãa]o reconhecid|isso n[ãa]o parece|Op[çc][ãa]o inv[áa]lida|N[ãa]o entendi/i.test(r)) return 'resposta de "não achei / não entendi"';
  if (/\b(atendente|humano|falar com (alguem|uma pessoa|pessoa)|pessoa real)\b/.test(nm)) return 'cliente pediu atendente';
  if (/\b(porra|caralho|merda|lixo|absurdo|palhacada|ridiculo|golpe|nao responde|ninguem responde|nao chegou|reclamacao|veio errado)\b/.test(nm)) return 'cliente reclamando';
  return '';
}
async function vigiaAthena(event, res) {
  if (!VIGIA.ativo || !res || res.statusCode !== 200) return;
  let b = {}, out = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return; }
  try { out = JSON.parse(res.body || '{}'); } catch (e) { return; }
  const fone = String(b.phone || b.subscriber_id || '').replace(/\D/g, '');
  const msg = String(b.mensagem || b.message || b.texto || '').trim();
  const resp = [out.resposta, out.resposta2, out.resposta3].filter(Boolean).join('\n');
  if (!fone || !msg || !resp) return;
  const agora = Date.now();
  let motivo = vigiaMotivo(msg, resp);
  const ant = _vigiaUltMsg[fone];
  if (!motivo && ant && ant.m === msg.toLowerCase() && (agora - ant.ts) < 30 * 60 * 1000 && !/^\d{1,2}$/.test(msg)) motivo = 'cliente repetiu a mesma mensagem';
  _vigiaUltMsg[fone] = { m: msg.toLowerCase(), ts: agora };
  if (!motivo) return;
  if (_vigiaUltAlerta[fone] && (agora - _vigiaUltAlerta[fone]) < VIGIA.intervaloMs) return;
  _vigiaUltAlerta[fone] = agora;
  const quem = String(b.assistente || b.nome_assistente || 'Athena');
  await enviarTelegram('👁️ VIGIA ' + quem.toUpperCase() + ' — ' + motivo + '\n📱 ' + fone + '\n💬 Cliente: ' + msg.slice(0, 200) + '\n🤖 Resposta: ' + resp.replace(/\s+/g, ' ').slice(0, 250));
}
const _handlerSemVigia = exports.handler;
exports.handler = async (event) => {
  const res = await _handlerSemVigia(event);
  try { await vigiaAthena(event, res); } catch (e) {}
  return res;
};
exports._vigia = { vigiaMotivo };

