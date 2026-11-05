import type { OptimizeResult } from "@/types";

export function slotClock(slot: number) {
  const minutes = (720 + slot * 15) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function endTime(slot: number) {
  return `${slotClock(slot)}${slot >= 48 ? " next day" : " same day"}`;
}

export function scheduleAnswer(question: string, result: { schedule: Pick<OptimizeResult["schedule"], "power" | "unmet_kwh">; vans: Pick<OptimizeResult["vans"][number], "name">[] }) {
  const asksTime = /\b(?:when|what time|by what time)\b/i.test(question);
  const asksCompletion = /\b(?:finish\w*|complet\w*|fully charged|done|end\w*)\b/i.test(question);
  const asksCharging = /\b(?:charg\w*|vans?|fleet)\b/i.test(question);
  if (!asksTime || !asksCompletion || !asksCharging || /\b(?:if|would|could|earlier|later|instead)\b/i.test(question)) {
    return undefined;
  }

  // The export and the heatmap use these same power rows. Each cell is the
  // power during a quarter-hour, so charging ends at the following boundary.
  const vans = result.vans.map(({ name }, index) => ({
    name,
    end: (result.schedule.power[index] ?? []).reduce((end, kw, slot) => kw > 0 ? slot + 1 : end, 0),
    short: result.schedule.unmet_kwh[index] ?? 0,
  }));
  const describe = ({ name, end, short }: (typeof vans)[number]) => {
    if (end === 0) return short > 0 ? `${name}: no charging scheduled, ${short.toFixed(2)} kWh short.` : `${name}: no charging needed.`;
    return short > 0
      ? `${name}: charging ends at ${endTime(end)}, ${short.toFixed(2)} kWh short.`
      : `${name}: finishes at ${endTime(end)}.`;
  };

  const requested = new Set(Array.from(question.matchAll(/\bvan\s*#?\s*(\d+)\b/gi), (match) => Number(match[1])));
  if (requested.size) {
    return Array.from(requested, (number) => {
      const van = vans[number - 1];
      return van ? describe(van) : `Van ${number} is outside this run's fleet.`;
    }).join("\n");
  }

  const last = Math.max(0, ...vans.map(({ end }) => end));
  const shortCount = vans.filter(({ short }) => short > 0).length;
  const lastNames = vans.filter(({ end }) => end === last && end > 0).map(({ name }) => name).join(", ");
  const summary = last
    ? `The last scheduled charging ends at ${endTime(last)} (${lastNames}).`
    : "No charging is scheduled in this run.";
  const outcome = shortCount ? ` ${shortCount} of ${vans.length} vans still fall short of their targets.` : " Every van meets its energy target.";
  return [summary + outcome, "", ...vans.map(describe)].join("\n");
}
