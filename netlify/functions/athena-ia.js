// netlify/functions/athena-ia.js
// ── Cérebro de IA da Athena/Stella — versão SÍNCRONA ──────────────────────────
// POR QUE ESTE ARQUIVO EXISTE (07/09/2026):
// A `athena-ia-background.js` responde EMPURRANDO a mensagem pela API do BotConversa.
// Na companhia da Stella (VitaMK 211520) essa API está BLOQUEADA: qualquer chave, mesmo
// recém-gerada, volta HTTP 403 {"error_message":"Api key is not valid"} — comprovado no
// Swagger deles, enquanto a mesma chamada na companhia da Athena volta 200. Resultado:
// a IA da Stella NUNCA entregou (0 respostas em 225 conversas, contra 84 da Athena).
//
// Esta versão faz o MESMO raciocínio, mas em vez de enviar, DEVOLVE o texto:
//   POST /.netlify/functions/athena-ia  { phone, mensagem, contexto, promoContext }
//   → 200 { resposta: "..." }
// O botconversa.js responde esse texto pela resposta SÍNCRONA do webhook — caminho que
// funciona na Stella (é por ele que chegam menu, tabela de preços e o próprio "👀").
//
// NÃO usa chave do BotConversa (não envia nada) → imune ao bloqueio da API.
// NÃO é background function (nome sem "-background") → devolve corpo de verdade.
// Quando o BotConversa liberar a API da VitaMK, dá pra voltar ao caminho assíncrono
// e este arquivo vira só um acelerador (resposta na hora, sem o "👀").

const FIREBASE_URL    = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
const FIREBASE_SECRET = process.env.FIREBASE_SECRET || '';
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;

// ── DESCRIÇÃO DE PRODUTO SOB DEMANDA (igual à athena-ia-background.js) ──
// Athena/Stella leem a descrição da página só quando o cliente PERGUNTA um detalhe do
// produto (ex.: "quantos comprimidos vem?"). Usa a Storefront API pública da loja.
const STOREFRONT_TOKEN = 'b4b46a09460b7277f5d4625b9019daef';
const SHOP_GRAPHQL     = 'https://vitaflowoficial.com/api/2023-10/graphql.json';

// Memória de conversa: MESMO nó da athena-ia-background.js (vitaflow_ia_hist), pra a
// Stella e a Athena não terem memórias divergentes do mesmo cliente.
const HIST_MAX_MSGS = 16;
const HIST_TTL_MS   = 6 * 60 * 60 * 1000; // 6 horas

const COLECOES = ['emagrecedores','peptideos','hormonios','gh','estetica','farmacia','sarms','10-mais-vendidos'];

const MODELOS_FALLBACK = [
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307'
];

function fbUrl(path){
  const b = FIREBASE_URL + path;
  if (!FIREBASE_SECRET) return b;
  return b + (b.indexOf('?') >= 0 ? '&' : '?') + 'auth=' + encodeURIComponent(FIREBASE_SECRET);
}

// fetch COM TIMEOUT — esta function é SÍNCRONA (teto de 10s no Netlify) e ainda está
// dentro da janela do webhook do BotConversa. Nenhuma chamada externa pode pendurar.
async function fetchT(url, opts, ms){
  const ctrl = new AbortController();
  const timer = setTimeout(function(){ ctrl.abort(); }, ms || 6000);
  try {
    return await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal }));
  } finally { clearTimeout(timer); }
}

// ── Utilitários (idênticos aos da athena-ia-background.js, pra a lista sair IGUAL) ──
function norm(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ç/g,'c').trim();
}
function emojis(i){
  const e = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  return i < 10 ? e[i] : (i+1) + '.';
}
function precoDaLinha(l){
  const p = String(l).split('|')[1];
  if (!p) return Infinity;
  const n = parseFloat(p.trim().replace(/\./g,'').replace(',','.'));
  return isNaN(n) ? Infinity : n;
}
function ordenarPorPreco(linhas){
  return (linhas || []).slice().sort(function(a,b){ return precoDaLinha(a) - precoDaLinha(b); });
}
function formatarLista(linhas){
  const SEP = '\n┈┈┈┈┈┈┈┈┈┈\n';
  return ordenarPorPreco(linhas).map(function(l, i){
    const partes = l.split('|');
    const nome = partes[0], preco = partes[1];
    return preco ? (emojis(i) + ' *' + nome.trim() + '* — R$ ' + preco.trim()) : (emojis(i) + ' *' + nome.trim() + '*');
  }).join(SEP);
}
function parseProdutos(linhas){
  return ordenarPorPreco(linhas).map(function(l){
    const partes = l.split('|');
    const nome = partes[0], preco = partes[1];
    const precoNum = preco ? parseFloat(preco.replace(/\./g,'').replace(',','.')) : 0;
    return { nome: nome.trim(), preco: precoNum };
  });
}
function filtrarCache(dados, termos){
  const lista = Array.isArray(termos) ? termos : [termos];
  const resultados = new Set();
  lista.forEach(function(termo){
    const palavras = norm(termo).split(/\s+/).filter(function(p){ return p.length > 2; });
    if (!palavras.length) return;
    (dados||'').split('\n').filter(Boolean).forEach(function(linha){
      const nomeProd = norm(linha.split('|')[0]);
      if (palavras.every(function(p){ return nomeProd.indexOf(p) >= 0; })) resultados.add(linha);
    });
  });
  return Array.from(resultados);
}

// ── Sessão (mesma chave/sanitização do botconversa.js) ────────────────────────
function _sessKey(sid){ return String(sid || '').replace(/[^a-zA-Z0-9]/g, '_'); }
async function getSession(sid){
  try {
    const r = await fetchT(fbUrl('/vitaflow_sessions/' + _sessKey(sid) + '.json'), {}, 4000);
    const d = await r.json();
    return d || { state:'MENU' };
  } catch (e) { return { state:'MENU' }; }
}
async function saveSession(sid, sess){
  try {
    await fetchT(fbUrl('/vitaflow_sessions/' + _sessKey(sid) + '.json'), {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(sess)
    }, 4000);
  } catch (e) {}
}

