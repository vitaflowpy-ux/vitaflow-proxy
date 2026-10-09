'use strict';
/* =============================================================================
   logistica-painel.js — DADOS DO PAINEL DA LOGÍSTICA (VitaFlow)  ·  v18  ·  08/10/2026
   v18 (08/10): pedido E (etiqueta avulsa criada no Frete VitaFlow do Painel de Dados) tratado como o reenvio R em ehReenvio
       → fora do "fora do prazo" (não ganha cupom/e-mail de atraso).
   v17 (08/10, Thiago: "quero que reenvio tambem envie email para cliente"): desfeitas as 2 travas da v16 — reenvio (R) dividido
       recebe o e-mail "seu pedido vai em N pacotes" igual a pedido normal, e a aba Duplicados mostra o estado real do e-mail.
   v16 (08/10, pedido do Thiago: o reenvio VF-0710-R002 não foi dividido — GAS v62 passa a criar linha D também para reenvio R):
       · aba Duplicados: linha D de um reenvio mostra "reenvio — sem e-mail dos pacotes" (antes ficaria "ainda não enviado" para sempre);
       · emailPacotes recusa pedido de reenvio (R) — o cliente do reenvio não recebe o e-mail "seu pedido vai em N pacotes".
   v15 (pedido do Thiago, 05/10: "ao criar um pedido duplicado o sistema avise isso no painel da logística com os dados, pois eles
       precisam ter esse controle também, mesmo que os e-mails já tenham sido disparados para os clientes" · "é quando eu compro
       produtos de fornecedores diferentes, então o pedido se divide em outros com o prefixo D, geram outros códigos de rastreio"
       · "não quero aviso no WhatsApp da logística, apenas no painel"):
       PEDIDOS DUPLICADOS — toda linha D (pacote do pedido: coluna PEDIDO_ORIGINAL preenchida, ou número VF-DDMM-D…) aparece no
       painel com os dados dela e dos outros pacotes do mesmo pedido. acao 'duplicados' (lista) e 'duplicados_visto' (✔ Visto por
       linha D — vitaflow_sync/logistica/duplicados_vistos/<pedido D> = { ts, uid }). O placar devolve `duplicados.total` (os não
       vistos). Entregue, cancelado e não pago não contam; janela de 60 dias pela data do pedido. Só LÊ a planilha (espelho) e o
       registro do e-mail dos pacotes. NENHUM WhatsApp, nenhum e-mail novo.
   v14 (ordem do Thiago, 04/10: "coloca um limite de leituras, depois de travar ela espera alguns minutos e recomeça de onde
       parou, e assim vai até terminar toda a rodada"): SÓ o coletor da Onlog muda — coletorOnlog(ticket, opts).
       O Cloudflare da Onlog troca para "Confirme que é humano" depois de ~8 consultas na mesma página (medido em 04/10).
       opts (tudo opcional; sem opts o coletor faz exatamente o que fazia na v13):
         · max    = limite de consultas NESTA página; ao chegar nele o coletor termina com estado 'pausa' (não é erro);
         · cpfDe  = por qual CPF da fila começar (retoma de onde parou);
         · pular  = códigos de objeto que já foram consultados nesta rodada (não repete);
         · fase   = 'cpf' (só os códigos novos) | 'status' (só a situação) | vazio (as duas);
         · lote   = objetos por consulta na leitura da situação (padrão 20; a Onlog aceitou 60 no teste de 04/10).
       Novos em window._vfOnlog: consultas, cpf_prox, st_tentados (códigos consultados nesta página), st_resta.
       Quem orquestra as páginas (abrir de novo depois de uma pausa) é a extensão "Rodada de códigos" v1.2. Ninguém clica no Cloudflare.
   v13 (OK do Thiago, 04/10: "ok, pode fazer tudo" às 3 sugestões):
       (1) OCORRÊNCIAS — o que o Rastreamento sinaliza na coluna ACAO_MANUAL (ausente, endereço incorreto, fiscalização, extravio,
           devolvido, objeto cancelado/devolvido na Onlog, +25 dias) passa a aparecer no painel da logística: acao 'ocorrencias'
           (lista) e 'ocorrencias_visto' (✔ Visto por pedido, vale enquanto o aviso é o mesmo — vitaflow_sync/logistica/
           acao_manual_vistos). O placar devolve `ocorrencias.total`. Só LÊ a planilha: mudar o status e o "✓ Resolvido" continuam
           no painel de Rastreamento (é ele que grava histórico e manda o e-mail de status).
       (3) RESUMO DAS PASSADAS NO WHATSAPP da logística, na rotina das 10h (logistica-atrasos v5 → avisoPassadas): passadas do
           rastreio e rodadas de códigos desde o último resumo, ocorrências e dúvidas esperando, e alerta se uma das rotinas parou.
           Chave: passadas_whatsapp (ligado é o padrão). acao 'passadas_resumo' = enviar agora / ver o texto. Sem dado de cliente.
       Resto = v12.
   v12 (pedido do Thiago, 04/10: "colocasse no aviso do painel da logística o resultado depois de cada passada"; ele escolheu "as duas" e
       "quadro no painel"): codigos_pendentes devolve `rastreio.passadas` — o resultado das últimas passadas do rastreio automático,
       gravado pelo Rastreamento v20 em vitaflow_sync/logistica/rastreio_passadas (só números). As rodadas de códigos já iam em
       `rodadas`. Resto = v11.
   v11 (pedido do Thiago, 04/10: "Esse aviso vai para o painel da logística??" / "Sim, pode fazer e publicar"): PEDIDOS QUE O RASTREIO
       NÃO CONSEGUE CONSULTAR POR FALTA DE DADO (hoje: J&T sem CPF na planilha). O Rastreamento v19 grava a lista no fim de cada passada
       completa em vitaflow_sync/logistica/rastreio_sem_consulta; codigos_pendentes devolve `rastreio.sem_consulta` (a aba Códigos mostra).
       Sai da lista na hora se o CPF já foi preenchido ou o pedido foi encerrado. Aviso no WhatsApp da logística com o que é NOVO, na
       leitura da rodada de códigos, pela mesma chave onlog_whatsapp. Controle em …/rastreio_sem_consulta_avisados. Sem nome de cliente.
       Resto = v10.
   v10 (OK do Thiago, 04/10: "pode fazer tudo"): AVISO NO WHATSAPP DA LOGÍSTICA quando surge AVISO NOVO DA ONLOG (objeto cancelado,
       devolvido/voltando, com problema ou parado na Onlog). Sai no fim da leitura da situação (rodada de códigos), só com o que é
       NOVO desde o último aviso e não está marcado como visto. Mesmo número e mesma Z-API do resumo dos parados (ana_whatsapp).
       Chave: onlog_whatsapp (ligado é o padrão; desligado = só o painel). Sem nome de cliente na mensagem. Controle em
       vitaflow_sync/logistica/onlog_avisados/<pedido>. codigos_pendentes.onlog devolve `whatsapp` (ligado/desligado). Resto = v9.
   v9 (ordem do Thiago, 04/10: "resolva DEFINITIVAMENTE" — ele escolheu "ler a Onlog e avisar"): SITUAÇÃO DOS OBJETOS NA ONLOG.
       · a rodada de códigos passa a ler também a SITUAÇÃO de cada objeto em aberto no site da Onlog (consulta por código, vários
         de uma vez; abre o detalhe só do que mudou). Fica em vitaflow_sync/logistica/onlog_status/<pedido> — o Rastreamento v17 lê
         de lá: Loggi e Fastpack (sem API) passam a atualizar por ali, e a J&T com leitura fresca não gasta o PacoteVício.
       · AVISOS na aba Códigos (codigos_pendentes devolve `onlog.alertas`): objeto CANCELADO, DEVOLVIDO/voltando, com PROBLEMA
         (endereço errado, pacote problemático…) e PARADO na Onlog antes de chegar à transportadora (2 dias úteis ou mais —
         config onlog_parado_dias). ✔ Visto por pedido (acao 'codigos_onlog_visto') — some até a situação mudar.
       · objeto CANCELADO ou DEVOLVIDO na Onlog NUNCA é gravado sozinho num pedido (caso VF-2009-S016: a rodada de 01/10 gravou o
         código de um objeto cancelado). Vira dúvida "cancelado" quando o pedido não tem outro objeto.
       · o detalhe do objeto agora é lido evento por evento (título, detalhe, data) — antes a linha de detalhe ("(cidade) ENDEREÇO
         INCORRETO.") era lida como se fosse o status.
       · ticket: 45 min (a leitura da situação alonga a rodada). Resto = v8.
   v8 (pedido do Thiago, 03-04/10): EXCLUIR CUPOM DA LISTA (acao 'cupons_excluir'). E-mail JÁ ENVIADO → só sai da lista (o cupom
       continua valendo). E-mail NÃO enviado (a logística decidiu não mandar) → o cupom é CANCELADO (ativo:false no Firestore: some de
       "Meus cupons" e o carrinho recusa) e sai da lista. Cupom já usado → só sai da lista. O registro fica (oculto_ts), então a rodada
       NÃO gera outro cupom para o pedido. Excluído não recebe e-mail. desfazer:true volta (e reativa o cupom cancelado). Resto = v7.
   v7 (OK do Thiago, 02/10): o RESUMO DAS 10h no WhatsApp da logística (avisoParados) passa a trazer também QUEM PASSOU DO PRAZO DE
       POSTAGEM (3 dias úteis no varejo, 6 no atacado) — a mesma lista da aba Atrasos, sem os marcados com ✔ Visto: pedido, fornecedor,
       dias úteis e até quando era. O resumo sai quando há parados OU atrasados na postagem. Mesma chave (parados_whatsapp). Resto = v6.
   v6 (ordem do Thiago, 01-02/10): O E-MAIL DE ATRASO VIROU E-MAIL DE AVISO DE POSTAGEM. Sai para o pedido que a LOGÍSTICA marcou
       como POSTADO na planilha e a transportadora ainda não leu — a mesma regra do aviso da página de rastreio (rastreio-consulta
       v7) — e leva o MESMO texto da página (texto 1 = sem código; texto 2 = com código; os textos do Thiago, sem mudar palavra,
       lidos de textos/rastreio_aviso_*). UM e-mail por pedido (o pedido dividido em pacotes recebe um só), sem lembrete.
       Revendedor (V) nunca recebe. Entrega por MOTOBOY não recebe. Chave PRÓPRIA: email_postagem_modo (desligado é o padrão —
       a chave antiga email_atraso_modo não liga nada). acao 'postagens' (fila + configuração) · enviar_teste tipo
       'postagem_sem_codigo' / 'postagem_objeto_criado'. Contador: vitaflow_sync/logistica/email_postagem/<pedido>.
       O e-mail antigo ("ainda está em separação") não é mais enviado; a lista Atrasos (cobrança do fornecedor) continua igual.
   v5 (Thiago, 01/10, noite): (1) VISTO — parados e atrasos de envio ganham o campo `visto` (vitaflow_sync/logistica/vistos/<pedido>,
       gravado pelo painel): o pedido sai da lista, do placar e do resumo do WhatsApp até mudar de status. Em pedido em trânsito, o
       visto liga o aviso "equipe acompanhando" na página de rastreio (rastreio-consulta v6). (2) CUPOM: nasce sozinho, mas o
       E-MAIL SÓ SAI PELO BOTÃO do painel (acao 'cupons_enviar': por pedido ou todos os pendentes). (3) O cupom leva na
       "Descrição" da Gestão de Cupons o motivo e o pedido ("Atraso na entrega · VF-…") — sem o nome do cliente, porque a coleção
       é aberta para leitura. (4) ?defaults=1 devolve também os textos dos avisos da página de rastreio (rastreio_aviso_*).
   v4 (Thiago, 01/10): CUPOM DE ATRASO + PEDIDOS PARADOS + CAMPINAS.
       · cupom de atraso: o pedido que passa da PREVISÃO MÁXIMA de entrega (a mesma conta da página de rastreio) e ainda não
         chegou ganha UM cupom (padrão 5%, uso único, 45 dias), gravado na coleção cupons_vitaflow (a mesma da Gestão de
         Cupons, do carrinho e da Athena — formato do cupom de boas-vindas). 1 por pedido, mesmo dividido em pacotes.
         O cliente recebe por e-mail e vê em "Meus cupons" na Minha Conta (conta-cliente v3 lê cupons_atraso/<pedido>).
         Fora: revendedor (V), reenvio (R), cancelado, não pago, entregue e pedido com ocorrência.
         acao 'cupons' (lista + simulação) · 'cupons_rodar' · enviar_teste tipo 'cupom'. Roda todo dia útil pela logistica-atrasos v3.
         Chave: cupom_atraso_modo (desligado é o padrão) · cupom_atraso_desde (só previsão vencida a partir desta data).
       · parados: pedido com mais de 3 DIAS ÚTEIS no mesmo status (menos entregue, cancelado e não pago) — acao 'parados'
         (aba Parados do painel) e resumo de manhã no WhatsApp da logística (avisoParados, chamado pela logistica-atrasos v3).
       · origem 'CP' = Campinas/SP (fornecedora VitaFlow — rastreio-consulta v5).
   v3 (Thiago, 01/10 — férias da Ana Clara): RODADA DE CÓDIGOS + PACOTES.
       · codigos_pendentes / codigos_ticket / codigos_fila / codigos_entrada / codigos_casar / codigos_aplicar / codigos_ignorar:
         o Claude lê o site do Daniel (códigos, CPF do cliente e ORIGEM MS/SP) e a Onlog (por CPF: AA + código real da
         transportadora) no navegador do Thiago e manda pra cá; aqui os códigos são casados com os pedidos SEM código e os
         CERTOS (1 código × 1 pedido do mesmo CPF) são gravados pelo Apps Script (action aplicar_codigos do GAS v53, com as
         travas do Rastreamento: nunca sobrescreve, recusa código repetido). O que não é certo vira DÚVIDA na aba Códigos.
         Entrega do Daniel por MOTOBOY (SP): a palavra MOTOBOY vai pra planilha no lugar do código (pedido do Thiago).
       · email_pacotes: e-mail "seu pedido vai em N pacotes" (o Compras chama quando TODOS os fornecedores foram comprados).
         Diz o que vai em cada pacote e de onde sai. Nunca o nome do fornecedor. Revendedor (V) não recebe.
       · atrasos: a linha D (pacote, coluna PEDIDO_ORIGINAL) continua na lista de cobrança, mas o e-mail de atraso sai UM por
         pedido (o contador é o do pedido original) — com texto próprio quando só um dos pacotes está atrasado.
   v2 (Thiago, 01/10): PEDIDO DE REVENDEDOR (prefixo V, ex. VF-2309-V002) NÃO RECEBE E-MAIL NOSSO — mesma regra do
       e-mail de compra e do de recompra no GAS. Continua na lista de atrasados (pra cobrar o fornecedor), marcado
       'revendedor: true', mas o decidirEnvio devolve null (nem 1º aviso nem lembrete) e o e-mail de teste nunca
       usa pedido V como exemplo. A logistica-atrasos.js usa este mesmo decidirEnvio.
   Netlify Function no repo vitaflow-proxy → netlify/functions/logistica-painel.js
   URL: https://vitaflow-proxy.netlify.app/.netlify/functions/logistica-painel

   O QUE FAZ (pedido do Thiago, 01/10: itens 4 e 5 do plano da logística)
     acao 'numeros' — NÚMEROS DA LOGÍSTICA: por estado (pago → entregue), por transportadora (postado → entregue +
                      ocorrências), por fornecedor (pago → postado) e a tendência mês a mês. Só agregados.
     acao 'atrasos' — pedidos PAGOS que passaram do prazo de POSTAGEM e ainda não foram postados (lista de cobrança
                      por fornecedor) + quantos e-mails de atraso cada cliente já recebeu.
     acao 'enviar_teste' — manda o e-mail de atraso (1º aviso, com os dados do 1º pedido atrasado) para o e-mail de
                      teste da configuração. Não conta como envio.
     GET ?defaults=1 — textos padrão do e-mail de atraso (sem login), pro painel mostrar na aba Textos.
     (v3) acao 'codigos_*' e 'email_pacotes' — ver o bloco "v3" mais abaixo.

   QUEM PODE: só admin. O painel manda o idToken do Firebase Auth; aqui ele é conferido lendo admins/<uid> com o
   próprio token (o Firebase recusa token falso/vencido) — o mesmo teste que o painel faz no login.
   (v3) codigos_fila e codigos_entrada aceitam um TICKET de 30 min (criado por um admin em codigos_ticket) — é o que a aba
   do Daniel / da Onlog usa pra mandar os dados sem ter o login do painel. email_pacotes aceita a chave do Compras
   (variável COMPRAS_KEY) ou o login de admin.

   O PRAZO É O MESMO DO RASTREIO: usa a tabela PRAZOS_ENTREGA e os dias úteis (feriados) da rastreio-consulta v3.
   Mudou o prazo → muda lá (e no GAS) — este arquivo não tem número de prazo próprio.

   LÊ: vitaflow_pedidos_hdr · vitaflow_pedidos · vitaflow_historico_status · vitaflow_sync/rastreio_eventos/<k>
       vitaflow_sync/logistica/{config,textos,email_atraso}
   GRAVA: (v4) vitaflow_sync/logistica/{cupons_atraso,cupons_atraso_log,parados_avisados} e o documento atraso_<pedido> na coleção
          cupons_vitaflow do Firestore.
          (v3) vitaflow_sync/logistica/codigos/{ticket,entrada,rodada_atual,ultima,rodadas,ignorados} e
          vitaflow_sync/logistica/{email_pacotes,email_pacotes_fila}. O e-mail de ATRASO de verdade continua na logistica-atrasos.js.
          A PLANILHA só é alterada pelo Apps Script (aplicar_codigos).
   Variáveis de ambiente: FIREBASE_SECRET · BREVO_API_KEY · COMPRAS_KEY · (v4) LOG_ZAPI_INSTANCE · LOG_ZAPI_TOKEN · ZAPI_CLIENT_TOKEN
   (todas já existem no site vitaflow-proxy; as três da Z-API são as do bot da logística).
   ============================================================================= */
var R = require('./rastreio-consulta.js').lib;

var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var RAIZ = 'vitaflow_sync/logistica';
var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};
var LOGO = 'https://cdn.shopify.com/s/files/1/0777/9762/1945/files/vitaflow_no_bg_pro.png?v=1775266917';
var RASTREIO_URL = 'https://vitaflowoficial.com/pages/rastrear-pedido';
var DIA = 86400000;

function resp(obj, code) { return { statusCode: code || 200, headers: CORS, body: JSON.stringify(obj) }; }

/* ============================ textos do e-mail (editáveis no painel) ============================ */
var EMAIL_PADRAO = {
  email_atraso_assunto: 'Seu pedido {PEDIDO} ainda está em separação',
  email_atraso_1:
    'Olá, {NOME}!\n\n' +
    'Seu pedido {PEDIDO}, confirmado em {DATA}, ainda está em separação no estoque e passou do prazo de postagem que informamos (até {PRAZO_POSTAGEM} dias úteis). Pedimos desculpas pela espera.\n\n' +
    'Nossa equipe está acompanhando o seu pedido junto ao estoque. Assim que ele for postado, o código de rastreio aparece na página de rastreio.\n\n' +
    'Acompanhe em vitaflowoficial.com/pages/rastrear-pedido (use o número do pedido, o CPF ou o e-mail).\n\n' +
    'Se precisar, fale com a nossa logística pelo WhatsApp +44 7537 155718.\n\n' +
    'Equipe VitaFlow',
  email_atraso_lembrete:
    'Olá, {NOME}!\n\n' +
    'Seu pedido {PEDIDO} continua em separação no estoque ({DIAS} dias úteis desde a confirmação). Seguimos acompanhando e cobrando o envio.\n\n' +
    'Assim que ele for postado, o código de rastreio aparece em vitaflowoficial.com/pages/rastrear-pedido.\n\n' +
    'Se precisar, fale com a nossa logística pelo WhatsApp +44 7537 155718.\n\n' +
    'Equipe VitaFlow',
  /* v3: o pedido foi dividido em pacotes e só UM (ou alguns) está atrasado */
  email_atraso_pacote_1:
    'Olá, {NOME}!\n\n' +
    'Um dos pacotes do seu pedido {PEDIDO}, confirmado em {DATA}, ainda está em separação no estoque e passou do prazo de postagem que informamos (até {PRAZO_POSTAGEM} dias úteis). Pedimos desculpas pela espera.\n\n' +
    'Nossa equipe está acompanhando esse pacote junto ao estoque. Assim que ele for postado, o rastreio dele aparece na página de rastreio.\n\n' +
    'Acompanhe em vitaflowoficial.com/pages/rastrear-pedido (use o número do pedido, o CPF ou o e-mail).\n\n' +
    'Se precisar, fale com a nossa logística pelo WhatsApp +44 7537 155718.\n\n' +
    'Equipe VitaFlow',
  email_atraso_pacote_lembrete:
    'Olá, {NOME}!\n\n' +
    'Um dos pacotes do seu pedido {PEDIDO} continua em separação no estoque ({DIAS} dias úteis desde a confirmação). Seguimos acompanhando e cobrando o envio.\n\n' +
    'Assim que ele for postado, o rastreio dele aparece em vitaflowoficial.com/pages/rastrear-pedido.\n\n' +
    'Se precisar, fale com a nossa logística pelo WhatsApp +44 7537 155718.\n\n' +
    'Equipe VitaFlow',
  /* v3: e-mail "seu pedido vai em N pacotes" ({PACOTES} = a lista dos pacotes, montada pelo sistema) */
  email_pacotes_assunto: 'Seu pedido {PEDIDO} será enviado em {N} pacotes',
  email_pacotes_texto:
    'Olá, {NOME}!\n\n' +
    'Seu pedido {PEDIDO} será enviado em {N} pacotes, porque os produtos saem de centros de distribuição diferentes. Cada pacote tem o seu próprio rastreio e pode chegar em um dia diferente.\n\n' +
    '{PACOTES}\n\n' +
    'Acompanhe cada pacote em vitaflowoficial.com/pages/rastrear-pedido (use o número do pedido, o CPF ou o e-mail).\n\n' +
    'Se precisar, fale com a nossa logística pelo WhatsApp +44 7537 155718.\n\n' +
    'Equipe VitaFlow',
  /* v6: E-MAIL DE AVISO DE POSTAGEM. {AVISO} = o MESMO aviso da página de rastreio (texto do Thiago, inteiro); {TITULO} = a 1ª frase dele */
  email_postagem_assunto: '{TITULO} — pedido {PEDIDO}',
  email_postagem_texto:
    'Olá, {NOME}!\n\n' +
    '{AVISO}\n\n' +
    'Acompanhe em vitaflowoficial.com/pages/rastrear-pedido (use o número do pedido, o CPF ou o e-mail).\n\n' +
    'Se precisar, fale com a nossa logística pelo WhatsApp +44 7537 155718.\n\n' +
    'Equipe VitaFlow',
  /* v4: cupom de atraso na entrega ({CUPOM}, {PCT}, {VALIDADE} e {PREVISAO} são preenchidos pelo sistema) */
  email_cupom_assunto: 'Um cupom de {PCT}% para você — pedido {PEDIDO}',
  email_cupom_texto:
    'Olá, {NOME}!\n\n' +
    'Seu pedido {PEDIDO} passou da previsão de entrega que informamos (até {PREVISAO}). Pedimos desculpas pela demora. A nossa logística continua acompanhando o envio até ele chegar.\n\n' +
    'Para compensar a espera, você ganhou um cupom de {PCT}% de desconto para a sua próxima compra:\n\n' +
    'Cupom: {CUPOM}\nVálido até {VALIDADE} · uso único\n\n' +
    'É só digitar o código no carrinho do site. Ele não se soma a outras promoções: em cada produto vale o maior desconto.\n\n' +
    'O cupom também fica guardado na sua conta, em vitaflowoficial.com/pages/minha-conta (área "Meus cupons").\n\n' +
    'Acompanhe o pedido em vitaflowoficial.com/pages/rastrear-pedido.\n\n' +
    'Se precisar, fale com a nossa logística pelo WhatsApp +44 7537 155718.\n\n' +
    'Equipe VitaFlow'
};
var EMAIL_CFG_PADRAO = { /* v13 */ passadas_whatsapp: 'ligado', email_atraso_modo: 'desligado', email_atraso_max: 3, email_atraso_intervalo_du: 3, email_atraso_janela_dias: 45,
  email_postagem_modo: 'desligado', email_postagem_janela_dias: 45,   /* v6 */
  email_pacotes_modo: 'ligado', codigos_janela_dias: 45, codigos_duvida_dias: 15,   /* v3 */
  /* v4 */ cupom_atraso_modo: 'desligado', cupom_atraso_pct: 5, cupom_atraso_dias: 45, cupom_atraso_prefixo: 'DESCULPA', cupom_atraso_janela_dias: 60,
  cupom_atraso_desde: 0, cupom_atraso_max_rodada: 12, parados_dias: 3, parados_janela_dias: 60, parados_whatsapp: 'ligado',
  /* v9 */ onlog_parado_dias: 2, onlog_janela_dias: 60, /* v10 */ onlog_whatsapp: 'ligado' };

