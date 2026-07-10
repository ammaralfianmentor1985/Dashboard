// Live market data — no invented numbers. Every field carries its source + fetch timestamp.
// Free, no-API-key endpoints only, so this can run unattended in GitHub Actions.

async function getJson(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return res.json();
}

async function getText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return res.text();
}

// Stooq CSV quote: symbol,date,time,open,high,low,close,volume
async function stooqQuote(symbol) {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`;
  const csv = await getText(url);
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return null;
  const [sym, date, time, open, high, low, close, volume] = lines[1].split(',');
  const c = parseFloat(close);
  const o = parseFloat(open);
  if (!isFinite(c) || c <= 0) return null;
  const changePct = isFinite(o) && o > 0 ? ((c - o) / o) * 100 : null;
  return { symbol: sym, date, time, close: c, open: o, changePct, source: 'stooq.com', url };
}

async function frankfurterRate(base, quote) {
  const url = `https://api.frankfurter.app/latest?from=${base}&to=${quote}`;
  const j = await getJson(url);
  const rate = j.rates?.[quote];
  if (!rate) return null;
  return { pair: `${base}/${quote}`, rate, date: j.date, source: 'Frankfurter (ECB rates)', url };
}

async function coingeckoPrice(ids) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`;
  const j = await getJson(url);
  const out = {};
  for (const id of ids) {
    if (j[id]) {
      out[id] = {
        usd: j[id].usd,
        change24h: j[id].usd_24h_change,
        source: 'CoinGecko',
        url: 'https://www.coingecko.com/',
      };
    }
  }
  return out;
}

export async function fetchMarketData() {
  const fetchedAt = new Date().toISOString();

  const [sp500, dji, nasdaq, gold, brent, silver, ihsg, klci, crypto, eurusd, gbpusd, usdidr, usdmyr] =
    await Promise.all([
      stooqQuote('^spx').catch(() => null),
      stooqQuote('^dji').catch(() => null),
      stooqQuote('^ndq').catch(() => null),
      stooqQuote('xauusd').catch(() => null),
      stooqQuote('cb.f').catch(() => null), // Brent crude continuous
      stooqQuote('xagusd').catch(() => null),
      stooqQuote('^jkse').catch(() => null), // IHSG (Jakarta Composite)
      stooqQuote('^klse').catch(() => null), // FBM KLCI (Malaysia)
      coingeckoPrice(['bitcoin', 'ethereum']).catch(() => ({})),
      frankfurterRate('EUR', 'USD').catch(() => null),
      frankfurterRate('GBP', 'USD').catch(() => null),
      frankfurterRate('USD', 'IDR').catch(() => null),
      frankfurterRate('USD', 'MYR').catch(() => null),
    ]);

  return {
    fetchedAt,
    equities: { sp500, dji, nasdaq },
    commodities: { gold, brent, silver },
    regional: { ihsg, klci },
    crypto,
    forex: { eurusd, gbpusd, usdidr, usdmyr },
  };
}
