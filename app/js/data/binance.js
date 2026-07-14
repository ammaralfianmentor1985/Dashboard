// Live crypto data — Binance public WS/REST, no key required, browser-direct
// (zero Netlify function calls). Combined stream: aggTrade + partial depth (20
// levels @100ms) + 1m klines. Auto-reconnect with jittered backoff; ring
// buffers cap memory; REST aggTrades backfill closes any gap after a
// reconnect or app-backgrounded pause so CVD stays continuous (with an
// explicit discontinuity marker if the gap can't be backfilled).

const REST = "https://api.binance.com";
const WS_BASE = "wss://stream.binance.com:9443/stream?streams=";
const MAX_TRADES = 20000;
const BACKGROUND_CLOSE_MS = 20000;

export class BinanceFeed {
  constructor(symbol) {
    this.symbol = symbol.toLowerCase(); // e.g. "btcusdt"
    this.trades = []; // {id, t, p, q, m} m=true -> buyer is maker (sell aggression)
    this.depth = { bids: [], asks: [] };
    this.klines1m = []; // {t,o,h,l,c,v}
    this.lastTradeId = null;
    this.ws = null;
    this.reconnectAttempt = 0;
    this.closed = false;
    this.listeners = new Set();
    this._bgTimer = null;
    this._bindVisibility();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  _emit(kind, payload) {
    for (const fn of this.listeners) fn(kind, payload);
  }

  async start() {
    this.closed = false;
    await this._seed();
    this._connect();
  }

  stop() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }

  async _seed() {
    try {
      const [tradesRes, klinesRes, depthRes] = await Promise.all([
        fetch(`${REST}/api/v3/trades?symbol=${this.symbol.toUpperCase()}&limit=500`).then((r) => r.json()),
        fetch(`${REST}/api/v3/klines?symbol=${this.symbol.toUpperCase()}&interval=1m&limit=300`).then((r) => r.json()),
        fetch(`${REST}/api/v3/depth?symbol=${this.symbol.toUpperCase()}&limit=20`).then((r) => r.json()),
      ]);
      this.trades = tradesRes.map((t) => ({ id: t.id, t: t.time, p: +t.price, q: +t.qty, m: t.isBuyerMaker }));
      this.lastTradeId = this.trades.at(-1)?.id ?? null;
      this.klines1m = klinesRes.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
      this.depth = {
        bids: depthRes.bids.map(([p, q]) => [+p, +q]),
        asks: depthRes.asks.map(([p, q]) => [+p, +q]),
      };
      this._emit("seed", { trades: this.trades, klines: this.klines1m, depth: this.depth });
    } catch (e) {
      this._emit("error", { phase: "seed", message: e.message });
    }
  }

  async _backfillGap() {
    if (this.lastTradeId == null) return;
    try {
      const r = await fetch(
        `${REST}/api/v3/historicalTrades?symbol=${this.symbol.toUpperCase()}&fromId=${this.lastTradeId + 1}&limit=1000`
      );
      if (!r.ok) throw new Error("historicalTrades unavailable (needs API key on some deployments)");
      const rows = await r.json();
      const fresh = rows.map((t) => ({ id: t.id, t: t.time, p: +t.price, q: +t.qty, m: t.isBuyerMaker }));
      this._appendTrades(fresh);
      this._emit("backfill", { count: fresh.length });
    } catch (e) {
      // Can't backfill (endpoint often geo/key-gated) — mark a discontinuity so
      // CVD readers know not to trust a continuous line across this point.
      this._emit("cvd_discontinuity", { at: Date.now(), reason: e.message });
    }
  }

  _appendTrades(fresh) {
    for (const t of fresh) this.trades.push(t);
    if (this.trades.length > MAX_TRADES) this.trades.splice(0, this.trades.length - MAX_TRADES);
    this.lastTradeId = this.trades.at(-1)?.id ?? this.lastTradeId;
  }

  _connect() {
    if (this.closed) return;
    const streams = [`${this.symbol}@aggTrade`, `${this.symbol}@depth20@100ms`, `${this.symbol}@kline_1m`].join("/");
    const ws = new WebSocket(WS_BASE + streams);
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this._emit("open", {});
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      const { stream, data } = msg;
      if (!stream) return;
      if (stream.endsWith("@aggTrade")) {
        const t = { id: data.a, t: data.T, p: +data.p, q: +data.q, m: data.m };
        this.trades.push(t);
        if (this.trades.length > MAX_TRADES) this.trades.shift();
        this.lastTradeId = t.id;
        this._emit("trade", t);
      } else if (stream.includes("@depth20")) {
        this.depth = {
          bids: data.bids.map(([p, q]) => [+p, +q]),
          asks: data.asks.map(([p, q]) => [+p, +q]),
        };
        this._emit("depth", this.depth);
      } else if (stream.endsWith("@kline_1m")) {
        const k = data.k;
        const bar = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
        const last = this.klines1m.at(-1);
        if (last && last.t === bar.t) this.klines1m[this.klines1m.length - 1] = bar;
        else this.klines1m.push(bar);
        if (this.klines1m.length > 1500) this.klines1m.shift();
        this._emit("kline", bar);
      }
    };
    ws.onclose = () => {
      if (this.closed) return;
      this._emit("close", {});
      const delay = Math.min(30000, 1000 * 2 ** this.reconnectAttempt) + Math.random() * 500;
      this.reconnectAttempt++;
      setTimeout(async () => {
        if (this.closed) return;
        await this._backfillGap();
        this._connect();
      }, delay);
    };
    ws.onerror = () => ws.close();
  }

  _bindVisibility() {
    if (typeof document === "undefined") return;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this._bgTimer = setTimeout(() => this.stop(), BACKGROUND_CLOSE_MS);
      } else {
        if (this._bgTimer) { clearTimeout(this._bgTimer); this._bgTimer = null; }
        if (!this.ws || this.ws.readyState > 1) {
          this.closed = false;
          this._backfillGap().then(() => this._connect());
        }
      }
    });
  }
}
