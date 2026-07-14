// Custom canvas chart engine — no chart library.
// Two stacked canvases per pane: main (candles+volume, redrawn on data/zoom/pan)
// and overlay (crosshair, redrawn on pointer move only) so crosshair moves never
// trigger a full candle re-render.
import { clamp } from "../util.js";

const PAD = { top: 10, right: 54, bottom: 22, left: 0 };
const VOL_FRACTION = 0.18;

export class ChartEngine {
  constructor(container) {
    this.container = container;
    this.bars = []; // {t, o, h, l, c, v}
    this.chartType = "candles";
    this.visStart = 0; // index of first visible bar
    this.visCount = 120; // bars visible
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.overlays = []; // functions(ctx, scaleX, scaleY) for indicator lines
    this._buildDom();
    this._bindGestures();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.container);
    this._resize();
  }

  _buildDom() {
    this.container.classList.add("mm-chart");
    this.main = document.createElement("canvas");
    this.overlay = document.createElement("canvas");
    this.main.className = "mm-chart-main";
    this.overlay.className = "mm-chart-overlay";
    this.container.append(this.main, this.overlay);
    this.mctx = this.main.getContext("2d");
    this.octx = this.overlay.getContext("2d");
  }

  destroy() {
    this._ro.disconnect();
    this.container.innerHTML = "";
  }

  setBars(bars) {
    this.bars = bars;
    this.visCount = Math.min(this.visCount, bars.length) || 1;
    this.visStart = Math.max(0, bars.length - this.visCount);
    this.render();
  }

  appendOrUpdateLastBar(bar) {
    const last = this.bars[this.bars.length - 1];
    if (last && last.t === bar.t) this.bars[this.bars.length - 1] = bar;
    else this.bars.push(bar);
    if (this.visStart + this.visCount >= this.bars.length - 1) {
      this.visStart = Math.max(0, this.bars.length - this.visCount);
    }
    this.render();
  }

  setChartType(type) {
    this.chartType = type;
    this.render();
  }

  _resize() {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    for (const cv of [this.main, this.overlay]) {
      cv.width = w * this.dpr;
      cv.height = h * this.dpr;
      cv.style.width = w + "px";
      cv.style.height = h + "px";
    }
    this.w = w;
    this.h = h;
    this.render();
  }

  _visible() {
    const start = clamp(this.visStart, 0, Math.max(0, this.bars.length - 1));
    const count = clamp(this.visCount, 5, this.bars.length || 5);
    const end = Math.min(this.bars.length, start + count);
    return this.bars.slice(start, end);
  }

  _scales(visible) {
    const plotW = this.w - PAD.left - PAD.right;
    const volH = (this.h - PAD.top - PAD.bottom) * VOL_FRACTION;
    const priceH = this.h - PAD.top - PAD.bottom - volH - 4;
    let lo = Infinity, hi = -Infinity, volMax = 0;
    for (const b of visible) {
      if (b.l < lo) lo = b.l;
      if (b.h > hi) hi = b.h;
      if (b.v > volMax) volMax = b.v;
    }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    const padY = (hi - lo) * 0.08 || 1;
    lo -= padY; hi += padY;
    const n = Math.max(1, visible.length);
    const slot = plotW / n;
    const x = (i) => PAD.left + i * slot + slot / 2;
    const y = (price) => PAD.top + priceH * (1 - (price - lo) / (hi - lo || 1));
    const yVol = (vol) => PAD.top + priceH + 4 + volH * (1 - (vol / (volMax || 1)));
    return { x, y, yVol, slot, lo, hi, volMax, priceH, volH };
  }

  indexAtX(px) {
    const visible = this._visible();
    const plotW = this.w - PAD.left - PAD.right;
    const slot = plotW / Math.max(1, visible.length);
    const i = Math.floor((px - PAD.left) / slot);
    return clamp(i, 0, visible.length - 1);
  }

  pan(deltaBars) {
    this.visStart = clamp(Math.round(this.visStart + deltaBars), 0, Math.max(0, this.bars.length - this.visCount));
    this.render();
  }

  zoom(factor, anchorIdx) {
    const oldCount = this.visCount;
    const newCount = clamp(Math.round(oldCount / factor), 15, Math.min(2000, this.bars.length || 2000));
    const anchorRatio = oldCount ? (anchorIdx - this.visStart) / oldCount : 0.5;
    this.visCount = newCount;
    this.visStart = clamp(Math.round(anchorIdx - anchorRatio * newCount), 0, Math.max(0, this.bars.length - newCount));
    this.render();
  }

  _bindGestures() {
    let dragging = false, lastX = 0, lastDist = null, lastMidIdx = 0;
    const pointers = new Map();

    const toLocal = (e) => {
      const r = this.overlay.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    this.overlay.addEventListener("pointerdown", (e) => {
      this.overlay.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, toLocal(e));
      dragging = true;
      lastX = toLocal(e).x;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        lastDist = Math.hypot(a.x - b.x, a.y - b.y);
        lastMidIdx = this.indexAtX((a.x + b.x) / 2);
      }
    });

    this.overlay.addEventListener("pointermove", (e) => {
      const p = toLocal(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastDist) this.zoom(dist / lastDist, lastMidIdx);
        lastDist = dist;
        return;
      }
      if (dragging && pointers.size === 1) {
        const dx = p.x - lastX;
        const slot = (this.w - PAD.left - PAD.right) / Math.max(1, this.visCount);
        if (Math.abs(dx) >= slot * 0.5) {
          this.pan(-Math.sign(dx) * Math.max(1, Math.round(Math.abs(dx) / slot)));
          lastX = p.x;
        }
      }
      this._drawCrosshair(p.x, p.y);
    });

    const end = (e) => {
      pointers.delete(e.pointerId);
      dragging = pointers.size > 0;
      lastDist = null;
    };
    this.overlay.addEventListener("pointerup", end);
    this.overlay.addEventListener("pointercancel", end);
    this.overlay.addEventListener("pointerleave", () => {
      this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    });

    this.overlay.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const p = toLocal(e);
        const idx = this.visStart + this.indexAtX(p.x);
        this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, idx);
      },
      { passive: false }
    );
  }

  _drawCrosshair(px, py) {
    const ctx = this.octx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.w, this.h);
    const visible = this._visible();
    if (!visible.length) { ctx.restore(); return; }
    const idx = this.indexAtX(px);
    const bar = visible[idx];
    if (!bar) { ctx.restore(); return; }
    const { x, y } = this._scales(visible);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x(idx), PAD.top);
    ctx.lineTo(x(idx), this.h - PAD.bottom);
    ctx.moveTo(PAD.left, py);
    ctx.lineTo(this.w - PAD.right, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#e6e6e6";
    ctx.font = "11px system-ui, sans-serif";
    const d = new Date(bar.t * 1000);
    ctx.fillText(d.toISOString().slice(0, 16).replace("T", " "), 6, this.h - 6);
    ctx.textAlign = "right";
    ctx.fillText(y === undefined ? "" : "", 0, 0);
    ctx.restore();
    if (this.onHover) this.onHover(bar, idx);
  }

  render() {
    const ctx = this.mctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = "#0b0e14";
    ctx.fillRect(0, 0, this.w, this.h);
    const visible = this._visible();
    if (!visible.length) { ctx.restore(); return; }
    const s = this._scales(visible);

    // grid + price axis
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "10px system-ui, sans-serif";
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const price = s.lo + ((s.hi - s.lo) * i) / gridLines;
      const py = s.y(price);
      ctx.beginPath();
      ctx.moveTo(PAD.left, py);
      ctx.lineTo(this.w - PAD.right, py);
      ctx.stroke();
      ctx.fillText(price.toFixed(price < 10 ? 4 : 2), this.w - PAD.right + 4, py + 3);
    }

    // volume
    ctx.fillStyle = "rgba(120,140,180,0.35)";
    visible.forEach((b, i) => {
      const bw = Math.max(1, s.slot * 0.7);
      const vy = s.yVol(b.v || 0);
      ctx.fillRect(s.x(i) - bw / 2, vy, bw, PAD.top + s.priceH + 4 + s.volH - vy);
    });

    // price series
    if (this.chartType === "line") {
      ctx.strokeStyle = "#4da3ff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      visible.forEach((b, i) => {
        const px = s.x(i), py = s.y(b.c);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.stroke();
    } else {
      const heikin = this.chartType === "heikinashi";
      let prevHA = null;
      visible.forEach((raw, i) => {
        let b = raw;
        if (heikin) {
          const c = (raw.o + raw.h + raw.l + raw.c) / 4;
          const o = prevHA ? (prevHA.o + prevHA.c) / 2 : (raw.o + raw.c) / 2;
          const h = Math.max(raw.h, o, c);
          const l = Math.min(raw.l, o, c);
          b = { o, h, l, c };
          prevHA = b;
        }
        const up = b.c >= b.o;
        ctx.strokeStyle = ctx.fillStyle = up ? "#26a69a" : "#ef5350";
        const bw = Math.max(1, s.slot * 0.62);
        const px = s.x(i);
        ctx.beginPath();
        ctx.moveTo(px, s.y(b.h));
        ctx.lineTo(px, s.y(b.l));
        ctx.stroke();
        const top = s.y(Math.max(b.o, b.c));
        const bot = s.y(Math.min(b.o, b.c));
        ctx.fillRect(px - bw / 2, top, bw, Math.max(1, bot - top));
      });
    }

    for (const fn of this.overlays) fn(ctx, s, visible);
    ctx.restore();
  }
}
