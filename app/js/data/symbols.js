import { search as yahooSearch } from "./yahoo.js";

// Small bundled quick-picks so search feels instant before any network call resolves.
export const QUICK = [
  { symbol: "AAPL", name: "Apple Inc.", type: "EQUITY" },
  { symbol: "MSFT", name: "Microsoft Corp.", type: "EQUITY" },
  { symbol: "NVDA", name: "NVIDIA Corp.", type: "EQUITY" },
  { symbol: "GOOG", name: "Alphabet Inc.", type: "EQUITY" },
  { symbol: "AMZN", name: "Amazon.com Inc.", type: "EQUITY" },
  { symbol: "BBCA.JK", name: "Bank Central Asia", type: "EQUITY" },
  { symbol: "BBRI.JK", name: "Bank Rakyat Indonesia", type: "EQUITY" },
  { symbol: "TLKM.JK", name: "Telkom Indonesia", type: "EQUITY" },
  { symbol: "BTC-USD", name: "Bitcoin", type: "CRYPTO" },
  { symbol: "ETH-USD", name: "Ethereum", type: "CRYPTO" },
  { symbol: "GC=F", name: "Gold Futures", type: "FUTURE" },
  { symbol: "CL=F", name: "Crude Oil Futures", type: "FUTURE" },
  { symbol: "^GSPC", name: "S&P 500", type: "INDEX" },
  { symbol: "^JKSE", name: "IHSG (Jakarta Composite)", type: "INDEX" },
  { symbol: "EURUSD=X", name: "EUR/USD", type: "FX" },
  { symbol: "IDR=X", name: "USD/IDR", type: "FX" },
];

export function quickMatch(q) {
  const s = q.trim().toUpperCase();
  if (!s) return QUICK.slice(0, 8);
  return QUICK.filter((x) => x.symbol.toUpperCase().includes(s) || x.name.toUpperCase().includes(s)).slice(0, 8);
}

export async function liveSearch(q) {
  if (!q.trim()) return [];
  try {
    const r = await yahooSearch(q.trim());
    return (r.data || [])
      .filter((x) => x.symbol)
      .map((x) => ({ symbol: x.symbol, name: x.shortname || x.longname || x.symbol, type: x.quoteType }));
  } catch {
    return [];
  }
}