function preencher(t, v) { return String(t || '').replace(/\{([A-Z_]+)\}/g, function (a, k) { return (v[k] != null) ? String(v[k]) : a; }); }
function escH(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* texto → HTML no padrão do e-mail "Pedido confirmado" (fundo cinza, cartão branco, logo no topo) */
/* v6: destaques do aviso no e-mail de postagem (os mesmos da página de rastreio v9 / bot v8) — só negrito, itálico e cor; nenhuma palavra muda */
var AV_EMOJI = '(?:[\\uD83C-\\uDBFF][\\uDC00-\\uDFFF]|[\\u2190-\\u2BFF\\uFE0F\\u200D])';
var AV_FIM = new RegExp('([.!?](?:\\s*' + AV_EMOJI + ')*)\\s+(?=[A-ZÀ-Ý])', 'g');
var AV_ATENCAO = ['o código de rastreamento ainda não está disponível', 'o status detalhado ainda não foi alterado'];
var AV_FORTE = ['o seu código aparecerá aqui!', 'as informações serão atualizadas automaticamente aqui', 'transporte 100% seguro', 'a postagem ocorrerá logo em seguida',
  'já abriu um chamado junto à transportadora'];
var AV_ITALICO = ['Fique tranquilo', 'fique tranquilo', 'Agradecemos a compreensão'];
function frasesAviso(t) {
  var frases = [];
  String(t || '').split(/\n+/).forEach(function (bloco) {
    bloco.replace(AV_FIM, '$1\n').split('\n').forEach(function (f) { f = f.replace(/^\s+|\s+$/g, ''); if (f) frases.push(f); });
  });
  return frases;
}
/* v19 (09/10/2026): e-mail ao cliente sai como documento HTML completo com viewport de celular.
   Sem o <meta viewport>, o app do Gmail no Android "infla" as letras pequenas (texto gigante, layout espremido). */
function emailDocMobile(corpo) {
  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no">' +
    '<title>VitaFlow</title>' +
    '<style>html,body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%}</style>' +
    '</head><body style="margin:0;padding:0;background:#eceff3;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%">' +
    corpo +
    '</body></html>';
}
function htmlEmail(texto, destaque) {
  var pars = String(texto || '').split(/\n{2,}/).map(function (p) {
    var h = escH(p).replace(/\n/g, '<br>').replace(/vitaflowoficial\.com\/pages\/rastrear-pedido/g,
      '<a href="' + RASTREIO_URL + '" style="color:#0280CD;font-weight:700">vitaflowoficial.com/pages/rastrear-pedido</a>');
    h = h.replace(/^(Pacote \d+[^<]*)/, '<b style="color:#0D1B2E">$1</b>');   /* v3: título de cada pacote */
    /* v4: link da Minha Conta e o cupom em destaque (parágrafo que começa com "Cupom: ") */
    h = h.replace(/vitaflowoficial\.com\/pages\/minha-conta/g, '<a href="https://vitaflowoficial.com/pages/minha-conta" style="color:#0280CD;font-weight:700">vitaflowoficial.com/pages/minha-conta</a>');
    var mC = h.match(/^Cupom: ([A-Z0-9-]+)(?:<br>(.*))?$/);
    if (mC) return '<div style="margin:0 0 16px;padding:16px 12px;border:2px dashed #F5A623;border-radius:12px;background:#fff8ea;text-align:center">' +
      '<div style="font-size:12px;color:#7a6a45;letter-spacing:1px;text-transform:uppercase">Seu cupom</div>' +
      '<div style="font-size:26px;font-weight:800;color:#0D1B2E;letter-spacing:2px;margin:6px 0">' + mC[1] + '</div>' +
      (mC[2] ? '<div style="font-size:13px;color:#41506a">' + mC[2] + '</div>' : '') + '</div>';
    if (destaque) {   /* v6: e-mail de aviso de postagem — 1ª frase em destaque, negrito nos pontos principais e itálico no "Fique tranquilo" */
      if (p === destaque) return '<p style="margin:0 0 14px;font-size:17px;font-weight:800;color:#12804f;line-height:1.45">' + h + '</p>';
      AV_ATENCAO.forEach(function (x) { h = h.split(escH(x)).join('<b style="color:#b86e00">' + escH(x) + '</b>'); });
      AV_FORTE.forEach(function (x) { h = h.split(escH(x)).join('<b style="color:#0D1B2E">' + escH(x) + '</b>'); });
      AV_ITALICO.forEach(function (x) { h = h.split(x).join('<i>' + x + '</i>'); });
    }
    return '<p style="margin:0 0 14px;font-size:15px;color:#41506a;line-height:1.65">' + h + '</p>';
  }).join('');
  return emailDocMobile('<div style="background:#eceff3;padding:20px 10px;font-family:Arial,Helvetica,sans-serif">' +
    '<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden">' +
    '<tr><td style="background:#0D1B2E;padding:24px 20px 20px;text-align:center">' +
    '<div style="height:4px;width:52px;margin:0 auto 14px;background:#F5A623;border-radius:2px"></div>' +
    '<img src="' + LOGO + '" alt="VitaFlow" width="170" style="display:inline-block;width:170px;max-width:60%;height:auto;border:0"></td></tr>' +
    '<tr><td style="padding:26px 22px 10px">' + pars + '</td></tr>' +
    '<tr><td style="padding:0 22px 24px"><a href="' + RASTREIO_URL + '" style="display:block;text-align:center;background:#F5A623;color:#0D1B2E;text-decoration:none;font-size:16px;font-weight:800;padding:15px 10px;border-radius:10px">&#128269; Rastrear pedido</a></td></tr>' +
    '</table></div>');
}

/* Brevo (API transacional) — a mesma conta/remetente do Apps Script */
async function enviarBrevo(para, nome, assunto, texto, destaque) {
  var chave = process.env.BREVO_API_KEY || '';
  if (!chave) return { ok: false, erro: 'falta a variável BREVO_API_KEY no Netlify' };
  try {
    var r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': chave, 'accept': 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'VitaFlow', email: 'contato@vitaflowoficial.com' },
        to: [{ email: para, name: nome || undefined }], subject: assunto, htmlContent: htmlEmail(texto, destaque), textContent: texto })
    });
    if (r.status >= 200 && r.status < 300) return { ok: true };
    return { ok: false, erro: 'Brevo HTTP ' + r.status + ' ' + String(await r.text()).slice(0, 200) };
  } catch (e) { return { ok: false, erro: 'Brevo: ' + e.message }; }
}

/* ============================ leitura dos pedidos ============================ */
var EXCECAO = { 'ENCAMINHADO PARA FISCALIZACAO': 1, 'DESTINATARIO AUSENTE': 1, 'ENDERECO INCORRETO': 1,
  'AREA COM DISTRIBUICAO': 1, 'PEDIDO EXTRAVIADO': 1, 'PEDIDO APREENDIDO': 1 };
var FINAL = { 'PEDIDO CANCELADO': 1, 'REEMBOLSO REALIZADO': 1 };
var ANTES_DE_POSTAR = { 'PEDIDO CONFIRMADO': 1, 'PAGO': 1, 'EM SEPARACAO': 1, 'DESPACHADO': 1 };

function transpNome(t) {
  var u = R.semAcentoUp(t);
  if (!u) return 'Sem transportadora';
  if (u.indexOf('J&T') >= 0 || /\bJT\b/.test(u) || u.indexOf('J T') >= 0) return 'J&T';
  if (u.indexOf('JADLOG') >= 0) return 'Jadlog';
  if (u.indexOf('LOGGI') >= 0) return 'Loggi';
  if (u.indexOf('TOTAL') >= 0) return 'Total Express';
  if (u.indexOf('SHOPEE') >= 0 || u.indexOf('SPX') >= 0) return 'Shopee';
  if (u.indexOf('CORREIO') >= 0 || u.indexOf('PAC') >= 0 || u.indexOf('SEDEX') >= 0) return 'Correios';
  return String(t).trim();
}
/* 1º fornecedor da coluna COMPRADO_FORNECEDORES ("Daniel MS | Respect" → Daniel) */
function fornNome(f) {
  var u = R.semAcentoUp(String(f || '').split(/\||\n|,/)[0]);
  if (!u) return 'Sem fornecedor';
  if (u.indexOf('DANIEL') >= 0) return 'Daniel';
  if (u.indexOf('RESPECT') >= 0) return 'Respect';
  if (u.indexOf('GEOVANNA') >= 0) return 'Geovanna';
  if (u.indexOf('CAMILA') >= 0) return 'Camila (atacado)';
  if (u.replace(/[^A-Z]/g, '').indexOf('VITAFLOW') === 0) return 'VitaFlow';
  if (u.indexOf('ROGER') >= 0) return 'Roger';
  var w = u.split(/\s+/)[0];
  return w.charAt(0) + w.slice(1).toLowerCase();
}

async function lerBase(comEmails) {
  var lidos = await Promise.all([
    R.fbGet('vitaflow_pedidos_hdr'), R.fbGet('vitaflow_pedidos'), R.fbGet('vitaflow_historico_status'),
    R.fbGetOu(RAIZ + '/config'), R.fbGetOu(RAIZ + '/textos'), comEmails ? R.fbGetOu(RAIZ + '/email_atraso') : Promise.resolve(null),
    R.fbGetOu(RAIZ + '/vistos'),   /* v5 */
    comEmails ? R.fbGetOu(RAIZ + '/email_postagem') : Promise.resolve(null)   /* v6 */
  ]);
  return { hdr: lidos[0] || [], esp: lidos[1] || {}, hist: lidos[2] || {}, cfg: lidos[3] || {}, txt: lidos[4] || {}, env: lidos[5] || {}, vistos: lidos[6] || {}, envPost: lidos[7] || {} };
}

/* um pedido do espelho → dados de tempo (ts em ms) */
function montarPedidos(base) {
  var hd = (base.hdr || []).map(function (h) { return String(h || '').trim().toUpperCase(); });
  var cT = hd.indexOf('TRANSPORTADORA'), cR = hd.indexOf('CODIGO_RASTREIO'); if (cR < 0) cR = hd.indexOf('CODIGO RASTREIO');
  var cF = hd.indexOf('COMPRADO_FORNECEDORES');
  var cAM = hd.indexOf('ACAO_MANUAL');   /* v13 */
  var cE = { orig: hd.indexOf('ORIGEM'), pai: hd.indexOf('PEDIDO_ORIGINAL') }, cO = hd.indexOf('CODIGO_ONLOG');   /* v3 */
  var out = [];
  Object.keys(base.esp).forEach(function (k) {
    var l = base.esp[k];
    if (!l || typeof l !== 'object' || !l[0]) return;
    var b = R.baseDaLinha(l, cT, cR, cF, cE);
    var st = R.semAcentoUp(b.status);
    var objH = base.hist[R.histKey(b.pedido)] || null, evs = [];
    if (objH && typeof objH === 'object') {
      evs = Object.keys(objH).map(function (x) { return objH[x]; }).filter(function (e) { return e && e.status && e.ts; })
        .sort(function (a, z) { return a.ts - z.ts; });
    }
    var tConf = 0, tPost = 0, tEnt = 0, oco = false, extr = false, apre = false;
    /* v4: desde quando o pedido está no status ATUAL (o começo da última sequência desse status no histórico) */
    var tStatus = 0;
    for (var iE = evs.length - 1; iE >= 0; iE--) { if (R.semAcentoUp(evs[iE].status) === st) tStatus = evs[iE].ts; else break; }
    if (!tStatus && evs.length) tStatus = evs[evs.length - 1].ts;   /* o status mudou sem passar pelo histórico: vale a última anotação */
    evs.forEach(function (e) {
      var su = R.semAcentoUp(e.status), o = R.ETAPA_ORDEM.hasOwnProperty(su) ? R.ETAPA_ORDEM[su] : -1;
      if (!tConf && su.indexOf('CONFIRMADO') >= 0) tConf = e.ts;
      if (!tPost && o >= 4) tPost = e.ts;
      if (!tEnt && su === 'ENTREGUE') tEnt = e.ts;
      if (EXCECAO[su]) oco = true;
      if (su === 'PEDIDO EXTRAVIADO') extr = true;
      if (su === 'PEDIDO APREENDIDO') apre = true;
    });
    if (EXCECAO[st]) oco = true;
    if (st === 'PEDIDO EXTRAVIADO') extr = true;
    if (st === 'PEDIDO APREENDIDO') apre = true;
    if (!tConf) { var md = String(b.data || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (md) tConf = new Date(md[3] + '-' + md[2] + '-' + md[1] + 'T12:00:00-03:00').getTime(); }
    var atacado = /VF-\d{4}-W/i.test(b.pedido) || R.semAcentoUp(b._forn).indexOf('CAMILA') >= 0;
    out.push({ k: R.histKey(b.pedido), pedido: b.pedido, nome: b.nome, email: String(l[2] || '').trim(), uf: b.estado, cidade: b.cidade,
      status: b.status, st: st, naoPagou: R.naoPagou(b.status, l[12]), final: !!FINAL[st], data: b.data,
      transp: transpNome(b.transportadora), transpTxt: b.transportadora, codigo: b._rast, forn: fornNome(b._forn), fornTxt: b._forn,
      atacado: atacado, tConf: tConf, tPost: tPost, tEnt: tEnt, oco: oco, extr: extr, apre: apre, tStatus: tStatus,
      /* v3: o que a rodada de códigos e os pacotes usam */
      cpf: cpf11(l[3]), cep: cepDe(l[8]), pai: b._pai, origCol: b._orig, produtos: b.produtos,
      cod: (String(b._rast || '').toUpperCase().indexOf('AVISO_ABANDONO') >= 0) ? '' : limparCod(b._rast),
      am: cAM >= 0 ? String(l[cAM] == null ? '' : l[cAM]).replace(/\s+/g, ' ').trim().slice(0, 240) : '',   /* v13 */
      onlog: limparCod(cO >= 0 ? l[cO] : ''), fams: linhasForn(b._forn).map(familia).filter(function (f, i, a) { return f && a.indexOf(f) === i; }) });
  });
  return out;
}

function faixaUF(uf) {
  var P = R.PRAZOS_ENTREGA;
  return (P.estados && P.estados[uf]) || P.regioes[R.UF_REGIAO[uf] || ''] || null;
}
function postDU(p) { return p.atacado ? R.PRAZOS_ENTREGA.atacado_postagem_du : R.PRAZOS_ENTREGA.varejo_postagem_du; }

/* ============================ NÚMEROS ============================ */
function estat(arr) {
  if (!arr.length) return { n: 0 };
  var s = arr.slice().sort(function (a, b) { return a - b; });
  var q = function (p) { return s[Math.max(0, Math.ceil(p * s.length) - 1)]; };
  return { n: s.length, mediana: q(0.5), p90: q(0.9) };
}
function pct(a, b) { return b ? Math.round(1000 * a / b) / 10 : null; }
function mesBR(ts) { return R.diaBR(ts).slice(0, 7); }

function calcularNumeros(peds, dias, agora) {
  agora = agora || Date.now();
  var ini = agora - dias * DIA;
  var validos = peds.filter(function (p) { return !p.naoPagou && !p.final && p.tConf; });
  var noPeriodo = validos.filter(function (p) { return p.tConf >= ini && p.tConf <= agora; });

  var G = { uf: {}, tr: {}, fo: {} };
  function g(tab, chave) { return tab[chave] || (tab[chave] = { dias: [], noPrazo: 0, base: 0, total: 0, oco: 0, extr: 0, apre: 0 }); }
  var postT = [], entT = [], totalNoPrazo = 0, totalEnt = 0;
  noPeriodo.forEach(function (p) {
    var fx = faixaUF(p.uf), pd = postDU(p);
    var dPost = (p.tPost && p.tPost >= p.tConf) ? R.duEntre(p.tConf, p.tPost) : null;
    var dEnt = (p.tEnt && p.tPost && p.tEnt >= p.tPost) ? R.duEntre(p.tPost, p.tEnt) : null;
    var dTot = (p.tEnt && p.tEnt >= p.tConf) ? R.duEntre(p.tConf, p.tEnt) : null;
    /* estado: pago → entregue */
    if (p.uf) {
      var a = g(G.uf, p.uf); a.total++;
      if (dTot != null) { a.dias.push(dTot); a.base++; if (fx && dTot <= pd + fx[1]) a.noPrazo++; }
    }
    /* transportadora: postado → entregue + ocorrências */
    if (p.tPost || p.transp !== 'Sem transportadora') {
      var t = g(G.tr, p.transp); t.total++;
      if (p.oco) t.oco++; if (p.extr) t.extr++; if (p.apre) t.apre++;
      if (dEnt != null) { t.dias.push(dEnt); t.base++; if (fx && dEnt <= fx[1]) t.noPrazo++; }
    }
    /* fornecedor: pago → postado */
    var f = g(G.fo, p.forn); f.total++;
    if (dPost != null) { f.dias.push(dPost); f.base++; if (dPost <= pd) f.noPrazo++; }
    if (dPost != null) postT.push(dPost);
    if (dTot != null) { entT.push(dTot); totalEnt++; if (fx && dTot <= pd + fx[1]) totalNoPrazo++; }
  });
  function lista(tab, extra) {
    return Object.keys(tab).map(function (k) {
      var x = tab[k], e = estat(x.dias), o = { nome: k, pedidos: x.total, base: x.base, mediana: e.mediana, p90: e.p90, no_prazo_pct: pct(x.noPrazo, x.base) };
      if (extra) { o.ocorrencias = x.oco; o.ocorrencias_pct = pct(x.oco, x.total); o.extravios = x.extr; o.apreensoes = x.apre; }
      return o;
    }).sort(function (a, b) { return b.pedidos - a.pedidos; });
  }
  var porUF = lista(G.uf).map(function (o) { var fx = faixaUF(o.nome); o.prazo_entrega = fx ? fx[0] + ' a ' + fx[1] : ''; return o; });

  /* tendência: últimos 6 meses (mês da confirmação) */
  var meses = [], d0 = new Date(agora);
  for (var i = 5; i >= 0; i--) {
    var dm = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - i, 15));
    meses.push(dm.getUTCFullYear() + '-' + ('0' + (dm.getUTCMonth() + 1)).slice(-2));
  }
  var M = {}; meses.forEach(function (m) { M[m] = { ped: 0, post: [], tot: [], noPrazo: 0, baseEnt: 0, oco: 0 }; });
  validos.forEach(function (p) {
    var m = M[mesBR(p.tConf)]; if (!m) return;
    var fx = faixaUF(p.uf), pd = postDU(p);
    m.ped++; if (p.oco) m.oco++;
    if (p.tPost && p.tPost >= p.tConf) m.post.push(R.duEntre(p.tConf, p.tPost));
    if (p.tEnt && p.tEnt >= p.tConf) { var dt = R.duEntre(p.tConf, p.tEnt); m.tot.push(dt); m.baseEnt++; if (fx && dt <= pd + fx[1]) m.noPrazo++; }
  });
  var mensal = meses.map(function (k) {
    var m = M[k];
    return { mes: k, pedidos: m.ped, mediana_postagem: estat(m.post).mediana, mediana_total: estat(m.tot).mediana,
      entregues: m.baseEnt, no_prazo_pct: pct(m.noPrazo, m.baseEnt), ocorrencias_pct: pct(m.oco, m.ped) };
  });

  var eP = estat(postT), eT = estat(entT);
  return {
    periodo_dias: dias, gerado_ts: agora,
    resumo: { pedidos: noPeriodo.length, postados: postT.length, entregues: totalEnt,
      mediana_postagem: eP.mediana, p90_postagem: eP.p90, mediana_total: eT.mediana, p90_total: eT.p90,
      no_prazo_pct: pct(totalNoPrazo, totalEnt) },
    por_uf: porUF, por_transportadora: lista(G.tr, true), por_fornecedor: lista(G.fo), mensal: mensal,
    prazos: { postagem_varejo: R.PRAZOS_ENTREGA.varejo_postagem_du, postagem_atacado: R.PRAZOS_ENTREGA.atacado_postagem_du }
  };
}

/* ============================ ATRASOS NA POSTAGEM ============================ */
async function calcularAtrasos(base, peds, agora) {
  agora = agora || Date.now();
  var cfg = Object.assign({}, EMAIL_CFG_PADRAO, base.cfg || {});
  var janela = Math.max(7, Number(cfg.email_atraso_janela_dias) || 45);
  var cand = peds.filter(function (p) {
    return ANTES_DE_POSTAR[p.st] && !p.naoPagou && p.tConf && !p.tPost && p.tConf >= agora - janela * DIA &&
      R.duEntre(p.tConf, agora) > postDU(p);
  });
  /* leitura real da transportadora = já foi postado (o status da planilha só não andou) */
  var evos = await Promise.all(cand.map(function (p) { return R.fbGetOu('vitaflow_sync/rastreio_eventos/' + p.k); }));
  /* v3: família = o pedido + as linhas D dele (PEDIDO_ORIGINAL). Quantas linhas pagas cada família tem. */
  var famTotal = {};
  peds.forEach(function (p) { if (!p.naoPagou && !p.final) { var kf0 = R.histKey(p.pai || p.pedido); famTotal[kf0] = (famTotal[kf0] || 0) + 1; } });
  var lista = [];
  cand.forEach(function (p, i) {
    var evo = evos[i];
    if (evo && evo.cod && p.codigo && String(evo.cod).replace(/\.0$/, '') !== String(p.codigo).replace(/\.0$/, '')) evo = null;
    if (evo && evo.primeira) return;
    var kf = R.histKey(p.pai || p.pedido);
    var pd = postDU(p), dias = R.duEntre(p.tConf, agora), env = (base.env || {})[kf] || {};
    lista.push({ k: p.k, k_email: kf, pedido_email: p.pai || p.pedido, pacote_de: p.pai || '', pedido: p.pedido, nome: p.nome, email: p.email, uf: p.uf, cidade: p.cidade, data: p.data, status: p.status,
      fornecedor: p.forn, fornecedor_txt: p.fornTxt, transportadora: p.transpTxt, codigo: p.codigo, atacado: p.atacado,
      dias: dias, prazo_postagem: pd, postagem_ate: R.ddmm(R.somaDU(p.tConf, pd)), conf_ts: p.tConf,
      emails: Number(env.n) || 0, email_ultimo: Number(env.ultimo) || 0, revendedor: ehRevendedor(p.pai || p.pedido),
      st: p.st, visto: vistoVale((base.vistos || {})[p.k], p.st) });   /* v5 */
  });
  /* v3: o e-mail sai UM por família — o "líder" é o pedido original (se estiver atrasado), senão a 1ª linha D atrasada.
     parcial = a família tem pacote que NÃO está atrasado (já postado ou ainda no prazo) → texto "um dos pacotes". */
  var porFam = {};
  lista.forEach(function (a) { (porFam[a.k_email] = porFam[a.k_email] || []).push(a); });
  Object.keys(porFam).forEach(function (kf) {
    var g = porFam[kf], lider = g.filter(function (a) { return !a.pacote_de; })[0] || g.slice().sort(function (x, y) { return x.pedido < y.pedido ? -1 : 1; })[0];
    g.forEach(function (a) { a.lider = (a === lider); a.parcial = (famTotal[kf] || 0) > g.length; });
  });
  lista.sort(function (a, b) { return b.dias - a.dias; });
  return lista;
}

/* ============================ v6: E-MAIL DE AVISO DE POSTAGEM ============================
   Pedido que a LOGÍSTICA marcou como POSTADO e a transportadora ainda não leu (a mesma regra do aviso da página de rastreio).
   tipo = 'sem_codigo' (sem código na planilha → texto 1) ou 'objeto_criado' (com código → texto 2). */
async function calcularPostagens(base, peds, agora) {
  agora = agora || Date.now();
  var cfg = Object.assign({}, EMAIL_CFG_PADRAO, base.cfg || {});
  var janela = Math.max(7, Number(cfg.email_postagem_janela_dias) || 45);
  var cand = peds.filter(function (p) {
    return p.st === 'POSTADO' && !p.naoPagou && !p.final && p.tConf && p.tConf >= agora - janela * DIA && String(p.cod || '') !== 'MOTOBOY';
  });
  var evos = await Promise.all(cand.map(function (p) { return R.fbGetOu('vitaflow_sync/rastreio_eventos/' + p.k); }));
  var porK = {}; peds.forEach(function (p) { porK[p.k] = p; });   /* a linha do pacote (D) nem sempre tem o e-mail: vale o do pedido original */
  var lista = [];
  cand.forEach(function (p, i) {
    var evo = evos[i];
    if (evo && evo.cod && p.codigo && String(evo.cod).replace(/\.0$/, '') !== String(p.codigo).replace(/\.0$/, '')) evo = null;
    if (evo && evo.primeira) return;   /* a transportadora já leu: o cliente vê o rastreio de verdade, não precisa do aviso */
    var kf = R.histKey(p.pai || p.pedido), env = (base.envPost || {})[kf] || {}, orig = p.pai ? (porK[kf] || null) : null;
    lista.push({ k: p.k, k_email: kf, pedido: p.pedido, pedido_email: p.pai || p.pedido, pacote_de: p.pai || '', nome: p.nome || (orig && orig.nome) || '', email: p.email || (orig && orig.email) || '', uf: p.uf, cidade: p.cidade,
      data: p.data, tipo: p.cod ? 'objeto_criado' : 'sem_codigo', atacado: p.atacado, postado_ts: p.tStatus || p.tPost || 0,
      emails: Number(env.n) || 0, email_ultimo: Number(env.ultimo) || 0, revendedor: ehRevendedor(p.pai || p.pedido) });
  });
  /* UM e-mail por pedido: se o pedido foi dividido em pacotes, responde por ele o pedido original (se estiver na lista) ou o 1º pacote */
  var porFam = {};
  lista.forEach(function (a) { (porFam[a.k_email] = porFam[a.k_email] || []).push(a); });
  Object.keys(porFam).forEach(function (kf) {
    var g = porFam[kf], lider = g.filter(function (a) { return !a.pacote_de; })[0] || g.slice().sort(function (x, y) { return x.pedido < y.pedido ? -1 : 1; })[0];
    g.forEach(function (a) { a.lider = (a === lider); });
  });
  lista.sort(function (a, b) { return (b.postado_ts || 0) - (a.postado_ts || 0); });
  return lista;
}
/* recebe o e-mail de postagem na próxima rodada? (um só por pedido; revendedor nunca) */
function decidirPostagem(a) {
  if (ehRevendedor(a.pedido_email || a.pedido)) return null;
  if (a.lider === false) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(a.email || ''))) return null;
  if (a.emails) return null;
  return 'postagem';
}
/* o e-mail = o MESMO aviso da página de rastreio (texto editado na aba Textos, senão o padrão do Thiago), uma frase por parágrafo */
function montarEmailPostagem(a, textos) {
  var T = Object.assign({}, EMAIL_PADRAO);
  Object.keys(EMAIL_PADRAO).forEach(function (k) { if (textos && textos[k] && String(textos[k]).trim()) T[k] = String(textos[k]); });
  var ch = 'rastreio_aviso_' + (a.tipo === 'objeto_criado' ? 'objeto_criado' : 'sem_codigo');
  var aviso = (textos && typeof textos[ch] === 'string' && textos[ch].trim()) ? textos[ch] : (R.AVISOS_PADRAO || {})[ch];
  var fr = frasesAviso(aviso);
  var v = { NOME: String(a.nome || '').split(' ')[0] || 'cliente', PEDIDO: a.pedido_email || a.pedido, TITULO: fr[0] || '', AVISO: fr.join('\n\n') };
  return { assunto: preencher(T.email_postagem_assunto, v), texto: preencher(T.email_postagem_texto, v), destaque: fr[0] || '' };
}

/* v2: pedido de REVENDEDOR = letra V depois da data (VF-DDMM-V###, VF-DDMM-VX…). Revendedor NÃO recebe e-mail nosso. */
function ehRevendedor(pedido) { return /^VF-\d{4}-V/i.test(String(pedido || '').trim()); }

/* quem recebe e-mail hoje (1º aviso ou lembrete) */
function decidirEnvio(a, cfg, agora) {
  if (ehRevendedor(a.pedido_email || a.pedido)) return null;   /* v2: revendedor nunca recebe */
  if (a.lider === false) return null;        /* v3: outro pacote do mesmo pedido já responde pelo e-mail */
  var max = Math.max(1, Number(cfg.email_atraso_max) || 3), inter = Math.max(1, Number(cfg.email_atraso_intervalo_du) || 3);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(a.email || ''))) return null;
  if (!a.emails) return 'primeiro';
  if (a.emails >= max) return null;
  if (a.email_ultimo && R.duEntre(a.email_ultimo, agora) >= inter) return 'lembrete';
  return null;
}
function montarEmail(a, tipo, txt) {
  var T = Object.assign({}, EMAIL_PADRAO);
  Object.keys(EMAIL_PADRAO).forEach(function (k) { if (txt && txt[k] && String(txt[k]).trim()) T[k] = String(txt[k]); });
  var v = { NOME: String(a.nome || '').split(' ')[0] || 'cliente', PEDIDO: a.pedido_email || a.pedido, DATA: a.data, DIAS: a.dias, PRAZO_POSTAGEM: a.prazo_postagem };
  var corpo = a.parcial ? (tipo === 'lembrete' ? T.email_atraso_pacote_lembrete : T.email_atraso_pacote_1)
                        : (tipo === 'lembrete' ? T.email_atraso_lembrete : T.email_atraso_1);
  return { assunto: preencher(T.email_atraso_assunto, v), texto: preencher(corpo, v) };
}


