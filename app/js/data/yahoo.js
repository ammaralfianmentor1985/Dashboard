// Client wrapper over the /api/yahoo Netlify Function.
const cache = new Map(); // key -> {t, data}
const TTL = { chart: 60_000, quote: 30_000, summary: 3_600_000, search: 3_600_000, timeseries: 3_600_000, news: 900_000 };

async function call(op, params) {
  const qs = new URLSearchParams({ op, ...params }).toString();
  const key = qs;
  const hit = cache.get(key);
  const ttl = TTL[op] ?? 60_000;
  if (hit && Date.now() - hit.t < ttl) return hit.data;
  const r = await fetch(`/api/yahoo?${qs}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || `yahoo ${op} failed`);
  cache.set(key, { t: Date.now(), data: j });
  return j;
}

export const chart = (symbol, range = "6mo", interval = "1d") => call("chart", { symbol, range, interval });
export const quote = (symbolOrList) =>
  call("quote", { symbols: Array.isArray(symbolOrList) ? symbolOrList.join(",") : symbolOrList });
export const summary = (symbol) => call("summary", { symbol });
export const timeseries = (symbol) => call("timeseries", { symbol });
export const search = (q) => call("search", { q });
export const news = (symbol) => call("news", { symbol });
