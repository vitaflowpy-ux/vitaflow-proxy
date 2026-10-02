'use strict';
/* =============================================================================
   rastreio-consulta.js — CONSULTA DE RASTREIO SEM APPS SCRIPT (VitaFlow)  ·  v7  ·  02/10/2026
   Netlify Function no repo vitaflow-proxy → netlify/functions/rastreio-consulta.js
   URL: https://vitaflow-proxy.netlify.app/.netlify/functions/rastreio-consulta

   v7 (02/10/2026 — regra do Thiago: "os textos de acordo com o STATUS do pedido; quem marca Postado é a logística"):
     · aviso 'sem_codigo' / 'objeto_criado' (textos 1 e 2 do Thiago) = pedido com o status POSTADO na planilha (colocado pela
       logística) e AINDA SEM leitura da transportadora: sem código na planilha → texto 1; com código → texto 2. Vale para
       varejo e atacado, na hora em que o status vira Postado (não espera mais o prazo de postagem).
     · pedido que ainda NÃO está como Postado não recebe esses dois textos (antes recebia sozinho depois do prazo de postagem,
       mesmo com o status em "em separação" — o texto dizia uma coisa e o status/mapa outra).
     · aviso 'atacado' = atacado ainda não postado, depois do prazo de postagem (6 dias úteis) — igual à v6.
     · aviso 'transferencia' (visto da logística), prazo_total e nota_prazo = v6. Os TEXTOS não mudaram uma palavra.
     A página v9 mostra etapa/mapa de "Postado" sempre que o status é Postado.
   v6 (01/10/2026 — pedidos do Thiago): cada pedido ganha 3 campos novos para a página de rastreio v7:
     · prazo_total { dias, max, pct, ate, passou } — a BARRA ÚNICA: do pagamento até a previsão MÁXIMA de entrega
       (a mesma conta do cupom de atraso da logistica-painel).
     · aviso { tipo, texto } — aviso ao cliente:
         'sem_codigo'    = passou do prazo de POSTAGEM (3 dias úteis; 6 no atacado), sem leitura da transportadora e SEM
                           código na planilha;
         'objeto_criado' = idem, mas a planilha JÁ tem código (só o objeto criado, a transportadora ainda não leu);
         'atacado'       = pedido de ATACADO que passou do prazo de postagem (6 dias úteis) sem leitura — texto próprio;
         'transferencia' = pedido em trânsito que a logística marcou com o VISTO no painel (lista Parados).
       Entrega por MOTOBOY não recebe aviso. Os textos são os do Thiago (01/10) e podem ser editados na aba Textos do
       painel da logística (vitaflow_sync/logistica/textos/rastreio_aviso_*).
     · nota_prazo { tipo, texto } — com o cupom de atraso LIGADO: 'promessa' (se passar do prazo máximo, o cliente
       ganha um cupom) e, depois que passou E o cupom já foi gerado, 'cupom' (está em Meus cupons — o código NÃO sai
       aqui: a página abre só com o número do pedido). Revendedor (V) e reenvio (R) não têm nota.
     O GAS (reserva) não devolve esses campos: sem eles a página v7 mostra a barra antiga e nenhum aviso.
     LÊ a mais: vitaflow_sync/logistica/{config,textos} (cache de 3 min) · vistos/<pedido> · cupons_atraso/<pedido>.
   v5 (01/10/2026): ORIGEM NOVA 'CP' = Campinas/SP. A fornecedora VITAFLOW devolve 'CP' (antes 'SP', que no mapa é a
   rota da capital). A coluna ORIGEM da planilha também aceita CP. Quem lê a origem: página de rastreio v6 (rota de
   Campinas), bot da logística v7 e logistica-painel v4 (nome 'Campinas/SP'). Igual ao GAS v54.
   v4 (01/10/2026): COLUNA ORIGEM + LINHA D (pacote). A coluna nova ORIGEM da planilha (MS/SP/RJ/PY — gravada pela rodada
   de códigos, a partir do site do Daniel, ou à mão), quando preenchida, MANDA na origem do mapa. A linha D criada pelo
   Compras traz PEDIDO_ORIGINAL: a regra do produto do Daniel lê o vitaflow_compras do pedido original. Igual ao GAS v53.
   A busca pelo NÚMERO do pedido devolve também os PACOTES dele (linhas D com PEDIDO_ORIGINAL = o número).
   ORIGEM da fornecedora VITAFLOW: SP (Campinas) — antes RJ. Nunca sai nada do RJ (Thiago, 01/10).
   v3 (01/10/2026): PRAZOS NOVOS — tabela por ESTADO aprovada em 29/09 (PRAZOS_ENTREGA.estados), postagem varejo 3 dias
   úteis e atacado 6. A MESMA tabela está no GAS v52 (o consultar_status de reserva). O resto do código = v2.
   v2 (01/10/2026): CALCULA A RESPOSTA AQUI, lendo o Firebase direto. Na v1 ela só entregava a resposta
   que o GAS v50 deixava pronta (vitaflow_rastreio_pub). Esse pré-cálculo, feito no Apps Script, gastava
   4-6 chamadas UrlFetch POR PEDIDO e estourou a cota diária do Google na madrugada de 01/10 (00:08-00:19).
   E a consulta de reserva no GAS leva ~10 s — a Athena (8 s) e o bot da logística (5 s) desistem antes.
   Esta função é a CÓPIA FIEL, em Node, do consultar_status do GAS v50:
     busca (índice → espelho inteiro) · _rastBaseDaLinha · _rastCompletar · _rastreioEnriquecer · _origemEnvio
     _origemDaniel · _cidadeDoEndereco · _linkRastreioPub · PRAZOS_ENTREGA · dias úteis/feriados
     (testada lado a lado com o código do GAS v50 rodando em Node, com os mesmos dados: resposta idêntica).
   ⚠️ PRAZOS_ENTREGA mora AQUI e no GAS (que fica de reserva). Mudou a tabela de prazos → mudar nos dois.
   Diferenças em relação ao GAS (de propósito):
     - cidade de destino SEM coordenada em vitaflow_sync/geo_cidades fica sem o ponto no mapa (a página mostra
       o estado). O GAS geocodificava cidade nova; aqui só lê o que já está salvo.
     - lista em ordem de data (mais antigo primeiro), como a v1 — o GAS devolvia na ordem das chaves.
     - sem o espelho no Firebase (erro/ausente) devolve usar_gas — o GAS caía na planilha.

   LÊ (Firebase): vitaflow_idx_cpf · vitaflow_idx_email · vitaflow_pedidos_hdr · vitaflow_pedidos(/<k>)
     vitaflow_historico_status/<k> · vitaflow_sync/rastreio_eventos/<k> · vitaflow_compras/<k>
     vitaflow_cache_daniel/{rastreios,tabela} · vitaflow_sync/vinculos_v2/<vfId> · vitaflow_sync/geo_cidades
   NÃO GRAVA NADA.

   CHAMADA (mesmo corpo do GAS): POST { action:'consultar_status', termo:'VF-2909-M051' | CPF | e-mail }
   RESPOSTA: igual à do GAS → { success:true, encontrados, pedidos:[...], fonte:'netlify-indice'|'netlify-espelho' }
     { success:false, usar_gas:true, motivo } só quando o Firebase não respondeu — aí quem chamou
     (página, Athena, bot da logística) tenta o GAS como antes.
   Busca (igual ao GAS): e-mail → vitaflow_idx_email · CPF (11 dígitos) → vitaflow_idx_cpf · o resto → número
   exato no espelho. Não achou no índice (ou mais de 60) → varre o espelho inteiro (número também por pedaço,
   com 2+ caracteres). Por CPF/e-mail só volta pedido PAGO; pelo número, sempre.

   Variável de ambiente: FIREBASE_SECRET (já existe no site).
   ============================================================================= */

