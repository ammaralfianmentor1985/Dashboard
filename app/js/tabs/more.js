import { loadTrades, saveTrades, addTrade, stats } from "../more/journal.js";
import { news as fetchNews } from "../data/yahoo.js";
import { get, set } from "../store.js";
import { navigate } from "../router.js";
import { el, fmtCompact, fmtPct } from "../util.js";

const WATCHLIST_KEY = "mm.watchlist.local";
const SETTINGS_KEYS = ["mm.settings.accountSize", "mm.settings.riskPct"];

function section(title, body) {
  return el("div", { class: "mm-flow-section" }, [el("h3", {}, title), body]);
}

// ---------- watchlist ----------
function watchlistSection() {
  const list = el("div");
  const render = () => {
    const symbols = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]");
    list.innerHTML = "";
    if (!symbols.length) { list.append(el("p", { class: "mm-muted" }, "Empty — add from Chat (\"watch AAPL\") or here.")); }
    symbols.forEach((s) => {
      list.append(el("div", { class: "mm-signal" }, [
        el("span", { onclick: () => { set("symbol", s); navigate("chart"); }, style: "cursor:pointer" }, s),
        el("button", { class: "mm-help-btn", style: "float:right", onclick: () => {
          const next = symbols.filter((x) => x !== s);
          localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
          render();
        } }, "×"),
      ]));
    });
  };
  render();
  const input = el("input", { class: "mm-search-input", placeholder: "Add symbol…" });
  const addBtn = el("button", { class: "mm-tf-btn", onclick: () => {
    const sym = input.value.trim().toUpperCase();
    if (!sym) return;
    const symbols = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]");
    if (!symbols.includes(sym)) symbols.push(sym);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(symbols));
    input.value = "";
    render();
  } }, "Add");
  const copyBtn = el("button", { class: "mm-tf-btn", onclick: async () => {
    const symbols = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]");
    const payload = JSON.stringify({ v: 1, note: "Copied from More tab", symbols }, null, 2);
    try { await navigator.clipboard.writeText(payload); copyBtn.textContent = "Copied!"; setTimeout(() => (copyBtn.textContent = "Copy JSON for repo"), 1500); }
    catch { alert(payload); }
  } }, "Copy JSON for repo");
  return el("div", {}, [list, el("div", { class: "mm-screen-controls" }, [input, addBtn]), copyBtn]);
}

// ---------- journal ----------
function journalSection() {
  const body = el("div");
  const render = () => {
    const trades = loadTrades();
    const s = stats(trades);
    body.innerHTML = "";
    body.append(
      el("div", { class: "mm-flow-status" }, s.count
        ? `${s.count} trades · win rate ${(s.winRate * 100).toFixed(0)}% · expectancy ${s.expectancy.toFixed(2)}R · half-Kelly ${s.halfKelly != null ? (s.halfKelly * 100).toFixed(1) + "%" : "n/a"}`
        : "No trades logged yet."),
      el("div", { class: "mm-muted" }, s.equityCurve.length ? `Equity curve (R): ${s.equityCurve.map((v) => v.toFixed(1)).join(" → ")}` : "")
    );
    const list = el("div", { class: "mm-flow-list" });
    [...trades].reverse().slice(0, 15).forEach((t) => {
      list.append(el("div", { class: `mm-signal mm-${t.r >= 0 ? "up" : "down"}` },
        `${t.symbol} ${t.direction} entry ${t.entry} stop ${t.stop} exit ${t.exit} → ${t.r != null ? t.r.toFixed(2) + "R" : "invalid"}`));
    });
    body.append(list);
  };
  render();

  const symbol = el("input", { class: "mm-search-input", placeholder: "Symbol" });
  const dir = el("select", { class: "mm-select" }, [el("option", { value: "long" }, "Long"), el("option", { value: "short" }, "Short")]);
  const entry = el("input", { type: "number", class: "mm-search-input", placeholder: "Entry" });
  const stop = el("input", { type: "number", class: "mm-search-input", placeholder: "Stop" });
  const exit = el("input", { type: "number", class: "mm-search-input", placeholder: "Exit" });
  const addBtn = el("button", { class: "mm-tf-btn active", onclick: () => {
    const trade = { symbol: symbol.value.trim().toUpperCase(), direction: dir.value, entry: +entry.value, stop: +stop.value, exit: +exit.value };
    if (!trade.symbol || !trade.entry || !trade.stop || !trade.exit) return;
    const trades = addTrade(loadTrades(), trade);
    saveTrades(trades);
    symbol.value = entry.value = stop.value = exit.value = "";
    render();
  } }, "Log trade");

  return el("div", {}, [body, el("div", { class: "mm-screen-controls" }, [symbol, dir, entry, stop, exit, addBtn])]);
}

