import { batchQuotes, binanceTickers, applyPreset, PRESETS } from "../screen/screener.js";
import { set } from "../store.js";
import { navigate } from "../router.js";
import { el, fmtPrice, fmtPct, fmtCompact } from "../util.js";

const UNIVERSES = [
  ["sp500", "S&P 500"], ["nasdaq100", "Nasdaq 100"], ["dow30", "Dow 30"],
  ["idx", "IDX blue chips"], ["crypto", "Crypto (Binance)"],
];

let universeCache = new Map();

async function loadUniverse(key) {
  if (universeCache.has(key)) return universeCache.get(key);
  const r = await fetch(`/app/data/universe/${key}.json`);
  const j = await r.json();
  universeCache.set(key, j);
  return j;
}

function presetOptionsFor(universeKey) {
  const all = Object.keys(PRESETS);
  return universeKey === "crypto" ? ["crypto_movers"] : all.filter((k) => k !== "crypto_movers");
}

async function runScan(universeKey, presetKey, statusEl, tableEl) {
  const t0 = performance.now();
  statusEl.textContent = "Scanning…";
  const universe = await loadUniverse(universeKey);
  const symbols = universe.symbols;
  let rows;
  if (universeKey === "crypto") {
    rows = await binanceTickers(symbols);
  } else {
    rows = await batchQuotes(symbols);
  }
  const filtered = applyPreset(rows, presetKey).slice(0, 60);
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  statusEl.textContent = `${filtered.length} of ${rows.length} scanned (${symbols.length} in universe) · ${elapsed}s`;
  renderTable(tableEl, filtered, universeKey);
}

function renderTable(tableEl, rows, universeKey) {
  tableEl.innerHTML = "";
  if (!rows.length) { tableEl.append(el("p", { class: "mm-muted" }, "No matches.")); return; }
  const table = el("table", { class: "mm-fund-table mm-screen-table" });
  table.append(el("tr", {}, ["Symbol", "Price", "Chg%", "P/E", "P/B", "52w"].map((h) => el("th", {}, h))));
  rows.forEach((r) => {
    const chg = r.regularMarketChangePercent;
    const symbol = r.symbol;
    const row = el("tr", { class: "mm-screen-row", onclick: () => { set("symbol", displaySymbol(symbol, universeKey)); navigate("chart"); } }, [
      el("td", {}, symbol),
      el("td", {}, fmtPrice(r.regularMarketPrice)),
      el("td", { class: chg >= 0 ? "mm-up" : "mm-down" }, fmtPct(chg)),
      el("td", {}, r.trailingPE ? r.trailingPE.toFixed(1) : "—"),
      el("td", {}, r.priceToBook ? r.priceToBook.toFixed(1) : "—"),
      el("td", {}, r.fiftyTwoWeekHighChangePercent != null ? fmtPct(r.fiftyTwoWeekHighChangePercent * 100) + " from high" : "—"),
    ]);
    table.append(row);
  });
  tableEl.append(table);
}

function displaySymbol(symbol, universeKey) {
  if (universeKey !== "crypto") return symbol;
  // Binance "BTCUSDT" -> chart/invest tabs expect Yahoo-style "BTC-USD"
  const m = symbol.match(/^([A-Z0-9]+)USDT?$/);
  return m ? `${m[1]}-USD` : symbol;
}

export function mount(root) {
  root.innerHTML = "";
  const wrap = el("div", { class: "mm-view mm-view-screen" });
  let universeKey = "sp500";
  let presetKey = "buffett_quality";

  const statusEl = el("div", { class: "mm-flow-status" }, "Pick a universe and preset, then Scan.");
  const tableWrap = el("div");

  const universeSelect = el("select", { class: "mm-select" }, UNIVERSES.map(([k, label]) => el("option", { value: k }, label)));
  const presetSelect = el("select", { class: "mm-select" });
  const fillPresets = () => {
    presetSelect.innerHTML = "";
    presetOptionsFor(universeKey).forEach((k) => presetSelect.append(el("option", { value: k }, PRESETS[k].label)));
    presetKey = presetSelect.value;
  };
  fillPresets();

  universeSelect.addEventListener("change", () => { universeKey = universeSelect.value; fillPresets(); });
  presetSelect.addEventListener("change", () => { presetKey = presetSelect.value; });

  const scanBtn = el("button", { class: "mm-tf-btn active", onclick: () => runScan(universeKey, presetKey, statusEl, tableWrap) }, "Scan");

  wrap.append(
    el("div", { class: "mm-screen-controls" }, [universeSelect, presetSelect, scanBtn]),
    statusEl,
    tableWrap
  );
  root.append(wrap);
}

export function unmount() {}
