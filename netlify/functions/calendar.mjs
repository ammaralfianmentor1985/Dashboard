// /api/calendar — economic calendar proxy (ForexFactory weekly JSON, best-effort).
// Zero dependencies. Client converts times to WIB and caches a fallback copy.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

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

export default async (req) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  if (originDenied(req)) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctl.signal,
    }).finally(() => clearTimeout(t));
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const raw = await r.json();
    const events = (Array.isArray(raw) ? raw : [])
      .map((e) => ({
        title: String(e.title || ""),
        country: String(e.country || ""),
        dateUtc: e.date || null, // ISO string with offset
        impact: String(e.impact || "").toLowerCase(), // high | medium | low | holiday
        forecast: e.forecast ?? "",
        previous: e.previous ?? "",
      }))
      .filter((e) => e.title && e.dateUtc);
    return new Response(JSON.stringify({ ok: true, ts: Date.now(), data: events }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Netlify-CDN-Cache-Control": "public, durable, s-maxage=3600, stale-while-revalidate=21600",
        "Cache-Control": "public, max-age=900",
      },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, degraded: true, error: "calendar_unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
};

export const config = { path: "/api/calendar" };
