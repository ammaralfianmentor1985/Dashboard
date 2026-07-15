// Bilingual order-flow curriculum — static content bundled with the app (zero
// cost, no network call). Each lesson has a topic key matched against chat
// "what is X" / "apa itu X" questions and Flow-tab signal "?" links.
export const LESSONS = [
  {
    key: "the-auction",
    aliases: ["auction", "market vs limit", "how price moves"],
    title: { en: "The auction", id: "Mekanisme lelang harga" },
    body: {
      en: "Markets are a continuous auction. A limit order rests and waits (adds liquidity); a market order takes the best resting price immediately (removes liquidity, the aggressor). Price only moves when an aggressor accepts a new price level — that's why order flow tracks *who initiated* each trade, not just the price.",
      id: "Pasar adalah lelang berkelanjutan. Limit order menunggu (menambah likuiditas); market order langsung mengambil harga terbaik yang tersedia (mengurangi likuiditas, sang agresor). Harga hanya bergerak saat agresor menerima level harga baru — karena itu order flow melacak *siapa yang memulai* setiap transaksi, bukan cuma harganya.",
    },
    selfCheck: {
      en: ["Which order type removes liquidity?", "market order"],
      id: ["Jenis order mana yang mengurangi likuiditas?", "market order"],
    },
  },
  {
    key: "tape-reading",
    aliases: ["time and sales", "tape", "time & sales"],
    title: { en: "Reading the tape", id: "Membaca time & sales" },
    body: {
      en: "The tape (time & sales) is the raw trade-by-trade feed. Big prints relative to recent size often mark institutional activity. Watch print speed too — a sudden burst of prints at one price (not moving through it) can mean a large passive order is absorbing aggression there.",
      id: "Tape (time & sales) adalah feed transaksi mentah. Print besar relatif terhadap ukuran transaksi terkini sering menandai aktivitas institusional. Perhatikan juga kecepatan print — ledakan print tiba-tiba di satu harga (tanpa menembusnya) bisa berarti ada order pasif besar yang menyerap agresi di sana.",
    },
    selfCheck: { en: ["What might a burst of same-price prints signal?", "absorption"], id: ["Apa arti ledakan print di harga yang sama?", "absorpsi"] },
  },
  {
    key: "delta-cvd",
    aliases: ["delta", "cvd", "cumulative volume delta"],
    title: { en: "Delta and CVD", id: "Delta dan CVD" },
    body: {
      en: "Delta = buy-initiated volume minus sell-initiated volume for a period. CVD (cumulative volume delta) sums delta over time into a running line. When price makes a new high but CVD doesn't confirm (a lower high) — that's bearish divergence: buyers are technically winning the price battle but losing the volume battle.",
      id: "Delta = volume yang diinisiasi pembeli dikurangi volume yang diinisiasi penjual pada suatu periode. CVD (cumulative volume delta) menjumlahkan delta sepanjang waktu jadi satu garis berjalan. Saat harga membuat high baru tapi CVD tidak mengonfirmasi (high lebih rendah) — itu divergensi bearish: pembeli menang di harga tapi kalah di volume.",
    },
    selfCheck: { en: ["New price high + lower CVD high = ?", "bearish divergence"], id: ["High harga baru + high CVD lebih rendah = ?", "divergensi bearish"] },
  },
  {
    key: "volume-profile",
    aliases: ["profile", "poc", "vah", "val", "value area"],
    title: { en: "Volume profile", id: "Volume profile" },
    body: {
      en: "Volume profile shows *where* volume traded, by price — not by time. POC (point of control) is the price with the most volume: the market's fairest-value consensus. VAH/VAL bound the value area (typically 70% of volume). Price outside the value area is considered 'expensive' or 'cheap' relative to recent consensus, and tends to attract a retest.",
      id: "Volume profile menunjukkan *di harga berapa* volume diperdagangkan — bukan berdasarkan waktu. POC (point of control) adalah harga dengan volume terbanyak: konsensus nilai wajar pasar. VAH/VAL membatasi value area (biasanya 70% volume). Harga di luar value area dianggap 'mahal' atau 'murah' relatif terhadap konsensus terkini, dan cenderung menarik retest.",
    },
    selfCheck: { en: ["What does POC represent?", "the price with the most traded volume"], id: ["Apa arti POC?", "harga dengan volume transaksi terbanyak"] },
  },
  {
    key: "imbalances-stacked-zones",
    aliases: ["imbalance", "stacked zone", "diagonal imbalance"],
    title: { en: "Imbalances and stacked zones", id: "Imbalance dan stacked zone" },
    body: {
      en: "A diagonal imbalance compares buying at one price to selling one tick below (or vice versa) — a ratio ≥3:1 suggests one side is clearly dominating that transition. Three or more consecutive imbalances in the same direction stack into a zone: a real supply or demand shelf the market built in real time, not a hand-drawn guess.",
      id: "Imbalance diagonal membandingkan pembelian di satu harga dengan penjualan satu tick di bawahnya (atau sebaliknya) — rasio ≥3:1 menunjukkan satu sisi jelas mendominasi transisi itu. Tiga atau lebih imbalance berurutan searah menumpuk jadi satu zone: level supply/demand nyata yang dibentuk pasar secara real time, bukan tebakan manual.",
    },
    selfCheck: { en: ["How many consecutive imbalances make a 'stacked zone' here?", "3 or more"], id: ["Berapa imbalance berurutan membentuk 'stacked zone'?", "3 atau lebih"] },
  },
  {
    key: "absorption",
    aliases: ["absorb", "stopping volume"],
    title: { en: "Absorption", id: "Absorpsi" },
    body: {
      en: "Absorption is high volume with little price progress — someone big is quietly taking the other side of aggressive orders without letting price move. It's the fight you can *see*: a narrow-range, high-volume bar where delta fights the close direction is a classic tell that a trend may be about to stall.",
      id: "Absorpsi adalah volume tinggi dengan pergerakan harga minim — ada pihak besar yang diam-diam mengambil sisi berlawanan dari order agresif tanpa membiarkan harga bergerak. Ini pertarungan yang bisa *terlihat*: bar dengan range sempit, volume tinggi, dan delta melawan arah closing adalah tanda klasik tren mungkin akan berhenti.",
    },
    selfCheck: { en: ["High volume + narrow range + delta against close = ?", "absorption"], id: ["Volume tinggi + range sempit + delta melawan close = ?", "absorpsi"] },
  },
  {
    key: "exhaustion",
    aliases: ["climax", "exhaust"],
    title: { en: "Exhaustion", id: "Exhaustion" },
    body: {
      en: "Exhaustion is climax volume followed by a rapid volume taper — the trend runs out of fresh participants. Unlike absorption (which can happen mid-trend and cause a pause), exhaustion typically marks the end of a move: everyone who wanted in is already in.",
      id: "Exhaustion adalah volume klimaks yang diikuti penurunan volume cepat — tren kehabisan partisipan baru. Berbeda dari absorpsi (yang bisa terjadi di tengah tren dan menyebabkan jeda), exhaustion biasanya menandai akhir pergerakan: semua yang ingin masuk sudah masuk.",
    },
    selfCheck: { en: ["Exhaustion typically marks the ___ of a move.", "end"], id: ["Exhaustion biasanya menandai ___ dari sebuah pergerakan.", "akhir"] },
  },
  {
    key: "poc-migration",
    aliases: ["unfinished auction", "poc shift"],
    title: { en: "POC migration & unfinished auctions", id: "Migrasi POC & lelang belum selesai" },
    body: {
      en: "When each new session's POC migrates steadily in one direction, the market is still finding acceptance — an 'unfinished auction'. A single-print (low-volume) area at the edge of a profile is often revisited later because the auction never properly completed there.",
      id: "Ketika POC tiap sesi baru bergeser stabil ke satu arah, pasar masih mencari titik penerimaan — 'lelang belum selesai'. Area single-print (volume rendah) di tepi profile sering dikunjungi ulang nanti karena lelang di situ belum benar-benar tuntas.",
    },
    selfCheck: { en: ["A low-volume single-print area tends to get ___ later.", "revisited"], id: ["Area single-print volume rendah cenderung ___ lagi nanti.", "dikunjungi ulang"] },
  },
  {
    key: "vsa-basics",
    aliases: ["wyckoff", "vsa", "effort vs result", "no demand", "no supply"],
    title: { en: "Wyckoff/VSA: effort vs. result", id: "Wyckoff/VSA: usaha vs hasil" },
    body: {
      en: "Without tick data, VSA reads volume (effort) against range/close (result). High volume + narrow range = someone's absorbing (stopping volume). A narrow-range up-bar on volume LOWER than the prior two bars is 'no demand' — the rally isn't backed by real buying and often fails.",
      id: "Tanpa data tick, VSA membaca volume (usaha) terhadap range/close (hasil). Volume tinggi + range sempit = ada yang menyerap (stopping volume). Bar naik dengan range sempit pada volume LEBIH RENDAH dari dua bar sebelumnya disebut 'no demand' — rally tidak didukung pembelian nyata dan sering gagal.",
    },
    selfCheck: { en: ["A narrow up-bar on falling volume is called?", "no demand"], id: ["Bar naik dengan range sempit di volume turun disebut?", "no demand"] },
  },
  {
    key: "playbook",
    aliases: ["checklist", "valentini", "context location signal confirmation risk"],
    title: { en: "The full checklist: Context → Location → Signal → Confirmation → Risk", id: "Checklist lengkap: Konteks → Lokasi → Sinyal → Konfirmasi → Risiko" },
    body: {
      en: "1) Context: what's the higher-timeframe trend/regime? 2) Location: are you at a real level (S/R, POC, VAH/VAL)? 3) Signal: does order flow show absorption/imbalance/exhaustion there? 4) Confirmation: does the next bar/print agree? 5) Risk: size the trade off your stop distance and account risk — always defined before entry, never after.",
      id: "1) Konteks: bagaimana tren/regime di timeframe lebih tinggi? 2) Lokasi: apakah di level nyata (S/R, POC, VAH/VAL)? 3) Sinyal: apakah order flow menunjukkan absorpsi/imbalance/exhaustion di situ? 4) Konfirmasi: apakah bar/print berikutnya sejalan? 5) Risiko: tentukan ukuran posisi dari jarak stop dan risiko akun — selalu ditentukan sebelum entry, bukan sesudah.",
    },
    selfCheck: { en: ["Risk sizing should be defined ___ entry.", "before"], id: ["Ukuran risiko harus ditentukan ___ entry.", "sebelum"] },
  },
];

export function findLesson(topic) {
  if (!topic) return null;
  const t = topic.toLowerCase().trim().replace(/[?.!]+$/, "");
  return LESSONS.find((l) => l.key === t || l.aliases.some((a) => t.includes(a)) || t.includes(l.key.replace(/-/g, " ")));
}

export function lessonSummary(lesson, lang = "en") {
  if (!lesson) return null;
  return `${lesson.title[lang] || lesson.title.en}\n\n${lesson.body[lang] || lesson.body.en}`;
}
