// /api/yahoo — single data proxy for all Yahoo Finance ops.
// Zero dependencies. Ops: chart | quote | summary | timeseries | search | news
// Crumbed ops (quote/summary/timeseries) do the fc.yahoo.com cookie + getcrumb
// handshake once per warm lambda and refresh once on 401/403.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

let jar = { cookie: null, crumb: null, at: 0 };

const SYM_RE = /^[A-Za-z0-9.^=\-]{1,15}$/;
const INTRADAY = new Set(["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"]);
const INTERVALS = new Set([...INTRADAY, "1d", "5d", "1wk", "1mo", "3mo"]);
const RANGES = new Set(["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"]);

const SUMMARY_MODULES =
  "assetProfile,price,summaryDetail,financialData,defaultKeyStatistics,earningsTrend,calendarEvents";

const TS_TYPES = [
  "annualTotalRevenue",
  "annualGrossProfit",
  "annualOperatingIncome",
  "annualNetIncomeCommonStockholders",
  "annualReconciledDepreciation",
  "annualOperatingCashFlow",
  "annualCapitalExpenditure",
  "annualFreeCashFlow",
  "annualStockholdersEquity",
  "annualTotalDebt",
  "annualCashAndCashEquivalents",
  "annualDilutedAverageShares",
  "annualBasicAverageShares",
].join(",");

// ---------- helpers ----------

function fetchT(url, opts = {}, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...opts, signal: ctl.signal }).finally(() => clearTimeout(t));
}

function yahooHeaders(withCookie) {
  const h = {
    "User-Agent": UA,
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (withCookie && jar.cookie) h.Cookie = jar.cookie;
  return h;
}

async function ensureCrumb(force = false) {
  if (!force && jar.crumb) return;
  const r = await fetchT("https://fc.yahoo.com/", {
    headers: { "User-Agent": UA, Accept: "*/*" },
    redirect: "manual",
  });
  // Any status is fine here — we only want the cookies.
  const setC =
    typeof r.headers.getSetCookie === "function"
      ? r.headers.getSetCookie()
      : (r.headers.get("set-cookie") ? [r.headers.get("set-cookie")] : []);
  const cookie = setC
    .map((c) => c.split(";")[0].trim())
    .filter((c) => /^(A1|A3|A1S|GUC)=/i.test(c))
    .join("; ");
  const cr = await fetchT("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Accept: "text/plain", ...(cookie ? { Cookie: cookie } : {}) },
  });
  const text = (await cr.text()).trim();
  if (!cr.ok || !text || text.includes("<") || text.length > 24) {
    throw new YErr("crumb_failed", 502);
  }
  jar = { cookie, crumb: text, at: Date.now() };
}

class YErr extends Error {
  constructor(code, status, retryAfter) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function yfetch(url, { crumbed = false } = {}) {
  const doFetch = () =>
    fetchT(crumbed ? `${url}${url.includes("?") ? "&" : "?"}crumb=${encodeURIComponent(jar.crumb || "")}` : url, {
      headers: yahooHeaders(crumbed),
    });
  if (crumbed) await ensureCrumb();
  let r = await doFetch();
  if (crumbed && (r.status === 401 || r.status === 403)) {
    await ensureCrumb(true);
    r = await doFetch();
  }
  if (r.status === 429) throw new YErr("rate_limited", 503, r.headers.get("retry-after") || "60");
  if (r.status === 401 || r.status === 403) throw new YErr("yahoo_denied", 502);
  if (!r.ok) throw new YErr("upstream_down", 502);
  return r;
}

function json(body, status = 200, cacheHeaders = {}) {
  const h = { "Content-Type": "application/json; charset=utf-8" };
  if (status === 200) {
    Object.assign(h, cacheHeaders, { "Netlify-Vary": "query" });
  } else {
    h["Cache-Control"] = "no-store";
  }
  return new Response(JSON.stringify(body), { status, headers: h });
}

const cdn = (sMaxage, swr, browserMaxAge) => ({
  "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${sMaxage}, stale-while-revalidate=${swr}`,
  "Cache-Control": `public, max-age=${browserMaxAge}`,
});

function originDenied(req) {
  const ref = req.headers.get("origin") || req.headers.get("referer");
  if (!ref) return false;
  try {
    const h = new URL(ref).hostname;
    const self = new URL(req.url).hostname;
    return !(h === self || h === "localhost" || h === "127.0.0.1");
  } catch {
    return true;
  }
}

function validSymbol(s) {
  return typeof s === "string" && SYM_RE.test(s);
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx).catch(() => null);
    }
  });
  await Promise.all(workers);
  return out;
}

const ok = (op, src, data, extra = {}) => ({ ok: true, op, src, ts: Date.now(), ...extra, data });

// ---------- ops ----------

async function opChart(p) {
  const symbol = p.get("symbol");
  if (!validSymbol(symbol)) throw new YErr("bad_symbol", 400);
  const interval = p.get("interval") || "1d";
  if (!INTERVALS.has(interval)) throw new YErr("bad_interval", 400);
  const u = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  u.searchParams.set("interval", interval);
  const p1 = p.get("period1");
  const p2 = p.get("period2");
  if (p1 && p2 && /^\d{1,12}$/.test(p1) && /^\d{1,12}$/.test(p2)) {
    u.searchParams.set("period1", p1);
    u.searchParams.set("period2", p2);
  } else {
    const range = p.get("range") || "6mo";
    if (!RANGES.has(range)) throw new YErr("bad_range", 400);
    u.searchParams.set("range", range);
  }
  u.searchParams.set("includePrePost", "false");
  u.searchParams.set("events", "div,split");
  const r = await yfetch(u.toString());
  const body = await r.json();
  const result = body?.chart?.result?.[0];
  if (!result) throw new YErr(body?.chart?.error?.code === "Not Found" ? "not_found" : "empty_result", 502);
  const cache = INTRADAY.has(interval) ? cdn(60, 120, 30) : cdn(3600, 21600, 600);
  return json(ok("chart", "v8", result), 200, cache);
}

