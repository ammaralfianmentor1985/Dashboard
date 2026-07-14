// Bid/ask footprint from raw trades. Binance aggTrade `m` (isBuyerMaker):
// true  -> buyer was the resting maker, seller was the aggressor -> SELL aggression (hits bid)
// false -> seller was the resting maker, buyer was the aggressor -> BUY aggression (lifts offer)
export function tradeSide(trade) {
  return trade.m ? "sell" : "buy";
}

// Groups trades into `binCount` adaptive price bins across [lo,hi] (defaults to
// the trade set's own range), returning per-bin buy/sell volume + delta, plus
// running CVD (cumulative volume delta) sampled at each trade.
export function buildFootprint(trades, { binCount = 20 } = {}) {
  if (!trades.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (const t of trades) { if (t.p < lo) lo = t.p; if (t.p > hi) hi = t.p; }
  if (hi <= lo) hi = lo + lo * 0.0001 || 1;
  const binSize = (hi - lo) / binCount;
  const bins = Array.from({ length: binCount }, () => ({ buy: 0, sell: 0 }));

  let cvd = 0;
  const cvdSeries = new Array(trades.length);
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const side = tradeSide(t);
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((t.p - lo) / binSize)));
    bins[idx][side] += t.q;
    cvd += side === "buy" ? t.q : -t.q;
    cvdSeries[i] = cvd;
  }

  return {
    lo, hi, binSize, binCount,
    bins: bins.map((b, i) => ({ price: lo + (i + 0.5) * binSize, buy: b.buy, sell: b.sell, delta: b.buy - b.sell })),
    cvd,
    cvdSeries,
    totalBuy: bins.reduce((s, b) => s + b.buy, 0),
    totalSell: bins.reduce((s, b) => s + b.sell, 0),
  };
}

// Per-kline footprint: for each closed 1m kline in range, bucket the trades
// that fall inside its [t, t+60000) window into a mini buy/sell split.
export function footprintByBar(trades, bars, barMs = 60000) {
  const out = bars.map((b) => ({ t: b.t, buy: 0, sell: 0 }));
  if (!bars.length) return out;
  const startMs = bars[0].t;
  for (const t of trades) {
    const idx = Math.floor((t.t - startMs) / barMs);
    if (idx < 0 || idx >= out.length) continue;
    const side = tradeSide(t);
    out[idx][side] += t.q;
  }
  return out;
}
