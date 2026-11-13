// Gera o PDF a partir de docs/manual.html. Uso: node pdf.mjs <pasta-do-projeto> <saida.pdf>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const [PROJ, SAIDA] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const p = await b.newPage();
await p.goto(pathToFileURL(path.join(PROJ, 'docs', 'manual.html')).href, { waitUntil: 'networkidle0' });
const faltando = await p.evaluate(() =>
  [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')),
);
if (faltando.length) console.log('IMAGENS FALTANDO:', faltando.join(', '));
await p.pdf({
  path: SAIDA,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate:
    '<div style="width:100%;font-size:8px;color:#66746b;padding:0 15mm;display:flex;justify-content:space-between;font-family:Segoe UI,sans-serif">' +
    '<span>Irrigação do Viveiro — Manual e Documentação Técnica v1.0</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
});
await b.close();
console.log('PDF gerado:', SAIDA);
