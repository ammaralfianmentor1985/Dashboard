// Tiny pub/sub store — no framework. One instance per app.
const state = {
  symbol: "AAPL",
  timeframe: "1D",
  chartType: "candles",
  lang: localStorage.getItem("mm.lang") || "en",
  theme: localStorage.getItem("mm.theme") || "dark",
};

const listeners = new Map(); // key -> Set(fn)

export function get(key) {
  return state[key];
}

export function set(key, value) {
  if (state[key] === value) return;
  state[key] = value;
  const fns = listeners.get(key);
  if (fns) for (const fn of fns) fn(value);
}

export function on(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key)?.delete(fn);
}

export function getAll() {
  return { ...state };
}
