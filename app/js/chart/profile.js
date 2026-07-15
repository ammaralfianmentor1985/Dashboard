// Volume profile: distributes each bar's volume across an evenly split
// high-low range into price bins, then finds POC (point of control, the bin
// with the most volume) and the value area containing 70% of total volume
// (VAH/VAL = its top/bottom edges), expanding outward from POC bin-by-bin.
export function buildProfile(bars, { bins = 24, valueAreaPct = 0.7 } = {}) {
  if (!bars.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (const b of bars) { if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
  if (!Number.isFinite(lo) || hi <= lo) return null;
  const binSize = (hi - lo) / bins;
  const vol = new Array(bins).fill(0);

  for (const b of bars) {
    const range = b.h - b.l || binSize;
    const startBin = Math.max(0, Math.floor((b.l - lo) / binSize));
    const endBin = Math.min(bins - 1, Math.floor((b.h - lo) / binSize));
    const span = Math.max(1, endBin - startBin + 1);
    const perBin = (b.v || 0) / span;
    for (let k = startBin; k <= endBin; k++) vol[k] += perBin;
  }

  let pocIdx = 0;
  for (let i = 1; i < bins; i++) if (vol[i] > vol[pocIdx]) pocIdx = i;
  const total = vol.reduce((a, c) => a + c, 0);
  const target = total * valueAreaPct;

  let acc = vol[pocIdx];
  let loIdx = pocIdx, hiIdx = pocIdx;
  while (acc < target && (loIdx > 0 || hiIdx < bins - 1)) {
    const below = loIdx > 0 ? vol[loIdx - 1] : -1;
    const above = hiIdx < bins - 1 ? vol[hiIdx + 1] : -1;
    if (above >= below) { hiIdx++; acc += vol[hiIdx]; }
    else { loIdx--; acc += vol[loIdx]; }
  }

  const priceAt = (binIdx) => lo + binIdx * binSize;
  return {
    bins,
    binSize,
    lo,
    hi,
    vol,
    poc: priceAt(pocIdx) + binSize / 2,
    vah: priceAt(hiIdx + 1),
    val: priceAt(loIdx),
    total,
  };
}

// Session profile = last N bars belonging to the most recent calendar day (UTC).
export function sessionProfile(bars, opts) {
  if (!bars.length) return null;
  const lastDay = new Date(bars.at(-1).t * 1000).toISOString().slice(0, 10);
  const session = bars.filter((b) => new Date(b.t * 1000).toISOString().slice(0, 10) === lastDay);
  return buildProfile(session.length ? session : bars, opts);
}
