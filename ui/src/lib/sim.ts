// Deterministic synthetic depot-charging simulator. All data is synthetic.
export type Config = {
  site: string;
  vans: number;
  gridLimitKw: number;
  chargerKw: number;
  energyPerVanKwh: number;
  batteryKwh: number;
  batteryKw: number;
  riskMarginPct: number;
  seed: number;
};

export type PresetKey = "normal" | "tight" | "battery";
export const PRESETS: Record<PresetKey, Config> = {
  normal: { site: "Depot Amsterdam-West", vans: 12, gridLimitKw: 250, chargerKw: 22, energyPerVanKwh: 55, batteryKwh: 0, batteryKw: 0, riskMarginPct: 5, seed: 7 },
  tight: { site: "Depot Amsterdam-West", vans: 24, gridLimitKw: 160, chargerKw: 22, energyPerVanKwh: 70, batteryKwh: 0, batteryKw: 0, riskMarginPct: 5, seed: 7 },
  battery: { site: "Depot Amsterdam-West", vans: 24, gridLimitKw: 160, chargerKw: 22, energyPerVanKwh: 70, batteryKwh: 300, batteryKw: 80, riskMarginPct: 5, seed: 7 },
};

export const HOURS = Array.from({ length: 24 }, (_, i) => (12 + i) % 24); // noon to noon
export const ARRIVE = 6; // 18:00
export const DEPART = 19; // 07:00 exclusive

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

function baseLoad(i: number, scale: number) {
  const h = HOURS[i]!;
  const day = h >= 7 && h < 19 ? 90 : 35;
  const peak = h >= 17 && h < 21 ? 40 : 0;
  return Math.round((day + peak) * scale);
}

export type DayResult = {
  day: number;
  base: number[];
  immediate: number[];
  optimized: number[];
  battery: number[];
  soc: number[];
  schedule: number[][];
  needs: number[];
  immShort: number;
  optShort: number;
  immFull: number;
  optFull: number;
};
export type Summary = { daysOver: number; worstOvershoot: number; vansFull: number; kwhShort: number };
export type Verdict = "safe" | "caution" | "unsafe";
export type Result = { days: DayResult[]; imm: Summary; opt: Summary; verdict: Verdict };

export function simulate(c: Config, nDays = 7): Result {
  const r = rng(c.seed * 9973 + c.vans * 31 + c.gridLimitKw);
  const cap = c.gridLimitKw * (1 - c.riskMarginPct / 100);
  const days: DayResult[] = [];
  for (let d = 0; d < nDays; d++) {
    const scale = 0.85 + r() * 0.3;
    const base = HOURS.map((_, i) => baseLoad(i, scale));
    const needs = Array.from({ length: c.vans }, () => Math.round(c.energyPerVanKwh * (0.7 + r() * 0.5)));
    const immRem = [...needs];
    const immediate = base.map((b, i) => {
      let add = 0;
      if (i >= ARRIVE && i < DEPART)
        immRem.forEach((e, v) => {
          const k = Math.min(c.chargerKw, e);
          immRem[v] = e - k;
          add += k;
        });
      return b + add;
    });
    let soc = c.batteryKwh * 0.5;
    const rem = [...needs];
    const schedule = needs.map(() => HOURS.map(() => 0));
    const battery: number[] = [];
    const socs: number[] = [];
    const optimized: number[] = [];
    for (let i = 0; i < 24; i++) {
      let head = cap - base[i]!;
      let batt = 0;
      if (i < ARRIVE || i >= DEPART) {
        const chg = Math.max(0, Math.min(c.batteryKw, c.batteryKwh - soc, head));
        soc += chg;
        batt = -chg;
      } else {
        const demand = rem.reduce((a, e) => a + Math.min(c.chargerKw, e), 0);
        const want = Math.max(0, demand - Math.max(0, head));
        const dis = Math.min(c.batteryKw, soc, want);
        soc -= dis;
        batt = dis;
        head += dis;
        const order = rem.map((e, v) => [e, v]).sort((a, b) => b[0]! - a[0]!) as [number, number][];
        for (const [, v] of order) {
          if (head <= 0) break;
          const k = Math.min(c.chargerKw, rem[v]!, head);
          schedule[v]![i] = k;
          rem[v] = rem[v]! - k;
          head -= k;
        }
      }
      const vanLoad = schedule.reduce((a, s) => a + s[i]!, 0);
      optimized.push(base[i]! + vanLoad - batt);
      battery.push(batt);
      socs.push(soc);
    }
    const pos = (a: number[]) => a.reduce((x, y) => x + Math.max(0, y), 0);
    days.push({
      day: d + 1, base, immediate, optimized, battery, soc: socs, schedule, needs,
      immShort: pos(immRem), optShort: pos(rem),
      immFull: immRem.filter((e) => e <= 0.01).length,
      optFull: rem.filter((e) => e <= 0.01).length,
    });
  }
  const summarize = (key: "immediate" | "optimized", s: "immShort" | "optShort", f: "immFull" | "optFull"): Summary => ({
    daysOver: days.filter((d) => Math.max(...d[key]) > c.gridLimitKw + 1e-6).length,
    worstOvershoot: Math.max(0, ...days.map((d) => Math.max(...d[key]) - c.gridLimitKw)),
    vansFull: Math.round(days.reduce((a, d) => a + d[f], 0) / nDays),
    kwhShort: Math.round(days.reduce((a, d) => a + d[s], 0)),
  });
  const imm = summarize("immediate", "immShort", "immFull");
  const opt = summarize("optimized", "optShort", "optFull");
  const verdict: Verdict = opt.daysOver > 0 ? "unsafe" : opt.kwhShort > 0 ? "caution" : "safe";
  return { days, imm, opt, verdict };
}

