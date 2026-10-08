'use strict';
/* =============================================================================
   conta-cliente.js — MINHA CONTA VITAFLOW (Fase 1)  ·  v11  ·  08/10/2026
   v11 (08/10 — o reenvio VF-0710-R002 não foi dividido; GAS v62 passa a criar linha D também para reenvio R): o cartão do REENVIO
       mostra as linhas D dele como pacotes 2, 3… (código de rastreio de cada um), e cada item no pacote certo. Antes: só a linha R.
   v10 (ordem do Thiago, 05/10: "os clientes sejam obrigados a se cadastrar ao realizarem a compra… deixe apenas um botão para o
       caso de alguém não querer"; respostas: senha no carrinho mesmo · e-mail que já tem conta pede a senha, com a saída de
       comprar sem entrar · quem não se cadastra não perde nada; esboço v1 aprovado: "ok, ficou bom. pode publicar"):
       · acao 'conta_existe' {email} → { existe } — o carrinho usa para mostrar "Este e-mail já tem conta" (só conta CONFIRMADA).
       · acao 'criar_no_carrinho' {email, senha, nome, cpf, telefone, endereco} → cria a conta NA HORA DA COMPRA, com `pendente: true`
         (e-mail ainda não confirmado), guarda o que o cliente digitou (telefone e endereço no cadastro; CPF) e devolve a sessão.
         Manda o e-mail "Confirme seu e-mail". Conta confirmada com o mesmo e-mail → erro 'ja_existe'. Conta pendente → é refeita.
       · CONTA PENDENTE NÃO LÊ A PLANILHA: 'minha_conta' devolve a conta vazia com `pendente: true`; 'dados_compra' devolve só o que a
         própria pessoa digitou. Motivo: a conta mostra os pedidos pelo CPF/e-mail — sem confirmar o e-mail, bastaria digitar o
         e-mail de outra pessoa e inventar uma senha para ver os pedidos dela.
       · acao 'confirmar_email' {link, sessao} → confirma com UM clique só quando o navegador que abriu o link tem a sessão criada na
         compra. Sem essa sessão devolve 'precisa_senha' e a página pede uma senha nova ('criar_senha', que já confirma): assim uma
         conta criada por terceiros com o e-mail de alguém nunca é confirmada com a senha de quem a criou; e o que o terceiro
         digitou (telefone, endereço, CPF) é descartado.
       · acao 'reenviar_confirmacao' {sessao} → manda o link de novo (mesmos limites do 'pedir_link').
       · 'validar_link' e 'entrar' devolvem `pendente`.
       · CORREÇÃO: 'criar_senha' (esqueci a senha) regravava o usuário SEM o cadastro — o telefone e os endereços salvos em
         "Meus dados" eram apagados a cada troca de senha. Agora o cadastro é mantido.
   v5 (pedido do Thiago, 02/10: "os dados do cliente servem para comprar no site sem digitar tudo de novo"): acao 'dados_compra'
       (precisa da sessão do cliente logado) devolve os dados do ÚLTIMO pedido dele prontos para o formulário do carrinho: nome,
       e-mail, telefone, CPF completo e o endereço separado em CEP, rua, número, complemento, bairro, cidade e UF. O endereço só
       é separado quando está no formato que o carrinho grava ("Rua, 10 apto 2, Bairro, Cidade - UF, CEP: 00000-000"); fora
       disso vão só as partes certas (CEP/bairro/cidade/UF) e o cliente completa. Quem lê: sections/main-cart-footer.liquid.
   v4 (ordem do Thiago, 01-02/10: "o mesmo aviso da página de rastreio na Minha Conta"): cada envio ganha `aviso` { tipo, texto }
       — o MESMO que a página de rastreio mostra para aquele pedido (rastreio-consulta v7: textos do Thiago; 1 e 2 quando a
       logística marca Postado e a transportadora ainda não leu; atacado; visto em trânsito). Só em pedido em andamento.
   v3 (01/10/2026): MEUS CUPONS. A resposta de 'minha_conta' ganha a lista `cupons`: o cupom de atraso na entrega que a
       logistica-painel v4 gera (vitaflow_sync/logistica/cupons_atraso/<pedido>) para os pedidos DESTA conta — código,
       desconto, validade e situação (disponível / usado / vencido, lida da coleção cupons_vitaflow, a mesma do carrinho).
       Só pedidos da conta dos últimos 200 dias; revendedor (V) e reenvio (R) nunca têm cupom.
   v2 (01/10/2026): PACOTES AUTOMÁTICOS. A linha D criada pelo Compras (GAS v53) traz a coluna PEDIDO_ORIGINAL e o
       fornecedor do pacote: (1) a linha D é ligada ao pedido pelo PEDIDO_ORIGINAL (sem adivinhar por nome/dia);
       (2) cada envio cuja linha tem UM fornecedor só na coluna COMPRADO_FORNECEDORES fica com os itens daquele
       fornecedor — o cliente vê o que vai em cada pacote antes mesmo de existir código. As linhas D antigas (feitas à
       mão, sem PEDIDO_ORIGINAL) continuam pelas regras da v1.
   Netlify Function no repo vitaflow-proxy → netlify/functions/conta-cliente.js
   URL: https://vitaflow-proxy.netlify.app/.netlify/functions/conta-cliente   (POST JSON { acao, ... })

   DECISÕES DO THIAGO (plano claude/plano_minha_conta_cliente_2026-09-29.md)
     · Motor = Netlify + Firebase (não o Apps Script). Senha com hash + salt em nó PRIVADO do Firebase.
     · Login = e-mail + senha; o e-mail é confirmado por link UMA vez (criar conta) e no "esqueci a senha".
       O link vai SEMPRE para o e-mail digitado; quem digita o CPF vê o e-mail do pedido mascarado e o link vai para ele.
     · "Manter conectado" = 90 dias. Sem marcar = 1 dia.
     · Só vê os pedidos quem prova que é dono do e-mail usado neles (nunca "CPF + outro e-mail").
     · Pedido de REVENDEDOR (prefixo V) NÃO aparece.
     · Linha D (VF-DDMM-D…) = outro ENVIO do mesmo pedido (pacote), não é pedido: não soma no total nem no sorteio.
       Casamento D → pedido original: mesmo dia (VF-DDMM) + mesmo nome (e, se houver dois pedidos do mesmo nome no dia,
       o número mais parecido: D054/D154/D254 → …054). Se a linha D tiver e-mail ou CPF de OUTRA pessoa, é descartada.
     · Linha R (reenvio) aparece como "Reenvio", sem valor e fora do total.
     · Pacote = envio real (linha do pedido + linhas D). Itens dentro do pacote SÓ quando o casamento é certo
       (1 envio; ou código igual ao da etiqueta EnvioEcom → itens do fornecedor VitaFlow; ou código igual ao
       campo rastreio do fornecedor no Compras). Senão os itens aparecem no pedido, com "do pedido X".
     · NUNCA sai nome de fornecedor, custo nem código antes da 1ª leitura da transportadora (mesma regra do rastreio).
     · Avaliação: uma por grupo, quando TODOS os envios estão entregues. Nota 1 ou 2 avisa no Telegram.
     · "Como conheceu": opcional na criação; quem pulou vê o cartão até responder. "Outro" = texto até 60 letras.

   AÇÕES DO CLIENTE
     pedir_link {email|cpf}            → manda o link (30 min, uso único) pro e-mail. Devolve o e-mail mascarado.
     validar_link {link}               → confere o link (não gasta). Diz se a conta já existe.
     criar_senha {link, senha, manter, como, outro} → cria/troca a senha, gasta o link e já entra (devolve a sessão).
     entrar {email, senha, manter}     → devolve a sessão.
     sair {sessao}
     minha_conta {sessao}              → tudo da página (resumo, grupos/pacotes, produtos, sorteio, dados).
     como_conheceu {sessao, opcao, outro}
     avaliar {sessao, grupo, nota, marcadores, comentario}

   AÇÕES DO ATENDIMENTO (painel da logística; idToken do Firebase Auth + admins/<uid> = true)
     adm_buscar {idToken, termo}                    → pedidos por CPF, e-mail ou número (com o e-mail de cada um).
     adm_trocar_email {idToken, pedidos[], email}   → troca o e-mail na PLANILHA (GAS editar_pedido) + espelho/índice.
     adm_reenviar_link {idToken, email}             → manda o link de criar conta / nova senha.
     adm_painel {idToken}                           → avaliações e respostas do "como conheceu".

   FIREBASE (tudo em vitaflow_contas/, só esta função lê e grava — o nó NÃO é público)
     usuarios/<emailKey>   {email, nome, hash, salt, versao, criado, atualizado, como{opcao,outro,em}, ultimo_acesso}
     links/<sha256>        {email, criado, exp, usado}
     sessoes/<sha256>      {email, criado, exp, versao, manter}
     limites/<chave>       {n, desde}
     avaliacoes/<grupo>    {nota, marcadores, comentario, email, nome, pedidos, em}
     como/<emailKey>       {opcao, outro, em}
     correcoes_email/<id>  {quando, uid, pedidos, de, para}
   LÊ: vitaflow_idx_email · vitaflow_idx_cpf · vitaflow_pedidos(_hdr) · vitaflow_compras · vitaflow_historico_status
       vitaflow_sync/rastreio_eventos · vitaflow_sorteio
   v6 (02/10/2026 — ordem do Thiago: "tem que ser pelo CPF"): a conta mostra os pedidos pagos do e-mail da conta E os pedidos pagos
       do(s) CPF(s) desses pedidos, mesmo feitos com outro e-mail (é a mesma lista que o rastreio por CPF já mostra).
       dados_compra / Meus dados: telefone = o do pedido mais recente que tem telefone; endereço = o do pedido mais recente, separado
       nos dois formatos que a planilha grava (carrinho do site e Athena/Orçamento). Pedido mais recente sem endereço separável:
       usa o endereço separável mais recente do MESMO CEP (ou, se o mais recente nem CEP tem, o separável mais recente).
   v7 (02/10/2026): cada produto de "Produtos que já comprei" leva o `pid` (id do produto no site — o vfId gravado pelo Compras),
       para a página achar o produto certo mesmo quando o nome dele mudou no site. Sem vfId no Compras: pid vazio.
   v8 (02/10/2026 — pedido do Thiago): CADASTRO editável pelo cliente. Nome, CPF e e-mail continuam travados; o cliente edita o
       TELEFONE e guarda até 5 ENDEREÇOS (um é o principal). Fica em usuarios/<emailKey>/cadastro {telefone, enderecos[], principal, em}.
       acao `salvar_dados` {sessao, telefone, enderecos:[{cep,rua,numero,complemento,bairro,cidade,uf}], principal}.
       minha_conta → dados.cadastro {salvo, telefone, enderecos, principal} (nunca salvou: sugestão tirada dos pedidos, salvo:false).
       dados_compra → o cadastro salvo vale primeiro; devolve também `enderecos` e `principal` para o carrinho oferecer a escolha.
       Pedidos já feitos não mudam.
   v9 (02/10/2026 — pedido do Thiago: ver a conta como o cliente vê): PRÉVIA DO ATENDIMENTO.
       adm_previa_link {idToken, termo}  → (só admin) acha o e-mail do cliente pelo pedido/CPF/e-mail e devolve um link da Minha Conta
                                           com um código de prévia que vale 15 min. Guarda só o hash em previas/<sha256> {email, exp, uid}.
       previa {token}                    → a mesma montagem do minha_conta, SÓ LEITURA, marcada com previa:true. Não cria conta, não
                                           abre sessão, não grava nada do cliente. Não serve para salvar_dados, avaliar nem dados_compra.
   Variáveis: FIREBASE_SECRET · BREVO_API_KEY · TELEGRAM_TOKEN/TELEGRAM_CHAT (já existem) · COMPRAS_KEY (NOVA, só pra trocar e-mail)
   ============================================================================= */
var crypto = require('crypto');
var R = require('./rastreio-consulta.js').lib;

var VERSAO = 'v10';
var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var RAIZ = 'vitaflow_contas';
var GAS_URL = 'https://script.google.com/macros/s/AKfycbxFlaN0FXFbpcC8HZ80sxnq383m5d-xTaj5cg72VcCdnYx47N_qKkiELFN5KAPmm_nb/exec';
var PAGINA = 'https://vitaflowoficial.com/pages/minha-conta';
var LOGO = 'https://cdn.shopify.com/s/files/1/0777/9762/1945/files/vitaflow_no_bg_pro.png?v=1775266917';
var DIA = 86400000;
var LINK_VALIDADE = 30 * 60000;
var LINK_CONFIRMAR_VALIDADE = 24 * 3600000;   /* v10: o link de confirmar a conta criada na compra vale 24 h (o cliente está pagando e só vê o e-mail depois) */
var SESSAO_MANTER = 90 * DIA, SESSAO_CURTA = DIA;
var MAX_PEDIDOS = 150;
/* v3: cupom de atraso (gravado pela logistica-painel v4) */
var LOG_CUPONS = 'vitaflow_sync/logistica/cupons_atraso';
var FS_PROJETO = 'pricehub-f0236';
var FS_KEY = process.env.FIRESTORE_KEY || 'AIzaSyBxaI82P6OjCoPtBA-kNZZ0-F0RdjYdNhw';   /* chave web do Firebase — a mesma (pública) do carrinho do site */
var COMO_OPCOES = ['Instagram', 'Google', 'Indicação de amigo', 'Grupo de WhatsApp', 'Telegram', 'YouTube', 'TikTok', 'Outro'];
var MARCADORES = ['Prazo de entrega', 'Atendimento', 'Produto', 'Embalagem', 'Preço'];

