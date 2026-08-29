// netlify/functions/atacado-publicar-drive.js
// ── Publica o catálogo de atacado no Google Drive (substitui o MESMO arquivo → o link não muda) ──
// Recebe o PDF (base64) da página de publicação e faz files.update no Drive via conta de serviço.
// Mantém o fileId (1olhYj0...), então a Athena (TABELA_ATACADO_URL) e qualquer link já espalhado
// continuam válidos — só o conteúdo muda.
//
// Sem dependências npm: monta o JWT da conta de serviço com o `crypto` nativo, troca por um
// access_token no OAuth do Google e faz um PATCH de mídia no endpoint de upload do Drive.
//
// ── Variáveis de ambiente (no Netlify) ──
//   GDRIVE_SA_EMAIL   = e-mail da conta de serviço (ex.: publicador@seu-projeto.iam.gserviceaccount.com)
//   GDRIVE_SA_KEY     = a private_key da conta de serviço (o campo "private_key" do JSON, com os \n)
//   GDRIVE_FILE_ID    = id do arquivo do Drive a substituir (padrão: o da tabela de atacado)
//   PUBLICAR_SECRET   = senha compartilhada; a página manda no header p/ ninguém publicar sem permissão

const DEFAULT_FILE_ID = '1olhYj0OW1cL0Wk0kk6-fct89EJff_1Ip';

function b64url(buf){
  return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

// Reconstrói uma private_key PEM válida NÃO importa como o Netlify guardou as quebras de linha
// (o erro 1E08010C:DECODER acontece quando os \n viram espaço/somem). Estratégia à prova de falha:
// tira aspas, converte \n literais, e RECONSTRÓI o corpo base64 em linhas de 64 chars com o
// cabeçalho/rodapé corretos. Assim, desde que os caracteres base64 estejam intactos, funciona.
function normalizarPem(key){
  var k = String(key || '').replace(/\\r/g,'').replace(/\\n/g,'\n').trim();
  k = k.replace(/^["']+/, '').replace(/["']+$/, '').trim(); // remove aspas acidentais
  var mB = k.match(/-----BEGIN [^-]+-----/);
  var mE = k.match(/-----END [^-]+-----/);
  var header, footer, meio;
  if (mB && mE) {
    header = mB[0]; footer = mE[0];
    meio = k.substring(k.indexOf(header) + header.length, k.indexOf(footer));
  } else {
    // SEM as linhas BEGIN/END (colaram só o miolo base64): assume PKCS#8 (chave de conta de
    // serviço Google) e envolve o valor inteiro com a armadura correta.
    header = '-----BEGIN PRIVATE KEY-----';
    footer = '-----END PRIVATE KEY-----';
    meio = k;
  }
  var corpo = meio.replace(/[^A-Za-z0-9+/=]/g, ''); // só o base64, tira TODA quebra/espaço
  var linhas = corpo.match(/.{1,64}/g) || [corpo];
  return header + '\n' + linhas.join('\n') + '\n' + footer + '\n';
}

// Monta e assina o JWT da conta de serviço (RS256) e troca por um access_token do Google.
async function pegarAccessToken(saEmail, saKey){
  const crypto = require('crypto');
  const agora = Math.floor(Date.now()/1000);
  const header = { alg:'RS256', typ:'JWT' };
  const claims = {
    iss: saEmail,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600
  };
  const base = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claims));
  // Reconstrói a PEM de forma robusta (resolve o erro 1E08010C:DECODER por quebra de linha perdida).
  const pem = normalizarPem(saKey);
  const assinatura = crypto.createSign('RSA-SHA256').update(base).sign(pem);
  const jwt = base + '.' + b64url(assinatura);

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(jwt)
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) {
    console.log('[PUBLICAR] token Google FALHOU:', r.status, JSON.stringify(d).slice(0,300));
    throw new Error('token Google falhou: ' + r.status + ' ' + JSON.stringify(d).slice(0,200));
  }
  console.log('[PUBLICAR] token Google OK');
  return d.access_token;
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type, x-publicar-secret', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error:'use POST' }) };

  try {
    const SECRET = process.env.PUBLICAR_SECRET || '';
    const enviado = (event.headers['x-publicar-secret'] || event.headers['X-Publicar-Secret'] || '');
    if (!SECRET || enviado !== SECRET) {
      console.log('[PUBLICAR] 401 secret: envSet=' + (!!SECRET) + ' recebido=' + (enviado ? 'sim' : 'nao'));
      return { statusCode: 401, headers, body: JSON.stringify({ error:'não autorizado' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const pdfB64 = String(body.pdf_base64 || '');
    if (!pdfB64) return { statusCode: 400, headers, body: JSON.stringify({ error:'faltou pdf_base64' }) };

    const saEmail = process.env.GDRIVE_SA_EMAIL;
    const saKey   = process.env.GDRIVE_SA_KEY;
    const fileId  = process.env.GDRIVE_FILE_ID || DEFAULT_FILE_ID;
    if (!saEmail || !saKey) { console.log('[PUBLICAR] faltam envs SA'); return { statusCode: 500, headers, body: JSON.stringify({ error:'faltam GDRIVE_SA_EMAIL/GDRIVE_SA_KEY no Netlify' }) }; }
    // diagnóstico do formato da chave (sem vazar a chave): a private_key TEM que ter as marcas PEM
    console.log('[PUBLICAR] saEmail set=' + (!!saEmail) + ' | keyLen=' + saKey.length + ' | temBEGIN=' + /BEGIN PRIVATE KEY/.test(saKey) + ' | temQuebraLiteral=' + /\\n/.test(saKey) + ' | temQuebraReal=' + /\n/.test(saKey) + ' | fileId=' + fileId);

    const token = await pegarAccessToken(saEmail, saKey);

    // Substitui o CONTEÚDO do arquivo (uploadType=media) — mantém o mesmo id e link.
    const bytes = Buffer.from(pdfB64, 'base64');
    const up = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media&supportsAllDrives=true', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/pdf' },
      body: bytes
    });
    const upTxt = await up.text();
    if (!up.ok) {
      console.log('[PUBLICAR] Drive update FALHOU:', up.status, upTxt.slice(0,400));
      return { statusCode: 502, headers, body: JSON.stringify({ error:'Drive update falhou', status:up.status, detalhe: upTxt.slice(0,300) }) };
    }

    console.log('[PUBLICAR] OK — Drive atualizado, bytes=' + bytes.length + ' fileId=' + fileId);
    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, fileId, bytes: bytes.length, link:'https://drive.google.com/file/d/'+fileId+'/view' }) };
  } catch (e) {
    console.log('[PUBLICAR] EXCEÇÃO:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
