import { parseIntent } from "./intents.js";

// 30 cases across all 11 intents + lesson-question + unknown, mixing EN/ID
// phrasing and aliases. Purely tests the deterministic grammar (parseIntent),
// not live data — that's what the manual chat + respond.js exercises.
export const CASES = [
  { input: "help", intent: "help" },
  { input: "?", intent: "help" },
  { input: "bantuan", intent: "help" },
  { input: "tolong", intent: "help" },
  { input: "brief", intent: "brief" },
  { input: "ringkasan", intent: "brief" },
  { input: "what is absorption", intent: "lesson_question" },
  { input: "apa itu delta", intent: "lesson_question" },
  { input: "learn footprint", intent: "learn", check: (r) => r.topic === "footprint" },
  { input: "belajar volume profile", intent: "learn", check: (r) => r.topic === "volume profile" },
  { input: "news AAPL", intent: "news", check: (r) => r.symbol === "AAPL" },
  { input: "berita BBCA", intent: "news", check: (r) => r.symbol === "BBCA.JK" },
  { input: "watch TSLA", intent: "watch", check: (r) => r.symbol === "TSLA" },
  { input: "size 1%", intent: "size", check: (r) => r.riskPct === 1 },
  { input: "ukuran 2%", intent: "size", check: (r) => r.riskPct === 2 },
  { input: "compare AAPL vs MSFT", intent: "compare", check: (r) => r.symbols[0] === "AAPL" && r.symbols[1] === "MSFT" },
  { input: "bandingkan BBCA dan BBRI", intent: "compare", check: (r) => r.symbols[0] === "BBCA.JK" && r.symbols[1] === "BBRI.JK" },
  { input: "dcf AAPL", intent: "dcf", check: (r) => r.symbol === "AAPL" && r.growth == null },
  { input: "dcf AAPL growth 12%", intent: "dcf", check: (r) => Math.abs(r.growth - 0.12) < 1e-9 },
  { input: "flow BTC-USD", intent: "flow", check: (r) => r.symbol === "BTC-USD" },
  { input: "screen value", intent: "screen", check: (r) => r.preset === "value" },
  { input: "verdict NVDA", intent: "verdict", check: (r) => r.symbol === "NVDA" },
  { input: "analyze GOOG", intent: "analyze", check: (r) => r.symbol === "GOOG" },
  { input: "analisis MSFT", intent: "analyze", check: (r) => r.symbol === "MSFT" },
  { input: "nilai wajar BBCA", intent: "analyze", check: (r) => r.symbol === "BBCA.JK" },
  { input: "AAPL", intent: "analyze", check: (r) => r.symbol === "AAPL" },
  { input: "emas", intent: "analyze", check: (r) => r.symbol === "GC=F" },
  { input: "ihsg", intent: "analyze", check: (r) => r.symbol === "^JKSE" },
  { input: "bitcoin", intent: "analyze", check: (r) => r.symbol === "BTC-USD" },
  { input: "gold", intent: "analyze", check: (r) => r.symbol === "GC=F" },
  { input: "xyzblah !!", intent: "unknown" },
];

export function runSelfTest() {
  const results = CASES.map((c) => {
    const r = parseIntent(c.input);
    const intentOk = r.intent === c.intent;
    const checkOk = c.check ? !!c.check(r) : true;
    return { input: c.input, expected: c.intent, got: r.intent, pass: intentOk && checkOk, parsed: r };
  });
  return { total: results.length, passed: results.filter((r) => r.pass).length, results };
}
