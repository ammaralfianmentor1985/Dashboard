import { BinanceFeed } from "../data/binance.js";
import { chart as fetchChart } from "../data/yahoo.js";
import { buildFootprint, footprintByBar } from "../flow/footprint.js";
import { diagonalImbalances, stackedZones, detectAbsorption, detectExhaustion, bookImbalance, detectWalls } from "../flow/signals.js";
import { DepthTracker } from "../flow/book.js";
import * as vsa from "../flow/vsa.js";
import { supportResistance, atr } from "../chart/indicators.js";
import { sessionProfile } from "../chart/profile.js";
import { get, on } from "../store.js";
import { el, fmtPrice, fmtCompact } from "../util.js";

const CRYPTO_MAP = { "BTC-USD": "btcusdt", "ETH-USD": "ethusdt", "BTC-USDT": "btcusdt", "ETH-USDT": "ethusdt" };
function binancePair(symbol) {
  if (CRYPTO_MAP[symbol]) return CRYPTO_MAP[symbol];
  const m = symbol.match(/^([A-Z0-9]{2,10})-USDT?$/);
  return m ? (m[1] + "usdt").toLowerCase() : null;
}

let unsubs = [];
let feed = null;
let depthTracker = null;
let updateTimer = null;

function gradeBanner(grade, note) {
  const color = grade === "LIVE TICK" ? "#26a69a" : grade === "DELAYED 1m" ? "#f0b90b" : "#9aa0a6";
  return el("div", { class: "mm-grade-banner", style: `border-color:${color};color:${color}` }, `${grade} — ${note}`);
}

function section(title, body) {
  return el("div", { class: "mm-flow-section" }, [el("h3", {}, title), body]);
}

function list(items, render) {
  if (!items.length) return el("p", { class: "mm-muted" }, "None detected right now.");
  return el("div", { class: "mm-flow-list" }, items.slice(-12).reverse().map(render));
}

// ---------- crypto (live tick) ----------

