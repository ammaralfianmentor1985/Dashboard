// Pure functions: bars -> aligned indicator series. Each returns an array the
// same length as bars, with nulls before the indicator has enough data (so
// index i always lines up with bars[i]).

export function sma(bars, period, field = "c") {
  const out = new Array(bars.length).fill(null);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i][field];
    if (i >= period) sum -= bars[i - period][field];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(bars, period, field = "c") {
  const out = new Array(bars.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < bars.length; i++) {
    const v = bars[i][field];
    if (prev === null) {
      if (i === period - 1) {
        // seed with SMA of first `period` values
        let sum = 0;
        for (let j = 0; j <= i; j++) sum += bars[j][field];
        prev = sum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function vwap(bars) {
  // Resets each UTC session (per-day) — standard intraday VWAP behavior.
  const out = new Array(bars.length).fill(null);
  let cumPV = 0, cumV = 0, curDay = null;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const day = new Date(b.t * 1000).toISOString().slice(0, 10);
    if (day !== curDay) { curDay = day; cumPV = 0; cumV = 0; }
    const typical = (b.h + b.l + b.c) / 3;
    cumPV += typical * (b.v || 0);
    cumV += b.v || 0;
    out[i] = cumV > 0 ? cumPV / cumV : b.c;
  }
  return out;
}

export function bollinger(bars, period = 20, mult = 2, field = "c") {
  const mid = sma(bars, period, field);
  const upper = new Array(bars.length).fill(null);
  const lower = new Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i++) {
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (bars[j][field] - mid[i]) ** 2;
    const sd = Math.sqrt(sumSq / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { mid, upper, lower };
}

export function rsi(bars, period = 14) {
  const out = new Array(bars.length).fill(null);
  if (bars.length < period + 1) return out;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const d = bars[i].c - bars[i - 1].c;
    if (d >= 0) gainSum += d; else lossSum -= d;
  }
  let avgGain = gainSum / period, avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < bars.length; i++) {
    const d = bars[i].c - bars[i - 1].c;
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(bars, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = ema(bars, fast);
  const emaSlow = ema(bars, slow);
  const line = bars.map((_, i) => (emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null));
  // signal = EMA of line, computed over the non-null tail
  const signal = new Array(bars.length).fill(null);
  const firstIdx = line.findIndex((v) => v !== null);
  if (firstIdx === -1) return { line, signal, hist: signal };
  const k = 2 / (signalPeriod + 1);
  let prev = null;
  for (let i = firstIdx; i < bars.length; i++) {
    if (prev === null) {
      if (i - firstIdx === signalPeriod - 1) {
        let sum = 0;
        for (let j = firstIdx; j <= i; j++) sum += line[j];
        prev = sum / signalPeriod;
        signal[i] = prev;
      }
      continue;
    }
    prev = line[i] * k + prev * (1 - k);
    signal[i] = prev;
  }
  const hist = bars.map((_, i) => (line[i] != null && signal[i] != null ? line[i] - signal[i] : null));
  return { line, signal, hist };
}

export function atr(bars, period = 14) {
  const out = new Array(bars.length).fill(null);
  const tr = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { tr[i] = bars[i].h - bars[i].l; continue; }
    tr[i] = Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c)
    );
  }
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += tr[i];
    if (i >= period) sum -= tr[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// Fractal pivots (5-bar: high/low strictly greater/less than 2 neighbors each side),
// clustered within 0.3*ATR of each other into single S/R levels.
export function supportResistance(bars, atrSeries) {
  const highs = [], lows = [];
  for (let i = 2; i < bars.length - 2; i++) {
    const b = bars[i];
    if (b.h > bars[i - 1].h && b.h > bars[i - 2].h && b.h > bars[i + 1].h && b.h > bars[i + 2].h) highs.push({ i, price: b.h });
    if (b.l < bars[i - 1].l && b.l < bars[i - 2].l && b.l < bars[i + 1].l && b.l < bars[i + 2].l) lows.push({ i, price: b.l });
  }
  const lastAtr = [...atrSeries].reverse().find((v) => v != null) || (bars.at(-1).h - bars.at(-1).l);
  const cluster = (points) => {
    const sorted = [...points].sort((a, b) => a.price - b.price);
    const groups = [];
    for (const p of sorted) {
      const g = groups.at(-1);
      if (g && p.price - g.avg <= 0.3 * lastAtr) {
        g.points.push(p);
        g.avg = g.points.reduce((s, x) => s + x.price, 0) / g.points.length;
      } else {
        groups.push({ points: [p], avg: p.price });
      }
    }
    return groups.map((g) => ({ price: g.avg, strength: g.points.length, lastIdx: Math.max(...g.points.map((p) => p.i)) }));
  };
  return { resistance: cluster(highs), support: cluster(lows) };
}
