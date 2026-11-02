'use strict';
/* =============================================================================
   pedidos-paliativo.js — PEDIDOS SEM A PLANILHA DO GOOGLE (VitaFlow)  ·  v1  ·  02/11/2026
   POR QUE EXISTE: o Google Workspace foi suspenso (02/11/2026) e o Apps Script não consegue mais abrir a planilha de
   pedidos ("You do not have permission to access the requested document"). O GAS ainda recebe o pedido e o guarda em
   vitaflow_pedidos_brutos (rede de segurança de 14/09), mas a linha nunca nasce — e o pedido não aparece no Compras,
   na logística nem em painel nenhum (todos leem o ESPELHO vitaflow_pedidos, que era copiado da planilha).

   O QUE FAZ (a cada 5 min, sem Google nenhum):
     1) vitaflow_pedidos_brutos (gravado:false) → monta a MESMA linha que o doPost gravava na planilha (mesmas 18 colunas,
        mesma ordem, CADEADO = FECHADO) e grava direto no espelho vitaflow_pedidos/<chave> + índices (cpf/e-mail) +
        histórico de status (quando nasce confirmado) + recibo (vitaflow_recibos) + Telegram "NOVO PEDIDO" + e-mail de
        compra concluída (Brevo) quando o pedido já nasce pago (Athena, manual -M, revendedor -V, atacado manual, vale).
        Marca gravado:true no bruto — o GAS para de tentar (e para de avisar) esse pedido.
     2) vitaflow_confirmacoes_pendentes (webhook da InfinitePay/BrasPay que o GAS guardou porque não achou a linha)
        → pedido existe no espelho e ainda não está pago: STATUS = PEDIDO CONFIRMADO, METODO, HORA_CONFIRMACAO,
        histórico, e-mail de compra concluída, Telegram "PAGAMENTO CONFIRMADO". Pedido da Athena (A) ou sem linha ainda:
        deixa quieto (o próprio GAS consome quando o cliente manda os dados).
   NÃO FAZ (fica para a migração): contagem de uso de cupom (Firestore), bloco do sorteio no e-mail, lucro no Telegram,
   e-mail interno (já estava desligado), banco novo (o poller do GAS é quem mandava para o Supabase).

   Netlify Function AGENDADA no repo vitaflow-proxy → netlify/functions/pedidos-paliativo.js
   netlify.toml:  [functions."pedidos-paliativo"]  schedule = "cada 5 min" (cron: asterisco-barra-5, depois 4 asteriscos)
   Variáveis de ambiente (já existem no site): FIREBASE_SECRET · BREVO_API_KEY · TELEGRAM_TOKEN · TELEGRAM_CHAT
   ============================================================================= */

var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var FB_SECRET = process.env.FIREBASE_SECRET || '';
var RECIBO_BASE = 'https://melodious-pony-e4f4f5.netlify.app/recibo-auto.html';
var BREVO_REMETENTE_NOME = 'VitaFlow';
var BREVO_REMETENTE_EMAIL = 'contato@vitaflowoficial.com';
var HIST_ULTIMO_PATH = 'vitaflow_sync/historico_ultimo';
var EMAIL_COMPRA_GRUPO_WA = 'https://chat.whatsapp.com/Bcw7hkVR3ITE5RQtnYzdD7';   /* os mesmos do GAS */
var EMAIL_COMPRA_GRUPO_TG = 'https://t.me/referencias_vitaflow';
var TZ = 'America/Sao_Paulo';
var MAX_POR_RODADA = 40;

/* ───────── Firebase ───────── */
function fbUrl(caminho) { return FB_BASE + caminho + '.json' + (FB_SECRET ? '?auth=' + encodeURIComponent(FB_SECRET) : ''); }
async function fetchT(url, opts, ms) {
  var ctrl = new AbortController(); var t = setTimeout(function () { ctrl.abort(); }, ms || 8000);
  try { return await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal })); } finally { clearTimeout(t); }
}
async function fbGet(caminho) {
  var r = await fetchT(fbUrl(caminho), {});
  if (!r.ok) throw new Error('firebase GET ' + r.status + ' ' + caminho);
  var txt = await r.text(); return (txt === '' || txt === 'null') ? null : JSON.parse(txt);
}
async function fbPut(caminho, v) {
  var r = await fetchT(fbUrl(caminho), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
  if (!r.ok) throw new Error('firebase PUT ' + r.status + ' ' + caminho);
}
async function fbPatch(caminho, v) {
  var r = await fetchT(fbUrl(caminho), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
  if (!r.ok) throw new Error('firebase PATCH ' + r.status + ' ' + caminho);
}
async function fbDelete(caminho) { try { await fetchT(fbUrl(caminho), { method: 'DELETE' }); } catch (e) {} }

/* ───────── Avisos ───────── */
async function telegram(txt) {
  var t = process.env.TELEGRAM_TOKEN, c = process.env.TELEGRAM_CHAT;
  if (!t || !c) return false;
  try {
    var r = await fetchT('https://api.telegram.org/bot' + t + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: c, text: txt }) });
    return r.ok;
  } catch (e) { return false; }
}
async function enviarEmailBrevo(destinatario, assunto, texto, html) {
  var bk = String(process.env.BREVO_API_KEY || '').trim();
  if (!bk) return { ok: false, erro: 'sem BREVO_API_KEY' };
  var e = String(destinatario || '').trim();
  if (!e || e.indexOf('@') <= 0) return { ok: false, erro: 'sem e-mail válido' };
  var payload = { sender: { name: BREVO_REMETENTE_NOME, email: BREVO_REMETENTE_EMAIL }, to: [{ email: e }], subject: String(assunto || '(sem assunto)') };
  if (html) payload.htmlContent = String(html);
  if (texto) payload.textContent = String(texto);
  try {
    var r = await fetchT('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': bk, 'accept': 'application/json' }, body: JSON.stringify(payload) }, 12000);
    if (r.ok) return { ok: true };
    return { ok: false, erro: 'Brevo ' + r.status + ' ' + (await r.text()).slice(0, 160) };
  } catch (er) { return { ok: false, erro: String(er && er.message || er) }; }
}