/* =====================================================================================================================
   v3 (01/10/2026) — RODADA DE CÓDIGOS (Daniel + Onlog) · E-MAIL "SEU PEDIDO VAI EM N PACOTES" · ATRASO COM PACOTES
   ===================================================================================================================== */
var crypto = require('crypto');
var GAS_URL = 'https://script.google.com/macros/s/AKfycbxFlaN0FXFbpcC8HZ80sxnq383m5d-xTaj5cg72VcCdnYx47N_qKkiELFN5KAPmm_nb/exec';
var COD = RAIZ + '/codigos';
var LOTE_GAS = 8;                  /* itens por chamada ao Apps Script. Na 1ª rodada real (01/10) 15 itens passaram de 22 s e a chamada caiu 2 vezes (o Apps Script gravou, mas a rodada perdeu o registro do lote). Com 8 fica em ~10 s. */
var ENTRADA_VALE_MS = 60 * 60000;  /* o que veio do site do Daniel / da Onlog vale 1 h */
var TICKET_VALE_MS = 45 * 60000;   /* v9: 45 min (era 30) — a leitura da situação na Onlog alonga a rodada */
var MAX_DIAS_PAR = 20;             /* código criado até 20 dias depois da confirmação do pedido */
var ORIGEM_NOME = { SP: 'São Paulo/SP', CP: 'Campinas/SP', MS: 'Ponta Porã/MS', RJ: 'Rio de Janeiro/RJ', PY: 'Ciudad del Este (Paraguai)' };   /* v4: CP */

/* ---- Firebase com escrita (o R.fbGet só lê) ---- */
function fbUrlW(caminho, query) {
  return FB_BASE + '/' + caminho + '.json?auth=' + encodeURIComponent(process.env.FIREBASE_SECRET || '') + (query ? '&' + query : '');
}
async function fbReq(metodo, caminho, corpo, query) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, 8000);
  try {
    var op = { method: metodo, signal: ctrl.signal };
    if (corpo !== undefined) { op.headers = { 'Content-Type': 'application/json' }; op.body = JSON.stringify(corpo); }
    var r = await fetch(fbUrlW(caminho, query), op);
    if (!r.ok) throw new Error('firebase ' + metodo + ' ' + r.status + ' ' + caminho);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function fbLerOu(caminho, query) { try { return await fbReq('GET', caminho, undefined, query); } catch (e) { return null; } }

/* ---- helpers ---- */
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function cpf11(v) { var d = String(v == null ? '' : v).replace(/\D/g, ''); return d.length === 10 ? '0' + d : d; }
function cepDe(txt) { var m = String(txt || '').match(/\d{5}-?\d{3}(?!\d)/g); return m ? m[m.length - 1].replace('-', '') : ''; }
function limparCod(c) {
  c = String(c == null ? '' : c).trim();
  if (/^\d+\.0+$/.test(c)) c = c.replace(/\.0+$/, '');
  return c.replace(/\s+/g, '').toUpperCase();
}
/* MOTOBOY (Thiago, 01/10): o Daniel faz algumas entregas em SP por motoboy. No site dele o "código" vem escrito MOTOBOY —
   essa palavra vai pra planilha NO LUGAR do código. Não é única (vários pedidos podem ter) e não tem transportadora. */
var MOTOBOY = 'MOTOBOY';
/* código de rastreio de verdade: só letras e números, 8 a 34 caracteres, com pelo menos 6 dígitos */
function codigoValido(c) { c = limparCod(c); return /^[A-Z0-9]{8,34}$/.test(c) && (c.match(/\d/g) || []).length >= 6; }
function txt(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function emailOk(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '')); }
/* família do fornecedor ("Daniel DALE IMPORTS", "Daniel MS" → DANIEL) — uso interno, nunca sai pro cliente (= _pacFamilia do GAS) */
function familia(f) {
  var u = R.semAcentoUp(String(f || '').split(':')[0]).replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();
  if (!u) return '';
  if (u.indexOf('DANIEL') >= 0) return 'DANIEL';
  if (u.indexOf('GEOVANNA') >= 0) return 'GEOVANNA';
  if (u.indexOf('RESPECT') >= 0) return 'RESPECT';
  if (u.replace(/ /g, '').indexOf('VITAFLOW') === 0) return 'VITAFLOW';
  if (u.indexOf('CAMILA') >= 0) return 'CAMILA';
  return u.split(' ')[0];
}
function linhasForn(fornTxt) { return String(fornTxt || '').split(/\n| \| /).map(function (x) { return x.trim(); }).filter(Boolean); }
/* = _detectarTransportadoraPorFormato do Rastreamento e _pacTranspPorFormato do GAS (mudou lá, muda aqui) */
function transpPorFormato(codigo) {
  var c = String(codigo || '').trim();
  if (!c) return '';
  if (/^D\d.*BR$/i.test(c)) return 'LOGGI';
  if (/^E?C\d.*[A-Z]\d*$/i.test(c) && !/BR$/i.test(c) && c.length >= 16) return 'LOGGI';
  if (/^TX.+TX$/i.test(c)) return 'TOTAL EXPRESS';
  if (/^888\d{12}$/.test(c)) return 'J&T';
  if (/^\d{14}$/.test(c)) return 'JADLOG';
  if (/^BR\d+V$/i.test(c)) return 'SPX';
  if (/^[A-Za-z]{2}\d{9}[A-Za-z]{2}$/.test(c)) return 'CORREIOS';
  if (/^\d{9}$/.test(c)) return 'JADLOG';
  return '';
}
/* transportadora de um objeto da Onlog: 1º o formato do código; senão, o operador que a Onlog mostra (FASTPACK…).
   "2X" e "ONLOG" não são transportadora (é o serviço da própria Onlog) → fica vazio. */
function transpOnlog(operador, codigo) {
  var f = transpPorFormato(codigo);
  if (f) return f;
  var u = R.semAcentoUp(operador).replace(/\s+/g, ' ');
  if (!u || u === '2X' || u.indexOf('ONLOG') >= 0) return '';
  if (u.indexOf('JT') === 0 || u.indexOf('J&T') >= 0) return 'J&T';
  if (u.indexOf('JADLOG') >= 0) return 'JADLOG';
  if (u.indexOf('LOGGI') >= 0) return 'LOGGI';
  if (u.indexOf('TOTAL') >= 0) return 'TOTAL EXPRESS';
  if (u.indexOf('CORREIO') >= 0) return 'CORREIOS';
  return u.slice(0, 30);
}
function tsDe(v) {
  if (typeof v === 'number') return v;
  var s = String(v || '').trim(); if (!s) return 0;
  var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (m) return new Date(m[3] + '-' + m[2] + '-' + m[1] + 'T' + (m[4] || '12') + ':' + (m[5] || '00') + ':00-03:00').getTime();
  var t = Date.parse(s); return isNaN(t) ? 0 : t;
}
function ddmmaa(ts) { if (!ts) return ''; var d = R.diaBR(ts).split('-'); return d[2] + '/' + d[1] + '/' + d[0]; }

/* ============================ PENDENTES DE CÓDIGO ============================ */
/* pedido PAGO, não cancelado/entregue, SEM código de rastreio, confirmado na janela */
function pendentesCodigo(peds, agora, janelaDias) {
  var ini = agora - Math.max(7, Number(janelaDias) || 45) * DIA;
  return peds.filter(function (p) {
    return !p.naoPagou && !p.final && p.st !== 'ENTREGUE' && !p.cod && p.tConf && p.tConf >= ini && String(p.pedido).indexOf(',') < 0;
  });
}
/* fila da Onlog: CPFs dos pendentes de Geovanna/Respect (1º) e dos sem fornecedor com 2+ dias úteis (depois) */
function filaOnlog(pend, agora, max) {
  var porCpf = {};
  pend.forEach(function (p) {
    if (p.cpf.length !== 11) return;
    var gr = p.fams.indexOf('GEOVANNA') >= 0 || p.fams.indexOf('RESPECT') >= 0;
    var solto = !p.fams.length && R.duEntre(p.tConf, agora) >= 2;
    if (!gr && !solto) return;
    var x = porCpf[p.cpf] || (porCpf[p.cpf] = { cpf: p.cpf, desde: p.tConf, gr: false });
    if (p.tConf < x.desde) x.desde = p.tConf;
    if (gr) x.gr = true;
  });
  return Object.keys(porCpf).map(function (c) { return porCpf[c]; })
    .sort(function (a, b) { return (a.gr === b.gr) ? a.desde - b.desde : (a.gr ? -1 : 1); })
    .slice(0, max || 40)
    .map(function (x) { return { cpf: x.cpf, desde: ddmmaa(x.desde) }; });
}

/* ============================ v9: SITUAÇÃO DOS OBJETOS NA ONLOG ============================ */
var ONLOG_ST = RAIZ + '/onlog_status';       /* <pedido> = { cod, aa, real, op, st, det, q, lido, desde, cls, cru, pre, direto, acao, voltando, dev, hist:[[ts, frase]…] } */
var ONLOG_VISTOS = RAIZ + '/onlog_vistos';   /* <pedido> = { st, tipo, ts, uid } */
var ONLOG_MAX_OBJ = 300;
function tituloFrase(s) { s = String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
/* Situação de UM objeto, pelo status (como a Onlog escreve) e pelo detalhe do evento. Função pura — testada.
   cls: cancelado · devolucao · problema · entregue · pre (ainda não está com a transportadora) · transito
   cru: a frase que entra no Rastreamento como "frase da transportadora" ('' = não entra: cancelado e devolvido só SINALIZAM).
        NUNCA leva o nome "Onlog": essa frase pode aparecer para o cliente na página de rastreio.
        Cada frase foi conferida na equivalência do Rastreamento v17 (teste t17.js). */
function onlogSituacao(st, det) {
  var u = R.semAcentoUp(st).replace(/\s+/g, ' ').trim();
  if (!u) return { cls: '', cru: '', pre: false };
  if (/CANCELAD/.test(u)) return { cls: 'cancelado', cru: '', pre: false };
  if (/DEVOLU|DEVOLVID|RETORNADO PARA O CLIENTE|RETORN[A-Z]* AO REMETENTE/.test(u)) return { cls: 'devolucao', cru: '', pre: false };
  if (/PROBLEMATIC/.test(u)) {
    var motivo = String(det || '').replace(/^\s*\([^)]*\)\s*/, '').replace(/[.\s]+$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
    return { cls: 'problema', cru: 'Pacote problemático' + (motivo ? ': ' + motivo : ' (motivo não informado pela transportadora)'), pre: false };
  }
  if (/NAO ENTREG|ENDERECO (ERRADO|INCORRETO|INSUFICIENTE|INCOMPLETO|NAO)|AUSENTE|RECUSAD|ENTREGA PREJUDICADA|AGUARDANDO (REENVIO|TRATATIVA)|EXTRAVI|AVARIA|ROUBO|SINISTRO|TENTATIVA|FISCALIZA|RETID|APREEN/.test(u))
    return { cls: 'problema', cru: tituloFrase(st), pre: false };
  if (/^(OBJETO )?ENTREGUE( AO DESTINATARIO)?$|ASSINATURA DE ENCOMENDA|ENTREGA REALIZADA|ENTREGA EFETUADA/.test(u)) return { cls: 'entregue', cru: 'Objeto entregue ao destinatário', pre: false };
  if (u === 'OBJETO CRIADO') return { cls: 'pre', cru: 'Objeto criado', pre: true };
  if (u === 'ETIQUETA EMITIDA') return { cls: 'pre', cru: 'Etiqueta emitida', pre: true };
  if (u === 'ENTRADA NO CENTRO DE DISTRIBUICAO') return { cls: 'pre', cru: 'Objeto criado (em preparação para a postagem)', pre: true };
  if (/^ENCAMINHADO PARA O OPERADOR|^INTEGRACAO INICIADA$|^ARQUIVO INTEGRADO$/.test(u)) return { cls: 'pre', cru: 'Objeto criado (pronto para a coleta da transportadora)', pre: true };
  if (/^COLETA DE ENCOMENDA|^COLETAD/.test(u)) return { cls: 'transito', cru: 'Coletado pela transportadora', pre: false };
  if (u === 'VOLUMETRIZADO' || u === 'CONFERIDO') return { cls: 'transito', cru: 'Objeto recebido pela transportadora', pre: false };
  if (/^BIPE DE (EXPEDICAO|RECEBIMENTO)/.test(u)) return { cls: 'transito', cru: 'Em transferência entre unidades', pre: false };
  if (/SAIDA PARA ENTREGA|SAIU PARA ENTREGA/.test(u)) return { cls: 'transito', cru: 'Saiu para entrega', pre: false };
  return { cls: 'transito', cru: tituloFrase(st), pre: false };
}
/* quais pedidos a rodada acompanha na Onlog: em aberto, com o AA da Onlog ou com código de pedido Geovanna/Respect (ou ainda
   sem fornecedor marcado). Envio direto do Daniel e dos outros fornecedores não passa pela Onlog. */
function objetosOnlog(peds, agora, mapa, janelaDias) {
  var ini = agora - Math.max(7, Number(janelaDias) || 60) * DIA, out = [];
  mapa = mapa || {};
  peds.forEach(function (p) {
    if (p.naoPagou || p.final || p.st === 'ENTREGUE' || !p.tConf || p.tConf < ini) return;
    var cod = (p.cod && p.cod !== MOTOBOY) ? p.cod : '';
    if (!p.onlog && !cod) return;
    var gr = p.fams.indexOf('GEOVANNA') >= 0 || p.fams.indexOf('RESPECT') >= 0;
    if (!p.onlog && !gr && p.fams.length) return;
    var a = mapa[p.k]; if (a && (a.cod || '') !== cod) a = null;   /* o código do pedido mudou: a leitura antiga não vale */
    out.push({ p: p, k: p.k, cod: cod, c: p.onlog || (a && a.aa) || cod, s: a ? (a.st || '') : '', m: (a && a.q) ? 0 : 1, lido: a ? (Number(a.lido) || 0) : 0 });
  });
  out.sort(function (x, y) { return x.lido - y.lido; });   /* quem está há mais tempo sem leitura vai primeiro */
  return out.slice(0, ONLOG_MAX_OBJ);
}
/* o registro de UM pedido, a partir do que a rodada leu (it) e do registro anterior (ant) */
function onlogRegistro(alvo, it, ant, agora) {
  var evs = (Array.isArray(it.evs) ? it.evs : []).filter(function (e) { return e && e[0]; });
  var st = String(it.st || ''), stU = R.semAcentoUp(st), det = '', q = 0, voltando = false, dev = '', hist = null;
  if (evs.length) {
    var iSt = -1, i;
    for (i = evs.length - 1; i >= 0; i--) { if (R.semAcentoUp(evs[i][0]) === stU) { iSt = i; break; } }
    var e = iSt >= 0 ? evs[iSt] : evs[evs.length - 1];
    det = e[1] || ''; q = tsDe(e[2]);
    /* depois que o objeto entra em devolução, bipes como VOLUMETRIZADO/RETIRADO não o tiram da devolução */
    var iDev = -1, iVolta = -1;
    evs.forEach(function (x, n) {
      var c = onlogSituacao(x[0], x[1]).cls;
      if (c === 'devolucao' || c === 'cancelado') iDev = n;
      if (c === 'entregue' || /SAIDA PARA ENTREGA/.test(R.semAcentoUp(x[0]))) iVolta = n;
    });
    if (iDev >= 0 && iVolta < iDev) { voltando = true; dev = txt(evs[iDev][0], 80) + (evs[iDev][2] ? ' em ' + String(evs[iDev][2]).slice(0, 10) : ''); }
    /* a linha do tempo, já nas frases do Rastreamento (sem repetir a mesma frase em seguida) — só é usada para quem não tem API */
    hist = [];
    evs.forEach(function (x) {
      var c = onlogSituacao(x[0], x[1]), tq = tsDe(x[2]);
      if (!c.cru || !tq || (hist.length && hist[hist.length - 1][1] === c.cru)) return;
      hist.push([tq, c.cru]);
    });
    hist = hist.slice(-15);
  } else if (ant && ant.st === st) { det = ant.det || ''; q = Number(ant.q) || 0; voltando = !!ant.voltando; dev = ant.dev || ''; hist = ant.hist || null; }
  var s = onlogSituacao(st, det);
  if (voltando && s.cls !== 'cancelado' && s.cls !== 'devolucao' && s.cls !== 'entregue') s = { cls: 'devolucao', cru: '', pre: false };
  var fmt = transpPorFormato(alvo.cod);
  var direto = !(fmt === 'J&T' || fmt === 'JADLOG' || fmt === 'CORREIOS' || fmt === 'TOTAL EXPRESS' || fmt === 'SPX');   /* Loggi, Fastpack e o que não tem API */
  var quando = q ? ' em ' + ddmmaa(q) : '';
  var acao = s.cls === 'cancelado' ? ('VERIFICAR: objeto CANCELADO na Onlog | ' + txt(st, 60) + quando)
    : (s.cls === 'devolucao' ? ('VERIFICAR: objeto DEVOLVIDO ou voltando (Onlog) | ' + (dev || (txt(st, 60) + quando))) : '');
  return { cod: alvo.cod || '', aa: limparCod(it.aa) || (ant && ant.aa) || alvo.p.onlog || '', real: limparCod(it.real) || (ant && ant.real) || '', op: txt(it.op, 30) || (ant && ant.op) || '',
    st: txt(st, 80), det: txt(det, 120), q: q || 0, lido: agora, desde: (ant && ant.st === st && ant.desde) ? ant.desde : (q || agora),
    cls: s.cls, cru: s.cru, pre: !!s.pre, direto: direto, acao: acao, voltando: voltando, dev: dev,
    hist: (direto && !acao && hist && hist.length) ? hist : null };
}
/* junta a leitura da rodada (itens) com os pedidos → o mapa novo de onlog_status. Função pura — testada. */
function onlogMontar(peds, itens, velho, agora, janelaDias) {
  velho = velho || {};
  var alvos = objetosOnlog(peds, agora, velho, janelaDias), porAA = {}, porReal = {};
  (itens || []).forEach(function (it) {
    if (!it) return;
    var aa = limparCod(it.aa), real = limparCod(it.real), c = limparCod(it.c);
    if (/^AA\d{10}$/.test(aa)) porAA[aa] = it;
    if (real && !/^AA\d{10}$/.test(real)) porReal[real] = it;
    if (it.n && c) { if (/^AA\d{10}$/.test(c)) porAA[c] = porAA[c] || it; else porReal[c] = porReal[c] || it; }
  });
  var mapa = {}, lidos = 0, nao = 0, sem = 0;
  alvos.forEach(function (a) {
    var ant = velho[a.k]; if (ant && (ant.cod || '') !== a.cod) ant = null;
    var it = (a.p.onlog && porAA[a.p.onlog]) || (a.cod && porReal[a.cod]) || (ant && ant.aa && porAA[ant.aa]) || null;
    if (!it || it.n || !it.st) { if (ant) mapa[a.k] = ant; if (it && it.n) nao++; else sem++; return; }
    lidos++;
    mapa[a.k] = onlogRegistro(a, it, ant, agora);
  });
  return { mapa: mapa, alvos: alvos.length, lidos: lidos, nao_achados: nao, sem_leitura: sem };
}
/* os AVISOS do painel: cancelado · devolvido/voltando · com problema · parado na Onlog antes de chegar à transportadora */
var ONLOG_ORDEM = { cancelado: 0, devolucao: 1, problema: 2, parado: 3 };
function onlogAlertas(peds, mapa, vistos, agora, limDU) {
  var out = []; mapa = mapa || {}; vistos = vistos || {};
  var lim = Math.max(1, Number(limDU) || 2);
  peds.forEach(function (p) {
    var a = mapa[p.k]; if (!a || typeof a !== 'object') return;
    if (p.naoPagou || p.final || p.st === 'ENTREGUE') return;
    var cod = (p.cod && p.cod !== MOTOBOY) ? p.cod : '';
    if ((a.cod || '') !== cod) return;
    var dias = a.desde ? R.duEntre(Number(a.desde), agora) : 0, tipo = '';
    if (a.cls === 'cancelado' || a.cls === 'devolucao' || a.cls === 'problema') tipo = a.cls;
    else if (a.pre && a.desde && dias >= lim) tipo = 'parado';
    if (!tipo) return;
    var v = vistos[p.k];
    out.push({ k: p.k, pedido: p.pedido, pacote_de: p.pai || '', nome: p.nome, tipo: tipo, situacao: a.st || '', detalhe: a.det || '', historico: a.dev || '',
      desde: a.desde ? ddmmaa(Number(a.desde)) : '', dias: dias, codigo: cod, onlog: a.aa || p.onlog || '', transportadora: p.transpTxt || transpOnlog(a.op, cod) || '',
      status: p.status, fornecedor: p.forn, revendedor: ehRevendedor(p.pai || p.pedido), lido: Number(a.lido) || 0,
      visto: !!(v && v.st === (a.st || '') && v.tipo === tipo), visto_em: (v && v.ts) ? R.ddmm(v.ts) : '' });
  });
  out.sort(function (x, y) { return (ONLOG_ORDEM[x.tipo] - ONLOG_ORDEM[y.tipo]) || (y.dias - x.dias) || (x.pedido < y.pedido ? -1 : 1); });
  return out;
}

/* ============================ CASAMENTO (função pura — testada) ============================ */
/* Cada candidato (um código novo) vai para o pedido pendente MAIS RECENTE confirmado até o dia dele (e no máximo 20 dias
   antes). Só é CERTO quando é 1 código para 1 pedido, sem outro pedido do mesmo cliente no mesmo dia. O resto vira DÚVIDA. */
function parear(cands, rows) {
  var porRow = {}, certos = [], duvidas = [], fora = [];
  cands.forEach(function (c) {
    var melhor = null;
    rows.forEach(function (r) {
      if (R.diaBR(r.tConf) > R.diaBR(c.ts)) return;
      if (c.ts - r.tConf > MAX_DIAS_PAR * DIA) return;
      if (!melhor || r.tConf > melhor.tConf) melhor = r;
    });
    if (!melhor) { fora.push(c); return; }
    var mesmoDia = rows.filter(function (r) { return R.diaBR(r.tConf) === R.diaBR(melhor.tConf); });
    if (mesmoDia.length > 1) { duvidas.push({ c: c, rows: mesmoDia, por: 'dois pedidos do cliente no mesmo dia' }); return; }
    (porRow[melhor.k] = porRow[melhor.k] || { r: melhor, cs: [] }).cs.push(c);
  });
  Object.keys(porRow).forEach(function (k) {
    var x = porRow[k];
    if (x.cs.length === 1) certos.push({ c: x.cs[0], r: x.r });
    else x.cs.forEach(function (c) { duvidas.push({ c: c, rows: [x.r], por: x.cs.length + ' códigos para o mesmo pedido' }); });
  });
  return { certos: certos, duvidas: duvidas, fora: fora };
}
function candPub(r) { return { pedido: r.pedido, data: String(r.data || '').slice(0, 10), status: r.status, fornecedor: r.forn, codigo_atual: r.cod || '', onlog_atual: r.onlog || '' }; }

function casarCodigos(e) {
  var peds = e.peds, agora = e.agora || Date.now(), ign = e.ignorados || {};
  var janela = Number(e.janelaDias) || 45, duvDias = Number(e.duvidaDias) || 15;
  var pend = pendentesCodigo(peds, agora, janela);
  var usados = {}, porCpf = {}, pendCpf = {};
  peds.forEach(function (p) {
    if (p.cod && p.cod !== MOTOBOY) usados[p.cod] = p;
    if (p.onlog) usados[p.onlog] = p;
    if (p.cpf.length === 11 && !p.naoPagou) (porCpf[p.cpf] = porCpf[p.cpf] || []).push(p);
  });
  pend.forEach(function (p) { if (p.cpf.length === 11) (pendCpf[p.cpf] = pendCpf[p.cpf] || []).push(p); });

  var aplicar = [], duvidas = [], res = { pendentes: pend.length, daniel_pedidos: 0, onlog_cpfs: 0, onlog_objetos: 0, sem_pedido: 0, antigos: 0, sem_cpf: 0, onlog_erros: 0, onlog_cancelados: 0 };
  var certos = [];   /* {fonte, r, item} — conferidos no fim: o mesmo pedido não pode receber de duas fontes */
  function duvida(fonte, tipo, c, rows, por) {
    var cod = c.cods && c.cods[0] || c.real || '';
    duvidas.push({ id: sha(fonte + '|' + (cod || c.aa || '') + (cod === MOTOBOY ? '|' + (c.ref || '') : '')).slice(0, 12), fonte: fonte, tipo: tipo, motivo: por,
      codigo: cod, codigo2: (c.cods && c.cods[1]) || '', onlog: c.aa || '', transportadora: c.transp || '', origem: c.origem || '',
      nome: c.nome || '', cpf: c.cpf || '', quando: ddmmaa(c.ts), situacao: c.situacao || '', ref: c.ref || '',
      candidatos: rows.map(candPub) });
  }
  function fornDaLinha(r, fam) {   /* nome do fornecedor como está na linha (pra linha D nova) */
    var ls = linhasForn(r.fornTxt), i;
    for (i = 0; i < ls.length; i++) if (familia(ls[i]) === fam) return ls[i].split(':')[0].trim();
    return fam === 'DANIEL' ? 'Daniel' : (ls[0] ? ls[0].split(':')[0].trim() : '');
  }

  /* ---------------- DANIEL (site dele) ---------------- */
  var danCpf = {};
  (e.daniel || []).forEach(function (o) {
    if (/cancel/i.test(String(o.st || ''))) return;   /* pedido cancelado no site dele */
    res.daniel_pedidos++;
    var cods = [limparCod(o.c1), limparCod(o.c2)].filter(function (c, i, a) { return c && (codigoValido(c) || c === MOTOBOY) && a.indexOf(c) === i; });
    var rg = String(o.rg || '').toLowerCase();
    var origem = rg === 'interior' ? 'MS' : (rg === 'capital' ? 'SP' : '');
    var ts = tsDe(o.cr), cpf = cpf11(o.cpf);
    var naPlanilha = cods.filter(function (c) { return usados[c]; });
    var novos = cods.filter(function (c) { return !usados[c] && !ign[c]; });
    /* 1) código que já está na planilha: só confere a ORIGEM daquela linha */
    naPlanilha.forEach(function (c) {
      var dono = usados[c];
      if (origem && dono.origCol !== origem) aplicar.push({ pedido: dono.pedido, codigo: c, origem: origem, _fonte: 'daniel', _tipo: 'origem' });
    });
    if (!novos.length && cods.length) return;
    /* 2) 2º código do MESMO pedido do Daniel (o 1º já está na planilha): é outro pacote do mesmo pedido → linha D */
    if (naPlanilha.length && novos.length) {
      var d0 = usados[naPlanilha[0]];
      aplicar.push({ pedido: d0.pedido, codigo: novos[0], origem: origem, transportadora: transpPorFormato(novos[0]),
        novoD: { forn: fornDaLinha(d0, 'DANIEL'), itens: '2o pacote do mesmo envio', produtos: '' }, _fonte: 'daniel', _tipo: 'pacote' });
      return;
    }
    var c = { ts: ts, cods: novos, origem: origem, cpf: cpf, nome: txt(o.nome, 60), cep: cepDe(o.cep), ref: txt(o.oc, 30),
      transp: novos[0] ? transpPorFormato(novos[0]) : '', situacao: ({ in_transit: 'em trânsito no site do Daniel', delivered: 'entregue no site do Daniel' })[String(o.st || '')] || txt(o.st, 20) };
    if (cpf.length !== 11) { if (novos.length) res.sem_cpf++; return; }
    if (!novos.length && (!origem || agora - ts > 30 * DIA)) return;   /* sem código: só serve pra adiantar a origem */
    (danCpf[cpf] = danCpf[cpf] || []).push(c);
  });
  Object.keys(danCpf).forEach(function (cpf) {
    var rows = (pendCpf[cpf] || []).filter(function (r) { return !r.fams.length || r.fams.indexOf('DANIEL') >= 0; });
    if (rows.some(function (r) { return r.fams.indexOf('DANIEL') >= 0; })) rows = rows.filter(function (r) { return r.fams.indexOf('DANIEL') >= 0; });
    /* MOTOBOY já gravado: cada entrega por motoboy do site "consome" um pedido do cliente que já está com MOTOBOY
       (o mais recente confirmado até o dia dela). Só as que sobram procuram pedido sem código. */
    var motoRows = (porCpf[cpf] || []).filter(function (p) { return p.cod === MOTOBOY; }), motoUsado = {};
    var cands = danCpf[cpf].slice().sort(function (a, b) { return a.ts - b.ts; }).filter(function (c) {
      if (c.cods[0] !== MOTOBOY) return true;
      var m = null;
      motoRows.forEach(function (r) {
        if (motoUsado[r.k] || R.diaBR(r.tConf) > R.diaBR(c.ts) || c.ts - r.tConf > MAX_DIAS_PAR * DIA) return;
        if (!m || r.tConf > m.tConf) m = r;
      });
      if (!m) return true;
      motoUsado[m.k] = 1;
      if (c.origem && m.origCol !== c.origem) aplicar.push({ pedido: m.pedido, origem: c.origem, _fonte: 'daniel', _tipo: 'origem' });
      return false;
    });
    var par = parear(cands, rows);
    par.certos.forEach(function (x) {
      var c = x.c, r = x.r;
      if (c.cep && r.cep && c.cep !== r.cep) { if (c.cods.length) duvida('daniel', 'cep_diferente', c, [r], 'o CEP do envio é diferente do CEP do pedido'); return; }
      if (!c.cods.length) {   /* ainda sem código: só adianta a origem */
        if (c.origem && r.origCol !== c.origem) certos.push({ fonte: 'daniel', r: r, itens: [{ pedido: r.pedido, origem: c.origem, _fonte: 'daniel', _tipo: 'origem' }] });
        return;
      }
      var its = [{ pedido: r.pedido, codigo: c.cods[0], transportadora: transpPorFormato(c.cods[0]), origem: c.origem, _fonte: 'daniel', _tipo: 'codigo' }];
      if (c.cods[1]) its.push({ pedido: r.pedido, codigo: c.cods[1], transportadora: transpPorFormato(c.cods[1]), origem: c.origem,
        novoD: { forn: fornDaLinha(r, 'DANIEL'), itens: '2o pacote do mesmo envio', produtos: '' }, _fonte: 'daniel', _tipo: 'pacote' });
      certos.push({ fonte: 'daniel', r: r, itens: its });
    });
    par.duvidas.forEach(function (x) { if (x.c.cods.length) duvida('daniel', 'escolher', x.c, x.rows, x.por); });
    par.fora.forEach(function (c) {
      if (!c.cods.length) return;
      if (agora - c.ts > duvDias * DIA) { res.antigos++; return; }
      /* sem pedido pendente: o cliente tem pedido (já com outro código) confirmado até o dia desse envio? → pode ser 2º pacote */
      var outros = (porCpf[cpf] || []).filter(function (p) { return !p.final && R.diaBR(p.tConf) <= R.diaBR(c.ts) && c.ts - p.tConf <= MAX_DIAS_PAR * DIA; });
      if (outros.length) duvida('daniel', 'sem_pendente', c, outros, 'o cliente não tem pedido sem código; pode ser outro pacote de um pedido que já tem código');
      else res.sem_pedido++;
    });
  });

  /* ---------------- ONLOG (Geovanna / Respect) ---------------- */
  (e.onlog || []).forEach(function (it) {
    var cpf = cpf11(it.cpf);
    if (cpf.length !== 11) return;
    res.onlog_cpfs++;
    if (it.erro) { res.onlog_erros++; return; }
    var cands = [], mortos = [];   /* v9: mortos = objetos cancelados/devolvidos na Onlog */
    (it.objetos || []).forEach(function (ob) {
      var aa = limparCod(ob.aa), real = limparCod(ob.real);
      if (!/^AA\d{10}$/.test(aa)) aa = '';
      if (real && (!codigoValido(real) || /^AA\d{10}$/.test(real))) real = '';
      if (!aa && !real) return;
      res.onlog_objetos++;
      var transp = real ? transpOnlog(ob.op, real) : '';
      var sit = txt((ob.status || '') + (ob.quando ? ' ' + ob.quando : ''), 80);
      var clsOb = ob.dev ? 'devolucao' : onlogSituacao(ob.status, '').cls;   /* v9 */
      var morto = (clsOb === 'cancelado' || clsOb === 'devolucao');
      if (aa && usados[aa]) {   /* o AA já está num pedido: se ele ainda não tem o código real, completa (v9: menos se o objeto morreu) */
        var dono = usados[aa];
        if (!morto && !dono.cod && real && !usados[real] && !ign[real]) aplicar.push({ pedido: dono.pedido, codigo: real, onlog: aa, transportadora: transp, _fonte: 'onlog', _tipo: 'codigo', _info: sit });
        return;
      }
      if (real && usados[real]) return;
      if ((aa && ign[aa]) || (real && ign[real])) return;
      var cand = { ts: tsDe(ob.criado), aa: aa, real: real, transp: transp, cpf: cpf, cep: cepDe(ob.cep), situacao: sit, nome: txt(ob.nome, 60) };
      if (morto) { res.onlog_cancelados++; mortos.push(cand); return; }   /* v9: objeto cancelado/devolvido NUNCA é gravado sozinho */
      cands.push(cand);
    });
    mortos = mortos.filter(function (c) { return c.ts; });
    cands = cands.filter(function (c) { return c.ts; });
    var rows = (pendCpf[cpf] || []).filter(function (r) { return !r.onlog && (!r.fams.length || r.fams.indexOf('GEOVANNA') >= 0 || r.fams.indexOf('RESPECT') >= 0); });
    var temGR = function (r) { return r.fams.indexOf('GEOVANNA') >= 0 || r.fams.indexOf('RESPECT') >= 0; };
    if (rows.some(temGR)) rows = rows.filter(temGR);
    var par = parear(cands, rows), comObjeto = {};
    par.certos.forEach(function (x) {
      var c = x.c, r = x.r;
      comObjeto[r.k] = 1;
      if (c.cep && r.cep && c.cep !== r.cep) { duvida('onlog', 'cep_diferente', c, [r], 'o CEP do envio é diferente do CEP do pedido'); return; }
      certos.push({ fonte: 'onlog', r: r, itens: [{ pedido: r.pedido, codigo: c.real || '', onlog: c.aa || '', transportadora: c.transp, _fonte: 'onlog', _tipo: c.real ? 'codigo' : 'onlog', _info: c.situacao }], c: c });
    });
    par.duvidas.forEach(function (x) { x.rows.forEach(function (r) { comObjeto[r.k] = 1; }); duvida('onlog', 'escolher', x.c, x.rows, x.por); });
    /* v9: objeto cancelado/devolvido — só vira dúvida (aviso) se o pedido que ele casaria ficou sem nenhum outro objeto */
    if (mortos.length) {
      var MOTIVO_MORTO = 'este objeto está CANCELADO ou DEVOLVIDO na Onlog — não foi gravado';
      var pm = parear(mortos, rows.filter(function (r) { return !comObjeto[r.k]; }));
      pm.certos.forEach(function (x) { duvida('onlog', 'cancelado', x.c, [x.r], MOTIVO_MORTO); });
      pm.duvidas.forEach(function (x) { duvida('onlog', 'cancelado', x.c, x.rows, MOTIVO_MORTO); });
    }
    /* par.fora: objeto mais antigo que os pedidos pendentes (envio anterior do mesmo cliente) → ignora */
  });

  /* o mesmo pedido recebendo código do Daniel E da Onlog na mesma rodada → ninguém grava, vira dúvida */
  var vezes = {};
  certos.forEach(function (x) { if (x.itens[0]._tipo !== 'origem') vezes[x.r.k] = (vezes[x.r.k] || 0) + 1; });
  certos.forEach(function (x) {
    if (x.itens[0]._tipo !== 'origem' && vezes[x.r.k] > 1) {
      var i0 = x.itens[0];
      duvida(x.fonte, 'duas_fontes', { cods: i0.codigo ? [i0.codigo] : [], aa: i0.onlog || '', real: i0.codigo, transp: i0.transportadora, origem: i0.origem, ts: 0, situacao: i0._info }, [x.r], 'o site do Daniel e a Onlog apontam para o mesmo pedido');
      return;
    }
    x.itens.forEach(function (i) { aplicar.push(i); });
  });
  /* dúvida repetida (mesmo código) fica uma vez só */
  var visto = {}; duvidas = duvidas.filter(function (d) { if (visto[d.id]) return false; visto[d.id] = 1; return true; });
  res.duvidas = duvidas.length;
  return { aplicar: aplicar, duvidas: duvidas, resumo: res };
}
function chaveItem(i) { return [String(i.pedido || '').toUpperCase(), i.codigo || '', i.onlog || '', i.origem || ''].join('|'); }

/* ---- Apps Script: gravar com as travas (action aplicar_codigos, GAS v53) ---- */
async function gasAplicar(itens) {
  var chave = process.env.COMPRAS_KEY || '';
  if (!chave) return { ok: false, erro: 'falta a variável COMPRAS_KEY no Netlify' };
  var limpos = itens.map(function (i) { var o = { pedido: i.pedido }; ['codigo', 'onlog', 'transportadora', 'origem', 'novoD'].forEach(function (k) { if (i[k]) o[k] = i[k]; }); return o; });
  try {
    var ctrl = new AbortController(); var t = setTimeout(function () { ctrl.abort(); }, 22000);
    var r = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctrl.signal,
      body: JSON.stringify({ action: 'aplicar_codigos', chave: chave, itens: limpos }) });
    clearTimeout(t);
    var j = null; try { j = JSON.parse(await r.text()); } catch (e) { return { ok: false, erro: 'o Apps Script não respondeu JSON (a versão v53 já foi publicada?)' }; }
    if (j && j.success && Array.isArray(j.resultado)) return { ok: true, resultado: j.resultado };
    return { ok: false, erro: (j && (j.msg || j.erro)) || 'o Apps Script não confirmou' };
  } catch (e) { return { ok: false, erro: 'Apps Script: ' + e.message }; }
}
function registroDe(item, resGas) {
  return { pedido: (resGas && resGas.pedido) || item.pedido, pedido_pedido: item.pedido, codigo: item.codigo || '', onlog: item.onlog || '',
    transportadora: item.transportadora || '', origem: item.origem || '', fonte: item._fonte || 'manual', tipo: item._tipo || 'manual',
    info: item._info || '', fez: (resGas && resGas.fez) || [], ok: !!(resGas && resGas.ok), motivo: (resGas && resGas.motivo) || '' };
}

