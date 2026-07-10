import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fetchMarketData } from './fetch-market-data.mjs';
import { renderBriefingHtml } from './briefing-template.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const BRIEFINGS_DIR = path.join(ROOT, 'briefings');
const TZ = 'Asia/Jakarta'; // briefing "day" is defined in WIB, not UTC

// Usage:
//   node scripts/generate-briefing.mjs --narrative narrative.json [--market overrides.json] [--date YYYY-MM-DD]
//
// Narrative source (one of):
//   --narrative <file>   pre-written narrative JSON — used by the scheduled Claude
//                        routine (see ROUTINE.md), no API key needed
//   ANTHROPIC_API_KEY    optional fallback: research the narrative via the
//                        Anthropic API + web search (costs API credits)
//
// --market <file>  merges verified values over the free-feed results for any
//                  quotes that came back null (same shapes as fetch-market-data.mjs output).
// --date           override the briefing date (defaults to today in Asia/Jakarta).

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--narrative') args.narrative = argv[++i];
    else if (a === '--market') args.market = argv[++i];
    else if (a === '--date') args.date = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function jakartaIsoDate(d) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function labelDate(d, locale) {
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function fullDate(d, locale) {
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function mergeMarket(fetched, override) {
  const out = { ...fetched };
  for (const [group, values] of Object.entries(override)) {
    if (values && typeof values === 'object' && !Array.isArray(values)) {
      out[group] = { ...(fetched?.[group] || {}) };
      for (const [k, v] of Object.entries(values)) {
        if (v != null) out[group][k] = v;
      }
    } else if (values != null) {
      out[group] = values;
    }
  }
  return out;
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
  const args = parseArgs(process.argv);

  await mkdir(BRIEFINGS_DIR, { recursive: true });

  const iso = args.date || jakartaIsoDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Invalid --date "${iso}", expected YYYY-MM-DD`);
  const day = new Date(iso + 'T00:00:00Z');
  const dateLabelByLang = {
    id: fullDate(day, 'id-ID'),
    en: fullDate(day, 'en-US'),
    my: fullDate(day, 'ms-MY'),
  };

  console.log('Fetching live market data...');
  let market = await fetchMarketData();
  if (args.market) {
    console.log('Applying verified market overrides from', args.market);
    market = mergeMarket(market, JSON.parse(await readFile(args.market, 'utf8')));
  }

  let narrative;
  if (args.narrative) {
    console.log('Using pre-written narrative from', args.narrative);
    narrative = JSON.parse(await readFile(args.narrative, 'utf8'));
  } else if (process.env.ANTHROPIC_API_KEY) {
    console.log('Researching narrative content via Anthropic API + web search...');
    const { fetchNarrative } = await import('./fetch-narrative.mjs');
    narrative = await fetchNarrative({ apiKey: process.env.ANTHROPIC_API_KEY, dateLabel: dateLabelByLang.en });
  } else {
    throw new Error(
      'No narrative source: pass --narrative <file.json> (how the scheduled Claude routine supplies it — see ROUTINE.md), ' +
      'or set ANTHROPIC_API_KEY to research it via the Anthropic API (optional paid fallback).'
    );
  }

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
