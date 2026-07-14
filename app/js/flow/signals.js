// Signal detectors operating on a footprint's price bins (crypto tick data)
// or on OHLCV volume-footprint bins (delayed assets) — same shape either way:
// [{price, buy, sell, delta}, ...] ordered low->high price.

// Diagonal 3:1 imbalance: bin[i] buy vs bin[i-1] sell (classic footprint
// diagonal read — an aggressive buyer absorbing the level below's offers).
// volumeFloor filters noise on thin bins.
export function diagonalImbalances(bins, { ratio = 3, volumeFloor = 0 } = {}) {
  const out = [];
  for (let i = 1; i < bins.length; i++) {
    const buyAbove = bins[i].buy;
    const sellBelow = bins[i - 1].sell;
    if (buyAbove >= volumeFloor && sellBelow > 0 && buyAbove / sellBelow >= ratio) {
      out.push({ i, type: "buy_imbalance", price: bins[i].price, ratio: buyAbove / sellBelow });
    }
    const sellAbove = bins[i].sell;
    const buyBelow = bins[i - 1].buy;
    if (sellAbove >= volumeFloor && buyBelow > 0 && sellAbove / buyBelow >= ratio) {
      out.push({ i, type: "sell_imbalance", price: bins[i].price, ratio: sellAbove / buyBelow });
    }
  }
  return out;
}

// Stacked zones: >=3 consecutive same-type imbalances -> a supply/demand zone.
// Invalidated (caller's job) once price closes beyond the zone.
export function stackedZones(imbalances, minStack = 3) {
  const zones = [];
  let run = [];
  const flushRun = () => {
    if (run.length >= minStack) {
      zones.push({
        type: run[0].type,
        priceLo: Math.min(...run.map((r) => r.price)),
        priceHi: Math.max(...run.map((r) => r.price)),
        count: run.length,
      });
    }
    run = [];
  };
  const sorted = [...imbalances].sort((a, b) => a.i - b.i);
  for (let k = 0; k < sorted.length; k++) {
    if (run.length && (sorted[k].i !== run.at(-1).i + 1 || sorted[k].type !== run[0].type)) flushRun();
    run.push(sorted[k]);
  }
  flushRun();
  return zones;
}

// Absorption (a candle/bar): high volume, narrow range, delta fighting the
// close direction — someone is absorbing aggression without price moving.
export function detectAbsorption(bars, deltas, { volMult = 1.5, rangeMult = 0.6, lookback = 20 } = {}) {
  const out = [];
  for (let i = lookback; i < bars.length; i++) {
    const win = bars.slice(i - lookback, i);
    const avgVol = win.reduce((s, b) => s + b.v, 0) / win.length;
    const avgRange = win.reduce((s, b) => s + (b.h - b.l), 0) / win.length;
    const b = bars[i];
    const range = b.h - b.l;
    const delta = deltas?.[i] ?? (b.c - b.o);
    const closeUp = b.c >= b.o;
    if (b.v >= avgVol * volMult && range <= avgRange * rangeMult) {
      const deltaAgainst = (closeUp && delta < 0) || (!closeUp && delta > 0);
      if (deltaAgainst || range <= avgRange * (rangeMult * 0.7)) {
        out.push({ i, t: b.t, volRatio: b.v / avgVol, rangeRatio: range / avgRange });
      }
    }
  }
  return out;
}

// Exhaustion: a climax-volume bar followed by rapid volume taper (trend running out of participants).
export function detectExhaustion(bars, { climaxMult = 2, taperBars = 3, taperMult = 0.5, lookback = 20 } = {}) {
  const out = [];
  for (let i = lookback; i < bars.length - taperBars; i++) {
    const win = bars.slice(i - lookback, i);
    const avgVol = win.reduce((s, b) => s + b.v, 0) / win.length;
    if (bars[i].v < avgVol * climaxMult) continue;
    const after = bars.slice(i + 1, i + 1 + taperBars);
    const taperedAll = after.every((b) => b.v < bars[i].v * taperMult);
    if (taperedAll) out.push({ i, t: bars[i].t, climaxVol: bars[i].v, avgVol });
  }
  return out;
}

// Top-of-book imbalance gauge: ratio of total bid qty to ask qty in the depth snapshot.
export function bookImbalance(depth) {
  const bidQty = depth.bids.reduce((s, [, q]) => s + q, 0);
  const askQty = depth.asks.reduce((s, [, q]) => s + q, 0);
  const total = bidQty + askQty || 1;
  return { bidQty, askQty, ratio: bidQty / (askQty || 1e-9), bidPct: bidQty / total };
}

// Wall detection: a depth level whose size is >= wallMult * median level size
// on its side, held across >=minPersistMs of snapshots (caller tracks history).
export function detectWalls(depthHistory, { wallMult = 8, minPersistMs = 5000 } = {}) {
  if (!depthHistory.length) return [];
  const latest = depthHistory.at(-1);
  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] || 0;
  };
  const findWalls = (side) => {
    const qtys = latest.depth[side].map(([, q]) => q);
    const med = median(qtys) || 1e-9;
    return latest.depth[side]
      .filter(([, q]) => q >= med * wallMult)
      .map(([price, q]) => {
        const firstSeenAt = [...depthHistory].reverse().find((snap) =>
          !snap.depth[side].some(([p2, q2]) => p2 === price && q2 >= med * wallMult)
        );
        const persistedMs = firstSeenAt ? latest.at - firstSeenAt.at : latest.at - depthHistory[0].at;
        return { side, price, qty: q, persistedMs, pulled: false };
      })
      .filter((w) => w.persistedMs >= minPersistMs);
  };
  return [...findWalls("bids"), ...findWalls("asks")];
}