/* ---- ticket: deixa a aba do Daniel / da Onlog mandar os dados direto pra cá (sem login de admin naquela aba) ---- */
async function novoTicket(uid, agora) {
  var tk = crypto.randomBytes(24).toString('hex');
  await fbReq('PUT', COD + '/ticket', { h: sha(tk), exp: agora + TICKET_VALE_MS, uid: uid });
  return tk;
}
async function conferirTicket(tk, agora) {
  tk = String(tk || '');
  if (!/^[0-9a-f]{48}$/.test(tk)) return false;
  var t = await fbLerOu(COD + '/ticket');
  return !!(t && t.h === sha(tk) && Number(t.exp) > agora);
}
function limparEntrada(fonte, itens) {
  itens = Array.isArray(itens) ? itens : [];
  if (fonte === 'daniel') return itens.slice(0, 600).map(function (o) {
    o = o || {};
    return { oc: txt(o.oc, 30), st: txt(o.st, 20), c1: txt(o.c1, 40), c2: txt(o.c2, 40), rg: txt(o.rg, 12), cpf: cpf11(o.cpf).slice(0, 14),
      nome: txt(o.nome, 60), cep: cepDe(o.cep), cr: tsDe(o.cr) };
  });
  if (fonte === 'onlog_status') return itens.slice(0, 400).map(function (o) {   /* v9: situação dos objetos (consulta por código) */
    o = o || {};
    return { c: txt(o.c, 40), aa: txt(o.aa, 14), real: txt(o.real, 40), op: txt(o.op, 30), st: txt(o.st, 80), n: o.n ? 1 : 0, igual: o.igual ? 1 : 0,
      evs: (Array.isArray(o.evs) ? o.evs : []).slice(-25).map(function (e) { e = Array.isArray(e) ? e : []; return [txt(e[0], 80), txt(e[1], 120), txt(e[2], 20)]; }) };
  });
  return itens.slice(0, 80).map(function (o) {
    o = o || {};
    return { cpf: cpf11(o.cpf).slice(0, 14), erro: txt(o.erro, 60), objetos: (Array.isArray(o.objetos) ? o.objetos : []).slice(0, 12).map(function (b) {
      b = b || {};
      return { aa: txt(b.aa, 14), real: txt(b.real, 40), op: txt(b.op, 30), criado: tsDe(b.criado), status: txt(b.status, 60), quando: txt(b.quando, 20), cep: cepDe(b.cep), nome: txt(b.nome, 60), dev: b.dev ? 1 : 0 };
    }) };
  });
}
/* v10: WhatsApp da logística quando surge aviso NOVO da Onlog. Novo = não avisado ainda com esse tipo e essa situação, e não visto. */
var ONLOG_AVISADOS = RAIZ + '/onlog_avisados';   /* <pedido> = { st, tipo, ts } */
/* v11: pedidos que o Rastreamento não consegue consultar por falta de dado */
var SEM_CONS = RAIZ + '/rastreio_sem_consulta';                    /* { ts, pedidos:{ <pedido>:{pedido,tipo,motivo,transp} } } — gravado pelo Rastreamento v19 */
var SEM_CONS_AVISADOS = RAIZ + '/rastreio_sem_consulta_avisados';  /* <pedido> = { motivo, ts } */
var SEM_CONS_OQUE = { cpf: 'Preencha o CPF do cliente na planilha (coluna CPF). O rastreio volta sozinho na próxima passada.' };
/* A lista para o painel: só o que CONTINUA valendo agora (pedido em aberto e, no caso do CPF, ainda sem CPF na planilha). */
function semConsultaLista(peds, no, agora) {
  var mapa = (no && no.pedidos && typeof no.pedidos === 'object') ? no.pedidos : {}, porK = {};
  (peds || []).forEach(function (p) { porK[p.k] = p; });
  return Object.keys(mapa).map(function (k) {
    var x = mapa[k]; if (!x || typeof x !== 'object') return null;
    var p = porK[k] || porK[R.histKey(String(x.pedido || ''))];
    if (!p || p.final || p.naoPagou || p.st === 'ENTREGUE') return null;   /* entregue, cancelado ou fora da planilha: não é mais problema */
    var tipo = txt(x.tipo, 12);
    if (tipo === 'cpf' && String(p.cpf || '').length === 11) return null;   /* já preencheram o CPF */
    return { k: p.k, pedido: p.pedido, tipo: tipo, motivo: txt(x.motivo, 80), oque: SEM_CONS_OQUE[tipo] || '', transportadora: txt(x.transp, 30) || p.transp || '',
      status: p.status, data: String(p.data || '').slice(0, 10), fornecedor: p.forn, codigo: p.cod || '', revendedor: ehRevendedor(p.pedido),
      dias: p.tConf ? R.duEntre(p.tConf, agora) : 0 };
  }).filter(Boolean).sort(function (a, b) { return b.dias - a.dias; });
}
function textoSemConsulta(novos, emAberto, painelUrl) {
  var L = ['🔎 *Logística — pedidos que o rastreio não consegue consultar* (' + novos.length + ')', '⠀'];
  novos.slice(0, 20).forEach(function (a) { L.push('• ' + a.pedido + ' — ' + a.motivo + (a.codigo ? ' — ' + a.codigo : '')); });
  if (novos.length > 20) L.push('… e mais ' + (novos.length - 20));
  L.push('⠀');
  L.push('Enquanto o dado não for preenchido na planilha, o status desses pedidos não atualiza. Ao todo há ' + emAberto + ' nessa situação. Veja na aba *Códigos* do painel' + (painelUrl ? ': ' + painelUrl : '.'));
  return L.join('\n');
}
/* v13: OCORRÊNCIAS — o que o Rastreamento sinalizou na coluna ACAO_MANUAL e espera decisão da logística */
var AM_VISTOS = RAIZ + '/acao_manual_vistos';   /* <pedido> = { am, ts, uid } — vale enquanto o aviso for o mesmo */
var AM_INFO = {
  'DESTINATARIO AUSENTE': ['ausente', 'Destinatário ausente', 'A transportadora tentou entregar e não encontrou ninguém. Avise o cliente e veja com a transportadora se haverá nova tentativa ou retirada.'],
  'ENDERECO INCORRETO': ['endereco', 'Endereço incorreto', 'A transportadora não achou o endereço. Confirme o endereço com o cliente e passe a correção para a transportadora.'],
  'AREA COM DISTRIBUICAO': ['area', 'Retirada ou imprevisto na rota', 'Leia a frase da transportadora: ou o pacote está aguardando retirada (avise o cliente onde retirar) ou houve um imprevisto na rota (acompanhe).'],
  'ENCAMINHADO PARA FISCALIZACAO': ['fiscal', 'Fiscalização', 'O pacote foi retido para fiscalização. Acompanhe a liberação e avise o cliente.'],
  'PEDIDO EXTRAVIADO': ['extravio', 'Extravio ou avaria', 'A transportadora registrou extravio ou avaria. Confirme com ela e combine a solução com o cliente.'],
  'PEDIDO CANCELADO': ['devolvido', 'Devolvido ao remetente', 'O pacote voltou ou está voltando para o remetente. Combine o reenvio com o fornecedor e avise o cliente.']
};
function acaoManualInfo(am) {
  var t = String(am || '').trim(), partes = t.split('|'), sug = partes[0].trim(), frase = partes.slice(1).join('|').trim(), u = R.semAcentoUp(sug);
  if (u.indexOf('VERIFICAR') === 0) return { tipo: 'onlog', titulo: 'Objeto cancelado ou devolvido na Onlog', sugestao: '', frase: (sug.replace(/^VERIFICAR:?\s*/i, '') + (frase ? ' · ' + frase : '')).trim(),
    oque: 'O código deste pedido não vai mais andar. Fale com o fornecedor: o pedido precisa de novo envio. O detalhe está na aba Códigos, em Avisos da Onlog.' };
  if (u.indexOf('+25 DIAS') >= 0 || u.indexOf('REVISAR MANUAL') === 0) return { tipo: 'antigo', titulo: 'Em aberto há mais de 25 dias', sugestao: '', frase: '',
    oque: 'O rastreio automático parou de consultar este pedido (a transportadora não devolve mais nada depois desse tempo). Confira direto com a transportadora e acerte o status à mão.' };
  var inf = AM_INFO[u];
  if (inf) return { tipo: inf[0], titulo: inf[1], sugestao: sug, frase: frase, oque: inf[2] };
  return { tipo: 'outro', titulo: txt(sug, 60) || 'Aviso do rastreio', sugestao: sug, frase: frase, oque: 'Leia a frase da transportadora e decida o que fazer com o pedido.' };
}
function ocorrenciasLista(peds, vistos, agora) {
  var V = (vistos && typeof vistos === 'object') ? vistos : {};
  /* fora: entregue, cancelado, não pago e os status em que a logística JÁ decidiu (apreendido, extraviado, devolvido, suspenso,
     reembolsado) — os mesmos que o Rastreamento tira da fila; o aviso que sobrou neles é antigo */
  return (peds || []).filter(function (p) { return p.am && !p.final && !p.naoPagou && p.st !== 'ENTREGUE' && !/APREEND|EXTRAVIAD|DEVOLV|SUSPENS|REEMBOLS|CANCELAD/.test(p.st || ''); }).map(function (p) {
    var i = acaoManualInfo(p.am), v = V[p.k], visto = !!(v && String(v.am || '') === p.am.slice(0, 80));
    return { k: p.k, pedido: p.pedido, pacote_de: p.pai || '', nome: p.nome, tipo: i.tipo, titulo: i.titulo, sugestao: txt(i.sugestao, 60), frase: txt(i.frase, 200), oque: i.oque,
      status: p.status, transportadora: p.transp, codigo: p.cod || '', fornecedor: p.forn, data: String(p.data || '').slice(0, 10), revendedor: ehRevendedor(p.pai || p.pedido),
      dias: p.tConf ? R.duEntre(p.tConf, agora) : 0, visto: visto, visto_em: (visto && v.ts) ? R.ddmm(v.ts) : '' };
  }).sort(function (a, b) { return (a.visto ? 1 : 0) - (b.visto ? 1 : 0) || b.dias - a.dias || (a.pedido < b.pedido ? -1 : 1); });
}
/* v15: PEDIDOS DUPLICADOS (linhas D) — o pedido foi dividido em mais de um pacote (fornecedores diferentes) */
var DUP_VISTOS = RAIZ + '/duplicados_vistos';   /* <pedido D> = { ts, uid } */
var DUP_JANELA_DIAS = 60;
function ehLinhaD(p) { return !!(p && (p.pai || /^VF-\d{4}-D/i.test(String(p.pedido || '').trim()))); }
function dupDataMs(data) { var m = String(data || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? new Date(m[3] + '-' + m[2] + '-' + m[1] + 'T12:00:00-03:00').getTime() : 0; }
function duplicadosLista(peds, vistos, emails, agora) {
  var V = (vistos && typeof vistos === 'object') ? vistos : {}, E = (emails && typeof emails === 'object') ? emails : {};
  var porPed = {}, filhosDe = {};
  (peds || []).forEach(function (p) { porPed[String(p.pedido || '').trim().toUpperCase()] = p; });
  /* o pedido de origem: a coluna PEDIDO_ORIGINAL; linha D feita à mão (sem a coluna) → o pedido do mesmo dia e mesmo número com outra letra */
  function origemDe(p) {
    if (p.pai) return String(p.pai).trim().toUpperCase();
    var m = String(p.pedido || '').trim().toUpperCase().match(/^(VF-\d{4}-)D(\d+)$/);
    if (!m) return '';
    var achou = ''; ['S', 'A', 'W', 'V', 'M', 'O'].forEach(function (L) { if (!achou && porPed[m[1] + L + m[2]]) achou = m[1] + L + m[2]; });
    if (achou) return achou;
    Object.keys(porPed).forEach(function (k) { if (!achou && k.indexOf(m[1]) === 0 && k !== m[1] + 'D' + m[2] && k.slice(m[1].length + 1) === m[2] && !ehLinhaD(porPed[k])) achou = k; });
    return achou;
  }
  var linhasD = (peds || []).filter(function (p) { return ehLinhaD(p) && !p.final && !p.naoPagou; });
  linhasD.forEach(function (p) { p._orig = origemDe(p); if (p._orig) (filhosDe[p._orig] = filhosDe[p._orig] || []).push(p); });
  function resumo(x) { return { pedido: x.pedido, status: x.status || '', codigo: x.cod || '', transportadora: x.transp || '', fornecedor: x.forn || '', origem: ORIGEM_NOME[String(x.origCol || '').toUpperCase()] || '' }; }
  var lim = agora - DUP_JANELA_DIAS * 86400000;
  return linhasD.filter(function (p) { var t = dupDataMs(p.data) || p.tConf || 0; return !t || t >= lim; }).map(function (p) {
    var o = p._orig ? porPed[p._orig] : null, v = V[p.k], visto = !!(v && v.ts), entregue = p.st === 'ENTREGUE';
    var outros = []; if (o) outros.push(resumo(o));
    (filhosDe[p._orig] || []).forEach(function (f) { if (f !== p) outros.push(resumo(f)); });
    var reg = p._orig ? E[R.histKey(p._orig)] : null, mail = '';
    if (ehRevendedor(p._orig || p.pedido)) mail = 'revendedor — não recebe e-mail';
    else if (reg && reg.estado === 'enviado') mail = 'e-mail dos pacotes enviado' + (reg.ts ? ' em ' + R.ddmm(reg.ts) : '');
    else if (reg && reg.estado === 'aguardando_origem') mail = 'e-mail dos pacotes esperando a origem do envio';
    else if (reg && reg.estado === 'teste') mail = 'e-mail dos pacotes em modo teste (não foi para o cliente)';
    else if (!p.pai) mail = 'criado à mão — sem e-mail automático dos pacotes';
    else mail = 'e-mail dos pacotes ainda não enviado';
    return { k: p.k, pedido: p.pedido, original: p._orig || '', feito: p.pai ? 'sistema' : 'mao', nome: p.nome || (o && o.nome) || '',
      data: String(p.data || '').slice(0, 10), t: dupDataMs(p.data) || p.tConf || 0, produtos: txt(p.produtos, 400), fornecedor: p.forn || '',
      origem: ORIGEM_NOME[String(p.origCol || '').toUpperCase()] || '', status: p.status || '', codigo: p.cod || '', transportadora: p.transp || '',
      pacotes: outros.length + 1, outros: outros.slice(0, 8), email: mail, revendedor: ehRevendedor(p._orig || p.pedido),
      entregue: entregue, visto: visto, visto_em: (visto && v.ts) ? R.ddmm(v.ts) : '' };
  }).sort(function (a, b) { return ((a.visto || a.entregue) ? 1 : 0) - ((b.visto || b.entregue) ? 1 : 0) || b.t - a.t || (a.pedido < b.pedido ? -1 : 1); });
}
function duplicadosAbertos(lista) { return (lista || []).filter(function (x) { return !x.visto && !x.entregue; }); }
/* v13: RESUMO DAS PASSADAS no WhatsApp da logística (rotina das 10h, seg a sex) */
var PASS_RESUMO = RAIZ + '/passadas_resumo';   /* { ts } do último resumo enviado */
function quandoBR(ms) { return new Date(Number(ms)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às'); }
function horasDesde(ms, agora) { var h = Math.floor((agora - Number(ms)) / 3600000); return h < 48 ? h + ' hora(s)' : Math.floor(h / 24) + ' dia(s)'; }
function textoPassadas(x) {
  var L = ['📋 *Logística — resumo das passadas*', 'Desde ' + quandoBR(x.desde), '⠀'];
  if (x.passadas.length) {
    var c = 0, a = 0, e = 0, inc = 0;
    x.passadas.forEach(function (p) { c += p.consultados || 0; a += p.atualizados || 0; e += p.entregues || 0; if (p.incompleta) inc++; });
    L.push('🚚 *Rastreio automático*: ' + x.passadas.length + ' passada(s) · ' + c + ' consulta(s)');
    L.push('• *' + a + '* pedido(s) mudaram de status' + (e ? ' · ' + e + ' viraram entregue' : ''));
    if (inc) L.push('• ⚠️ ' + inc + ' passada(s) não terminaram');
  } else L.push('🚚 *Rastreio automático*: nenhuma passada no período');
  if (x.sem_consulta) L.push('• 🔎 ' + x.sem_consulta + ' pedido(s) sem consulta por falta de dado na planilha');
  L.push('⠀');
  if (x.rodadas.length) {
    var cod = 0; x.rodadas.forEach(function (r) { cod += (r.resumo && r.resumo.codigos) || 0; });
    L.push('📦 *Rodada de códigos*: ' + x.rodadas.length + ' rodada(s) · *' + cod + '* código(s) gravado(s)');
  } else L.push('📦 *Rodada de códigos*: nenhuma rodada no período');
  var esp = [];
  if (x.duvidas) esp.push('❓ ' + x.duvidas + ' dúvida(s) de código');
  if (x.ocorrencias) esp.push('🔴 ' + x.ocorrencias + ' ocorrência(s)');
  if (esp.length) { L.push('⠀'); L.push('*Esperando você:* ' + esp.join(' · ')); }
  if (x.alertas.length) { L.push('⠀'); x.alertas.forEach(function (t) { L.push('⚠️ ' + t); }); }
  L.push('⠀');
  L.push('Detalhes na aba *Códigos* do painel' + (x.painel_url ? ': ' + x.painel_url : '.'));
  return L.join('\n');
}
async function avisoPassadas(op) {
  op = op || {};
  var agora = op.agora || Date.now();
  var base = op.base || await lerBase(false);
  var cfg = Object.assign({}, EMAIL_CFG_PADRAO, base.cfg || {});
  var out = { ok: true, enviado: false };
  if (cfg.passadas_whatsapp === 'desligado' && !op.forcar && !op.simular) { out.pulou = 'aviso desligado'; return out; }
  var lidos = await Promise.all([fbLerOu(RAST_PASSADAS), fbLerOu(COD + '/rodadas', 'orderBy=' + encodeURIComponent('"$key"') + '&limitToLast=10'), fbLerOu(COD + '/ultima'),
    fbLerOu(PASS_RESUMO), fbLerOu(SEM_CONS), fbLerOu(AM_VISTOS)]);
  var peds = op.peds || montarPedidos(base);
  var todas = passadasLista(lidos[0], 40), rodT = Object.keys(lidos[1] || {}).map(function (k) { return lidos[1][k]; }).filter(function (r) { return r && Number(r.ts) > 0; }).sort(function (a, b) { return b.ts - a.ts; });
  var ult = (lidos[3] && Number(lidos[3].ts)) || 0;
  var desde = ult ? Math.max(ult, agora - 80 * 3600000) : agora - 24 * 3600000;   /* 80 h cobre o fim de semana (sexta 10h → segunda 10h) */
  var alertas = [];
  if (!todas.length) alertas.push('O rastreio automático ainda não registrou nenhuma passada.');
  else if (agora - todas[0].ts > 16 * 3600000) alertas.push('*O rastreio automático não roda há ' + horasDesde(todas[0].ts, agora) + '.* Nenhum status atualiza sozinho. Avise o Thiago.');
  if (rodT.length && agora - rodT[0].ts > 30 * 3600000) alertas.push('*A rodada de códigos não roda há ' + horasDesde(rodT[0].ts, agora) + '.* Não entram códigos novos e Loggi e Fastpack param de atualizar. Avise o Thiago.');
  var x = { desde: desde, passadas: todas.filter(function (p) { return p.ts > desde; }), rodadas: rodT.filter(function (r) { return r.ts > desde; }),
    sem_consulta: semConsultaLista(peds, lidos[4], agora).length, duvidas: ((lidos[2] && lidos[2].duvidas) || []).length,
    ocorrencias: ocorrenciasLista(peds, lidos[5], agora).filter(function (o) { return !o.visto; }).length, alertas: alertas, painel_url: cfg.painel_url || '' };
  out.passadas = x.passadas.length; out.rodadas = x.rodadas.length; out.alertas = alertas.length;
  var texto = textoPassadas(x);
  if (op.simular) { out.texto = texto; return out; }
  var tel = String(cfg.ana_whatsapp || '').replace(/\D/g, '');
  if (!tel) { out.ok = false; out.erro = 'sem o WhatsApp da logística na configuração (ana_whatsapp)'; return out; }
  var r = await whats(tel, texto);
  if (!r.ok) { out.ok = false; out.erro = r.erro; return out; }
  out.enviado = true;
  if (!op.forcar) { try { await fbReq('PUT', PASS_RESUMO, { ts: agora }); } catch (e) { out.erro = 'enviou, mas não gravou a data (' + e.message + ')'; } }   /* o "enviar agora" do painel não mexe na contagem da rotina */
  return out;
}
/* v12: resultado das passadas do rastreio automático (gravado pelo Rastreamento v20). Só números; a mais nova primeiro. */
var RAST_PASSADAS = RAIZ + '/rastreio_passadas';
var PASSADA_CAMPOS = ['ts', 'ini', 'consultados', 'atualizados', 'entregues', 'via_onlog', 'pv', 'sem_pv', 'sem_consulta', 'execs', 'incompleta', 'faltaram'];
function passadasLista(no, max) {
  var l = (no && no.lista && typeof no.lista === 'object') ? no.lista : {};
  return Object.keys(l).map(function (k) {
    var x = l[k]; if (!x || typeof x !== 'object' || !(Number(x.ts) > 0)) return null;
    var o = { tipo: x.tipo === 'rapida' ? 'rapida' : 'completa' };
    PASSADA_CAMPOS.forEach(function (c) { if (x[c] !== undefined && x[c] !== null && isFinite(Number(x[c]))) o[c] = Number(x[c]); });
    return o;
  }).filter(Boolean).sort(function (a, b) { return b.ts - a.ts; }).slice(0, Math.max(1, Number(max) || 12));
}
async function avisoSemConsulta(op) {
  var agora = op.agora || Date.now(), cfg = op.cfg || {}, lista = op.lista || [];
  var av = (await fbLerOu(SEM_CONS_AVISADOS)) || {};
  var igual = function (a) { var x = av[a.k]; return !!(x && x.motivo === a.motivo); };
  var novos = lista.filter(function (a) { return !igual(a); });
  var out = { ok: true, novos: novos.length, enviado: false };
  if (op.simular) { out.texto = novos.length ? textoSemConsulta(novos, lista.length, cfg.painel_url || '') : ''; return out; }
  if (cfg.onlog_whatsapp === 'desligado') out.pulou = 'aviso desligado';
  else if (novos.length) {
    var tel = String(cfg.ana_whatsapp || '').replace(/\D/g, '');
    if (!tel) { out.ok = false; out.erro = 'sem o WhatsApp da logística na configuração (ana_whatsapp)'; return out; }
    var r = await whats(tel, textoSemConsulta(novos, lista.length, cfg.painel_url || ''));
    if (!r.ok) { out.ok = false; out.erro = r.erro; return out; }   /* não marca como avisado: tenta de novo na próxima leitura */
    out.enviado = true;
  }
  var mapa = {};
  lista.forEach(function (a) { mapa[a.k] = { motivo: a.motivo, ts: igual(a) ? av[a.k].ts : agora }; });
  try { await fbReq('PUT', SEM_CONS_AVISADOS, mapa); } catch (e) { out.erro = 'avisou, mas não gravou a lista (' + e.message + ')'; }
  return out;
}
var ONLOG_TIPO_TXT = { cancelado: '🚫 Cancelado na Onlog', devolucao: '↩️ Devolvido / voltando', problema: '⚠️ Com problema', parado: '⏳ Parado na Onlog (sem ir para a transportadora)' };
function textoAvisosOnlog(novos, emAberto, painelUrl) {
  var L = ['🚨 *Logística — avisos novos da Onlog* (' + novos.length + ')', '⠀'];
  ['cancelado', 'devolucao', 'problema', 'parado'].forEach(function (tp) {
    var l = novos.filter(function (a) { return a.tipo === tp; });
    if (!l.length) return;
    L.push('*' + ONLOG_TIPO_TXT[tp] + '* (' + l.length + '):');
    l.slice(0, 15).forEach(function (a) {
      L.push('• ' + a.pedido + ' — ' + a.situacao + (a.detalhe ? ' · ' + a.detalhe : '') + (a.historico && a.historico.indexOf(a.situacao) < 0 ? ' · antes: ' + a.historico : '') +
        (a.desde ? ' — desde ' + String(a.desde).slice(0, 5) : '') + (a.codigo ? ' — ' + a.codigo : ''));
    });
    if (l.length > 15) L.push('… e mais ' + (l.length - 15));
    L.push('⠀');
  });
  L.push('Ao todo há ' + emAberto + ' aviso(s) em aberto. Veja e marque ✔ Visto na aba *Códigos* do painel' + (painelUrl ? ': ' + painelUrl : '.'));
  return L.join('\n');
}
async function avisoOnlog(op) {
  var agora = op.agora || Date.now(), cfg = op.cfg || {}, todos = op.alertas || [];
  var abertos = todos.filter(function (a) { return !a.visto; });
  var av = (await fbLerOu(ONLOG_AVISADOS)) || {};
  var igual = function (a) { var x = av[a.k]; return !!(x && x.tipo === a.tipo && x.st === a.situacao); };
  var novos = abertos.filter(function (a) { return !igual(a); });
  var out = { ok: true, novos: novos.length, enviado: false };
  if (op.simular) { out.texto = novos.length ? textoAvisosOnlog(novos, abertos.length, cfg.painel_url || '') : ''; return out; }
  if (cfg.onlog_whatsapp === 'desligado') out.pulou = 'aviso desligado';
  else if (novos.length) {
    var tel = String(cfg.ana_whatsapp || '').replace(/\D/g, '');
    if (!tel) { out.ok = false; out.erro = 'sem o WhatsApp da logística na configuração (ana_whatsapp)'; return out; }
    var r = await whats(tel, textoAvisosOnlog(novos, abertos.length, cfg.painel_url || ''));
    if (!r.ok) { out.ok = false; out.erro = r.erro; return out; }   /* não marca como avisado: tenta de novo na próxima leitura */
    out.enviado = true;
  }
  /* guarda o que já foi avisado (com aviso desligado também, para não despejar tudo de uma vez ao religar) */
  var mapa = {};
  todos.forEach(function (a) { mapa[a.k] = { st: a.situacao, tipo: a.tipo, ts: igual(a) ? av[a.k].ts : agora }; });
  try { await fbReq('PUT', ONLOG_AVISADOS, mapa); } catch (e) { out.erro = 'avisou, mas não gravou a lista (' + e.message + ')'; }
  return out;
}
/* v9: processa a leitura da situação dos objetos (chamado quando o coletor termina — fim:true — ou pelo painel) */
async function onlogStatusProcessar(agora) {
  var lidos = await Promise.all([lerBase(false), fbLerOu(COD + '/entrada_status'), fbLerOu(ONLOG_ST), fbLerOu(ONLOG_VISTOS), fbLerOu(SEM_CONS)]);
  var base = lidos[0], ent = lidos[1], velho = lidos[2] || {}, vistosO = lidos[3] || {};
  if (!ent || !Array.isArray(ent.itens) || agora - Number(ent.ts) > ENTRADA_VALE_MS) return { ok: false, erro: 'sem_entrada' };
  var cfg = Object.assign({}, EMAIL_CFG_PADRAO, base.cfg || {}), peds = montarPedidos(base);
  var r = onlogMontar(peds, ent.itens, velho, agora, cfg.onlog_janela_dias);
  await fbReq('PUT', ONLOG_ST, r.mapa);
  var al = onlogAlertas(peds, r.mapa, vistosO, agora, cfg.onlog_parado_dias), cont = {};
  al.forEach(function (a) { cont[a.tipo] = (cont[a.tipo] || 0) + 1; });
  var resumo = { ts: agora, acompanhados: r.alvos, lidos: r.lidos, nao_achados: r.nao_achados, sem_leitura: r.sem_leitura, alertas: al.length, por_tipo: cont };
  /* v10: aviso no WhatsApp da logística com o que é NOVO (falha aqui não derruba a leitura) */
  try { resumo.whatsapp = await avisoOnlog({ agora: agora, cfg: cfg, alertas: al }); } catch (eW) { resumo.whatsapp = { ok: false, erro: String(eW && eW.message || eW) }; }
  /* v11: pedidos que o rastreio não consegue consultar (lista do Rastreamento v19) — mesma chave do aviso, falha aqui também não derruba */
  try { resumo.whatsapp_sem_consulta = await avisoSemConsulta({ agora: agora, cfg: cfg, lista: semConsultaLista(peds, lidos[4], agora) }); }
  catch (eS) { resumo.whatsapp_sem_consulta = { ok: false, erro: String(eS && eS.message || eS) }; }
  await fbReq('PUT', COD + '/status_ultima', resumo);
  await fbReq('DELETE', COD + '/entrada_status');
  return Object.assign({ ok: true }, resumo);
}

/* ---- a rodada: casa o que veio (Daniel + Onlog) com os pendentes e grava os certos ---- */
async function rodadaCodigos(op) {
  var agora = op.agora || Date.now();
  var lidos = await Promise.all([lerBase(false), fbLerOu(COD + '/entrada'), fbLerOu(COD + '/ignorados'), fbLerOu(COD + '/rodada_atual')]);
  var base = lidos[0], ent = lidos[1] || {}, ign = lidos[2] || {}, atual = lidos[3];
  var cfg = Object.assign({}, EMAIL_CFG_PADRAO, base.cfg || {});
  var fontes = {}, dan = null, onl = null;
  if (ent.daniel && agora - Number(ent.daniel.ts) < ENTRADA_VALE_MS) { dan = ent.daniel.itens || []; fontes.daniel = { ts: ent.daniel.ts, n: dan.length }; }
  if (ent.onlog && agora - Number(ent.onlog.ts) < ENTRADA_VALE_MS) { onl = ent.onlog.itens || []; fontes.onlog = { ts: ent.onlog.ts, n: onl.length }; }
  if (!dan && !onl) return { ok: false, erro: 'sem_entrada', msg: 'Nenhum dado novo do site do Daniel nem da Onlog (vale 1 hora). Rode a coleta de novo.' };
  var peds = montarPedidos(base);
  var plano = casarCodigos({ peds: peds, daniel: dan || [], onlog: onl || [], ignorados: ign, agora: agora, janelaDias: cfg.codigos_janela_dias, duvidaDias: cfg.codigos_duvida_dias });
  if (!op.aplicar) return { ok: true, simulacao: true, fontes: fontes, resumo: plano.resumo, aplicar: plano.aplicar, duvidas: plano.duvidas };

  if (!atual || !atual.inicio || agora - Number(atual.inicio) > ENTRADA_VALE_MS) atual = { inicio: agora, tentados: {}, registros: [] };
  atual.tentados = atual.tentados || {}; atual.registros = atual.registros || [];
  var fila = plano.aplicar.filter(function (i) { return !atual.tentados[sha(chaveItem(i)).slice(0, 16)]; });
  var lote = fila.slice(0, LOTE_GAS);
  if (lote.length) {
    var g = await gasAplicar(lote);
    if (!g.ok) return { ok: false, erro: 'gas', msg: g.erro, resta: fila.length };
    lote.forEach(function (i, n) {
      atual.tentados[sha(chaveItem(i)).slice(0, 16)] = 1;
      var rg = registroDe(i, g.resultado[n]);
      if (!rg.ok || rg.fez.length) atual.registros.push(rg);
    });
    await fbReq('PUT', COD + '/rodada_atual', atual);
  }
  var resta = fila.length - lote.length;
  if (resta > 0) return { ok: true, resta: resta, gravados_ate_agora: atual.registros.filter(function (x) { return x.ok; }).length };

  /* acabou: fecha a rodada */
  var aplicados = atual.registros.filter(function (x) { return x.ok; }), recusados = atual.registros.filter(function (x) { return !x.ok; });
  var cont = function (f) { return aplicados.filter(f).length; };
  var resumo = Object.assign({}, plano.resumo, {
    codigos: cont(function (x) { return x.fez.indexOf('codigo') >= 0; }), onlogs: cont(function (x) { return x.fez.indexOf('onlog') >= 0 && x.fez.indexOf('codigo') < 0; }),
    origens: cont(function (x) { return x.fez.indexOf('origem') >= 0; }), linhas_d: cont(function (x) { return x.fez.indexOf('linha D') >= 0; }),
    recusados: recusados.length });
  var rodada = { ts: agora, inicio: atual.inicio, fontes: fontes, resumo: resumo, aplicados: aplicados, recusados: recusados, duvidas: plano.duvidas };
  await fbReq('PUT', COD + '/ultima', rodada);
  await fbReq('PUT', COD + '/rodadas/' + atual.inicio, { ts: agora, fontes: fontes, resumo: resumo });
  await fbReq('DELETE', COD + '/rodada_atual'); await fbReq('DELETE', COD + '/entrada'); await fbReq('DELETE', COD + '/ticket');
  var mails = null;
  try { mails = await enviarPacotesPendentes(agora); } catch (eM) { mails = { erro: eM.message }; }
  return { ok: true, resta: 0, fontes: fontes, resumo: resumo, aplicados: aplicados, recusados: recusados, duvidas: plano.duvidas, emails_pacotes: mails };
}

/* ============================ E-MAIL "SEU PEDIDO VAI EM N PACOTES" ============================ */
function itensDoPacote(linhaForn) {   /* "Fornecedor: 2x A, 1x B" → ['2x A', '1x B'] (o nome do fornecedor NUNCA sai) */
  var s = String(linhaForn || ''), i = s.indexOf(':');
  if (i < 0) return [];
  return s.slice(i + 1).split(/,\s*(?=\d+\s*x\s)/i).map(function (x) { return x.trim(); }).filter(function (x) { return /^\d+\s*x\s+\S/i.test(x); });
}
function montarEmailPacotes(dados, textos) {
  var T = Object.assign({}, EMAIL_PADRAO);
  Object.keys(EMAIL_PADRAO).forEach(function (k) { if (textos && textos[k] && String(textos[k]).trim()) T[k] = String(textos[k]); });
  var blocos = dados.pacotes.map(function (p, i) {
    var local = p.local || (p.origem && ORIGEM_NOME[p.origem]) || '';
    return 'Pacote ' + (i + 1) + (local ? ' — sai de ' + local : '') + '\n' + p.itens.map(function (x) { return '• ' + x; }).join('\n');
  }).join('\n\n');
  var v = { NOME: String(dados.nome || '').split(' ')[0] || 'cliente', PEDIDO: dados.pedido, N: dados.pacotes.length, PACOTES: blocos };
  return { assunto: preencher(T.email_pacotes_assunto, v), texto: preencher(T.email_pacotes_texto, v) };
}
/* lê o pedido e as linhas D dele (PEDIDO_ORIGINAL) e monta os pacotes; devolve { motivo } quando não é caso de e-mail */
async function lerPacotes(pedido) {
  var k = R.histKey(pedido), dia = (pedido.match(/^(VF-\d{4}-)/) || [])[1];
  var lidos = await Promise.all([R.fbGetOu('vitaflow_pedidos_hdr'), R.fbGetOu('vitaflow_pedidos/' + k),
    fbLerOu('vitaflow_pedidos', 'orderBy=' + encodeURIComponent('"$key"') + '&startAt=' + encodeURIComponent('"' + dia + 'D"') + '&endAt=' + encodeURIComponent('"' + dia + 'D"')),
    R.fbGetOu('vitaflow_compras/' + k)]);
  var hdr = (lidos[0] || []).map(function (h) { return String(h || '').trim().toUpperCase(); }), l = lidos[1], ds = lidos[2] || {}, comp = lidos[3];
  if (!l || !l.length) return { motivo: 'pedido não encontrado' };
  var cF = hdr.indexOf('COMPRADO_FORNECEDORES'), cP = hdr.indexOf('PEDIDO_ORIGINAL'), cO = hdr.indexOf('ORIGEM');
  if (cF < 0 || cP < 0) return { motivo: 'a planilha ainda não tem as colunas dos pacotes' };
  var st = R.semAcentoUp(l[5]);
  if (R.naoPagou(l[5], l[12]) || FINAL[st]) return { motivo: 'pedido não pago ou cancelado' };
  var cel = function (ln, c) { return (c >= 0 && ln) ? String(ln[c] == null ? '' : ln[c]).trim() : ''; };
  if (cel(l, cP)) return { motivo: 'é uma linha de pacote, não o pedido' };
  var linhasO = linhasForn(cel(l, cF));
  if (linhasO.length !== 1) return { motivo: 'pedido não dividido em pacotes' };
  var filhos = Object.keys(ds).map(function (kd) { return ds[kd]; }).filter(function (ln) {
    return ln && ln.length && cel(ln, cP).toUpperCase() === pedido && !FINAL[R.semAcentoUp(ln[5])];
  }).sort(function (a, b) { return String(a[0]) < String(b[0]) ? -1 : 1; });
  var pacotes = [l].concat(filhos).map(function (ln) {
    var fornLinha = linhasForn(cel(ln, cF))[0] || '', og = cel(ln, cO).toUpperCase();
    if (!ORIGEM_NOME[og]) { og = R.origemEnvio(pedido, fornLinha); if (!ORIGEM_NOME[og]) og = ''; }   /* 'DANIEL' = ainda não se sabe (MS ou SP) */
    var fam = familia(fornLinha);
    /* fornecedora VitaFlow sai de Campinas/SP — nunca do RJ (Thiago, 01/10) */
    return { numero: String(ln[0]).trim(), fam: fam, itens: itensDoPacote(fornLinha), origem: og, local: (fam === 'VITAFLOW' && og === 'SP') ? 'Campinas/SP' : '' };
  }).filter(function (p) { return p.itens.length; });
  if (pacotes.length < 2) return { motivo: 'pedido com um pacote só' };
  /* "com tudo comprado": todo fornecedor do pedido no Compras já está marcado como comprado */
  if (comp && comp.itens && comp.itens.length) {
    var falta = false, nomes = {};
    comp.itens.forEach(function (it) { if (it) nomes[it.fornecedor || '(sem fornecedor)'] = 1; });
    Object.keys(nomes).forEach(function (f) { if (!(comp.grupos && comp.grupos[f] && comp.grupos[f].comprado)) falta = true; });
    if (falta) return { motivo: 'falta comprar', esperar: true };
  }
  return { k: k, pedido: pedido, nome: String(l[1] || '').trim(), email: String(l[2] || '').trim(), pacotes: pacotes };
}
async function emailPacotes(pedido, op) {
  op = op || {}; var agora = op.agora || Date.now();
  pedido = String(pedido || '').trim().toUpperCase();
  if (!/^VF-\d{4}-[A-Z][A-Z0-9]*$/.test(pedido)) return { ok: false, erro: 'pedido inválido' };
  if (ehRevendedor(pedido)) return { ok: true, enviado: false, motivo: 'revendedor não recebe e-mail' };
  var k = R.histKey(pedido);
  var pre = await Promise.all([fbLerOu(RAIZ + '/config'), fbLerOu(RAIZ + '/textos'), fbLerOu(RAIZ + '/email_pacotes/' + k)]);
  var cfg = Object.assign({}, EMAIL_CFG_PADRAO, pre[0] || {}), reg = pre[2] || {};
  var modo = cfg.email_pacotes_modo || 'ligado';
  if (modo === 'desligado') return { ok: true, enviado: false, motivo: 'e-mail de pacotes desligado' };
  if (reg.estado === 'enviado' || reg.estado === 'teste') { if (!op.forcar) return { ok: true, enviado: false, motivo: 'já enviado' }; }
  var d = await lerPacotes(pedido);
  if (d.motivo) {
    if (!d.esperar && reg.estado === 'aguardando_origem') { await fbReq('DELETE', RAIZ + '/email_pacotes/' + k); await fbReq('DELETE', RAIZ + '/email_pacotes_fila/' + k); }
    return { ok: true, enviado: false, motivo: d.motivo };
  }
  if (!emailOk(d.email)) return { ok: true, enviado: false, motivo: 'pedido sem e-mail válido' };
  /* origem do pacote do Daniel só é certa depois que a rodada lê o site dele → espera (no máximo 20 h) */
  var semOrigem = d.pacotes.filter(function (p) { return !p.origem; }).length;
  var desde = Number(reg.desde) || agora;
  if (semOrigem && !op.semEspera && agora - desde < 20 * 3600000) {
    await fbReq('PUT', RAIZ + '/email_pacotes/' + k, { estado: 'aguardando_origem', desde: desde, pedido: pedido });
    await fbReq('PUT', RAIZ + '/email_pacotes_fila/' + k, desde);
    return { ok: true, enviado: false, adiado: 'origem', motivo: 'esperando a origem do pacote (próxima rodada de códigos; no máximo 20 h)' };
  }
  var m = montarEmailPacotes(d, pre[1]);
  var para = d.email, assunto = m.assunto;
  if (modo === 'teste') {
    para = String(cfg.email_atraso_teste || '').trim(); assunto = '[TESTE] ' + assunto;
    if (!emailOk(para)) return { ok: false, erro: 'modo teste sem e-mail de teste (aba Atrasos)' };
  }
  var r = await enviarBrevo(para, modo === 'teste' ? '' : d.nome, assunto, m.texto);
  if (!r.ok) return { ok: false, erro: r.erro };
  await fbReq('PUT', RAIZ + '/email_pacotes/' + k, { estado: modo === 'teste' ? 'teste' : 'enviado', ts: agora, n: d.pacotes.length, pedido: pedido, numeros: d.pacotes.map(function (p) { return p.numero; }).join(', ') });
  await fbReq('DELETE', RAIZ + '/email_pacotes_fila/' + k);
  return { ok: true, enviado: true, modo: modo, pacotes: d.pacotes.length };
}
/* os que ficaram esperando a origem: chamado no fim da rodada de códigos e pela rotina diária (logistica-atrasos) */
async function enviarPacotesPendentes(agora) {
  agora = agora || Date.now();
  var fila = await fbLerOu(RAIZ + '/email_pacotes_fila');
  var ks = (fila && typeof fila === 'object') ? Object.keys(fila).slice(0, 15) : [];
  var out = { fila: ks.length, enviados: 0, esperando: 0, erros: [] };
  for (var i = 0; i < ks.length; i++) {
    var reg = await fbLerOu(RAIZ + '/email_pacotes/' + ks[i]);
    if (!reg || !reg.pedido) { await fbReq('DELETE', RAIZ + '/email_pacotes_fila/' + ks[i]); continue; }
    var r = await emailPacotes(reg.pedido, { agora: agora });
    if (r.enviado) out.enviados++; else if (r.adiado || (r.motivo === 'falta comprar')) out.esperando++; else if (!r.ok) out.erros.push(reg.pedido + ': ' + r.erro);
  }
  return out;
}

/* ---- ações novas do handler (v3) ---- */
async function acaoComTicket(acao, d, agora) {
  if (!(await conferirTicket(d.ticket, agora))) return resp({ ok: false, erro: 'ticket inválido ou vencido' }, 401);
  if (acao === 'codigos_fila') {
    var base = await lerBase(false), cfg = Object.assign({}, EMAIL_CFG_PADRAO, base.cfg || {});
    var pedsF = montarPedidos(base), stF = (await fbLerOu(ONLOG_ST)) || {};
    return resp({ ok: true, cpfs: filaOnlog(pendentesCodigo(pedsF, agora, cfg.codigos_janela_dias), agora, 40),
      /* v9: os objetos para ler a SITUAÇÃO (c = código a consultar · s = último status conhecido · m = 1: abrir o detalhe) */
      objetos: objetosOnlog(pedsF, agora, stF, cfg.onlog_janela_dias).map(function (a) { return { c: a.c, s: a.s, m: a.m }; }) });
  }
  if (d.fonte === 'onlog_status') {   /* v9 */
    var itS = limparEntrada('onlog_status', d.itens);
    if (d.acumular) {
      var jaS = await fbLerOu(COD + '/entrada_status');
      if (jaS && agora - Number(jaS.ts) < ENTRADA_VALE_MS && Array.isArray(jaS.itens)) itS = jaS.itens.concat(itS).slice(0, 500);
    }
    await fbReq('PUT', COD + '/entrada_status', { ts: agora, itens: itS });
    var proc = null;
    if (d.fim) { try { proc = await onlogStatusProcessar(agora); } catch (eS) { proc = { ok: false, erro: String(eS && eS.message || eS) }; } }
    return resp({ ok: true, fonte: 'onlog_status', recebidos: itS.length, processado: proc });
  }
  var fonte = d.fonte === 'onlog' ? 'onlog' : (d.fonte === 'daniel' ? 'daniel' : '');
  if (!fonte) return resp({ ok: false, erro: 'fonte inválida' }, 400);
  var itens = limparEntrada(fonte, d.itens);
  if (d.acumular) {
    var ja = await fbLerOu(COD + '/entrada/' + fonte);
    if (ja && agora - Number(ja.ts) < ENTRADA_VALE_MS && Array.isArray(ja.itens)) itens = ja.itens.concat(itens).slice(0, 600);
  }
  await fbReq('PUT', COD + '/entrada/' + fonte, { ts: agora, itens: itens });
  return resp({ ok: true, fonte: fonte, recebidos: itens.length });
}
async function acaoAdminV3(acao, d, uid, agora) {
  if (acao === 'codigos_ticket') return resp({ ok: true, ticket: await novoTicket(uid, agora), vale_min: TICKET_VALE_MS / 60000 });
  if (acao === 'codigos_pendentes') {
    var base = await lerBase(false), cfg = Object.assign({}, EMAIL_CFG_PADRAO, base.cfg || {});
    var pedsP = montarPedidos(base);
    var pend = pendentesCodigo(pedsP, agora, cfg.codigos_janela_dias);
    var lidos = await Promise.all([fbLerOu(COD + '/ultima'), fbLerOu(COD + '/rodadas', 'orderBy=' + encodeURIComponent('"$key"') + '&limitToLast=10'),
      fbLerOu(ONLOG_ST), fbLerOu(ONLOG_VISTOS), fbLerOu(COD + '/status_ultima'), fbLerOu(SEM_CONS), fbLerOu(RAST_PASSADAS)]);
    var mapaO = lidos[2] || {}, noSC = lidos[5] || null;
    return resp({ ok: true, gerado_ts: agora,
      /* v11: pedidos que o rastreio não consegue consultar por falta de dado */
      rastreio: { sem_consulta: semConsultaLista(pedsP, noSC, agora), lido_ts: (noSC && Number(noSC.ts)) || 0, passadas: passadasLista(lidos[6]) },   /* v12: passadas */
      /* v9: situação dos objetos na Onlog */
      onlog: { alertas: onlogAlertas(pedsP, mapaO, lidos[3] || {}, agora, cfg.onlog_parado_dias), acompanhados: Object.keys(mapaO).length,
        ultima: lidos[4] || null, parado_dias: Math.max(1, Number(cfg.onlog_parado_dias) || 2),
        whatsapp: cfg.onlog_whatsapp === 'desligado' ? 'desligado' : 'ligado' /* v10 */ },
      pendentes: pend.sort(function (a, b) { return a.tConf - b.tConf; }).map(function (p) {
        return { pedido: p.pedido, nome: p.nome, cpf: p.cpf, data: String(p.data || '').slice(0, 10), status: p.status, fornecedor: p.forn, comprado: p.fams.length > 0,
          onlog: p.onlog, pacote_de: p.pai, dias: R.duEntre(p.tConf, agora), revendedor: ehRevendedor(p.pedido) };
      }),
      ultima: lidos[0] || null, rodadas: lidos[1] || {},
      config: { email_pacotes_modo: cfg.email_pacotes_modo, teste: cfg.email_atraso_teste || '', passadas_whatsapp: cfg.passadas_whatsapp === 'desligado' ? 'desligado' : 'ligado' } });
  }
  if (acao === 'codigos_casar') return resp(await rodadaCodigos({ agora: agora, aplicar: d.aplicar === true }));
  if (acao === 'codigos_onlog_processar') return resp(await onlogStatusProcessar(agora));   /* v9: se o coletor parou antes do fim */
  if (acao === 'codigos_onlog_visto') {   /* v9: ✔ Visto num aviso da Onlog — some até a situação mudar */
    var kV = String(d.k || '');
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(kV)) return resp({ ok: false, erro: 'pedido inválido' }, 400);
    if (d.desfazer === true) { await fbReq('DELETE', ONLOG_VISTOS + '/' + kV); return resp({ ok: true, k: kV, visto: false }); }
    var regV = await fbLerOu(ONLOG_ST + '/' + kV);
    if (!regV) return resp({ ok: false, erro: 'esse pedido não tem leitura da Onlog' });
    var tipoV = ['cancelado', 'devolucao', 'problema', 'parado'].indexOf(String(d.tipo)) >= 0 ? String(d.tipo) : '';
    if (!tipoV) return resp({ ok: false, erro: 'tipo inválido' }, 400);
    await fbReq('PUT', ONLOG_VISTOS + '/' + kV, { st: regV.st || '', tipo: tipoV, ts: agora, uid: uid });
    return resp({ ok: true, k: kV, visto: true });
  }
  if (acao === 'codigos_aplicar') {   /* resolver uma dúvida à mão (painel) */
    var itens = (Array.isArray(d.itens) ? d.itens : []).slice(0, 10).map(function (i) {
      i = i || {};
      var o = { pedido: txt(i.pedido, 30).toUpperCase(), codigo: (codigoValido(i.codigo) || limparCod(i.codigo) === MOTOBOY) ? limparCod(i.codigo) : '', onlog: limparCod(i.onlog), transportadora: txt(i.transportadora, 30), origem: txt(i.origem, 2).toUpperCase(), _fonte: txt(i.fonte, 10) || 'manual', _tipo: 'manual' };
      if (i.novoD && i.novoD.forn) o.novoD = { forn: txt(i.novoD.forn, 60), itens: txt(i.novoD.itens, 300), produtos: '' };
      if (o.codigo && !o.transportadora) o.transportadora = transpPorFormato(o.codigo);
      return o;
    }).filter(function (o) { return o.pedido && (o.codigo || o.onlog || o.origem); });
    if (!itens.length) return resp({ ok: false, erro: 'nada para gravar' }, 400);
    var g = await gasAplicar(itens);
    if (!g.ok) return resp({ ok: false, erro: g.erro });
    var regs = itens.map(function (i, n) { return registroDe(i, g.resultado[n]); });
    /* tira a dúvida resolvida da última rodada e anota o que foi gravado */
    var ult = await fbLerOu(COD + '/ultima');
    if (ult) {
      var feitos = {}, pedFeito = {};
      regs.forEach(function (x) { if (x.ok) { if (x.codigo) feitos[x.codigo] = 1; if (x.onlog) feitos[x.onlog] = 1; pedFeito[String(x.pedido_pedido || '').toUpperCase()] = 1; } });
      ult.duvidas = (ult.duvidas || []).filter(function (dv) {
        if (dv.codigo === MOTOBOY) return !(feitos[MOTOBOY] && (dv.candidatos || []).some(function (c) { return pedFeito[String(c.pedido).toUpperCase()]; }));   /* MOTOBOY não é único: só sai a dúvida daquele pedido */
        return !(feitos[dv.codigo] || feitos[dv.onlog]);
      });
      ult.aplicados = (ult.aplicados || []).concat(regs.filter(function (x) { return x.ok && x.fez.length; }).map(function (x) { x.manual_por = uid; x.manual_ts = agora; return x; }));
      await fbReq('PUT', COD + '/ultima', ult);
    }
    return resp({ ok: true, resultado: regs });
  }
  if (acao === 'codigos_ignorar') {   /* "esse código não é de pedido nosso" → não aparece mais */
    var c = limparCod(d.codigo);
    if (!c || /[.#$\[\]\/]/.test(c)) return resp({ ok: false, erro: 'código inválido' }, 400);
    if (c === MOTOBOY) return resp({ ok: false, erro: 'MOTOBOY não dá para ignorar (é entrega por motoboy, não um código)' }, 400);
    await fbReq('PUT', COD + '/ignorados/' + c, agora);
    var u2 = await fbLerOu(COD + '/ultima');
    if (u2 && u2.duvidas) { u2.duvidas = u2.duvidas.filter(function (dv) { return dv.codigo !== c && dv.onlog !== c; }); await fbReq('PUT', COD + '/ultima', u2); }
    return resp({ ok: true });
  }
  return null;
}

/* ============================ COLETORES (rodam DENTRO da aba do site do Daniel / da Onlog) ============================
   GET ?coletor=daniel | ?coletor=onlog devolve o código-fonte de uma função. Quem faz a rodada cola na aba:
       var f = (0, eval)(await (await fetch(FN + '?coletor=daniel')).text());  await f('<ticket>');
   Os dados (CPF, nome, códigos) vão DIRETO da aba para esta função (codigos_entrada) — não passam por mais ninguém.
   ⚠️ Estas funções rodam no navegador: só usam o que existe lá (nada de require / variáveis deste arquivo). */
function coletorDaniel(ticket) {
  var FN = 'https://vitaflow-proxy.netlify.app/.netlify/functions/logistica-painel';
  return (async function () {
    var chave = Object.keys(localStorage).filter(function (k) { return /^sb-.*-auth-token$/.test(k); })[0];
    var tk = '';
    try { tk = (JSON.parse(localStorage.getItem(chave) || '{}') || {}).access_token || ''; } catch (e) { tk = ''; }
    if (!tk) return { ok: false, erro: 'sem_login' };
    var r = await fetch('https://drarbctupbqspvyuhsrb.supabase.co/functions/v1/make-server-59637aed/orders/my', { headers: { Authorization: 'Bearer ' + tk } });
    if (r.status === 401 || r.status === 403) return { ok: false, erro: 'sem_login' };
    if (!r.ok) return { ok: false, erro: 'site do Daniel respondeu ' + r.status };
    var j = await r.json(), os = (j && j.orders) || [];
    if (!os.length) return { ok: false, erro: 'nenhum pedido veio do site' };
    var itens = os.map(function (o) {
      var d = o.dropCustomer || {}, e = o.deliveryAddress || {};
      return { oc: o.orderCode || '', st: o.status || '', c1: o.trackingCode || '', c2: o.trackingCode2 || '', rg: o.shippingRegion || '',
        cpf: d.cpf || '', nome: d.name || '', cep: e.zipCode || '', cr: o.createdAt || '' };
    });
    var p = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao: 'codigos_entrada', ticket: ticket, fonte: 'daniel', itens: itens }) });
    var pj = await p.json();
    return { ok: !!pj.ok, pedidos: os.length, com_codigo: itens.filter(function (x) { return x.c1; }).length, recebidos: pj.recebidos || 0, erro: pj.erro || '' };
  })();
}
function coletorOnlog(ticket, opts) {
  var FN = 'https://vitaflow-proxy.netlify.app/.netlify/functions/logistica-painel';
  /* v14: limite de consultas por página + retomada (ver o cabeçalho). Sem opts = comportamento da v13. */
  opts = opts || {};
  var MAX = Number(opts.max) > 0 ? Number(opts.max) : 1e9, LOTE = Math.min(60, Math.max(5, Number(opts.lote) || 20));
  var CPF_DE = Math.max(0, Number(opts.cpfDe) || 0), FASE = opts.fase === 'cpf' || opts.fase === 'status' ? opts.fase : '', PULAR = {};
  (Array.isArray(opts.pular) ? opts.pular : []).forEach(function (c) { PULAR[String(c)] = 1; });
  var S = window._vfOnlog = { estado: 'iniciando', total: 0, feitos: 0, com_objeto: 0, objetos: 0, erros: 0, msg: '',
    /* v9: leitura da situação dos objetos */ fase: 'cpf', st_total: 0, st_feitos: 0, st_lidos: 0, st_detalhes: 0, st_erros: 0, st_resultado: null,
    /* v14 */ consultas: 0, cpf_prox: CPF_DE, st_tentados: [], st_resta: 0 };
  /* A aba da Onlog costuma ficar em 2º plano: lá o Chrome segura o setTimeout da página (até 1 por minuto). O relógio de um
     Worker não é segurado. Sem Worker (bloqueado), cai no setTimeout normal. */
  var relogio = null, esperas = {}, nEsp = 0;
  try {
    relogio = new Worker(URL.createObjectURL(new Blob(['onmessage=function(e){var d=e.data;setTimeout(function(){postMessage(d.id)},d.ms)}'], { type: 'text/javascript' })));
    relogio.onmessage = function (e) { var f = esperas[e.data]; if (f) { delete esperas[e.data]; f(); } };
    relogio.onerror = function () { relogio = null; Object.keys(esperas).forEach(function (k) { var f = esperas[k]; delete esperas[k]; f(); }); };
  } catch (e) { relogio = null; }
  function espera(ms) {
    return new Promise(function (r) {
      if (!relogio) { setTimeout(r, ms); return; }
      var id = ++nEsp; esperas[id] = r; relogio.postMessage({ id: id, ms: ms });
    });
  }
  async function ate(cond, ms) { var t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await espera(300); } return false; }
  /* cada consulta é UMA chamada da página (jQuery): conta as que terminaram, pra resposta atrasada nunca cair no CPF seguinte */
  var enviadas = 0, terminadas = 0;
  if (window.jQuery) { window.jQuery(document).ajaxSend(function () { enviadas++; }).ajaxComplete(function () { terminadas++; }); }
  /* aviso "Nenhum objeto encontrado" (janelinha com OK): fecha */
  function fecharAviso() {
    var b = document.querySelector('.swal2-container .swal2-confirm');
    if (b && b.offsetWidth) b.click();
  }
  function token() { var e = document.querySelector('[name=cf-turnstile-response]'); return !!(e && e.value); }
  function linhas(e) { return String((e && e.innerText) || '').split('\n').map(function (x) { return x.replace(/\s+/g, ' ').trim(); }).filter(Boolean); }
  var DATA = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/;
  function sem(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  /* bloco de UM objeto: "OBJETO <código real>" · AA… · operador · [DESTINATÁRIO…] · eventos (título, [detalhe], data), do mais antigo ao mais novo */
  function lerDetalhe(raiz) {
    var ls = linhas(raiz), o = { aa: '', real: '', op: '', criado: '', status: '', quando: '', cep: '', nome: '', det: '', evs: [], dev: 0 }, i, ini = -1;
    for (i = 0; i < ls.length; i++) {
      var mA = ls[i].match(/^AA\d{10}$/);
      if (mA && !o.aa) {
        o.aa = mA[0];
        var mR = (ls[i - 1] || '').match(/^OBJETO\s+([A-Z0-9]{8,34})$/i);
        if (mR && /\d{5}/.test(mR[1]) && !/^AA\d{10}$/i.test(mR[1])) o.real = mR[1].toUpperCase();
        var prox = ls[i + 1] || '';
        if (prox && !DATA.test(prox) && !/^(OBJETO|DESTINAT)/i.test(prox)) o.op = prox;
      }
      var mN = ls[i].match(/^DESTINAT[ÁA]RIO:\s*(.+)$/i); if (mN) o.nome = mN[1];
      var mC = ls[i].match(/\d{5}-\d{3}(?!\d)/); if (mC && !DATA.test(ls[i])) o.cep = mC[0];
      if (/^OBJETO CRIADO$/i.test(ls[i]) && DATA.test(ls[i + 1] || '')) { o.criado = ls[i + 1]; if (ini < 0) ini = i; }
    }
    /* v9: evento por evento — a linha de detalhe ("(cidade) ENDEREÇO INCORRETO." / "SAO PAULO - SP") não é o status */
    var datas = [];
    for (i = 0; i < ls.length; i++) if (DATA.test(ls[i])) datas.push(i);
    datas.forEach(function (di, n) {
      var a = (n === 0) ? ((ini >= 0 && ini < di) ? ini : di - 1) : datas[n - 1] + 1;
      if (a < 0 || a > di - 1) return;
      o.evs.push([ls[a], ls.slice(a + 1, di).join(' '), ls[di]]);
    });
    if (o.evs.length) { var u = o.evs[o.evs.length - 1]; o.status = u[0]; o.det = u[1]; o.quando = u[2]; }
    /* o objeto entrou em devolução/cancelamento e não voltou a sair para entrega? (bipes posteriores não mudam isso) */
    var iD = -1, iV = -1;
    o.evs.forEach(function (e, n) {
      var t = sem(e[0]);
      if (/CANCELAD|DEVOLU|DEVOLVID|RETORNADO PARA O CLIENTE/.test(t)) iD = n;
      if (/SAIDA PARA ENTREGA|^(OBJETO )?ENTREGUE|ASSINATURA DE ENCOMENDA/.test(t)) iV = n;
    });
    o.dev = (iD >= 0 && iV < iD) ? 1 : 0;
    return o;
  }
  async function fecharModal() {
    var m = document.querySelector('.modal.show');
    if (!m) return;
    var b = m.querySelector('[data-dismiss=modal], [data-bs-dismiss=modal], .close, .btn-close');
    if (b) b.click(); else if (window.jQuery) window.jQuery(m).modal('hide');
    await ate(function () { return !document.querySelector('.modal.show'); }, 4000);
  }
  async function consultar(cpf, desde) {
    var campo = document.querySelector('#txtR1RastreioEncomendas'), div = document.getElementById('divRetornoRastreio'), btn = document.getElementById('btnConsultar');
    var aba = document.querySelector('.btnTipo[data-tipo=cpf]');
    if (!campo || !div || !btn || !aba || !window.jQuery) return { erro: 'a página da Onlog mudou' };
    await fecharModal(); fecharAviso();
    /* consulta anterior ainda sem resposta: espera ela terminar antes de começar outra */
    if (!(await ate(function () { return terminadas >= enviadas; }, 30000))) return { erro: 'a Onlog não respondeu a consulta anterior' };
    if (!(await ate(token, 30000))) return { erro: 'verificacao', parar: true };   /* o Cloudflare não liberou sozinho → PARA (ninguém clica nele) */
    aba.click(); await espera(200);
    div.innerHTML = '';
    var fmt = cpf.slice(0, 3) + '.' + cpf.slice(3, 6) + '.' + cpf.slice(6, 9) + '-' + cpf.slice(9);
    window.jQuery(campo).val(fmt).trigger('input').trigger('change');
    var env0 = enviadas, ter0 = terminadas;
    S.consultas++;
    btn.click();
    var semToken = false;
    /* terminou = a chamada desta consulta voltou (ou, se a página não usar o jQuery pra isso, o Cloudflare renovou a senha) */
    var voltou = await ate(function () {
      if (!token()) semToken = true;
      if (enviadas > env0) return terminadas > ter0 && terminadas >= enviadas;
      return div.children.length > 0 || (semToken && token());
    }, 20000);
    if (!voltou) return { erro: 'a Onlog não respondeu' };
    await espera(600);
    fecharAviso();
    if (!div.children.length) return { objetos: [] };
    var trs = [].slice.call(div.querySelectorAll('tbody tr'));
    if (!trs.length) { var u = lerDetalhe(div); return { objetos: (u.aa || u.real) ? [u] : [] }; }
    /* vários objetos: abre o detalhe só dos criados a partir da véspera do pedido mais antigo sem código (no máximo 6) */
    var corte = 0, md = String(desde || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (md) corte = new Date(md[3] + '-' + md[2] + '-' + md[1] + 'T00:00:00-03:00').getTime() - 86400000;
    var objs = [], abertos = 0;
    for (var i = 0; i < trs.length; i++) {
      var tds = [].slice.call(trs[i].children).map(function (td) { return String(td.innerText || '').replace(/\s+/g, ' ').trim(); });
      var aa = (tds[0] || '').match(/AA\d{10}/); if (!aa) continue;
      var dt = (tds[2] || '').match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);
      var ts = dt ? new Date(dt[3] + '-' + dt[2] + '-' + dt[1] + 'T' + dt[4] + ':' + dt[5] + ':00-03:00').getTime() : 0;
      if (corte && ts && ts < corte) continue;
      var o = { aa: aa[0], real: '', op: tds[1] || '', criado: tds[2] || '', status: tds[3] || '', quando: '', cep: ((tds[4] || '').match(/\d{5}-\d{3}(?!\d)/) || [''])[0], nome: '' };
      var b = trs[i].querySelector('.btnVisualizarRastreio');
      if (b && abertos < 6) {
        abertos++; b.click();
        var abriu = await ate(function () { var m = document.querySelector('.modal.show'); return !!(m && String(m.innerText || '').indexOf(o.aa) >= 0); }, 8000);
        if (abriu) { var det = lerDetalhe(document.querySelector('.modal.show')); if (det.aa === o.aa) { det.cep = det.cep || o.cep; if (!det.criado) det.criado = o.criado; var stTab = o.status; o = det; if (stTab) o.status = stTab; } }   /* v9: o status que vale é o da tabela (o da Onlog) */
        await fecharModal(); await espera(400);
      }
      delete o.evs; delete o.det;
      objs.push(o);
    }
    return { objetos: objs };
  }
  /* ---------------- v9: SITUAÇÃO dos objetos (consulta POR CÓDIGO, vários de uma vez) ---------------- */
  async function consultarObjetos(codigos) {
    var campo = document.querySelector('#txtObjetos'), div = document.getElementById('divRetornoRastreio'), btn = document.getElementById('btnConsultar');
    var aba = document.querySelector('.btnTipo[data-tipo=objeto]');
    if (!campo || !div || !btn || !aba || !window.jQuery) return { erro: 'a página da Onlog mudou' };
    await fecharModal(); fecharAviso();
    if (!(await ate(function () { return terminadas >= enviadas; }, 30000))) return { erro: 'a Onlog não respondeu a consulta anterior' };
    if (!(await ate(token, 30000))) return { erro: 'verificacao', parar: true };   /* o Cloudflare não liberou sozinho → PARA (ninguém clica nele) */
    aba.click(); await espera(200);
    div.innerHTML = '';
    window.jQuery(campo).val(codigos.join(',')).trigger('input').trigger('change');
    var env0 = enviadas, ter0 = terminadas;
    S.consultas++;
    btn.click();
    var semToken = false;
    var voltou = await ate(function () {
      if (!token()) semToken = true;
      if (enviadas > env0) return terminadas > ter0 && terminadas >= enviadas;
      return div.children.length > 0 || (semToken && token());
    }, 25000);
    if (!voltou) return { erro: 'a Onlog não respondeu' };
    await espera(600);
    fecharAviso();
    var trs = [].slice.call(div.querySelectorAll('tbody tr'));
    if (!trs.length) { var u = div.children.length ? lerDetalhe(div) : null; return { linhas: [], unico: (u && (u.aa || u.real)) ? u : null }; }
    return { linhas: trs.map(function (tr) {
      var tds = [].slice.call(tr.children).map(function (td) { return String(td.innerText || '').replace(/\s+/g, ' ').trim(); });
      var aa = (tds[0] || '').match(/AA\d{10}/);
      return aa ? { aa: aa[0], status: tds[3] || '', tr: tr } : null;
    }).filter(Boolean) };
  }
  async function abrirDetalhe(l) {
    var b = l.tr.querySelector('.btnVisualizarRastreio');
    if (!b) return null;
    b.click();
    var modal = function () { return document.querySelector('.modal.show') || document.querySelector('#modal-default'); };
    var abriu = await ate(function () { var m = modal(); return !!(m && String(m.innerText || '').indexOf(l.aa) >= 0); }, 8000);
    if (!abriu) return null;
    var det = lerDetalhe(modal());
    return det.aa === l.aa ? det : null;
  }
  async function mandarStatus(itens, acumular, fim) {
    var r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao: 'codigos_entrada', ticket: ticket, fonte: 'onlog_status', itens: itens, acumular: acumular, fim: fim }) });
    return r.json();
  }
  /* alvos: [{c: código a consultar (AA ou o da transportadora), s: último status conhecido, m: 1 = abrir o detalhe}] */
  async function varrerStatus(alvos) {
    S.fase = 'status'; S.st_total = alvos.length; S.st_resta = alvos.length;
    var conhecido = {}, saida = [], primeiro = true, detalhes = 0, t0 = Date.now(), parou = false, pausou = false, ultimaResp = null;
    alvos.forEach(function (a) { conhecido[a.c] = a; });
    for (var i = 0; i < alvos.length; i += LOTE) {
      if (S.consultas >= MAX) { pausou = true; break; }   /* v14: limite de consultas desta página */
      var lote = alvos.slice(i, i + LOTE), res;
      try { res = await consultarObjetos(lote.map(function (a) { return a.c; })); } catch (e) { res = { erro: String(e && e.message || e).slice(0, 60) }; }
      if (res.parar) { parou = true; S.msg = 'O Cloudflare da Onlog pediu confirmação durante a leitura da situação: clique no quadradinho na página e peça a rodada de novo.'; break; }
      if (res.erro) { S.st_erros++; await espera(3500); continue; }
      if (res.unico) { saida.push({ aa: res.unico.aa, real: res.unico.real, op: res.unico.op, st: res.unico.status, evs: res.unico.evs.slice(-25) }); S.st_lidos++; }
      var achados = {};
      for (var j = 0; j < res.linhas.length; j++) {
        var l = res.linhas[j], k = conhecido[l.aa], it = { aa: l.aa, real: '', op: '', st: l.status, evs: [] };
        achados[l.aa] = 1;
        var precisa = !k || k.m || sem(k.s) !== sem(l.status);
        if (!precisa) it.igual = 1;
        else if (detalhes < 170 && Date.now() - t0 < 15 * 60000) {
          var det = null;
          try { det = await abrirDetalhe(l); } catch (e2) { det = null; }
          if (det) { detalhes++; it.real = det.real; it.op = det.op; it.evs = det.evs.slice(-25); if (det.real) achados[det.real] = 1; }
          await espera(500);
        }
        saida.push(it); S.st_lidos++; S.st_detalhes = detalhes;
      }
      await fecharModal();
      /* consultado pelo AA e não veio na resposta = a Onlog não tem esse objeto */
      lote.forEach(function (a) { if (/^AA\d{10}$/.test(a.c) && !achados[a.c] && !(res.unico && res.unico.aa === a.c)) saida.push({ c: a.c, n: 1 }); });
      S.st_feitos = Math.min(alvos.length, i + LOTE); S.st_resta = alvos.length - S.st_feitos;
      lote.forEach(function (a) { S.st_tentados.push(a.c); });   /* v14: estes já foram consultados nesta rodada */
      if (saida.length >= 40) { ultimaResp = await mandarStatus(saida, !primeiro, false); primeiro = false; saida = []; }
      await espera(3500);   /* sem pressa, como na consulta por CPF */
    }
    if (saida.length || !primeiro || (!parou && !pausou)) {   /* v14: página que não leu nada não manda leitura vazia */
      ultimaResp = await mandarStatus(saida, !primeiro, true);   /* fim: a função processa o que chegou (mesmo se parou no meio) */
      S.st_resultado = (ultimaResp && ultimaResp.processado) || ultimaResp || null;
    }
    return parou ? 'parado' : (pausou ? 'pausa' : 'ok');
  }
  async function mandar(itens, acumular) {
    var r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao: 'codigos_entrada', ticket: ticket, fonte: 'onlog', itens: itens, acumular: acumular }) });
    return r.json();
  }
  (async function () {
    try {
      var rf = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao: 'codigos_fila', ticket: ticket }) });
      var fila = await rf.json();
      if (!fila || !fila.ok) { S.estado = 'erro'; S.msg = (fila && fila.erro) || 'fila'; return; }
      var cpfs = fila.cpfs || [], lote = [], primeiro = CPF_DE === 0, pausa = false;
      var objetosSt = (fila.objetos || []).filter(function (a) { return !PULAR[a.c]; });
      S.total = cpfs.length; S.feitos = Math.min(CPF_DE, cpfs.length); S.st_total = objetosSt.length; S.st_resta = objetosSt.length; S.estado = 'rodando';
      if (FASE !== 'status' && !cpfs.length && primeiro) await mandar([], false);
      for (var i = CPF_DE; FASE !== 'status' && i < cpfs.length; i++) {
        if (S.consultas >= MAX) { pausa = true; break; }   /* v14: limite de consultas desta página */
        var res;
        try { res = await consultar(cpfs[i].cpf, cpfs[i].desde); } catch (e) { res = { erro: String(e && e.message || e).slice(0, 60) }; }
        if (res.parar) { S.estado = 'parado'; S.msg = 'O Cloudflare da Onlog pediu confirmação: clique no quadradinho na página e peça a rodada de novo.'; break; }
        if (res.erro) { S.erros++; lote.push({ cpf: cpfs[i].cpf, erro: res.erro }); }
        else { lote.push({ cpf: cpfs[i].cpf, objetos: res.objetos }); if (res.objetos.length) { S.com_objeto++; S.objetos += res.objetos.length; } }
        S.feitos = i + 1; S.cpf_prox = i + 1;
        if (lote.length >= 5 || i === cpfs.length - 1) { await mandar(lote, !primeiro); primeiro = false; lote = []; }
        await espera(3500);   /* sem pressa: uma consulta de cada vez, como uma pessoa faria */
      }
      if (lote.length) await mandar(lote, !primeiro);
      /* v9: depois dos CPFs, a SITUAÇÃO dos objetos em aberto (só se o Cloudflare não parou a 1ª parte) */
      if (S.estado === 'rodando' && !pausa && FASE !== 'cpf' && objetosSt.length) {
        var rSt = await varrerStatus(objetosSt);
        if (rSt === 'parado') S.estado = 'parado'; else if (rSt === 'pausa') pausa = true;
      }
      if (S.estado === 'rodando') S.estado = pausa ? 'pausa' : 'fim';
    } catch (e) { S.estado = 'erro'; S.msg = String(e && e.message || e).slice(0, 120); }
  })();
  return { ok: true, iniciado: true };
}
function fonteColetor(qual) {
  var f = qual === 'daniel' ? coletorDaniel : (qual === 'onlog' ? coletorOnlog : null);
  return f ? '(' + f.toString() + ')' : '';
}

