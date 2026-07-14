import { summary as fetchSummary, timeseries as fetchTimeseries, quote as fetchQuote, news as fetchNews } from "../data/yahoo.js";
import { parseSummary, parseTimeseries, ownerEarnings, isFinancialSector } from "../invest/fundamentals.js";
import { buffettScorecard, financialSectorAssessment } from "../invest/score.js";
import { twoStageDCF } from "../invest/dcf.js";
import { batchQuotes, applyPreset, PRESETS } from "../screen/screener.js";
import { t } from "../i18n.js";
import { fmtPrice, fmtPct, fmtCompact } from "../util.js";

const WATCHLIST_KEY = "mm.watchlist.local";

function verdictFor(score, currentPrice, fairValue) {
  if (score == null) return { verdict: "NO_CALL", reason: "insufficient scorecard coverage" };
  if (fairValue == null) {
    if (score >= 70) return { verdict: "WATCH", reason: `quality score ${score}/100 but no DCF fair value to size the price against` };
    return { verdict: "NO_CALL", reason: "no DCF fair value available" };
  }
  const ratio = currentPrice / fairValue;
  if (score >= 65 && ratio <= 0.85) return { verdict: "BUY_ZONE", reason: `score ${score}/100, price ${(ratio * 100).toFixed(0)}% of fair value (≥30%-ish margin of safety)` };
  if (score >= 50 && ratio <= 1.1) return { verdict: "WATCH", reason: `score ${score}/100, price ${(ratio * 100).toFixed(0)}% of fair value — close but not cheap enough` };
  if (score < 35 || ratio > 1.5) return { verdict: "AVOID", reason: `score ${score}/100, price ${(ratio * 100).toFixed(0)}% of fair value` };
  return { verdict: "NO_CALL", reason: `score ${score}/100, price ${(ratio * 100).toFixed(0)}% of fair value — no strong edge either way` };
}

async function loadInvestData(symbol) {
  const [summaryRes, tsRes] = await Promise.all([
    fetchSummary(symbol),
    fetchTimeseries(symbol).catch(() => ({ data: [] })),
  ]);
  const summary = parseSummary(summaryRes.data);
  const { years } = parseTimeseries(tsRes.data);
  return { summary, years };
}

async function analyzeCore(symbol, growthOverride) {
  const { summary, years } = await loadInvestData(symbol);
  const financial = isFinancialSector(summary);
  const sc = buffettScorecard(summary, years);
  let fairValue = null, buyBelow = null;
  if (!financial) {
    const oe = ownerEarnings(years.at(-1));
    if (oe != null && summary.sharesOutstanding) {
      const r = twoStageDCF({
        fcf0: oe, sharesOutstanding: summary.sharesOutstanding,
        growth1: growthOverride ?? (summary.earningsGrowth ?? 0.08),
        years1: 5, terminalGrowth: 0.025, discountRate: 0.09,
      });
      fairValue = r.fairValuePerShare;
      buyBelow = r.buyBelow;
    }
  }
  const v = financial
    ? { verdict: financialSectorAssessment(summary).verdict.includes("cheap") ? "BUY_ZONE" : financialSectorAssessment(summary).verdict.includes("expensive") ? "AVOID" : "WATCH", reason: financialSectorAssessment(summary).verdict }
    : verdictFor(sc.score, summary.currentPrice, fairValue);
  return { summary, sc, fairValue, buyBelow, financial, verdict: v };
}

