import { ChartEngine } from "../chart/engine.js";
import { chart as fetchChart } from "../data/yahoo.js";
import { quickMatch, liveSearch } from "../data/symbols.js";
import { get, set, on } from "../store.js";
import { el, debounce, fmtPrice, fmtPct } from "../util.js";

const RANGE_BY_TF = {
  "1m": ["1d", "1m"], "5m": ["5d", "5m"], "15m": ["5d", "15m"], "60m": ["1mo", "60m"],
  "1D": ["6mo", "1d"], "1W": ["5y", "1wk"], "1M": ["max", "1mo"],
};

let engine = null;
let unsubs = [];

function timeframeBar() {
  const tfs = Object.keys(RANGE_BY_TF);
  return el("div", { class: "mm-tf-bar" }, tfs.map((tf) =>
    el("button", {
      class: "mm-tf-btn" + (get("timeframe") === tf ? " active" : ""),
      onclick: () => set("timeframe", tf),
    }, tf)
  ));
}

function typeBar() {
  const types = [["candles", "Candles"], ["heikinashi", "Heikin-Ashi"], ["line", "Line"]];
  return el("div", { class: "mm-type-bar" }, types.map(([v, label]) =>
    el("button", {
      class: "mm-type-btn" + (get("chartType") === v ? " active" : ""),
      onclick: () => set("chartType", v),
    }, label)
  ));
}

function searchBox(onPick) {
  const input = el("input", { class: "mm-search-input", placeholder: "Search symbol… (AAPL, BBCA.JK, GC=F)", value: "" });
  const results = el("div", { class: "mm-search-results" });
  const renderList = (items) => {
    results.innerHTML = "";
    items.forEach((it) =>
      results.append(
        el("div", { class: "mm-search-item", onclick: () => { onPick(it.symbol); input.value = ""; results.innerHTML = ""; } },
          [el("b", {}, it.symbol), el("span", {}, " " + (it.name || "")), el("small", {}, it.type || "")]
        )
      )
    );
  };
  const doSearch = debounce(async (q) => {
    renderList(quickMatch(q));
    const live = await liveSearch(q);
    if (live.length) renderList(live);
  }, 250);
  input.addEventListener("input", () => doSearch(input.value));
  input.addEventListener("focus", () => renderList(quickMatch(input.value)));
  document.addEventListener("click", (e) => {
    if (!results.contains(e.target) && e.target !== input) results.innerHTML = "";
  });
  return el("div", { class: "mm-search-box" }, [input, results]);
}

async function loadAndRender(container) {
  const symbol = get("symbol");
  const tf = get("timeframe");
  const [range, interval] = RANGE_BY_TF[tf] || RANGE_BY_TF["1D"];
  const statusEl = container.querySelector(".mm-chart-status");
  statusEl.textContent = `Loading ${symbol}…`;
  try {
    const r = await fetchChart(symbol, range, interval);
    const res = r.data;
    const meta = res.meta || {};
    const ts = res.timestamp || [];
    const q = res.indicators?.quote?.[0] || {};
    const bars = ts.map((t, i) => ({
      t, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i] || 0,
    })).filter((b) => b.o != null && b.h != null && b.l != null && b.c != null);
    engine.setChartType(get("chartType"));
    engine.setBars(bars);
    const last = bars[bars.length - 1];
    // chartPreviousClose is the close before the *range start* (e.g. 6mo ago), not
    // yesterday's close — always prefer the prior bar for a same-session % change.
    const prevClose = bars[bars.length - 2]?.c ?? meta.previousClose ?? meta.chartPreviousClose;
    const chg = last && prevClose ? ((last.c - prevClose) / prevClose) * 100 : null;
    statusEl.innerHTML = "";
    statusEl.append(
      el("b", {}, symbol),
      " ",
      el("span", {}, fmtPrice(last?.c, meta.currency)),
      " ",
      el("span", { class: chg >= 0 ? "mm-up" : "mm-down" }, fmtPct(chg)),
      el("small", {}, `  ${meta.exchangeName || ""} · ${bars.length} bars · ${r.src === "v8" ? "delayed" : r.src}`)
    );
  } catch (e) {
    statusEl.textContent = `Error loading ${symbol}: ${e.message}`;
  }
}

export function mount(root) {
  root.innerHTML = "";
  const wrap = el("div", { class: "mm-view mm-view-chart" });
  const header = el("div", { class: "mm-chart-header" });
  header.append(searchBox((sym) => set("symbol", sym)));
  header.append(el("div", { class: "mm-chart-status" }, "Loading…"));
  header.append(typeBar());
  header.append(timeframeBar());
  const canvasHost = el("div", { class: "mm-chart-host" });
  wrap.append(header, canvasHost);
  root.append(wrap);

  engine = new ChartEngine(canvasHost);
  engine.onHover = (bar) => {
    // Could surface OHLC readout; kept minimal for M2.
  };

  const refresh = () => loadAndRender(wrap);
  unsubs.push(on("symbol", refresh));
  unsubs.push(on("timeframe", refresh));
  unsubs.push(on("chartType", () => engine.setChartType(get("chartType"))));
  refresh();
}

export function unmount() {
  unsubs.forEach((fn) => fn());
  unsubs = [];
  engine?.destroy();
  engine = null;
}