/* ============================ login (só admin) ============================ */

/* =====================================================================================================================
   v4 (01/10/2026) — CUPOM DE ATRASO NA ENTREGA · PEDIDOS PARADOS (mais de 3 dias úteis no mesmo status)
   ===================================================================================================================== */
var MINHA_CONTA_URL = 'https://vitaflowoficial.com/pages/minha-conta';
var FS_PROJETO = 'pricehub-f0236';
var FS_KEY = process.env.FIRESTORE_KEY || 'AIzaSyBxaI82P6OjCoPtBA-kNZZ0-F0RdjYdNhw';   /* chave web do Firebase — a mesma (pública) que o carrinho do site e a Athena usam pra ler os cupons */
var CUPONS = RAIZ + '/cupons_atraso';

/* ---------- Firestore (coleção cupons_vitaflow — a mesma da Gestão de Cupons, do carrinho e da Athena) ---------- */
function fsUrl(caminho, extra) {
  return 'https://firestore.googleapis.com/v1/projects/' + FS_PROJETO + '/databases/(default)/documents' + caminho + '?key=' + FS_KEY + (extra || '');
}
function fsNum(c) { return c ? Number(c.integerValue != null ? c.integerValue : (c.doubleValue != null ? c.doubleValue : 0)) || 0 : 0; }
function fsCupom(doc) {
  var f = (doc && doc.fields) || {};
  return { codigo: f.codigo ? String(f.codigo.stringValue || '') : '', ativo: f.ativo ? f.ativo.booleanValue !== false : true,
    usos: fsNum(f.usosAtual), valor: fsNum(f.valor), expira: (f.expira && f.expira.timestampValue) ? new Date(f.expira.timestampValue).getTime() : 0 };
}
/* null = não existe · undefined = não deu pra saber (erro de rede) */
async function fsLerCupom(docId) {
  try {
    var r = await fetch(fsUrl('/cupons_vitaflow/' + encodeURIComponent(docId)));
    if (r.status === 404) return null;
    if (!r.ok) return undefined;
    return fsCupom(await r.json());
  } catch (e) { return undefined; }
}
/* true/false · undefined = não deu pra saber */
async function fsCodigoExiste(codigo) {
  try {
    var r = await fetch('https://firestore.googleapis.com/v1/projects/' + FS_PROJETO + '/databases/(default)/documents:runQuery?key=' + FS_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'cupons_vitaflow' }],
        where: { fieldFilter: { field: { fieldPath: 'codigo' }, op: 'EQUAL', value: { stringValue: codigo } } }, limit: 1 } }) });
    if (!r.ok) return undefined;
    var d = await r.json();
    return (d || []).some(function (x) { return x && x.document; });
  } catch (e) { return undefined; }
}
/* cria o cupom no MESMO formato do cupom de boas-vindas da Athena (tipo 'pct' · tipoVal 'unico_prazo' = uso único + validade):
   o carrinho do site e a Athena já entendem, e o Apps Script já soma o uso (usosAtual) quando o pedido é confirmado. */