export function toCsv(c: Config, r: Result) {
  const rows = ["synthetic,day,hour,base_kw,immediate_kw,optimized_kw,battery_kw,battery_soc_kwh,limit_kw"];
  r.days.forEach((d) =>
    HOURS.forEach((h, i) =>
      rows.push(["yes", d.day, `${String(h).padStart(2, "0")}:00`, d.base[i], d.immediate[i], (d.optimized[i] ?? 0).toFixed(1), (d.battery[i] ?? 0).toFixed(1), (d.soc[i] ?? 0).toFixed(1), c.gridLimitKw].join(",")),
    ),
  );
  return rows.join("\n");
}

export function explain(c: Config, r: Result) {
  const { imm, opt } = r;
  return [
    `Charging all ${c.vans} vans at ${c.chargerKw} kW on arrival exceeded the ${c.gridLimitKw} kW limit on ${imm.daysOver} of ${r.days.length} synthetic days, peaking ${imm.worstOvershoot.toFixed(0)} kW over.`,
    `The optimized schedule keeps ${c.riskMarginPct}% headroom and spreads charging through the night: ${opt.daysOver} day(s) over the limit, worst overshoot ${opt.worstOvershoot.toFixed(0)} kW.`,
    opt.kwhShort > 0
      ? `Trade-off: ${opt.kwhShort} kWh could not be delivered across the week; on average ${opt.vansFull} of ${c.vans} vans leave fully charged.`
      : `All energy needs were met; on average ${opt.vansFull} of ${c.vans} vans leave fully charged.`,
    c.batteryKwh > 0
      ? `The ${c.batteryKwh} kWh site battery charges in the afternoon and discharges up to ${c.batteryKw} kW overnight.`
      : `No site battery is configured.`,
  ];
}

export function diff(prev: Result | null, next: Result) {
  if (!prev) return [];
  const out: string[] = [];
  const f = (label: string, a: number, b: number, unit = "") => {
    if (Math.round(a) !== Math.round(b)) out.push(`${label}: ${Math.round(a)}${unit} → ${Math.round(b)}${unit}`);
  };
  f("Days over limit", prev.opt.daysOver, next.opt.daysOver);
  f("Worst overshoot", prev.opt.worstOvershoot, next.opt.worstOvershoot, " kW");
  f("Vans fully charged", prev.opt.vansFull, next.opt.vansFull);
  f("kWh short", prev.opt.kwhShort, next.opt.kwhShort, " kWh");
  if (prev.verdict !== next.verdict) out.push(`Verdict: ${prev.verdict} → ${next.verdict}`);
  return out.length ? out : ["No change in headline results."];
}

export function answer(q: string, c: Config, r: Result) {
  const s = q.toLowerCase();
  if (s.includes("battery"))
    return c.batteryKwh
      ? `With ${c.batteryKwh} kWh / ${c.batteryKw} kW the week ends ${r.opt.kwhShort} kWh short. Compare against the Tight preset to see the battery's effect.`
      : `No battery is configured. The Battery preset adds 300 kWh / 80 kW — rerun to see its effect.`;
  if (s.includes("short") || s.includes("kwh") || s.includes("full"))
    return `Optimized: ${r.opt.kwhShort} kWh short over the week, ${r.opt.vansFull}/${c.vans} vans full on average. Raise capacity, lower the risk margin, or add a battery to close the gap.`;
  if (s.includes("risk") || s.includes("margin"))
    return `The ${c.riskMarginPct}% margin caps planning at ${(c.gridLimitKw * (1 - c.riskMarginPct / 100)).toFixed(0)} kW. Lower margin = more energy, less safety.`;
  if (s.includes("why") || s.includes("limit") || s.includes("over"))
    return `Immediate charging stacks ${c.vans}×${c.chargerKw} = ${c.vans * c.chargerKw} kW on top of the evening base load, against a ${c.gridLimitKw} kW limit.`;
  return `Verdict is "${r.verdict}". Try asking about the battery, the limit, the shortfall or the risk margin.`;
}
