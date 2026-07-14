// Two-stage discounted cash flow: explicit high-growth stage 1, then a
// perpetuity (Gordon growth) terminal value at a capped long-run growth rate.
// All rates are decimals (0.10 = 10%). Guardrails clamp absurd inputs so the
// model can't produce a divide-by-zero or negative-denominator blowup.

export function twoStageDCF({ fcf0, growth1, years1 = 5, terminalGrowth, discountRate, sharesOutstanding }) {
  const g1 = clamp(growth1, -0.5, 0.6);
  const gT = clamp(terminalGrowth, -0.02, 0.045); // long-run growth shouldn't realistically exceed ~GDP+inflation
  const r = clamp(discountRate, gT + 0.01, 0.30); // discount rate must exceed terminal growth (Gordon growth requirement)

  let pv = 0;
  let fcf = fcf0;
  const path = [];
  for (let y = 1; y <= years1; y++) {
    fcf = fcf * (1 + g1);
    const discounted = fcf / (1 + r) ** y;
    pv += discounted;
    path.push({ year: y, fcf, discounted });
  }
  const terminalFcf = fcf * (1 + gT);
  const terminalValue = terminalFcf / (r - gT);
  const terminalPV = terminalValue / (1 + r) ** years1;

  const equityValue = pv + terminalPV;
  const fairValuePerShare = sharesOutstanding ? equityValue / sharesOutstanding : null;
  return {
    equityValue, terminalValue, terminalPV, sumPV: pv, path,
    fairValuePerShare,
    buyBelow: fairValuePerShare != null ? fairValuePerShare * 0.7 : null, // 30% margin of safety
    inputs: { fcf0, growth1: g1, years1, terminalGrowth: gT, discountRate: r, sharesOutstanding },
  };
}

function clamp(v, lo, hi) {
  if (v == null || Number.isNaN(v)) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, v));
}

// Reverse DCF: "the current price implies what growth rate?" — binary search
// on growth1 so equityValue/shares == currentPrice, holding other assumptions fixed.
export function reverseDCF({ fcf0, currentPrice, years1 = 5, terminalGrowth, discountRate, sharesOutstanding }) {
  if (!fcf0 || !currentPrice || !sharesOutstanding) return null;
  const targetEquity = currentPrice * sharesOutstanding;
  let lo = -0.5, hi = 0.6;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const { equityValue } = twoStageDCF({ fcf0, growth1: mid, years1, terminalGrowth, discountRate, sharesOutstanding });
    if (equityValue < targetEquity) lo = mid; else hi = mid;
  }
  const impliedGrowth = (lo + hi) / 2;
  return { impliedGrowth, boundedLow: impliedGrowth <= -0.499, boundedHigh: impliedGrowth >= 0.599 };
}

// Sensitivity grid: fair value per share across a growth x discount-rate matrix.
export function sensitivityGrid(base, growthDeltas, discountDeltas) {
  return growthDeltas.map((dg) =>
    discountDeltas.map((dr) => {
      const r = twoStageDCF({ ...base, growth1: base.growth1 + dg, discountRate: base.discountRate + dr });
      return r.fairValuePerShare;
    })
  );
}

export function grahamNumber(eps, bookValuePerShare) {
  if (eps == null || bookValuePerShare == null || eps <= 0 || bookValuePerShare <= 0) return null;
  return Math.sqrt(22.5 * eps * bookValuePerShare);
}

export function earningsYield(eps, price) {
  if (!eps || !price) return null;
  return (eps / price) * 100;
}

// Yahoo's ^TNX regularMarketPrice is already the actual 10-year yield
// percentage (e.g. 4.583 -> 4.583%), not a scaled value — verified live.
export function tenYearYieldFromTNX(tnxPrice) {
  return tnxPrice ?? null;
}