async function fsCriarCupom(docId, c) {
  var corpo = { fields: {
    codigo: { stringValue: c.codigo }, ativo: { booleanValue: true }, tipo: { stringValue: 'pct' }, valor: { doubleValue: c.pct },
    tipoVal: { stringValue: 'unico_prazo' }, expira: { timestampValue: new Date(c.expira).toISOString() },
    maxUsos: { integerValue: 1 }, usosAtual: { integerValue: 0 }, minPedido: { doubleValue: 0 }, maxDesc: { doubleValue: 0 },
    /* rastreabilidade na Gestão de Cupons (sem dado pessoal: a coleção é lida pelo site) */
    origem: { stringValue: 'atraso-entrega' }, pedido: { stringValue: c.pedido }, criadoEm: { stringValue: new Date(c.criado).toISOString() },
    /* v5: aparece no campo "Descrição" da Gestão de Cupons — motivo + pedido. O NOME do cliente NÃO vai aqui (pedido do Thiago:
       ninguém de fora pode ler; esta coleção é aberta para leitura). O nome aparece na aba Cupons do painel da logística. */
    descricao: { stringValue: c.descricao || ('Atraso na entrega · ' + c.pedido) } } };
  try {
    var r = await fetch(fsUrl('/cupons_vitaflow', '&documentId=' + encodeURIComponent(docId)), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    if (r.status === 409) return { ok: false, existe: true };
    if (!r.ok) return { ok: false, erro: 'Firestore HTTP ' + r.status + ' ' + String(await r.text()).slice(0, 160) };
    return { ok: true };
  } catch (e) { return { ok: false, erro: 'Firestore: ' + e.message }; }
}
var ALFA_CUPOM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   /* sem I, O, 0 e 1 — o cliente digita isso */
function codigoCupomNovo(prefixo) {
  var s = '';
  for (var i = 0; i < 5; i++) s += ALFA_CUPOM.charAt(crypto.randomInt(ALFA_CUPOM.length));
  return prefixo + '-' + s;
}
function cfgCupom(cfgBase) {
  var c = Object.assign({}, EMAIL_CFG_PADRAO, cfgBase || {});
  var pref = String(c.cupom_atraso_prefixo || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'DESCULPA';
  return { modo: c.cupom_atraso_modo === 'ligado' ? 'ligado' : 'desligado',
    pct: Math.min(50, Math.max(1, Number(c.cupom_atraso_pct) || 5)), dias: Math.min(365, Math.max(1, Number(c.cupom_atraso_dias) || 45)),
    prefixo: pref, janela: Math.max(7, Number(c.cupom_atraso_janela_dias) || 60), desde: Number(c.cupom_atraso_desde) || 0,
    max: Math.min(40, Math.max(1, Number(c.cupom_atraso_max_rodada) || 12)) };
}
/* v18: + E (etiqueta avulsa do Frete VitaFlow, Painel de Dados) — envio sem venda: fora do "fora do prazo" (sem cupom de atraso), igual ao reenvio */
function ehReenvio(pedido) { return /^VF-\d{4}-[RE]/i.test(String(pedido || '').trim()); }

/* a MESMA conta da página de rastreio (rastreio-consulta → prazo): a previsão máxima é
   pago + postagem + o maior prazo do estado; depois de postado, 1ª leitura + o maior prazo do estado. */
function prazoMaximo(p, primeira, agora) {
  var faixa = faixaUF(p.uf); if (!faixa || !p.tConf) return null;
  var tPost = primeira || p.tPost || 0, base = tPost || p.tConf, n = faixa[1] + (tPost ? 0 : postDU(p));
  var dias = R.duEntre(base, agora);
  return { n: n, dias: dias, passou: dias > n, ate_ts: R.somaDU(base, n), postado: !!tPost };
}
/* pedidos (por FAMÍLIA = pedido original + pacotes D) que passaram da previsão MÁXIMA de entrega e ainda não chegaram.
   Fora: não pago, cancelado/reembolsado, entregue, com ocorrência (ausente, endereço, fiscalização, extraviado, apreendido —
   nesses a página nem mostra previsão), revendedor (V) e reenvio (R). */
async function foraDoPrazo(base, peds, agora, janelaDias) {
  var cand = peds.filter(function (p) {
    if (p.naoPagou || p.final || p.st === 'ENTREGUE' || p.tEnt || EXCECAO[p.st] || p.extr || p.apre) return false;
    if (!p.tConf || p.tConf < agora - janelaDias * DIA) return false;
    if (ehRevendedor(p.pai || p.pedido) || ehReenvio(p.pedido) || ehReenvio(p.pai)) return false;
    var pm = prazoMaximo(p, 0, agora);
    return !!(pm && pm.passou);
  });
  var evos = await Promise.all(cand.map(function (p) { return R.fbGetOu('vitaflow_sync/rastreio_eventos/' + p.k); }));
  var porFam = {};
  cand.forEach(function (p, i) {
    var evo = evos[i];
    if (evo && evo.cod && p.codigo && String(evo.cod).replace(/\.0$/, '') !== String(p.codigo).replace(/\.0$/, '')) evo = null;
    var pm = prazoMaximo(p, (evo && evo.primeira) ? Number(evo.primeira) || 0 : 0, agora);   /* a 1ª leitura da transportadora manda, igual à página */
    if (!pm || !pm.passou) return;
    var kf = R.histKey(p.pai || p.pedido);
    var item = { kf: kf, pedido: p.pai || p.pedido, linha: p.pedido, nome: p.nome, email: p.email, uf: p.uf, status: p.status,
      ate_ts: pm.ate_ts, previsao_ate: R.ddmm(pm.ate_ts), dias_alem: pm.dias - pm.n, postado: pm.postado };
    var ja = porFam[kf];
    /* 1 por pedido: fica o pacote que estourou primeiro; o e-mail e o nome vêm de preferência da linha do pedido original */
    if (!ja) { porFam[kf] = item; return; }
    if (item.ate_ts < ja.ate_ts) { ja.ate_ts = item.ate_ts; ja.previsao_ate = item.previsao_ate; ja.dias_alem = item.dias_alem; ja.status = item.status; ja.linha = item.linha; ja.postado = item.postado; }
    if (!p.pai) { ja.nome = p.nome || ja.nome; ja.email = p.email || ja.email; ja.uf = p.uf || ja.uf; }
    if (!emailOk(ja.email) && emailOk(p.email)) ja.email = p.email;
  });
  return Object.keys(porFam).map(function (k) { return porFam[k]; }).sort(function (a, b) { return a.ate_ts - b.ate_ts; });
}
function montarEmailCupom(reg, textos) {
  var T = Object.assign({}, EMAIL_PADRAO);
  Object.keys(EMAIL_PADRAO).forEach(function (k) { if (textos && textos[k] && String(textos[k]).trim()) T[k] = String(textos[k]); });
  var v = { NOME: String(reg.nome || '').split(' ')[0] || 'cliente', PEDIDO: reg.pedido, CUPOM: reg.codigo, PCT: reg.pct,
    VALIDADE: ddmmaa(reg.expira), PREVISAO: reg.previsao_ate || '', DIAS: reg.dias_validade || '' };
  return { assunto: preencher(T.email_cupom_assunto, v), texto: preencher(T.email_cupom_texto, v) };
}
function emailPendente(g, agora) { return !!(g && g.codigo && !g.email_ts && !g.oculto_ts && emailOk(g.email) && Number(g.expira) > agora); }   /* v8: excluído não recebe e-mail */
/* v5: manda o e-mail do cupom — SÓ quando alguém aperta o botão no painel. op.pedidos = lista de pedidos, ou op.todos.
   Não manda duas vezes (email_ts), nem cupom usado, apagado ou vencido. Até 15 por chamada (o painel repete se faltar). */
async function cuponsEnviar(op) {
  var agora = op.agora || Date.now();
  var regs = (await fbLerOu(CUPONS)) || {}, textos = (await fbLerOu(RAIZ + '/textos')) || {};
  var quer = {}; (op.pedidos || []).forEach(function (p) { quer[R.histKey(String(p || '').trim())] = 1; });
  var ks = Object.keys(regs).filter(function (k) { return (op.todos || quer[k]) && emailPendente(regs[k], agora); })
    .sort(function (a, b) { return (regs[a].criado || 0) - (regs[b].criado || 0); });
  var out = { ok: true, pendentes: ks.length, enviados: 0, pulados: 0, falhas: 0, erros: [], faltaram: Math.max(0, ks.length - 15) };
  if (!op.todos) Object.keys(quer).forEach(function (k) { if (ks.indexOf(k) < 0) { out.pulados++; if (out.erros.length < 10) out.erros.push((regs[k] ? regs[k].pedido : k) + ': ' + (!regs[k] ? 'sem cupom' : (regs[k].email_ts ? 'e-mail já enviado' : (regs[k].oculto_ts ? 'excluído da lista' : (!emailOk(regs[k].email) ? 'pedido sem e-mail' : 'cupom vencido'))))); } });
  ks = ks.slice(0, 15);
  async function um(k) {
    var g = regs[k], fs = await fsLerCupom(g.doc || ('atraso_' + k));
    if (fs === undefined) { out.falhas++; if (out.erros.length < 10) out.erros.push(g.pedido + ': não consegui consultar o cupom'); return; }
    if (fs === null || fs.ativo === false || fs.usos >= 1) { out.pulados++; if (out.erros.length < 10) out.erros.push(g.pedido + ': cupom ' + (fs === null ? 'apagado' : (fs.usos >= 1 ? 'já usado' : 'desativado')) + ' — e-mail não enviado'); return; }
    var m = montarEmailCupom(g, textos), re = await enviarBrevo(g.email, g.nome, m.assunto, m.texto);
    if (!re.ok) { out.falhas++; if (out.erros.length < 10) out.erros.push(g.pedido + ': ' + re.erro); return; }
    out.enviados++;
    try { await fbReq('PATCH', CUPONS + '/' + k, { email_ts: Date.now(), email_por: txt(op.uid, 40) }); }
    catch (eP) { if (out.erros.length < 10) out.erros.push(g.pedido + ': e-mail enviado, mas não gravou o registro (' + eP.message + ')'); }
  }
  for (var i = 0; i < ks.length; i += 5) await Promise.all(ks.slice(i, i + 5).map(um));
  if (out.falhas) out.ok = out.enviados > 0;
  return out;
}
/* v8: liga/desliga o cupom na coleção cupons_vitaflow (só o campo ativo). true = feito · false = não deu */
async function fsAtivarCupom(docId, ativo) {
  try {
    var r = await fetch(fsUrl('/cupons_vitaflow/' + encodeURIComponent(docId), '&updateMask.fieldPaths=ativo&currentDocument.exists=true'), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { ativo: { booleanValue: !!ativo } } }) });
    return r.ok;
  } catch (e) { return false; }
}
/* v8: EXCLUIR da lista de cupons gerados (ou desfazer). Ver o cabeçalho. Nunca apaga o registro: sem ele a rodada geraria outro cupom. */
async function cuponsExcluir(op) {
  var k = R.histKey(String(op.pedido || '').trim());
  if (!k) return { ok: false, erro: 'diga o pedido' };
  var g = await fbLerOu(CUPONS + '/' + k);
  if (!g || !g.codigo) return { ok: false, erro: 'esse pedido não tem cupom de atraso' };
  var docId = g.doc || ('atraso_' + k), agora = op.agora || Date.now();

  if (op.desfazer) {
    if (!g.oculto_ts) return { ok: false, erro: 'esse cupom não está excluído' };
    var reativou = false;
    if (g.oculto_tipo === 'cancelado') {
      if (!(await fsAtivarCupom(docId, true))) return { ok: false, erro: 'não consegui reativar o cupom (nada foi alterado)' };
      reativou = true;
    }
    await fbReq('PATCH', CUPONS + '/' + k, { oculto_ts: null, oculto_tipo: null, oculto_por: null });
    return { ok: true, pedido: g.pedido, desfeito: true, reativado: reativou };
  }

  if (g.oculto_ts) return { ok: false, erro: 'esse cupom já está excluído' };
  var tipo = 'lista';   /* e-mail já enviado, ou cupom usado/apagado: só sai da lista */
  if (!g.email_ts) {
    var fs = await fsLerCupom(docId);
    if (fs === undefined) return { ok: false, erro: 'não consegui consultar o cupom (nada foi alterado)' };
    if (fs && fs.usos < 1) {
      if (fs.ativo !== false && !(await fsAtivarCupom(docId, false))) return { ok: false, erro: 'não consegui cancelar o cupom (nada foi alterado)' };
      tipo = 'cancelado';
    }
  }
  await fbReq('PATCH', CUPONS + '/' + k, { oculto_ts: agora, oculto_tipo: tipo, oculto_por: txt(op.uid, 40) });
  return { ok: true, pedido: g.pedido, excluido: tipo };
}
function cupomSituacao(reg, fs, agora) {
  if (fs && fs.usos >= 1) return 'usado';
  if (fs && fs.ativo === false) return 'inativo';
  if ((fs && fs.expira ? fs.expira : reg.expira) < agora) return 'vencido';
  return 'disponivel';
}
/* gera os cupons que faltam (modo ligado). v5: NÃO manda e-mail — o cupom já aparece em "Meus cupons" e o e-mail sai
   pelo botão do painel (cuponsEnviar). op.simular = só diz o que faria. */