var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var FB_SECRET = process.env.FIREBASE_SECRET || '';
var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};
var MAX_PEDIDOS = 60;   /* mesmo teto do índice no GAS */

function resp(obj) { return { statusCode: 200, headers: CORS, body: JSON.stringify(obj) }; }
function usarGas(motivo) { return resp({ success: false, usar_gas: true, motivo: motivo }); }

function fbUrl(caminho, query) {
  var u = FB_BASE + '/' + caminho + '.json' + (FB_SECRET ? '?auth=' + encodeURIComponent(FB_SECRET) : '');
  if (query) u += (u.indexOf('?') >= 0 ? '&' : '?') + query;
  return u;
}
/* Firebase GET. Erro de rede/HTTP → lança (quem chama decide); ausente → null */
async function fbGet(caminho, query) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, 6000);
  try {
    var r = await fetch(fbUrl(caminho, typeof query === 'string' ? query : ''), { signal: ctrl.signal });
    if (!r.ok) throw new Error('firebase ' + r.status + ' ' + caminho);
    return await r.json();
  } finally { clearTimeout(t); }
}
/* mesmo, mas erro vira null (dados acessórios: histórico, eventos, compras, cidade) */
async function fbGetOu(caminho, query) { try { return await fbGet(caminho, query); } catch (e) { return null; } }

/* cache em memória da função (instância quente) — tabelas do Daniel, como o CacheService do GAS */
var _mem = {};
async function fbGetCache(caminho, segs) {
  var c = _mem[caminho];
  if (c && Date.now() - c.t < segs * 1000) return c.v;
  var v = await fbGetOu(caminho);
  _mem[caminho] = { t: Date.now(), v: v };
  return v;
}

/* ---- v6: avisos da página de rastreio (textos do Thiago, 01/10; editáveis no painel da logística → aba Textos) ---- */
var LOG_RAIZ = 'vitaflow_sync/logistica';
var AVISOS_PADRAO = {
  rastreio_aviso_sem_codigo:
    '🎉 Boas notícias: seu pedido já foi despachado com sucesso e está a caminho! 📦🚚💨 Devido ao limite diário de processamento do sistema da transportadora, o código de rastreamento ainda não está disponível. ⏳ Fique tranquilo, assim que o sistema atualizar, o seu código aparecerá aqui! 📲✨',
  rastreio_aviso_objeto_criado:
    'Seu pedido já foi despachado e encontra-se em trânsito! 🚚\nDevido a um atraso na atualização dos dados por parte da transportadora, o status detalhado ainda não foi alterado. Fique tranquilo: assim que a encomenda for processada no próximo ponto de checagem, as informações serão atualizadas automaticamente aqui.',
  rastreio_aviso_atacado:
    'Acompanhamento Logístico - Atacado 📦\n\nPara garantir o transporte 100% seguro da sua mercadoria, a postagem do seu pedido será realizada assim que for concluída a fiscalização no trajeto de entrada do país. Aguardamos a liberação total da rota para efetuar o envio com máxima segurança. Agradecemos a compreensão e informamos que a postagem ocorrerá logo em seguida.',
  rastreio_aviso_transferencia:
    'Seu pedido está a caminho e sendo monitorado! 📦 Notamos que seu pacote está nesta etapa há um pouco mais de tempo que o habitual. Fique tranquilo: nossa equipe de logística já abriu um chamado junto à transportadora e está acompanhando a entrega de perto para garantir a sua segurança.',
  rastreio_aviso_prazo:
    'Sua satisfação é nossa prioridade! ⏱️\nAcompanhamos cada etapa da sua entrega de perto. Mas fique tranquilo: se o seu pedido extrapolar o prazo máximo informado, enviaremos automaticamente um cupom de desconto para você 🎁. Queremos garantir que você sempre tenha a melhor experiência conosco!',
  rastreio_aviso_cupom:
    'Seu pedido passou do prazo máximo informado. Para compensar a espera, você ganhou um cupom de {PCT}% de desconto 🎁\nEle está na sua conta, em vitaflowoficial.com/pages/minha-conta (área "Meus cupons").'
};
async function _logistica() {
  var lidos = await Promise.all([fbGetCache(LOG_RAIZ + '/config', 180), fbGetCache(LOG_RAIZ + '/textos', 180)]);
  var T = {}, b = lidos[1];
  Object.keys(AVISOS_PADRAO).forEach(function (k) { T[k] = (b && typeof b[k] === 'string' && b[k].trim()) ? b[k] : AVISOS_PADRAO[k]; });
  return { cfg: (lidos[0] && typeof lidos[0] === 'object') ? lidos[0] : {}, txt: T };
}