var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};
function resp(obj) { return { statusCode: 200, headers: CORS, body: JSON.stringify(obj) }; }
function erro(codigo, msg, extra) { var o = { ok: false, erro: codigo, msg: msg }; if (extra) for (var k in extra) o[k] = extra[k]; return resp(o); }

/* ============================ Firebase ============================ */
function segredo() { return process.env.FIREBASE_SECRET || ''; }
function fbUrl(caminho, query) {
  return FB_BASE + '/' + caminho + '.json?auth=' + encodeURIComponent(segredo()) + (query ? '&' + query : '');
}
async function fbReq(metodo, caminho, corpo, query) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, 7000);
  try {
    var op = { method: metodo, signal: ctrl.signal };
    if (corpo !== undefined) { op.headers = { 'Content-Type': 'application/json' }; op.body = JSON.stringify(corpo); }
    var r = await fetch(fbUrl(caminho, query), op);
    if (!r.ok) throw new Error('firebase ' + metodo + ' ' + r.status + ' ' + caminho);
    return await r.json();
  } finally { clearTimeout(t); }
}
var fbGet = function (c, q) { return fbReq('GET', c, undefined, q); };
async function fbGetOu(c, q) { try { return await fbReq('GET', c, undefined, q); } catch (e) { return null; } }
var fbPut = function (c, v) { return fbReq('PUT', c, v); };
var fbPatch = function (c, v) { return fbReq('PATCH', c, v); };
var fbDel = function (c) { return fbReq('DELETE', c); };