async function cuponsAtraso(op) {
  var agora = op.agora || Date.now();
  var base = op.base || await lerBase(false);
  var peds = op.peds || montarPedidos(base);
  var cfg = cfgCupom(base.cfg);
  var fora = await foraDoPrazo(base, peds, agora, cfg.janela);
  var regs = (await fbLerOu(CUPONS)) || {};
  var novos = fora.filter(function (c) { return !regs[c.kf] && (!cfg.desde || c.ate_ts >= cfg.desde); });
  var antigos = fora.filter(function (c) { return !regs[c.kf] && cfg.desde && c.ate_ts < cfg.desde; }).length;
  var out = { ok: true, modo: cfg.modo, fora_do_prazo: fora.length, ja_tem_cupom: fora.filter(function (c) { return !!regs[c.kf]; }).length,
    antes_do_inicio: antigos, a_gerar: novos.length, gerados: 0, emails: 0, sem_email: 0, falhas: 0, erros: [],
    email_pendentes: Object.keys(regs).filter(function (k) { return emailPendente(regs[k], agora); }).length,
    lista: novos.map(function (c) { return { pedido: c.pedido, nome: c.nome, uf: c.uf, status: c.status, previsao_ate: c.previsao_ate, dias_alem: c.dias_alem, tem_email: emailOk(c.email) }; }) };
  if (op.simular || cfg.modo !== 'ligado') return out;

  var fila = novos.slice(0, cfg.max);
  function falha(c, msg) { out.falhas++; if (out.erros.length < 10) out.erros.push(c.pedido + ': ' + msg); }
  async function gerarUm(c) {
    var docId = 'atraso_' + c.kf, reg = null;
    var ja = await fsLerCupom(docId);
    if (ja === undefined) return falha(c, 'não consegui consultar os cupons');
    if (ja && ja.codigo) {   /* o cupom já existe (o registro daqui se perdeu): reaproveita, nunca cria dois */
      reg = { codigo: ja.codigo, pct: ja.valor || cfg.pct, expira: ja.expira || (agora + cfg.dias * DIA) };
    } else {
      var codigo = '';
      for (var t = 0; t < 4 && !codigo; t++) { var tent = codigoCupomNovo(cfg.prefixo); if ((await fsCodigoExiste(tent)) === false) codigo = tent; }
      if (!codigo) return falha(c, 'não consegui conferir o código do cupom');
      reg = { codigo: codigo, pct: cfg.pct, expira: agora + cfg.dias * DIA };
      var cr = await fsCriarCupom(docId, { codigo: codigo, pct: cfg.pct, expira: reg.expira, pedido: c.pedido, criado: agora, descricao: 'Atraso na entrega · ' + c.pedido });
      if (!cr.ok) return falha(c, cr.erro || 'o cupom já existia');
    }
    reg.pedido = c.pedido; reg.nome = txt(c.nome, 80); reg.email = emailOk(c.email) ? String(c.email).trim() : ''; reg.uf = c.uf || '';
    reg.criado = agora; reg.previsao_ate = c.previsao_ate; reg.dias_validade = cfg.dias; reg.doc = docId;
    if (!reg.email) reg.sem_email = true;
    try { await fbReq('PUT', CUPONS + '/' + c.kf, reg); }
    catch (eG) { return falha(c, 'cupom criado, mas não gravou o registro (' + eG.message + ')'); }
    out.gerados++;
    if (!reg.email) out.sem_email++;   /* v5: o e-mail NÃO sai aqui — só pelo botão do painel (cuponsEnviar) */
  }
  for (var i = 0; i < fila.length; i += 4) await Promise.all(fila.slice(i, i + 4).map(gerarUm));   /* 4 por vez: cabe no tempo da função */
  out.faltaram = Math.max(0, novos.length - fila.length);
  out.email_pendentes += Math.max(0, out.gerados - out.sem_email);   /* v5: os recém-gerados esperam o botão */
  try { var lg = {}; lg[R.diaBR(agora).replace(/-/g, '') + '_' + agora] = { ts: agora, fora: out.fora_do_prazo, gerados: out.gerados, emails: out.emails, sem_email: out.sem_email, falhas: out.falhas, erros: out.erros.slice(0, 5) };
    await fbReq('PATCH', RAIZ + '/cupons_atraso_log', lg); } catch (eL) { /* log é só registro */ }
  return out;
}
/* lista pro painel: os cupons já gerados, com a situação de cada um (disponível / usado / vencido) */
async function cuponsGerados(agora, max) {
  var regs = (await fbLerOu(CUPONS)) || {};
  var ks = Object.keys(regs).filter(function (k) { return regs[k] && regs[k].codigo; }).sort(function (a, b) { return (regs[b].criado || 0) - (regs[a].criado || 0); }).slice(0, max || 80);
  var fss = await Promise.all(ks.map(function (k) { return fsLerCupom(regs[k].doc || ('atraso_' + k)); }));
  return ks.map(function (k, i) {
    var g = regs[k];
    var sitC = fss[i] === null ? 'apagado' : cupomSituacao(g, fss[i], agora);
    return { pedido: g.pedido, nome: g.nome || '', codigo: g.codigo, pct: g.pct, criado: ddmmaa(g.criado), expira: ddmmaa(g.expira), previsao_ate: g.previsao_ate || '',
      situacao: sitC, email: g.email_ts ? 'enviado' : ((g.sem_email || !emailOk(g.email)) ? 'sem e-mail' : 'pendente'), email_em: g.email_ts ? ddmmaa(g.email_ts) : '',
      pode_enviar: sitC === 'disponivel' && emailPendente(g, agora),
      excluido: g.oculto_ts ? (g.oculto_tipo || 'lista') : '', excluido_em: g.oculto_ts ? ddmmaa(g.oculto_ts) : '' };   /* v8 */
  });
}