function mountCrypto(root, symbol, pair) {
  root.innerHTML = "";
  const banner = gradeBanner("LIVE TICK", `Binance ${pair.toUpperCase()} — true bid/ask aggression from real trades`);
  const status = el("div", { class: "mm-flow-status" }, "Connecting…");
  const tapeEl = el("div", { class: "mm-tape" });
  const cvdEl = el("div", { class: "mm-flow-status" }, "");
  const footprintEl = el("div");
  const signalsEl = el("div");
  const bookEl = el("div");
  const sessionEl = el("div", { class: "mm-flow-status" }, "");
  root.append(
    banner, status,
    section("Time & Sales", tapeEl),
    section("Delta / CVD", cvdEl),
    section("Footprint (bid/ask by price)", footprintEl),
    section("Signals — Valentini checklist", signalsEl),
    section("Order book", bookEl),
    section("Session", sessionEl)
  );

  feed = new BinanceFeed(pair);
  depthTracker = new DepthTracker();
  let bigPrintThreshold = 0;

  const renderTape = () => {
    const recent = feed.trades.slice(-30);
    const window2000 = feed.trades.slice(-2000).map((t) => t.q).sort((a, b) => a - b);
    bigPrintThreshold = window2000[Math.floor(window2000.length * 0.99)] || Infinity;
    tapeEl.innerHTML = "";
    recent.reverse().forEach((t) => {
      const side = t.m ? "sell" : "buy";
      const big = t.q >= bigPrintThreshold;
      tapeEl.append(
        el("div", { class: `mm-tape-row mm-${side}` + (big ? " mm-big-print" : "") }, [
          el("span", {}, fmtPrice(t.p)),
          el("span", {}, t.q.toFixed(4)),
          el("span", {}, new Date(t.t).toISOString().slice(11, 19)),
        ])
      );
    });
  };

  const renderDelta = () => {
    const fp = buildFootprint(feed.trades.slice(-2000));
    if (!fp) return;
    const delta = fp.totalBuy - fp.totalSell;
    cvdEl.innerHTML = "";
    cvdEl.append(
      el("span", { class: delta >= 0 ? "mm-up" : "mm-down" }, `Delta ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`),
      el("span", {}, `  CVD(2000t) ${fp.cvd.toFixed(2)}`),
      el("span", { class: "mm-muted" }, `  buy ${fmtCompact(fp.totalBuy)} / sell ${fmtCompact(fp.totalSell)}`)
    );
    return fp;
  };

  const renderFootprint = (fp) => {
    footprintEl.innerHTML = "";
    if (!fp) return;
    const maxVol = Math.max(...fp.bins.map((b) => b.buy + b.sell), 1e-9);
    [...fp.bins].reverse().forEach((b) => {
      const w = ((b.buy + b.sell) / maxVol) * 100;
      footprintEl.append(
        el("div", { class: "mm-fp-row" }, [
          el("span", { class: "mm-fp-price" }, fmtPrice(b.price)),
          el("div", { class: "mm-fp-bar-wrap" }, [
            el("div", { class: "mm-fp-bar-buy", style: `width:${(b.buy / maxVol) * 100}%` }),
            el("div", { class: "mm-fp-bar-sell", style: `width:${(b.sell / maxVol) * 100}%` }),
          ]),
          el("span", { class: b.delta >= 0 ? "mm-up" : "mm-down" }, b.delta >= 0 ? `+${b.delta.toFixed(2)}` : b.delta.toFixed(2)),
        ])
      );
    });
    return fp;
  };

  const renderSignals = (fp) => {
    signalsEl.innerHTML = "";
    if (!fp) return;
    const imb = diagonalImbalances(fp.bins, { volumeFloor: fp.bins.reduce((s, b) => s + b.buy + b.sell, 0) / fp.bins.length * 0.1 });
    const zones = stackedZones(imb);
    const bars1m = feed.klines1m.slice(-60);
    const absorption = detectAbsorption(bars1m, bars1m.map((b) => b.c - b.o));
    const exhaustion = detectExhaustion(bars1m);
    signalsEl.append(
      el("div", {}, [
        el("b", {}, `${zones.length} stacked zone(s)`),
        list(zones, (z) => el("div", { class: `mm-signal mm-${z.type.includes("buy") ? "up" : "down"}` },
          `${z.type} ${fmtPrice(z.priceLo)}–${fmtPrice(z.priceHi)} (${z.count}x)`)),
      ]),
      el("div", {}, [
        el("b", {}, `Absorption (1m, last 60)`),
        list(absorption, (a) => el("div", { class: "mm-signal" }, `bar ${a.i}: vol ${a.volRatio.toFixed(1)}x avg, range ${a.rangeRatio.toFixed(2)}x`)),
      ]),
      el("div", {}, [
        el("b", {}, `Exhaustion (1m, last 60)`),
        list(exhaustion, (e) => el("div", { class: "mm-signal" }, `bar ${e.i}: climax ${fmtCompact(e.climaxVol)} vs avg ${fmtCompact(e.avgVol)}`)),
      ])
    );
  };

  const renderBook = () => {
    const depth = feed.depth;
    if (!depth.bids.length) return;
    const gauge = bookImbalance(depth);
    depthTracker.push(depth);
    const walls = detectWalls(depthTracker.history);
    bookEl.innerHTML = "";
    bookEl.append(
      el("div", { class: "mm-flow-status" }, [
        el("span", {}, `Bid/Ask ratio ${gauge.ratio.toFixed(2)}`),
        el("span", { class: "mm-muted" }, `  (${(gauge.bidPct * 100).toFixed(0)}% bid-weighted, top 20 levels)`),
      ]),
      el("div", {}, [
        el("b", {}, `Walls (≥8x median, held ≥5s)`),
        list(walls, (w) => el("div", { class: `mm-signal mm-${w.side === "bids" ? "up" : "down"}` },
          `${w.side} ${fmtPrice(w.price)} × ${fmtCompact(w.qty)} (${Math.round(w.persistedMs / 1000)}s)`)),
      ])
    );
  };

  const renderSession = () => {
    const n = feed.trades.length;
    const buy = feed.trades.reduce((s, t) => s + (t.m ? 0 : t.q), 0);
    const sell = feed.trades.reduce((s, t) => s + (t.m ? t.q : 0), 0);
    sessionEl.textContent = `${n} trades buffered · buy ${fmtCompact(buy)} · sell ${fmtCompact(sell)} · big-print floor ${bigPrintThreshold.toFixed(4)}`;
  };

  const tick = () => {
    renderTape();
    const fp = renderDelta();
    renderFootprint(fp);
    renderSignals(fp);
    renderBook();
    renderSession();
  };

  feed.on((kind) => {
    if (kind === "open") status.textContent = "Live — connected";
    if (kind === "close") status.textContent = "Reconnecting…";
    if (kind === "cvd_discontinuity") status.textContent += " (CVD gap marker — backfill unavailable)";
  });
  feed.start().then(() => { status.textContent = "Live — connected"; tick(); });
  updateTimer = setInterval(tick, 700);
}

