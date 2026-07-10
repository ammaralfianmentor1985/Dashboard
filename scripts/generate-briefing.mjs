import { writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fetchMarketData } from './fetch-market-data.mjs';
import { fetchNarrative } from './fetch-narrative.mjs';
import { renderBriefingHtml } from './briefing-template.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const BRIEFINGS_DIR = path.join(ROOT, 'briefings');

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function labelDate(d, locale) {
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fullDate(d, locale) {
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

async function renderPdf(htmlPath, pdfPath) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
  } finally {
    await browser.close();
  }
}

async function regenerateBriefingsIndex() {
  const files = await readdir(BRIEFINGS_DIR);
  const byIso = new Map();
  const isoRe = /(\d{4}-\d{2}-\d{2})/;
  for (const f of files) {
    const m = f.match(isoRe);
    if (!m) continue; // skip legacy files with non-ISO names; left untouched on disk
    const iso = m[1];
    const ext = path.extname(f).slice(1).toLowerCase();
    if (!['html', 'pdf', 'png'].includes(ext)) continue;
    if (!byIso.has(iso)) byIso.set(iso, {});
    byIso.get(iso)[ext] = `/briefings/${f}`;
  }
  const entries = [...byIso.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([iso, formats]) => {
      const d = new Date(iso + 'T00:00:00Z');
      return {
        iso,
        label: labelDate(d, 'en-GB'),
        full: fullDate(d, 'en-GB'),
        type: formats.pdf ? 'pdf' : 'html',
        formats,
      };
    });

  const now = new Date().toISOString();
  const body = `// Auto-generated ${now.slice(0, 16).replace('T', ' ')} — ${entries.length} briefing(s)\n` +
    `window.MARKET_BRIEFINGS_BUILT = "${now}";\n` +
    `window.MARKET_BRIEFINGS = ${JSON.stringify(entries, null, 2)};\n`;

  await writeFile(path.join(ROOT, 'briefings-data.js'), body, 'utf8');
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required to research live narrative content');

  await mkdir(BRIEFINGS_DIR, { recursive: true });

  const now = new Date();
  const iso = isoDate(now);
  const dateLabelByLang = {
    id: fullDate(now, 'id-ID'),
    en: fullDate(now, 'en-US'),
    my: fullDate(now, 'ms-MY'),
  };

  console.log('Fetching live market data...');
  const market = await fetchMarketData();

  console.log('Researching narrative content via Claude + web search...');
  const narrative = await fetchNarrative({ apiKey, dateLabel: dateLabelByLang.en });

  const html = renderBriefingHtml({ dateIso: iso, dateLabelByLang, market, narrative });

  const htmlPath = path.join(BRIEFINGS_DIR, `market-update-${iso}.html`);
  const pdfPath = path.join(BRIEFINGS_DIR, `market-update-${iso}.pdf`);

  await writeFile(htmlPath, html, 'utf8');
  console.log('Wrote', htmlPath);

  console.log('Rendering PDF...');
  await renderPdf(htmlPath, pdfPath);
  console.log('Wrote', pdfPath);

  console.log('Regenerating briefings-data.js...');
  await regenerateBriefingsIndex();

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