async function opQuote(p) {
  const raw = (p.get("symbols") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!raw.length || raw.length > 60 || !raw.every(validSymbol)) throw new YErr("bad_symbols", 400);
  try {
    const u = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
    u.searchParams.set("symbols", raw.join(","));
    const r = await yfetch(u.toString(), { crumbed: true });
    const body = await r.json();
    const rows = body?.quoteResponse?.result;
    if (!Array.isArray(rows)) throw new YErr("empty_result", 502);
    return json(ok("quote", "v7", rows), 200, cdn(30, 90, 15));
  } catch (e) {
    if (e.code !== "yahoo_denied" && e.code !== "crumb_failed") throw e;
    if (raw.length > 20) throw e;
    // Degraded fallback: keyless v8 chart meta per symbol.
    const rows = (
      await pool(raw, 5, async (sym) => {
        const r = await yfetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`
        );
        const meta = (await r.json())?.chart?.result?.[0]?.meta;
        if (!meta) return null;
        return {
          symbol: meta.symbol || sym,
          regularMarketPrice: meta.regularMarketPrice,
          regularMarketPreviousClose: meta.chartPreviousClose ?? meta.previousClose,
          currency: meta.currency,
          fullExchangeName: meta.exchangeName,
          regularMarketTime: meta.regularMarketTime,
        };
      })
    ).filter(Boolean);
    if (!rows.length) throw new YErr("yahoo_denied", 502);
    return json(ok("quote", "v8meta", rows, { degraded: true }), 200, cdn(30, 90, 15));
  }
}

async function opSummary(p) {
  const symbol = p.get("symbol");
  if (!validSymbol(symbol)) throw new YErr("bad_symbol", 400);
  const u = new URL(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`);
  u.searchParams.set("modules", SUMMARY_MODULES);
  const r = await yfetch(u.toString(), { crumbed: true });
  const body = await r.json();
  const result = body?.quoteSummary?.result?.[0];
  if (!result) throw new YErr("empty_result", 502);
  return json(ok("summary", "v10", result), 200, cdn(43200, 86400, 3600));
}

async function opTimeseries(p) {
  const symbol = p.get("symbol");
  if (!validSymbol(symbol)) throw new YErr("bad_symbol", 400);
  const now = Math.floor(Date.now() / 1000);
  const from = now - Math.floor(5.5 * 365.25 * 86400);
  const u = new URL(
    `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`
  );
  u.searchParams.set("symbol", symbol);
  u.searchParams.set("type", TS_TYPES);
  u.searchParams.set("period1", String(from));
  u.searchParams.set("period2", String(now));
  u.searchParams.set("merge", "false");
  u.searchParams.set("padTimeSeries", "true");
  const r = await yfetch(u.toString(), { crumbed: true });
  const body = await r.json();
  const result = body?.timeseries?.result;
  if (!Array.isArray(result)) throw new YErr("empty_result", 502);
  return json(ok("timeseries", "ts", result), 200, cdn(43200, 86400, 3600));
}

async function opSearch(p) {
  const q = (p.get("q") || "").slice(0, 40).replace(/[\x00-\x1f<>]/g, "");
  if (!q) throw new YErr("bad_query", 400);
  const u = new URL("https://query1.finance.yahoo.com/v1/finance/search");
  u.searchParams.set("q", q);
  u.searchParams.set("quotesCount", "8");
  u.searchParams.set("newsCount", "0");
  u.searchParams.set("listsCount", "0");
  const r = await yfetch(u.toString());
  const body = await r.json();
  return json(ok("search", "v1", body?.quotes || []), 200, cdn(3600, 21600, 600));
}

function rssField(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
}

async function opNews(p) {
  const symbol = p.get("symbol");
  if (!validSymbol(symbol)) throw new YErr("bad_symbol", 400);
  const u = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  const r = await yfetch(u);
  const xml = await r.text();
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < 20) {
    const b = m[1];
    const title = rssField(b, "title");
    const link = rssField(b, "link");
    const pubDate = rssField(b, "pubDate");
    if (title && link) items.push({ title, link, pubDate });
  }
  return json(ok("news", "rss", items), 200, cdn(900, 3600, 300));
}

// ---------- handler ----------

const OPS = {
  chart: opChart,
  quote: opQuote,
  summary: opSummary,
  timeseries: opTimeseries,
  search: opSearch,
  news: opNews,
};

export default async (req) => {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (originDenied(req)) return json({ ok: false, error: "forbidden" }, 403);
  const p = new URL(req.url).searchParams;
  const op = p.get("op") || "";
  const fn = OPS[op];
  if (!fn) return json({ ok: false, error: "bad_op", ops: Object.keys(OPS) }, 400);
  try {
    return await fn(p);
  } catch (e) {
    if (e instanceof YErr) {
      const body = { ok: false, op, error: e.code };
      if (e.retryAfter) body.retryAfter = e.retryAfter;
      return json(body, e.status >= 400 && e.status < 600 ? e.status : 502);
    }
    const timeout = e?.name === "AbortError" || /abort/i.test(String(e?.message));
    return json({ ok: false, op, error: timeout ? "upstream_timeout" : "upstream_down" }, timeout ? 504 : 502);
  }
};

export const config = { path: "/api/yahoo" };
