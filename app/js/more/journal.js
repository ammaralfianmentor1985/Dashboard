// Trade journal — localStorage-persisted (protected namespace, never evicted).
const KEY = "mm.journal";

export function loadTrades() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

export function saveTrades(trades) {
  localStorage.setItem(KEY, JSON.stringify(trades));
}

// R-multiple: how many "stop-loss units" of profit/loss this trade made.
// Long: (exit - entry) / (entry - stop). Short: (entry - exit) / (stop - entry).
export function rMultiple(trade) {
  const { direction, entry, exit, stop } = trade;
  const riskPerUnit = direction === "long" ? entry - stop : stop - entry;
  if (riskPerUnit <= 0) return null;
  const pnlPerUnit = direction === "long" ? exit - entry : entry - exit;
  return pnlPerUnit / riskPerUnit;
}

export function addTrade(trades, trade) {
  const r = rMultiple(trade);
  const withR = { ...trade, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, r };
  return [...trades, withR];
}

export function stats(trades) {
  const withR = trades.filter((t) => t.r != null);
  if (!withR.length) return { count: 0, winRate: null, expectancy: null, equityCurve: [] };
  const wins = withR.filter((t) => t.r > 0);
  const winRate = wins.length / withR.length;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.r, 0) / wins.length : 0;
  const losses = withR.filter((t) => t.r <= 0);
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.r, 0) / losses.length : 0; // negative
  const expectancy = winRate * avgWin + (1 - winRate) * avgLoss;
  let cum = 0;
  const equityCurve = withR.map((t) => (cum += t.r));
  // Half-Kelly suggestion (conservative), using avgWin/|avgLoss| as payoff ratio b.
  const b = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : null;
  const kelly = b ? winRate - (1 - winRate) / b : null;
  const halfKelly = kelly != null ? Math.max(0, kelly / 2) : null;
  return { count: withR.length, winRate, expectancy, equityCurve, avgWin, avgLoss, halfKelly };
}
