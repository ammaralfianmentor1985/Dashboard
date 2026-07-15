// Buffett-style quality scorecard: 13 weighted components, each independently
// scored 0-1 and multiplied by its weight (weights sum to 100). Any component
// whose required data is missing is excluded from both the numerator and the
// weight total — the reported score is out of the *covered* weight, and
// `coveragePct` says how much of the rubric actually had data.
import { fcfStreak } from "./fundamentals.js";

const COMPONENTS = [
  { key: "roeLevel", label: "ROE level (>15% strong)", weight: 10 },
  { key: "roeFloor", label: "ROE floor (no bad years)", weight: 6 },
  { key: "grossMargin", label: "Gross margin (moat proxy)", weight: 10 },
  { key: "marginStability", label: "Margin stability (5y)", weight: 6 },
  { key: "fcfQuality", label: "FCF vs Net Income quality", weight: 10 },
  { key: "fcfStreak", label: "FCF-positive streak", weight: 8 },
  { key: "debtToEquity", label: "Debt/Equity (lower is safer)", weight: 12 },
  { key: "currentRatio", label: "Current ratio (liquidity)", weight: 6 },
  { key: "revenueGrowth", label: "Revenue growth", weight: 8 },
  { key: "earningsGrowth", label: "Earnings growth", weight: 8 },
  { key: "buybacks", label: "Share count shrinking (buybacks)", weight: 6 },
  { key: "roa", label: "Return on assets", weight: 6 },
  { key: "analystConviction", label: "Analyst conviction (buy-rated, covered)", weight: 4 },
];
const TOTAL_WEIGHT = COMPONENTS.reduce((s, c) => s + c.weight, 0); // 100

function scoreCurve(value, { good, great }) {
  // Linear ramp: <=some floor -> 0, >=great -> 1, between -> interpolated.
  if (value == null) return null;
  const floor = good - (great - good);
  if (value <= floor) return 0;
  if (value >= great) return 1;
  return (value - floor) / (great - floor);
}

export function buffettScorecard(summary, tsYears) {
  const years = tsYears || [];
  const scores = {};

  scores.roeLevel = scoreCurve(summary.returnOnEquity, { good: 0.15, great: 0.30 });
  scores.roa = scoreCurve(summary.returnOnAssets, { good: 0.08, great: 0.18 });
  scores.grossMargin = scoreCurve(summary.grossMargins, { good: 0.35, great: 0.60 });
  scores.revenueGrowth = scoreCurve(summary.revenueGrowth, { good: 0.05, great: 0.20 });
  scores.earningsGrowth = scoreCurve(summary.earningsGrowth, { good: 0.05, great: 0.20 });
  scores.currentRatio = scoreCurve(summary.currentRatio, { good: 1.0, great: 2.0 });

  // Debt/Equity: Yahoo reports as a percent-scale ratio (79.5 = 0.795x equity). Lower is better.
  if (summary.debtToEquity != null) {
    const dte = summary.debtToEquity / 100;
    scores.debtToEquity = dte <= 0.3 ? 1 : dte >= 2.0 ? 0 : 1 - (dte - 0.3) / (2.0 - 0.3);
  } else scores.debtToEquity = null;

  if (years.length >= 2) {
    const roeSeries = years.filter((y) => y.netIncome != null && y.stockholdersEquity > 0)
      .map((y) => y.netIncome / y.stockholdersEquity);
    scores.roeFloor = roeSeries.length ? (roeSeries.every((r) => r > 0.08) ? 1 : roeSeries.filter((r) => r > 0.08).length / roeSeries.length) : null;

    const marginSeries = years.filter((y) => y.revenue > 0 && y.grossProfit != null).map((y) => y.grossProfit / y.revenue);
    if (marginSeries.length >= 2) {
      const mean = marginSeries.reduce((a, b) => a + b, 0) / marginSeries.length;
      const variance = marginSeries.reduce((s, m) => s + (m - mean) ** 2, 0) / marginSeries.length;
      const sd = Math.sqrt(variance);
      scores.marginStability = sd <= 0.02 ? 1 : sd >= 0.10 ? 0 : 1 - (sd - 0.02) / (0.08);
    } else scores.marginStability = null;

    const withFcf = years.filter((y) => y.freeCashFlow != null && y.netIncome != null && y.netIncome !== 0);
    if (withFcf.length) {
      const avgRatio = withFcf.reduce((s, y) => s + y.freeCashFlow / y.netIncome, 0) / withFcf.length;
      scores.fcfQuality = avgRatio >= 1 ? 1 : avgRatio <= 0.5 ? 0 : (avgRatio - 0.5) / 0.5;
    } else scores.fcfQuality = null;

    const streak = fcfStreak(years);
    scores.fcfStreak = streak >= years.length ? 1 : streak / years.length;

    const sharesSeries = years.filter((y) => y.dilutedShares != null).map((y) => y.dilutedShares);
    if (sharesSeries.length >= 2) {
      const change = (sharesSeries.at(-1) - sharesSeries[0]) / sharesSeries[0];
      scores.buybacks = change <= -0.02 ? 1 : change >= 0.05 ? 0 : 1 - (change + 0.02) / 0.07;
    } else scores.buybacks = null;
  } else {
    scores.roeFloor = scores.marginStability = scores.fcfQuality = scores.fcfStreak = scores.buybacks = null;
  }

  if (summary.recommendationKey && summary.numberOfAnalystOpinions >= 3) {
    const keyScore = { strong_buy: 1, buy: 0.8, hold: 0.4, underperform: 0.1, sell: 0 }[summary.recommendationKey] ?? 0.4;
    scores.analystConviction = keyScore;
  } else scores.analystConviction = null;

  let earnedWeight = 0, coveredWeight = 0;
  const breakdown = COMPONENTS.map((c) => {
    const s = scores[c.key];
    if (s != null) { earnedWeight += s * c.weight; coveredWeight += c.weight; }
    return { ...c, score: s };
  });

  const scoreOutOf100 = coveredWeight > 0 ? Math.round((earnedWeight / coveredWeight) * 100) : null;
  return {
    score: scoreOutOf100,
    coveragePct: Math.round((coveredWeight / TOTAL_WEIGHT) * 100),
    breakdown,
  };
}

// Simplified financial-sector mode (banks/insurers) — DCF on levered FCF is
// unreliable for banks, so score ROE/ROA and a justified P/B instead.
export function financialSectorAssessment(summary) {
  const roe = summary.returnOnEquity;
  const pb = summary.priceToBook;
  const costOfEquity = 0.10; // rough hurdle rate assumption, documented not hidden
  const justifiedPB = roe != null ? roe / costOfEquity : null;
  return {
    roe, roa: summary.returnOnAssets, priceToBook: pb, justifiedPB,
    verdict: justifiedPB != null && pb != null
      ? (pb <= justifiedPB * 0.85 ? "cheap vs ROE-justified P/B" : pb >= justifiedPB * 1.15 ? "expensive vs ROE-justified P/B" : "fairly valued vs ROE-justified P/B")
      : "insufficient data",
  };
}