// ---------- delayed assets (VSA / volume-footprint) ----------

async function mountDelayed(root, symbol) {
  root.innerHTML = "";
  const banner = gradeBanner("DELAYED 1m", "Yahoo Finance — no bid/ask split; VSA reads effort-vs-result from OHLCV");
  const status = el("div", { class: "mm-flow-status" }, "Loading…");
  const profileEl = el("div");
  const vsaEl = el("div");
  root.append(banner, status, section("Volume profile (session)", profileEl), section("Wyckoff/VSA signals", vsaEl));

  try {
    const r = await fetchChart(symbol, "5d", "15m");
    const res = r.data;
    const ts = res.timestamp || [];
    const q = res.indicators?.quote?.[0] || {};
    const bars = ts.map((t, i) => ({ t, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i] || 0 }))
      .filter((b) => b.o != null && b.h != null && b.l != null && b.c != null);
    status.textContent = `${symbol} · ${bars.length} bars (15m, 5d)`;

    const prof = sessionProfile(bars);
    profileEl.innerHTML = "";
    if (prof) {
      profileEl.append(
        el("div", { class: "mm-flow-status" }, `POC ${fmtPrice(prof.poc)} · VAH ${fmtPrice(prof.vah)} · VAL ${fmtPrice(prof.val)}`)
      );
    } else {
      profileEl.append(el("p", { class: "mm-muted" }, "Not enough session data yet."));
    }

    const atrSeries = atr(bars, 14);
    const { support, resistance } = supportResistance(bars, atrSeries);
    const stopping = vsa.stoppingVolume(bars);
    const climaxes = vsa.climax(bars);
    const noDemand = vsa.noDemandSupply(bars);
    const churn = vsa.churnAtLevel(bars, [...support, ...resistance], { atrSeries });

    vsaEl.innerHTML = "";
    vsaEl.append(
      el("div", {}, [el("b", {}, "Stopping volume / absorption"), list(stopping, (s) => el("div", { class: "mm-signal" }, `bar ${s.i}: ${s.type} vol ${s.volRatio.toFixed(1)}x`))]),
      el("div", {}, [el("b", {}, "Climax"), list(climaxes, (c) => el("div", { class: "mm-signal" }, `bar ${c.i}: ${c.type}`))]),
      el("div", {}, [el("b", {}, "No-demand / no-supply"), list(noDemand, (n) => el("div", { class: "mm-signal" }, `bar ${n.i}: ${n.type}`))]),
      el("div", {}, [el("b", {}, "Churn at S/R"), list(churn, (c) => el("div", { class: "mm-signal" }, `bar ${c.i}: vol ${c.volRatio.toFixed(1)}x at level`))])
    );
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
  }
}

// ---------- mount/unmount ----------

async function render(root) {
  const symbol = get("symbol");
  const pair = binancePair(symbol);
  if (pair) mountCrypto(root, symbol, pair);
  else await mountDelayed(root, symbol);
}

export function mount(root) {
  root.innerHTML = "";
  const wrap = el("div", { class: "mm-view mm-view-flow" });
  root.append(wrap);
  render(wrap);
  unsubs.push(on("symbol", () => { cleanup(); render(wrap); }));
}

function cleanup() {
  clearInterval(updateTimer);
  updateTimer = null;
  feed?.stop();
  feed = null;
  depthTracker = null;
}

export function unmount() {
  unsubs.forEach((fn) => fn());
  unsubs = [];
  cleanup();
}