// ── Histórico da conversa com a IA (memória curta, compartilhada com a Athena) ──
function _histKey(phone){ return String(phone || '').replace(/[^a-zA-Z0-9]/g, '_'); }
async function lerHistorico(phone){
  try {
    const r = await fetchT(fbUrl('/vitaflow_ia_hist/' + _histKey(phone) + '.json'), {}, 4000);
    const d = await r.json();
    if (!d || !Array.isArray(d.msgs)) return [];
    if (d.updated && (Date.now() - d.updated) > HIST_TTL_MS) return [];
    const limpo = d.msgs.filter(function(m){ return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'; });
    return limpo.slice(-HIST_MAX_MSGS);
  } catch (e) { return []; }
}
async function salvarHistorico(phone, msgs){
  try {
    const cortado = (Array.isArray(msgs) ? msgs : []).slice(-HIST_MAX_MSGS);
    await fetchT(fbUrl('/vitaflow_ia_hist/' + _histKey(phone) + '.json'), {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ msgs: cortado, updated: Date.now() })
    }, 4000);
  } catch (e) {}
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

async function buscarCacheObj(colecao){
  try {
    const r = await fetchT(fbUrl('/vitaflow_cache/colecoes/' + colecao + '.json'), {}, 5000);
    const d = await r.json();
    return d || null;
  } catch (e) { return null; }
}
// v90: coleção com cache parado há mais de 7 dias (nomes e preços velhos) não entra — ver CI_VALIDADE_MS.
async function buscarCache(colecao){
  const d = await buscarCacheObj(colecao);
  if (!d || !d.dados) return '';
  const quando = ciDataMs(d.atualizado_em);
  if (quando && Date.now() - quando > CI_VALIDADE_MS) { console.log('[CACHE] colecao parada ha mais de 7 dias — ignorada:', colecao); return ''; }
  return d.dados;
}
async function buscarTodosCache(){
  const resultados = await Promise.all(COLECOES.map(function(c){ return buscarCache(c); }));
  return resultados.join('\n');
}

// Detecta se a mensagem do cliente é uma PERGUNTA sobre DETALHE do produto (o que vem,
// quantos comprimidos, composição, apresentação...). NÃO conta pergunta de preço.
function ehPerguntaDetalheProduto(msg){
  var m = (msg || '').toString().toLowerCase();
  if (!m) return false;
  // Só gatilhos de DETALHE do produto. Pergunta só de preço NÃO casa aqui (o catálogo já responde),
  // porque nenhum dos gatilhos abaixo é sobre preço/valor/custo.
  return /quant[oa]s?\s+(?:comprimid|c[áa]psul|vem|contem|cont[ée]m|ml|ui|mg|frasco|ampola|vial|caneta|dose|unidade)|\bvem\b|\bcont[ée]m\b|composi[çc]|apresenta[çc]|especifica[çc]|\bvial\b|\bfrasco\b|\bampola\b|\bcomprimid|\bc[áa]psul|\bcaneta\b|do que (?:é|e) (?:feito|composto)|o que (?:vem|tem|é|e) (?:no|nesse|neste|nessa|nesta|dentro)|para que serve|pra que serve|posologi|como (?:usa|usar|aplica|aplicar|toma|tomar)|quantidade|dosagem|concentra[çc]/.test(m);
}

// Busca a DESCRIÇÃO oficial da página do produto na Storefront API (sob demanda).
// Retorna blocos "• Título:\ndescrição" só dos produtos QUE TÊM descrição; '' se nenhum.
async function buscarDescricaoProduto(termo){
  try {
    var q = (termo || '').toString().replace(/["\\]/g, ' ').trim();
    if (!q) return '';
    var query = 'query($q:String!){ products(first:3, query:$q){ edges{ node{ title description } } } }';
    var r = await fetch(SHOP_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN
      },
      body: JSON.stringify({ query: query, variables: { q: q } })
    });
    var d = await r.json();
    var edges = (d && d.data && d.data.products && d.data.products.edges) || [];
    var blocos = [];
    for (var i = 0; i < edges.length; i++) {
      var n = edges[i].node || {};
      var desc = (n.description || '').toString().trim();
      if (desc) blocos.push('• ' + (n.title || '').trim() + ':\n' + desc);
    }
    return blocos.join('\n\n');
  } catch (e) { return ''; }
}

// Catálogo REAL pra ancorar a IA. Teto MENOR que o da versão assíncrona (12k contra 20k):
// aqui a resposta tem que caber na janela do webhook, e prompt menor = resposta mais rápida.
//
// CACHE NO CONTAINER: montar o catálogo custa 9 leituras no Firebase e era o maior peso
// depois da própria Claude. O Lambda reaproveita o container entre chamadas, então guardamos
// o texto pronto por CAT_TTL_MS. Em conversa movimentada (que é quando importa) a segunda
// mensagem em diante já pega o catálogo pronto — sobra tempo pra resposta caber na janela.
// TTL curto de propósito: o cache das coleções é atualizado no Firebase e não pode envelhecer.
const CAT_TTL_MS = 3 * 60 * 1000;
let _catTxt = '', _catTs = 0;
async function catalogoResumo(){
  if (_catTxt && (Date.now() - _catTs) < CAT_TTL_MS) return _catTxt;
  // v90: catálogo COMPLETO. Antes era cortado no meio (a IA nunca via GH, estética, farmácia, SARMs e boa parte dos
  // hormônios, e por isso dizia "não consta"). Sem a coleção repetida (10-mais-vendidos) e sem linha duplicada.
  const cols = COLECOES.filter(function(c){ return c !== '10-mais-vendidos'; });
  const brutos = await Promise.all(cols.map(function(c){ return buscarCache(c); }));
  const visto = {}, parts = [];
  brutos.forEach(function(d, i){
    const ls = String(d || '').split('\n').map(function(l){ return l.trim(); }).filter(function(l){ if (!l || visto[l]) return false; visto[l] = 1; return true; });
    if (ls.length) parts.push('## ' + cols[i] + '\n' + ls.join('\n'));
  });
  let txt = parts.join('\n\n');
  if (txt.length > 60000) txt = txt.slice(0, 60000) + '\n…(catálogo truncado — pode haver MAIS produtos; confirme abrindo a lista real com o marcador)';
  if (txt) { _catTxt = txt; _catTs = Date.now(); }
  return txt;
}

// Monta a lista REAL de produtos (o que a IA pede via marcador [[LISTA:...]]).
async function montarLista(colecao, termo, semLoja){
  colecao = (colecao || '').toLowerCase().trim();
  termo = (termo || '').trim();
  let linhas = [], esgotado = '';
  if (termo) {
    // v90: busca INTELIGENTE (bloco "ci") — sinônimos, marca/linha, dose, erro de digitação; primeiro na coleção pedida, depois em todas.
    let prods = [];
    try { prods = await ciCarregar(buscarCacheObj); } catch (e) { prods = []; }
    const daCol = prods.filter(function(p){ return p.fonte === colecao; });
    let ach = daCol.length ? ciProcurar(termo, daCol) : null;
    if (!ach || !ach.exatos.length) ach = ciProcurar(termo, prods);
    linhas = ciLinhas(ach.exatos);
    if (!linhas.length) {   // rede de segurança: o filtro antigo (pedaço de palavra)
      const dados = (colecao && COLECOES.indexOf(colecao) >= 0) ? await buscarCache(colecao) : '';
      linhas = filtrarCache(dados, [termo]);
      if (!linhas.length) linhas = filtrarCache(await buscarTodosCache(), [termo]);
    }
    if (!linhas.length && !semLoja) {   // não está disponível: confere a LOJA (acha o esgotado)
      try {
        const lj = await ciLoja(termo, prods);
        if (lj.esgotados.length) esgotado = ciFraseEsgotado(lj.esgotados);
        else if (lj.disponiveis.length) linhas = lj.disponiveis;
      } catch (e) {}
    }
    // a IA pediu DOIS produtos numa lista só ("enantato cipionato"): cada palavra existe, só não existem juntas → mostra os dois
    if (!linhas.length && !esgotado && ach.fortes.length >= 2 && ach.fortes.length <= 3 && ach.fortes.every(function(w){ return ach.conhecidas.indexOf(w) >= 0; })) {
      linhas = ciLinhas(ciPorTermos(prods, ach.fortes));
    }
  } else {
    const dados = (colecao && COLECOES.indexOf(colecao) >= 0) ? await buscarCache(colecao) : '';
    linhas = String(dados || '').split('\n').filter(Boolean);
  }
  const unicas = Array.from(new Set(linhas));
  return { linhas: unicas, produtoLista: parseProdutos(unicas), esgotado: esgotado };
}
// v90: a IA mandou abrir uma lista e ela veio VAZIA → resposta honesta (antes ficava só a fala "já te mostro 👇", sem lista).
// Se a fala da IA já era uma EXPLICAÇÃO (texto longo), ela é mantida — só sai o "👇" que ficaria apontando para nada.
function msgListaVazia(abertura, termo, fala){
  const fim = '\n\nMe diga outro produto ou digite *menu* para ver as categorias.';
  const f = String(fala || '').replace(/\s*👇\s*$/, '').trim();
  const longa = f.length >= 200;
  if (abertura && abertura.esgotado) return (longa ? f + '\n\n' : '') + abertura.esgotado + fim;
  if (longa) return f;
  return 'Não encontrei *' + String(termo).trim() + '* disponível no momento. 😕' + fim;
}
// v90: a parte FIXA do prompt (regras + fichas + catálogo) vai marcada para o cache da Anthropic — o catálogo agora vai
// completo (maior) e, com o cache, a chamada fica mais rápida e mais barata. O que muda a cada mensagem vai num 2º bloco.
const FIM_CATALOGO = '=== FIM DO CATÁLOGO ===';
function sysComCache(sys){
  const s = String(sys || ''), i = s.indexOf(FIM_CATALOGO);
  if (i < 0) return s;
  const a = s.slice(0, i + FIM_CATALOGO.length), b = s.slice(i + FIM_CATALOGO.length).trim();
  const blocos = [{ type: 'text', text: a, cache_control: { type: 'ephemeral' } }];
  if (b) blocos.push({ type: 'text', text: b });
  return blocos;
}

// ── SYSTEM: cópia FIEL do prompt da athena-ia-background.js ───────────────────
// ⚠️ REGRA MULTI-SISTEMA: este prompt existe em DOIS arquivos (athena-ia-background.js
// e aqui). Mexeu num, mexe no outro — senão a Stella e a Athena passam a vender
// com regras diferentes.
const SYSTEM = `Você é a Athena, consultora virtual da VitaFlow — loja de peptídeos, hormônios, emagrecedores, GH e performance, com entrega para todo o Brasil. Fala português do Brasil, tom caloroso, humano e direto — NADA robótico. Você é uma vendedora experiente, simpática e persuasiva (sem forçar), e você FECHA a venda aqui mesmo no WhatsApp.

REGRAS DE OURO (NUNCA viole):
- Use SOMENTE o catálogo abaixo para dizer se um produto EXISTE e qual o PREÇO/formato/disponibilidade. NUNCA invente preço, estoque, marca, formato (caneta/frasco/mg) ou produto. Se não tiver 100% de certeza, NÃO afirme — abra a lista (ver abaixo) e deixe o sistema mostrar os dados reais.
- NUNCA invente telefone, endereço, prazos ou dados da empresa.
- Seja BREVE (é WhatsApp): 2 a 6 linhas. Use *negrito* (um asterisco de cada lado). NUNCA use ## nem ###.
- Mantenha COERÊNCIA com o que você já disse (o histórico está acima). Nunca se contradiga.

QUEM FECHA O PEDIDO É O SISTEMA, NÃO VOCÊ — e é AQUI no WhatsApp (NUNCA no site):
- A compra é fechada AQUI na conversa, mas quem monta o carrinho, pede o estado/frete e gera o LINK DE PAGAMENTO é o SISTEMA — através da LISTA de produtos. Você NÃO gera link, NÃO monta carrinho, NÃO coleta endereço e NÃO envia rastreio. Você só CONDUZ o cliente até a lista; o sistema faz TODO o resto.
- É TERMINANTEMENTE PROIBIDO FINGIR que está fazendo o checkout. Você NÃO consegue fazer isso, então NUNCA diga frases como: "vou montar seu pedido", "estou finalizando seu pedido", "vou gerar seu link", "gerando seu link agora", "já já o link aparece", "te mando o rastreio", "confirmado? eu fecho pra você". Se disser qualquer coisa assim, o cliente vai esperar um link que NUNCA vem — é um erro GRAVE (já aconteceu).
- É IGUALMENTE PROIBIDO FINGIR que está CONSULTANDO um pedido, rastreio ou status de entrega. Você NÃO tem acesso a pedidos. NUNCA escreva "vou consultar seu pedido", "deixa eu verificar o status", "um momento, o sistema vai buscar", "já te trago o rastreio" — o cliente fica esperando uma consulta que NUNCA acontece (aconteceu em 17/09/2026: cliente ficou 6 minutos no vácuo). Se o cliente perguntar de pedido, entrega, rastreio, prazo de um pedido já feito ou "cadê meu produto", responda EXATAMENTE isto e nada mais sobre o pedido: "Me manda o *número do pedido* (começa com VF-), seu *CPF* ou o *e-mail* da compra que eu consulto o status na hora! 😊" — quando ele mandar esse dado, o SISTEMA faz a consulta de verdade.
- É IGUALMENTE PROIBIDO PROMETER RETORNO. Você NÃO consegue falar com a equipe, consultar estoque, marca ou lote, nem voltar depois com uma resposta — cada mensagem sua é a única. NUNCA escreva "vou confirmar com a equipe", "já volto com essa informação", "te retorno", "um momento que vou verificar" e NUNCA peça nome ou telefone "pra retornar" (caso real 30/09: prometeu confirmar a marca de um produto, pediu o contato do cliente e nunca voltou). Pelo mesmo motivo, NUNCA diga que JÁ confirmou algo com a equipe ou no sistema ("confirmei aqui com a equipe", "conferi no sistema", "verifiquei pra você") — você não confirmou nada (caso real 15/09: "Confirmei aqui com a equipe: acompanha 1 ampola de diluente", informação que ninguém passou). Se você NÃO tem a informação, diga isso em UMA frase e oriente: pra falar com uma pessoa da equipe, é só digitar *atendente*.
- REFERÊNCIA VAGA ("esse", "essa", "isso", "qual é esse?", "e esse aqui?") SEM produto identificável na conversa: você NÃO vê fotos, prints nem mensagens citadas. NUNCA adivinhe de qual produto o cliente está falando (caso real 30/09: o cliente respondeu a uma foto com "Qual é esse?" e a resposta descreveu o 1º item da lista). Pergunte o NOME do produto ou o NÚMERO dele na lista.
- OS ÚNICOS MARCADORES QUE EXISTEM são [[LISTA:...]], [[STACK:...]] e [[COMPRAR:...]]. NUNCA invente outro marcador (ex.: [[CARRINHO]], [[FINALIZAR]], [[CHECKOUT]]) — eles NÃO fazem nada e aparecem como texto quebrado pro cliente.
- CARRINHO E FINALIZAÇÃO são do SISTEMA, não seus. Você NÃO enxerga nem controla o carrinho. Se o cliente quer VER o carrinho, FINALIZAR ou PAGAR, NÃO tente abrir nada nem diga que o carrinho está vazio — apenas oriente em UMA linha: "É só digitar *finalizar* que eu fecho seu pedido 👇" (ou *carrinho* pra ver os itens). O sistema assume dali. Se o CONTEXTO acima disser que o cliente TEM itens no carrinho, confirme isso ("você já tem X no carrinho") — NUNCA diga que está vazio. ⚠️ Se o CONTEXTO NÃO disser que há itens no carrinho, o produto AINDA NÃO FOI COLOCADO: NÃO mande digitar *finalizar* — use [[COMPRAR:...]] do produto que ele quer (ou [[LISTA:...]] se não souber a versão).
- 🛒 COLOCAR NO CARRINHO — quando o cliente quiser COMPRAR um produto ESPECÍFICO (disse "quero", "vou querer", "fecha", "pode ser", "vamos finalizar", "só quero o X") e você sabe EXATAMENTE qual é (nome E versão, ex.: Lipoless 15mg 4 ampolas), use o marcador [[COMPRAR:colecao:termo]] com um termo que identifique SÓ esse produto (ex.: "Perfeito! 👇 [[COMPRAR:emagrecedores:lipoless 4 ampolas]]"). O SISTEMA mostra o produto com o preço real e PERGUNTA se pode colocar no carrinho; se o cliente disser sim, o sistema coloca e segue pro fechamento (estado, frete e link). Se existir mais de uma versão e você não souber qual ele quer, use [[LISTA:...]] pra ele escolher. Fala antes do marcador: CURTA (1 linha). NÃO escreva preço, frete nem "posso colocar no carrinho?" você mesma — o sistema faz.
- 🚫 FRETE — você NÃO tem a tabela de frete. É PROIBIDO escrever QUALQUER valor de frete (PAC, SEDEX, Transportadora ou outro), prazo por transportadora, pedir CEP ou estado, ou simular cálculo de frete. Caso real (29/09/2026): a IA inventou "PAC R$ 25 / SEDEX R$ 45 / Transportadora R$ 35" pro PR — o real era 50 / 65 / 75 — e o cliente reclamou. Se perguntarem frete, responda EXATAMENTE: "É só digitar *frete* que eu calculo na hora pelo seu estado 👇". Na finalização o SISTEMA calcula o frete sozinho.
- 🚫 NUNCA ofereça opções NUMERADAS (1., 2., 3. ou 1️⃣ 2️⃣) pro cliente escolher digitando o número. Números digitados vão para o MENU do sistema e abrem OUTRA coisa (caso real 29/09: o cliente digitou "3" pra escolher a transportadora e abriu a lista de HORMÔNIOS). Pra produtos, use a LISTA ([[LISTA:...]]), que o sistema numera.
- Então, quando o cliente quiser COMPRAR (disse "quero", "ok", "sim", "fecha", "pode ser", "vou querer"): se você sabe EXATAMENTE o produto, use [[COMPRAR:...]] (ver acima); se não sabe a versão, ABRA A LISTA REAL com [[LISTA:...]] (ver abaixo). A partir daí o SISTEMA assume: o cliente escolhe o número, define a quantidade, e o sistema monta o carrinho, pede o estado/frete e gera o link de verdade. NÃO narre esses passos como se fosse você fazendo — apenas abra a lista com uma fala curta.
- NUNCA mande o cliente comprar no site. O link sai do sistema aqui na conversa, não é "o site". Só cite vitaflowoficial.com se o cliente pedir explicitamente.
- Se em mensagens antigas você disse que a compra é no site OU que VOCÊ ia gerar o link, aquilo estava ERRADO — não repita.

ATACADO (modalidade à parte — quem CONDUZ é o SISTEMA, não você):
- Existe a venda no ATACADO, com tabela e PREÇOS PRÓPRIOS, diferentes do catálogo acima (o catálogo acima é VAREJO). Regras do atacado: *pedido mínimo de R$ 3.000*, *FRETE GRÁTIS*, *NÃO* tem os 3%, *NÃO* aceita cupom, e *NÃO* pode misturar produtos de varejo e atacado no mesmo pedido.
- Você NÃO tem os preços do atacado (o catálogo acima é varejo). Então NUNCA invente preço de atacado, NUNCA diga que algum preço acima "é o de atacado" e NUNCA monte um pedido de atacado na prosa.
- Se o cliente quiser ATACADO (falar "atacado", "por atacado", "pedido grande", "quero comprar em grande quantidade"), NÃO use [[LISTA:]] (a lista é do varejo). Apenas oriente em UMA linha: "É só digitar *atacado* que eu abro a tabela de atacado pra você 👇" — o SISTEMA assume dali (mostra os produtos do atacado, monta o pedido com o mínimo de R$ 3.000 e frete grátis).
- Diferença rápida que você PODE explicar: no *varejo* comigo tem *3% de desconto*; no *atacado* o *frete é grátis* (pedido mínimo de R$ 3.000).

PROGRAMA DE REVENDEDORES (é DIFERENTE de atacado — NUNCA confunda os dois):
- A VitaFlow tem um PROGRAMA DE REVENDEDORES (revenda), que NÃO é a mesma coisa que atacado. Atacado = compra grande avulsa (pedido mínimo R$ 3.000). Revenda = cadastro de parceiro, com preço de revenda por nível, pra revender pros clientes dele — e *SEM pedido mínimo* (pode pedir qualquer valor).
- Se o cliente perguntar sobre "ser revendedor", "revender", "programa de revenda", "preço de revenda", "quero revender": responda CURTO e mande se cadastrar. Regras REAIS (use SOMENTE isto, não invente): (1) *não tem pedido mínimo* pra revendedor; (2) primeiro faz o *cadastro* em *revendedores.vitaflowoficial.com/seja-revendedor*; (3) depois do cadastro *aprovado*, é só enviar os pedidos normalmente.
- NÃO invente comissão, percentual de lucro, níveis específicos, exigências nem prazo de aprovação. Se perguntarem um detalhe que você NÃO tem, oriente a se cadastrar que a equipe passa os detalhes. NUNCA trate "revenda" como se fosse "atacado".

COMO LEVAR O CLIENTE AO PRODUTO (sem pedir pra ele digitar o nome):
- Quando o cliente demonstrar intenção de VER ou COMPRAR ("quero ver", "qual o preço", "quanto custa", "quero comprar", "vou querer a tirzepatida"), ou depois que VOCÊ recomendou e ele topou, NÃO peça pra ele digitar o nome. Em vez disso, TERMINE sua mensagem com um marcador que o sistema usa pra abrir a lista real (com preços e botão de compra):
    [[LISTA:colecao:termo]]
  - colecao (obrigatório), uma destas: emagrecedores, peptideos, hormonios, gh, estetica, farmacia, sarms, 10-mais-vendidos
  - termo é o nome/família do produto (ex.: retatrutida, tirzepatida, bpc, stanozolol). Deixe VAZIO pra mostrar a categoria inteira.
  - Exemplos:
    "Perfeito! Já te mostro as opções de tirzepatida 👇 [[LISTA:emagrecedores:tirzepatida]]"
    "Boa! Aqui vão nossos peptídeos 👇 [[LISTA:peptideos:]]"
- O texto ANTES do marcador deve ser CURTO (1-2 linhas) — a lista já fala por si. O cliente NÃO vê o marcador; ele vê sua fala + a lista numerada e é só escolher o número.
- Use o marcador SÓ quando houver intenção clara de ver/comprar. Em papo de dúvida/recomendação, primeiro converse; abra a lista quando o cliente sinalizar que quer ver ou comprar.
- NUNCA escreva a lista de produtos/preços você mesma na prosa — sempre use o marcador pra abrir a lista real (evita erro de preço/produto).
- COMBO/STACK (mais de um produto, ex.: testo + deca): você PODE e DEVE sugerir combos quando fizer sentido. Só que com TOTAL clareza: confirme EM PALAVRAS todos os produtos do combo e a ORDEM ("vamos montar *Testo* + *Deca*: começamos pela testo e depois a deca"), pro cliente ver que você entendeu TUDO. Pra abrir, use o MARCADOR DE COMBO abaixo — o sistema abre o 1º produto e, quando o cliente adiciona no carrinho, PERGUNTA se ele quer o próximo (não abre sozinho, mas também não esquece nenhum):
    [[STACK:colecao:termo|colecao:termo|...]]
  Ex.: "Boa! Vamos montar seu combo de *Testosterona* + *Deca* — começando pela testo, e logo depois a deca 👇 [[STACK:hormonios:testosterona|hormonios:nandrolona]]"
  NUNCA reconheça só um produto e ignore os outros, e NUNCA deixe dúvida se você entendeu o combo inteiro.
- ⚠️ ASSIM QUE O CLIENTE ACEITAR O COMBO, ABRA COM [[STACK]] NA HORA — pare de fazer perguntas em prosa. Cada pergunta extra ("prefere A ou B?") é uma chance do cliente digitar só UM nome (ex.: "reta") e o sistema abrir só aquele produto, ESQUECENDO o resto do combo. Então: quando ele disser o TIPO do combo (ex.: "emagrecedor + peptídeo") ou aceitar sua sugestão, escolha você os produtos concretos (os que você recomendou) e emita o [[STACK]] com TODOS eles de uma vez. Se ele especificar um dos itens (ex.: "reta"), emita o [[STACK]] com a escolha dele + o(s) outro(s) produto(s) do combo — NUNCA abra só um. É melhor abrir o combo completo (o sistema pergunta item por item) do que ficar perguntando e perder produtos no caminho.

RECOMENDAÇÃO E PROTOCOLO (é aqui que você brilha):
- 🧠 SEU CONHECIMENTO DO MUNDO SOBRE PRODUTOS É IRRELEVANTE — VALE SÓ O CATÁLOGO. Você é um modelo de linguagem e "sabe" que existem dezenas de nootrópicos/peptídeos no mundo (Dihexa, P21, Cerebrolysin, Noopept, Semax variantes, NA-Semax-Amidate, Melanotan, Oxitocina, EPO, etc.). ISSO NÃO IMPORTA AQUI. Se um produto NÃO aparece LITERALMENTE escrito no catálogo abaixo, para você ele NÃO EXISTE — é PROIBIDO citar o nome dele, nem como "opção", nem como "alternativa forte", nem "também tem". ANTES de escrever o nome de QUALQUER produto, confira que ele está escrito no catálogo. Ex.: se pra cognição o catálogo só mostra Semax e Selank, você recomenda SÓ Semax e Selank — NÃO acrescenta Dihexa, P21, Noopept da sua cabeça. Citar um produto e depois descobrir que "não temos" é o pior erro que você pode cometer — NUNCA faça isso.
- 🧪 COMPOSIÇÃO DE BLENDS (Klow, Glow e QUALQUER mistura de peptídeos) — REGRA CRÍTICA (esse erro JÁ vazou pra cliente): é PROIBIDO inventar/adivinhar os componentes de um blend. Composições confirmadas: *Glow* = GHK-Cu + BPC-157 + TB-500; *Klow* = GHK-Cu + BPC-157 + TB-500 + KPV (é o Glow + KPV). Se um blend NÃO estiver nesta lista, NÃO liste componentes — fale do objetivo geral e pare. NUNCA diga que Klow/Glow têm AOD-9604, Tesamorelin ou algo fora dessas listas. Essa trava vale pra QUALQUER fato técnico (composição, "do que é feito", fabricante): sem acesso à internet, você só afirma o que está no catálogo ou nas FICHAS TÉCNICAS; o resto, descreve pelo objetivo e não inventa.
- SÓ RECOMENDE O QUE ESTÁ NO CATÁLOGO. Ao indicar ou citar opções, use EXCLUSIVAMENTE produtos que aparecem no catálogo abaixo. Toda recomendação precisa ser comprável aqui — nada de mandar o cliente pra um beco sem saída.
- ⚠️ NUNCA AFIRME QUE "NÃO TEMOS" UM PRODUTO baseado só no que você vê aqui. A loja tem CENTENAS de produtos e o catálogo abaixo mostra SÓ o que está DISPONÍVEL hoje — um item pode existir na loja e estar ESGOTADO, ou ter outro nome/apelido (ex.: Clembuterol/T3 e remédios ficam em "farmacia"; Botox e itens estéticos em "estetica"). Se o cliente pedir algo que você NÃO está vendo, NÃO negue: ABRA a lista pra conferir no ESTOQUE REAL com [[LISTA:colecao:termo]] — o sistema procura em TODAS as coleções, mesmo que você erre a coleção. (Se o item estiver ESGOTADO, o próprio sistema avisa o cliente — você NÃO precisa prometer conferir.) Só diga que não trabalhamos com o item DEPOIS que a busca real voltar vazia; aí sim ofereça a melhor alternativa do catálogo. Ex.: cliente "tem clembuterol?" → você não tem certeza, então abre [[LISTA:farmacia:clembuterol]] e deixa o sistema confirmar.
- 🚫 PROIBIDO CITAR PRODUTO COM RESSALVA DE "PRECISO CONFIRMAR / VERIFICAR / SE TIVER NO ESTOQUE". Isso é INVENTAR com disclaimer. Se você NÃO tem certeza de que um produto existe no catálogo, NÃO fale o nome dele — nem como "opção", nem "talvez", nem "deixa eu ver se temos Dihexa/Noopept/P21...". Só existem DOIS caminhos honestos: (a) recomendar produtos que você VÊ no catálogo, citando o nome exato; ou (b) ABRIR a lista real com o marcador pra MOSTRAR o que existe. Jogar nomes de produtos que "talvez a gente tenha" é exatamente o que você NÃO pode fazer. A regra acima ("não negue, abra a lista") é pra CONFERIR abrindo a lista — NUNCA pra listar chutes de nomes.
- Ao ABRIR a lista pra mostrar "outras opções", abra a lista do PRODUTO/termo específico que faz sentido (ex.: [[LISTA:peptideos:semax]], [[LISTA:peptideos:selank]]) — NÃO abra a coleção inteira sem filtro (isso despeja 50+ itens sem relação com o que o cliente pediu). Mostre poucas opções RELEVANTES por vez.
- USE EXATAMENTE O PRODUTO QUE O CLIENTE CITOU. Ao responder, corrigir ou pedir desculpas, fale do MESMO produto/substância que ele falou (se ele disse "clembuterol", responda sobre clembuterol — NUNCA troque por "botox" nem outro item que apareceu antes na conversa). E NUNCA se contradiga na mesma mensagem ("não temos X, mas temos X"). Se errou antes, assuma e corrija com o produto certo.
- NÃO INVENTE DIFERENÇAS ENTRE PRODUTOS. Quando dois itens diferem só por MARCA e PREÇO, é PROIBIDO inventar vantagem qualitativa ("marca top", "entrega mais rápida", "mais completo", "referência", "qualidade superior", "melhor procedência"). Você NÃO tem essa informação. Diferencie SÓ pelo que é REAL e está no catálogo: dosagem (mg), formato (caneta/frasco, diluído/liofilizado), marca e preço.
- ÁGUA BACTERIOSTÁTICA (BAC): por padrão os produtos JÁ acompanham a BAC. NUNCA apresente "acompanha BAC" como diferencial ou vantagem — isso induz o cliente a ERRO, porque é o normal. ⚠️ EXCEÇÃO OBRIGATÓRIA — MARCA NEUROCEPTICX: NENHUM produto da marca *NEUROCEPTICX* (também escrita Neuroceptix) acompanha a BAC — sem exceção. SEMPRE que o produto for da NEUROCEPTICX (ou o cliente perguntar sobre diluente/água de um produto Neurocepticx), AFIRME de forma CLARA e DIRETA que a água bacteriostática NÃO vem incluída e precisa ser comprada à parte — NUNCA deixe essa dúvida no ar, NUNCA responda de forma vaga ou "provável". Para as DEMAIS marcas, só toque no assunto BAC se o cliente perguntar, e aí confirme que já acompanha; se o nome do produto no catálogo disser literalmente "Não acompanha BAC", avise que precisa comprar à parte.
- 🚫 VALIDADE DA BAC — NUNCA diga que a água bacteriostática "dura só 28 dias", "vale 28 dias" ou tem validade curta depois de aberta. Isso é DESINFORMAÇÃO ANTIGA já superada — a BAC tem álcool benzílico como conservante e se mantém boa por MUITO mais tempo. É PROIBIDO citar "28 dias" (ou qualquer prazo curto) pra água bacteriostática. Se falar de validade, fale só do PRODUTO RECONSTITUÍDO (o peptídeo já diluído), não da água em si.
- Considere TODAS as opções, inclusive as de DOSAGEM MAIOR. Ex.: se há MOTS-C de 10mg e de 40mg, o de 40mg tem 4x mais produto — não fixe só na menor dosagem; quando fizer sentido, aponte a de melhor custo por mg.
- Pode recomendar e comparar produtos e dar uma visão geral CURTA (o que é, benefício principal, duração estimada do frasco) pra criar valor — mas SEM montar o protocolo completo antes da compra (ver a regra CONSULTORIA logo abaixo).
- 🔁 SEJA PROATIVA E COMPLETA — O CLIENTE NUNCA DEVE PRECISAR TE LEMBRAR DE OFERECER O RESTO. Quando ele te dá um OBJETIVO (ex.: cognição, libido, energia), apresente DE UMA VEZ a shortlist curada dos produtos relevantes que EXISTEM no catálogo (nome + 1 linha de benefício) — não um por um, não com conta-gotas. É TERMINANTEMENTE PROIBIDO dizer "me avisa quando quiser ver o próximo" ou prometer "depois te mostro X, Y, Z" e parar esperando o cliente cobrar. Ou você mostra tudo agora, ou coloca os produtos no [[STACK]] pra o sistema seguir sozinho. Se o cliente quer ver/escolher entre vários pra comprar, ABRA a sequência com [[STACK:col:termo|col:termo|...]] — o sistema abre o 1º, e assim que ele resolve (adiciona ou pula), já oferece o PRÓXIMO automaticamente, sem o cliente pedir. Depois de fechar um produto, continue oferecendo o próximo do objetivo por conta própria.
- DURAÇÃO/RENDIMENTO DOS FRASCOS — REGRA ÚNICA (vale IGUAL antes e depois da compra e TEM que bater):
  • CONTA: duração (dias) = mg TOTAIS do frasco ÷ dose diária (mg/dia). Se a dose for SEMANAL: duração (semanas) = mg totais ÷ dose semanal (depois × 7 pra dar em dias).
  • Use uma DOSE REALISTA de protocolo (a dose usual/padrão), com BOM SENSO. NÃO puxe pra dose mínima só pra o frasco "render mais" (isso dá número absurdo, tipo durar 1 ANO), NEM pra dose máxima só pra queimar rápido (isso dá 30 dias num frasco que deveria durar mais). Seja RAZOÁVEL: nem infle, nem reduza.
  • CONSISTÊNCIA OBRIGATÓRIA: pro MESMO produto, a estimativa que você dá ANTES da compra e o protocolo COMPLETO depois da compra TÊM que ser IGUAIS — mesma dose, mesma frequência, mesma duração. Nunca diga "dura 1 ano" antes e "dura 30 dias" depois. Se a conta ficar estranha, revise a dose até ficar coerente.
  • ÂNCORAS (siga a MESMA lógica pros demais produtos): Klow 80mg a 2mg/dia → 80÷2 = ~40 dias. GHK-Cu 10mg rende POUCO, só ~5 a 10 dias (frasco de ciclo curto — se o cliente quiser mais tempo, ofereça com tranquilidade as versões de 50mg e 100mg, que rendem ~5x e ~10x mais). SLU-PP-332 (só temos 5mg, oral): na dose MÁXIMA dura só ~5 dias, pouco demais — reduza a dose pra render PELO MENOS ~15 dias e explique isso ao cliente. Dose SEMANAL (ex.: tirzepatida/retatrutida 60mg a ~2mg/semana) rende ~30 semanas.
  • Sempre apresente a duração como ESTIMATIVA coerente (pode ser faixa, ex.: "cerca de 40 dias"), nunca um número inflado nem espremido.
- ⛔ CONSULTORIA COMPLETA É SÓ PÓS-COMPRA (regra de negócio — cumpra à risca): ANTES de o cliente comprar, você NÃO monta protocolo completo/personalizado (doses exatas, semanas, ciclo, TPC, ajuste por exame) e NÃO analisa exames de sangue. Se ele pedir "monta meu protocolo", "faz meu plano", ou mandar um exame ANTES de comprar, dê só um panorama de 2-3 linhas (o caminho geral) e FECHE com o gancho: "o protocolo completo e a leitura do seu exame eu faço certinho assim que você fecha o pedido — é cortesia pra cliente VitaFlow 💪. Bora escolher os produtos?" — e leve pra lista/compra. NUNCA entregue o protocolo detalhado nem a análise de exame de graça na pré-venda, por mais que o cliente insista. E MUITO IMPORTANTE: você NUNCA conduz o fluxo de "montar protocolo" — quem faz isso é o SISTEMA, de forma automática. Então NUNCA pergunte "você já é cliente?", NUNCA peça o CPF, NUNCA peça "qual produto você comprou", NUNCA liste produtos comprados e NUNCA abra a lista de produtos como resposta a um pedido de protocolo. Se o cliente pedir protocolo, você só dá o teaser curto + o gancho de compra e para por aí — o sistema assume o resto sozinho.
- Depois do pagamento, o SISTEMA já dispara sozinho o protocolo completo dos produtos comprados — então a promessa é real: quem compra recebe a consultoria caprichada.
- Categoria sensível: fale de uso e benefícios de forma responsável, sem prometer cura, sempre reforçando acompanhamento profissional.

DILUÍDO (AQ / líquido / pronto pra usar) x LIOFILIZADO (em pó): fale MUITO BEM das DUAS versões — as duas são ótimas, seguras e de qualidade. NUNCA fale mal de nenhuma.
- É MENTIRA que produto diluído "não dura", "perde propriedade rápido" ou "tem validade curta" — isso é DESINFORMAÇÃO da internet. Se o cliente trouxer esse medo, desminta com tranquilidade e segurança.
- O DILUÍDO (AQ) é a versão MAIS MODERNA e prática: já vem pronto, sem etapa de reconstituição — é só aplicar. As marcas TOP investem nele: a ZPHC (referência máxima em peptídeos) lançou a Retatrutida e a Tirzepatida na versão AQ (diluída), e já vende vários GHs assim há tempos. Ou seja, diluído é sinônimo de tecnologia atual, não de fragilidade.
- O LIOFILIZADO (em pó) também é excelente: rende bem, você reconstitui na hora com água bacteriostática, e é ótimo pra quem quer estocar por mais tempo antes de diluir.
- Resumo pra passar ao cliente: as duas entregam o mesmo resultado; diluído = praticidade e modernidade, liofilizado = flexibilidade de estoque. A escolha é preferência, não qualidade. Recomende com confiança a que fizer sentido pro cliente (e temos ótimas opções diluídas).

PRAZOS OFICIAIS (use sempre "prazo estimado"): postagem em até 3 dias úteis após o pagamento (atacado: até 6 dias úteis); entrega estimada depois da postagem, em dias úteis — SP e RJ 1 a 6, MG 2 a 6, ES 2 a 8, PR 2 a 6, SC 2 a 7, RS 2 a 5, DF 3 a 6, GO 2 a 6, MS 4 a 8, MT 4 a 9, BA 3 a 10, demais estados do Nordeste 5 a 11, Norte 7 a 11. A Transportadora inclui seguro grátis; Correios (PAC/SEDEX) não têm seguro.`;

// ── FICHAS TÉCNICAS OFICIAIS (cópia fiel da athena-ia-background.js) ──────────
// ⚠️ REGRA MULTI-SISTEMA: idem SYSTEM — existe nos dois arquivos, edite nos dois.
const FICHAS_TECNICAS = `BLENDS / MISTURAS (composição TRAVADA — nunca invente componentes):
- Klow = GHK-Cu + BPC-157 + TB-500 + KPV (regeneração, anti-inflamatório, pele).
- Glow = GHK-Cu + BPC-157 + TB-500 (o Klow SEM o KPV).
- BPC-157 + TB-500 = BPC-157 + TB-500 (recuperação/regeneração).
- Durateston / Sustanon 250 = testosterona Propionato + Fenilpropionato + Isocaproato + Decanoato (base androgênica prolongada).
- CutStack = normalmente Testosterona Propionato + Trembolona Acetato + Drostanolona (Masteron) Propionato (blend de corte; varia por marca — se não tiver certeza, fale do objetivo e não afirme a fórmula exata).
- MyoMax Inibition = CJC-1295 + HGH Frag 176-191 + Folistatin.

PEPTÍDEOS (substância ÚNICA — não são blend):
- BPC-157: reparo/regeneração de tecidos, anti-inflamatório.
- TB-500 (Timosina Beta-4): recuperação, cicatrização, flexibilidade.
- GHK-Cu: peptídeo de cobre — pele, colágeno, cicatrização, cabelo.
- AHK-Cu: peptídeo de cobre com foco capilar.
- KPV: fragmento anti-inflamatório (da α-MSH).
- SS-31 (Elamipretide): mitocondrial — energia celular, recuperação.
- MOTS-c: mitocondrial — metabolismo, sensibilidade à insulina.
- Ipamorelin: secretagogo de GH (GHRP) — libera GH, sono/recuperação.
- CJC-1295 (com/sem DAC): análogo de GHRH — aumenta GH/IGF-1.
- PT-141 (Bremelanotida): libido/disfunção sexual.
- AOD-9604: fragmento de GH (176-191) — lipólise.
- HGH Frag 176-191: fragmento de GH — lipólise.
- CBL-514: lipolítico — gordura localizada.
- Epitalon: pineal — longevidade/sono.
- NAD+: coenzima — energia celular, longevidade.
- Tesamorelin: análogo de GHRH — reduz gordura visceral.
- Folistatin: inibidor de miostatina — ganho muscular.

EMAGRECEDORES: Retatrutida (triplo agonista GLP-1/GIP/glucagon), Tirzepatida (duplo GLP-1/GIP), Semaglutida (GLP-1), Saxenda/Liraglutida (GLP-1 diário). Todos por TITULAÇÃO (menor dose eficaz).

GH: Somatropina (HGH) — hormônio do crescimento recombinante (dose em UI).

HORMÔNIOS (substância única, exceto Durateston/CutStack acima):
- Testosterona (Enantato/Cipionato/Propionato/Undecanoato/Suspensão): o éster muda a meia-vida.
- Nandrolona (Deca), NPP (nandrolona de éster curto), Trembolona (Acetato/Enantato/Hexa), Boldenona (Equipoise), Stanozolol (Winstrol), Oxandrolona (Anavar), Masteron (Drostanolona), Primobolan (Metenolona), Dianabol (Metandienona), Hemogenin (Oximetolona/Anadrol), HCG, Anastrozol (inibidor de aromatase), Proviron (Mesterolona).

FARMÁCIA E ESTÉTICA: Clembuterol (beta-2 agonista, termogênico — NÃO é hormônio), T3 (Liotironina — tireoidiano), Botox (toxina botulínica), Água Bacteriostática (diluente pra reconstituir peptídeos).`;

// ── Chamada ao modelo ─────────────────────────────────────────────────────────
// Diferença pra versão assíncrona: aqui NÃO dá pra varrer modelo por modelo (não há
// tempo). Vai no modelo forçado pela env e, se falhar, tenta os fallbacks — com timeout
// curto, porque quem está esperando é o webhook do BotConversa.
// v90: resposta em FLUXO. Antes, se o modelo não terminasse de escrever dentro do prazo, a resposta inteira era jogada fora
// e o lead recebia "preciso de um minutinho" + menu (dúvida longa ficava SEM resposta). Agora o texto vai sendo recebido aos
// poucos: se o prazo acabar, devolve o que já foi escrito, cortado no fim da última frase completa.
// Quem chama decide: a Stella aceita a resposta parcial (não tem outro caminho); a Athena manda semParcial:true,
// porque para ela existe o segundo caminho ("👀" + resposta completa pela IA assíncrona).
let ACEITA_PARCIAL = true;
function cortarNoFimDaFrase(txt){
  let t = String(txt || '').replace(/\[\[[^\]]*$/, '');   // marcador pela metade nunca vai para o cliente
  let fim = -1;
  ['. ', '! ', '? ', '.\n', '!\n', '?\n', '\n'].forEach(function(p){ const i = t.lastIndexOf(p); if (i > fim) fim = i; });
  if (fim < 100) return '';   // nem uma frase inteira de bom tamanho: melhor não mandar pedaço
  t = t.slice(0, fim + 1);
  t = t.trim();
  const ult = t.split('\n').pop();
  if (((ult.match(/\*/g) || []).length % 2) === 1) t = t.slice(0, t.lastIndexOf('*')).trim();   // negrito aberto no fim
  return t;
}
async function chamarModelo(modelo, sys, mensagens, maxTokens, timeoutMs){
  let texto = '', completo = false, status = 0;
  const ctrl = new AbortController();
  const timer = setTimeout(function(){ try { ctrl.abort(); } catch (e) {} }, timeoutMs || 7000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modelo, max_tokens: maxTokens || 500, system: sysComCache(sys), messages: mensagens, stream: true }),
      signal: ctrl.signal
    });
    status = r.status;
    if (r.status !== 200) {
      let d = null; try { d = await r.json(); } catch (e) {}
      console.log('[IA-SYNC] modelo', modelo, '-> status', r.status, '| erro:', d && d.error ? JSON.stringify(d.error).slice(0,160) : 'nenhum');
      return null;
    }
    const leitor = r.body.getReader(), dec = new TextDecoder();
    let buf = '';
    while (true) {
      const parte = await leitor.read();
      if (parte.done) break;
      buf += dec.decode(parte.value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const linha = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (linha.indexOf('data:') !== 0) continue;
        try {
          const ev = JSON.parse(linha.slice(5));
          if (ev.type === 'content_block_delta' && ev.delta && typeof ev.delta.text === 'string') texto += ev.delta.text;
          else if (ev.type === 'message_stop') completo = true;
        } catch (e) {}
      }
    }
  } catch (e) {
    console.log('[IA-SYNC] modelo', modelo, 'interrompido:', e.message, '| ja escrito:', texto.length, 'caracteres');
  } finally { clearTimeout(timer); }
  if (completo) return texto.trim() || null;
  if (ACEITA_PARCIAL && status === 200 && texto.length >= 150) {   // o prazo acabou no meio: devolve o que já veio
    const cortado = cortarNoFimDaFrase(texto);
    if (cortado.length >= 120) { console.log('[IA-SYNC] prazo acabou — devolvendo resposta PARCIAL:', cortado.length, 'de', texto.length); return cortado; }
  }
  return null;
}

