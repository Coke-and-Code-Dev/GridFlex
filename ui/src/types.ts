export type Condition = { category: string; month: string; level: number; level_value_kwh: number | null; label: string };
/** Building load: the site's own meter upload or the sector profile scaled to the bill. "profile" (a fixed GLASS level) is only used by the API and batch CSV. */
export type LoadSource = "meter" | "bill" | "profile";
export type VanOverride = { name?: string; arrival_slot: number; departure_slot: number; energy_kwh: number; charger_kw: number };
export type Scenario = Pick<Condition, "category" | "month" | "level"> & {
  load_source: LoadSource; monthly_kwh?: number | null; meter_id?: string | null;
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
    verdict: "fits" | "fits_with_risk" | "does_not_fit"; immediate: Risk | null; synthetic: boolean };
  load: LoadInfo | null;
  vans: (VanOverride & { name: string })[];
  baseline_kw: number[]; limit_kw: number[]; immediate_power_kw: number[]; normal_band_kw: [number[], number[]];
};
export type LoadInfo = { source: LoadSource; description: string; synthetic: boolean; n_planning: number; n_test: number;
  level: number | null; scale: number; warnings: string[] };
export type MeterUpload = { meter_id: string; days: number; first_date: string; last_date: string; dropped_days: number;
  monthly_kwh: number; peak_kw: number; planning_days: number; test_days: number; description: string; warnings: string[] };
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
    const detail = error?.detail;
    if (typeof detail === "string") throw new Error(detail);
    if (Array.isArray(detail)) {
      const messages = detail.slice(0, 4).map((issue) => {
        if (typeof issue?.msg !== "string") return "";
        const field = Array.isArray(issue.loc) ? issue.loc.filter((part: unknown) => part !== "body").join(".") : "";
        return field ? `${field}: ${issue.msg}` : issue.msg;
      }).filter(Boolean);
      if (messages.length) throw new Error(messages.join(" · "));
    }
    throw new Error(`Request failed (${response.status}).`);
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
type PortfolioEvent = { type: "start"; total: number; run_id: string } | { type: "site"; result: PortfolioSite } | { type: "pdf"; content: string };

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