/* ============================ helpers iguais ao GAS ============================ */
function _histKey(pedido) { return String(pedido || '').replace(/[.#$\[\]\/]/g, '_'); }
function _soDig(s) { return String(s || '').replace(/\D/g, ''); }
function _norm(s) { return String(s || '').toLowerCase().trim(); }
function _normPed(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function _cpf11(v) { var d = String(v == null ? '' : v).replace(/\D/g, ''); if (d.length === 10) return '0' + d; return d; }
function _semAcentoUp(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim(); }

function _rastNaoPagou(st, obsAband) {
  var s = String(st || '').toUpperCase();
  if (s.indexOf('AGUARDANDO PAGAMENTO') !== -1) return true;
  if (String(obsAband || '').toUpperCase().indexOf('AVISO_ABANDONO') !== -1) return true;
  return false;
}

function _linkRastreioPub(transportadora) {
  var t = String(transportadora || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  if (!t) return '';
  if (t.indexOf('CORREIO') >= 0 || t.indexOf('PAC') >= 0 || t.indexOf('SEDEX') >= 0) return 'https://rastreamento.correios.com.br/app/index.php';
  if (t.indexOf('JADLOG') >= 0) return 'https://www.jadlog.com.br/tracking';
  if (t.indexOf('J&T') >= 0 || t.indexOf('JT') >= 0 || t.indexOf('J T') >= 0) return 'https://www.jtexpress.com.br/trajectoryQuery';
  if (t.indexOf('LOGGI') >= 0) return 'https://www.loggi.com/rastreador/';
  if (t.indexOf('TOTAL') >= 0) return 'https://www.totalexpress.com.br/';
  if (t.indexOf('SHOPEE') >= 0 || t.indexOf('SPX') >= 0) return 'https://shopeexpress.com.br/rastreamento';
  return '';
}

function _cidadeDoEndereco(end, ufPref) {
  var s = String(end || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  var re = /([A-Za-zÀ-ÿ'´`. ]{2,40}?)\s*(?:-|\/|,|–|\()\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/gi;
  var m, ult = null;
  while ((m = re.exec(s)) !== null) { ult = m; }
  if (!ult) return '';
  var c = String(ult[1]).replace(/^.*,\s*/, '').trim();
  if (c.length < 3 || /^\d/.test(c)) return '';
  if (c === c.toUpperCase() || c === c.toLowerCase()) {
    c = c.toLowerCase().replace(/(^|\s)(\S)/g, function (a, esp, l) { return esp + l.toUpperCase(); })
         .replace(/ (Da|De|Do|Das|Dos|E) /g, function (a) { return a.toLowerCase(); });
  }
  return c;
}
function _geoSlug(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
/* só o que já está salvo (o GAS geocodificava cidade nova — aqui não) */
async function _geoCidade(cidade, uf) {
  uf = String(uf || '').toUpperCase(); var slug = _geoSlug(cidade);
  if (!slug || !uf) return null;
  var fb = await fbGetCache('vitaflow_sync/geo_cidades/' + uf + '/' + slug, 21600);
  return (fb && fb.lat != null) ? fb : null;
}

/* ---- datas no fuso de São Paulo (Utilities.formatDate do GAS) ---- */
var _fmtCache = {};
function _partes(ts) {
  var f = _fmtCache.p || (_fmtCache.p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }));
  var o = {};
  f.formatToParts(new Date(ts)).forEach(function (x) { o[x.type] = x.value; });
  return o;
}
var _DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
function _diaBR(ts) { var p = _partes(ts); return p.year + '-' + p.month + '-' + p.day; }
var _FERIADOS_BR = { '2026-01-01':1,'2026-04-03':1,'2026-04-21':1,'2026-05-01':1,'2026-09-07':1,'2026-10-12':1,'2026-11-02':1,
  '2026-11-15':1,'2026-11-20':1,'2026-12-25':1,'2027-01-01':1,'2027-03-26':1,'2027-04-21':1,'2027-05-01':1,'2027-09-07':1,
  '2027-10-12':1,'2027-11-02':1,'2027-11-15':1,'2027-11-20':1,'2027-12-25':1 };
function _diaUtilBR(ts) { var p = _partes(ts); var dow = _DOW[p.weekday]; return dow <= 5 && !_FERIADOS_BR[p.year + '-' + p.month + '-' + p.day]; }
function _duEntre(a, b) {
  if (!a || !b || b <= a) return 0;
  var n = 0, d = a, fimDia = _diaBR(b), guarda = 0;
  while (_diaBR(d) < fimDia && guarda < 400) { d += 86400000; guarda++; if (_diaUtilBR(d)) n++; }
  return n;
}
function _somaDU(a, n) {
  var d = a, c = 0, guarda = 0;
  while (c < n && guarda < 400) { d += 86400000; guarda++; if (_diaUtilBR(d)) c++; }
  return d;
}
function _ddmm(ts) { if (!ts) return ''; var p = _partes(ts); return p.day + '/' + p.month; }

/* ---- prazos (CÓPIA do PRAZOS_ENTREGA do GAS v50 — mudar nos dois) ---- */
var PRAZOS_ENTREGA = {
  varejo_postagem_du: 3,
  atacado_postagem_du: 6,
  /* Sudeste e Sul não são usados: todos os estados deles têm prazo próprio em 'estados' */
  regioes: { 'Sudeste': [2, 6], 'Sul': [3, 7], 'Centro-Oeste': [4, 8], 'Nordeste': [5, 11], 'Norte': [7, 11] },
  estados: { SP: [1, 6], RJ: [1, 6], MG: [2, 6], ES: [2, 8], DF: [3, 6], PR: [2, 6], SC: [2, 7], RS: [2, 5], GO: [2, 6], BA: [3, 10], MT: [4, 9] }
};
var _UF_REGIAO = { SP:'Sudeste', RJ:'Sudeste', MG:'Sudeste', ES:'Sudeste', PR:'Sul', SC:'Sul', RS:'Sul',
  DF:'Centro-Oeste', GO:'Centro-Oeste', MT:'Centro-Oeste', MS:'Centro-Oeste', BA:'Nordeste', SE:'Nordeste', AL:'Nordeste',
  PE:'Nordeste', PB:'Nordeste', RN:'Nordeste', CE:'Nordeste', PI:'Nordeste', MA:'Nordeste', PA:'Norte', AP:'Norte',
  AM:'Norte', RR:'Norte', RO:'Norte', AC:'Norte', TO:'Norte' };
var _ETAPA_ORDEM = { 'AGUARDANDO PAGAMENTO':0, 'PEDIDO CONFIRMADO':1, 'PAGO':1, 'EM SEPARACAO':2, 'DESPACHADO':3, 'POSTADO':4,
  'EM TRANSFERENCIA':5, 'EM SEPARACAO NO CENTRO LOGISTICO':5, 'CHEGOU A UNIDADE DE DESTINO':6, 'SAIU PARA ENTREGA':7, 'ENTREGUE':8 };

/* ---- origem ---- */
function _origemEnvio(pedido, fornTxt) {
  var ped = String(pedido || '').toUpperCase(), f = _semAcentoUp(fornTxt);
  if (/VF-\d{4}-W/.test(ped) || f.indexOf('CAMILA') >= 0) return 'PY';
  if (f.indexOf('DANIEL') >= 0) {
    var trechoD = f.split('DANIEL')[1] || '';
    trechoD = trechoD.split(/ \| |\n/)[0];
    if (/\bMS\b/.test(trechoD)) return 'MS';
    if (/\bSP\b/.test(trechoD)) return 'SP';
    return 'DANIEL';
  }
  if (f && f.replace(/[^A-Z]/g, '').indexOf('VITAFLOW') === 0) return 'CP';   /* v5: fornecedora VitaFlow sai de Campinas/SP — nunca do RJ (Thiago, 01/10) */
  return 'SP';
}
function _danNomeCompatGAS(a, b) {
  a = _semAcentoUp(a).replace(/\s+/g, ' '); b = _semAcentoUp(b).replace(/\s+/g, ' ');
  if (!a || !b) return false;
  if (a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0) return true;
  var pa = a.split(' '), pb = b.split(' ');
  return pa.length >= 2 && pb.length >= 2 && pa[0] === pb[0] && pa[1] === pb[1];
}
var _DAN_STOP = { DE:1, DA:1, DO:1, E:1, COM:1, MG:1, ML:1, PO:1, A:1, O:1, PARA:1, LIOFILIZADO:1, AGUA:1, BAC:1, AMPOLA:1, AMPOLAS:1, UNICA:1, SOLTA:1, DILUIDA:1, X:1, MS:1, SP:1 };
function _danTok(s) {
  return _semAcentoUp(s).replace(/RETATRUTIDA/g, 'RETATRUTIDE').replace(/[^A-Z0-9]+/g, ' ').trim().split(' ')
    .filter(function (w) { return w && !_DAN_STOP[w]; });
}
function _danLinhaTabela(nome, tabela) {
  var a = _danTok(nome); if (!a.length) return null;
  var melhor = null, nota = 0;
  for (var i = 0; i < tabela.length; i++) {
    var t = tabela[i]; if (!t || !t.produto) continue;
    var b = _danTok(t.produto), inter = 0;
    for (var j = 0; j < a.length; j++) if (b.indexOf(a[j]) >= 0) inter++;
    var s = inter / a.length, sc = s * 0.7 + (inter / Math.max(b.length, 1)) * 0.3;
    if (s >= 0.75 && sc > nota) { nota = sc; melhor = t; }
  }
  return melhor;
}
function _temPreco(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }
async function _origemDaniel(pedido, nome, codigo, comp) {
  try {
    var rast = await fbGetCache('vitaflow_cache_daniel/rastreios', 600) || [];
    if (!(rast instanceof Array)) rast = [];   /* = GAS: objeto não tem .length, o laço não roda */
    var cod = String(codigo || '').replace(/\.0$/, '').trim().toUpperCase(), achou = null, i;
    if (cod) for (i = 0; i < rast.length; i++) { if (rast[i] && String(rast[i].rastreio || '').trim().toUpperCase() === cod) { achou = rast[i]; break; } }
    if (!achou && nome) for (i = rast.length - 1; i >= 0; i--) { if (rast[i] && _danNomeCompatGAS(rast[i].nome, nome)) { achou = rast[i]; break; } }
    if (achou) { var o = _semAcentoUp(achou.origem); if (o === 'MS' || o === 'SP') return o; }
    var itens = ((comp && comp.itens) || []).filter(function (it) { return it && _semAcentoUp(it.fornecedor).indexOf('DANIEL') >= 0; });
    if (!itens.length) return 'MS';
    var vincs = await Promise.all(itens.map(function (it) { return fbGetOu('vitaflow_sync/vinculos_v2/' + encodeURIComponent(String(it.vfId || 'x'))); }));
    var tabela = await fbGetCache('vitaflow_cache_daniel/tabela', 1800) || [];
    if (!(tabela instanceof Array)) tabela = Object.keys(tabela).map(function (k) { return tabela[k]; });
    var algumMS = false;
    for (i = 0; i < itens.length; i++) {
      var v = vincs[i];
      var fNome = (v && _semAcentoUp(v.fornecedor).indexOf('DANIEL') >= 0 && v.fNome) ? String(v.fNome) : String(itens[i].nome || '');
      if (/\bMS\s*$/i.test(fNome.trim())) { algumMS = true; break; }
      var t = _danLinhaTabela(fNome, tabela);
      if (!t) { algumMS = true; break; }
      if (_temPreco(t.precoMs) && !_temPreco(t.precoSp)) { algumMS = true; break; }
    }
    return algumMS ? 'MS' : 'SP';
  } catch (e) { console.error('[rastreio] _origemDaniel ' + pedido + ': ' + e.message); return 'MS'; }
}

/* ---- montagem (= _rastBaseDaLinha) ---- */
function _rastBaseDaLinha(linhaS, colTranspS, colRastS, colFornS, colExtraS) {
  var statusCel = String(linhaS[5] || '').trim();
  var transpCel = (colTranspS >= 0) ? String(linhaS[colTranspS] || '').trim() : '';
  var rastCel   = (colRastS >= 0) ? String(linhaS[colRastS] || '').trim() : '';
  var _stU = String(statusCel || '').toUpperCase();
  var _emRota = (_stU.indexOf('TRANSFERENCIA') !== -1) ||
                (_stU.indexOf('CHEGOU A UNIDADE') !== -1) ||
                (_stU.indexOf('SAIU PARA ENTREGA') !== -1) || (_stU.indexOf('ENTREGUE') !== -1);
  var rastPub = (_emRota && rastCel && rastCel.toUpperCase().indexOf('AVISO_ABANDONO') === -1)
                  ? rastCel.replace(/\.0$/, '') : '';
  var _dataConf = String(linhaS[7] || '').trim();      /* no espelho a DATA já vem texto (dd/MM/yyyy) */
  var _endUF = String(linhaS[8] || '').toUpperCase();
  var _ufM = _endUF.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/g);
  var _estadoS = (_ufM && _ufM.length) ? _ufM[_ufM.length - 1] : '';
  return { pedido: String(linhaS[0]).trim(), status: statusCel, transportadora: transpCel,
           codigo: rastPub, link_transp: rastPub ? _linkRastreioPub(transpCel) : '',
           data: _dataConf, estado: _estadoS, cidade: _cidadeDoEndereco(linhaS[8], _estadoS),
           nome: String(linhaS[1] || '').trim(), produtos: String(linhaS[4] || '').trim(),
           _forn: (colFornS >= 0) ? String(linhaS[colFornS] || '') : '', _rast: rastCel, _emRota: _emRota,
           /* v4: coluna ORIGEM (manda na origem) e PEDIDO_ORIGINAL (linha D = pacote de outro pedido) */
           _orig: (colExtraS && colExtraS.orig >= 0) ? String(linhaS[colExtraS.orig] || '').trim().toUpperCase() : '',
           _pai: (colExtraS && colExtraS.pai >= 0) ? String(linhaS[colExtraS.pai] || '').trim() : '' };
}

/* ---- = _rastreioEnriquecer (com os dados já lidos: evo e comp) ---- */
async function _rastreioEnriquecer(rr, fornTxt, rastCel, emRota, evo, comp) {
  try {
    if (evo && evo.cod && rastCel && String(evo.cod).replace(/\.0$/, '') !== String(rastCel).replace(/\.0$/, '')) evo = null;
    var eventos = (evo && evo.ev) ? evo.ev : [];
    if (!(eventos instanceof Array)) eventos = Object.keys(eventos).map(function (k) { return eventos[k]; });
    rr.eventos = eventos.map(function (e) { return { d: e.d || '', h: e.h || '', s: e.s || '', c: e.c || '', ts: e.ts || 0 }; });
    rr.primeira_leitura = (evo && evo.primeira) ? evo.primeira : 0;
    rr.etapa_transportadora = (evo && evo.etapa) ? String(evo.etapa) : '';

    if (!rr.codigo && rastCel && rastCel.toUpperCase().indexOf('AVISO_ABANDONO') === -1 && (rr.primeira_leitura || emRota)) {
      rr.codigo = String(rastCel).replace(/\.0$/, '');
      rr.link_transp = _linkRastreioPub(rr.transportadora);
    }

    var stU = _semAcentoUp(rr.status), etU = _semAcentoUp(rr.etapa_transportadora);
    var rs = _ETAPA_ORDEM.hasOwnProperty(stU) ? _ETAPA_ORDEM[stU] : -1;
    var re = _ETAPA_ORDEM.hasOwnProperty(etU) ? _ETAPA_ORDEM[etU] : -1;
    rr.status_exibido = (rs > 0 && re > rs) ? rr.etapa_transportadora : rr.status;
    var exU = _semAcentoUp(rr.status_exibido);
    var ordemEx = _ETAPA_ORDEM.hasOwnProperty(exU) ? _ETAPA_ORDEM[exU] : -1;

    rr.origem = _origemEnvio(rr.pedido, fornTxt);
    if (rr.origem === 'DANIEL') rr.origem = await _origemDaniel(rr._pai || rr.pedido, rr.nome, rastCel, comp);
    if (rr.cidade && rr.estado) {
      var gC = await _geoCidade(rr.cidade, rr.estado);
      if (gC) rr.destino = { cidade: rr.cidade, uf: rr.estado, lat: gC.lat, lon: gC.lon };
    }
    rr.atacado = /VF-\d{4}-W/i.test(String(rr.pedido)) || _semAcentoUp(fornTxt).indexOf('CAMILA') >= 0;
    if (rr.atacado) rr.origem = 'PY';
    if (rr._orig === 'MS' || rr._orig === 'SP' || rr._orig === 'RJ' || rr._orig === 'PY' || rr._orig === 'CP') rr.origem = rr._orig;   /* v4: coluna ORIGEM manda (v5: + CP) */

    var tConf = 0, tPostHist = 0;
    (rr.historico || []).forEach(function (h) {
      var su = _semAcentoUp(h.status);
      if (!tConf && su.indexOf('CONFIRMADO') >= 0 && h.ts) tConf = h.ts;
      if (!tPostHist && (su === 'POSTADO' || su.indexOf('TRANSFER') >= 0) && h.ts) tPostHist = h.ts;
    });
    if (!tConf) { var md = String(rr.data || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (md) tConf = new Date(md[3] + '-' + md[2] + '-' + md[1] + 'T12:00:00-03:00').getTime(); }
    var reg = _UF_REGIAO[rr.estado] || '';
    var faixa = (PRAZOS_ENTREGA.estados && PRAZOS_ENTREGA.estados[rr.estado]) || PRAZOS_ENTREGA.regioes[reg] || null;
    var postDU = rr.atacado ? PRAZOS_ENTREGA.atacado_postagem_du : PRAZOS_ENTREGA.varejo_postagem_du;
    var agora = Date.now(), tPost = rr.primeira_leitura || tPostHist;
    var p = { regiao: reg, postagem_du: postDU, faixa: faixa };
    if (ordemEx === 8) { p.etapa = 'entregue'; }
    else if (ordemEx <= 0) { p.etapa = 'excecao'; }
    else if (!tPost && ordemEx < 4) {
      p.etapa = 'postagem';
      p.dias = tConf ? _duEntre(tConf, agora) : 0;
      p.normal = postDU;
      p.fora = !!tConf && p.dias > postDU;
      if (tConf && faixa) { p.previsao_de = _ddmm(_somaDU(tConf, postDU + faixa[0])); p.previsao_ate = _ddmm(_somaDU(tConf, postDU + faixa[1])); }
    } else {
      p.etapa = 'entrega';
      var base = tPost || tConf, extra = tPost ? 0 : postDU;
      p.dias = base ? _duEntre(base, agora) : 0;
      p.normal = faixa ? faixa[1] + extra : 0;
      p.fora = !!(faixa && base && p.dias > p.normal);
      if (base && faixa) { p.previsao_de = _ddmm(_somaDU(base, faixa[0] + extra)); p.previsao_ate = _ddmm(_somaDU(base, faixa[1] + extra)); }
    }
    rr.prazo = p;

    /* ---- v6: barra única (pagamento → previsão máxima), avisos ao cliente e nota do cupom de atraso ---- */
    try {
      var revend = /^VF-\d{4}-V/i.test(String(rr._pai || rr.pedido)), reenv = /^VF-\d{4}-R/i.test(String(rr.pedido)) || /^VF-\d{4}-R/i.test(String(rr._pai || ''));
      if (ordemEx >= 1 && ordemEx <= 7 && tConf && faixa) {
        var baseT = tPost || tConf, nT = faixa[1] + (tPost ? 0 : postDU), fimT = _somaDU(baseT, nT);
        var maxT = Math.max(1, _duEntre(tConf, fimT)), diasT = _duEntre(tConf, agora);
        rr.prazo_total = { dias: diasT, max: maxT, pct: Math.min(100, Math.round(100 * diasT / maxT)), ate: _ddmm(fimT), passou: _duEntre(baseT, agora) > nT };
      }
      var lg = await _logistica();
      var semLeitura = !rr.primeira_leitura && ordemEx >= 1 && ordemEx <= 4;
      var temCod = !!rastCel && String(rastCel).toUpperCase().indexOf('AVISO_ABANDONO') === -1;
      var motoboy = temCod && String(rastCel).toUpperCase().replace(/\s/g, '') === 'MOTOBOY';
      var tipoAv = '';
      /* v7: os textos 1 e 2 seguem o STATUS — Postado na planilha (quem marca é a logística) e a transportadora ainda não leu */
      if (semLeitura && !motoboy && rs === 4) tipoAv = temCod ? 'objeto_criado' : 'sem_codigo';
      else if (semLeitura && !motoboy && rr.atacado && tConf && _duEntre(tConf, agora) > postDU) tipoAv = 'atacado';   /* atacado ainda não postado: texto próprio (Thiago, 01/10) */
      else if (!semLeitura && ordemEx >= 4 && ordemEx <= 7) {   /* em trânsito: só com o VISTO da logística (e enquanto o status não mudar) */
        var vst = await fbGetOu(LOG_RAIZ + '/vistos/' + _histKey(rr.pedido));
        if (vst && vst.st && vst.st === _semAcentoUp(rr.status)) tipoAv = 'transferencia';
      }
      if (tipoAv) rr.aviso = { tipo: tipoAv, texto: lg.txt['rastreio_aviso_' + tipoAv] };
      if (lg.cfg.cupom_atraso_modo === 'ligado' && !revend && !reenv && rr.prazo_total) {
        if (!rr.prazo_total.passou) rr.nota_prazo = { tipo: 'promessa', texto: lg.txt.rastreio_aviso_prazo };
        else {
          var cg = await fbGetOu(LOG_RAIZ + '/cupons_atraso/' + _histKey(rr._pai || rr.pedido));
          if (cg && cg.codigo) rr.nota_prazo = { tipo: 'cupom', texto: String(lg.txt.rastreio_aviso_cupom).replace(/\{PCT\}/g, String(cg.pct || lg.cfg.cupom_atraso_pct || 5)) };
        }
      }
    } catch (eA) { console.error('[rastreio] avisos ' + rr.pedido + ': ' + eA.message); }
  } catch (eR) { console.error('[rastreio] enriquecer ' + rr.pedido + ': ' + eR.message); }
  return rr;
}

/* ---- = _rastCompletar: histórico + eventos (+ compras se a origem depende do Daniel), em paralelo ---- */
async function _rastCompletar(resultados) {
  await Promise.all(resultados.map(async function (rr) {
    var k = _histKey(rr.pedido);
    var precisaComp = _origemEnvio(rr.pedido, rr._forn) === 'DANIEL';
    var lidos = await Promise.all([
      fbGetOu('vitaflow_historico_status/' + k),
      fbGetOu('vitaflow_sync/rastreio_eventos/' + k),
      precisaComp ? fbGetOu('vitaflow_compras/' + _histKey(rr._pai || rr.pedido)) : Promise.resolve(null)
    ]);
    var objH = lidos[0], hist = [];
    if (objH && typeof objH === 'object') {
      hist = Object.keys(objH).map(function (kk) { return objH[kk]; })
        .filter(function (ev) { return ev && ev.status; })
        .sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); })
        .map(function (ev) { return { status: ev.status, data: ev.data || '', hora: ev.hora || '', ts: ev.ts || 0 }; });
    }
    rr.historico = hist;
    await _rastreioEnriquecer(rr, rr._forn, rr._rast, rr._emRota, lidos[1], lidos[2]);
    delete rr._forn; delete rr._rast; delete rr._emRota; delete rr._orig; delete rr._pai;
  }));
  return resultados;
}

/* ============================ handler ============================ */
/* linhas do espelho [hdr, linha, linha...] pela busca do GAS: índice → espelho inteiro. null = Firebase falhou */
async function _linhasDoEspelho(termoRaw) {
  var tDig = _soDig(termoRaw);
  /* 1) índice (só os pedidos daquele CPF / e-mail / número exato) */
  try {
    var chIdx = null;
    if (termoRaw.indexOf('@') !== -1) chIdx = await fbGet('vitaflow_idx_email/' + _norm(termoRaw).replace(/[.#$\[\]\/]/g, '_'));
    else if (tDig.length === 11) chIdx = await fbGet('vitaflow_idx_cpf/' + tDig);
    else {
      var kPed = _histKey(termoRaw.toUpperCase().replace(/\s+/g, ''));
      var rowP = kPed ? await fbGet('vitaflow_pedidos/' + kPed) : null;
      if (rowP && rowP.length) {
        chIdx = {}; chIdx[kPed] = true;
        /* v4: os PACOTES do pedido (linhas D do mesmo dia com PEDIDO_ORIGINAL = este número) entram junto.
           Aqui só junta as candidatas (célula igual ao número); quem decide é o laço do handler, pela coluna certa. */
        var mDia = String(rowP[0] || '').toUpperCase().match(/^(VF-\d{4}-)/);
        if (mDia) {
          var ds = await fbGetOu('vitaflow_pedidos', 'orderBy=' + encodeURIComponent('"$key"') + '&startAt=' + encodeURIComponent('"' + mDia[1] + 'D"') + '&endAt=' + encodeURIComponent('"' + mDia[1] + 'D\uf8ff"'));
          var alvo = _normPed(rowP[0]);
          if (ds && typeof ds === 'object') {
            Object.keys(ds).forEach(function (kd) {
              var rd = ds[kd];
              if (!rd || !rd.length) return;
              for (var c = 1; c < rd.length; c++) { if (rd[c] && _normPed(rd[c]) === alvo) { chIdx[kd] = true; break; } }
            });
          }
        }
      }
    }
    var ks = (chIdx && typeof chIdx === 'object') ? Object.keys(chIdx) : [];
    if (ks.length && ks.length <= MAX_PEDIDOS) {
      var lidos = await Promise.all([fbGetOu('vitaflow_pedidos_hdr')].concat(ks.map(function (k) { return fbGetOu('vitaflow_pedidos/' + k); })));
      var hd = lidos[0];
      if (hd && hd.length) {
        var linhas = [hd];
        for (var j = 1; j < lidos.length; j++) if (lidos[j] && lidos[j].length) linhas.push(lidos[j]);
        if (linhas.length > 1) return { linhas: linhas, fonte: 'netlify-indice' };
      }
    }
  } catch (eIdx) { /* = GAS: erro no índice → espelho inteiro */ }
  /* 2) espelho inteiro */
  try {
    var lidos2 = await Promise.all([fbGet('vitaflow_pedidos'), fbGet('vitaflow_pedidos_hdr')]);
    var mp = lidos2[0], hd2 = lidos2[1];
    if (mp && typeof mp === 'object') {
      var kS = Object.keys(mp);
      if (kS.length && hd2 && hd2.length) {
        var linhas2 = [hd2];
        for (var i = 0; i < kS.length; i++) linhas2.push(mp[kS[i]]);
        return { linhas: linhas2, fonte: 'netlify-espelho' };
      }
    }
  } catch (eEsp) { console.error('[rastreio] espelho: ' + eEsp.message); }
  return null;   /* o GAS cairia na planilha — aqui quem chamou tenta o GAS */
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (!FB_SECRET) return usarGas('sem FIREBASE_SECRET');
  var d = {};
  try { d = JSON.parse(event.body || '{}') || {}; } catch (e) { d = {}; }
  var termoRaw = String(d.termo || '').trim();
  if (!termoRaw) return resp({ success: true, encontrados: 0, pedidos: [], fonte: 'netlify' });

  try {
    var esp = await _linhasDoEspelho(termoRaw);
    if (!esp) return usarGas('espelho do Firebase indisponivel');
    var dadosS = esp.linhas;
    var hdS = (dadosS[0] || []).map(function (h) { return String(h || '').trim().toUpperCase(); });
    var colTranspS = hdS.indexOf('TRANSPORTADORA');
    var colRastS = hdS.indexOf('CODIGO_RASTREIO'); if (colRastS < 0) colRastS = hdS.indexOf('CODIGO RASTREIO');
    var colFornS = hdS.indexOf('COMPRADO_FORNECEDORES');
    var colExtraS = { orig: hdS.indexOf('ORIGEM'), pai: hdS.indexOf('PEDIDO_ORIGINAL') };   /* v4 */
    var termoDig = _soDig(termoRaw), termoEmail = _norm(termoRaw), termoPed = _normPed(termoRaw);
    var ehEmail = termoRaw.indexOf('@') !== -1, ehCpf = termoDig.length === 11;
    var resultados = [];
    for (var rs = 1; rs < dadosS.length; rs++) {
      var linhaS = dadosS[rs];
      if (!linhaS || typeof linhaS !== 'object') continue;
      var pedidoCel = _normPed(linhaS[0]);
      var emailCel = _norm(linhaS[2]);
      var cpfCel = _cpf11(linhaS[3]);
      var statusCel = String(linhaS[5] || '').trim();
      var obsAband = String(linhaS[12] || '');
      var bate = false, porNumero = false;
      if (ehEmail) { bate = !!emailCel && emailCel === termoEmail; }
      else if (ehCpf) { bate = !!cpfCel && cpfCel === termoDig; }
      else if (pedidoCel && termoPed) {
        bate = (pedidoCel === termoPed) || (pedidoCel.indexOf(termoPed) !== -1 && termoPed.length >= 2);
        porNumero = true;
      }
      /* v4: pacote (linha D) do pedido procurado — PEDIDO_ORIGINAL igual ao número digitado */
      if (!bate && !ehEmail && !ehCpf && termoPed && colExtraS.pai >= 0 && _normPed(linhaS[colExtraS.pai]) === termoPed) { bate = true; porNumero = true; }
      if (!bate) continue;
      if (!porNumero && _rastNaoPagou(statusCel, obsAband)) continue;   /* por CPF/e-mail só pedido PAGO */
      resultados.push(_rastBaseDaLinha(linhaS, colTranspS, colRastS, colFornS, colExtraS));
    }
    await _rastCompletar(resultados);
    /* ordem: mais antigo primeiro (data e depois o número), como a v1 */
    var ordem = function (x) {
      var m = String(x.data || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
      var n = String(x.pedido || '').match(/(\d+)\s*$/);
      return (m ? m[3] + m[2] + m[1] : '00000000') + String(n ? n[1] : '0').padStart(5, '0');
    };
    resultados.sort(function (x, y) { return ordem(x) < ordem(y) ? -1 : (ordem(x) > ordem(y) ? 1 : 0); });
    return resp({ success: true, encontrados: resultados.length, pedidos: resultados, fonte: esp.fonte });
  } catch (e) {
    console.error('[rastreio] erro: ' + (e && e.message || e));
    return usarGas('erro: ' + String(e && e.message || e));
  }
};

/* v3: as mesmas peças usadas por outras funções do site (logistica-painel / logistica-atrasos), pra que o prazo
   do painel e do e-mail de atraso seja EXATAMENTE o da página de rastreio, da Athena e do bot. */
exports.lib = { fbGet: fbGet, fbGetOu: fbGetOu, histKey: _histKey, semAcentoUp: _semAcentoUp, naoPagou: _rastNaoPagou,
  baseDaLinha: _rastBaseDaLinha, enriquecer: _rastreioEnriquecer, origemEnvio: _origemEnvio, origemDaniel: _origemDaniel, linkTransp: _linkRastreioPub,
  duEntre: _duEntre, somaDU: _somaDU, ddmm: _ddmm, diaBR: _diaBR, diaUtilBR: _diaUtilBR,
  PRAZOS_ENTREGA: PRAZOS_ENTREGA, UF_REGIAO: _UF_REGIAO, ETAPA_ORDEM: _ETAPA_ORDEM, AVISOS_PADRAO: AVISOS_PADRAO /* v6 */ };

/* só pra teste local (node) */
exports._t = { _rastBaseDaLinha: _rastBaseDaLinha, _cidadeDoEndereco: _cidadeDoEndereco, _duEntre: _duEntre, _somaDU: _somaDU,
  _origemEnvio: _origemEnvio, _mem: _mem };
