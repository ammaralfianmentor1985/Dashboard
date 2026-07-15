// Batch quote fetching (50 symbols/call, respects the /api/yahoo op=quote cap
// of 60) + preset filters/sorts. These presets are heuristics built only from
// what a single batch v7 quote returns — no per-symbol fundamentals fetch at
// screener scale (that's what the Invest tab's full Buffett scorecard is for;
// it needs quoteSummary + timeseries per symbol, too slow to run over 500 names).
import { quote as fetchQuote } from "../data/yahoo.js";

export async function batchQuotes(symbols, chunkSize = 50) {
  const chunks = [];
  for (let i = 0; i < symbols.length; i += chunkSize) chunks.push(symbols.slice(i, i + chunkSize));
  // Fire all chunks concurrently — sequential round-trips would blow the
  // cold-scan latency budget on a 500-symbol universe (11 chunks).
  const settled = await Promise.all(
    chunks.map((chunk) => fetchQuote(chunk).then((r) => r.data || []).catch(() => []))
  );
  return settled.flat();
}

export async function binanceTickers(symbols) {
  const r = await fetch("https://api.binance.com/api/v3/ticker/24hr");
  const all = await r.json();
  const set = new Set(symbols);
  return all.filter((t) => set.has(t.symbol)).map((t) => ({
    symbol: t.symbol,
    regularMarketPrice: +t.lastPrice,
    regularMarketChangePercent: +t.priceChangePercent,
    regularMarketVolume: +t.volume,
    quoteVolume: +t.quoteVolume,
  }));
}

export const PRESETS = {
  buffett_quality: {
    label: "Buffett Quality (heuristic)",
    filter: (r) => r.trailingPE > 0 && r.trailingPE < 30 && r.priceToBook > 0 && r.priceToBook < 12 && (r.dividendYield ?? 0) >= 0,
    sort: (a, b) => (a.trailingPE || 999) - (b.trailingPE || 999),
  },
  value: {
    label: "Value (low P/E & P/B)",
    filter: (r) => r.trailingPE > 0 && r.priceToBook > 0,
    sort: (a, b) => (a.trailingPE * (a.priceToBook || 1)) - (b.trailingPE * (b.priceToBook || 1)),
  },
  oversold_quality: {
    label: "Oversold Quality (near 52w low)",
    filter: (r) => r.fiftyTwoWeekLowChangePercent != null && r.fiftyTwoWeekLowChangePercent < 0.15 && r.trailingPE > 0,
    sort: (a, b) => a.fiftyTwoWeekLowChangePercent - b.fiftyTwoWeekLowChangePercent,
  },
  momentum_52w_high: {
    label: "52w-High Momentum",
    filter: (r) => r.fiftyTwoWeekHighChangePercent != null && r.fiftyTwoWeekHighChangePercent > -0.05,
    sort: (a, b) => (b.fiftyTwoWeekHighChangePercent ?? -1) - (a.fiftyTwoWeekHighChangePercent ?? -1),
  },
  dividend: {
    label: "Dividend",
    filter: (r) => (r.dividendYield || 0) > 0,
    sort: (a, b) => (b.dividendYield || 0) - (a.dividendYield || 0),
  },
  crypto_movers: {
    label: "Crypto Movers",
    filter: () => true,
    sort: (a, b) => Math.abs(b.regularMarketChangePercent || 0) - Math.abs(a.regularMarketChangePercent || 0),
  },
};

export function applyPreset(rows, presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return rows;
  return rows.filter(preset.filter).sort(preset.sort);
}
