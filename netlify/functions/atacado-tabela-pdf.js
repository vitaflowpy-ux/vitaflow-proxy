// netlify/functions/atacado-tabela-pdf.js
// Lê a tabela do fornecedor em PDF e extrai nome, preço USD e STATUS pela COR de fundo da linha.
// Processa no servidor (igual sites de conversão PDF->XLS): lê texto+posição e os retângulos coloridos,
// cruzando pela posição Y. Cores: verde=disponível, amarelo=promoção, vermelho=esgotado.

const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function classificarRGB(r, g, b) {
  // r,g,b em 0-255
  if (r > 235 && g > 235 && b > 235) return null;          // branco
  if (r > 150 && g < 130 && b < 130) return 'esgotado';     // vermelho
  if (r > 180 && g > 180 && b < 130) return 'promocao';     // amarelo
  if (g > 120 && g > b && (g >= r || r < 210)) return 'disponivel'; // verde
  return null;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    var body = JSON.parse(event.body || '{}');
    var b64 = body.file_base64 || '';
    if (!b64) return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'Sem arquivo', produtos: [] }) };

    var data = new Uint8Array(Buffer.from(b64, 'base64'));
    var pdf = await pdfjs.getDocument({ data: data, disableFontFace: true, useSystemFonts: false }).promise;
    var OPS = pdfjs.OPS;

    var produtos = [];

    for (var pn = 1; pn <= pdf.numPages; pn++) {
      var page = await pdf.getPage(pn);

      // 1) retângulos coloridos (y aproximado + cor)
      var ops = await page.getOperatorList();
      var fill = [0, 0, 0];
      var rects = []; // {y, status}
      for (var i = 0; i < ops.fnArray.length; i++) {
        var fn = ops.fnArray[i], args = ops.argsArray[i];
        if (fn === OPS.setFillRGBColor) {
          // pdfjs entrega 0-255 aqui
          fill = [args[0], args[1], args[2]];
        } else if (fn === OPS.constructPath) {
          var coords = args[1];
          if (coords && coords.length >= 2) {
            // o 1º par (x,y) é a posição do retângulo; o resto costuma ser largura/altura
            var yPos = Math.round(coords[1]);
            var status = classificarRGB(fill[0], fill[1], fill[2]);
            if (status) rects.push({ y: yPos, status: status });
          }
        } else if (fn === OPS.rectangle) {
          var status2 = classificarRGB(fill[0], fill[1], fill[2]);
          if (status2) rects.push({ y: Math.round(args[1]), status: status2 });
        }
      }

      // 2) texto agrupado por linha (y)
      var txt = await page.getTextContent();
      var linhas = {}; // yArred -> [{x, s}]
      txt.items.forEach(function (it) {
        if (!it.str || !it.str.trim()) return;
        var y = Math.round(it.transform[5]);
        // agrupa por faixa de 3px
        var key = Math.round(y / 3) * 3;
        if (!linhas[key]) linhas[key] = [];
        linhas[key].push({ x: it.transform[4], s: it.str });
      });

      // 3) monta produtos por linha, cruzando cor pelo y mais próximo
      Object.keys(linhas).forEach(function (yk) {
        var partes = linhas[yk].sort(function (a, b) { return a.x - b.x; });
        var textoLinha = partes.map(function (p) { return p.s; }).join(' ').replace(/\s+/g, ' ').trim();
        // nome = trecho não-numérico inicial; usd = último número $ da linha
        var precoM = textoLinha.match(/\$?\s*(\d+[.,]?\d*)\s*$/);
        var usd = precoM ? parseFloat(precoM[1].replace(',', '.')) : null;
        var nome = textoLinha.replace(/\$?\s*\d+[.,]?\d*\s*$/, '').trim();
        if (!nome || nome.length < 3 || usd === null || usd <= 0) return;
        var nomeUp = nome.toUpperCase();
        if (/LEGENDA|DISPON[IÍ]VEL|EM FALTA|PROMO[CÇ][AÃ]O|^NOMBRE$|^NOME$|^USD$/.test(nomeUp)) return;

        // acha o retângulo com y mais próximo
        var yNum = parseInt(yk);
        var status = 'disponivel';
        var melhor = null, melhorDist = 999;
        rects.forEach(function (r) {
          var d = Math.abs(r.y - yNum);
          if (d < melhorDist && d <= 12) { melhorDist = d; melhor = r; }
        });
        if (melhor) status = melhor.status;

        produtos.push({ nome: nome, usd: usd, status: status, disp: status !== 'esgotado' });
      });
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ produtos: produtos, total: produtos.length }) };
  } catch (e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ error: e.message, produtos: [] }) };
  }
};
