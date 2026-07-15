// Minimal i18n: EN default, ID (Bahasa Indonesia) for chat explanations and briefs.
export const STRINGS = {
  en: {
    help: "Commands: analyze <symbol>, verdict <symbol>, dcf <symbol> [growth 10%], compare A vs B, flow <symbol>, size <risk%>, screen <preset>, brief, news <symbol>, watch <symbol>, learn <topic>",
    not_found: "I don't have data for that symbol right now.",
    no_call: "Not enough data to call this one — showing what I have.",
  },
  id: {
    help: "Perintah: nilai wajar <simbol>, verdict <simbol>, dcf <simbol> growth 10%, bandingkan A vs B, flow <simbol>, ukuran <risk%>, screen <preset>, brief, berita <simbol>, watch <simbol>, belajar <topik>",
    not_found: "Data untuk simbol itu belum tersedia saat ini.",
    no_call: "Data belum cukup untuk memberi kesimpulan — ini yang saya punya.",
  },
};

export function t(key, lang = "en") {
  return (STRINGS[lang] || STRINGS.en)[key] || (STRINGS.en[key] ?? key);
}

// Bahasa Indonesia symbol aliases and number-suffix parsing (rb=ribu/thousand, jt=juta/million, miliar=billion).
export const ID_ALIASES = {
  "emas": "GC=F", "minyak": "CL=F", "ihsg": "^JKSE", "rupiah": "IDR=X",
  "bca": "BBCA.JK", "bbca": "BBCA.JK", "bri": "BBRI.JK", "bbri": "BBRI.JK",
  "mandiri": "BMRI.JK", "bmri": "BMRI.JK", "bni": "BBNI.JK", "bbni": "BBNI.JK",
  "telkom": "TLKM.JK", "tlkm": "TLKM.JK", "bitcoin": "BTC-USD", "ethereum": "ETH-USD",
};

export function parseIdNumber(str) {
  const m = str.match(/([\d.,]+)\s*(rb|ribu|jt|juta|miliar|m|b|k)?/i);
  if (!m) return null;
  const base = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  const suffix = (m[2] || "").toLowerCase();
  const mult = { rb: 1e3, ribu: 1e3, jt: 1e6, juta: 1e6, miliar: 1e9, m: 1e6, b: 1e9, k: 1e3 }[suffix] || 1;
  return base * mult;
}