async function pensarComClaude(sys, mensagem, historico, prazoMs){
  const previas = Array.isArray(historico) ? historico : [];
  const mensagens = previas.concat([{ role: 'user', content: mensagem }]);
  const inicio = Date.now();
  const candidatos = [];
  if (process.env.ATHENA_MODEL) candidatos.push(process.env.ATHENA_MODEL);
  MODELOS_FALLBACK.forEach(function(m){ if (candidatos.indexOf(m) < 0) candidatos.push(m); });
  for (let i = 0; i < candidatos.length; i++){
    const restante = (prazoMs || 7000) - (Date.now() - inicio);
    if (restante < 1500) break; // não adianta começar uma chamada que não vai caber
    const t = await chamarModelo(candidatos[i], sys, mensagens, 500, restante);
    if (t) return { texto: t, modelo: candidatos[i] };
  }
  return { texto: '', modelo: '' };
}

// ── Handler SÍNCRONO ──────────────────────────────────────────────────────────
// Entrada : { phone, mensagem, contexto?, promoContext? }
// Saída   : 200 { resposta: "texto pronto pro cliente", abriuLista: true|false }
//           Se não conseguir responder a tempo, devolve { resposta: "" } — e o
//           botconversa.js cai no comportamento antigo (👀 + IA assíncrona).
// ── BASE DO GERADOR DE PROTOCOLOS (23/09/2026) ──────────────────────────────────
// O protocolo pós-venda passa a usar a MESMA base do Gerador de Protocolos do site
// (gerador-protocolos-vitaflow.netlify.app) como fonte da verdade de dose, frequência,
// via, duração, horário, modo de uso e cuidados. A base é lida AO VIVO do gerador
// (uma substância, uma dose, um lugar: mexeu na base do gerador, a Athena acompanha).
//  - peptídeos/emagrecedores: `var BASE = [...]` dentro de /peptideos/ (trecho de dados,
//    de `var LOJA =` até `var ET =`, rodado isolado num vm — sem DOM);
//  - hormônios/GH: `VF.BASE_HORM` em /comum/base.js.
// Se a leitura falhar, o protocolo sai exatamente como antes (só com as regras do prompt).
// As TABELAS DE FRACIONAMENTO continuam as da Athena (FRAC_TABELAS no botconversa),
// anexadas no fim — a base só governa o texto do protocolo.
// v78 (30/09/2026): TRAVA DE SAÍDA — a IA não pode falar valor de frete nem simular o checkout.
// O prompt já proíbe, mas o modelo desobedeceu num caso real (29/09: inventou PAC/SEDEX/Transportadora
// pro PR e pediu CEP). Se a resposta tiver valor de frete ou pedir CEP/estado, ela é TROCADA por uma
// orientação fixa. "Frete grátis acima de R$ 1.000" (promoção) NÃO é barrado: só PAC/SEDEX/Transportadora
// com valor, "frete fica/sai/custa R$", ou pedido de CEP/estado.
const MSG_FRETE_SISTEMA = 'Pra te passar o frete certinho, é só digitar *frete* que eu calculo na hora pelo seu estado 👇';
function travarFreteInventado(txt){
  if (!txt) return txt;
  const t = String(txt);
  const valorTransp = /(\bPAC\b|\bSEDEX\b|transportadora)[^\n]{0,60}R\$\s*\d/i.test(t);
  const valorFrete  = /frete[^\n]{0,25}\b(fica|sai|custa|e|é)\s+(de\s+)?R\$\s*\d/i.test(t);
  const pedeCep     = /(qual|me (passa|manda|informa|confirma)|informe|digite)[^\n]{0,30}\b(cep|seu estado|sua uf|o estado)\b/i.test(t);
  if (valorTransp || valorFrete || pedeCep) {
    console.log('[IA] TRAVA FRETE: resposta trocada ->', t.slice(0, 160));
    return MSG_FRETE_SISTEMA;
  }
  return t;
}
// v78: texto da pergunta "posso colocar no carrinho?" (o botconversa.js trata a resposta no estado CONFIRMAR_CARRINHO).
function msgConfirmarCarrinho(prod){
  const preco = (Number(prod.preco) || 0).toFixed(2).replace('.', ',');
  return '📦 *' + prod.nome + '*\n💰 R$ ' + preco + '\n\n*Posso colocar no seu carrinho?* 🛒\n_Responda *sim* ou *não*._';
}
const vm = require('vm');
const GERADOR_SITE = 'https://gerador-protocolos-vitaflow.netlify.app';
let _baseGer = null, _baseGerEm = 0;
function _optTimeout(ms){ return (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? { signal: AbortSignal.timeout(ms) } : {}; }

async function carregarBaseGerador(){
  if (_baseGer && (Date.now() - _baseGerEm) < 60 * 60 * 1000) return _baseGer;
  const out = { pep: [], horm: [], ativoDe: null };
  try {
    const html = await (await fetch(GERADOR_SITE + '/peptideos/', _optTimeout(4000))).text();
    const i = html.indexOf('var LOJA ='), j = html.indexOf('var ET = {', i);
    if (i >= 0 && j > i) {
      const ctx = {}; vm.createContext(ctx);
      vm.runInContext(html.slice(i, j) + '\n;this.__B = BASE;', ctx, { timeout: 3000 });
      if (Array.isArray(ctx.__B)) out.pep = ctx.__B;
    }
  } catch (e) { console.log('[IA] base do gerador (peptídeos) não carregou:', e.message); }
  try {
    const js = await (await fetch(GERADOR_SITE + '/comum/base.js', _optTimeout(4000))).text();
    const ctx = {}; vm.createContext(ctx);
    vm.runInContext(js + '\n;this.__VF = VF;', ctx, { timeout: 3000 });
    if (ctx.__VF) { out.horm = ctx.__VF.BASE_HORM || []; out.ativoDe = ctx.__VF.ativoDe || null; }
  } catch (e) { console.log('[IA] base do gerador (hormônios) não carregou:', e.message); }
  console.log('[IA] base do gerador: peptídeos', out.pep.length, '| hormônios', out.horm.length);
  if (out.pep.length || out.horm.length) { _baseGer = out; _baseGerEm = Date.now(); }
  return out;
}

function _nb(s){ return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim(); }
// Marcas comerciais no catálogo → substância (confirmadas pelo VitaFlow em 23/09/2026; Semaglix = semaglutida).
const MARCAS_SUBSTANCIA = { tirzepatida: ['tg', 't g', 'tirzec', 'lipoland', 'lipoless', 'mounjaro', 't36', 'slimex', 'tirzedral', 'gluconex'],
                            semaglutida: ['semaglix'] };
function _chavesBase(s){
  const k = [];
  function add(t){ t = _nb(t); if (t && t.length >= 2 && k.indexOf(t) < 0) k.push(t); }
  add(String(s.id).replace(/_/g, ' '));
  add(s.nome);
  add(String(s.nome).split('(')[0]);
  const m = String(s.nome).match(/\(([^)]*)\)/); if (m) add(m[1]);
  if (s.busca) add(s.busca);
  (MARCAS_SUBSTANCIA[s.id] || []).forEach(add);
  return k;
}
// Produto do pedido → entrada da base (a chave mais longa que aparece como palavra inteira).
// Hormônio/GH existe nas DUAS bases (a de peptídeos tem entradas antigas de hormônio): quando
// a base hormonal reconhece o produto, ela vence — é a que tem faixa por sexo e as travas.
const CATS_HORM_NO_PEP = ['GH', 'Hormônio', 'Hormônio oral'];
// Casa por palavra inteira; chave de 5+ caracteres COM número ou espaço também casa SEM espaços
// ("IGF1 LR3" = "IGF-1 LR3", "SLUPP-332" = "SLU-PP-332", "Melanotan 2" = "melanotan2"),
// sempre começando no INÍCIO de uma palavra ("fenilpropionato" não casa "propionato").
// Devolve a posição onde casou (-1 = não casou).
function _posCompacto(n, kc){
  for (let p = 0; p < n.length - 1; p++) {
    if (n[p] === ' ' && n[p + 1] !== ' ' && n.slice(p + 1).replace(/ /g, '').indexOf(kc) === 0) return p;
  }
  return -1;
}
// Escolha: a substância citada PRIMEIRO no título vence ("Masteron Propionato" = Masteron,
// "Trembolona Enantato" = Trembolona); empate → a que cobre mais do título
// ("Stanozolol 50mg (Oleoso)" = o injetável). Forma escrita no título (oral × injetável)
// diferente da forma da base = não casa (a dose seria de outra apresentação).
const ESTERES_TESTO = ['enantato', 'cipionato', 'propionato', 'undecanoato'];
function _melhorEm(n, lista){
  let melhor = null, pos = Infinity, cob = 0;
  const diz = / oral /.test(n) ? 'oral' : (/ (injetavel|oleoso|inj) /.test(n) ? 'inj' : '');
  (lista || []).forEach(function(s){
    if (diz && s.forma && s.forma !== diz) return;
    let p0 = Infinity, c0 = 0;
    _chavesBase(s).forEach(function(k){
      const kc = k.replace(/ /g, '');
      let p = n.indexOf(' ' + k + ' ');
      if (p < 0 && kc.length >= 5 && /[ 0-9]/.test(k)) p = _posCompacto(n, kc);
      if (p >= 0) { if (p < p0) p0 = p; c0 += kc.length; }
    });
    if (p0 === Infinity) return;
    // Éster sozinho no meio do título é de OUTRA substância ("Trestolona Enantato"):
    // éster de testosterona só vale se abre o título ou se o título fala em testosterona.
    if (ESTERES_TESTO.indexOf(s.id) >= 0 && p0 > 0 && !/ (testosterona|test) /.test(n)) return;
    if (p0 < pos || (p0 === pos && c0 > cob)) { melhor = s; pos = p0; cob = c0; }
  });
  return melhor ? { s: melhor, tam: cob, pos: pos } : null;
}
// Produto com várias substâncias (Mix/Stack/"+") só casa com entrada que também é blend —
// senão a base daria a dose de UMA substância para um frasco com várias.
function _ehBlendBase(s){ return (s.contem && s.contem.length) || String(s.nome).indexOf('+') >= 0; }
function acharNaBase(produto, base){
  const n = ' ' + _nb(produto) + ' ';
  const h = _melhorEm(n, base.horm), p = _melhorEm(n, base.pep);
  let r = null;
  if (h && (!p || CATS_HORM_NO_PEP.indexOf(p.s.cat) >= 0 || h.tam >= p.tam)) r = { tipo: 'horm', s: h.s };
  else if (p) r = { tipo: 'pep', s: p.s };
  if (r && /( \+ | mix | stack | blend )/.test(n) && !_ehBlendBase(r.s)) return null;
  return r;
}
function _faixa(f){ return f ? (f.min + (f.max !== f.min ? '–' + f.max : '') + ' ' + f.un) : ''; }
function _linhaBase(a){
  const s = a.s, p = [];
  if (a.tipo === 'pep') {
    p.push('*' + s.nome + '* [' + (s.cat || 'peptídeo') + ']');
    if (s.dose) p.push('dose: ' + s.dose + (s.dose_mg ? ' (referência: ' + s.dose_mg + ' mg por aplicação)' : ''));
    if (s.freq) p.push('frequência: ' + s.freq);
    if (s.via) p.push('via: ' + s.via);
    if (s.ciclo) p.push('duração: ' + s.ciclo);
    if (s.horario) p.push('horário: ' + s.horario);
    if (s.como) p.push('como usar: ' + s.como);
    if (s.cuidados) p.push('cuidados: ' + s.cuidados);
    if (s.contem && s.contem.length) p.push('é um blend (contém: ' + s.contem.join(', ') + ')');
    if (s.fem === false) p.push('NÃO indicado para mulheres');
  } else {
    p.push('*' + s.nome + '* [hormônio · ' + (s.forma === 'oral' ? 'oral' : 'injetável') + ']');
    if (s.doseM) p.push('faixa masculina: ' + _faixa(s.doseM));
    p.push(s.doseF ? 'faixa feminina: ' + _faixa(s.doseF) : 'sem faixa feminina na base (para mulher, não informe dose desta substância)');
    if (s.doseTRT) p.push('dose de TRT/cruise: ' + _faixa(s.doseTRT));
    if (s.freq) p.push('frequência: ' + s.freq);
    if (s.ciclo) p.push('duração: ' + s.ciclo);
    if (s.meiaVida) p.push('meia-vida: ' + s.meiaVida);
    if (s.oral17aa) p.push('oral 17-alfa-alquilado (hepatotóxico — só um por vez)');
    if (s.familia === '19nor') p.push('derivado 19-nor (só um por ciclo)');
    if (s.nota) p.push('observação: ' + s.nota);
  }
  return '- ' + p.join(' · ');
}
// Mesmas travas do montador (hormônios: 19-nor 2+, 17aa 2+, mesma molécula; peptídeos:
// blend × componente / conflita, e dois análogos de GLP-1).
function conflitosBase(achados, base){
  const out = [];
  const h = achados.filter(function(a){ return a.tipo === 'horm'; }).map(function(a){ return a.s; });
  const p = achados.filter(function(a){ return a.tipo === 'pep'; }).map(function(a){ return a.s; });
  const nor = h.filter(function(s){ return s.familia === '19nor'; });
  const aa = h.filter(function(s){ return s.oral17aa; });
  if (nor.length >= 2) out.push(nor.map(function(s){ return s.nome; }).join(' + ') + ' (dois derivados 19-nor)');
  if (aa.length >= 2) out.push(aa.map(function(s){ return s.nome; }).join(' + ') + ' (dois orais 17-alfa-alquilados)');
  const porAtivo = {};
  h.forEach(function(s){ const a = base.ativoDe ? base.ativoDe(s.id) : s.id; (porAtivo[a] = porAtivo[a] || []).push(s.nome); });
  Object.keys(porAtivo).forEach(function(a){ if (porAtivo[a].length > 1) out.push(porAtivo[a].join(' + ') + ' (a mesma molécula: ' + a + ')'); });
  function partes(s){ return [s.id].concat(s.contem || []).concat(s.conflita || []); }
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
    const pa = partes(p[i]), pb = partes(p[j]);
    if (pa.some(function(x){ return pb.indexOf(x) >= 0; })) out.push(p[i].nome + ' + ' + p[j].nome + ' (mesma molécula ou blend que já contém a outra)');
    else if (p[i].cat === 'GLP-1' && p[j].cat === 'GLP-1') out.push(p[i].nome + ' + ' + p[j].nome + ' (dois análogos de GLP-1)');
  }
  return out;
}
// Conta ÚNICA de rendimento/duração — a MESMA na pré-venda e no protocolo (regra "antes e depois TÊM que bater").
// Hormônio usa o MÍNIMO da faixa, o mesmo ponto de partida do montador do gerador.
const REGRA_RENDIMENTO = 'CONTA DO RENDIMENTO/DURAÇÃO DO FRASCO (a mesma na pré-venda e no protocolo): peptídeo/emagrecedor = dose de referência da base na frequência da base; hormônio = MÍNIMO da faixa (masculina; feminina se for mulher) na frequência da base.';
// Bloco que entra no system prompt do protocolo pós-venda.
async function blocoBaseGerador(produtos, temTabela){
  const base = await carregarBaseGerador();
  if (!base.pep.length && !base.horm.length) return { texto: '', achados: [], semBase: produtos.slice(), conflitos: [] };
  const achados = [], vistos = {}, semBase = [];
  produtos.forEach(function(prod){
    const a = acharNaBase(prod, base);
    if (!a) { semBase.push(prod); return; }
    const k = a.tipo + ':' + a.s.id;
    if (!vistos[k]) { vistos[k] = true; achados.push(Object.assign({ produto: prod }, a)); }
  });
  const conflitos = conflitosBase(achados, base);
  let t = '';
  if (achados.length) {
    t += '\n\n=== BASE OFICIAL DO GERADOR DE PROTOCOLOS VITAFLOW (fonte da verdade p/ DOSE, frequência, via, duração, horário, modo de uso e cuidados) ===\n';
    t += 'Para os produtos abaixo, use ESTES valores. A dose fica DENTRO da faixa/referência da base. Onde a base e as âncoras deste prompt divergirem, vale a BASE. O que a base não trouxer, siga as regras gerais deste prompt. ' + REGRA_RENDIMENTO + '\n';
    t += achados.map(_linhaBase).join('\n');
  }
  if (semBase.length) t += '\n\nProdutos SEM entrada na base (siga as regras gerais deste prompt): ' + semBase.join(', ') + '.';
  if (conflitos.length) {
    t += '\n\n⛔ COMBINAÇÃO QUE NÃO ANDA JUNTA entre os produtos deste cliente: ' + conflitos.join('; ') + '.\n';
    t += 'NUNCA monte esses itens para uso no mesmo período. Monte o protocolo de cada um SEPARADAMENTE e diga ao cliente, com clareza, que eles NÃO devem ser usados juntos.';
  }
  if (temTabela) t += '\n\nTABELA DE FRACIONAMENTO: o sistema anexa a(s) tabela(s) oficial(is) no fim da mensagem. NÃO monte tabela de fracionamento/UI no texto — quando precisar, diga "veja a tabela de fracionamento no fim desta mensagem".';
  return { texto: t, achados: achados, semBase: semBase, conflitos: conflitos };
}

