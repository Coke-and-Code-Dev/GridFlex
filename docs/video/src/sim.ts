// Illustrative depot simulation that drives the visuals. Synthetic numbers, labelled as such on screen.
// The planning rule mirrors GridFlex: charge as many trucks as the headroom under the limit allows,
// with a safety margin, lowest-numbered trucks first.
import { rng } from "./rng";

export const LIMIT = 100; // kW connection limit
export const CHARGER_KW = 11;
export const N_TRUCKS = 10;
export const ENERGY_KWH = 33; // each truck needs 33 kWh (3 h at 11 kW)
export const MARGIN = 5; // kW safety margin on the cautious baseline
export const START_H = 18; // simulated window: 18:00 -> 07:00
export const END_H = 31;
export const SLOT_H = 0.25;
export const SLOTS = Math.round((END_H - START_H) / SLOT_H); // 52

const BASE_KEYS: [number, number][] = [
  [18, 68], [19, 66], [20, 62], [21, 55], [22, 47], [23, 41], [24, 37], [26, 34], [29, 34], [30, 42], [31, 56],
];

/** Building's own load (kW) at an hour (18..31). */
export const baseAtHour = (h: number): number => {
  if (h <= BASE_KEYS[0][0]) return BASE_KEYS[0][1];
  for (let i = 1; i < BASE_KEYS.length; i++) {
    const [h1, v1] = BASE_KEYS[i];
    const [h0, v0] = BASE_KEYS[i - 1];
    if (h <= h1) return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);
  }
  return BASE_KEYS[BASE_KEYS.length - 1][1];
};

export type Plan = {
  active: boolean[][]; // [truck][slot]
  chargerKw: number[]; // per slot
  energy: number[][]; // [truck][slot+1] cumulative kWh
};

const buildPlan = (): Plan => {
  const remaining = Array(N_TRUCKS).fill(ENERGY_KWH);
  const active = Array.from({ length: N_TRUCKS }, () => Array(SLOTS).fill(false));
  const energy = Array.from({ length: N_TRUCKS }, () => Array(SLOTS + 1).fill(0));
  const chargerKw: number[] = [];
  for (let s = 0; s < SLOTS; s++) {
    const headroom = LIMIT - MARGIN - baseAtHour(START_H + s * SLOT_H);
    const n = Math.max(0, Math.floor(headroom / CHARGER_KW));
    let used = 0;
    for (let i = 0; i < N_TRUCKS; i++) energy[i][s + 1] = energy[i][s];
    for (let i = 0; i < N_TRUCKS && used < n; i++) {
      if (remaining[i] <= 1e-6) continue;
      const e = Math.min(remaining[i], CHARGER_KW * SLOT_H);
      remaining[i] -= e;
      energy[i][s + 1] += e;
      active[i][s] = true;
      used++;
    }
    chargerKw.push(used * CHARGER_KW);
  }
  return { active, chargerKw, energy };
};

export const PLAN = buildPlan();

export type TruckMode = "waiting" | "charging" | "paused" | "done";

/** State of truck i at hour h (18..31). */
export const truckAt = (i: number, h: number): { soc: number; mode: TruckMode; kw: number } => {
  const x = Math.max(0, Math.min(SLOTS - 1e-6, (h - START_H) / SLOT_H));
  const s = Math.floor(x);
  const f = x - s;
  const e0 = PLAN.energy[i][s];
  const e1 = PLAN.energy[i][s + 1];
  const e = e0 + (e1 - e0) * f;
  const soc = Math.min(1, e / ENERGY_KWH);
  if (h < START_H) return { soc: 0, mode: "waiting", kw: 0 };
  const act = PLAN.active[i][s];
  if (soc >= 0.9999) return { soc: 1, mode: "done", kw: 0 };
  if (act) return { soc, mode: "charging", kw: CHARGER_KW };
  return { soc, mode: soc > 0 ? "paused" : "waiting", kw: 0 };
};

export const chargerKwAt = (h: number): number => {
  if (h < START_H) return 0;
  const s = Math.min(SLOTS - 1, Math.floor((h - START_H) / SLOT_H));
  return PLAN.chargerKw[s];
};

export const plannedTotalAt = (h: number) => baseAtHour(h) + chargerKwAt(h);

export const peakPlanned = (): number => {
  let p = 0;
  for (let s = 0; s < SLOTS; s++) p = Math.max(p, baseAtHour(START_H + s * SLOT_H) + PLAN.chargerKw[s]);
  return p;
};

export const allDoneHour = (): number => {
  for (let s = SLOTS - 1; s >= 0; s--) if (PLAN.chargerKw[s] > 0) return START_H + (s + 1) * SLOT_H;
  return START_H;
};

// ---- Stress test: 100 realistic days the plan has never seen ----
export const N_DAYS = 100;
export const BAD_DAYS: { day: number; slot: number; peak: number }[] = [
  { day: 17, slot: 1, peak: 103.4 },
  { day: 42, slot: 2, peak: 105.2 },
  { day: 73, slot: 1, peak: 107.0 },
];

const buildDays = (): number[][] => {
  const r = rng(20261106);
  const days: number[][] = [];
  for (let d = 0; d < N_DAYS; d++) {
    const f = 0.84 + r() * 0.13; // building runs a bit under the cautious baseline most days
    const p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28;
    const a1 = 1.2 + r() * 1.6, a2 = 0.6 + r() * 1.2;
    const curve: number[] = [];
    for (let s = 0; s < SLOTS; s++) {
      const h = START_H + s * SLOT_H;
      const wobble = a1 * Math.sin(s * 0.33 + p1) + a2 * Math.sin(s * 0.9 + p2) + 0.6 * Math.sin(s * 1.7 + p3);
      let total = baseAtHour(h) * f + wobble + PLAN.chargerKw[s];
      total = Math.min(total, 98.9 - r() * 1.3);
      curve.push(Math.max(0, total));
    }
    days.push(curve);
  }
  for (const b of BAD_DAYS) {
    for (let s = 0; s < SLOTS; s++) {
      const bump = Math.exp(-Math.pow((s - b.slot) / 1.3, 2));
      const raw = days[b.day][s];
      const target = b.peak;
      days[b.day][s] = Math.max(raw, raw + (target - days[b.day][b.slot]) * bump);
    }
    days[b.day][b.slot] = b.peak;
  }
  return days;
};

export const DAYS = buildDays();
export const daysOver = () => DAYS.filter((c) => Math.max(...c) > LIMIT).length;
export const worstPeak = () => Math.max(...DAYS.map((c) => Math.max(...c)));
