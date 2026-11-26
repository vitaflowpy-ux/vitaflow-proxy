// Teste da numero-pedido v6 (Netlify) — repasse ao servidor só com VF_NUMERO_REPASSE=sim; plano B = v4 — e do adaptador gerar-numero.
// Tudo de mentira (Firebase, servidor e Apps Script). Uso: node testes/teste_numero_pedido_v6_repasse.js
'use strict';
const path = require('path');
const ARQ = path.join(__dirname, '..', 'netlify', 'functions', 'numero-pedido.js'), ADP = path.join(__dirname, '..', 'netlify', 'functions', 'gerar-numero.js');
let p = 0, n = 0; const ok = (c, nome, extra) => { n++; if (c) p++; else console.log('FALHA: ' + nome + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : '')); };
const R = (status, corpo, cab) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => (cab || {})[String(k).toLowerCase()] || null }, text: async () => (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)), json: async () => (typeof corpo === 'string' ? JSON.parse(corpo) : corpo) });
function mundo(env, servidor) {       // servidor(corpo) → resposta de mentira | throw
  const M = { fb: {}, etag: 0, srv: [], fbCalls: 0 };
  for (const k of ['VF_NUMERO_REPASSE', 'VF_NUMERO_SERVIDOR_URL', 'VFDB_SERVICE_KEY', 'VFDB_URL', 'TELEGRAM_TOKEN']) delete process.env[k];
  process.env.FIREBASE_SECRET = 'segredo-de-teste'; Object.assign(process.env, env || {});
  global.fetch = async (url, opts) => {
    url = String(url); opts = opts || {};
    if (/painel\.vitaflowoficial\.com|servidor\.teste/.test(url)) { M.srv.push({ url, corpo: JSON.parse(opts.body) }); return servidor ? servidor(JSON.parse(opts.body), M) : Promise.reject(new Error('fora do ar')); }
    if (/firebaseio\.com/.test(url)) {
      M.fbCalls++; const cam = url.split('.com/')[1].split('.json')[0];
      if ((opts.method || 'GET') === 'GET') return R(200, JSON.stringify(cam in M.fb ? M.fb[cam] : null), { etag: 'e' + M.etag });
      if (opts.headers && opts.headers['if-match'] && opts.headers['if-match'] !== 'e' + M.etag) return R(412, 'x');
      M.fb[cam] = JSON.parse(opts.body); M.etag++; return R(200, opts.body);
    }
    throw new Error('chamada inesperada: ' + url);
  };
  delete require.cache[require.resolve(ARQ)]; M.h = require(ARQ).handler;
  M.post = async (corpo) => JSON.parse((await M.h({ httpMethod: 'POST', body: JSON.stringify(corpo) })).body);
  return M;
}
(async () => {
  const hoje = (() => { const f = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).formatToParts(new Date()); return f.find(x => x.type === 'day').value + f.find(x => x.type === 'month').value; })();
  let M, r;
  // 1. SEM a variável: igual à v4 (nenhuma chamada ao servidor, nenhum campo novo no número)
  M = mundo(); r = await M.post({ tipo: 'M' });
  ok(r.success === true && r.order_nsu === 'VF-' + hoje + '-M051' && r.fonte === 'firebase' && r.via === undefined && M.srv.length === 0, 'sem a variável: igual à v4 (M051 pelo Firebase, servidor não é chamado)', r);
  r = await M.post({ action: 'ping' }); ok(r.success === true && r.repasse === false, 'ping diz repasse:false', r);
  M = mundo({ VF_NUMERO_REPASSE: 'nao' }, () => R(200, { success: true, order_nsu: 'VF-' + hoje + '-S999' })); r = await M.post({ tipo: 'S' });
  ok(r.order_nsu === 'VF-' + hoje + '-S001' && M.srv.length === 0, 'variável com outro valor: desligado', r);
  // 2. ligado e o servidor respondeu: devolve a resposta dele, não toca no Firebase
  M = mundo({ VF_NUMERO_REPASSE: 'sim' }, (c) => R(200, { success: true, order_nsu: 'VF-' + hoje + '-S014', seq: 14, fonte: 'banco', modo: 'sinc' })); r = await M.post({ action: 'gerar_numero', tipo: 'S' });
  ok(r.success === true && r.order_nsu === 'VF-' + hoje + '-S014' && r.seq === 14 && r.via === 'servidor' && M.fbCalls === 0, 'ligado: número do servidor, via:servidor, Firebase intocado', r);
  ok(M.srv.length === 1 && M.srv[0].corpo.tipo === 'S' && Object.keys(M.srv[0].corpo).length === 1 && /^https:\/\/painel\.vitaflowoficial\.com\/api\/pub\/proxy\/numero-pedido$/.test(M.srv[0].url), 'ao servidor vai só o tipo, no endereço público dele', M.srv[0]);
  r = await M.post({ action: 'ping' }); ok(r.repasse === true && M.srv.length === 1, 'ping diz repasse:true e não chama o servidor', r);
  // 3. ligado e o servidor falhou de todo jeito → plano B = v4, marcado via:netlify
  for (const [nome, f] of [['fora do ar', null], ['HTTP 429 (limite)', () => R(429, { ok: false })], ['HTTP 503', () => R(503, 'x')], ['resposta que não é JSON', () => R(200, '<html>erro</html>')],
    ['success:false', () => R(200, { success: false, erro: 'firebase get 500' })], ['número torto', () => R(200, { success: true, order_nsu: 'erro interno' })], ['lista em vez de objeto', () => R(200, [1])]]) {
    M = mundo({ VF_NUMERO_REPASSE: 'sim' }, f); r = await M.post({ tipo: 'A' });
    ok(r.success === true && r.order_nsu === 'VF-' + hoje + '-A001' && r.via === 'netlify' && M.srv.length === 1, 'servidor ' + nome + ' → faz aqui como a v4 (A001), via:netlify, 1 tentativa só no servidor', r);
  }
  // 4. o servidor pegou o número e a resposta se perdeu: o plano B pega o SEGUINTE (pula, não repete)
  M = mundo({ VF_NUMERO_REPASSE: 'sim' }, (c, m) => { m.fb['vitaflow_seq/' + hoje + '/site'] = 7; m.etag++; return Promise.reject(new Error('aborted')); }); r = await M.post({ tipo: 'S' });
  ok(r.order_nsu === 'VF-' + hoje + '-S008', 'resposta do servidor perdida depois de ele pegar o S007 → aqui sai o S008 (pulado, nunca repetido)', r);
  // 5. reservar: respostas de negócio do servidor passam; erro genérico cai no plano B
  M = mundo({ VF_NUMERO_REPASSE: 'sim' }, () => R(200, { success: false, existe: true, numero: 'VF-' + hoje + '-M060', msg: 'Esse número já está na planilha.' })); r = await M.post({ action: 'reservar', numero: 'VF-' + hoje + '-M060' });
  ok(r.success === false && r.existe === true && r.via === 'servidor' && M.fbCalls === 0 && M.srv[0].corpo.action === 'reservar' && M.srv[0].corpo.numero === 'VF-' + hoje + '-M060', 'reservar: "já existe" do servidor é resposta de verdade (não refaz aqui)', r);
  M = mundo({ VF_NUMERO_REPASSE: 'sim' }, () => R(200, { success: true, numero: 'VF-' + hoje + '-M060', existe: false, contador_avancado: true })); r = await M.post({ action: 'reservar', numero: 'VF-' + hoje + '-M060' });
  ok(r.success === true && r.via === 'servidor' && M.fbCalls === 0, 'reservar: reservado pelo servidor', r);
  M = mundo({ VF_NUMERO_REPASSE: 'sim' }, () => R(200, { success: false, erro: 'salto', msg: 'pula muito' })); r = await M.post({ action: 'reservar', numero: 'VF-' + hoje + '-M999' });
  ok(r.erro === 'salto' && r.via === 'servidor', 'reservar: "salto" do servidor passa', r);
  M = mundo({ VF_NUMERO_REPASSE: 'sim' }, () => R(200, { success: false, erro: 'firebase get 500' })); r = await M.post({ action: 'reservar', numero: 'VF-' + hoje + '-M060' });
  ok(r.success === true && r.contador_avancado === true && r.via === 'netlify' && M.fb['vitaflow_seq/' + hoje + '/manual'] === 60, 'reservar: erro genérico do servidor → reserva aqui como a v4', r);
  // 6. conferir nunca vai ao servidor
  M = mundo({ VF_NUMERO_REPASSE: 'sim' }, () => R(200, { success: true })); r = await M.post({ action: 'conferir', numero: 'VF-' + hoje + '-M051' });
  ok(r.success === true && r.existe === false && M.srv.length === 0, 'conferir continua aqui (só leitura)', r);

  // 7. adaptador gerar-numero: só passa número de verdade
  const adp = async (resposta) => { global.fetch = async () => resposta; delete require.cache[require.resolve(ADP)]; const o = await require(ADP).handler({ httpMethod: 'POST', body: '{"tipo":"S"}' }, {}); return { status: o.statusCode, corpo: JSON.parse(o.body) }; };
  r = await adp(R(200, { success: true, order_nsu: 'VF-2611-S015' })); ok(r.status === 200 && r.corpo.order_nsu === 'VF-2611-S015' && r.corpo.success === true, 'adaptador: número válido em JSON passa igual', r);
  r = await adp(R(200, 'VF-2611-S016')); ok(r.status === 200 && r.corpo.order_nsu === 'VF-2611-S016', 'adaptador: formato antigo (só o texto do número) continua passando', r);
  r = await adp(R(200, '<!DOCTYPE html><html><body>Erro do Apps Script</body></html>')); ok(r.status === 502 && r.corpo.order_nsu === undefined && !!r.corpo.error, 'adaptador: página de erro NÃO vira número (era o defeito) → 502', r);
  r = await adp(R(200, { error: 'Exception: Service invoked too many times' })); ok(r.status === 502 && r.corpo.order_nsu === undefined, 'adaptador: JSON de erro → 502', r);
  r = await adp(R(404, 'VF-2611-S017')); ok(r.status === 502, 'adaptador: HTTP de erro do Apps Script → 502', r);
  console.log(p + '/' + n + ' testes passaram'); process.exit(p === n ? 0 : 1);
})();
