import { ChartEngine } from "../chart/engine.js";
import { chart as fetchChart } from "../data/yahoo.js";
import { quickMatch, liveSearch } from "../data/symbols.js";
import * as ind from "../chart/indicators.js";
import { sessionProfile } from "../chart/profile.js";
import * as drawings from "../chart/drawings.js";
import { get, set, on } from "../store.js";
import { el, debounce, fmtPrice, fmtPct } from "../util.js";

const RANGE_BY_TF = {
  "1m": ["1d", "1m"], "5m": ["5d", "5m"], "15m": ["5d", "15m"], "60m": ["1mo", "60m"],
  "1D": ["6mo", "1d"], "1W": ["5y", "1wk"], "1M": ["max", "1mo"],
};

const INDICATOR_TOGGLES = [
  ["ema20", "EMA20", "#4da3ff"],
  ["ema50", "EMA50", "#f0b90b"],
  ["sma200", "SMA200", "#c084fc"],
  ["vwap", "VWAP", "#ff8a65"],
  ["bb", "BB(20,2)", "#80cbc4"],
  ["profile", "Vol Profile", "#9aa0a6"],
  ["sr", "S/R", "#ef5350"],
];

const DRAW_TOOLS = [["none", "✥"], ["hline", "—"], ["trendline", "╱"], ["fib", "Fib"], ["rect", "▭"]];

let engine = null;
let unsubs = [];
let activeIndicators = new Set(["ema20", "sma200"]);
let drawMode = "none";
let pendingDrawing = null;
let currentBars = [];
let symbolDrawings = [];

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

function indicatorBar(onToggle) {
  return el("div", { class: "mm-tf-bar mm-ind-bar" }, INDICATOR_TOGGLES.map(([key, label]) =>
    el("button", {
      class: "mm-tf-btn" + (activeIndicators.has(key) ? " active" : ""),
      onclick: (e) => { onToggle(key); e.target.classList.toggle("active", activeIndicators.has(key)); },
    }, label)
  ));
}

function drawToolBar(onPick) {
  const wrap = el("div", { class: "mm-tf-bar mm-draw-bar" });
  const btns = DRAW_TOOLS.map(([key, label]) =>
    el("button", {
      class: "mm-tf-btn" + (drawMode === key ? " active" : ""),
      onclick: () => onPick(key, wrap),
    }, label)
  );
  const clearBtn = el("button", { class: "mm-tf-btn", onclick: () => onPick("__clear__", wrap) }, "Clear");
  wrap.append(...btns, clearBtn);
  return wrap;
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

function lineOverlay(series, color) {
  return (ctx, s, visible) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let started = false;
    visible.forEach((_, relI) => {
      const absI = engine.visStart + relI;
      const v = series[absI];
      if (v == null) return;
      const px = s.x(relI), py = s.y(v);
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    });
    ctx.stroke();
  };
}