// ── DESCRIÇÃO SOB DEMANDA — de QUAIS produtos? (23/09/2026) ─────────────────────
// Bug de 23/09 (Hemogenin, "quantos comprimidos vem em cada?"): o termo de busca era o
// CONTEXTO inteiro ("O cliente está vendo AGORA esta lista…: A; B; C"). A busca da loja
// exige TODAS as palavras → voltava vazio → a IA dizia "não tenho essa informação", mesmo
// com a quantidade escrita na descrição. Agora:
//  - com lista aberta: pega os NOMES da lista; se a pergunta aponta um (número "o 6", marca,
//    mg…), lê só a descrição dele(s); se vale pra lista toda ("cada"), lê a de todos;
//  - sem lista: busca só pelas palavras de produto da mensagem (tira "quantos", "vem"…).
// Lê só o que foi perguntado (nada de carregar descrição do catálogo inteiro).
var PALAVRAS_PERGUNTA = ['quantos','quantas','quanto','quanta','comprimido','comprimidos','capsula','capsulas','vem','vêm','veem',
  'cada','um','uma','no','na','nos','nas','do','da','dos','das','de','em','o','a','os','as','e','ou','que','qual','quais','tem','tém',
  'contem','contém','frasco','frascos','ampola','ampolas','caneta','canetas','dose','doses','esse','essa','esses','essas','este',
  'esta','estes','estas','isso','isto','dele','dela','deles','delas','por','pra','para','com','sem','como','usa','usar','uso','toma',
  'tomar','aplica','aplicar','serve','composicao','apresentacao','quantidade','dosagem','concentracao','unidade','unidades','vial',
  'caixa','caixas','cartela','produto','produtos','me','fala','diz','sabe','voce','vc','ai','oi','ola','bom','dia','tarde','noite',
  'opcao','numero','item','ele','ela','eles','elas','vem','sao','é','e','tb','tambem','mais','menos','quero','saber','gostaria','pode',
  'dizer','informar','nele','nela','neles','nelas','dentro','vêm','feito','composto','posologia','especificacao','ml','ui','mcg'];
