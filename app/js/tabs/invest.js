import { summary as fetchSummary, timeseries as fetchTimeseries, quote as fetchQuote } from "../data/yahoo.js";
import { parseSummary, parseTimeseries, ownerEarnings, isFinancialSector } from "../invest/fundamentals.js";
import { buffettScorecard, financialSectorAssessment } from "../invest/score.js";
import { twoStageDCF, reverseDCF, sensitivityGrid, grahamNumber, earningsYield, tenYearYieldFromTNX } from "../invest/dcf.js";
import { get, on } from "../store.js";
import { el, fmtPrice, fmtPct, fmtCompact } from "../util.js";

let unsubs = [];
let dcfInputs = { growth1: 0.10, years1: 5, terminalGrowth: 0.025, discountRate: 0.09 };

function section(title, body) {
  return el("div", { class: "mm-flow-section" }, [el("h3", {}, title), body]);
}

function fundamentalsTable(years) {
  if (!years.length) return el("p", { class: "mm-muted" }, "No timeseries data available.");
  const rows = [
    ["Revenue", (y) => fmtCompact(y.revenue)],
    ["Gross Profit", (y) => fmtCompact(y.grossProfit)],
    ["Net Income", (y) => fmtCompact(y.netIncome)],
    ["Free Cash Flow", (y) => fmtCompact(y.freeCashFlow)],
    ["ROE", (y) => (y.netIncome != null && y.stockholdersEquity > 0 ? fmtPct((y.netIncome / y.stockholdersEquity) * 100) : "—")],
    ["Gross Margin", (y) => (y.revenue > 0 && y.grossProfit != null ? fmtPct((y.grossProfit / y.revenue) * 100) : "—")],
    ["Total Debt", (y) => fmtCompact(y.totalDebt)],
    ["Diluted Shares", (y) => fmtCompact(y.dilutedShares)],
  ];
  const table = el("table", { class: "mm-fund-table" });
  table.append(el("tr", {}, [el("th", {}, ""), ...years.map((y) => el("th", {}, y.asOfDate.slice(0, 4)))]));
  for (const [label, fn] of rows) {
    table.append(el("tr", {}, [el("td", {}, label), ...years.map((y) => el("td", {}, fn(y)))]));
  }
  return table;
}

function scorecardView(sc) {
  const wrap = el("div");
  wrap.append(
    el("div", { class: "mm-score-big" }, sc.score != null ? `${sc.score} / 100` : "insufficient data"),
    el("div", { class: "mm-muted" }, `Coverage: ${sc.coveragePct}% of rubric had data`)
  );
  const list = el("div", { class: "mm-flow-list", style: "max-height:260px" });
  sc.breakdown.forEach((c) => {
    list.append(
      el("div", { class: "mm-signal" }, [
        el("span", {}, `${c.label} (w=${c.weight})`),
        el("span", { style: "float:right" }, c.score != null ? `${Math.round(c.score * 100)}%` : "n/a"),
      ])
    );
  });
  wrap.append(list);
  return wrap;
}

function dcfPanel(container, ownerE, sharesOutstanding, currentPrice, onRecompute) {
  const out = el("div");
  const inputRow = (label, key, min, max, step) =>
    el("label", { class: "mm-dcf-input" }, [
      `${label}: `,
      el("input", {
        type: "number", min, max, step, value: dcfInputs[key],
        oninput: (e) => { dcfInputs[key] = parseFloat(e.target.value) || 0; onRecompute(); },
      }),
    ]);
  const form = el("div", { class: "mm-dcf-form" }, [
    inputRow("Stage-1 growth %/yr", "growth1", -50, 60, 0.5),
    inputRow("Stage-1 years", "years1", 1, 10, 1),
    inputRow("Terminal growth %/yr", "terminalGrowth", -2, 4.5, 0.1),
    inputRow("Discount rate %", "discountRate", 1, 30, 0.5),
  ]);
  // inputs above are stored as raw fractions in dcfInputs already (0.10 = 10%); the number
  // fields show fractions*100 for readability via a small adapter:
  form.querySelectorAll("input").forEach((inp, i) => {
    const key = ["growth1", "years1", "terminalGrowth", "discountRate"][i];
    if (key !== "years1") inp.value = (dcfInputs[key] * 100).toFixed(1);
    inp.addEventListener("input", (e) => {
      const raw = parseFloat(e.target.value) || 0;
      dcfInputs[key] = key === "years1" ? raw : raw / 100;
      renderResult();
    });
  });

  const resultEl = el("div");
  out.append(form, resultEl);

  function renderResult() {
    if (ownerE == null || !sharesOutstanding) {
      resultEl.innerHTML = "";
      resultEl.append(el("p", { class: "mm-muted" }, "Owner earnings or shares outstanding unavailable — DCF needs both."));
      return;
    }
    const r = twoStageDCF({ fcf0: ownerE, sharesOutstanding, ...dcfInputs });
    const rev = reverseDCF({ fcf0: ownerE, currentPrice, sharesOutstanding, years1: dcfInputs.years1, terminalGrowth: dcfInputs.terminalGrowth, discountRate: dcfInputs.discountRate });
    resultEl.innerHTML = "";
    resultEl.append(
      el("div", { class: "mm-flow-status" }, [
        el("b", {}, `Fair value: ${fmtPrice(r.fairValuePerShare)}`),
        el("span", { class: "mm-muted" }, `  Buy below (30% MoS): ${fmtPrice(r.buyBelow)}`),
      ]),
      el("div", { class: "mm-flow-status mm-muted" },
        `Current price ${fmtPrice(currentPrice)} implies ~${rev ? (rev.impliedGrowth * 100).toFixed(1) : "?"}% stage-1 growth${rev?.boundedHigh ? " (or higher — hit search bound)" : rev?.boundedLow ? " (or lower — hit search bound)" : ""}`
      )
    );
    const grid = sensitivityGrid({ ...dcfInputs, fcf0: ownerE, sharesOutstanding }, [-0.05, 0, 0.05], [-0.02, 0, 0.02]);
    const table = el("table", { class: "mm-fund-table" });
    table.append(el("tr", {}, [el("th", {}, "growth\\disc"), ...[-0.02, 0, 0.02].map((d) => el("th", {}, `${((dcfInputs.discountRate + d) * 100).toFixed(1)}%`))]));
    grid.forEach((row, i) => {
      const g = (dcfInputs.growth1 + [-0.05, 0, 0.05][i]) * 100;
      table.append(el("tr", {}, [el("td", {}, `${g.toFixed(1)}%`), ...row.map((v) => el("td", {}, fmtPrice(v)))]));
    });
    resultEl.append(el("div", { class: "mm-muted", style: "margin-top:6px" }, "Fair value sensitivity ($/share):"), table);
  }
  renderResult();
  return out;
}

