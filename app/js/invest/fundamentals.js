// Normalizes Yahoo quoteSummary + fundamentals-timeseries into plain numbers.
// Every field in summary modules comes wrapped as {raw, fmt}; we unwrap to raw
// numbers (or null) so downstream math never has to think about that shape.

const unwrap = (x) => (x && typeof x === "object" && "raw" in x ? x.raw : (typeof x === "number" ? x : null));

export function parseSummary(summaryData) {
  const fd = summaryData.financialData || {};
  const ks = summaryData.defaultKeyStatistics || {};
  const sd = summaryData.summaryDetail || {};
  const ap = summaryData.assetProfile || {};
  const price = summaryData.price || {};
  return {
    sector: ap.sector || null,
    industry: ap.industry || null,
    currency: fd.financialCurrency || price.currency || null,
    currentPrice: unwrap(fd.currentPrice) ?? unwrap(price.regularMarketPrice),
    marketCap: unwrap(price.marketCap),
    trailingEps: unwrap(ks.trailingEps),
    forwardEps: unwrap(ks.forwardEps),
    bookValue: unwrap(ks.bookValue),
    priceToBook: unwrap(ks.priceToBook),
    sharesOutstanding: unwrap(ks.sharesOutstanding),
    pegRatio: unwrap(ks.pegRatio),
    trailingPE: unwrap(sd.trailingPE),
    forwardPE: unwrap(ks.forwardPE),
    dividendYield: unwrap(sd.dividendYield),
    returnOnEquity: unwrap(fd.returnOnEquity),
    returnOnAssets: unwrap(fd.returnOnAssets),
    grossMargins: unwrap(fd.grossMargins),
    operatingMargins: unwrap(fd.operatingMargins),
    profitMargins: unwrap(fd.profitMargins),
    revenueGrowth: unwrap(fd.revenueGrowth),
    earningsGrowth: unwrap(fd.earningsGrowth),
    debtToEquity: unwrap(fd.debtToEquity), // Yahoo reports this as a percentage-scale number (e.g. 79.5 = 0.795x)
    currentRatio: unwrap(fd.currentRatio),
    quickRatio: unwrap(fd.quickRatio),
    totalDebt: unwrap(fd.totalDebt),
    totalCash: unwrap(fd.totalCash),
    freeCashflow: unwrap(fd.freeCashflow),
    operatingCashflow: unwrap(fd.operatingCashflow),
    totalRevenue: unwrap(fd.totalRevenue),
    ebitda: unwrap(fd.ebitda),
    recommendationKey: fd.recommendationKey || null,
    recommendationMean: unwrap(fd.recommendationMean),
    numberOfAnalystOpinions: unwrap(fd.numberOfAnalystOpinions),
  };
}

const TS_FIELDS = {
  annualTotalRevenue: "revenue",
  annualGrossProfit: "grossProfit",
  annualOperatingIncome: "operatingIncome",
  annualNetIncomeCommonStockholders: "netIncome",
  annualReconciledDepreciation: "depreciation",
  annualOperatingCashFlow: "operatingCashFlow",
  annualCapitalExpenditure: "capex",
  annualFreeCashFlow: "freeCashFlow",
  annualStockholdersEquity: "stockholdersEquity",
  annualTotalDebt: "totalDebt",
  annualCashAndCashEquivalents: "cash",
  annualDilutedAverageShares: "dilutedShares",
  annualBasicAverageShares: "basicShares",
};

// timeseries op returns an array of {meta:{type:[name]}, timestamp:[...], [name]: [{asOfDate, reportedValue:{raw}}]}
export function parseTimeseries(tsResult) {
  const byDate = new Map(); // asOfDate -> { [field]: value }
  for (const block of tsResult || []) {
    const typeName = block?.meta?.type?.[0];
    const field = TS_FIELDS[typeName];
    if (!field) continue;
    for (const point of block[typeName] || []) {
      if (!point || point.reportedValue == null) continue;
      const date = point.asOfDate;
      if (!byDate.has(date)) byDate.set(date, { asOfDate: date });
      byDate.get(date)[field] = unwrap(point.reportedValue);
    }
  }
  const years = [...byDate.values()].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  return { years };
}

// Owner earnings (Buffett's approximation): Net Income + D&A - CapEx.
// Working-capital delta isn't available from this endpoint set — documented
// limitation, not silently assumed zero-impact.
export function ownerEarnings(yearRow) {
  if (!yearRow) return null;
  const { netIncome, depreciation, capex } = yearRow;
  if (netIncome == null || depreciation == null || capex == null) return null;
  return netIncome + depreciation - Math.abs(capex);
}

export function fcfStreak(years) {
  let streak = 0;
  for (let i = years.length - 1; i >= 0; i--) {
    if (years[i].freeCashFlow != null && years[i].freeCashFlow > 0) streak++;
    else break;
  }
  return streak;
}

export function isFinancialSector(summary) {
  return /financial|bank|insurance/i.test(summary.sector || "") || /bank/i.test(summary.industry || "");
}
