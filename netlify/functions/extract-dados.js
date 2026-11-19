'use strict';
/* =============================================================================
   extract-dados.js — IA DO REGISTRAR VENDA (VitaFlow)  ·  v2  ·  19/11/2026
   Tira os dados de uma conversa de venda (nome, CPF, endereço, produtos, frete, total, pagamento) e devolve um JSON.
   v2 (19/11/2026 — Thiago: "ok, sem teto, pode fazer"; desenho revisto pelo GPT-6): a função respondia SEM LOGIN. Agora exige login
     (admin do Firebase ou painel único — ver login()); sem login = 401; login sem permissão = 403. Conversa limitada a 40.000
     caracteres; freio de chamadas por usuário; registro só com metadados. O pedido à IA e a resposta NÃO mudaram.
   Quem chama: Orçamento v22m+ (💾 Registrar venda › ✨ Extrair), na página sozinha e dentro do painel único (v47+).
   CHAMADA: POST { tokenAdmin | (tokenPainel + apikey), mensagem }
   RESPOSTA: o JSON da venda, ou { error: "…" }.
   Variável de ambiente: ANTHROPIC_API_KEY (a mesma de antes).
   ============================================================================= */
var crypto = require('crypto');
var FB_BASE = 'https://pricehub-f0236-default-rtdb.firebaseio.com';
var VFDB = 'https://api.vitaflowoficial.com';

/* ---- LOGIN (igual à função estoque v4) ----
   · página sozinha (Compras / Orçamento): tokenAdmin = idToken do Firebase Auth, conferido lendo admins/<uid> com o próprio token;
   · painel único: tokenPainel + apikey, conferidos no banco (/auth/v1/user); o "sim" vale 10 min;
   · rodando no SERVIDOR (executor funcoes_srv, que só existe lá): o executor já conferiu o login do painel e manda o e-mail no
     cabeçalho x-vf-painel-email. Esse cabeçalho só vale quando a variável FN_DIR existe (só o executor do servidor a cria) — no
     Netlify ele é ignorado.
   Devolve { quem } ou { status: 401 | 403 }. */
var _painelVistos = {};
async function conferirAdmin(token) {
  token = String(token || '');
  var partes = token.split('.');
  if (partes.length !== 3) return { status: 401 };
  var uid = '';
  try { var pl = JSON.parse(Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); uid = pl.user_id || pl.sub || ''; } catch (e) { return { status: 401 }; }
  if (!uid || !/^[A-Za-z0-9]+$/.test(uid)) return { status: 401 };
  try {
    var r = await fetch(FB_BASE + '/admins/' + uid + '.json?auth=' + encodeURIComponent(token));
    if (!r.ok) return { status: 401 };
    return (await r.json()) === true ? { quem: 'admin:' + uid } : { status: 403 };
  } catch (e) { return { status: 401 }; }
}
async function conferirPainel(token, apikey) {
  token = String(token || ''); apikey = String(apikey || '');
  if (token.split('.').length !== 3 || apikey.split('.').length !== 3) return { status: 401 };
  var pl;
  try { pl = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return { status: 401 }; }
  if (!pl.sub) return { status: 401 };
  if (String(pl.role || '') !== 'authenticated') return { status: 403 };
  var exp = Number(pl.exp || 0) * 1000;
  if (exp && exp <= Date.now()) return { status: 401 };
  var k = crypto.createHash('sha256').update(token).digest('hex');
  var c = _painelVistos[k];
  if (c && c.ate > Date.now()) return { quem: 'painel:' + c.email };
  try {
    var ctrl = new AbortController(); var t = setTimeout(function () { ctrl.abort(); }, 8000);
    var r = await fetch(VFDB + '/auth/v1/user', { headers: { apikey: apikey, Authorization: 'Bearer ' + token }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return { status: 401 };
    var u = await r.json();
    var email = String(u && u.email || '').toLowerCase();
    if (!email) return { status: 401 };
    _painelVistos[k] = { email: email, ate: Math.min(Date.now() + 10 * 60 * 1000, exp || (Date.now() + 10 * 60 * 1000)) };
    return { quem: 'painel:' + email };
  } catch (e) { return { status: 401 }; }
}
async function login(event, d) {
  var hs = event.headers || {};
  var noServidor = String(hs['x-vf-painel-email'] || '').toLowerCase();
  if (process.env.FN_DIR && noServidor) return { quem: 'painel:' + noServidor };
  if (d && d.tokenPainel) return await conferirPainel(d.tokenPainel, d.apikey);
  if (d && d.tokenAdmin) return await conferirAdmin(d.tokenAdmin);
  return { status: 401 };
}
/* ---- freio simples por usuário (por instância da função): no máximo LIMITE_MIN chamadas por minuto ---- */
var _uso = {};
function passouDoLimite(quem) {
  var agora = Date.now(), l = (_uso[quem] || []).filter(function (t) { return agora - t < 60000; });
  if (l.length >= LIMITE_MIN) { _uso[quem] = l; return true; }
  l.push(agora); _uso[quem] = l;
  return false;
}
var MAX_MENSAGEM = 40000, LIMITE_MIN = 30;
exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'use POST' }) };
  const ini = Date.now();
  let d = {};
  try { d = JSON.parse(event.body || '{}') || {}; } catch (e) { d = {}; }
  const L = await login(event, d);
  if (!L.quem) {
    return { statusCode: L.status === 403 ? 403 : 401, headers,
      body: JSON.stringify({ error: L.status === 403 ? 'seu login não tem permissão para usar a IA' : 'faça login de novo (atualize a página com F5)' }) };
  }
  if (passouDoLimite(L.quem)) return { statusCode: 429, headers, body: JSON.stringify({ error: 'muitas chamadas em 1 minuto — espere um pouco' }) };
  try {
    const mensagem = typeof d.mensagem === 'string' ? d.mensagem : '';
    if (!mensagem) throw new Error('mensagem vazia');
    if (mensagem.length > MAX_MENSAGEM) throw new Error('conversa grande demais (cole só a parte da venda)');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Extraia os dados desta conversa de venda e retorne APENAS um JSON válido, sem explicação, sem markdown:
{
  "nome": "",
  "cpf": "",
  "telefone": "",
  "email": "",
  "endereco": "",
  "cep": "",
  "cidade": "",
  "estado": "",
  "produtos": [{"nome":"","quantidade":1,"preco_unit":0.00}],
  "frete_descricao": "",
  "frete_valor": 0.00,
  "total": 0.00,
  "pagamento": ""
}
Regras:
- CPF: formato 000.000.000-00
- Telefone: formato (DD) 9XXXX-XXXX
- CEP: formato 00000-000
- Estado: sigla maiúscula (SP, RJ, etc.)
- produtos: lista com nome, quantidade e preço unitário em reais (número)
- frete_valor: número em reais
- total: número em reais
- pagamento: "PIX" ou "Cartão"
- Campos não encontrados: string vazia ou 0
Conversa:
${mensagem}`
        }]
      })
    });
    const data = await res.json();
    // se a API retornar erro (modelo inválido, cota, etc.), expõe a causa real
    if (data.error) {
      throw new Error('API Anthropic: ' + (data.error.message || JSON.stringify(data.error)));
    }
    console.log('extract-dados', L.quem, res.status, (Date.now() - ini) + 'ms');
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