/* ───────── Datas (Brasília) — iguais ao Utilities.formatDate do GAS ───────── */
function partes(ts) {
  var p = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(ts || Date.now()));
  var o = {}; p.forEach(function (x) { o[x.type] = x.value; }); if (o.hour === '24') o.hour = '00'; return o;
}
function dataBR(ts) { var o = partes(ts); return o.day + '/' + o.month + '/' + o.year; }
function dataHoraBR(ts) { var o = partes(ts); return o.day + '/' + o.month + ' ' + o.hour + ':' + o.minute + ':' + o.second; }
function horaBR(ts) { var o = partes(ts); return o.hour + ':' + o.minute; }

/* ───────── Mesmas regras do GAS ───────── */
function histKey(p) { return String(p || '').replace(/[.#$\[\]\/]/g, '_'); }
function brutoKey(p) { return String(p || '').replace(/[^a-zA-Z0-9]/g, '_'); }
function cpf11(v) { var d = String(v == null ? '' : v).replace(/\D/g, ''); return d.length === 10 ? '0' + d : d; }
function metodoPagamento(cm) {
  if (!cm) return 'Aguardando pagamento';
  cm = String(cm).toLowerCase();
  if (cm === 'pix') return 'PIX';
  if (cm === 'pendente') return 'Aguardando pagamento';
  return 'Cartão';
}
function ehAtacadoManual(orderNsu, observacao) {
  if (!/^VF-\d{4}-[WP]/i.test(String(orderNsu || '').trim())) return false;
  return /^atacado(\s*pjc)?\s*[—–-]\s*manual/i.test(String(observacao || '').trim());
}
function semMarcasWhats(v) {
  if (v == null) return v;
  var s = String(v).replace(/[*~`]/g, '');
  var m = s.match(/^\s*_+([\s\S]*?)_+\s*$/); if (m) s = m[1];
  return s.replace(/\s{2,}/g, ' ').replace(/^\s+|\s+$/g, '');
}
function limparDadosClienteWhats(data) {
  if (!data) return;
  var c = data.customer, a = data.address, k;
  if (c) { if (c.name != null) c.name = semMarcasWhats(c.name); if (c.email != null) c.email = semMarcasWhats(c.email); }
  if (a) { var ks = ['street', 'number', 'complement', 'neighborhood', 'city', 'state', 'cep']; for (k = 0; k < ks.length; k++) if (a[ks[k]] != null) a[ks[k]] = semMarcasWhats(a[ks[k]]); }
  if (data.nome != null) data.nome = semMarcasWhats(data.nome);
  if (data.email != null) data.email = semMarcasWhats(data.email);
  if (data.endereco != null) data.endereco = String(data.endereco).replace(/[*~`]/g, '').replace(/\s{2,}/g, ' ').replace(/^\s+|\s+$/g, '');
}
function statusPago(s) {
  var u = String(s || '').trim().toUpperCase();
  return u.indexOf('PAGO') !== -1 || u === 'PEDIDO CONFIRMADO' || u === 'EM SEPARACAO' || u === 'EM SEPARAÇÃO' || u === 'DESPACHADO' || u === 'POSTADO' || u === 'ENTREGUE' || u === 'EM TRANSITO' || u === 'EM TRÂNSITO' || u === 'SAIU PARA ENTREGA';
}
function colIdx(hdr, nome) { var up = hdr.map(function (h) { return String(h || '').trim().toUpperCase(); }); return up.indexOf(String(nome).toUpperCase()); }
function histChaveEvento(prefixo, status, ts) {
  var slug = String(status || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return prefixo + Math.floor(Number(ts) / 120000) + '_' + slug;
}
async function registrarHistoricoStatus(pedido, statusNovo) {
  var fbKey = histKey(pedido), agora = Date.now();
  var evento = { status: statusNovo, data: dataBR(agora), hora: horaBR(agora), ts: agora };
  var patch = {}; patch['vitaflow_historico_status/' + fbKey + '/' + histChaveEvento('e', statusNovo, agora)] = evento; patch[HIST_ULTIMO_PATH + '/' + fbKey] = statusNovo;
  await fbPatch('/', patch);
}
function gerarLinkRecibo(orderNsu, nome, cpf, email, pagto, items, amount, endereco, telefone) {
  var params = [];
  params.push('pedido=' + encodeURIComponent(orderNsu));
  if (nome) params.push('nome=' + encodeURIComponent(nome));
  if (cpf) params.push('cpf=' + encodeURIComponent(cpf));
  if (email) params.push('email=' + encodeURIComponent(email));
  if (telefone) params.push('tel=' + encodeURIComponent(telefone));
  if (endereco) params.push('end=' + encodeURIComponent(endereco));
  params.push('data=' + encodeURIComponent(dataBR()));
  params.push('pagto=' + encodeURIComponent(pagto));
  params.push('total=' + encodeURIComponent(amount));
  var prods = (items || []).filter(function (i) { return i.description && i.description.toLowerCase().indexOf('frete') !== 0; })
    .map(function (i) { return { nome: i.description, quantidade: i.quantity, preco_unit: i.price ? (i.price / 100) : 0 }; });
  var freteItem = (items || []).filter(function (i) { return i.description && i.description.toLowerCase().indexOf('frete') === 0; })[0];
  if (freteItem) { params.push('frete=' + encodeURIComponent(freteItem.description)); params.push('frete_v=' + encodeURIComponent(freteItem.price ? (freteItem.price / 100) : 0)); }
  if (prods.length > 0) params.push('produtos=' + Buffer.from(encodeURIComponent(JSON.stringify(prods)), 'utf8').toString('base64'));
  return RECIBO_BASE + '?' + params.join('&');
}
function _emailBlocoSorteio() { return { texto: '', html: '' }; }   /* paliativo: o bloco do sorteio depende do GAS (sorteioCiclo) */
function _emailDocMobile(corpo) {
  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no">' +
    '<title>VitaFlow</title>' +
    '<style>html,body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%}</style>' +
    '</head><body style="margin:0;padding:0;background:#eceff3;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%">' + corpo + '</body></html>';
}

function montarEmailCompra(nome, orderNsu, linkRecibo){
  var primeiro = String(nome || '').trim().split(/\s+/)[0] || 'Cliente';
  var rastreioUrl = 'https://vitaflowoficial.com/pages/rastrear-pedido';
  var LOGO = 'https://cdn.shopify.com/s/files/1/0777/9762/1945/files/vitaflow_no_bg_pro.png?v=1775266917';

  var _bs = _emailBlocoSorteio();

  var texto =
    'Ola, ' + primeiro + '!\n\n' +
    'Seu pedido ' + orderNsu + ' foi confirmado com sucesso! Obrigado pela confianca na VitaFlow.\n\n' +
    (linkRecibo ? ('Seu recibo: ' + linkRecibo + '\n\n') : '') +
    'Acompanhe seu pedido em: ' + rastreioUrl + ' (use o numero do pedido, CPF ou e-mail).\n\n' +
    'IMPORTANTE - FILME A ABERTURA DA EMBALAGEM: ao receber, grave um video continuo e sem cortes, da caixa fechada ate a retirada de todos os itens. Sem o video nao conseguimos abrir reclamacao junto a transportadora.\n\n' +
    'ENDERECO: confira todos os dados e garanta alguem no local para receber. Nao solicite deixar o pacote sem ninguem para receber.\n\n' +
    'ESTOQUE: se algum item faltar, fazemos a substituicao por equivalente ou superior. Se preferir nao receber substitutos, fale com o suporte.\n\n' +
    'Prazo de postagem: ate 3 dias uteis apos a confirmacao do pagamento. Com o aumento das fiscalizacoes, as postagens saem em lotes controlados por dia.\n' +
    'Prazos estimados de entrega depois da postagem, em dias uteis: Sudeste - SP e RJ 1 a 6, MG 2 a 6, ES 2 a 8; Sul - PR 2 a 6, SC 2 a 7, RS 2 a 5; Centro-Oeste - DF 3 a 6, GO 2 a 6, MS 4 a 8, MT 4 a 9; Nordeste - BA 3 a 10, demais estados 5 a 11; Norte - 7 a 11.\n' +
    'Atacado: postagem em ate 6 dias uteis apos a confirmacao do pagamento; depois da postagem, valem os mesmos prazos de entrega.\n\n' +
    (_bs.texto ? (_bs.texto + '\n\n') : '') +
    'Equipe VitaFlow';

  var btnRecibo = linkRecibo
    ? ('<a href="'+linkRecibo+'" style="display:block;text-align:center;background:#ffffff;color:#0D1B2E;text-decoration:none;font-size:16px;font-weight:700;padding:14px 10px;border-radius:10px;border:2px solid #d9e0ea;margin-top:10px">&#129534; Ver recibo</a>')
    : '';

  var html =
  '<div style="background:#eceff3;padding:20px 10px;font-family:Arial,Helvetica,sans-serif">'+
    '<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden">'+
      '<tr><td style="background:#0D1B2E;padding:26px 20px 22px;text-align:center">'+
        '<div style="height:4px;width:52px;margin:0 auto 14px;background:#F5A623;border-radius:2px"></div>'+
        '<img src="'+LOGO+'" alt="VitaFlow" width="170" style="display:inline-block;width:170px;max-width:60%;height:auto;border:0">'+
        '<div style="font-size:11px;color:#8fa1b5;letter-spacing:2px;margin-top:10px">SA&Uacute;DE &amp; PERFORMANCE</div>'+
      '</td></tr>'+
      '<tr><td style="padding:30px 20px 6px;text-align:center">'+
        '<div style="width:60px;height:60px;line-height:60px;margin:0 auto 12px;background:#eafaf1;border-radius:50%;font-size:30px">&#9989;</div>'+
        '<h1 style="margin:0 0 8px;font-size:22px;color:#0D1B2E;font-weight:800">Pedido confirmado!</h1>'+
        '<p style="margin:0;font-size:15px;color:#5a6b80;line-height:1.6">Ol&aacute;, <b style="color:#0D1B2E">'+primeiro+'</b>! Recebemos seu pedido e j&aacute; estamos preparando tudo com muito cuidado. Obrigado pela confian&ccedil;a. &#128154;</p>'+
      '</td></tr>'+
      '<tr><td style="padding:22px 20px 6px">'+
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;border:1px solid #e7ecf3;border-radius:12px"><tr><td style="padding:16px;text-align:center">'+
          '<div style="font-size:11px;color:#8a94a6;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">N&uacute;mero do pedido</div>'+
          '<div style="font-size:18px;font-weight:800;color:#0D1B2E">'+orderNsu+'</div>'+
        '</td></tr></table>'+
      '</td></tr>'+
      '<tr><td style="padding:14px 20px 6px">'+
        '<a href="'+rastreioUrl+'" style="display:block;text-align:center;background:#F5A623;color:#0D1B2E;text-decoration:none;font-size:16px;font-weight:800;padding:15px 10px;border-radius:10px">&#128269; Rastrear pedido</a>'+
        btnRecibo +
        '<p style="margin:12px 2px 0;font-size:12px;color:#8a94a6;text-align:center;line-height:1.6">Rastreie a qualquer momento em <b style="color:#5a6b80">vitaflowoficial.com/pages/rastrear-pedido</b> pelo n&uacute;mero do pedido, CPF ou e-mail.</p>'+
      '</td></tr>'+
      '<tr><td style="padding:20px 20px 6px">'+
        '<div style="font-size:13px;font-weight:700;color:#0D1B2E;margin-bottom:4px">&#128230; Prazo de entrega</div>'+
        '<p style="margin:0 0 12px;font-size:13px;color:#5a6b80;line-height:1.6">Postagem em at&eacute; <b>3 dias &uacute;teis</b> ap&oacute;s a confirma&ccedil;&atilde;o. Com o aumento das fiscaliza&ccedil;&otilde;es, as postagens saem em lotes controlados por dia. Depois de postado, o prazo estimado (dias &uacute;teis):</p>'+
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#41506a">'+
          '<tr><td style="padding:8px 0;border-bottom:1px solid #eef1f5"><div style="font-size:13px;font-weight:700;color:#0D1B2E"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#4FC3F7;margin-right:8px"></span>Sudeste</div><div style="font-size:13px;font-weight:700;color:#0280CD;padding:3px 0 0 16px;line-height:1.5">SP e RJ 1 a 6 &middot; MG 2 a 6 &middot; ES 2 a 8</div></td></tr>'+
          '<tr><td style="padding:8px 0;border-bottom:1px solid #eef1f5"><div style="font-size:13px;font-weight:700;color:#0D1B2E"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#2ECC71;margin-right:8px"></span>Sul</div><div style="font-size:13px;font-weight:700;color:#0280CD;padding:3px 0 0 16px;line-height:1.5">PR 2 a 6 &middot; SC 2 a 7 &middot; RS 2 a 5</div></td></tr>'+
          '<tr><td style="padding:8px 0;border-bottom:1px solid #eef1f5"><div style="font-size:13px;font-weight:700;color:#0D1B2E"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#F5A623;margin-right:8px"></span>Centro-Oeste</div><div style="font-size:13px;font-weight:700;color:#0280CD;padding:3px 0 0 16px;line-height:1.5">DF 3 a 6 &middot; GO 2 a 6 &middot; MS 4 a 8 &middot; MT 4 a 9</div></td></tr>'+
          '<tr><td style="padding:8px 0;border-bottom:1px solid #eef1f5"><div style="font-size:13px;font-weight:700;color:#0D1B2E"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff8c42;margin-right:8px"></span>Nordeste</div><div style="font-size:13px;font-weight:700;color:#0280CD;padding:3px 0 0 16px;line-height:1.5">BA 3 a 10 &middot; demais 5 a 11</div></td></tr>'+
          '<tr><td style="padding:8px 0;border-bottom:1px solid #eef1f5"><div style="font-size:13px;font-weight:700;color:#0D1B2E"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff6b6b;margin-right:8px"></span>Norte</div><div style="font-size:13px;font-weight:700;color:#0280CD;padding:3px 0 0 16px;line-height:1.5">7 a 11</div></td></tr>'+
        '</table>'+
        '<p style="margin:12px 0 0;font-size:13px;color:#41506a;line-height:1.6"><b style="color:#0D1B2E">&#127981; Atacado</b>: postagem em at&eacute; <b>6 dias &uacute;teis</b> ap&oacute;s a confirma&ccedil;&atilde;o do pagamento. Depois da postagem, valem os mesmos prazos de entrega (acima).</p>'+
        '<p style="margin:8px 0 0;font-size:11px;color:#a0a9b8;font-style:italic">*Dias &uacute;teis. Estimativas; podem variar conforme dist&acirc;ncia e condi&ccedil;&otilde;es de entrega.</p>'+
      '</td></tr>'+
      _bs.html +
      '<tr><td style="padding:18px 20px 0"><div style="border-top:1px solid #eceff3"></div></td></tr>'+
      '<tr><td style="padding:18px 20px 4px">'+
        '<div style="font-size:13px;font-weight:800;color:#0D1B2E;margin-bottom:14px">&#9888; Importante &mdash; leia antes de receber</div>'+
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px"><tr><td width="30" valign="top" style="font-size:20px;padding-top:2px">&#128249;</td><td style="font-size:13px;color:#41506a;line-height:1.6"><b style="color:#0D1B2E">Filme a abertura da embalagem.</b> V&iacute;deo cont&iacute;nuo e sem cortes, da caixa fechada at&eacute; retirar todos os itens. Sem o v&iacute;deo n&atilde;o conseguimos abrir reclama&ccedil;&atilde;o junto &agrave; transportadora.</td></tr></table>'+
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px"><tr><td width="30" valign="top" style="font-size:20px;padding-top:2px">&#128205;</td><td style="font-size:13px;color:#41506a;line-height:1.6"><b style="color:#0D1B2E">Endere&ccedil;o completo e algu&eacute;m para receber.</b> Confira rua, n&uacute;mero, complemento, bairro e refer&ecirc;ncia. Garanta uma pessoa no local &mdash; n&atilde;o pe&ccedil;a para deixar sem ningu&eacute;m receber.</td></tr></table>'+
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="30" valign="top" style="font-size:20px;padding-top:2px">&#128230;</td><td style="font-size:13px;color:#41506a;line-height:1.6"><b style="color:#0D1B2E">Estoque.</b> Por conta do alto volume no atacado, se algum item faltar fazemos a substitui&ccedil;&atilde;o por equivalente ou superior. Se preferir n&atilde;o receber substitutos, fale com o suporte.</td></tr></table>'+
      '</td></tr>'+
      '<tr><td style="padding:20px 20px 6px">'+
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;border:1px solid #e7ecf3;border-radius:12px"><tr><td style="padding:18px 16px;text-align:center">'+
          '<div style="font-size:15px;font-weight:800;color:#0D1B2E;margin-bottom:4px">&#128241; Entre nos grupos oficiais</div>'+
          '<div style="font-size:12.5px;color:#5a6b80;line-height:1.5;margin-bottom:14px">Promo&ccedil;&otilde;es, lan&ccedil;amentos e avisos em primeira m&atilde;o.</div>'+
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'+
            '<td style="width:50%;padding:0 4px 0 0"><a href="'+EMAIL_COMPRA_GRUPO_WA+'" style="display:block;text-align:center;background:#25D366;color:#08301a;text-decoration:none;font-weight:700;font-size:13px;padding:12px 4px;border-radius:8px">&#128172; WhatsApp</a></td>'+
            '<td style="width:50%;padding:0 0 0 4px"><a href="'+EMAIL_COMPRA_GRUPO_TG+'" style="display:block;text-align:center;background:#229ED9;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;padding:12px 4px;border-radius:8px">&#9992; Telegram</a></td>'+
          '</tr></table>'+
        '</td></tr></table>'+
      '</td></tr>'+
      '<tr><td style="background:#0D1B2E;padding:20px;text-align:center">'+
        '<div style="font-size:12px;color:#8fa1b5;line-height:1.6">Voc&ecirc; recebeu este e-mail porque fez um pedido na VitaFlow.<br>D&uacute;vidas? &Eacute; s&oacute; responder este e-mail. &#128154;</div>'+
        '<div style="font-size:11px;color:#5b6f8c;margin-top:10px">&copy; VitaFlow &mdash; vitaflowoficial.com</div>'+
      '</td></tr>'+
    '</table>'+
  '</div>';

  return { texto: texto, html: _emailDocMobile(html) };   // v66: documento com viewport (celular)
}

async function enviarEmailCompraConcluida(email, nome, orderNsu, linkRecibo) {
  var partsOn = String(orderNsu || '').trim().toUpperCase().split('-');
  var tipoOn = (partsOn.length >= 3) ? partsOn[2].charAt(0) : '';
  if (tipoOn === 'V') return { ok: true, pulou: 'revendedor' };
  email = String(email || '').trim();
  if (!email || email.indexOf('@') < 0) return { ok: false, erro: 'sem e-mail' };
  var corpo = montarEmailCompra(nome, orderNsu, linkRecibo);
  var r = await enviarEmailBrevo(email, 'Pedido confirmado ' + orderNsu + ' - VitaFlow', corpo.texto, corpo.html);
  if (!r.ok) await telegram('⚠️ E-MAIL NAO ENVIADO (paliativo)\n\n📦 Pedido: ' + orderNsu + '\n📧 Para: ' + email + '\n❌ ' + r.erro);
  return r;
}

/* ───────── 1) bruto → linha do espelho (porta fiel do "Novo pedido" do doPost) ───────── */
function montarLinha(data, orderNsu, hdr, agora, cmConfirmado) {
  limparDadosClienteWhats(data);
  var amount = data.paid_amount ? (data.paid_amount / 100).toFixed(2) : '0.00';
  var amountNum = data.paid_amount ? Number((data.paid_amount / 100).toFixed(2)) : 0;
  var method = metodoPagamento(data.capture_method);
  var ehAthena = String(data.capture_method || '').toLowerCase() === 'whatsapp_athena';
  var ehValeIntegral = String(data.capture_method || '').toLowerCase() === 'vale_integral';
  var athenaPago = false;
  if (ehAthena) { athenaPago = true; method = cmConfirmado ? metodoPagamento(cmConfirmado) : 'PIX'; }
  if (ehValeIntegral) method = 'PIX';
  var date = dataBR(agora);
  var nome = data.customer.name || '', email = data.customer.email || '', telefone = data.customer.phone_number || '', cpf = data.customer.document || '';
  var observacao = (data.observacao || (data.customer && data.customer.observacao) || '').toString().trim();
  if (ehValeIntegral) observacao = ['Pago 100% com vale-compras' + ((data.cupom && data.cupom.codigo) ? ' ' + data.cupom.codigo : ''), observacao].filter(Boolean).join(' | ');
  var endereco = '';
  if (data.address) endereco = [data.address.street || '', data.address.number || '', data.address.complement || '', data.address.neighborhood || '', data.address.city || '', data.address.state || '', data.address.cep || ''].filter(Boolean).join(', ');
  var items = data.items ? data.items.map(function (i) { var pu = i.price ? ' (R$ ' + (i.price / 100).toFixed(2).replace('.', ',') + ' un.)' : ''; return i.description + pu + ' x' + i.quantity; }).join(', ') : 'N/A';
  var temCupom = data.cupom && data.cupom.codigo && data.cupom.desconto > 0, fatorOriginal = 1;
  if (temCupom) {
    var tpd = (data.items || []).filter(function (i) { return i.description && i.description.toLowerCase().indexOf('frete') !== 0; }).reduce(function (acc, i) { return acc + (i.price * i.quantity); }, 0);
    if (tpd > 0) fatorOriginal = (tpd + data.cupom.desconto) / tpd;
  }
  var cupomCodigoCol = (data.cupom && data.cupom.codigo) ? data.cupom.codigo : '';
  var valeCent = (data.cupom && data.cupom.vale) ? Number(data.cupom.vale) : 0; if (isNaN(valeCent) || valeCent < 0) valeCent = 0;
  var cupomDescCol = (valeCent > 0) ? (valeCent / 100).toFixed(2) : ((data.cupom && data.cupom.desconto) ? (data.cupom.desconto / 100).toFixed(2) : '');
  var itemsDetalhados = data.items ? data.items.map(function (i) {
    var ehFrete = i.description && i.description.toLowerCase().indexOf('frete') === 0;
    var puo = i.price ? Math.round(i.price * (ehFrete ? 1 : fatorOriginal)) : 0;
    var pu = puo ? 'R$ ' + (puo / 100).toFixed(2).replace('.', ',') : '';
    var pt = (puo && i.quantity) ? 'R$ ' + (puo * i.quantity / 100).toFixed(2).replace('.', ',') : '';
    return pu ? ('  • ' + i.description + ' (x' + i.quantity + ') — ' + pu + ' un. = ' + pt) : ('  • ' + i.description + ' (x' + i.quantity + ')');
  }).join('\n') : 'N/A';
  var cupomInfo = '';
  if (valeCent > 0) cupomInfo = '\n🎟️ Vale-compras ' + ((data.cupom && data.cupom.codigo) || '') + ': -R$ ' + (valeCent / 100).toFixed(2).replace('.', ',') + '\n💰 Total a pagar: R$ ' + amount.replace('.', ',');
  else if (data.cupom && data.cupom.codigo) cupomInfo = '\n🏷️ Cupom ' + data.cupom.codigo + ': -R$ ' + (data.cupom.desconto / 100).toFixed(2).replace('.', ',') + '\n💰 Total com desconto: R$ ' + amount.replace('.', ',');
  var atacManual = ehAtacadoManual(orderNsu, observacao);
  var ehVendaManual = (orderNsu.indexOf('-M') !== -1) || (orderNsu.indexOf('-V') !== -1) || atacManual;
  var nasceConfirmado = athenaPago || ehValeIntegral || ehVendaManual;
  var statusGravar = nasceConfirmado ? 'PEDIDO CONFIRMADO' : 'AGUARDANDO PAGAMENTO';
  var horaConf = nasceConfirmado ? dataHoraBR(agora) : '';
  /* a planilha recebia estes 18 valores, nesta ordem (appendRow); o espelho guarda tudo como texto */
  var base = [orderNsu, nome, email, cpf, items, statusGravar, '', date, endereco, telefone, amountNum, method, cupomCodigoCol, '', cupomDescCol, '', horaConf, observacao];
  var ncols = Math.max(hdr.length, 18), arr = [];
  for (var c = 0; c < ncols; c++) arr.push(c < base.length ? String(base[c] == null ? '' : base[c]) : '');
  var iCad = colIdx(hdr, 'CADEADO'); if (iCad >= 0) arr[iCad] = 'FECHADO';
  var isSP = items.toLowerCase().indexOf('frete — sp') !== -1;
  var corpo = '🛍️ NOVO PEDIDO VITAFLOW!\n\n📦 Pedido: ' + orderNsu + '\n👤 Cliente: ' + nome + '\n📧 E-mail: ' + email + '\n📱 Telefone: ' + telefone + '\n🪪 CPF: ' + cpf + '\n🏠 Endereço: ' + endereco + '\n' +
    (observacao ? '\n━━━━━━━━━━━━━━━━━━━━━\n📝📝  OBSERVAÇÃO DO CLIENTE  📝📝\n➤➤  ' + observacao + '\n━━━━━━━━━━━━━━━━━━━━━\n\n' : '') +
    '💳 Pagamento: ' + method + '\n💰 Valor: R$ ' + amount + '\n📅 Data: ' + date + '\n\n🛒 Produtos:\n' + itemsDetalhados + cupomInfo +
    (isSP ? '\n\n⭐⭐⭐ CLIENTE DE SP — OFERECER MODALIDADE VIP! ⭐⭐⭐' : '') +
    '\n\n🧩 gravado direto no espelho (planilha do Google fora)';
  var linkRecibo = gerarLinkRecibo(orderNsu, nome, cpf, email, method, data.items || [], amount, endereco, telefone);
  return { arr: arr, nome: nome, email: email, cpf: cpf, statusGravar: statusGravar, nasceConfirmado: nasceConfirmado, athenaPago: athenaPago, ehValeIntegral: ehValeIntegral, method: method, corpo: corpo, linkRecibo: linkRecibo };
}

async function processarBrutos(hdr, log) {
  var todos = (await fbGet('/vitaflow_pedidos_brutos')) || {};
  var keys = Object.keys(todos).filter(function (k) { var b = todos[k]; return b && b.payload && b.gravado !== true; }).sort(function (a, b) { return (Number(todos[a].ts) || 0) - (Number(todos[b].ts) || 0); }).slice(0, MAX_POR_RODADA);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i], b = todos[k], data = b.payload, orderNsu = String(b.order_nsu || data.order_nsu || '').trim();
    try {
      if (!orderNsu || !data.customer || !data.customer.name) { log.ignorados.push(k); continue; }
      var chave = histKey(orderNsu);
      if (Number(b.ts) && Date.now() - Number(b.ts) < 90 * 1000) continue;   /* deixa o GAS tentar primeiro (se a planilha voltar) */
      var existente = await fbGet('/vitaflow_pedidos/' + chave);
      if (existente && existente.length) { await fbPatch('/vitaflow_pedidos_brutos/' + k, { gravado: true, gravado_em: Date.now(), via: 'paliativo-ja-existia' }); log.jaExistiam.push(orderNsu); continue; }
      /* Athena: o pagamento chega ANTES dos dados — consome a confirmação guardada (igual ao doPost) */
      var cmConf = null;
      if (String(data.capture_method || '').toLowerCase() === 'whatsapp_athena') {
        var cp = await fbGet('/vitaflow_confirmacoes_pendentes/' + brutoKey(orderNsu));
        if (cp && cp.order_nsu) { cmConf = cp.capture_method || 'pix'; await fbDelete('/vitaflow_confirmacoes_pendentes/' + brutoKey(orderNsu)); }
      }
      var agora = Number(b.ts) || Date.now();
      var L = montarLinha(data, orderNsu, hdr, agora, cmConf);
      await fbPut('/vitaflow_pedidos/' + chave, L.arr);
      var c11 = cpf11(L.cpf), em = String(L.email || '').trim().toLowerCase().replace(/[.#$\[\]\/]/g, '_');
      if (c11) { var p1 = {}; p1[c11 + '/' + chave] = true; await fbPatch('/vitaflow_idx_cpf', p1); }
      if (em) { var p2 = {}; p2[em + '/' + chave] = true; await fbPatch('/vitaflow_idx_email', p2); }
      try { await fbPut('/vitaflow_recibos/' + brutoKey(orderNsu), { link: L.linkRecibo, order_nsu: orderNsu, nome: L.nome, ts: Date.now() }); } catch (eR) {}
      if (L.nasceConfirmado) {
        try { await registrarHistoricoStatus(orderNsu, 'PEDIDO CONFIRMADO'); } catch (eH) {}
        await enviarEmailCompraConcluida(L.email, L.nome, orderNsu, L.linkRecibo);
        if (L.ehValeIntegral) await telegram('🎟️ PEDIDO QUITADO COM VALE-COMPRAS\n\n📦 Pedido: ' + orderNsu + '\n🎫 Vale: ' + ((data.cupom && data.cupom.codigo) || '—') + '\n💰 Total cobrado: R$ 0,00\n✅ Status: CONFIRMADO');
        if (L.athenaPago) await telegram('💰 PAGAMENTO CONFIRMADO (Athena)\n\n📦 Pedido: ' + orderNsu + '\n💳 Forma: ' + L.method + '\n✅ Status: PAGO');
      }
      await telegram(L.corpo);
      await fbPatch('/vitaflow_pedidos_brutos/' + k, { gravado: true, gravado_em: Date.now(), via: 'paliativo' });
      log.gravados.push(orderNsu);
    } catch (e) {
      log.erros.push(orderNsu + ': ' + String(e && e.message || e));
    }
  }
}

/* ───────── 2) confirmações de pagamento guardadas pelo GAS ───────── */
async function processarConfirmacoes(hdr, log) {
  var todos = (await fbGet('/vitaflow_confirmacoes_pendentes')) || {};
  var keys = Object.keys(todos).slice(0, MAX_POR_RODADA);
  var iStatus = colIdx(hdr, 'STATUS'), iMet = colIdx(hdr, 'METODO_PAGAMENTO'), iHora = colIdx(hdr, 'HORA_CONFIRMACAO'), iNome = colIdx(hdr, 'NOME'), iEmail = colIdx(hdr, 'EMAIL');
  if (iStatus < 0) iStatus = 5; if (iMet < 0) iMet = 11; if (iHora < 0) iHora = 16; if (iNome < 0) iNome = 1; if (iEmail < 0) iEmail = 2;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i], c = todos[k], orderNsu = String((c && c.order_nsu) || '').trim();
    try {
      if (!orderNsu) continue;
      if (/^VF-\d{4}-A/i.test(orderNsu)) continue;                       /* Athena: o doPost/paliativo consome quando os dados chegam */
      var chave = histKey(orderNsu), row = await fbGet('/vitaflow_pedidos/' + chave);
      if (!row || !row.length) continue;                                   /* linha ainda não existe: fica para a próxima rodada */
      if (statusPago(row[iStatus])) { await fbDelete('/vitaflow_confirmacoes_pendentes/' + k); log.confDuplicadas.push(orderNsu); continue; }
      while (row.length < Math.max(hdr.length, 18)) row.push('');
      row[iStatus] = 'PEDIDO CONFIRMADO'; row[iMet] = metodoPagamento(c.capture_method); row[iHora] = dataHoraBR(Date.now());
      await fbPut('/vitaflow_pedidos/' + chave, row);
      try { await registrarHistoricoStatus(orderNsu, 'PEDIDO CONFIRMADO'); } catch (eH) {}
      var rec = null; try { rec = await fbGet('/vitaflow_recibos/' + brutoKey(orderNsu)); } catch (eRc) {}
      await enviarEmailCompraConcluida(String(row[iEmail] || ''), String(row[iNome] || ''), orderNsu, (rec && rec.link) || '');
      await fbDelete('/vitaflow_confirmacoes_pendentes/' + k);
      await telegram('💰 PAGAMENTO CONFIRMADO (site)\n\n📦 Pedido: ' + orderNsu + '\n💳 Forma: ' + metodoPagamento(c.capture_method) + '\n✅ Status: PEDIDO CONFIRMADO\n\n🧩 confirmado direto no espelho (planilha do Google fora)');
      log.confirmados.push(orderNsu);
    } catch (e) { log.erros.push('conf ' + orderNsu + ': ' + String(e && e.message || e)); }
  }
}

async function rodar() {
  if (!FB_SECRET) return { ok: false, erro: 'sem FIREBASE_SECRET' };
  var log = { ts: Date.now(), gravados: [], jaExistiam: [], ignorados: [], confirmados: [], confDuplicadas: [], erros: [] };
  var hdr = (await fbGet('/vitaflow_pedidos_hdr')) || [];
  if (!hdr.length) hdr = ['PEDIDO', 'NOME', 'EMAIL', 'CPF', 'PRODUTOS', 'STATUS', '', 'DATA', 'ENDERECO', 'TELEFONE', 'VALOR', 'METODO_PAGAMENTO', 'CUPOM', 'STATUS_TRANSPORTADORA', 'DESCONTO', '', 'HORA_CONFIRMACAO', 'OBSERVACAO'];
  await processarBrutos(hdr, log);
  await processarConfirmacoes(hdr, log);
  if (log.gravados.length || log.confirmados.length || log.erros.length) {
    try { await fbPut('/vitaflow_sync/pedidos_paliativo_log/' + String(log.ts), log); } catch (eL) {}
  }
  if (log.erros.length) await telegram('⚠️ PALIATIVO DOS PEDIDOS: ' + log.erros.length + ' erro(s)\n' + log.erros.slice(0, 4).join('\n'));
  return { ok: true, log: log };
}

exports.handler = async function () {
  try {
    var r = await rodar();
    console.log('[pedidos-paliativo] ' + JSON.stringify(r).slice(0, 1500));
    return { statusCode: 200, body: JSON.stringify(r) };
  } catch (e) {
    console.error('[pedidos-paliativo] erro: ' + (e && e.message || e));
    await telegram('⚠️ PALIATIVO DOS PEDIDOS: deu erro — ' + String(e && e.message || e).slice(0, 200));
    return { statusCode: 500, body: JSON.stringify({ ok: false, erro: String(e && e.message || e) }) };
  }
};
exports._t = { montarLinha: montarLinha, rodar: rodar, gerarLinkRecibo: gerarLinkRecibo, metodoPagamento: metodoPagamento };