async function render(root) {
  const symbol = get("symbol");
  root.innerHTML = "";
  const status = el("div", { class: "mm-flow-status" }, `Loading ${symbol}…`);
  root.append(status);
  try {
    const [summaryRes, tsRes, tnxRes] = await Promise.all([
      fetchSummary(symbol),
      fetchTimeseries(symbol).catch(() => ({ data: [] })),
      fetchQuote("^TNX").catch(() => null),
    ]);
    const summary = parseSummary(summaryRes.data);
    const { years } = parseTimeseries(tsRes.data);
    const lastYear = years.at(-1);
    const ownerE = ownerEarnings(lastYear);
    const financial = isFinancialSector(summary);

    status.textContent = `${symbol} · ${summary.sector || "sector n/a"} · ${financial ? "financial-sector mode" : "standard mode"}`;
    root.append(el("div", { class: "mm-grade-banner", style: "border-color:#4da3ff;color:#4da3ff" },
      financial ? "Bank/insurer detected — showing ROE/ROA/justified P/B instead of DCF" : "DCF applies — standard non-financial model"));

    root.append(section("Fundamentals (up to 5y)", fundamentalsTable(years)));

    const sc = buffettScorecard(summary, years);
    root.append(section("Buffett quality scorecard", scorecardView(sc)));

    root.append(section("Owner earnings (latest FY)", el("div", { class: "mm-flow-status" },
      ownerE != null ? `${fmtCompact(ownerE)} (Net Income + D&A − CapEx)` : "Unavailable — missing NI/D&A/CapEx for latest year")));

    if (financial) {
      const fa = financialSectorAssessment(summary);
      root.append(section("Financial-sector assessment", el("div", { class: "mm-flow-status" }, [
        el("div", {}, `ROE ${fmtPct((fa.roe || 0) * 100)} · ROA ${fmtPct((fa.roa || 0) * 100)}`),
        el("div", {}, `P/B ${fa.priceToBook?.toFixed(2) ?? "—"} vs justified P/B ${fa.justifiedPB?.toFixed(2) ?? "—"}`),
        el("b", {}, fa.verdict),
      ])));
    } else {
      root.append(section("Two-stage DCF", dcfPanel(root, ownerE, summary.sharesOutstanding, summary.currentPrice, () => {})));
    }

    const graham = grahamNumber(summary.trailingEps, summary.bookValue);
    const ey = earningsYield(summary.trailingEps, summary.currentPrice);
    const tnxRow = tnxRes?.data?.[0];
    const tenY = tenYearYieldFromTNX(tnxRow?.regularMarketPrice);
    root.append(section("Quick valuation checks", el("div", { class: "mm-flow-status" }, [
      el("div", {}, `Graham number: ${graham != null ? fmtPrice(graham) : "n/a (needs positive EPS & book value)"}`),
      el("div", {}, `Earnings yield: ${ey != null ? ey.toFixed(2) + "%" : "n/a"} vs 10Y Treasury ${tenY != null ? tenY.toFixed(2) + "%" : "n/a"}`),
    ])));
  } catch (e) {
    status.textContent = `Error loading ${symbol}: ${e.message}`;
  }
}

export function mount(root) {
  root.innerHTML = "";
  const wrap = el("div", { class: "mm-view mm-view-invest" });
  root.append(wrap);
  render(wrap);
  unsubs.push(on("symbol", () => render(wrap)));
}

export function unmount() {
  unsubs.forEach((fn) => fn());
  unsubs = [];
}