function buildOverlays(bars) {
  const overlays = [];
  const atrSeries = ind.atr(bars, 14);
  if (activeIndicators.has("ema20")) overlays.push(lineOverlay(ind.ema(bars, 20), "#4da3ff"));
  if (activeIndicators.has("ema50")) overlays.push(lineOverlay(ind.ema(bars, 50), "#f0b90b"));
  if (activeIndicators.has("sma200")) overlays.push(lineOverlay(ind.sma(bars, 200), "#c084fc"));
  if (activeIndicators.has("vwap")) overlays.push(lineOverlay(ind.vwap(bars), "#ff8a65"));
  if (activeIndicators.has("bb")) {
    const bb = ind.bollinger(bars, 20, 2);
    overlays.push(lineOverlay(bb.upper, "rgba(128,203,196,0.8)"));
    overlays.push(lineOverlay(bb.lower, "rgba(128,203,196,0.8)"));
    overlays.push(lineOverlay(bb.mid, "rgba(128,203,196,0.4)"));
  }
  if (activeIndicators.has("sr")) {
    const { support, resistance } = ind.supportResistance(bars, atrSeries);
    overlays.push((ctx, s) => {
      ctx.setLineDash([6, 4]);
      ctx.font = "9px system-ui, sans-serif";
      for (const lvl of [...support, ...resistance]) {
        const py = s.y(lvl.price);
        ctx.strokeStyle = resistance.includes(lvl) ? "rgba(239,83,80,0.55)" : "rgba(38,166,154,0.55)";
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(engine.w, py);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    });
  }
  if (activeIndicators.has("profile")) {
    const prof = sessionProfile(bars);
    if (prof) {
      overlays.push((ctx, s) => {
        const maxW = 70;
        for (let i = 0; i < prof.bins; i++) {
          const price = prof.lo + (i + 0.5) * prof.binSize;
          const py = s.y(price);
          const w = (prof.vol[i] / prof.total) * maxW * prof.bins;
          ctx.fillStyle = "rgba(154,160,166,0.25)";
          ctx.fillRect(engine.w - PAD_RIGHT_SAFE - w, py - 1, w, 2);
        }
        [["poc", "#f0b90b"], ["vah", "rgba(255,255,255,0.4)"], ["val", "rgba(255,255,255,0.4)"]].forEach(([k, color]) => {
          const py = s.y(prof[k]);
          ctx.strokeStyle = color;
          ctx.setLineDash(k === "poc" ? [] : [3, 3]);
          ctx.beginPath();
          ctx.moveTo(0, py);
          ctx.lineTo(engine.w, py);
          ctx.stroke();
          ctx.setLineDash([]);
        });
      });
    }
  }
  overlays.push((ctx, s) => drawings.render(ctx, s, engine, symbolDrawings));
  return overlays;
}
const PAD_RIGHT_SAFE = 54;

function oscillatorReadout(bars) {
  if (bars.length < 30) return "";
  const r = ind.rsi(bars, 14).at(-1);
  const m = ind.macd(bars);
  const a = ind.atr(bars, 14).at(-1);
  const parts = [];
  if (r != null) parts.push(`RSI14 ${r.toFixed(1)}`);
  if (m.hist.at(-1) != null) parts.push(`MACD hist ${m.hist.at(-1).toFixed(3)}`);
  if (a != null) parts.push(`ATR14 ${a.toFixed(bars.at(-1).c < 10 ? 4 : 2)}`);
  return parts.join(" · ");
}

async function loadAndRender(container) {
  const symbol = get("symbol");
  const tf = get("timeframe");
  const [range, interval] = RANGE_BY_TF[tf] || RANGE_BY_TF["1D"];
  const statusEl = container.querySelector(".mm-chart-status");
  const oscEl = container.querySelector(".mm-osc-readout");
  statusEl.textContent = `Loading ${symbol}…`;
  symbolDrawings = drawings.load(symbol);
  try {
    const r = await fetchChart(symbol, range, interval);
    const res = r.data;
    const meta = res.meta || {};
    const ts = res.timestamp || [];
    const q = res.indicators?.quote?.[0] || {};
    const bars = ts.map((t, i) => ({
      t, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i] || 0,
    })).filter((b) => b.o != null && b.h != null && b.l != null && b.c != null);
    currentBars = bars;
    engine.overlays = buildOverlays(bars);
    engine.setChartType(get("chartType"));
    engine.setBars(bars);
    const last = bars[bars.length - 1];
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
    oscEl.textContent = oscillatorReadout(bars);
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
  header.append(indicatorBar((key) => {
    activeIndicators.has(key) ? activeIndicators.delete(key) : activeIndicators.add(key);
    engine.overlays = buildOverlays(currentBars);
    engine.render();
  }));
  const drawBarEl = drawToolBar((key, barEl) => {
    if (key === "__clear__") {
      symbolDrawings = [];
      drawings.save(get("symbol"), symbolDrawings);
      pendingDrawing = null;
      engine.drawMode = null;
      barEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      engine.render();
      return;
    }
    drawMode = drawMode === key ? "none" : key;
    pendingDrawing = null;
    engine.drawMode = drawMode === "none" ? null : drawMode;
    barEl.querySelectorAll("button").forEach((b, i) => b.classList.toggle("active", DRAW_TOOLS[i]?.[0] === drawMode));
  });
  header.append(drawBarEl);
  header.append(el("div", { class: "mm-osc-readout" }, ""));
  const canvasHost = el("div", { class: "mm-chart-host" });
  wrap.append(header, canvasHost);
  root.append(wrap);

  engine = new ChartEngine(canvasHost);
  engine.onDrawPoint = (point) => {
    const result = drawings.addPoint(pendingDrawing, drawMode, point);
    pendingDrawing = result.pending;
    if (result.done) {
      symbolDrawings.push(result.done);
      drawings.save(get("symbol"), symbolDrawings);
      pendingDrawing = null;
      drawMode = "none";
      engine.drawMode = null;
      drawBarEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    }
    engine.overlays = buildOverlays(currentBars);
    engine.render();
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