/* v5: VISTO — a logística marca o pedido no painel (vitaflow_sync/logistica/vistos/<pedido> = { st, ts, por }) e ele sai da lista
   e do resumo do WhatsApp ATÉ MUDAR DE STATUS (o visto vale só para o status em que foi dado). */
function vistoVale(v, st) { return !!(v && v.st && v.st === st); }

/* ---------- PEDIDOS PARADOS: mais de N dias úteis no MESMO status (menos entregue, cancelado e não pago) ---------- */
var ROTULO_ST = { 'PEDIDO CONFIRMADO': 'Pedido confirmado', 'PAGO': 'Pedido confirmado', 'EM SEPARACAO': 'Em separação', 'DESPACHADO': 'Despachado', 'POSTADO': 'Postado',
  'EM TRANSFERENCIA': 'Em transferência', 'EM SEPARACAO NO CENTRO LOGISTICO': 'No centro logístico', 'CHEGOU A UNIDADE DE DESTINO': 'Chegou à unidade de destino',
  'SAIU PARA ENTREGA': 'Saiu para entrega', 'ENCAMINHADO PARA FISCALIZACAO': 'Encaminhado para fiscalização', 'FISCALIZACAO FINALIZADA': 'Fiscalização finalizada',
  'DESTINATARIO AUSENTE': 'Destinatário ausente', 'ENDERECO INCORRETO': 'Endereço incorreto', 'AREA COM DISTRIBUICAO': 'Área com distribuição especial',
  'PEDIDO EXTRAVIADO': 'Pedido extraviado', 'PEDIDO APREENDIDO': 'Pedido apreendido' };   /* os mesmos nomes do painel */
function nomeStatus(s) { var u = R.semAcentoUp(s); if (ROTULO_ST[u]) return ROTULO_ST[u]; s = String(s || '').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }
function calcularParados(base, peds, agora) {
  var cfg = Object.assign({}, EMAIL_CFG_PADRAO, base.cfg || {});
  var lim = Math.max(1, Number(cfg.parados_dias) || 3), janela = Math.max(7, Number(cfg.parados_janela_dias) || 60);
  var out = [], V = base.vistos || {};
  peds.forEach(function (p) {
    if (p.naoPagou || p.final || !p.st || p.st === 'ENTREGUE') return;
    if (!p.tConf || p.tConf < agora - janela * DIA) return;
    var t = p.tStatus || p.tConf, dias = R.duEntre(t, agora);
    if (dias <= lim) return;
    out.push({ k: p.k, pedido: p.pedido, pacote_de: p.pai || '', nome: p.nome, uf: p.uf, cidade: p.cidade, data: p.data, status: p.status, st: p.st,
      dias: dias, desde: R.ddmm(t), fornecedor: p.forn, transportadora: p.transpTxt, codigo: p.codigo, revendedor: ehRevendedor(p.pai || p.pedido),
      desde_incerto: !p.tStatus, visto: vistoVale(V[p.k], p.st), visto_em: (V[p.k] && V[p.k].ts) ? R.ddmm(V[p.k].ts) : '' });
  });
  out.sort(function (a, b) { return b.dias - a.dias || (a.pedido < b.pedido ? -1 : 1); });
  return out;
}
/* WhatsApp pela Z-API da logística (as mesmas variáveis do bot da logística) */
async function whats(telefone, texto) {
  var inst = process.env.LOG_ZAPI_INSTANCE || '', tok = process.env.LOG_ZAPI_TOKEN || '', cli = process.env.ZAPI_CLIENT_TOKEN || '';
  if (!inst || !tok) return { ok: false, erro: 'faltam LOG_ZAPI_INSTANCE / LOG_ZAPI_TOKEN no Netlify' };
  try {
    var r = await fetch('https://api.z-api.io/instances/' + inst + '/token/' + tok + '/send-text', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Client-Token': cli }, body: JSON.stringify({ phone: telefone, message: texto }) });
    return r.ok ? { ok: true } : { ok: false, erro: 'Z-API HTTP ' + r.status };
  } catch (e) { return { ok: false, erro: 'Z-API: ' + e.message }; }
}
/* v7: quem passou do prazo de postagem, para o resumo das 10h (os mesmos da aba Atrasos, sem os vistos) */
function textoAtrasosPostagem(atr, painelUrl) {
  var nAtk = atr.filter(function (a) { return a.atacado; }).length;
  var L = ['⏰ *Logística — passaram do prazo de postagem* (' + atr.length + ')', 'Varejo (3 dias úteis): ' + (atr.length - nAtk) + ' · Atacado (6 dias úteis): ' + nAtk, '⠀'];
  atr.slice(0, 20).forEach(function (a) {
    L.push('• ' + a.pedido + ((a.atacado && String(a.fornecedor || '').toLowerCase().indexOf('atacado') < 0) ? ' (atacado)' : '') + ' — ' + (a.fornecedor || 'sem fornecedor') + ' — ' + a.dias + ' dias úteis (era até ' + a.postagem_ate + ')');
  });
  if (atr.length > 20) L.push('… e mais ' + (atr.length - 20));
  L.push('⠀'); L.push('A lista por fornecedor, para cobrar, está na aba *Atrasos* do painel' + (painelUrl ? ': ' + painelUrl : '.'));
  return L.join('\n');
}
function textoParados(lista, novos, lim, painelUrl) {
  var L = ['⏱️ *Logística — pedidos parados há mais de ' + lim + ' dias úteis no mesmo status* (' + lista.length + ')', '⠀'];
  if (novos.length) {
    L.push('🆕 *Entraram na lista hoje* (' + novos.length + '):');
    novos.slice(0, 20).forEach(function (a) { L.push('• ' + a.pedido + ' — ' + nomeStatus(a.status) + ' — ' + a.dias + ' dias úteis' + (a.uf ? ' — ' + a.uf : '')); });
    if (novos.length > 20) L.push('… e mais ' + (novos.length - 20));
  } else L.push('Nenhum pedido novo na lista hoje.');
  var porSt = {}, ordem = [];
  lista.forEach(function (a) { var n = nomeStatus(a.status); if (!porSt[n]) { porSt[n] = 0; ordem.push(n); } porSt[n]++; });
  ordem.sort(function (a, b) { return porSt[b] - porSt[a]; });
  L.push('⠀'); L.push('*Por status:*');
  ordem.forEach(function (n) { L.push('• ' + n + ': ' + porSt[n]); });
  L.push('⠀'); L.push('A lista completa está na aba *Parados* do painel' + (painelUrl ? ': ' + painelUrl : '.'));
  return L.join('\n');
}
/* resumo do dia no WhatsApp da logística (o número ana_whatsapp da configuração do bot) */
async function avisoParados(op) {
  var agora = op.agora || Date.now();
  var base = op.base || await lerBase(false);
  var cfg = Object.assign({}, EMAIL_CFG_PADRAO, base.cfg || {});
  var todosP = calcularParados(base, op.peds || montarPedidos(base), agora);
  var lista = todosP.filter(function (a) { return !a.visto; });   /* v5: os vistos ficam fora do resumo */
  /* v7: atrasados na postagem (aba Atrasos), fora os vistos. Falha aqui não derruba o resumo dos parados. */
  var atr = [];
  try { atr = (await calcularAtrasos(base, op.peds || montarPedidos(base), agora)).filter(function (a) { return !a.visto; }); } catch (eA) { atr = []; }
  var out = { ok: true, parados: lista.length, vistos: todosP.length - lista.length, novos: 0, enviado: false, atrasos_postagem: atr.length };
  if (cfg.parados_whatsapp === 'desligado') { out.pulou = 'aviso desligado'; return out; }
  var av = (await fbLerOu(RAIZ + '/parados_avisados')) || {};
  var novos = lista.filter(function (a) { return !(av[a.k] && av[a.k].st === a.st); });
  out.novos = novos.length;
  if (!lista.length && !atr.length) return out;
  var tel = String(cfg.ana_whatsapp || '').replace(/\D/g, '');
  if (!tel) { out.ok = false; out.erro = 'sem o WhatsApp da logística na configuração (ana_whatsapp)'; return out; }
  var partes = [];
  if (atr.length) partes.push(textoAtrasosPostagem(atr, cfg.painel_url || ''));
  if (lista.length) partes.push(textoParados(lista, novos, Math.max(1, Number(cfg.parados_dias) || 3), cfg.painel_url || ''));
  var textoResumo = partes.join('\n⠀\n━━━━━━━━━━\n⠀\n');
  if (op.simular) { out.texto = textoResumo; return out; }
  var r = await whats(tel, textoResumo);
  if (!r.ok) { out.ok = false; out.erro = r.erro; return out; }
  out.enviado = true;
  var mapa = {};
  lista.forEach(function (a) { mapa[a.k] = { st: a.st, ts: (av[a.k] && av[a.k].st === a.st) ? av[a.k].ts : agora }; });
  try { await fbReq('PUT', RAIZ + '/parados_avisados', mapa); } catch (e) { out.erro = 'avisou, mas não gravou a lista (' + e.message + ')'; }
  return out;
}

async function acaoAdminV4(acao, d, uid, agora) {
  if (acao === 'parados') {
    var bP = await lerBase(false), cfgP = Object.assign({}, EMAIL_CFG_PADRAO, bP.cfg || {});
    return resp({ ok: true, parados: calcularParados(bP, montarPedidos(bP), agora), gerado_ts: agora,
      config: { dias: Math.max(1, Number(cfgP.parados_dias) || 3), whatsapp: cfgP.parados_whatsapp === 'desligado' ? 'desligado' : 'ligado' } });
  }
  if (acao === 'cupons') {
    var bC = await lerBase(false);
    var sim = await cuponsAtraso({ agora: agora, base: bC, simular: true });
    var cc = cfgCupom(bC.cfg);
    return resp({ ok: true, gerado_ts: agora, brevo: !!process.env.BREVO_API_KEY, resumo: sim, gerados: await cuponsGerados(agora, 80),
      config: { modo: cc.modo, pct: cc.pct, dias: cc.dias, prefixo: cc.prefixo, desde: cc.desde } });
  }
  if (acao === 'cupons_rodar') return resp(await cuponsAtraso({ agora: agora, simular: d.simular === true }));
  if (acao === 'cupons_enviar') {   /* v5: o e-mail do cupom só sai por aqui (botão do painel) */
    var peds = (d.pedidos instanceof Array) ? d.pedidos.slice(0, 60).map(function (x) { return txt(x, 30); }) : [];
    if (!d.todos && !peds.length) return resp({ ok: false, erro: 'diga o pedido (ou todos)' }, 400);
    return resp(await cuponsEnviar({ agora: agora, uid: uid, todos: d.todos === true, pedidos: peds }));
  }
  if (acao === 'cupons_excluir') {   /* v8 */
    var pedX = txt(d.pedido, 30);
    if (!pedX) return resp({ ok: false, erro: 'diga o pedido' }, 400);
    return resp(await cuponsExcluir({ agora: agora, uid: uid, pedido: pedX, desfazer: d.desfazer === true }));
  }
  if (acao === 'ocorrencias') {   /* v13: o que o Rastreamento sinalizou (ACAO_MANUAL) */
    var bO = await lerBase(false);
    return resp({ ok: true, gerado_ts: agora, ocorrencias: ocorrenciasLista(montarPedidos(bO), await fbLerOu(AM_VISTOS), agora) });
  }
  if (acao === 'ocorrencias_visto') {   /* v13: ✔ Visto — vale enquanto o aviso da planilha for o mesmo */
    var kO = String(d.k || '');
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(kO)) return resp({ ok: false, erro: 'pedido inválido' }, 400);
    _cache.placar = null;
    if (d.desfazer === true) { await fbReq('DELETE', AM_VISTOS + '/' + kO); return resp({ ok: true, k: kO, visto: false }); }
    var pO = montarPedidos(await lerBase(false)).filter(function (p) { return p.k === kO; })[0];
    if (!pO || !pO.am) return resp({ ok: false, erro: 'esse pedido não tem mais aviso (alguém já resolveu no painel de Rastreamento)' });
    await fbReq('PUT', AM_VISTOS + '/' + kO, { am: pO.am.slice(0, 80), ts: agora, uid: uid });
    return resp({ ok: true, k: kO, visto: true });
  }
  if (acao === 'duplicados') {   /* v15: linhas D — o pedido foi dividido em mais de um pacote */
    var bD = await lerBase(false), lD = await Promise.all([fbLerOu(DUP_VISTOS), fbLerOu(RAIZ + '/email_pacotes')]);
    return resp({ ok: true, gerado_ts: agora, janela_dias: DUP_JANELA_DIAS, duplicados: duplicadosLista(montarPedidos(bD), lD[0], lD[1], agora) });
  }
  if (acao === 'duplicados_visto') {   /* v15: ✔ Visto numa linha D — só tira do aviso; não muda nada no pedido */
    var kD = String(d.k || '');
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(kD)) return resp({ ok: false, erro: 'pedido inválido' }, 400);
    _cache.placar = null;
    if (d.desfazer === true) { await fbReq('DELETE', DUP_VISTOS + '/' + kD); return resp({ ok: true, k: kD, visto: false }); }
    var pD = montarPedidos(await lerBase(false)).filter(function (p) { return p.k === kD; })[0];
    if (!pD || !ehLinhaD(pD)) return resp({ ok: false, erro: 'esse pedido não é (mais) um pacote D' });
    await fbReq('PUT', DUP_VISTOS + '/' + kD, { ts: agora, uid: uid });
    return resp({ ok: true, k: kD, visto: true });
  }
  if (acao === 'passadas_resumo') {   /* v13: ver o texto ou mandar agora o resumo das passadas */
    return resp(await avisoPassadas({ agora: agora, simular: d.enviar !== true, forcar: d.enviar === true }));
  }
  if (acao === 'placar') {   /* os contadores do topo do painel (cache de 2 min na instância quente) */
    if (!d.forcar && _cache.placar && agora - _cache.placar.t < 120000) return resp(_cache.placar.v);
    var bL = await lerBase(true), pL = montarPedidos(bL);
    var atrT = await calcularAtrasos(bL, pL, agora), parT = calcularParados(bL, pL, agora);
    var atr = atrT.filter(function (a) { return !a.visto; }), par = parT.filter(function (a) { return !a.visto; });   /* v5: sem os vistos */
    var vL = { ok: true, gerado_ts: agora,
      envio: { total: atr.length, varejo: atr.filter(function (a) { return !a.atacado; }).length, atacado: atr.filter(function (a) { return a.atacado; }).length, maior: atr.length ? atr[0].dias : 0 },
      parados: { total: par.length, maior: par.length ? par[0].dias : 0 }, vistos: { envio: atrT.length - atr.length, parados: parT.length - par.length },
      ocorrencias: { total: ocorrenciasLista(pL, await fbLerOu(AM_VISTOS), agora).filter(function (o) { return !o.visto; }).length },   /* v13 */
      duplicados: { total: duplicadosAbertos(duplicadosLista(pL, await fbLerOu(DUP_VISTOS), null, agora)).length } };   /* v15 */
    _cache.placar = { t: agora, v: vL };
    return resp(vL);
  }
  return null;
}

async function conferirAdmin(token) {
  token = String(token || '');
  var partes = token.split('.');
  if (partes.length !== 3) return null;
  var uid = '';
  try { var pl = JSON.parse(Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); uid = pl.user_id || pl.sub || ''; } catch (e) { return null; }
  if (!uid || !/^[A-Za-z0-9]+$/.test(uid)) return null;
  try {
    var r = await fetch(FB_BASE + '/admins/' + uid + '.json?auth=' + encodeURIComponent(token));
    if (!r.ok) return null;
    return (await r.json()) === true ? uid : null;
  } catch (e) { return null; }
}

/* cache da instância quente (5 min) — os números não mudam a cada clique */
var _cache = {};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  var q = event.queryStringParameters || {};
  if (event.httpMethod === 'GET' && q.coletor) {   /* v3: código do coletor que roda na aba do Daniel / da Onlog (não tem segredo nenhum) */
    var src = fonteColetor(String(q.coletor));
    return { statusCode: src ? 200 : 404, headers: Object.assign({}, CORS, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }), body: src || '// coletor desconhecido' };
  }
  if (event.httpMethod === 'GET' && q.defaults) return resp({ textos: Object.assign({}, EMAIL_PADRAO, R.AVISOS_PADRAO || {}), config: EMAIL_CFG_PADRAO, brevo: !!process.env.BREVO_API_KEY });
  if (event.httpMethod !== 'POST') return resp({ ok: false, erro: 'use POST' }, 405);
  var d = {};
  try { d = JSON.parse(event.body || '{}') || {}; } catch (e) { d = {}; }
  var acao = String(d.acao || ''), agora = Date.now();
  try {
    /* v3: ações que NÃO usam o login de admin */
    if (acao === 'codigos_fila' || acao === 'codigos_entrada') return await acaoComTicket(acao, d, agora);
    if (acao === 'email_pacotes') {
      var chaveOk = !!process.env.COMPRAS_KEY && String(d.chave || '') === process.env.COMPRAS_KEY;
      if (!chaveOk && !(await conferirAdmin(d.token))) return resp({ ok: false, erro: 'sem permissão' }, 401);
      return resp(await emailPacotes(d.pedido, { agora: agora, forcar: d.forcar === true && !chaveOk }));
    }
  } catch (e0) {
    console.error('[logistica-painel] ' + (e0 && e0.message || e0));
    return resp({ ok: false, erro: String(e0 && e0.message || e0) }, 500);
  }
  var uid = await conferirAdmin(d.token);
  if (!uid) return resp({ ok: false, erro: 'sem permissão (faça login de novo)' }, 401);
  try {
    if (acao.indexOf('codigos_') === 0) {
      var rV3 = await acaoAdminV3(acao, d, uid, agora);
      if (rV3) return rV3;
    }
    if (acao === 'parados' || acao === 'cupons' || acao === 'cupons_rodar' || acao === 'cupons_enviar' || acao === 'cupons_excluir' || acao === 'placar' || acao === 'ocorrencias' || acao === 'ocorrencias_visto' || acao === 'duplicados' || acao === 'duplicados_visto' || acao === 'passadas_resumo') {   /* v4 · v5 · v8 */
      var rV4 = await acaoAdminV4(acao, d, uid, agora);
      if (rV4) return rV4;
    }
    if (acao === 'numeros') {
      var dias = [30, 60, 90, 180, 365].indexOf(Number(d.dias)) >= 0 ? Number(d.dias) : 90;
      var ck = 'n' + dias;
      if (!d.forcar && _cache[ck] && agora - _cache[ck].t < 300000) return resp({ ok: true, numeros: _cache[ck].v, cache: true });
      var base = await lerBase(false);
      var v = calcularNumeros(montarPedidos(base), dias, agora);
      _cache[ck] = { t: agora, v: v };
      return resp({ ok: true, numeros: v });
    }
    if (acao === 'postagens' || (acao === 'enviar_teste' && /^postagem_/.test(String(d.tipo || '')))) {   /* v6: e-mail de aviso de postagem */
      var b6 = await lerBase(true), cfg6 = Object.assign({}, EMAIL_CFG_PADRAO, b6.cfg || {});
      var teste6 = String(cfg6.email_postagem_teste || cfg6.email_atraso_teste || '').trim();
      if (acao === 'postagens') {
        var l6 = await calcularPostagens(b6, montarPedidos(b6), agora);
        l6.forEach(function (a) { a.recebe = decidirPostagem(a); });
        return resp({ ok: true, postagens: l6, gerado_ts: agora, brevo: !!process.env.BREVO_API_KEY,
          config: { modo: cfg6.email_postagem_modo || 'desligado', teste: teste6, janela_dias: cfg6.email_postagem_janela_dias } });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(teste6)) return resp({ ok: false, erro: 'Preencha o e-mail de teste e salve.' });
      var m6 = montarEmailPostagem({ nome: 'Cliente Exemplo', pedido: 'VF-0110-S001', tipo: d.tipo === 'postagem_objeto_criado' ? 'objeto_criado' : 'sem_codigo' }, b6.txt);
      var r6 = await enviarBrevo(teste6, '', '[TESTE] ' + m6.assunto, m6.texto, m6.destaque);
      return resp(r6.ok ? { ok: true, enviado_para: teste6, pedido_exemplo: 'VF-0110-S001' } : { ok: false, erro: r6.erro });
    }
    if (acao === 'atrasos' || acao === 'enviar_teste') {
      var b2 = await lerBase(true);
      var lista = await calcularAtrasos(b2, montarPedidos(b2), agora);
      var cfg = Object.assign({}, EMAIL_CFG_PADRAO, b2.cfg || {});
      if (acao === 'atrasos') {
        lista.forEach(function (a) { a.recebe_hoje = null; });   /* v6: o e-mail de atraso não existe mais (virou o e-mail de aviso de postagem — acao 'postagens') */
        return resp({ ok: true, atrasos: lista, gerado_ts: agora, brevo: !!process.env.BREVO_API_KEY,
          config: { modo: cfg.email_atraso_modo, teste: cfg.email_atraso_teste || '', max: cfg.email_atraso_max, intervalo_du: cfg.email_atraso_intervalo_du, janela_dias: cfg.email_atraso_janela_dias } });
      }
      var para = String(cfg.email_atraso_teste || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(para)) return resp({ ok: false, erro: 'Preencha o e-mail de teste na aba Atrasos e salve.' });
      /* exemplo = o 1º atrasado que tem e-mail (senão, um pedido fictício) */
      var ex = lista.filter(function (a) { return !ehRevendedor(a.pedido_email || a.pedido) && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(a.email || '')); })[0] ||
        { nome: 'Cliente Exemplo', pedido: 'VF-0110-S001', data: '01/10/2026', dias: 5, prazo_postagem: 3 };
      if (d.tipo === 'pacotes') {   /* v3: exemplo do e-mail "seu pedido vai em N pacotes" */
        var mp = montarEmailPacotes({ nome: 'Cliente Exemplo', pedido: 'VF-0110-S001', pacotes: [
          { origem: 'SP', itens: ['2x Produto A', '1x Produto B'] }, { origem: 'MS', itens: ['1x Produto C'] }] }, b2.txt);
        var rp = await enviarBrevo(para, '', '[TESTE] ' + mp.assunto, mp.texto);
        return resp(rp.ok ? { ok: true, enviado_para: para, pedido_exemplo: 'VF-0110-S001' } : { ok: false, erro: rp.erro });
      }
      if (d.tipo === 'cupom') {   /* v4: exemplo do e-mail do cupom de atraso (não cria cupom nenhum) */
        var cq = cfgCupom(b2.cfg);
        var mq = montarEmailCupom({ nome: 'Cliente Exemplo', pedido: 'VF-0110-S001', codigo: cq.prefixo + '-TESTE', pct: cq.pct, expira: agora + cq.dias * DIA,
          previsao_ate: R.ddmm(agora - 2 * DIA), dias_validade: cq.dias }, b2.txt);
        var rq = await enviarBrevo(para, '', '[TESTE] ' + mq.assunto, mq.texto);
        return resp(rq.ok ? { ok: true, enviado_para: para, pedido_exemplo: 'VF-0110-S001' } : { ok: false, erro: rq.erro });
      }
      var tipo = d.tipo === 'lembrete' ? 'lembrete' : 'primeiro';
      var m = montarEmail(ex, tipo, b2.txt);
      var r = await enviarBrevo(para, '', '[TESTE] ' + m.assunto, m.texto);
      return resp(r.ok ? { ok: true, enviado_para: para, pedido_exemplo: ex.pedido } : { ok: false, erro: r.erro });
    }
    return resp({ ok: false, erro: 'acao desconhecida' }, 400);
  } catch (e) {
    console.error('[logistica-painel] ' + (e && e.message || e));
    return resp({ ok: false, erro: String(e && e.message || e) }, 500);
  }
};

/* usado pela logistica-atrasos.js (agendada) e pelos testes */
exports.lib = { duplicadosLista: duplicadosLista, duplicadosAbertos: duplicadosAbertos, ehLinhaD: ehLinhaD, ocorrenciasLista: ocorrenciasLista, acaoManualInfo: acaoManualInfo, avisoPassadas: avisoPassadas, textoPassadas: textoPassadas, passadasLista: passadasLista, semConsultaLista: semConsultaLista, textoSemConsulta: textoSemConsulta, avisoSemConsulta: avisoSemConsulta, lerBase: lerBase, montarPedidos: montarPedidos, calcularNumeros: calcularNumeros, calcularAtrasos: calcularAtrasos,
  decidirEnvio: decidirEnvio, ehRevendedor: ehRevendedor, montarEmail: montarEmail, enviarBrevo: enviarBrevo, htmlEmail: htmlEmail, conferirAdmin: conferirAdmin,
  EMAIL_PADRAO: EMAIL_PADRAO, EMAIL_CFG_PADRAO: EMAIL_CFG_PADRAO, transpNome: transpNome, fornNome: fornNome, RAIZ: RAIZ,
  /* v3 */
  casarCodigos: casarCodigos, parear: parear, pendentesCodigo: pendentesCodigo, filaOnlog: filaOnlog, rodadaCodigos: rodadaCodigos,
  emailPacotes: emailPacotes, enviarPacotesPendentes: enviarPacotesPendentes, montarEmailPacotes: montarEmailPacotes, lerPacotes: lerPacotes,
  itensDoPacote: itensDoPacote, transpPorFormato: transpPorFormato, transpOnlog: transpOnlog, familia: familia, limparEntrada: limparEntrada,
  limparCod: limparCod, codigoValido: codigoValido, novoTicket: novoTicket, conferirTicket: conferirTicket, fonteColetor: fonteColetor,
  /* v4 */
  cuponsAtraso: cuponsAtraso, foraDoPrazo: foraDoPrazo, prazoMaximo: prazoMaximo, montarEmailCupom: montarEmailCupom, cuponsGerados: cuponsGerados,
  cupomSituacao: cupomSituacao, cfgCupom: cfgCupom, calcularParados: calcularParados, avisoParados: avisoParados, textoParados: textoParados,
  codigoCupomNovo: codigoCupomNovo, fsLerCupom: fsLerCupom, cuponsEnviar: cuponsEnviar, vistoVale: vistoVale /* v5 */, textoAtrasosPostagem: textoAtrasosPostagem /* v7 */,
  calcularPostagens: calcularPostagens, decidirPostagem: decidirPostagem, montarEmailPostagem: montarEmailPostagem, frasesAviso: frasesAviso /* v6 */,
  /* v9 */ onlogSituacao: onlogSituacao, objetosOnlog: objetosOnlog, onlogRegistro: onlogRegistro, onlogMontar: onlogMontar, onlogAlertas: onlogAlertas,
  onlogStatusProcessar: onlogStatusProcessar, coletorOnlog: coletorOnlog, /* v10 */ avisoOnlog: avisoOnlog, textoAvisosOnlog: textoAvisosOnlog };