// ---------- position sizer ----------
function sizerSection() {
  const out = el("div", { class: "mm-flow-status" }, "");
  const account = el("input", { type: "number", class: "mm-search-input", placeholder: "Account size", value: localStorage.getItem("mm.settings.accountSize") || "10000" });
  const risk = el("input", { type: "number", class: "mm-search-input", placeholder: "Risk %", value: localStorage.getItem("mm.settings.riskPct") || "1" });
  const entry = el("input", { type: "number", class: "mm-search-input", placeholder: "Entry price" });
  const stop = el("input", { type: "number", class: "mm-search-input", placeholder: "Stop price" });
  const isIdx = el("label", {}, [el("input", { type: "checkbox", id: "idxLot" }), " IDX 100-share lots"]);
  const compute = () => {
    localStorage.setItem("mm.settings.accountSize", account.value);
    localStorage.setItem("mm.settings.riskPct", risk.value);
    const acc = +account.value, r = +risk.value / 100, e = +entry.value, s = +stop.value;
    if (!acc || !e || !s || e === s) { out.textContent = "Enter account size, risk %, entry, and stop."; return; }
    const riskAmount = acc * r;
    const perUnitRisk = Math.abs(e - s);
    let qty = riskAmount / perUnitRisk;
    const lotMode = document.getElementById("idxLot")?.checked;
    if (lotMode) qty = Math.floor(qty / 100) * 100;
    out.textContent = `Risk ${fmtCompact(riskAmount)} ÷ ${perUnitRisk.toFixed(4)}/unit = ${qty.toLocaleString(undefined, { maximumFractionDigits: 0 })} units`;
  };
  [account, risk, entry, stop].forEach((inp) => inp.addEventListener("input", compute));
  isIdx.querySelector("input").addEventListener("change", compute);
  return el("div", {}, [el("div", { class: "mm-screen-controls" }, [account, risk, entry, stop]), isIdx, out]);
}

// ---------- calendar / news / settings ----------
async function calendarSection() {
  try {
    const r = await fetch("/api/calendar");
    const j = await r.json();
    const events = (j.data || j.events || []).slice(0, 10);
    if (!events.length) return el("p", { class: "mm-muted" }, "No calendar data.");
    const list = el("div", { class: "mm-flow-list" });
    events.forEach((e) => list.append(el("div", { class: "mm-signal" }, `${e.date || e.time || ""} ${e.country || ""} ${e.title || e.event || ""}`)));
    return list;
  } catch {
    return el("div", { class: "mm-muted" }, "Calendar unavailable right now.");
  }
}

function newsSection() {
  const body = el("div", { class: "mm-muted" }, `Showing news for current chart symbol: ${get("symbol")}`);
  const list = el("div", { class: "mm-flow-list" });
  const load = async () => {
    list.innerHTML = "";
    try {
      const r = await fetchNews(get("symbol"));
      (r.data || []).slice(0, 8).forEach((item) => list.append(el("div", { class: "mm-signal" }, `• ${item.title}`)));
      if (!(r.data || []).length) list.append(el("p", { class: "mm-muted" }, "No news found."));
    } catch {
      list.append(el("p", { class: "mm-muted" }, "News unavailable right now."));
    }
  };
  load();
  return el("div", {}, [body, list]);
}

function settingsSection() {
  const lang = el("select", { class: "mm-select" }, [el("option", { value: "en" }, "English"), el("option", { value: "id" }, "Bahasa Indonesia")]);
  lang.value = get("lang");
  lang.addEventListener("change", () => set("lang", lang.value));
  const exportBtn = el("button", { class: "mm-tf-btn", onclick: () => {
    const payload = {
      watchlist: JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]"),
      journal: loadTrades(),
      settings: Object.fromEntries(SETTINGS_KEYS.map((k) => [k, localStorage.getItem(k)])),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mentor-markets-backup.json";
    a.click();
  } }, "Export backup");
  const importInput = el("input", { type: "file", accept: "application/json", style: "display:none" });
  importInput.addEventListener("change", async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.watchlist) localStorage.setItem(WATCHLIST_KEY, JSON.stringify(data.watchlist));
      if (data.journal) saveTrades(data.journal);
      if (data.settings) Object.entries(data.settings).forEach(([k, v]) => v != null && localStorage.setItem(k, v));
      alert("Imported. Reload the app to see changes everywhere.");
    } catch (e) { alert("Import failed: " + e.message); }
  });
  const importBtn = el("button", { class: "mm-tf-btn", onclick: () => importInput.click() }, "Import backup");
  return el("div", {}, [
    el("div", { class: "mm-dcf-input" }, ["Language: ", lang]),
    el("div", { class: "mm-screen-controls", style: "margin-top:8px" }, [exportBtn, importBtn, importInput]),
  ]);
}

function disclaimer() {
  return el("p", { class: "mm-muted" },
    "Educational tool only — not financial advice. Prices for stocks/FX/commodities/indices are ~15min delayed (Yahoo Finance); crypto is live tick data (Binance). Verify anything before acting on it.");
}

export async function mount(root) {
  root.innerHTML = "";
  const wrap = el("div", { class: "mm-view mm-view-more" });
  wrap.append(
    section("Watchlist", watchlistSection()),
    section("Journal", journalSection()),
    section("Position sizer", sizerSection()),
    section("News (current symbol)", newsSection()),
    section("Settings", settingsSection()),
    section("Disclaimer", disclaimer())
  );
  root.append(wrap);
  const calSection = section("Economic calendar (WIB)", await calendarSection());
  wrap.insertBefore(calSection, wrap.children[wrap.children.length - 1]);
}

export function unmount() {}