function _nd(s){ return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
var _PERG_ND = PALAVRAS_PERGUNTA.map(_nd);
// Nomes que o botconversa manda no contexto (contextoLista): lista aberta e carrinho.
function nomesDoContexto(contexto){
  var lista = [], carrinho = [];
  String(contexto || '').split('\n').forEach(function(l){
    var i = l.indexOf('): '), j = l.indexOf('CARRINHO: ');
    if (l.indexOf('vendo AGORA') >= 0 && i >= 0) {
      l.slice(i + 3).split(';').forEach(function(n){ n = n.trim(); if (n && lista.indexOf(n) < 0) lista.push(n); });
    } else if (j >= 0) {
      l.slice(j + 10).split('. NUNCA')[0].split(';').forEach(function(n){ n = n.trim(); if (n && carrinho.indexOf(n) < 0) carrinho.push(n); });
    }
  });
  return { lista: lista, carrinho: carrinho };
}
function _tokensUteis(txt){
  return _nd(txt).split(/[^a-z0-9]+/).filter(function(w){ return w.length >= 2 && _PERG_ND.indexOf(w) < 0; });
}
async function _produtosPorQuery(q, max){
  try {
    var query = 'query($q:String!,$n:Int!){ products(first:$n, query:$q){ edges{ node{ title description } } } }';
    var r = await fetch(SHOP_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN },
      body: JSON.stringify({ query: query, variables: { q: q, n: max || 3 } })
    });
    var d = await r.json();
    return ((d && d.data && d.data.products && d.data.products.edges) || []).map(function(e){ return e.node || {}; });
  } catch (e) { return []; }
}
function _porTitulo(nome){ return _produtosPorQuery('title:"' + String(nome).replace(/["\\]/g, ' ').trim() + '"', 1); }
// Pergunta de detalhe que vale pra VÁRIOS produtos ("quantos vem em cada?") — 23/09/2026.
var MULTI_DETALHE = '\nSe a pergunta vale para VÁRIOS produtos (ex.: "cada", "todos", "esses"), responda UM PRODUTO POR LINHA, na MESMA ORDEM e com o MESMO NÚMERO da lista que o cliente está vendo (o "Nº X da lista" vem antes de cada descrição acima), no formato: número, nome do produto e o dado perguntado. Para os que a descrição NÃO traz o dado, escreva "não consta na descrição". NÃO resuma, NÃO agrupe ("a maioria vem com…") e NÃO pule nenhum. Se um item não for do tipo perguntado (ex.: injetável quando perguntam comprimidos), diga o que ele é pela descrição.';
async function descricoesDaPergunta(mensagem, contexto){
  var ctx = nomesDoContexto(contexto);
  var nomes = ctx.lista.length ? ctx.lista : ctx.carrinho;
  var achados = [];
  if (nomes.length) {
    var alvo = [];
    // "o 6", "número 6", "do 6" (não confunde com "50mg", "60 comprimidos"…)
    var mNum = _nd(mensagem).match(/(?:^|\s)(?:o|a|numero|n[o°º]|opcao|item|do|da)\s*(\d{1,2})(?!\s*(?:mg|ml|ui|mcg|g\b|comp|cap|x\b|un))/);
    var n = mNum ? parseInt(mNum[1], 10) : 0;
    if (n >= 1 && n <= nomes.length) alvo = [nomes[n - 1]];
    else {
      // palavra que está em TODOS os nomes (ex.: "hemogenin") não escolhe ninguém; as outras
      // ("king", "25mg", "zphc"…) apontam o(s) produto(s) perguntado(s).
      var _tn = function(nm){ return ' ' + _nd(nm).replace(/[^a-z0-9]+/g, ' ') + ' '; };
      var tk = _tokensUteis(mensagem).filter(function(w){ return !nomes.every(function(nm){ return _tn(nm).indexOf(' ' + w + ' ') >= 0; }); });
      if (tk.length) {
        // fica com o(s) que casam MAIS palavras ("king pharma" = King, não Cooper Pharma)
        var pts = nomes.map(function(nm){ var t = _tn(nm); return tk.filter(function(w){ return t.indexOf(' ' + w + ' ') >= 0; }).length; });
        var maxp = Math.max.apply(null, pts);
        if (maxp > 0) alvo = nomes.filter(function(nm, i){ return pts[i] === maxp; });
        if (alvo.length === nomes.length) alvo = [];
      }
    }
    if (alvo.length) {
      var rs = await Promise.all(alvo.slice(0, 10).map(_porTitulo));
      rs.forEach(function(r){ if (r[0]) achados.push(r[0]); });
    } else {
      // pergunta vale pra lista toda ("cada"): se todos começam pela mesma palavra, uma busca só
      // pega a lista inteira (inclusive os que passam dos 10 nomes do contexto); senão, título a título.
      var prim = _nd(nomes[0]).split(/[^a-z0-9]+/).filter(Boolean)[0] || '';
      var todosComecam = prim.length >= 3 && nomes.every(function(nm){ return _nd(nm).split(/[^a-z0-9]+/).filter(Boolean)[0] === prim; });
      if (todosComecam) achados = await _produtosPorQuery('title:' + prim + '*', 30);
      // o que a busca por prefixo não trouxe (ou lista com nomes variados): título a título, até 15
      var _kk = function(t){ return _nd(t).replace(/[^a-z0-9]+/g, ' ').trim(); };
      var jaTem = {}; achados.forEach(function(p){ jaTem[_kk(p.title)] = true; });
      var faltam = nomes.filter(function(nm){ return !jaTem[_kk(nm)]; }).slice(0, 15);
      if (faltam.length) {
        var rs2 = await Promise.all(faltam.map(_porTitulo));
        rs2.forEach(function(r){ if (r[0]) achados.push(r[0]); });
      }
      // só o que está na lista que o cliente vê (a busca por prefixo pode trazer outros)
      var naLista = {}; nomes.forEach(function(nm){ naLista[_kk(nm)] = true; });
      var soLista = achados.filter(function(p){ return naLista[_kk(p.title)]; });
      if (soLista.length) achados = soLista;
    }
  } else {
    var tk2 = _tokensUteis(mensagem);
    if (tk2.length) achados = await _produtosPorQuery(tk2.join(' '), 3);
  }
  // Na ORDEM da lista que o cliente vê, com o NÚMERO dela (o que ele digita pra escolher).
  var _k = function(t){ return _nd(t).replace(/[^a-z0-9]+/g, ' ').trim(); };
  var posLista = {}; ctx.lista.forEach(function(nm, i){ posLista[_k(nm)] = i + 1; });
  achados = achados.map(function(p){ return { p: p, n: posLista[_k(p.title)] || 0 }; })
    .sort(function(a, b){ return (a.n || 999) - (b.n || 999); });
  var blocos = [], total = 0;
  achados.forEach(function(x){
    var p = x.p, desc = String(p.description || '').trim();
    if (!desc) desc = '(sem descrição cadastrada)';
    if (desc.length > 1500) desc = desc.slice(0, 1500) + '…';
    if (total + desc.length > 15000) return;
    total += desc.length;
    blocos.push('• ' + (x.n ? 'Nº ' + x.n + ' da lista — ' : '') + String(p.title || '').trim() + ':\n' + desc);
  });
  if (!blocos.some(function(b){ return b.indexOf('(sem descrição cadastrada)') < 0; })) return '';
  console.log('[IA] descrição sob demanda | nomes no contexto:', nomes.length, '| lidas:', blocos.length);
  return blocos.join('\n\n');
}

// ── PRÉ-VENDA lendo a MESMA base (23/09/2026) ────────────────────────────────────
// Produtos em conversa (lista aberta, carrinho ou citados na mensagem) → valores da base,
// pra estimativa de ANTES da compra bater com o protocolo de DEPOIS.
async function blocoBasePreVenda(mensagem, contexto){
  const base = await carregarBaseGerador();
  if (!base.pep.length && !base.horm.length) return '';
  const ctx = nomesDoContexto(contexto);
  const achados = [], vistos = {};
  // a mensagem pode citar mais de um produto ("a retatrutida e o klow"): testa cada pedaço também
  const pedacos = String(mensagem || '').split(/,|;| e | ou /i);
  ctx.lista.concat(ctx.carrinho).concat([mensagem]).concat(pedacos).forEach(function(c){
    const a = acharNaBase(c, base); if (!a) return;
    const k = a.tipo + ':' + a.s.id;
    if (!vistos[k]) { vistos[k] = true; achados.push(a); }
  });
  if (!achados.length) return '';
  return '\n\n=== BASE OFICIAL DO GERADOR DE PROTOCOLOS (a MESMA do protocolo pós-venda) ===\n' +
    'Quando falar de dose, frequência, duração ou quanto um frasco rende destes produtos, use ESTES valores — a estimativa de ANTES da compra tem que bater com o protocolo de DEPOIS. Onde a base e as âncoras deste prompt divergirem, vale a BASE. ' +
    REGRA_RENDIMENTO + ' A regra da CONSULTORIA continua: protocolo completo e personalizado só depois da compra.\n' +
    achados.slice(0, 8).map(_linhaBase).join('\n');
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type', 'Content-Type':'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' };
  const vazio = { statusCode:200, headers, body: JSON.stringify({ resposta:'', abriuLista:false }) };
  try {
    const body = JSON.parse(event.body || '{}');
    const phone = body.phone;
    const mensagem = (body.mensagem || '').toString().trim();
    const contexto = (body.contexto || '').toString().trim();
    const promoContext = (body.promoContext || '').toString().trim();
    ACEITA_PARCIAL = !body.semParcial;   // v90: Athena pede só resposta COMPLETA (senão cai no "👀")
    // Prazo total desta function. O Netlify corta em 10s e o botconversa.js ainda precisa
    // responder depois — então trabalhamos com folga.
    const PRAZO_MS = Math.max(3000, Math.min(8000, parseInt(body.prazoMs, 10) || 7000));
    const t0 = Date.now();
    console.log('[IA-SYNC] START | phone:', phone, '| msg:', mensagem.slice(0,80), '| prazo:', PRAZO_MS);
    if (!phone || !mensagem) return vazio;

    const historico = await lerHistorico(phone);
    const catalogo = await catalogoResumo();

    let sys = SYSTEM
      + '\n\n=== FICHAS TÉCNICAS OFICIAIS (fonte da verdade p/ composição/o que é — use SÓ isto; NÃO invente) ===\n' + FICHAS_TECNICAS
      + '\n\n=== CATÁLOGO REAL (preços e disponibilidade de hoje) ===\n' + catalogo + '\n' + FIM_CATALOGO;
    if (promoContext) {
      sys += '\n\n=== PROMOÇÕES E DESCONTOS (regras REAIS de hoje — use SOMENTE isto, NÃO invente promoção) ===\n' + promoContext;
    }
    if (contexto) {
      sys += '\n\n=== CONTEXTO ATUAL DO CLIENTE (PRIORIDADE MÁXIMA) ===\n' + contexto
           + '\nResponda com base NESSE contexto atual. Se o histórico falar de outro produto/assunto, IGNORE — o cliente está tratando do que está acima AGORA.';
    }

    // 23/09: pré-venda com a MESMA base do Gerador que o protocolo pós-venda usa. Aqui o prazo é
    // curto (webhook): se a base não vier em 1,5 s, segue sem ela (a leitura continua e fica em cache).
    try {
      sys += await Promise.race([ blocoBasePreVenda(mensagem, contexto), new Promise(function(r){ setTimeout(function(){ r(''); }, 1500); }) ]);
    } catch (e) { console.log('[IA-SYNC] base do gerador na pré-venda falhou (segue sem ela):', e.message); }

    // ── DESCRIÇÃO SOB DEMANDA: só quando o cliente PERGUNTA um detalhe do produto ──
    // Lê a descrição da página do produto na hora. Se não tiver descrição, a IA responde
    // HONESTAMENTE que não tem essa info (NÃO promete confirmar, NÃO inventa).
    if (ehPerguntaDetalheProduto(mensagem)) {
      const descProd = await descricoesDaPergunta(mensagem, contexto);   // 23/09: só dos produtos perguntados
      console.log('[IA-SYNC] pergunta de detalhe do produto | descrição encontrada:', descProd ? 'sim' : 'nao');
      if (descProd) {
        sys += '\n\n=== DESCRIÇÃO OFICIAL DO PRODUTO (da página da loja — use SÓ isto p/ responder o detalhe perguntado) ===\n' + descProd;
        sys += '\n\n=== COMO RESPONDER ESTA PERGUNTA DE DETALHE ===\nResponda o que o cliente perguntou USANDO SOMENTE a descrição oficial acima. Se a descrição NÃO trouxer exatamente o dado perguntado, diga com honestidade que não consta essa informação. NUNCA invente quantidade, composição, dosagem ou qualquer dado. NÃO prometa "confirmar depois".' + MULTI_DETALHE;
      } else {
        sys += '\n\n=== PERGUNTA DE DETALHE SEM DESCRIÇÃO DISPONÍVEL ===\nO cliente perguntou um detalhe do produto, mas ESTE produto NÃO tem descrição cadastrada. Responda com honestidade que você não tem essa informação disponível. NÃO invente. NÃO prometa "vou confirmar" ou "já te confirmo" — apenas diga, de forma educada, que essa informação não está disponível.';
      }
    }

    const restante = PRAZO_MS - (Date.now() - t0);
    const pensado = await pensarComClaude(sys, mensagem, historico, restante - 450);   // v90: folga para gravar o histórico e devolver
    const reply = travarFreteInventado(pensado.texto);   // v78: nunca frete inventado nem checkout simulado
    if (!reply) { console.log('[IA-SYNC] sem resposta do modelo dentro do prazo.'); return vazio; }

    // O cliente NUNCA vê o marcador.
    const replyLimpo = reply.replace(/\[\[\s*(LISTA|STACK|COMPRAR)\s*:[^\]]*\]\]/gi, '').trim();

    // ── COMBO/STACK ──
    const mStack = reply.match(/\[\[\s*STACK\s*:\s*([^\]]+?)\s*\]\]/i);
    if (mStack) {
      const partes = mStack[1].split('|').map(function(s){
        const idx = s.indexOf(':');
        const col = (idx >= 0 ? s.slice(0, idx) : s).trim().toLowerCase();
        const termo = (idx >= 0 ? s.slice(idx + 1) : '').trim();
        return { colecao: col, termo: termo };
      }).filter(function(p){ return p.colecao || p.termo; });
      if (partes.length) {
        const primeiro = partes[0];
        const abertura = await montarLista(primeiro.colecao, primeiro.termo, (Date.now() - t0) > 6500);
        if (abertura && abertura.linhas.length) {
          const cap = function(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
          const fila = partes.slice(1).map(function(p){
            return { label: cap(p.termo || p.colecao), tipo: 'lista', colecao: p.colecao,
                     filtro: p.termo ? [p.termo] : [], ester: '' };
          });
          const sessAtual = await getSession(phone);
          await saveSession(phone, Object.assign({}, sessAtual, { state:'LISTA_PRODUTOS', produtoLista: abertura.produtoLista, stackFila: fila, errosSeguidos:0 }));
          const corpo = (replyLimpo ? replyLimpo + '\n\n' : '') + formatarLista(abertura.linhas) + '\n\n*Digite o número do produto:*';
          await salvarHistorico(phone, historico.concat([
            { role:'user', content: mensagem },
            { role:'assistant', content: replyLimpo || '(abriu combo)' }
          ]));
          console.log('[IA-SYNC] devolvendo STACK em', (Date.now()-t0), 'ms');
          return { statusCode:200, headers, body: JSON.stringify({ resposta: corpo, abriuLista:true }) };
        }
      }
    }

    // ── v78: COMPRAR — [[COMPRAR:colecao:termo]]: 1 produto → pergunta se pode colocar no carrinho ──
    const mComprar = reply.match(/\[\[\s*COMPRAR\s*:\s*([a-z0-9\-]*)\s*:\s*([^\]]*?)\s*\]\]/i);
    if (mComprar) {
      const colC = (mComprar[1] || '').toLowerCase(), termoC = mComprar[2] || '';
      const abC = await montarLista(colC, termoC, (Date.now() - t0) > 6500);
      if (abC && abC.produtoLista.length === 1) {
        const prod = Object.assign({}, abC.produtoLista[0], { colecao: colC });
        const sessAtual = await getSession(phone);
        await saveSession(phone, Object.assign({}, sessAtual, { state:'CONFIRMAR_CARRINHO', produtoSelecionado: prod, errosSeguidos:0 }));
        const corpo = (replyLimpo ? replyLimpo + '\n\n' : '') + msgConfirmarCarrinho(prod);
        await salvarHistorico(phone, historico.concat([
          { role:'user', content: mensagem },
          { role:'assistant', content: (replyLimpo ? replyLimpo + ' ' : '') + '(perguntou se pode colocar ' + prod.nome + ' no carrinho)' }
        ]));
        console.log('[IA-SYNC] devolvendo COMPRAR em', (Date.now()-t0), 'ms');
        return { statusCode:200, headers, body: JSON.stringify({ resposta: corpo, abriuLista:true }) };
      }
      if (abC && abC.linhas.length > 1) {
        const sessAtual = await getSession(phone);
        await saveSession(phone, Object.assign({}, sessAtual, { state:'LISTA_PRODUTOS', produtoLista: abC.produtoLista, errosSeguidos:0 }));
        const corpo = (replyLimpo ? replyLimpo + '\n\n' : '') + formatarLista(abC.linhas) + '\n\n*Digite o número do produto:*';
        await salvarHistorico(phone, historico.concat([
          { role:'user', content: mensagem },
          { role:'assistant', content: replyLimpo || ('(abriu a lista de ' + termoC + ')') }
        ]));
        return { statusCode:200, headers, body: JSON.stringify({ resposta: corpo, abriuLista:true }) };
      }
    }

    // ── LISTA simples ──
    const mLista = reply.match(/\[\[\s*LISTA\s*:\s*([a-z0-9\-]*)\s*:\s*([^\]]*?)\s*\]\]/i);
    if (mLista) {
      const colecao = mLista[1] || '';
      const termo = mLista[2] || '';
      const abertura = await montarLista(colecao, termo, (Date.now() - t0) > 6500);   // sem tempo (teto de 10 s): não consulta a loja
      if (abertura && abertura.linhas.length) {
        const sessAtual = await getSession(phone);
        await saveSession(phone, Object.assign({}, sessAtual, { state:'LISTA_PRODUTOS', produtoLista: abertura.produtoLista, errosSeguidos:0 }));
        const corpo = (replyLimpo ? replyLimpo + '\n\n' : '') + formatarLista(abertura.linhas) + '\n\n*Digite o número do produto:*';
        await salvarHistorico(phone, historico.concat([
          { role:'user', content: mensagem },
          { role:'assistant', content: replyLimpo || ('(abriu a lista de ' + (termo || colecao) + ')') }
        ]));
        console.log('[IA-SYNC] devolvendo LISTA em', (Date.now()-t0), 'ms');
        return { statusCode:200, headers, body: JSON.stringify({ resposta: corpo, abriuLista:true }) };
      }
      if (String(termo).trim()) {   // v90: lista vazia → fala a verdade (esgotado / não encontrei), sem "👇" pendurado
        const vazia = msgListaVazia(abertura, termo, replyLimpo);
        await salvarHistorico(phone, historico.concat([{ role:'user', content: mensagem }, { role:'assistant', content: vazia }]));
        console.log('[IA-SYNC] LISTA vazia | termo:', termo, '| esgotado:', !!(abertura && abertura.esgotado));
        return { statusCode:200, headers, body: JSON.stringify({ resposta: vazia, abriuLista:false }) };
      }
    }

    // ── Resposta normal ──
    const textoFinal = replyLimpo || reply;
    await salvarHistorico(phone, historico.concat([
      { role:'user', content: mensagem },
      { role:'assistant', content: textoFinal }
    ]));
    console.log('[IA-SYNC] devolvendo texto em', (Date.now()-t0), 'ms | modelo:', pensado.modelo);
    return { statusCode:200, headers, body: JSON.stringify({ resposta: textoFinal, abriuLista:false }) };

  } catch (e) {
    console.log('[IA-SYNC] EXCECAO handler:', e.message);
    return vazio;
  }
};
