export type Condition = { category: string; month: string; level: number; level_value_kwh: number | null };
export type VanOverride = { name?: string; arrival_slot: number; departure_slot: number; energy_kwh: number; charger_kw: number };
export type Scenario = Pick<Condition, "category" | "month" | "level"> & {
  postcode: string; vans: number; limit_kw: number; extra_kw: number; off_peak: [string, string];
  arrival: [string, string]; departure: [string, string]; energy_kwh: [number, number];
  charger_kw: number; battery_kwh: number; battery_kw: number; q: number; tolerance: number; seed: number; overrides?: Record<number, VanOverride>;
};
export type Area = {
  area_name: string | null; status: string; operator: string | null; queue_requests: number | null;
  queue_mw: number | null; expected_fix_year: number | null; info_url: string | null;
  data_date: string; ambiguous: boolean; note: string | null;
  projects: { name: string | null; expected: string | null; phase: string | null }[];
};
type Risk = { days_over_pct: number; worst_overshoot_kw: number; worst_overshoot_time: string };
export type OptimizeResult = {
  schedule: { power: number[][]; battery_charge: number[]; battery_discharge: number[];
    battery_soc_kwh: number[]; unmet_kwh: number[]; peak_kw: number; blocked_slots: number[];
    status: string; solve_seconds: number };
  report: Risk & { n_windows: number; over_by_slot: number[]; baseline_alone_over_pct: number;
    mean_overshoot_kwh: number; vans_short: [string, number][];
    verdict: "fits" | "fits_with_risk" | "does_not_fit"; immediate: Risk | null };
  vans: (VanOverride & { name: string })[];
  baseline_kw: number[]; limit_kw: number[]; immediate_power_kw: number[]; normal_band_kw: [number[], number[]];
};
export type Reality = { sbi_code: string; summary: string; glass_band: [number[], number[], number[]]; liander_band: [(number | null)[], number[], (number | null)[]] };
export type Sweep = { n?: number; capacity_kwh?: number; days_over_pct: number | null; kwh_short: number | null;
  status: string; smallest_fit?: boolean };

const origin = import.meta.env["VITE_GRIDFLEX_API_URL"] ?? "http://127.0.0.1:8000";
async function request(path: string, body?: unknown): Promise<Response> {
  const response = await fetch(origin + path, body === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    if (path === "/batch-report/progress" && response.status === 404 && error?.detail === "Not Found") {
      throw new Error(`This GridFlex API at ${origin} is missing the multi-depot endpoint. Restart it from the current checkout and try again.`);
    }
    throw new Error(typeof error?.detail === "string" ? error.detail : `Request failed (${response.status}).`);
  }
  return response;
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  return (await request(path, body)).json();
}

export type PortfolioSite = { site: string; postcode: string; province: string | null; vans: number } & (
  { error: string } |
  { full: number; unmet_kwh: number; breach_pct: number; immediate_pct: number; worst_kw: number;
    verdict: OptimizeResult["report"]["verdict"]; status: string; scenario: Scenario; detail: OptimizeResult; area: Area | null }
);
type PortfolioEvent = { type: "start"; total: number } | { type: "site"; result: PortfolioSite } | { type: "pdf"; content: string };

export async function simulatePortfolio(csv: string, onProgress: (event: Exclude<PortfolioEvent, { type: "pdf" }>) => void) {
  const response = await request("/batch-report/progress", { csv });
  const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
  if (!reader) throw new Error("The API did not return a report stream.");
  let pending = "";
  let report: Blob | undefined;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = (pending + value).split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        const event: PortfolioEvent = JSON.parse(line);
        if (event.type === "pdf") {
          const bytes = Uint8Array.from(atob(event.content), (char) => char.charCodeAt(0));
          report = new Blob([bytes], { type: "application/pdf" });
        } else {
          onProgress(event);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (!report) throw new Error("The simulation ended before the PDF was ready. Try running it again.");
  return report;
}

export type Evidence = { id: string; text: string };
export type ExplanationProvider = "groq" | "ollama";
export type ExplanationResponse = { text: string; source: ExplanationProvider | "template"; evidence: Evidence[] };
export type WhatIfAction = "extra_capacity" | "later_departure" | "battery";
export type ComparisonMetrics = { vans_full: number; vans_total: number; unmet_kwh: number; days_over_pct: number; worst_overshoot_kw: number; status: string };
export type WhatIfResponse = { description: string; current: ComparisonMetrics; changed: ComparisonMetrics; scenario: Scenario };
