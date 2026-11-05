export type Scenario = {
  category: string;
  month: string;
  consumption: "Low" | "Medium" | "High";
  limitKw: number;
  vans: number;
  kwhPerVan: number;
  chargerKw: number;
  postcode: string;
};

export const DEMO: Scenario = {
  category: "Logistics depot",
  month: "March",
  consumption: "Medium",
  limitKw: 150,
  vans: 8,
  kwhPerVan: 50,
  chargerKw: 11,
  postcode: "1012 AB",
};

export const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const CATEGORIES = ["Logistics depot", "Retail", "Office", "Light industry"];

const BASE = [40,38,37,36,36,38,50,70,90,100,105,108,110,108,105,100,95,90,85,75,60,50,45,42];
const LEVEL = { Low: 0.7, Medium: 1, High: 1.3 } as const;

export type Result = {
  base: number[];
  baseline: number[];
  proposed: number[];
  needKwh: number;
  deliveredKwh: number;
  peakBaseline: number;
  peakProposed: number;
  breachBaseline: number;
  breachProposed: number;
  needsMet: boolean;
};

export function analyse(s: Scenario): Result {
  const m = MONTHS.indexOf(s.month);
  const season = m <= 1 || m >= 10 ? 1.1 : m >= 5 && m <= 7 ? 0.92 : 1;
  const base = BASE.map((v) => Math.round(v * LEVEL[s.consumption] * season));
  const needKwh = s.vans * s.kwhPerVan;
  const maxPower = s.vans * s.chargerKw;

  // Baseline: vans plug in at 17:00 and charge at full power.
  const baseline = [...base];
  let left = needKwh;
  for (let i = 0; i < 14 && left > 0; i++) {
    const h = (17 + i) % 24;
    const p = Math.min(maxPower, left);
    baseline[h] = (baseline[h] ?? 0) + p;
    left -= p;
  }

  // Proposed: fill headroom below the limit between 18:00 and 07:00.
  const proposed = [...base];
  left = needKwh;
  for (let i = 0; i < 13 && left > 0; i++) {
    const h = (18 + i) % 24;
    const p = Math.max(0, Math.min(maxPower, s.limitKw - (base[h] ?? 0), left));
    proposed[h] = (proposed[h] ?? 0) + p;
    left -= p;
  }
  const deliveredKwh = needKwh - left;
  const over = (a: number[]) => a.filter((v) => v > s.limitKw).length;
  return {
    base,
    baseline,
    proposed,
    needKwh,
    deliveredKwh,
    peakBaseline: Math.max(...baseline),
    peakProposed: Math.max(...proposed),
    breachBaseline: over(baseline),
    breachProposed: over(proposed),
    needsMet: left <= 0,
  };
}

export const EDGE: Scenario = { ...DEMO, consumption: "High", limitKw: 120, vans: 12 };
