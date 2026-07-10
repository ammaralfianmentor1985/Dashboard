// Renders the premium daily briefing HTML. Self-contained (inline CSS, inline JS toggle
// for ID/EN/MY). Design: ivory/navy/gold, private-banking style, no dark backgrounds.

const UI = {
  id: {
    title: 'Market Update Harian Premium', tagline: 'Laporan pasar eksklusif untuk investor profesional — analisis peluang dan risiko terkini, disajikan dalam gaya institutional-grade.',
    sentiment: 'Sentimen Pasar Global', us: 'US Stock Market', forex: 'Forex Market', crypto: 'Crypto Market',
    commodities: 'Commodities Market', idn: 'Indonesia Economic Update', mys: 'Malaysia Economic Update',
    opportunity: 'Potensi Keuntungan — Peluang Terkuat Hari Ini', summary: 'Ringkasan Eksekutif',
    sources: 'Sumber Data', disclaimer: 'Laporan ini disusun semata-mata untuk tujuan informasi dan edukasi bagi investor profesional. Bukan rekomendasi investasi. Semua investasi mengandung risiko. Data bersumber dari sumber publik yang telah diverifikasi pada tanggal penerbitan.',
  },
  en: {
    title: 'Premium Daily Market Update', tagline: 'An exclusive market briefing for professional investors — current opportunities and risks, presented institutional-grade.',
    sentiment: 'Global Market Sentiment', us: 'US Stock Market', forex: 'Forex Market', crypto: 'Crypto Market',
    commodities: 'Commodities Market', idn: 'Indonesia Economic Update', mys: 'Malaysia Economic Update',
    opportunity: 'Profit Opportunity — Today’s Strongest Setups', summary: 'Executive Summary',
    sources: 'Data Sources', disclaimer: 'This report is prepared solely for informational and educational purposes for professional investors. It is not investment advice. All investments carry risk. Data is sourced from verified public sources as of the publication date.',
  },
  my: {
    title: 'Kemas Kini Pasaran Harian Premium', tagline: 'Laporan pasaran eksklusif untuk pelabur profesional — peluang dan risiko terkini, disampaikan bergaya institusi.',
    sentiment: 'Sentimen Pasaran Global', us: 'Pasaran Saham AS', forex: 'Pasaran Forex', crypto: 'Pasaran Kripto',
    commodities: 'Pasaran Komoditi', idn: 'Kemas Kini Ekonomi Indonesia', mys: 'Kemas Kini Ekonomi Malaysia',
    opportunity: 'Potensi Keuntungan — Peluang Terkuat Hari Ini', summary: 'Ringkasan Eksekutif',
    sources: 'Sumber Data', disclaimer: 'Laporan ini disediakan semata-mata untuk tujuan maklumat dan pendidikan bagi pelabur profesional. Ini bukan nasihat pelaburan. Semua pelaburan membawa risiko. Data diperoleh daripada sumber awam yang disahkan pada tarikh penerbitan.',
  },
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtNum(n, digits = 2) {
  if (n === null || n === undefined || !isFinite(n)) return 'n/a';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function statCard(label, value, change, sourceUrl) {
  const dir = change === null || change === undefined ? 'neu' : change >= 0 ? 'up' : 'dn';
  const arrow = change === null || change === undefined ? '' : change >= 0 ? '▲' : '▼';
  return `<div class="stat-card"><div class="s-name">${esc(label)}</div><div class="s-val">${esc(value)}</div>
    <div class="s-chg ${dir}">${arrow} ${change === null || change === undefined ? '' : fmtNum(change) + '%'}</div></div>`;
}

function badgeClass(badge) {
  const b = (badge || '').toLowerCase();
  if (b.includes('negat') || b.includes('waspada') || b.includes('risiko')) return 'badge-neg';
  if (b.includes('posit') || b.includes('bullish')) return 'badge-pos';
  return 'badge-cau';
}

function sectionHtml(icon, title, section) {
  if (!section) return '';
  const points = (section.points || [])
    .map((p) => `<li>${esc(p.text)} <span class="src">[${esc(p.source)}]</span></li>`)
    .join('');
  return `
  <div class="section">
    <div class="sec-head">
      <div class="sec-icon">${icon}</div>
      <div class="sec-title">${esc(title)}</div>
      <div class="badge ${badgeClass(section.badge)}">${esc(section.badge || '')}</div>
    </div>
    <ul class="blist">${points}</ul>
  </div>`;
}

export function renderBriefingHtml({ dateIso, dateLabelByLang, market, narrative }) {
  const langs = ['id', 'en', 'my'];

  const statGrid = `<div class="stat-grid sg3">
    ${statCard('S&P 500', market.equities.sp500?.close ? fmtNum(market.equities.sp500.close) : 'n/a', market.equities.sp500?.changePct)}
    ${statCard('Dow Jones', market.equities.dji?.close ? fmtNum(market.equities.dji.close) : 'n/a', market.equities.dji?.changePct)}
    ${statCard('NASDAQ', market.equities.nasdaq?.close ? fmtNum(market.equities.nasdaq.close) : 'n/a', market.equities.nasdaq?.changePct)}
  </div>`;

  const fxGrid = `<div class="stat-grid sg4">
    ${statCard('EUR/USD', market.forex.eurusd?.rate ? fmtNum(market.forex.eurusd.rate, 4) : 'n/a')}
    ${statCard('GBP/USD', market.forex.gbpusd?.rate ? fmtNum(market.forex.gbpusd.rate, 4) : 'n/a')}
    ${statCard('USD/IDR', market.forex.usdidr?.rate ? fmtNum(market.forex.usdidr.rate, 0) : 'n/a')}
    ${statCard('USD/MYR', market.forex.usdmyr?.rate ? fmtNum(market.forex.usdmyr.rate, 4) : 'n/a')}
  </div>`;

  const cryptoGrid = `<div class="stat-grid sg2">
    ${statCard('Bitcoin (BTC/USD)', market.crypto.bitcoin?.usd ? fmtNum(market.crypto.bitcoin.usd, 0) : 'n/a', market.crypto.bitcoin?.change24h)}
    ${statCard('Ethereum (ETH/USD)', market.crypto.ethereum?.usd ? fmtNum(market.crypto.ethereum.usd, 0) : 'n/a', market.crypto.ethereum?.change24h)}
  </div>`;

  const commGrid = `<div class="stat-grid sg3">
    ${statCard('Gold (XAU/USD)', market.commodities.gold?.close ? fmtNum(market.commodities.gold.close) : 'n/a', market.commodities.gold?.changePct)}
    ${statCard('Brent Crude', market.commodities.brent?.close ? fmtNum(market.commodities.brent.close) : 'n/a', market.commodities.brent?.changePct)}
    ${statCard('Silver (XAG/USD)', market.commodities.silver?.close ? fmtNum(market.commodities.silver.close) : 'n/a', market.commodities.silver?.changePct)}
  </div>`;

  const idnGrid = `<div class="stat-grid sg2">
    ${statCard('IHSG / JCI', market.regional.ihsg?.close ? fmtNum(market.regional.ihsg.close) : 'n/a', market.regional.ihsg?.changePct)}
    ${statCard('USD/IDR', market.forex.usdidr?.rate ? fmtNum(market.forex.usdidr.rate, 0) : 'n/a')}
  </div>`;

  const mysGrid = `<div class="stat-grid sg2">
    ${statCard('FBM KLCI', market.regional.klci?.close ? fmtNum(market.regional.klci.close) : 'n/a', market.regional.klci?.changePct)}
    ${statCard('USD/MYR', market.forex.usdmyr?.rate ? fmtNum(market.forex.usdmyr.rate, 4) : 'n/a')}
  </div>`;

  const opportunities = (narrative.opportunities || [])
    .map(
      (o) => `<div class="p-card">
        <div class="p-card-head"><div class="p-card-ico">${esc(o.icon || '\u{1F4A1}')}</div><div class="p-card-title">${esc(o.market)}</div></div>
        <div class="p-card-desc">${esc(o.text)}</div>
        <div class="p-level">${esc(o.source)}</div>
      </div>`
    )
    .join('');

  const summaryItems = (narrative.summary || []).map((s) => `<li><span class="sum-ico">▸</span><span>${esc(s)}</span></li>`).join('');

  const sourcesText = [...new Set([
    'stooq.com', 'CoinGecko', 'Frankfurter (ECB rates)',
    ...['usStocks','forex','crypto','commodities','indonesia','malaysia'].flatMap(
      (k) => (narrative[k]?.points || []).map((p) => p.source)
    ),
  ])].filter(Boolean).join(' · ');

  const langButtons = langs.map((l, i) => `<button class="lang-btn${i===0?' active':''}" data-lang="${l}">${l.toUpperCase()}</button>`).join('');

  // Language-dependent chrome (headings, taglines, footer copy) is rendered once per
  // language and toggled client-side; the numeric stat grids are language-neutral and shared.
  const langBlocks = langs
    .map((l, i) => {
      const t = UI[l];
      return `<div class="lang-block${i === 0 ? ' active' : ''}" data-lang-block="${l}">
    <div class="lang-header-text">
      <div class="brand-label">Premium Market Intelligence · Institutional Report</div>
      <h1>${esc(t.title)}</h1>
      <div class="date-line">${esc(dateLabelByLang[l])}</div>
      <div class="tagline">${esc(t.tagline)}</div>
    </div>
    <div class="body">
      ${sectionHtml('🇺🇸', t.us, narrative.usStocks)}
      ${statGrid}
      ${sectionHtml('\u{1F4B1}', t.forex, narrative.forex)}
      ${fxGrid}
      ${sectionHtml('₿', t.crypto, narrative.crypto)}
      ${cryptoGrid}
      ${sectionHtml('🥇', t.commodities, narrative.commodities)}
      ${commGrid}
      ${sectionHtml('🇮🇩', t.idn, narrative.indonesia)}
      ${idnGrid}
      ${sectionHtml('🇲🇾', t.mys, narrative.malaysia)}
      ${mysGrid}
      <div class="profit">
        <h2>${esc(t.opportunity)}</h2>
        <div class="profit-grid">${opportunities}</div>
      </div>
      <div class="sum-box">
        <h3>${esc(t.summary)}</h3>
        <ul class="sum-list">${summaryItems}</ul>
      </div>
    </div>
    <div class="footer">
      <div class="sig">
        <div class="sig-name">Revan Ashford</div>
        <div class="sig-role">Senior Investment Consultant &amp; Portfolio Manager</div>
        <div class="sig-email">revan@onetwomarkets.co.za</div>
      </div>
      <div class="sources-text"><strong>${esc(t.sources)}:</strong> ${esc(sourcesText)} — fetched ${esc(market.fetchedAt)}</div>
      <div class="disclaimer">${esc(t.disclaimer)}</div>
    </div>
  </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(UI.id.title)} — ${esc(dateLabelByLang.id)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Sans+3:wght@300;400;600;700&display=swap');
  :root{
    --bg-page:#f4f1ea; --bg-card:#ffffff; --bg-section:#faf8f3; --bg-panel:#f1ece0;
    --navy:#1c2a3a; --navy-light:#2c3e54; --gold:#a9812f; --gold-light:#c9a24d;
    --text:#1c2333; --text-2:#5b6572; --text-3:#8a94a0; --border:rgba(169,129,47,0.28);
    --green:#1f7a4d; --red:#b0392c; --amber:#a9722f;
  }
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
  body{background:var(--bg-page);font-family:'Source Sans 3',Georgia,sans-serif;color:var(--text);}
  .page{max-width:900px;margin:28px auto 48px;background:var(--bg-card);border:1px solid var(--border);box-shadow:0 16px 60px rgba(28,42,58,0.12);}
  .header{background:linear-gradient(150deg,var(--navy) 0%,var(--navy-light) 100%);padding:38px 50px 26px;border-bottom:3px solid var(--gold);color:#f4f1ea;}
  .header-row{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:16px;}
  .lang-toggle{display:flex;gap:6px;}
  .lang-btn{background:transparent;border:1px solid rgba(244,241,234,0.4);color:#f4f1ea;font-size:11px;padding:4px 10px;border-radius:4px;cursor:pointer;letter-spacing:1px;}
  .lang-btn.active{background:var(--gold);border-color:var(--gold);color:#1c2a3a;font-weight:700;}
  .brand-label{font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--gold-light);margin-bottom:8px;}
  h1{font-family:'Playfair Display',serif;font-size:26px;font-weight:700;line-height:1.25;}
  .date-line{font-size:12px;color:#cdd6e0;margin-top:10px;letter-spacing:0.5px;}
  .tagline{font-size:12px;color:#cdd6e0;font-style:italic;border-top:1px solid rgba(244,241,234,0.2);padding-top:12px;margin-top:14px;line-height:1.5;}
  .body{padding:0 50px 48px;}
  .section{margin-top:32px;}
  .sec-head{display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--border);}
  .sec-icon{width:32px;height:32px;background:var(--bg-panel);border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px;}
  .sec-title{font-family:'Playfair Display',serif;font-size:16px;font-weight:600;}
  .badge{margin-left:auto;font-size:8.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:3px 10px;border-radius:12px;}
  .badge-pos{background:rgba(31,122,77,0.1);color:var(--green);border:1px solid rgba(31,122,77,0.3);}
  .badge-neg{background:rgba(176,57,44,0.1);color:var(--red);border:1px solid rgba(176,57,44,0.3);}
  .badge-cau{background:rgba(169,114,47,0.1);color:var(--amber);border:1px solid rgba(169,114,47,0.3);}
  .stat-grid{display:grid;gap:10px;margin-bottom:16px;}
  .sg2{grid-template-columns:repeat(2,1fr);} .sg3{grid-template-columns:repeat(3,1fr);} .sg4{grid-template-columns:repeat(4,1fr);}
  .stat-card{background:var(--bg-section);border:1px solid var(--border);border-radius:6px;padding:12px 14px;text-align:center;}
  .s-name{font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--text-3);margin-bottom:5px;}
  .s-val{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;}
  .s-chg{font-size:10px;font-weight:700;margin-top:4px;}
  .up{color:var(--green);} .dn{color:var(--red);} .neu{color:var(--text-3);}
  .blist{list-style:none;}
  .blist li{font-size:13px;line-height:1.6;padding:7px 0 7px 20px;border-bottom:1px solid rgba(28,42,58,0.06);position:relative;}
  .blist li:last-child{border-bottom:none;}
  .blist li::before{content:'▸';position:absolute;left:0;top:8px;color:var(--gold);font-size:10px;}
  .src{font-size:10px;color:var(--text-3);font-style:italic;}
  .profit{background:var(--bg-panel);border:1.5px solid var(--gold);border-radius:10px;padding:26px 28px;margin-top:32px;}
  .profit h2{font-family:'Playfair Display',serif;font-size:17px;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid var(--border);}
  .profit-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .p-card{background:#fff;border:1px solid var(--border);border-radius:8px;padding:16px 18px;}
  .p-card-head{display:flex;align-items:center;gap:8px;margin-bottom:9px;}
  .p-card-title{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--gold);}
  .p-card-desc{font-size:12.5px;line-height:1.55;margin-bottom:8px;}
  .p-level{font-size:9.5px;color:var(--text-3);font-style:italic;}
  .sum-box{background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:22px 26px;margin-top:32px;}
  .sum-box h3{font-family:'Playfair Display',serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:14px;}
  .sum-list{list-style:none;}
  .sum-list li{font-size:12.5px;line-height:1.55;padding:5px 0;display:flex;gap:8px;}
  .sum-ico{color:var(--gold);}
  .footer{background:var(--bg-section);border-top:1px solid var(--border);padding:24px 50px 28px;}
  .sig{margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);}
  .sig-name{font-family:'Playfair Display',serif;font-size:15px;font-weight:700;color:var(--gold);}
  .sig-role,.sig-email{font-size:10.5px;color:var(--text-2);}
  .sources-text,.disclaimer{font-size:9px;color:var(--text-3);line-height:1.6;}
  .disclaimer{font-style:italic;margin-top:12px;}
  .lang-block{display:none;}
  .lang-block.active{display:block;}
  .lang-header-text{padding:38px 50px 0;}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-row">
      <div class="lang-toggle-spacer"></div>
      <div class="lang-toggle">${langButtons}</div>
    </div>
  </div>
  ${langBlocks}
</div>
<script>
(function(){
  document.querySelectorAll('.lang-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var lang = btn.getAttribute('data-lang');
      document.querySelectorAll('.lang-btn').forEach(function(b){ b.classList.toggle('active', b === btn); });
      document.querySelectorAll('.lang-block').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-lang-block') === lang); });
      document.documentElement.setAttribute('lang', lang);
    });
  });
})();
</script>
</body>
</html>`;
}