/* ============================ helpers ============================ */
function chaveFb(s) { return String(s || '').replace(/[.#$\[\]\/]/g, '_'); }
function normEmail(s) { return String(s || '').trim().toLowerCase(); }
function emailValido(e) { return e.length <= 120 && /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[a-z]{2,}$/i.test(e); }
function emailKey(e) { return chaveFb(normEmail(e)); }
function soDig(s) { return String(s || '').replace(/\D/g, ''); }
function cpf11(v) { var d = soDig(v); return d.length === 10 ? '0' + d : d; }
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function tokenNovo() { return crypto.randomBytes(32).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function semAc(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function up(s) { return semAc(s).toUpperCase().replace(/\s+/g, ' ').trim(); }
function mascararEmail(e) {
  var p = String(e || '').split('@'); if (p.length !== 2) return '';
  return p[0].charAt(0) + new Array(Math.max(p[0].length - 1, 3) + 1).join('*') + '@' + p[1];
}
function mascararCpf(c) { c = cpf11(c); if (c.length !== 11) return ''; return '***.' + c.slice(3, 6) + '.' + c.slice(6, 9) + '-**'; }
function primeiroNome(n) {
  var w = String(n || '').trim().split(/\s+/)[0] || '';
  if (!w) return '';
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}
function nomeBonito(n) {
  return String(n || '').trim().toLowerCase().replace(/(^|\s)(\S)/g, function (a, e, l) { return e + l.toUpperCase(); })
    .replace(/ (Da|De|Do|Das|Dos|E) /g, function (a) { return a.toLowerCase(); });
}
function limpaTexto(s, max) { return String(s || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
/* ---- v8: cadastro do cliente ---- */
var MAX_ENDERECOS = 5;
function limpaCampo(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function telDigitos(v) { var t = soDig(v); if (t.length > 11 && t.indexOf('55') === 0) t = t.slice(2); return t; }
function normEndereco(e) {
  e = e || {};
  var cep = soDig(e.cep); if (cep.length !== 8) return null;
  var o = { cep: cep.slice(0, 5) + '-' + cep.slice(5), rua: limpaCampo(e.rua, 120), numero: limpaCampo(e.numero, 15), complemento: limpaCampo(e.complemento, 60),
    bairro: limpaCampo(e.bairro, 60), cidade: limpaCampo(e.cidade, 60), uf: limpaCampo(e.uf, 2).toUpperCase() };
  if (!o.rua || !o.numero || !o.bairro || !o.cidade || !/^[A-Z]{2}$/.test(o.uf)) return null;
  return o;
}
function cadastroSalvo(u) {
  var c = u && u.cadastro; if (!c || typeof c !== 'object') return null;
  var ends = (Array.isArray(c.enderecos) ? c.enderecos : []).map(normEndereco).filter(Boolean).slice(0, MAX_ENDERECOS);
  var pr = parseInt(c.principal, 10); if (!(pr >= 0 && pr < ends.length)) pr = 0;
  return { telefone: telDigitos(c.telefone), enderecos: ends, principal: pr };
}
function ipDe(event) {
  var h = event.headers || {};
  var ip = h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || 'sem-ip';
  return sha('ip:' + String(ip).trim()).slice(0, 20);
}
function prefixo(ped) { var p = String(ped || '').trim().toUpperCase().split('-'); return p.length >= 3 ? p[2].charAt(0) : ''; }
function ehRevendedor(ped) { return /^VF-\d{4}-V/i.test(String(ped || '').trim()); }
function diaDoNumero(ped) { var m = String(ped || '').trim().toUpperCase().match(/^(VF-\d{4}-)/); return m ? m[1] : ''; }
function seqDoNumero(ped) { var m = String(ped || '').trim().match(/(\d+)\s*$/); return m ? m[1] : ''; }
function parseValor(v) {
  var s = String(v == null ? '' : v).replace(/[^\d.,\-]/g, '');
  if (!s) return 0;
  if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.indexOf(',') >= 0) s = s.replace(',', '.');
  var n = parseFloat(s); return isNaN(n) ? 0 : n;
}
function dataNum(txt) { var m = String(txt || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? (+m[3]) * 10000 + (+m[2]) * 100 + (+m[1]) : 0; }
function dataTs(txt) { var m = String(txt || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) + 'T12:00:00-03:00').getTime() : 0; }
var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* PRODUTOS da planilha: "<nome> (R$ <preco> un.) x<qtd>, ..." (mesmo parse do Painel de Dados) */
function parseProdutos(txt) {
  txt = String(txt || ''); var itens = [], re = /(.*?)\(R\$\s*([\d.,]+)\s*un\.\)\s*(?:x\s*(\d+))?/g, m;
  while ((m = re.exec(txt)) !== null) {
    if (m.index === re.lastIndex) re.lastIndex++;
    var nome = m[1].replace(/^[,\s]+/, '').replace(/[,\s]+$/, '').trim().replace(/\s+x\s*\d+\s*$/i, '').trim();
    var qtd = m[3] ? parseInt(m[3], 10) : 1;
    if (nome) itens.push({ nome: nome, qtd: qtd });
  }
  if (!itens.length && txt.trim()) {   /* texto livre (pedido antigo/manual): uma linha por item, sem chute */
    txt.split(/\n|;/).forEach(function (l) { l = l.trim(); if (l) itens.push({ nome: l.slice(0, 120), qtd: 1 }); });
  }
  return itens.filter(function (it) { return !ehFrete(it.nome); });
}
function ehFrete(nome) { return /^(frete|transportadora|sedex|pac|motoboy|jadlog|loggi|correios)\b/i.test(String(nome || '').trim()) || /\bfrete\b/i.test(String(nome || '')); }
function normCod(s) { return String(s || '').replace(/\.0$/, '').replace(/\s+/g, '').toUpperCase(); }
/* família do fornecedor (o nome no Compras varia: "Daniel DALE IMPORTS", "Daniel MS"…) — uso interno, nunca sai */
function familiaForn(f) {
  var u = up(f).replace(/[^A-Z ]/g, '');
  if (!u) return '';
  if (u.indexOf('DANIEL') >= 0) return 'DANIEL';
  if (u.indexOf('GEOVANNA') >= 0) return 'GEOVANNA';
  if (u.indexOf('RESPECT') >= 0) return 'RESPECT';
  if (u.replace(/ /g, '').indexOf('VITAFLOW') === 0) return 'VITAFLOW';
  if (u.indexOf('CAMILA') >= 0) return 'CAMILA';
  return u.split(' ')[0];
}
/* códigos que estão na planilha de rastreios do Daniel (cache do Firebase, 10 min por instância) */
var _danCache = { t: 0, v: null };
async function codigosDoDaniel() {
  if (_danCache.v && Date.now() - _danCache.t < 600000) return _danCache.v;
  var rast = await fbGetOu('vitaflow_cache_daniel/rastreios');
  var arr = Array.isArray(rast) ? rast : (rast && typeof rast === 'object' ? Object.keys(rast).map(function (k) { return rast[k]; }) : []);
  var m = {};
  arr.forEach(function (x) { if (x && x.rastreio) m[normCod(x.rastreio)] = 1; });
  _danCache = { t: Date.now(), v: m };
  return m;
}

/* nome da transportadora pro cliente (mesmo critério do painel da logística) */
function transpNome(t) {
  var u = up(t);
  if (!u) return '';
  if (u.indexOf('J&T') >= 0 || /\bJT\b/.test(u) || u.indexOf('J T') >= 0) return 'J&T Express';
  if (u.indexOf('JADLOG') >= 0) return 'Jadlog';
  if (u.indexOf('LOGGI') >= 0) return 'Loggi';
  if (u.indexOf('TOTAL') >= 0) return 'Total Express';
  if (u.indexOf('SHOPEE') >= 0 || u.indexOf('SPX') >= 0) return 'Shopee Xpress';
  if (u.indexOf('CORREIO') >= 0 || u.indexOf('PAC') >= 0 || u.indexOf('SEDEX') >= 0) return 'Correios';
  return '';
}

/* ============================ status (textos = página de rastreio v5) ============================ */
var ORDEM = { 'AGUARDANDO PAGAMENTO': 0, 'PEDIDO CONFIRMADO': 1, 'PAGO': 1, 'EM SEPARACAO': 2, 'DESPACHADO': 3, 'POSTADO': 4,
  'EM TRANSFERENCIA': 5, 'EM SEPARACAO NO CENTRO LOGISTICO': 5, 'CHEGOU A UNIDADE DE DESTINO': 6, 'SAIU PARA ENTREGA': 7, 'ENTREGUE': 8 };
var NOME_STATUS = { 'PEDIDO CONFIRMADO': 'Pagamento confirmado', 'PAGO': 'Pagamento confirmado', 'EM SEPARACAO': 'Em separação',
  'DESPACHADO': 'Etiqueta de envio emitida', 'POSTADO': 'Postado', 'EM TRANSFERENCIA': 'Em transferência',
  'EM SEPARACAO NO CENTRO LOGISTICO': 'Em transferência', 'CHEGOU A UNIDADE DE DESTINO': 'Chegou à unidade de destino',
  'SAIU PARA ENTREGA': 'Saiu para entrega', 'ENTREGUE': 'Entregue' };
var EXCECOES = {
  'PEDIDO APREENDIDO': ['Precisa de atenção', 'Seu pedido precisa de atenção da nossa logística.'],
  'PEDIDO EXTRAVIADO': ['Precisa de atenção', 'Seu pedido precisa de atenção da nossa logística.'],
  'ENCAMINHADO PARA FISCALIZACAO': ['Em fiscalização', 'Seu pedido foi encaminhado para fiscalização pela transportadora. Assim que for liberado, o rastreio volta a andar.'],
  'FISCALIZACAO FINALIZADA': ['Fiscalização finalizada', 'A fiscalização terminou e seu pedido segue para a entrega.'],
  'DESTINATARIO AUSENTE': ['Destinatário ausente', 'A transportadora tentou entregar e não encontrou ninguém. Fale com a nossa logística para combinar uma nova tentativa.'],
  'ENDERECO INCORRETO': ['Endereço não localizado', 'A transportadora não localizou o endereço. Fale com a nossa logística para corrigir.'],
  'AREA COM DISTRIBUICAO': ['Área com restrição', 'O pacote está numa área com restrição de entrega. Fale com a nossa logística.'],
  'REEMBOLSO REALIZADO': ['Reembolsado', 'O reembolso deste pedido já foi realizado.'],
  'PEDIDO CANCELADO': ['Cancelado', 'Este pedido foi cancelado.']
};
function desfeito(st) { var s = up(st); return s.indexOf('CANCELAD') >= 0 || s.indexOf('REEMBOLSO') >= 0 || s.indexOf('ESTORNAD') >= 0; }
/* passo da barrinha: 1 Pago · 2 Separação · 3 Postado · 4 A caminho · 5 Entregue (0 = exceção) */
function passoDe(ordem) { if (ordem >= 8) return 5; if (ordem >= 5) return 4; if (ordem === 4) return 3; if (ordem >= 2) return 2; if (ordem === 1) return 1; return 0; }

/* ============================ e-mail (Brevo) ============================ */
function escH(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function htmlEmailLink(paragrafos, botao, url) {
  var pars = paragrafos.map(function (p) { return '<p style="margin:0 0 14px;font-size:15px;color:#41506a;line-height:1.65">' + escH(p) + '</p>'; }).join('');
  return '<div style="background:#eceff3;padding:20px 10px;font-family:Arial,Helvetica,sans-serif">' +
    '<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden">' +
    '<tr><td style="background:#0D1B2E;padding:24px 20px 20px;text-align:center">' +
    '<div style="height:4px;width:52px;margin:0 auto 14px;background:#F5A623;border-radius:2px"></div>' +
    '<img src="' + LOGO + '" alt="VitaFlow" width="170" style="display:inline-block;width:170px;max-width:60%;height:auto;border:0"></td></tr>' +
    '<tr><td style="padding:26px 22px 6px">' + pars + '</td></tr>' +
    '<tr><td style="padding:0 22px 14px"><a href="' + escH(url) + '" style="display:block;text-align:center;background:#F5A623;color:#0D1B2E;text-decoration:none;font-size:16px;font-weight:800;padding:15px 10px;border-radius:10px">' + escH(botao) + '</a></td></tr>' +
    '<tr><td style="padding:0 22px 24px;font-size:12px;color:#8a96a8;line-height:1.5">Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all;color:#0280CD">' + escH(url) + '</span></td></tr>' +
    '</table></div>';
}
async function enviarBrevo(para, nome, assunto, html, texto) {
  var chave = process.env.BREVO_API_KEY || '';
  if (!chave) return { ok: false, erro: 'falta BREVO_API_KEY' };
  try {
    var r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': chave, 'accept': 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'VitaFlow', email: 'contato@vitaflowoficial.com' },
        to: [{ email: para, name: nome || undefined }], subject: assunto, htmlContent: html, textContent: texto })
    });
    if (r.status >= 200 && r.status < 300) return { ok: true };
    return { ok: false, erro: 'Brevo HTTP ' + r.status };
  } catch (e) { return { ok: false, erro: 'Brevo: ' + e.message }; }
}
async function telegram(txt) {
  var t = process.env.TELEGRAM_TOKEN, c = process.env.TELEGRAM_CHAT;
  if (!t || !c) return;
  try {
    await fetch('https://api.telegram.org/bot' + t + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: c, text: txt }) });
  } catch (e) { /* aviso interno: falha não para nada */ }
}

/* ============================ limites (anti-abuso) ============================ */
/* conta tentativas numa janela; devolve true se PASSOU do limite (não registra quando já passou) */
async function estourou(chave, max, janelaMs, agora) {
  var cam = RAIZ + '/limites/' + chaveFb(chave);
  var l = await fbGetOu(cam);
  if (!l || !l.desde || agora - l.desde > janelaMs) { await fbPut(cam, { n: 1, desde: agora }); return false; }
  if (l.n >= max) return true;
  await fbPut(cam, { n: (l.n || 0) + 1, desde: l.desde });
  return false;
}
async function zerarLimite(chave) { try { await fbDel(RAIZ + '/limites/' + chaveFb(chave)); } catch (e) { /* tanto faz */ } }

/* ============================ senha (scrypt) ============================ */
function scrypt(senha, salt) {
  return new Promise(function (ok, falha) {
    crypto.scrypt(String(senha), Buffer.from(salt, 'hex'), 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, function (e, k) { if (e) falha(e); else ok(k.toString('hex')); });
  });
}
function senhaBoa(s) { s = String(s || ''); return s.length >= 8 && s.length <= 72; }
async function senhaConfere(senha, u) {
  if (!u || !u.hash || !u.salt) return false;
  var h = await scrypt(senha, u.salt);
  var a = Buffer.from(h, 'hex'), b = Buffer.from(String(u.hash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ============================ sessão ============================ */
async function criarSessao(u, manter, agora) {
  var tok = tokenNovo();
  var exp = agora + (manter ? SESSAO_MANTER : SESSAO_CURTA);
  await fbPut(RAIZ + '/sessoes/' + sha(tok), { email: u.email, criado: agora, exp: exp, versao: u.versao || 1, manter: !!manter });
  return { sessao: tok, exp: exp, nome: primeiroNome(u.nome), manter: !!manter };
}
async function lerSessao(tok, agora) {
  tok = String(tok || '');
  if (tok.length < 30 || tok.length > 80) return null;
  var s = await fbGetOu(RAIZ + '/sessoes/' + sha(tok));
  if (!s || !s.email || !(s.exp > agora)) return null;
  var u = await fbGetOu(RAIZ + '/usuarios/' + emailKey(s.email));
  if (!u || (u.versao || 1) !== (s.versao || 1)) return null;
  return { s: s, u: u, chave: sha(tok) };
}

/* ============================ pedidos do e-mail / do CPF ============================ */
async function lerHdr() { return (await fbGet('vitaflow_pedidos_hdr')) || []; }
function indices(hdr) {
  var u = hdr.map(function (h) { return String(h || '').trim().toUpperCase(); });
  function i(n, pad) { var k = u.indexOf(n); return k >= 0 ? k : pad; }
  var rast = u.indexOf('CODIGO_RASTREIO'); if (rast < 0) rast = u.indexOf('CODIGO RASTREIO');
  return { ped: i('PEDIDO', 0), nome: i('NOME', 1), email: i('EMAIL', 2), cpf: i('CPF', 3), prod: i('PRODUTOS', 4), status: i('STATUS', 5),
    data: i('DATA', 7), end: i('ENDERECO', 8), tel: i('TELEFONE', 9), valor: i('VALOR', 10), metodo: i('METODO_PAGAMENTO', 11),
    transp: u.indexOf('TRANSPORTADORA'), rast: rast, forn: u.indexOf('COMPRADO_FORNECEDORES'), onlog: u.indexOf('CODIGO_ONLOG'),
    pai: u.indexOf('PEDIDO_ORIGINAL'), _hdr: u };
}
function cel(linha, i) { return (i >= 0 && linha) ? String(linha[i] == null ? '' : linha[i]).trim() : ''; }
async function linhasDoIndice(no, chave) {
  var idx = await fbGetOu(no + '/' + chave);
  var ks = (idx && typeof idx === 'object') ? Object.keys(idx) : [];
  if (ks.length > MAX_PEDIDOS) ks = ks.slice(-MAX_PEDIDOS);
  var lidas = await Promise.all(ks.map(function (k) { return fbGetOu('vitaflow_pedidos/' + k); }));
  var out = {};
  ks.forEach(function (k, j) { if (lidas[j] && lidas[j].length) out[k] = lidas[j]; });
  return out;
}

/* ============================ ciclo do sorteio (= sorteioCiclo do GAS) ============================ */
var S_C1 = Date.parse('2026-08-22T00:00:00-03:00'), S_C2 = Date.parse('2026-09-05T00:00:00-03:00'),
    S_C3 = Date.parse('2026-09-20T00:00:00-03:00'), S_C1_SORT = Date.parse('2026-09-06T11:00:00-03:00'), S_PASSO = 14 * DIA;
function sorteioCiclo(ts) {
  if (ts < S_C2) return { id: 'C01', n: 1, ini: S_C1, fim: S_C2 - 1000, sorteio: S_C1_SORT };
  if (ts < S_C3) return { id: 'C02', n: 2, ini: S_C2, fim: S_C3 - 1000, sorteio: S_C3 + 11 * 3600000 };
  var k = Math.max(0, Math.floor((ts - S_C3) / S_PASSO)), ini = S_C3 + k * S_PASSO, vira = ini + S_PASSO, num = k + 3;
  return { id: 'C' + (num < 10 ? '0' + num : String(num)), n: num, ini: ini, fim: vira - 1000, sorteio: vira + 11 * 3600000 };
}
function sorteioCicloPorN(n) { if (n === 1) return sorteioCiclo(S_C1); if (n === 2) return sorteioCiclo(S_C2); return sorteioCiclo(S_C3 + (n - 3) * S_PASSO); }
var DSEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function dsem(ts) { return DSEM[new Date(ts - 3 * 3600000).getUTCDay()]; }
async function blocoSorteio(cpfs, ciclo) {
  var b = { ciclo: ciclo.id, abre: R.ddmm(ciclo.ini), fecha: R.ddmm(ciclo.fim), fecha_dia: dsem(ciclo.fim),
    sorteio: R.ddmm(ciclo.sorteio), sorteio_dia: dsem(ciclo.sorteio), hora: '11h', numeros: [], base: 0 };
  var lidos = await Promise.all(cpfs.map(function (c) { return fbGetOu('vitaflow_sorteio/' + ciclo.id + '/participantes/' + c); }));
  lidos.forEach(function (p) {
    if (!p) return;
    (p.nums || []).forEach(function (x) { if (x && !x.dead) b.numeros.push(String(x.n)); });
    b.base += Number(p.base || 0);
  });
  b.base = Math.round(b.base * 100) / 100;
  var resto = Math.round((b.base % 100) * 100) / 100;
  b.acumulado = resto; b.falta = Math.round((100 - resto) * 100) / 100;
  return b;
}
async function sorteioDoCliente(cpfs, agora) {
  if (!cpfs.length) return null;
  var c = sorteioCiclo(agora);
  var out = { atual: await blocoSorteio(cpfs, c), anterior: null };
  if (c.n > 1) {
    var ant = sorteioCicloPorN(c.n - 1);
    var st = await fbGetOu('vitaflow_sorteio/' + ant.id + '/info/status');
    if (st && String(st) !== 'apurado') {
      var bA = await blocoSorteio(cpfs, ant);
      if (bA.numeros.length) { bA.status = String(st); out.anterior = bA; }
    }
  }
  return out;
}

/* ============================ montagem da conta ============================ */
/* histórico + eventos + enriquecimento (= _rastCompletar da rastreio-consulta) de UMA linha */
async function rastrearLinha(linha, I, herdaUF) {
  var rr = R.baseDaLinha(linha, I.transp, I.rast, I.forn);
  if (herdaUF && !rr.estado) { rr.estado = herdaUF.estado; rr.cidade = herdaUF.cidade; }
  var k = R.histKey(rr.pedido);
  var lidos = await Promise.all([fbGetOu('vitaflow_historico_status/' + k), fbGetOu('vitaflow_sync/rastreio_eventos/' + k)]);
  var objH = lidos[0], hist = [];
  if (objH && typeof objH === 'object') {
    hist = Object.keys(objH).map(function (kk) { return objH[kk]; }).filter(function (ev) { return ev && ev.status; })
      .sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); })
      .map(function (ev) { return { status: ev.status, data: ev.data || '', hora: ev.hora || '', ts: ev.ts || 0 }; });
  }
  rr.historico = hist;
  await R.enriquecer(rr, rr._forn, rr._rast, rr._emRota, lidos[1], null);
  rr._cod = normCod(rr._rast);
  rr._onlog = normCod(cel(linha, I.onlog));
  /* v2: linha com UM fornecedor só ("Fornecedor: 2x A, 1x B") → o envio dessa linha é daquele fornecedor */
  var lsF = String(rr._forn || '').split(/\n| \| /).map(function (x) { return x.trim(); }).filter(Boolean);
  rr._famLinha = (lsF.length === 1 && lsF[0].indexOf(':') > 0) ? familiaForn(lsF[0].split(':')[0]) : '';
  delete rr._forn; delete rr._emRota; delete rr._orig; delete rr._pai;
  return rr;
}
/* o que o cliente vê de um envio */
function envioPublico(rr, n) {
  var stU = up(rr.status_exibido || rr.status);
  var ordem = ORDEM.hasOwnProperty(stU) ? ORDEM[stU] : -1;
  var exc = EXCECOES[stU];
  var e = { n: n, ref: rr.pedido, passo: passoDe(ordem), ordem: ordem,
    rotulo: exc ? exc[0] : (NOME_STATUS[stU] || nomeBonito(rr.status_exibido || rr.status) || 'Em andamento'),
    explica: exc ? exc[1] : '', classe: ordem === 8 ? 'ok' : (exc || ordem < 0 ? 'warn' : (ordem >= 4 ? 'info' : 'warn')),
    transportadora: transpNome(rr.transportadora), codigo: rr.codigo || '', entregue_em: '' };
  if (ordem === 8) {
    (rr.historico || []).forEach(function (h) { if (up(h.status) === 'ENTREGUE' && h.data) e.entregue_em = String(h.data).slice(0, 5); });
    if (!e.entregue_em && rr.eventos && rr.eventos.length) e.entregue_em = String(rr.eventos[rr.eventos.length - 1].d || '').slice(0, 5);
  }
  var p = rr.prazo || {};
  if (ordem > 0 && ordem < 8 && !exc) {
    if (p.previsao_de) e.previsao = p.previsao_de + ' a ' + p.previsao_ate;
    if (p.etapa === 'postagem') {
      var tConf = 0;
      (rr.historico || []).forEach(function (h) { if (!tConf && up(h.status).indexOf('CONFIRMADO') >= 0 && h.ts) tConf = h.ts; });
      if (!tConf) tConf = dataTs(rr.data);
      if (tConf && p.normal) e.postagem_ate = R.ddmm(R.somaDU(tConf, p.normal));
    }
    e.atraso = !!p.fora;
    if (rr.aviso && rr.aviso.texto) e.aviso = { tipo: String(rr.aviso.tipo || ''), texto: String(rr.aviso.texto) };   /* v4: o mesmo aviso da página de rastreio */
  }
  return e;
}

/* ---- v3: MEUS CUPONS ---- */
function fsNum(c) { return c ? Number(c.integerValue != null ? c.integerValue : (c.doubleValue != null ? c.doubleValue : 0)) || 0 : 0; }
/* estado do cupom na coleção cupons_vitaflow: null = não existe mais · undefined = não deu pra saber */
async function fsCupomEstado(docId) {
  try {
    var r = await fetch('https://firestore.googleapis.com/v1/projects/' + FS_PROJETO + '/databases/(default)/documents/cupons_vitaflow/' + encodeURIComponent(docId) + '?key=' + FS_KEY);
    if (r.status === 404) return null;
    if (!r.ok) return undefined;
    var f = ((await r.json()) || {}).fields || {};
    return { usos: fsNum(f.usosAtual), ativo: f.ativo ? f.ativo.booleanValue !== false : true,
      expira: (f.expira && f.expira.timestampValue) ? new Date(f.expira.timestampValue).getTime() : 0 };
  } catch (e) { return undefined; }
}
function ddmmaaaa(ts) { var d = new Date(Number(ts) - 3 * 3600000); return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '/' + d.getUTCFullYear(); }
async function cuponsDoCliente(pedidos, agora) {
  var rec = pedidos.filter(function (x) { var t = dataTs(x.data); return t && t >= agora - 200 * DIA; })
    .sort(function (a, b) { return dataNum(b.data) - dataNum(a.data); }).slice(0, 40);
  var regs = await Promise.all(rec.map(function (x) { return fbGetOu(LOG_CUPONS + '/' + R.histKey(x.pedido)); }));
  var achados = [];
  regs.forEach(function (g, i) { if (g && typeof g === 'object' && g.codigo) achados.push({ g: g, pedido: rec[i].pedido, k: R.histKey(rec[i].pedido) }); });
  var fss = await Promise.all(achados.map(function (a) { return fsCupomEstado(a.g.doc || ('atraso_' + a.k)); }));
  var ordemSit = { disponivel: 0, usado: 1, vencido: 2 };
  return achados.map(function (a, i) {
    var fs = fss[i];
    if (fs === null || (fs && fs.ativo === false)) return null;          /* apagado ou desativado na Gestão de Cupons: não aparece */
    var exp = (fs && fs.expira) || Number(a.g.expira) || 0;
    var sit = (fs && fs.usos >= 1) ? 'usado' : (exp && exp < agora ? 'vencido' : 'disponivel');
    return { codigo: String(a.g.codigo), pct: Number(a.g.pct) || 0, validade: exp ? ddmmaaaa(exp) : '', situacao: sit, pedido: a.pedido,
      motivo: 'atraso', _o: exp };
  }).filter(Boolean).sort(function (x, y) { return (ordemSit[x.situacao] - ordemSit[y.situacao]) || (y._o - x._o); })
    .map(function (c) { delete c._o; return c; });
}

/* D → pedido original. cands = pedidos do cliente no mesmo dia (inclusive V, pra descartar D de pedido de revendedor) */
function notaSeq(dSeq, oSeq) {
  if (!dSeq || !oSeq) return 0;
  if (dSeq === oSeq) return 3;
  if (dSeq.slice(-2) === oSeq.slice(-2)) return 2;
  if (dSeq.slice(-1) === oSeq.slice(-1)) return 1;
  return 0;
}
function casarD(dLinha, I, cands, conta) {
  var em = normEmail(cel(dLinha, I.email)), cp = cpf11(cel(dLinha, I.cpf));
  var cpMeu = cp.length === 11 && conta.cpfs.indexOf(cp) >= 0;     /* v6: o CPF manda */
  if (cp && cp.length === 11 && !cpMeu) return null;              /* D com CPF de outra pessoa */
  if (!cpMeu && em && em !== conta.email && (conta.emails || []).indexOf(em) < 0) return null;   /* D com e-mail de outra pessoa */
  /* v2: linha D automática → o dono é o PEDIDO_ORIGINAL, e só ele (se não for deste cliente, a linha fica de fora) */
  var pai = cel(dLinha, I.pai).toUpperCase();
  if (pai) { for (var q = 0; q < cands.length; q++) { if (String(cands[q].pedido).trim().toUpperCase() === pai) return cands[q]; } return null; }
  var nomeD = up(cel(dLinha, I.nome)), dSeq = seqDoNumero(cel(dLinha, I.ped));
  var melhor = null, nota = -1;
  cands.forEach(function (c) {
    if (!em && (!nomeD || up(c.nome) !== nomeD)) return;            /* sem e-mail igual, exige o MESMO nome */
    var n = notaSeq(dSeq, seqDoNumero(c.pedido));
    if (n > nota || (n === nota && melhor && c.pedido < melhor.pedido)) { nota = n; melhor = c; }
  });
  return melhor;
}

/* v10: conta criada no carrinho e ainda não confirmada — só devolve o que a própria pessoa digitou (nada da planilha) */
function contaPendente(u, soCompra) {
  var cad = cadastroSalvo(u), c = cpf11(u.cpf || '');
  var ends = cad ? cad.enderecos.map(function (e) { return Object.assign({}, e, { completo: true }); }) : [];
  if (soCompra) {
    return { ok: true, pendente: true, dados: { nome: nomeBonito(u.nome || ''), email: normEmail(u.email), telefone: cad ? cad.telefone : '',
      cpf: c.length === 11 ? c.slice(0, 3) + '.' + c.slice(3, 6) + '.' + c.slice(6, 9) + '-' + c.slice(9) : '',
      endereco: ends[cad ? cad.principal : 0] || enderecoPartes(''), enderecos: ends, principal: cad ? cad.principal : 0 } };
  }
  return { ok: true, versao: VERSAO, pendente: true, para: mascararEmail(normEmail(u.email)),
    conta: { nome: nomeBonito(u.nome || ''), primeiro_nome: primeiroNome(u.nome || ''), email: normEmail(u.email), desde: '', como_respondido: !!(u.como && u.como.opcao) },
    kpis: { pedidos: 0, total: 0, numeros: 0 }, grupos: [], produtos: [], sorteio: null, cupons: [],
    dados: { nome: nomeBonito(u.nome || ''), email: normEmail(u.email), cpf: mascararCpf(c), telefone: cad ? cad.telefone : '', enderecos: [],
      cadastro: cad ? { salvo: true, telefone: cad.telefone, enderecos: cad.enderecos, principal: cad.principal } : { salvo: false, telefone: '', enderecos: [], principal: 0 } } };
}
async function montarConta(u, agora, soCompra) {
  if (u && u.pendente) return contaPendente(u, soCompra);
  var conta = { email: normEmail(u.email), cpfs: [] };
  var porEmail = await linhasDoIndice('vitaflow_idx_email', emailKey(u.email));
  var hdr = await lerHdr();
  var I = indices(hdr);

  /* 1) linhas do e-mail (o índice pode ter sobra: confere o e-mail da linha)
        v6: + as linhas do(s) CPF(s) dos pedidos PAGOS desse e-mail (confere o CPF da linha). Revendedor não puxa CPF. */
  var minhas = {};
  Object.keys(porEmail).forEach(function (k) {
    var l = porEmail[k];
    if (normEmail(cel(l, I.email)) !== conta.email) return;
    minhas[k] = l;
    var pedE = cel(l, I.ped); if (!pedE || pedE.indexOf(',') >= 0 || ehRevendedor(pedE) || prefixo(pedE) === 'D') return;
    if (R.naoPagou(cel(l, I.status), cel(l, 12))) return;
    var cE = cpf11(cel(l, I.cpf)); if (cE.length === 11 && conta.cpfs.indexOf(cE) < 0) conta.cpfs.push(cE);
  });
  var cpfsBase = conta.cpfs.slice(0, 3);
  var porCpfs = await Promise.all(cpfsBase.map(function (c) { return linhasDoIndice('vitaflow_idx_cpf', c); }));
  porCpfs.forEach(function (obj, j) {
    Object.keys(obj || {}).forEach(function (k) { var l = obj[k]; if (cpf11(cel(l, I.cpf)) === cpfsBase[j]) minhas[k] = l; });
  });
  conta.emails = [conta.email];
  var normais = [], reenvios = [], dsDoIdx = [], todosDoDia = {};
  Object.keys(minhas).forEach(function (k) {
    var l = minhas[k];
    var ped = cel(l, I.ped); if (!ped || ped.indexOf(',') >= 0) return;
    if (R.naoPagou(cel(l, I.status), cel(l, 12))) return;            /* só pedido pago (igual à busca por e-mail do rastreio) */
    var pf = prefixo(ped);
    var item = { k: k, pedido: ped, linha: l, nome: cel(l, I.nome), data: cel(l, I.data), v: ehRevendedor(ped) };
    var dia = diaDoNumero(ped);
    if (pf === 'D') { dsDoIdx.push(item); return; }
    if (dia) { (todosDoDia[dia] = todosDoDia[dia] || []).push(item); }
    if (item.v) return;                                              /* revendedor: não aparece */
    if (pf === 'R') { reenvios.push(item); return; }
    normais.push(item);
    var emL = normEmail(cel(l, I.email)); if (emL && conta.emails.indexOf(emL) < 0) conta.emails.push(emL);
  });

  /* 2) linhas D dos dias dos pedidos (consulta por faixa de chave: só as D daquele dia) */
  var dias = Object.keys(todosDoDia);
  var dPorDia = await Promise.all(dias.map(function (d) {
    var q = 'orderBy=' + encodeURIComponent('"$key"') + '&startAt=' + encodeURIComponent('"' + d + 'D"') + '&endAt=' + encodeURIComponent('"' + d + 'D"');
    return fbGetOu('vitaflow_pedidos', q);
  }));
  var dLinhas = {};
  dsDoIdx.forEach(function (x) { dLinhas[x.k] = x.linha; });
  dPorDia.forEach(function (obj) { if (obj && typeof obj === 'object') Object.keys(obj).forEach(function (k) { if (obj[k] && obj[k].length) dLinhas[k] = obj[k]; }); });
  var dsDe = {};   /* pedido original → [linhas D] */
  Object.keys(dLinhas).forEach(function (k) {
    var l = dLinhas[k], ped = cel(l, I.ped);
    if (prefixo(ped) !== 'D') return;
    var cands = todosDoDia[diaDoNumero(ped)] || [];
    var orig = casarD(l, I, cands, conta);
    if (!orig || orig.v) return;                                     /* sem dono certo, ou D de pedido de revendedor */
    (dsDe[orig.k] = dsDe[orig.k] || []).push(l);
  });

  /* 3) Compras de cada pedido (+ o principal de quem está agrupado) */
  var compras = {};
  var ksComp = normais.map(function (x) { return x.k; });
  var lidosC = await Promise.all(ksComp.map(function (k) { return fbGetOu('vitaflow_compras/' + k.replace(/\s+/g, '_')); }));
  ksComp.forEach(function (k, j) { compras[k] = lidosC[j]; });
  var meus = {}; normais.forEach(function (x) { meus[x.k] = x; });
  var principais = {};
  normais.forEach(function (x) {
    var c = compras[x.k], pk = c && c.agrupadoEm ? chaveFb(String(c.agrupadoEm).trim()) : x.k;
    principais[x.k] = pk;
  });
  var faltam = Object.keys(principais).map(function (k) { return principais[k]; }).filter(function (pk, i, a) { return !meus[pk] && a.indexOf(pk) === i; });
  var extras = await Promise.all(faltam.map(function (pk) { return Promise.all([fbGetOu('vitaflow_pedidos/' + pk), fbGetOu('vitaflow_compras/' + pk)]); }));
  var principalOk = {};
  faltam.forEach(function (pk, j) {
    var l = extras[j][0];
    /* o principal só entra se for da MESMA pessoa (e-mail, CPF ou nome iguais a algum pedido do cliente) */
    var ok = !!(l && l.length) && !ehRevendedor(cel(l, I.ped)) && (normEmail(cel(l, I.email)) === conta.email ||
      conta.cpfs.indexOf(cpf11(cel(l, I.cpf))) >= 0 || normais.some(function (x) { return up(x.nome) && up(x.nome) === up(cel(l, I.nome)); }));
    if (ok) { principalOk[pk] = { k: pk, pedido: cel(l, I.ped), linha: l, nome: cel(l, I.nome), data: cel(l, I.data), alheio: true }; compras[pk] = extras[j][1]; }
  });
  /* D do principal "alheio" (mesmo dia/nome) */
  var diasExtra = Object.keys(principalOk).map(function (pk) { return diaDoNumero(principalOk[pk].pedido); }).filter(function (d, i, a) { return d && !todosDoDia[d] && a.indexOf(d) === i; });
  var dExtra = await Promise.all(diasExtra.map(function (d) {
    var q = 'orderBy=' + encodeURIComponent('"$key"') + '&startAt=' + encodeURIComponent('"' + d + 'D"') + '&endAt=' + encodeURIComponent('"' + d + 'D"');
    return fbGetOu('vitaflow_pedidos', q);
  }));
  var candsPri = Object.keys(principalOk).map(function (pk) { return principalOk[pk]; });
  dExtra.forEach(function (obj) {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(function (k) {
      var l = obj[k]; if (!l || !l.length) return;
      var orig = casarD(l, I, candsPri.filter(function (c) { return diaDoNumero(c.pedido) === diaDoNumero(cel(l, I.ped)); }), conta);
      if (orig) (dsDe[orig.k] = dsDe[orig.k] || []).push(l);
    });
  });

  /* 4) grupos */
  var grupos = {};
  normais.forEach(function (x) {
    var pk = principais[x.k];
    if (pk !== x.k && !meus[pk] && !principalOk[pk]) pk = x.k;       /* principal de outra pessoa: o pedido fica sozinho */
    var g = grupos[pk] || (grupos[pk] = { pk: pk, pedidos: [] });
    g.pedidos.push(x);
  });

  var ufDe = {};   /* UF/cidade do pedido original (a linha D vem sem endereço) */
  var tarefas = [];
  Object.keys(grupos).forEach(function (pk) {
    var g = grupos[pk];
    g.principal = meus[pk] || principalOk[pk] || g.pedidos[0];
    var ordemPeds = [g.principal].concat(g.pedidos.filter(function (x) { return x.k !== g.principal.k; }));
    g.linhasEnvio = [];
    ordemPeds.forEach(function (x) {
      g.linhasEnvio.push({ linha: x.linha, orig: x, d: false });
      /* v2: pacotes na ordem do número (D060, D061, D160…) — a mesma numeração do e-mail "seu pedido vai em N pacotes" */
      (dsDe[x.k] || []).slice().sort(function (a, b) { var pa = cel(a, I.ped), pb = cel(b, I.ped); return pa < pb ? -1 : (pa > pb ? 1 : 0); })
        .forEach(function (dl) { g.linhasEnvio.push({ linha: dl, orig: x, d: true }); });
    });
  });
  /* rastreia todas as linhas de envio em paralelo */
  var todasLinhas = [];
  Object.keys(grupos).forEach(function (pk) { grupos[pk].linhasEnvio.forEach(function (le) { todasLinhas.push(le); }); });
  var origRR = {};
  await Promise.all(todasLinhas.filter(function (le) { return !le.d; }).map(async function (le) {
    le.rr = await rastrearLinha(le.linha, I, null);
    origRR[le.orig.k] = le.rr;
    ufDe[le.orig.k] = { estado: le.rr.estado, cidade: le.rr.cidade };
  }));
  await Promise.all(todasLinhas.filter(function (le) { return le.d; }).map(async function (le) {
    le.rr = await rastrearLinha(le.linha, I, ufDe[le.orig.k]);
  }));

  /* avaliações já feitas */
  var pks = Object.keys(grupos);
  var avs = await Promise.all(pks.map(function (pk) { return fbGetOu(RAIZ + '/avaliacoes/' + pk); }));
  var avDe = {}; pks.forEach(function (pk, j) { avDe[pk] = avs[j]; });

  var danCods = await codigosDoDaniel();
  var saidaGrupos = [], produtos = {}, pidPorNome = {}, totalGasto = 0, nPedidos = 0, primeiroData = 0;
  pks.forEach(function (pk) {
    var g = grupos[pk];
    var comp = compras[g.principal.k] || null;
    var meusNoGrupo = g.pedidos;
    /* envios: a linha principal + D; agrupado só entra se tiver código diferente dos que já estão */
    var envios = [], codsVistos = {};
    g.linhasEnvio.forEach(function (le) {
      var rr = le.rr; if (!rr) return;
      var ehPri = (le.orig.k === g.principal.k && !le.d);
      if (!ehPri && !le.d) { if (!rr._cod || codsVistos[rr._cod]) return; }
      if (le.d && rr._cod && codsVistos[rr._cod]) return;
      if (rr._cod) codsVistos[rr._cod] = true;
      envios.push(rr);
    });
    /* itens: Compras do principal (com _dePed) ou o texto de PRODUTOS de cada pedido */
    var itens = [];
    var meusKs = {}; meusNoGrupo.forEach(function (x) { meusKs[x.pedido.toUpperCase()] = x; });
    if (comp && comp.itens && comp.itens.length) {
      comp.itens.forEach(function (it) {
        if (!it) return;
        var nome = String(it.nome || it.textoOriginal || '').trim(); if (!nome || ehFrete(nome)) return;
        var de = String(it._dePed || g.principal.pedido).trim();
        if (!meusKs[de.toUpperCase()] && !(de.toUpperCase() === g.principal.pedido.toUpperCase() && !g.principal.alheio)) return;  /* item de pedido que não é do cliente */
        var nomeIt = nome.replace(/\s+x\s*\d+\s*$/i, '');
        var pidIt = soDig(String(it.vfId == null ? '' : it.vfId).replace(/^.*\//, ''));   /* v7 */
        if (pidIt.length >= 6 && !pidPorNome[up(nomeIt)]) pidPorNome[up(nomeIt)] = pidIt;
        itens.push({ qtd: Number(it.qtd) || 1, nome: nomeIt, de: de, _forn: familiaForn(it.fornecedor) });
      });
    }
    if (!itens.length) {
      meusNoGrupo.forEach(function (x) { parseProdutos(cel(x.linha, I.prod)).forEach(function (it) { itens.push({ qtd: it.qtd, nome: it.nome, de: x.pedido, _forn: '' }); }); });
    }
    /* item → pacote(s), SÓ quando é certo:
         · 1 envio só, ou 1 fornecedor só → todos os envios são dele;
         · código do envio = campo "rastreio" do fornecedor no Compras;
         · (v2) a linha do envio tem UM fornecedor só na coluna COMPRADO_FORNECEDORES (pacote criado pelo Compras);
         · código na planilha de rastreios do Daniel → Daniel;
         · linha com CODIGO_ONLOG → Geovanna/Respect (o que estiver no pedido; se tiver as duas, não decide);
         · código = etiqueta EnvioEcom → VitaFlow.
       Fornecedor com vários envios: os itens dele vão "divididos entre os pacotes X e Y". O resto fica sem pacote. */
    var forns = {}; itens.forEach(function (it) { if (it._forn) forns[it._forn] = 1; });
    if (comp && comp.grupos) Object.keys(comp.grupos).forEach(function (f) { var fa = familiaForn(f); if (fa) forns[fa] = 1; });
    var nForn = Object.keys(forns).length;
    if (envios.length === 1 || nForn === 1) {
      var todos = envios.map(function (rr, j) { return j + 1; });
      if (todos.length) itens.forEach(function (it) { it.pacotes = todos.slice(); });
    } else {
      var eeCods = {}, codForn = {}, pacotesDe = {};
      [g.principal.k].concat(meusNoGrupo.map(function (x) { return x.k; })).forEach(function (k) {
        var c = compras[k]; if (c && c.envioecom) { var x = normCod(c.envioecom.codigo_rastreio || c.envioecom.barcode); if (x) eeCods[x] = 1; }
      });
      if (comp && comp.grupos) Object.keys(comp.grupos).forEach(function (f) { var c = normCod(comp.grupos[f] && comp.grupos[f].rastreio); if (c) codForn[c] = familiaForn(f); });
      var geoEresp = forns.GEOVANNA && forns.RESPECT;
      envios.forEach(function (rr, j) {
        var fam = '';
        if (rr._cod && codForn[rr._cod]) fam = codForn[rr._cod];
        else if (rr._famLinha) fam = rr._famLinha;                       /* v2: fornecedor único da linha (pacote do Compras) */
        else if (rr._cod && danCods[rr._cod]) fam = 'DANIEL';
        else if (rr._onlog && !geoEresp) fam = forns.GEOVANNA ? 'GEOVANNA' : (forns.RESPECT ? 'RESPECT' : '');
        else if (rr._cod && eeCods[rr._cod]) fam = 'VITAFLOW';
        if (fam && forns[fam]) (pacotesDe[fam] = pacotesDe[fam] || []).push(j + 1);
      });
      itens.forEach(function (it) { if (it._forn && pacotesDe[it._forn]) it.pacotes = pacotesDe[it._forn].slice(); });
    }
    itens.forEach(function (it) { delete it._forn; if (!it.pacotes) it.pacotes = []; });

    var envPub = envios.map(function (rr, j) { return envioPublico(rr, j + 1); });
    var todosEntregues = envPub.length > 0 && envPub.every(function (e) { return e.ordem === 8; });
    var cancelado = meusNoGrupo.every(function (x) { return desfeito(cel(x.linha, I.status)); });
    var valor = 0, valorTodos = 0, metodo = '', data = 0, dataTxt = '';
    meusNoGrupo.forEach(function (x) {
      var st = cel(x.linha, I.status);
      valorTodos += parseValor(cel(x.linha, I.valor));
      if (!desfeito(st)) { valor += parseValor(cel(x.linha, I.valor)); nPedidos++; }
      var dn = dataNum(x.data); if (dn > data) { data = dn; }
      var ts = dataTs(x.data); if (ts && (!primeiroData || ts < primeiroData)) primeiroData = ts;
      if (!metodo) metodo = cel(x.linha, I.metodo);
    });
    valor = Math.round(valor * 100) / 100; totalGasto += valor;
    dataTxt = cel(g.principal.linha, I.data).slice(0, 10);
    var av = avDe[pk];
    var saida = {
      chave: pk, principal: g.principal.pedido,
      junto: meusNoGrupo.filter(function (x) { return x.k !== g.principal.k; }).map(function (x) { return x.pedido; }),
      principal_de_outro_cadastro: !!g.principal.alheio,
      data: dataTxt, data_num: data, valor: valor, pagamento: metodoBonito(metodo), cancelado: cancelado,
      envios: envPub, itens: itens,
      itens_em_pacotes: itens.length > 0 && itens.every(function (it) { return it.pacotes.length === 1; }),
      pode_ter_mais_pacotes: nForn > envPub.length && !todosEntregues && !cancelado,
      avaliacao: av ? { feita: true, nota: av.nota } : { feita: false, pode: todosEntregues && !cancelado }
    };
    if (cancelado) { saida.envios = []; saida.avaliacao = { feita: false, pode: false }; saida.rotulo = desfeitoRotulo(cel(g.principal.linha, I.status)); saida.valor = Math.round(valorTodos * 100) / 100; }
    saidaGrupos.push(saida);

    /* produtos (só pedidos não cancelados) */
    if (!cancelado) itens.forEach(function (it) {
      var ch = up(it.nome); var p = produtos[ch] || (produtos[ch] = { nome: it.nome, unidades: 0, pedidos: {}, ultima: 0, ultima_txt: '', tags: [] });
      p.unidades += it.qtd; p.pedidos[it.de] = 1;
      var x = meusKs[it.de.toUpperCase()] || g.principal; var dn = dataNum(x.data);
      if (dn >= p.ultima) { p.ultima = dn; p.ultima_txt = String(x.data).slice(0, 5); }
      var pc = it.pacotes || [];
      var tg = it.de + (envPub.length > 1 && pc.length ? (pc.length === 1 ? ' · pacote ' + pc[0] : ' · pacotes ' + juntarE(pc)) : '');
      if (p.tags.map(function (t) { return t.t; }).indexOf(tg) < 0) p.tags.push({ t: tg, pacote: pc.length === 1 ? pc[0] : 0 });
    });
  });

  /* reenvios (R): cartão próprio, sem valor */
  var saidaReenvios = await Promise.all(reenvios.map(async function (x) {
    var rr = await rastrearLinha(x.linha, I, null);
    /* v11: reenvio dividido em pacotes (GAS v62 cria linha D com PEDIDO_ORIGINAL = número R) → as linhas D viram os pacotes 2, 3…
       (mesma ordem do número, igual aos pedidos normais). Item que está no PRODUTOS de uma linha D vai no pacote dela; o resto no 1. */
    var dsR = (dsDe[x.k] || []).slice().sort(function (a, b) { var pa = cel(a, I.ped), pb = cel(b, I.ped); return pa < pb ? -1 : (pa > pb ? 1 : 0); });
    var rrD = await Promise.all(dsR.map(function (dl) { return rastrearLinha(dl, I, { estado: rr.estado, cidade: rr.cidade }); }));
    var pacDe = {};
    dsR.forEach(function (dl, j) { parseProdutos(cel(dl, I.prod)).forEach(function (it) { pacDe[up(it.nome)] = j + 2; }); });
    return { chave: x.k, principal: x.pedido, reenvio: true, data: x.data.slice(0, 10), data_num: dataNum(x.data),
      envios: [rr].concat(rrD).map(function (r, j) { return envioPublico(r, j + 1); }),
      itens: parseProdutos(cel(x.linha, I.prod)).map(function (it) { return { qtd: it.qtd, nome: it.nome, de: x.pedido, pacotes: [pacDe[up(it.nome)] || 1] }; }),
      itens_em_pacotes: true, avaliacao: { feita: false, pode: false } };
  }));

  var lista = saidaGrupos.concat(saidaReenvios).sort(function (a, b) { return b.data_num - a.data_num || (a.principal < b.principal ? 1 : -1); });
  lista.forEach(function (g) { delete g.data_num; });
  var listaProd = Object.keys(produtos).map(function (k) {
    var p = produtos[k]; return { nome: p.nome, pid: pidPorNome[k] || '', unidades: p.unidades, vezes: Object.keys(p.pedidos).length, ultima: p.ultima_txt, _o: p.ultima, tags: p.tags };
  }).sort(function (a, b) { return b._o - a._o || b.vezes - a.vezes; });
  listaProd.forEach(function (p) { delete p._o; });

  /* meus dados: do pedido mais recente */
  var recentes = normais.slice().sort(function (a, b) { return dataNum(b.data) - dataNum(a.data); });
  var ult = recentes[0] ? recentes[0].linha : null;
  var ends = {};
  recentes.forEach(function (x, j) {
    var e = cel(x.linha, I.end).replace(/\s+/g, ' '); if (!e) return;
    var ch = up(e); if (!ends[ch]) ends[ch] = { texto: e, n: 0, ordem: j }; ends[ch].n++;
  });
  var listaEnd = Object.keys(ends).map(function (k) { return ends[k]; }).sort(function (a, b) { return a.ordem - b.ordem; }).slice(0, 5)
    .map(function (e, j) { return { texto: e.texto, n: e.n, ultimo: j === 0 }; });

  /* v6: telefone = o do pedido mais recente que TEM telefone (pedido manual costuma vir sem) */
  var telConta = '';
  recentes.some(function (x) { var t = cel(x.linha, I.tel); if (soDig(t).length >= 10) { telConta = t; return true; } return false; });
  /* endereço tirado dos pedidos (do mais novo pro mais antigo) — usado quando o cliente ainda não salvou o cadastro */
  var endPed = null, ptsEnd = [];
  recentes.forEach(function (x) { var e = cel(x.linha, I.end); if (e) ptsEnd.push(enderecoPartes(e)); });
  if (ptsEnd.length) {
    endPed = ptsEnd[0];
    if (!endPed.completo) {
      for (var q = 1; q < ptsEnd.length; q++) { if (ptsEnd[q].completo && (!endPed.cep || ptsEnd[q].cep === endPed.cep)) { endPed = ptsEnd[q]; break; } }
    }
  }
  /* v8: cadastro salvo pelo cliente vale primeiro */
  var cad = cadastroSalvo(u);
  var telFinal = (cad && cad.telefone.length >= 10) ? cad.telefone : telConta;
  var endsCad = (cad && cad.enderecos.length) ? cad.enderecos.map(function (e) { return Object.assign({}, e, { completo: true }); }) : null;
  if (soCompra) {   /* só os dados para o formulário do carrinho */
    var nomeC = (ult && cel(ult, I.nome)) || u.nome || '';
    var cpfC = ''; recentes.some(function (x) { var c = cpf11(cel(x.linha, I.cpf)); if (c.length === 11) { cpfC = c; return true; } return false; });
    var listaC = endsCad || ((endPed && endPed.cep) ? [endPed] : []);
    var prC = endsCad ? cad.principal : 0;
    return { ok: true, dados: { nome: nomeBonito(nomeC), email: conta.email, telefone: telFinal,
      cpf: cpfC.length === 11 ? cpfC.slice(0, 3) + '.' + cpfC.slice(3, 6) + '.' + cpfC.slice(6, 9) + '-' + cpfC.slice(9) : '',
      endereco: listaC[prC] || endPed || enderecoPartes(''), enderecos: listaC, principal: prC } };
  }
  var cadSaida = cad
    ? { salvo: true, telefone: cad.telefone.length >= 10 ? cad.telefone : telDigitos(telConta), enderecos: cad.enderecos, principal: cad.principal }
    : { salvo: false, telefone: telDigitos(telConta), enderecos: (endPed && endPed.completo) ? [normEndereco(endPed)].filter(Boolean) : [], principal: 0 };
  var sorteio = await sorteioDoCliente(conta.cpfs, agora);
  var cupons = [];   /* v3: falha na leitura dos cupons nunca derruba a conta */
  try { cupons = await cuponsDoCliente(normais, agora); } catch (eCp) { console.error('[conta] cupons: ' + (eCp && eCp.message || eCp)); }
  var nomeConta = (ult && cel(ult, I.nome)) || u.nome || '';
  var dDesde = primeiroData ? new Date(primeiroData - 3 * 3600000) : null;
  return {
    ok: true, versao: VERSAO,
    conta: { nome: nomeBonito(nomeConta), primeiro_nome: primeiroNome(nomeConta), email: conta.email,
      desde: dDesde ? (MESES[dDesde.getUTCMonth()] + ' de ' + dDesde.getUTCFullYear()) : '', como_respondido: !!(u.como && u.como.opcao) },
    kpis: { pedidos: nPedidos, total: Math.round(totalGasto * 100) / 100, numeros: sorteio ? sorteio.atual.numeros.length : 0 },
    grupos: lista, produtos: listaProd, sorteio: sorteio, cupons: cupons,
    dados: { nome: nomeBonito(nomeConta), email: conta.email, cpf: mascararCpf(ult ? cel(ult, I.cpf) : ''),
      telefone: telFinal, enderecos: listaEnd, cadastro: cadSaida }
  };
}
/* v5: endereço do pedido → campos do carrinho. Formato do carrinho: "rua, numero[ complemento], bairro, cidade - UF, CEP: 00000-000" */
function enderecoPartes(txt) {
  var t = String(txt || '').replace(/\s+/g, ' ').trim();
  var o = { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', completo: false };
  var mc = t.match(/\d{5}-?\d{3}(?!\d)/g);
  if (mc) { var c = mc[mc.length - 1].replace(/\D/g, ''); o.cep = c.slice(0, 5) + '-' + c.slice(5); }
  var ps = t.split(/\s*,\s*/).filter(function (p) { return p !== ''; });
  var n = ps.length;
  if (n < 4 || !/^(?:CEP:? ?)?\d{5}-?\d{3}$/i.test(ps[n - 1])) return o;
  var cab = null;
  var mu = ps[n - 2].match(/^(.+?) ?- ?([A-Za-z]{2})$/);
  if (mu && n >= 4) {                 /* carrinho do site: "Rua, 10 apto 2, Bairro, Cidade - UF, CEP: 00000-000" */
    o.cidade = mu[1].trim(); o.uf = mu[2].toUpperCase(); o.bairro = ps[n - 3].trim(); cab = ps.slice(0, n - 3);
    if (cab.length === 2) {
      var mn = cab[1].match(/^(\S+)(?: (.+))?$/);
      if (mn) { o.rua = cab[0]; o.numero = mn[1]; o.complemento = mn[2] || ''; }
      cab = null;
    }
  } else if (/^[A-Za-z]{2}$/.test(ps[n - 2]) && n >= 5) {   /* v6 — Athena/Orçamento: "Rua[, número][, complemento], Bairro, Cidade, UF, CEP" */
    o.uf = ps[n - 2].toUpperCase(); o.cidade = ps[n - 3]; o.bairro = ps[n - 4]; cab = ps.slice(0, n - 4);
  } else return o;
  if (cab && cab.length) {
    var NUM = /^(?:n[º°o.]? ?)?(\d+[A-Za-z]?|s\/?n)$/i, FIM = /^(.*\D)[ ]+(?:n[º°o.]? ?)?(\d+[A-Za-z]?)$/;
    var m1 = cab.length >= 2 ? cab[1].match(NUM) : null, m0 = cab[0].match(FIM);
    var m1b = (!m1 && cab.length >= 2) ? cab[1].match(/^(\d+[A-Za-z]?) (.+)$/) : null;
    if (m1) { o.rua = cab[0]; o.numero = m1[1]; o.complemento = cab.slice(2).join(', '); }          /* rua, número[, complemento] */
    else if (m1b) { o.rua = cab[0]; o.numero = m1b[1]; o.complemento = [m1b[2]].concat(cab.slice(2)).join(', '); }   /* rua, "10 apto 2"[, mais complemento] */
    else if (m0) { o.rua = m0[1].trim(); o.numero = m0[2]; o.complemento = cab.slice(1).join(', '); } /* "rua e número juntos"[, complemento] */
    else { o.rua = cab[0]; o.complemento = cab.slice(1).join(', '); }                                 /* sem número identificável: o cliente completa */
  }
  o.completo = !!(o.rua && o.numero && o.bairro && o.cidade && o.uf && o.cep);
  return o;
}
function juntarE(a) { a = a.map(String); return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]; }
function metodoBonito(m) {
  var u = up(m);
  if (!u) return '';
  if (u.indexOf('PIX') >= 0) return 'Pix';
  if (u.indexOf('VALE') >= 0) return 'Vale-compras';
  if (u.indexOf('CART') >= 0 || u.indexOf('CREDIT') >= 0) return 'Cartão';
  if (u.indexOf('BOLETO') >= 0) return 'Boleto';
  return '';
}
function desfeitoRotulo(st) { var s = up(st); if (s.indexOf('REEMBOLSO') >= 0) return 'Reembolsado'; if (s.indexOf('ESTORNAD') >= 0) return 'Estornado'; return 'Cancelado'; }

/* ============================ link por e-mail ============================ */
async function nomeDoEmail(email) {
  try {
    var linhas = await linhasDoIndice('vitaflow_idx_email', emailKey(email));
    var hdr = await lerHdr(), I = indices(hdr), melhor = null;
    Object.keys(linhas).forEach(function (k) {
      var l = linhas[k]; if (normEmail(cel(l, I.email)) !== normEmail(email) || ehRevendedor(cel(l, I.ped))) return;
      if (!melhor || dataNum(cel(l, I.data)) > dataNum(cel(melhor, I.data))) melhor = l;
    });
    return melhor ? cel(melhor, I.nome) : '';
  } catch (e) { return ''; }
}
async function mandarLink(email, agora, quem) {
  var u = await fbGetOu(RAIZ + '/usuarios/' + emailKey(email));
  var tok = tokenNovo();
  await fbPut(RAIZ + '/links/' + sha(tok), { email: email, criado: agora, exp: agora + (quem === 'confirmar' ? LINK_CONFIRMAR_VALIDADE : LINK_VALIDADE), usado: 0, por: quem || 'cliente' });
  var nome = primeiroNome((u && u.nome) || await nomeDoEmail(email));
  var url = PAGINA + '?link=' + encodeURIComponent(tok);
  if (quem === 'confirmar') {   /* v10: conta criada na compra */
    var parsC = [
      'Olá' + (nome ? ', ' + nome : '') + '!',
      'Sua conta VitaFlow foi criada na hora da compra. Toque no botão abaixo para confirmar que este e-mail é seu e liberar na conta os seus pedidos, rastreios e números da sorte.',
      'O link vale por 24 horas e só pode ser usado uma vez. Se não foi você, ignore este e-mail.',
      'Equipe VitaFlow'
    ];
    return await enviarBrevo(email, nome, 'Confirme seu e-mail da conta VitaFlow', htmlEmailLink(parsC, 'Confirmar meu e-mail', url), parsC.join('\n\n') + '\n\n' + url);
  }
  var existe = !!(u && u.hash);
  var assunto = existe ? 'Crie uma nova senha da sua conta VitaFlow' : 'Crie sua senha da Minha Conta VitaFlow';
  var pars = existe ? [
    'Olá' + (nome ? ', ' + nome : '') + '!',
    'Recebemos um pedido para criar uma nova senha da sua conta no site da VitaFlow. Toque no botão abaixo para escolher a nova senha. O link vale por 30 minutos e só pode ser usado uma vez.',
    'Se não foi você, ignore este e-mail: a sua senha atual continua valendo.',
    'Equipe VitaFlow'
  ] : [
    'Olá' + (nome ? ', ' + nome : '') + '!',
    'Recebemos um pedido para criar a sua conta no site da VitaFlow com este e-mail. Toque no botão abaixo para criar a sua senha. Se você já comprou com a gente usando este e-mail, os seus pedidos, pacotes e números da sorte já aparecem na conta.',
    'O link vale por 30 minutos e só pode ser usado uma vez. Se não foi você, ignore este e-mail.',
    'Equipe VitaFlow'
  ];
  var botao = existe ? 'Criar nova senha' : 'Criar minha senha';
  var env = await enviarBrevo(email, nome, assunto, htmlEmailLink(pars, botao, url), pars.join('\n\n') + '\n\n' + url);
  return env;
}

/* ============================ admin ============================ */
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
var PREVIA_VALE = 15 * 60000;
async function admPreviaLink(uid, termo, agora) {
  termo = String(termo || '').trim();
  var b = await admBuscar(termo), email = '';
  var ps = (b.pedidos || []).filter(function (p) { return p.email && !p.revendedor; });
  if (termo.indexOf('@') >= 0) email = normEmail(termo);
  else {
    var alvo = termo.toUpperCase().replace(/\s+/g, '');
    var doPedido = ps.filter(function (p) { return String(p.pedido).toUpperCase() === alvo; })[0];
    /* e-mail do pedido informado; senão o e-mail que mais aparece nos pedidos do CPF */
    if (doPedido) email = doPedido.email;
    else { var cont = {}; ps.forEach(function (p) { cont[p.email] = (cont[p.email] || 0) + 1; }); email = Object.keys(cont).sort(function (x, y) { return cont[y] - cont[x]; })[0] || ''; }
  }
  if (!email || !emailValido(email)) return { ok: false, erro: 'sem_email', msg: 'Não achei um e-mail de cliente para esse pedido/CPF. Sem e-mail não existe conta.' };
  var tok = tokenNovo();
  await fbPut(RAIZ + '/previas/' + sha(tok), { email: email, exp: agora + PREVIA_VALE, uid: uid, criado: agora });
  return { ok: true, link: PAGINA + '#previa=' + tok, email: mascararEmail(email), vale_min: Math.round(PREVIA_VALE / 60000) };
}
async function previaDoToken(tok, agora) {
  tok = String(tok || '');
  if (tok.length < 30 || tok.length > 80) return null;
  var p = await fbGetOu(RAIZ + '/previas/' + sha(tok));
  if (!p || !p.email || !(p.exp > agora)) return null;
  return p;
}
async function admBuscar(termo) {
  termo = String(termo || '').trim();
  var hdr = await lerHdr(), I = indices(hdr), linhas = {};
  if (termo.indexOf('@') >= 0) linhas = await linhasDoIndice('vitaflow_idx_email', emailKey(termo));
  else if (cpf11(termo).length === 11 && !/[a-z]/i.test(termo)) linhas = await linhasDoIndice('vitaflow_idx_cpf', cpf11(termo));
  else {
    var k = chaveFb(termo.toUpperCase().replace(/\s+/g, ''));
    var l = k ? await fbGetOu('vitaflow_pedidos/' + k) : null;
    if (l && l.length) {
      /* número: traz também os outros pedidos do mesmo CPF */
      var c = cpf11(cel(l, I.cpf));
      linhas = c.length === 11 ? await linhasDoIndice('vitaflow_idx_cpf', c) : {};
      linhas[k] = l;
    }
  }
  var pedidos = Object.keys(linhas).map(function (k) {
    var l = linhas[k];
    return { pedido: cel(l, I.ped), nome: cel(l, I.nome), email: normEmail(cel(l, I.email)), cpf: cpf11(cel(l, I.cpf)),
      data: cel(l, I.data).slice(0, 10), status: cel(l, I.status), revendedor: ehRevendedor(cel(l, I.ped)), _d: dataNum(cel(l, I.data)) };
  }).filter(function (p) { return p.pedido; }).sort(function (a, b) { return b._d - a._d; });
  pedidos.forEach(function (p) { delete p._d; });
  var emails = {}; pedidos.forEach(function (p) { if (p.email) emails[p.email] = 1; });
  var contas = await Promise.all(Object.keys(emails).map(function (e) { return fbGetOu(RAIZ + '/usuarios/' + emailKey(e)); }));
  var temConta = {}; Object.keys(emails).forEach(function (e, j) { temConta[e] = !!(contas[j] && contas[j].hash); });
  return { ok: true, pedidos: pedidos, contas: temConta };
}
async function gasEditarEmail(pedido, email) {
  var chave = process.env.COMPRAS_KEY || '';
  if (!chave) return { ok: false, erro: 'falta a variável COMPRAS_KEY no Netlify' };
  try {
    var ctrl = new AbortController(); var t = setTimeout(function () { ctrl.abort(); }, 20000);
    var r = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctrl.signal,
      body: JSON.stringify({ action: 'editar_pedido', chave: chave, pedido: pedido, campos: { EMAIL: email } }) });
    clearTimeout(t);
    var txt = await r.text(), j = null;
    try { j = JSON.parse(txt); } catch (e) { return { ok: false, erro: 'o Apps Script não respondeu JSON' }; }
    if (j && j.success && (j.atualizados || []).indexOf('EMAIL') >= 0) return { ok: true };
    return { ok: false, erro: (j && j.erro) || 'o Apps Script não confirmou a troca' };
  } catch (e) { return { ok: false, erro: 'Apps Script: ' + e.message }; }
}
async function admTrocarEmail(uid, pedidos, novo, agora) {
  novo = normEmail(novo);
  if (!emailValido(novo)) return { ok: false, erro: 'email_invalido', msg: 'E-mail novo inválido.' };
  if (!pedidos || !pedidos.length || pedidos.length > 40) return { ok: false, erro: 'sem_pedidos', msg: 'Escolha de 1 a 40 pedidos.' };
  var hdr = await lerHdr(), I = indices(hdr);
  var res = [];
  for (var i = 0; i < pedidos.length; i++) {   /* um por vez: o GAS mexe na planilha */
    var ped = String(pedidos[i] || '').trim(), k = chaveFb(ped);
    var l = await fbGetOu('vitaflow_pedidos/' + k);
    if (!l || !l.length) { res.push({ pedido: ped, ok: false, erro: 'pedido não está no espelho' }); continue; }
    var antigo = normEmail(cel(l, I.email));
    if (antigo === novo) { res.push({ pedido: ped, ok: true, igual: true }); continue; }
    var g = await gasEditarEmail(ped, novo);
    if (!g.ok) { res.push({ pedido: ped, ok: false, erro: g.erro }); continue; }
    /* o GAS já regravou a linha no espelho e pôs o pedido no índice do e-mail novo; aqui sai do índice do antigo */
    if (antigo) { try { var tira = {}; tira[k] = null; await fbPatch('vitaflow_idx_email/' + emailKey(antigo), tira); } catch (e) { /* o rebuild noturno limpa */ } }
    res.push({ pedido: ped, ok: true, de: antigo });
  }
  var feitos = res.filter(function (r) { return r.ok && !r.igual; });
  if (feitos.length) {
    try { await fbPut(RAIZ + '/correcoes_email/' + agora + '_' + crypto.randomBytes(3).toString('hex'), { quando: agora, uid: uid, para: novo, pedidos: feitos.map(function (r) { return { pedido: r.pedido, de: r.de || '' }; }) }); } catch (e) { /* registro é acessório */ }
  }
  return { ok: true, resultado: res };
}
async function admPainel() {
  var lidos = await Promise.all([fbGetOu(RAIZ + '/avaliacoes'), fbGetOu(RAIZ + '/como'), fbGetOu(RAIZ + '/usuarios', 'shallow=true'), fbGetOu(RAIZ + '/correcoes_email')]);
  var av = lidos[0] || {}, como = lidos[1] || {};
  var avaliacoes = Object.keys(av).map(function (k) { var a = av[k]; return { grupo: k, nota: a.nota, marcadores: a.marcadores || [], comentario: a.comentario || '', nome: a.nome || '', pedidos: a.pedidos || [], em: a.em || 0 }; })
    .sort(function (a, b) { return b.em - a.em; });
  var contagem = {}, outros = [];
  Object.keys(como).forEach(function (k) { var c = como[k]; if (!c || !c.opcao) return; contagem[c.opcao] = (contagem[c.opcao] || 0) + 1; if (c.opcao === 'Outro' && c.outro) outros.push(c.outro); });
  var corr = lidos[3] || {};
  var correcoes = Object.keys(corr).map(function (k) { return corr[k]; }).sort(function (a, b) { return (b.quando || 0) - (a.quando || 0); }).slice(0, 50);
  return { ok: true, avaliacoes: avaliacoes, como: contagem, como_outros: outros.slice(-100), contas: Object.keys(lidos[2] || {}).length, correcoes: correcoes };
}

/* ============================ handler ============================ */
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod === 'GET') return resp({ ok: true, versao: VERSAO, servico: 'conta-cliente' });
  if (!segredo()) return erro('config', 'Serviço indisponível no momento.');
  var d = {};
  try { d = JSON.parse(event.body || '{}') || {}; } catch (e) { d = {}; }
  var acao = String(d.acao || ''), agora = Date.now(), ip = ipDe(event);
  try {
    /* ---------- cliente ---------- */
    if (acao === 'pedir_link') {
      if (await estourou('ip_link_' + ip, 10, 3600000, agora)) return erro('limite', 'Muitos pedidos seguidos. Tente de novo daqui a uma hora.');
      var email = '', viaCpf = false;
      var termo = String(d.email || d.cpf || '').trim();
      if (termo.indexOf('@') >= 0) { email = normEmail(termo); if (!emailValido(email)) return erro('email_invalido', 'Confira o e-mail digitado.'); }
      else {
        var cpf = cpf11(termo);
        if (cpf.length !== 11) return erro('termo_invalido', 'Digite o seu e-mail (ou o CPF usado nas compras).');
        viaCpf = true;
        var porCpf = await linhasDoIndice('vitaflow_idx_cpf', cpf), hdr = await lerHdr(), I = indices(hdr), melhor = null;
        Object.keys(porCpf).forEach(function (k) {
          var l = porCpf[k];
          if (cpf11(cel(l, I.cpf)) !== cpf || ehRevendedor(cel(l, I.ped)) || R.naoPagou(cel(l, I.status), cel(l, 12))) return;
          if (!emailValido(normEmail(cel(l, I.email)))) return;
          if (!melhor || dataNum(cel(l, I.data)) > dataNum(cel(melhor, I.data))) melhor = l;
        });
        if (!melhor) return erro('cpf_sem_email', 'Não encontramos um e-mail nos pedidos deste CPF. Fale com o atendimento para conferir os seus dados.');
        email = normEmail(cel(melhor, I.email));
      }
      if (await estourou('email_link_' + emailKey(email), 3, 30 * 60000, agora)) return erro('limite', 'Já mandamos alguns links para este e-mail. Confira a caixa de entrada e o spam, ou tente de novo em 30 minutos.');
      var env = await mandarLink(email, agora, viaCpf ? 'cliente-cpf' : 'cliente');
      if (!env.ok) { console.error('[conta] brevo: ' + env.erro); return erro('envio', 'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.'); }
      return resp({ ok: true, para: mascararEmail(email), via_cpf: viaCpf });
    }

    if (acao === 'validar_link' || acao === 'criar_senha') {
      var tok = String(d.link || '');
      if (tok.length < 30 || tok.length > 80) return erro('link_invalido', 'Este link não é válido. Peça um novo.');
      var camL = RAIZ + '/links/' + sha(tok), lk = await fbGetOu(camL);
      if (!lk || !lk.email) return erro('link_invalido', 'Este link não é válido. Peça um novo.');
      if (lk.usado) return erro('link_usado', 'Este link já foi usado. Se precisar, peça um novo.');
      if (!(lk.exp > agora)) return erro('link_vencido', 'Este link venceu. Peça um novo.');
      var camU = RAIZ + '/usuarios/' + emailKey(lk.email), uL = await fbGetOu(camU);
      if (acao === 'validar_link') return resp({ ok: true, email: mascararEmail(lk.email), conta_existe: !!(uL && uL.hash), pendente: !!(uL && uL.hash && uL.pendente), pergunta_como: !(uL && uL.como && uL.como.opcao) });
      if (!senhaBoa(d.senha)) return erro('senha_fraca', 'A senha precisa ter pelo menos 8 caracteres.');
      await fbPatch(camL, { usado: agora });
      var salt = crypto.randomBytes(16).toString('hex'), hash = await scrypt(d.senha, salt);
      var nomeU = (uL && uL.nome) || await nomeDoEmail(lk.email);
      var novoU = { email: lk.email, nome: nomeU || '', hash: hash, salt: salt, versao: ((uL && uL.versao) || 0) + 1,
        criado: (uL && uL.criado) || agora, atualizado: agora, ultimo_acesso: agora };
      if (uL && uL.como) novoU.como = uL.como;
      /* v10: conta confirmada mantém o cadastro salvo em "Meus dados" (antes a troca de senha apagava). Conta PENDENTE confirmada por
         senha nova: o que foi digitado na criação pode ser de outra pessoa → só é mantido se este navegador tem a sessão da criação. */
      if (uL && uL.cadastro) {
        var mantem = !uL.pendente;
        if (uL.pendente) { var scL = await lerSessao(d.sessao, agora); mantem = !!(scL && normEmail(scL.u.email) === normEmail(lk.email)); }
        if (mantem) { novoU.cadastro = uL.cadastro; if (uL.cpf) novoU.cpf = uL.cpf; }
      }
      if (uL && uL.pendente) novoU.confirmado = agora;
      var opc = String(d.como || '');
      if (!novoU.como && COMO_OPCOES.indexOf(opc) >= 0) {
        novoU.como = { opcao: opc, outro: opc === 'Outro' ? limpaTexto(d.outro, 60) : '', em: agora };
        await fbPut(RAIZ + '/como/' + emailKey(lk.email), novoU.como);
      }
      await fbPut(camU, novoU);
      await zerarLimite('login_' + emailKey(lk.email));
      var ses = await criarSessao(novoU, !!d.manter, agora);
      return resp({ ok: true, sessao: ses.sessao, exp: ses.exp, nome: ses.nome, manter: ses.manter, conta_nova: !(uL && uL.hash) });
    }

    if (acao === 'entrar') {
      var emE = normEmail(d.email);
      if (!emailValido(emE) || !d.senha) return erro('dados', 'Digite o e-mail e a senha.');
      if (await estourou('ip_login_' + ip, 30, 15 * 60000, agora)) return erro('limite', 'Muitas tentativas seguidas. Espere 15 minutos e tente de novo.');
      var camE = RAIZ + '/usuarios/' + emailKey(emE), uE = await fbGetOu(camE);
      var limE = await fbGetOu(RAIZ + '/limites/' + chaveFb('login_' + emailKey(emE)));
      if (limE && limE.desde && agora - limE.desde < 15 * 60000 && limE.n >= 8) return erro('limite', 'Muitas tentativas com este e-mail. Espere 15 minutos ou use "Esqueci minha senha".');
      var bate = uE ? await senhaConfere(d.senha, uE) : (await scrypt(d.senha, '00112233445566778899aabbccddeeff'), false);
      if (!bate) {
        await estourou('login_' + emailKey(emE), 1000, 15 * 60000, agora);
        return erro('senha', 'E-mail ou senha incorretos.', { sem_conta: false });
      }
      await zerarLimite('login_' + emailKey(emE));
      await fbPatch(camE, { ultimo_acesso: agora });
      var sE = await criarSessao(uE, !!d.manter, agora);
      return resp({ ok: true, sessao: sE.sessao, exp: sE.exp, nome: sE.nome, manter: sE.manter, pendente: !!uE.pendente });
    }

    /* ---------- v10: conta criada no carrinho ---------- */
    if (acao === 'conta_existe') {
      var emX = normEmail(d.email);
      if (!emailValido(emX)) return resp({ ok: true, existe: false });
      if (await estourou('ip_existe_' + ip, 60, 3600000, agora)) return resp({ ok: true, existe: false, limite: true });
      var uX = await fbGetOu(RAIZ + '/usuarios/' + emailKey(emX));
      return resp({ ok: true, existe: !!(uX && uX.hash && !uX.pendente) });
    }
    if (acao === 'criar_no_carrinho') {
      var emC = normEmail(d.email);
      if (!emailValido(emC)) return erro('email_invalido', 'Confira o e-mail digitado.');
      if (!senhaBoa(d.senha)) return erro('senha_fraca', 'A senha precisa ter pelo menos 8 caracteres.');
      var nomeNovo = limpaTexto(d.nome, 80);
      if (nomeNovo.length < 3) return erro('nome', 'Digite o seu nome completo.');
      if (await estourou('ip_criar_' + ip, 10, 3600000, agora)) return erro('limite', 'Muitas contas criadas em seguida. Tente de novo daqui a uma hora.');
      var camC = RAIZ + '/usuarios/' + emailKey(emC), uC = await fbGetOu(camC);
      if (uC && uC.hash && !uC.pendente) return erro('ja_existe', 'Este e-mail já tem conta na VitaFlow. Digite a senha para entrar.');
      var saltC = crypto.randomBytes(16).toString('hex'), hashC = await scrypt(d.senha, saltC);
      var novoC = { email: emC, nome: nomeNovo, hash: hashC, salt: saltC, versao: ((uC && uC.versao) || 0) + 1, criado: agora, atualizado: agora,
        ultimo_acesso: agora, pendente: true, origem: 'carrinho' };
      var cpfN = cpf11(d.cpf); if (cpfN.length === 11) novoC.cpf = cpfN;
      var telN = telDigitos(d.telefone), endN = normEndereco(d.endereco);
      if ((telN.length === 10 || telN.length === 11) || endN) novoC.cadastro = { telefone: (telN.length === 10 || telN.length === 11) ? telN : '', enderecos: endN ? [endN] : [], principal: 0, em: agora };
      await fbPut(camC, novoC);   /* conta pendente anterior (se havia) é refeita: senha, dados e sessões antigas deixam de valer */
      await zerarLimite('login_' + emailKey(emC));
      var enviou = false;
      if (!(await estourou('email_link_' + emailKey(emC), 3, 30 * 60000, agora))) {
        try { var envC = await mandarLink(emC, agora, 'confirmar'); enviou = !!(envC && envC.ok); if (!enviou) console.error('[conta] brevo (confirmar): ' + (envC && envC.erro)); }
        catch (eC) { console.error('[conta] confirmar: ' + (eC && eC.message || eC)); }
      }
      var sesC = await criarSessao(novoC, true, agora);
      return resp({ ok: true, sessao: sesC.sessao, exp: sesC.exp, nome: sesC.nome, manter: true, pendente: true, para: mascararEmail(emC), email_enviado: enviou });
    }
    if (acao === 'confirmar_email') {
      var tokF = String(d.link || '');
      if (tokF.length < 30 || tokF.length > 80) return erro('link_invalido', 'Este link não é válido. Peça um novo.');
      var camLF = RAIZ + '/links/' + sha(tokF), lkF = await fbGetOu(camLF);
      if (!lkF || !lkF.email) return erro('link_invalido', 'Este link não é válido. Peça um novo.');
      if (lkF.usado) return erro('link_usado', 'Este link já foi usado. Se precisar, peça um novo.');
      if (!(lkF.exp > agora)) return erro('link_vencido', 'Este link venceu. Peça um novo.');
      var camUF = RAIZ + '/usuarios/' + emailKey(lkF.email), uF = await fbGetOu(camUF);
      if (!uF || !uF.hash || !uF.pendente) return erro('precisa_senha', 'Crie a sua senha para continuar.');
      var scF = await lerSessao(d.sessao, agora);
      if (!scF || normEmail(scF.u.email) !== normEmail(lkF.email)) return erro('precisa_senha', 'Para a sua segurança, crie uma senha para confirmar a conta.');
      await fbPatch(camLF, { usado: agora });
      await fbPatch(camUF, { pendente: null, confirmado: agora, atualizado: agora, ultimo_acesso: agora });
      return resp({ ok: true, confirmado: true, nome: primeiroNome(uF.nome) });
    }
    if (acao === 'reenviar_confirmacao') {
      var scR = await lerSessao(d.sessao, agora);
      if (!scR) return erro('sessao', 'Sua sessão terminou. Entre de novo.');
      if (!scR.u.pendente) return resp({ ok: true, confirmado: true });
      if (await estourou('email_link_' + emailKey(scR.u.email), 3, 30 * 60000, agora)) return erro('limite', 'Já mandamos alguns links para este e-mail. Confira a caixa de entrada e o spam, ou tente de novo em 30 minutos.');
      var envR = await mandarLink(normEmail(scR.u.email), agora, 'confirmar');
      if (!envR.ok) { console.error('[conta] brevo: ' + envR.erro); return erro('envio', 'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.'); }
      return resp({ ok: true, para: mascararEmail(normEmail(scR.u.email)) });
    }

    if (acao === 'sair') {
      var tS = String(d.sessao || '');
      if (tS.length >= 30 && tS.length <= 80) { try { await fbDel(RAIZ + '/sessoes/' + sha(tS)); } catch (e) { /* já saiu */ } }
      return resp({ ok: true });
    }

    if (acao === 'minha_conta' || acao === 'como_conheceu' || acao === 'avaliar' || acao === 'dados_compra' || acao === 'salvar_dados') {
      var sc = await lerSessao(d.sessao, agora);
      if (!sc) return erro('sessao', 'Sua sessão terminou. Entre de novo.');
      var camUs = RAIZ + '/usuarios/' + emailKey(sc.u.email);

      if (acao === 'dados_compra') return resp(await montarConta(sc.u, agora, true));   /* v5 */
      if (acao === 'minha_conta') {
        var conta = await montarConta(sc.u, agora);
        try { await fbPatch(camUs, { ultimo_acesso: agora }); } catch (e) { /* acessório */ }
        return resp(conta);
      }
      if (acao === 'salvar_dados') {   /* v8 */
        var telS = telDigitos(d.telefone);
        if (telS.length < 10 || telS.length > 11) return erro('telefone', 'Digite o telefone com DDD (10 ou 11 números).');
        var entrada = Array.isArray(d.enderecos) ? d.enderecos : [];
        if (entrada.length > MAX_ENDERECOS) return erro('enderecos', 'Dá para guardar até ' + MAX_ENDERECOS + ' endereços.');
        var endsS = [];
        for (var iE = 0; iE < entrada.length; iE++) {
          var nE = normEndereco(entrada[iE]);
          if (!nE) return erro('endereco', 'Complete o endereço ' + (iE + 1) + ': CEP, rua, número, bairro, cidade e UF.', { indice: iE });
          endsS.push(nE);
        }
        var prS = parseInt(d.principal, 10); if (!(prS >= 0 && prS < endsS.length)) prS = 0;
        await fbPut(camUs + '/cadastro', { telefone: telS, enderecos: endsS, principal: prS, em: agora });
        return resp({ ok: true, cadastro: { salvo: true, telefone: telS, enderecos: endsS, principal: prS } });
      }
      if (acao === 'como_conheceu') {
        var op = String(d.opcao || '');
        if (COMO_OPCOES.indexOf(op) < 0) return erro('opcao', 'Escolha uma opção.');
        var como = { opcao: op, outro: op === 'Outro' ? limpaTexto(d.outro, 60) : '', em: agora };
        await fbPatch(camUs, { como: como });
        await fbPut(RAIZ + '/como/' + emailKey(sc.u.email), como);
        return resp({ ok: true });
      }
      /* avaliar */
      var nota = parseInt(d.nota, 10);
      if (!(nota >= 1 && nota <= 5)) return erro('nota', 'Escolha de 1 a 5 estrelas.');
      var chG = chaveFb(String(d.grupo || ''));
      if (!chG) return erro('grupo', 'Pedido não encontrado.');
      if (await fbGetOu(RAIZ + '/avaliacoes/' + chG)) return erro('ja_avaliado', 'Este pedido já foi avaliado. Obrigado!');
      var contaA = await montarConta(sc.u, agora);
      var gA = (contaA.grupos || []).filter(function (g) { return g.chave === chG && !g.reenvio; })[0];
      if (!gA) return erro('grupo', 'Pedido não encontrado.');
      if (!gA.avaliacao || !gA.avaliacao.pode) return erro('nao_entregue', 'A avaliação abre quando todos os pacotes forem entregues.');
      var marc = (d.marcadores || []).filter(function (m) { return MARCADORES.indexOf(m) >= 0; }).slice(0, 5);
      var coment = limpaTexto(d.comentario, 600);
      var pedsA = [gA.principal].concat(gA.junto || []);
      await fbPut(RAIZ + '/avaliacoes/' + chG, { nota: nota, marcadores: marc, comentario: coment, email: sc.u.email, nome: contaA.conta.nome, pedidos: pedsA, em: agora });
      if (nota <= 2) {
        await telegram('⚠️ AVALIAÇÃO NOTA ' + nota + ' na Minha Conta\n\n📦 ' + pedsA.join(', ') + '\n👤 ' + contaA.conta.nome +
          (marc.length ? '\n🏷️ ' + marc.join(', ') : '') + (coment ? '\n💬 ' + coment : '') + '\n\nVale um contato antes de virar reclamação.');
      }
      return resp({ ok: true });
    }

    /* ---------- v9: prévia do atendimento (só leitura, com o código gerado por um admin) ---------- */
    if (acao === 'previa') {
      var pv = await previaDoToken(d.token, agora);
      if (!pv) return erro('previa', 'Esta prévia venceu. Gere outra no painel.');
      var uPv = (await fbGetOu(RAIZ + '/usuarios/' + emailKey(pv.email))) || {};
      var contaPv = await montarConta(Object.assign({}, uPv, { email: pv.email }), agora);
      contaPv.previa = true;
      return resp(contaPv);
    }

    /* ---------- atendimento (admin) ---------- */
    if (acao.indexOf('adm_') === 0) {
      var uid = await conferirAdmin(d.idToken);
      if (!uid) return erro('nao_autorizado', 'Entre de novo no painel.');
      if (acao === 'adm_buscar') return resp(await admBuscar(d.termo));
      if (acao === 'adm_trocar_email') return resp(await admTrocarEmail(uid, d.pedidos, d.email, agora));
      if (acao === 'adm_reenviar_link') {
        var emR = normEmail(d.email);
        if (!emailValido(emR)) return erro('email_invalido', 'E-mail inválido.');
        var envR = await mandarLink(emR, agora, 'atendimento:' + uid);
        return resp(envR.ok ? { ok: true, para: emR } : { ok: false, erro: 'envio', msg: envR.erro });
      }
      if (acao === 'adm_painel') return resp(await admPainel());
      if (acao === 'adm_previa_link') return resp(await admPreviaLink(uid, d.termo, agora));   /* v9 */
    }
    return erro('acao', 'Ação desconhecida.');
  } catch (e) {
    console.error('[conta] ' + acao + ': ' + (e && e.stack || e));
    return erro('falha', 'Não conseguimos carregar agora. Tente de novo em alguns instantes.');
  }
};

/* só pra teste local (node) */
exports._t = { normEndereco: normEndereco, cadastroSalvo: cadastroSalvo, enderecoPartes: enderecoPartes, parseProdutos: parseProdutos, casarD: casarD, notaSeq: notaSeq, sorteioCiclo: sorteioCiclo, sorteioCicloPorN: sorteioCicloPorN,
  mascararEmail: mascararEmail, mascararCpf: mascararCpf, montarConta: montarConta, envioPublico: envioPublico, indices: indices, scrypt: scrypt };