export async function respond(intent, lang = "en") {
  switch (intent.intent) {
    case "help":
      return t("help", lang);

    case "unknown":
      return `${lang === "id" ? "Tidak paham perintah itu." : "Didn't understand that."} ${t("help", lang)}`;

    case "brief": {
      try {
        const r = await fetch("/app/data/brief.json", { cache: "no-store" });
        const b = await r.json();
        return `${b.headline}\n${b.oneThing || ""}`;
      } catch {
        return lang === "id" ? "Brief belum tersedia." : "Brief not available yet.";
      }
    }

    case "lesson_question":
    case "learn":
      return `Learn module (topic: ${intent.topic || "overview"}) lands in M8 — not wired yet.`;

    case "news": {
      if (!intent.symbol) return t("not_found", lang);
      try {
        const r = await fetchNews(intent.symbol);
        const items = (r.data || []).slice(0, 5);
        if (!items.length) return `${intent.symbol}: ${lang === "id" ? "tidak ada berita." : "no news found."}`;
        return `${intent.symbol} news:\n` + items.map((i) => `• ${i.title}`).join("\n");
      } catch {
        return t("not_found", lang);
      }
    }

    case "watch": {
      if (!intent.symbol) return t("not_found", lang);
      try {
        const list = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]");
        if (!list.includes(intent.symbol)) list.push(intent.symbol);
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
        return `${intent.symbol} ${lang === "id" ? "ditambahkan ke watchlist" : "added to watchlist"} (${list.length} total).`;
      } catch {
        return lang === "id" ? "Gagal menyimpan watchlist." : "Failed to save watchlist.";
      }
    }

    case "size": {
      const accountSize = parseFloat(localStorage.getItem("mm.settings.accountSize") || "10000");
      const risk = intent.riskPct / 100;
      const dollarRisk = accountSize * risk;
      return lang === "id"
        ? `Modal ${fmtCompact(accountSize)} × risiko ${intent.riskPct}% = risiko per trade ${fmtCompact(dollarRisk)}. Ukuran posisi = risiko ÷ jarak stop-loss (per unit).`
        : `Account ${fmtCompact(accountSize)} × ${intent.riskPct}% risk = ${fmtCompact(dollarRisk)} risk per trade. Position size = risk ÷ your stop-loss distance (per unit).`;
    }

    case "compare": {
      const [a, b] = intent.symbols;
      if (!a || !b) return t("not_found", lang);
      const [ra, rb] = await Promise.all([analyzeCore(a, null).catch(() => null), analyzeCore(b, null).catch(() => null)]);
      if (!ra || !rb) return t("not_found", lang);
      return [
        `${a} vs ${b}`,
        `${a}: score ${ra.sc.score ?? "n/a"}/100, price ${fmtPrice(ra.summary.currentPrice)}, verdict ${ra.verdict.verdict}`,
        `${b}: score ${rb.sc.score ?? "n/a"}/100, price ${fmtPrice(rb.summary.currentPrice)}, verdict ${rb.verdict.verdict}`,
      ].join("\n");
    }

    case "dcf": {
      if (!intent.symbol) return t("not_found", lang);
      try {
        const r = await analyzeCore(intent.symbol, intent.growth);
        if (r.financial) return `${intent.symbol} is a financial-sector name — DCF doesn't apply well. ${financialSectorAssessment(r.summary).verdict}`;
        if (r.fairValue == null) return `${intent.symbol}: ${t("no_call", lang)} (missing owner earnings or shares outstanding).`;
        return `${intent.symbol} DCF fair value: ${fmtPrice(r.fairValue)} · buy below (30% MoS): ${fmtPrice(r.buyBelow)} · current ${fmtPrice(r.summary.currentPrice)}.`;
      } catch {
        return t("not_found", lang);
      }
    }

    case "flow":
      if (!intent.symbol) return t("not_found", lang);
      return `Open the Flow tab for ${intent.symbol} for live order-flow detail (crypto = tick data, others = delayed VSA).`;

    case "screen": {
      const key = Object.keys(PRESETS).find((k) => PRESETS[k].label.toLowerCase().includes(intent.preset.toLowerCase())) || "buffett_quality";
      try {
        const r = await fetch("/app/data/universe/sp500.json");
        const universe = await r.json();
        const rows = await batchQuotes(universe.symbols.slice(0, 100));
        const top = applyPreset(rows, key).slice(0, 5);
        return `${PRESETS[key].label} (top 5 of S&P100 sample):\n` + top.map((x) => `• ${x.symbol} ${fmtPrice(x.regularMarketPrice)} ${fmtPct(x.regularMarketChangePercent)}`).join("\n");
      } catch {
        return t("not_found", lang);
      }
    }

    case "verdict":
    case "analyze": {
      if (!intent.symbol) return t("not_found", lang);
      try {
        const r = await analyzeCore(intent.symbol, intent.growth);
        const lines = [
          `${intent.symbol}: ${fmtPrice(r.summary.currentPrice)} · score ${r.sc.score ?? "n/a"}/100 (${r.sc.coveragePct}% coverage)`,
        ];
        if (r.financial) lines.push(financialSectorAssessment(r.summary).verdict);
        else if (r.fairValue != null) lines.push(`DCF fair value ${fmtPrice(r.fairValue)}, buy below ${fmtPrice(r.buyBelow)}`);
        lines.push(`Verdict: ${r.verdict.verdict} — ${r.verdict.reason}`);
        return lines.join("\n");
      } catch (e) {
        return `${t("not_found", lang)} (${e.message})`;
      }
    }

    default:
      return t("not_found", lang);
  }
}
