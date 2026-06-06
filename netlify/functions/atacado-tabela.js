// netlify/functions/atacado-tabela.js
// Lê a tabela XLSX do fornecedor de atacado e extrai nome, preço USD e STATUS pela COR da célula.
// Cores do fornecedor: verde (CCFFCC)=disponível, amarelo (FFFF00)=promoção, vermelho (FF5050)=esgotado.
// O XLSX é um ZIP de XMLs; lemos styles.xml (fills) + sheet + sharedStrings, igual o openpyxl faz por baixo.

const JSZip = require('jszip');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// classifica uma cor hex (ARGB ou RGB) em status
function classificarCor(hex) {
  if (!hex) return null;
  hex = String(hex).toUpperCase();
  if (hex.length === 8) hex = hex.slice(2); // ARGB -> RGB (tira os 2 dígitos de alpha)
  if (hex.length !== 6) return null;
  var r = parseInt(hex.slice(0, 2), 16);
  var g = parseInt(hex.slice(2, 4), 16);
  var b = parseInt(hex.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  if (r > 235 && g > 235 && b > 235) return null;          // branco / sem cor
  if (r > 150 && g < 130 && b < 130) return 'esgotado';     // vermelho (FF0000, FF5050)
  if (r > 180 && g > 180 && b < 130) return 'promocao';     // amarelo (FFFF00)
  if (g > 120 && g > b && (g >= r || r < 210)) return 'disponivel'; // verde (00B050, 008000, CCFFCC)
  return null;
}

function col(letters) {
  var n = 0;
  for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    var body = JSON.parse(event.body || '{}');
    var b64 = body.file_base64 || '';
    if (!b64) return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'Sem arquivo', produtos: [] }) };

    var buf = Buffer.from(b64, 'base64');
    var zip = await JSZip.loadAsync(buf);

    // 1) sharedStrings
    var sharedStrings = [];
    var ssFile = zip.file('xl/sharedStrings.xml');
    if (ssFile) {
      var ssXml = await ssFile.async('string');
      var matches = ssXml.match(/<si>[\s\S]*?<\/si>/g) || [];
      sharedStrings = matches.map(function (si) {
        var texts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
        return texts.map(function (t) { return t.replace(/<[^>]+>/g, ''); }).join('')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      });
    }

    // 2) styles.xml → fills e cellXfs (mapa xf index → cor)
    var fills = []; // index → hex
    var cellXfs = []; // index → fillId
    var stFile = zip.file('xl/styles.xml');
    if (stFile) {
      var stXml = await stFile.async('string');
      // fills
      var fillsBlock = (stXml.match(/<fills[\s\S]*?<\/fills>/) || [''])[0];
      var fillEls = fillsBlock.match(/<fill>[\s\S]*?<\/fill>/g) || [];
      fillEls.forEach(function (f) {
        var fg = f.match(/<fgColor[^>]*rgb="([0-9A-Fa-f]{6,8})"/);
        fills.push(fg ? fg[1] : null);
      });
      // cellXfs
      var xfsBlock = (stXml.match(/<cellXfs[\s\S]*?<\/cellXfs>/) || [''])[0];
      var xfEls = xfsBlock.match(/<xf[^>]*\/?>/g) || [];
      xfEls.forEach(function (xf) {
        var fid = xf.match(/fillId="(\d+)"/);
        cellXfs.push(fid ? parseInt(fid[1]) : 0);
      });
    }

    // 3) primeira planilha
    var sheetFile = zip.file('xl/worksheets/sheet1.xml') ||
      zip.file(Object.keys(zip.files).filter(function (n) { return /xl\/worksheets\/sheet\d+\.xml$/.test(n); })[0]);
    if (!sheetFile) return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'Planilha não encontrada', produtos: [] }) };
    var shXml = await sheetFile.async('string');

    var rows = shXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
    var produtos = [];

    rows.forEach(function (rowXml) {
      var cells = rowXml.match(/<c[^>]*>[\s\S]*?<\/c>|<c[^>]*\/>/g) || [];
      var rowData = {}; // colIndex → {value, status}
      cells.forEach(function (cXml) {
        var ref = (cXml.match(/r="([A-Z]+)\d+"/) || [])[1];
        if (!ref) return;
        var ci = col(ref);
        var sIdx = (cXml.match(/s="(\d+)"/) || [])[1];
        var tType = (cXml.match(/t="([^"]+)"/) || [])[1];
        var val = '';
        if (tType === 'inlineStr') {
          var isM = cXml.match(/<t[^>]*>([\s\S]*?)<\/t>/);
          val = isM ? isM[1].replace(/<[^>]+>/g, '') : '';
        } else {
          var vMatch = cXml.match(/<v>([\s\S]*?)<\/v>/);
          val = vMatch ? vMatch[1] : '';
          if (tType === 's') val = sharedStrings[parseInt(val)] || '';
        }
        val = String(val).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
        // cor da célula
        var status = null;
        if (sIdx != null) {
          var fillId = cellXfs[parseInt(sIdx)];
          var hex = (fillId != null) ? fills[fillId] : null;
          status = classificarCor(hex);
        }
        rowData[ci] = { value: val, status: status };
      });

      // monta produto: nome = 1ª célula com texto (coluna do nome);
      // usd + STATUS = vêm da PRIMEIRA célula numérica (coluna do preço, onde está a cor).
      var nome = '', nomeCol = -1, usd = null, status = null;
      var ordCols = Object.keys(rowData).map(Number).sort(function (a, b) { return a - b; });
      // acha o nome (1ª célula texto)
      ordCols.forEach(function (ci) {
        if (nomeCol !== -1) return;
        var v = String(rowData[ci].value);
        var soNum = /^[\d.,\s$rR]*$/.test(v.trim());
        if (v.trim() && !soNum) { nome = v.trim(); nomeCol = ci; }
      });
      // acha o preço — primeira célula numérica DEPOIS do nome
      ordCols.forEach(function (ci) {
        if (usd !== null || ci <= nomeCol) return;
        var raw = String(rowData[ci].value).replace(/[^\d.,]/g, '').replace(',', '.');
        var num = parseFloat(raw);
        if (!isNaN(num) && num > 0) usd = num;
      });
      // STATUS híbrido: procura a cor em QUALQUER célula da linha
      // (formato antigo = cor no nome; formato novo = cor no preço)
      ordCols.forEach(function (ci) {
        if (status) return;
        if (rowData[ci].status) status = rowData[ci].status;
      });

      // ignora linha da legenda / cabeçalho (nome contém estas palavras)
      var nomeUp = nome.toUpperCase();
      var ehLegenda = /LEGENDA|DISPON[IÍ]VEL|EM FALTA|PROMO[CÇ][AÃ]O|^NOMBRE$|^NOME$/.test(nomeUp);

      if (nome && nome.length > 2 && usd !== null && !ehLegenda) {
        produtos.push({ nome: nome, usd: usd, status: status || 'disponivel', disp: status !== 'esgotado' });
      }
    });

    return { statusCode: 200, headers: cors, body: JSON.stringify({ produtos: produtos, total: produtos.length }) };
  } catch (e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ error: e.message, produtos: [] }) };
  }
};
