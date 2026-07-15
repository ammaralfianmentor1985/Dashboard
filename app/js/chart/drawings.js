// Drawing tools: hline, trendline, fib, rect. Persisted per-symbol in localStorage
// (protected namespace — never evicted by the data LRU cache).
const KEY = (symbol) => `mm.drawings.${symbol}`;

export function load(symbol) {
  try {
    const raw = localStorage.getItem(KEY(symbol));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function save(symbol, drawings) {
  try {
    localStorage.setItem(KEY(symbol), JSON.stringify(drawings));
  } catch {
    // quota exceeded — silently drop, drawings are not critical data
  }
}

export function addPoint(pending, type, point) {
  const needed = type === "hline" ? 1 : 2;
  const points = [...(pending?.points || []), point];
  if (points.length < needed) return { pending: { type, points }, done: null };
  return { pending: null, done: { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, points } };
}

// Maps a bar's absolute index (within engine.bars) to its x pixel using the
// engine's current visible-window scale; returns null if off-screen.
function idxToX(scale, engine, absIdx) {
  const rel = absIdx - engine.visStart;
  if (rel < 0 || rel >= engine._visible().length) return null;
  return scale.x(rel);
}

function nearestIdx(engine, t) {
  const bars = engine.bars;
  let lo = 0, hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].t < t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

export function render(ctx, scale, engine, drawings) {
  ctx.save();
  ctx.lineWidth = 1.5;
  for (const d of drawings) {
    ctx.strokeStyle = d.color || "#f0b90b";
    ctx.fillStyle = (d.color || "#f0b90b") + "22";
    if (d.type === "hline") {
      const py = scale.y(d.points[0].price);
      ctx.beginPath();
      ctx.setLineDash([5, 4]);
      ctx.moveTo(0, py);
      ctx.lineTo(engine.w, py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = d.color || "#f0b90b";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(d.points[0].price.toFixed(4), 4, py - 3);
      continue;
    }
    const [p1, p2] = d.points;
    const x1 = idxToX(scale, engine, nearestIdx(engine, p1.t));
    const x2 = idxToX(scale, engine, nearestIdx(engine, p2.t));
    const y1 = scale.y(p1.price);
    const y2 = scale.y(p2.price);
    if (x1 == null && x2 == null) continue;
    const ax1 = x1 ?? 0, ax2 = x2 ?? engine.w;
    if (d.type === "trendline") {
      ctx.beginPath();
      ctx.moveTo(ax1, y1);
      ctx.lineTo(ax2, y2);
      ctx.stroke();
    } else if (d.type === "rect") {
      ctx.fillRect(Math.min(ax1, ax2), Math.min(y1, y2), Math.abs(ax2 - ax1), Math.abs(y2 - y1));
      ctx.strokeRect(Math.min(ax1, ax2), Math.min(y1, y2), Math.abs(ax2 - ax1), Math.abs(y2 - y1));
    } else if (d.type === "fib") {
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const top = Math.min(p1.price, p2.price), bot = Math.max(p1.price, p2.price);
      const left = Math.min(ax1, ax2), right = Math.max(ax1, ax2);
      ctx.font = "10px system-ui, sans-serif";
      for (const lvl of levels) {
        const price = bot - (bot - top) * lvl;
        const py = scale.y(price);
        ctx.beginPath();
        ctx.setLineDash([2, 3]);
        ctx.moveTo(left, py);
        ctx.lineTo(right, py);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillText(`${(lvl * 100).toFixed(1)}%  ${price.toFixed(4)}`, left + 4, py - 2);
      }
    }
  }
  ctx.restore();
}
