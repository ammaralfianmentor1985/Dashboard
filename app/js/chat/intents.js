// Rule-based bilingual (EN/ID) intent grammar for the chat quant analyst.
// No LLM — every match is a deterministic regex, so answers are always
// traceable back to a rule (matches the "zero hallucination" design goal).
import { ID_ALIASES, parseIdNumber } from "../i18n.js";

const EN_ALIASES = {
  gold: "GC=F", oil: "CL=F", silver: "SI=F", "s&p500": "^GSPC", sp500: "^GSPC",
  nasdaq: "^IXIC", dow: "^DJI", bitcoin: "BTC-USD", ethereum: "ETH-USD",
  eurusd: "EURUSD=X",
};

export function extractSymbol(raw) {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/[?.!,]+$/, "");
  const lower = cleaned.toLowerCase();
  if (ID_ALIASES[lower]) return ID_ALIASES[lower];
  if (EN_ALIASES[lower]) return EN_ALIASES[lower];
  // first whitespace-delimited token is the symbol candidate in most phrasings
  const firstTok = cleaned.split(/\s+/)[0];
  const tokLower = firstTok.toLowerCase();
  if (ID_ALIASES[tokLower]) return ID_ALIASES[tokLower];
  if (EN_ALIASES[tokLower]) return EN_ALIASES[tokLower];
  if (/^\^?[a-z0-9.=\-]{1,15}$/i.test(firstTok)) return firstTok.toUpperCase();
  return cleaned.toUpperCase();
}

function growthFromText(text) {
  const m = text.match(/growth\s+([\d.]+)\s*%/i);
  return m ? parseFloat(m[1]) / 100 : null;
}

const RULES = [
  { re: /^(help|\?|bantuan|tolong)\s*$/i, intent: () => ({ intent: "help" }) },
  { re: /^(brief|briefing|ringkasan)\s*$/i, intent: () => ({ intent: "brief" }) },
  { re: /^(what\s+is|apa\s+itu)\s+(.+)/i, intent: (m) => ({ intent: "lesson_question", topic: m[2].trim() }) },
  { re: /^(learn|belajar)\s+(.+)/i, intent: (m) => ({ intent: "learn", topic: m[2].trim() }) },
  { re: /^(learn|belajar)\s*$/i, intent: () => ({ intent: "learn", topic: null }) },
  { re: /^(news|berita)\s+(.+)/i, intent: (m) => ({ intent: "news", symbol: extractSymbol(m[2]) }) },
  { re: /^watch\s+(.+)/i, intent: (m) => ({ intent: "watch", symbol: extractSymbol(m[1]) }) },
  { re: /^(size|ukuran)\s+([\d.]+)\s*%?/i, intent: (m) => ({ intent: "size", riskPct: parseFloat(m[2]) }) },
  {
    re: /^(compare|bandingkan)\s+(.+?)\s+(vs\.?|dan|dengan)\s+(.+)/i,
    intent: (m) => ({ intent: "compare", symbols: [extractSymbol(m[2]), extractSymbol(m[4])] }),
  },
  {
    re: /^dcf\s+(\S+)(.*)/i,
    intent: (m) => ({ intent: "dcf", symbol: extractSymbol(m[1]), growth: growthFromText(m[2] || "") }),
  },
  { re: /^flow\s+(.+)/i, intent: (m) => ({ intent: "flow", symbol: extractSymbol(m[1]) }) },
  { re: /^screen\s+(.+)/i, intent: (m) => ({ intent: "screen", preset: m[1].trim() }) },
  { re: /^verdict\s+(.+)/i, intent: (m) => ({ intent: "verdict", symbol: extractSymbol(m[1]) }) },
  {
    re: /^(analyze|analisis|nilai\s+wajar)\s+(.+)/i,
    intent: (m) => ({ intent: "analyze", symbol: extractSymbol(m[2]), growth: growthFromText(m[2]) }),
  },
];

export function parseIntent(text) {
  const trimmed = text.trim();
  for (const rule of RULES) {
    const m = trimmed.match(rule.re);
    if (m) return rule.intent(m);
  }
  // bare symbol/alias with nothing else -> treat as analyze
  if (/^\S{1,15}$/.test(trimmed)) return { intent: "analyze", symbol: extractSymbol(trimmed), growth: null };
  return { intent: "unknown", raw: trimmed };
}
