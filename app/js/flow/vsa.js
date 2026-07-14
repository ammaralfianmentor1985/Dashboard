// Wyckoff/VSA (Volume Spread Analysis) for assets with no true tick data —
// stocks, FX, gold, commodities, indices via delayed Yahoo OHLCV. These read
// "effort vs result": does volume (effort) match the range/close (result)?
// Honest limitation: no bid/ask split, so direction is inferred from close
// position within the bar, not real aggressor flow.

function windowStats(bars, i, lookback) {
  const win = bars.slice(Math.max(0, i - lookback), i);
  const avgVol = win.reduce((s, b) => s + b.v, 0) / (win.length || 1);
  const avgRange = win.reduce((s, b) => s + (b.h - b.l), 0) / (win.length || 1);
  return { avgVol, avgRange };
}

// Stopping volume / absorption: high effort (volume), poor result (narrow
// range or close pushed back off the extreme) — someone big is absorbing.
export function stoppingVolume(bars, { volMult = 1.5, lookback = 20 } = {}) {
  const out = [];
  for (let i = lookback; i < bars.length; i++) {
    const b = bars[i];
    const { avgVol, avgRange } = windowStats(bars, i, lookback);
    if (avgVol <= 0) continue;
    const range = b.h - b.l || 1e-9;
    const closePos = (b.c - b.l) / range; // 0 = closed at low, 1 = closed at high
    const highEffort = b.v >= avgVol * volMult;
    const narrowResult = range <= avgRange * 0.7;
    const rejectedExtreme = closePos > 0.7 || closePos < 0.3;
    if (highEffort && (narrowResult || rejectedExtreme)) {
      out.push({ i, t: b.t, volRatio: b.v / avgVol, closePos, type: closePos > 0.5 ? "buying_stop" : "selling_stop" });
    }
  }
  return out;
}

// Buying/selling climax: extreme volume after an extended directional run —
// last gasp of a trend.
export function climax(bars, { volMult = 2.2, runLen = 5, lookback = 20 } = {}) {
  const out = [];
  for (let i = lookback + runLen; i < bars.length; i++) {
    const { avgVol } = windowStats(bars, i, lookback);
    if (avgVol <= 0 || bars[i].v < avgVol * volMult) continue;
    const run = bars.slice(i - runLen, i + 1);
    const up = run.every((b, k) => k === 0 || b.c >= run[k - 1].c);
    const down = run.every((b, k) => k === 0 || b.c <= run[k - 1].c);
    if (up) out.push({ i, t: bars[i].t, type: "buying_climax" });
    else if (down) out.push({ i, t: bars[i].t, type: "selling_climax" });
  }
  return out;
}

// No-demand / no-supply: a narrow-range up (or down) bar on volume LOWER than
// the prior two bars — the move isn't backed by participation.
export function noDemandSupply(bars, { lookback = 20 } = {}) {
  const out = [];
  for (let i = 2; i < bars.length; i++) {
    const b = bars[i], p1 = bars[i - 1], p2 = bars[i - 2];
    const { avgRange } = windowStats(bars, i, lookback);
    const range = b.h - b.l;
    const narrow = range <= avgRange * 0.8;
    const lowVol = b.v < p1.v && b.v < p2.v;
    if (!narrow || !lowVol) continue;
    if (b.c >= b.o) out.push({ i, t: b.t, type: "no_demand" });
    else out.push({ i, t: b.t, type: "no_supply" });
  }
  return out;
}

// High-volume "churn": elevated volume with little net price progress at/near
// an existing S/R level — supply/demand fighting it out at a decision point.
export function churnAtLevel(bars, srLevels, { volMult = 1.4, lookback = 20, proximityAtrMult = 0.5, atrSeries } = {}) {
  const out = [];
  const levels = srLevels.map((l) => l.price);
  for (let i = lookback; i < bars.length; i++) {
    const { avgVol } = windowStats(bars, i, lookback);
    const b = bars[i];
    if (avgVol <= 0 || b.v < avgVol * volMult) continue;
    const atr = atrSeries?.[i] ?? (b.h - b.l);
    const near = levels.some((lvl) => Math.abs(b.c - lvl) <= atr * proximityAtrMult);
    const netProgress = Math.abs(b.c - b.o) / (b.h - b.l || 1e-9);
    if (near && netProgress < 0.35) out.push({ i, t: b.t, volRatio: b.v / avgVol });
  }
  return out;
}

// Volume-at-price footprint built from a coarser bar's own real volume — honest
// label: this is total volume distribution, not a bid/ask split. Used for
// delayed-asset "footprint" panels (real for any volume-bearing symbol).
export function volumeFootprintFromBar(bar, subBinCount = 5) {
  const binSize = (bar.h - bar.l) / subBinCount || 1e-9;
  // Approximate the intrabar distribution as triangular, peaking toward the close.
  const closePos = (bar.c - bar.l) / (bar.h - bar.l || 1e-9);
  const bins = [];
  for (let k = 0; k < subBinCount; k++) {
    const mid = (k + 0.5) / subBinCount;
    const weight = 1 - Math.abs(mid - closePos);
    bins.push({ price: bar.l + (k + 0.5) * binSize, weight });
  }
  const totalW = bins.reduce((s, b) => s + b.weight, 0) || 1;
  return bins.map((b) => ({ price: b.price, vol: (b.weight / totalW) * bar.v }));
}
