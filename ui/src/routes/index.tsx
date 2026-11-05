import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { api, type Area, type Condition, type OptimizeResult, type Reality, type Scenario, type Sweep, type VanOverride, type ExplanationResponse, type WhatIfAction, type WhatIfResponse } from "@/types";
import { LoadChart, Heatmap } from "@/components/gridflex/Charts";

import { Help, helpText } from "@/components/gridflex/Help";

function Hint({ label }: { label: string }) {
  return <Help label={label} text={helpText[label] ?? ""} />;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GridFlex AI — Fleet Charging Dashboard Demo" },
      { name: "description", content: "Synthetic demo: plan overnight EV van charging under a grid limit, compare schedules and review results." },
      { property: "og:title", content: "GridFlex AI — Fleet Charging Dashboard Demo" },
      { property: "og:description", content: "Plan EV fleet charging under a grid limit with synthetic scenarios." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const STEPS = ["Welcome", "Configure", "Immediate", "Compare", "Explanation", "Edge case"];

function useParallax() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;
    const on = () => setY(window.scrollY);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return y;
}

function Synthetic() {
  return <span className="rounded-full border border-primary/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">Synthetic data</span>;
}

function Section({ id, n, title, children }: { id: string; n: number; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="animate-rise scroll-mt-20 py-14">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-primary">0{n}</span>
        <h2 id={`${id}-h`} className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h2>
        <Synthetic />
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, min, max, step = 1, unit }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit: string }) {
  const id = label.replace(/\W/g, "");
  return (
    <div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span><label htmlFor={id}>{label}</label><Hint label={label} /></span>
        <span className="font-mono text-foreground">{value} {unit}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-primary" />
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "bad" | "good" }) {
  const c = tone === "bad" ? "text-destructive" : tone === "good" ? "text-success" : "text-foreground";
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}<Hint label={label} /></div>
      <div className={`mt-1 font-mono text-2xl font-semibold ${c}`}>{value}</div>
    </div>
  );
}

const btn = "rounded-lg px-4 py-2 text-sm font-medium transition-colors";
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:shadow-glow`;
const btnGhost = `${btn} border border-border hover:bg-accent`;

const initial: Scenario = {
  category: "009", month: "2023-01", level: 1, postcode: "1181KJ", vans: 10, limit_kw: 100,
  extra_kw: 0, off_peak: ["22:00", "06:00"], arrival: ["17:00", "19:00"], departure: ["06:00", "07:00"],
  energy_kwh: [30, 40], charger_kw: 11, battery_kwh: 0, battery_kw: 0, q: .9, tolerance: .05, seed: 42,
};

const time = (slot: number) => {
  const minutes = (720 + slot * 15) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function Dashboard() {
  const py = useParallax();
  const [cfg, setCfg] = useState(initial);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [run, setRun] = useState<{ cfg: Scenario; previous: Scenario | undefined; result: OptimizeResult }>();
  const [area, setArea] = useState<Area>();
  const [areaStatus, setAreaStatus] = useState("");
  const [checks, setChecks] = useState<Reality[]>([]);
  const [sweeps, setSweeps] = useState<{ label: string; rows: Sweep[] }[]>([]);
  const [sweeping, setSweeping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [explanation, setExplanation] = useState("");
  const [explanationSource, setExplanationSource] = useState<"groq" | "template">("template");
  const [selectedSlot, setSelectedSlot] = useState(24);
  const [whatIf, setWhatIf] = useState<WhatIfResponse>();
  const [whatIfBusy, setWhatIfBusy] = useState(false);
  const [whatIfError, setWhatIfError] = useState("");
  const [q, setQ] = useState("");
  const [qa, setQa] = useState<{ question: string; text: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const [decision, setDecision] = useState("");

  useEffect(() => {
    api<Condition[]>("/conditions").then(setConditions).catch(() => setError("Could not load conditions. Start the local GridFlex API."));
  }, []);
  useEffect(() => {
    let active = true;
    setArea(undefined);
    setAreaStatus("");
    if (!cfg.postcode.trim()) return;
    const timer = window.setTimeout(() => {
      api<Area>(`/area/${encodeURIComponent(cfg.postcode.trim())}`)
        .then((value) => { if (active) setArea(value); })
        .catch((err: Error) => { if (active) setAreaStatus(err.message === "Failed to fetch" ? "Capacity map service unavailable." : err.message); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [cfg.postcode]);

  const set = <K extends keyof Scenario>(key: K, value: Scenario[K]) => setCfg((old) => ({ ...old, [key]: value }));

  async function optimize() {
    if (busy || asking || sweeping || whatIfBusy) return;
    const snapshot = cfg;
    const previous = run?.cfg;
    setBusy(true);
    setError("");
    try {
      const result = await api<OptimizeResult>("/optimize", snapshot);
      setRun({ cfg: snapshot, previous, result });
      setExplanation("");
      setWhatIf(undefined);
      setWhatIfError("");
      setSelectedSlot(24);
      setDecision("");
      setQa([]);
      setChecks([]);
      setSweeps([]);
      const params = new URLSearchParams({ category: snapshot.category, month: snapshot.month, level: String(snapshot.level) });
      await Promise.allSettled([
        api<Reality[]>(`/reality?${params}`).then(setChecks),
        api<ExplanationResponse>("/explain", { scenario: snapshot, previous })
          .then(({ text, source }) => { setExplanation(text); setExplanationSource(source); })
          .catch(() => { setExplanationSource("template"); setExplanation(`The plan exceeded the limit in ${result.report.days_over_pct.toFixed(2)}% of held-out windows and left ${sum(result.schedule.unmet_kwh).toFixed(2)} kWh unmet.`); }),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Optimization failed.");
    } finally {
      setBusy(false);
    }
  }

  async function ask(question: string) {
    if (!run || busy || asking || whatIfBusy || !question.trim()) return;
    setAsking(true);
    setQ("");
    try {
      const { text } = await api<{ text: string }>("/explain", { scenario: run.cfg, previous: run.previous, question });
      setQa((items) => [...items, { question, text }]);
    } catch {
      setQa((items) => [...items, { question, text: "The explanation endpoint is unavailable. See the current replay metrics above." }]);
    } finally {
      setAsking(false);
    }
  }

  async function compareWhatIf(action: WhatIfAction) {
    if (!run || whatIfBusy || busy) return;
    setWhatIfBusy(true);
    setWhatIfError("");
    setWhatIf(undefined);
    try {
      setWhatIf(await api<WhatIfResponse>("/what-if", { scenario: run.cfg, action }));
    } catch (err) {
      setWhatIfError(err instanceof Error ? err.message : "Comparison failed.");
    } finally {
      setWhatIfBusy(false);
    }
  }

  async function sweep() {
    if (!run || sweeping || busy || whatIfBusy) return;
    setSweeping(true);
    setError("");
    try {
      const [chargers, batteries] = await Promise.all([
        api<{ without_battery: Sweep[]; with_battery: Sweep[] }>("/sweep", { scenario: run.cfg, kind: "chargers" }),
        api<Sweep[]>("/sweep", { scenario: run.cfg, kind: "battery" }),
      ]);
      setSweeps([
        { label: "Chargers without battery", rows: chargers.without_battery },
        { label: "Chargers with configured battery", rows: chargers.with_battery },
        { label: "Battery capacities", rows: batteries },
      ].filter(({ rows }) => rows.length));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sweep failed.");
    } finally {
      setSweeping(false);
    }
  }

  function exportCsv() {
    if (!run) return;
    const { schedule, vans } = run.result;
    const rows = schedule.power.flatMap((slots, van) => slots.map((kw, slot) =>
      `${vans[van]?.name},${slot},${time(slot)},${kw},${kw / 4}`));
    const url = URL.createObjectURL(new Blob([["van,slot,start_time,charging_kw,charging_kwh", ...rows].join("\r\n")], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "gridflex-synthetic-schedule.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const r = run?.result;
  const s = r?.schedule;
  const report = r?.report;
  const fields = [
    ["Fleet size", "vans", 1, 40, 1, "vans"], ["Connection limit", "limit_kw", 60, 160, 1, "kW"],
    ["Off-peak uplift", "extra_kw", 0, 160, 1, "kW"], ["Charger power", "charger_kw", 1, 50, 1, "kW"],
    ["Battery capacity", "battery_kwh", 0, 800, 10, "kWh"], ["Battery power", "battery_kw", 0, 250, 1, "kW"],
    ["Caution quantile", "q", .5, .99, .01, ""],
  ] as const;

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div aria-hidden className="grid-bg pointer-events-none fixed inset-0 opacity-60" style={{ transform: `translateY(${py * -0.15}px)` }} />
      <div aria-hidden className="pointer-events-none fixed -right-40 top-20 h-[32rem] w-[32rem] rounded-full bg-primary/10 blur-3xl" style={{ transform: `translateY(${py * -0.35}px)` }} />

      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <nav aria-label="Flow" className="mx-auto flex max-w-6xl items-center gap-6 overflow-x-auto px-6 py-3 text-sm">
          <span className="font-bold whitespace-nowrap"><span className="text-primary">▮</span> GridFlex AI</span>
          {STEPS.map((s, i) => (
            <a key={s} href={`#${s.toLowerCase().replace(" ", "-")}`} className="whitespace-nowrap text-muted-foreground hover:text-primary">
              <span className="font-mono text-xs">0{i + 1}</span> {s}
            </a>
          ))}
        </nav>
      </header>

      <main className="relative mx-auto max-w-6xl px-6">
        {/* 01 Welcome */}
        <section id="welcome" className="flex min-h-[80vh] flex-col justify-center py-20" style={{ transform: `translateY(${py * 0.12}px)` }}>
          <Synthetic />
          <h1 className="mt-6 max-w-4xl text-5xl font-bold leading-[1.02] tracking-tight md:text-7xl">
            Plan fleet charging. <span className="text-primary">See the risk.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            A demo planner for overnight depot charging. Set your site, run the scheduler and replay on held-out synthetic profiles, and see how a planned schedule compares with plugging everything in at once.
          </p>
          <div className="mt-8 flex gap-3">
            <a href="#configure" className={btnPrimary}>Start planning</a>
            <a href="#edge-case" className={btnGhost}>See the edge case</a>
          </div>
          <p className="mt-10 font-mono text-xs text-muted-foreground">Synthetic load profiles · Held-out replay · Human decision</p>
        </section>

        {/* 02 Configure */}
        <Section id="configure" n={2} title="Configure your depot">
          <div className="panel grid gap-5 p-6 sm:grid-cols-2">
            <div><label>Postcode<input className="ml-3 rounded border border-input bg-background p-2" value={cfg.postcode} onChange={(e) => set("postcode", e.target.value)} /></label><Hint label="Postcode" /></div>
            <div><label>Business profile <select className="rounded border border-input bg-background p-2" value={`${cfg.category}/${cfg.month}/${cfg.level}`}
              onChange={(e) => {
                const c = conditions.find((item) => `${item.category}/${item.month}/${item.level}` === e.target.value);
                if (c) setCfg((old) => ({ ...old, category: c.category, month: c.month, level: c.level }));
              }}>
              {(conditions.length ? conditions : [{ ...initial, level_value_kwh: null }]).map((c) => (
                <option key={`${c.category}/${c.month}/${c.level}`} value={`${c.category}/${c.month}/${c.level}`}>
                  {c.category === "009" ? "Transport and storage" : c.category === "008" ? "Wholesale and retail" : c.category} · {c.month} · {c.level_value_kwh == null ? `Level ${c.level}` : `≈ ${(c.level_value_kwh / 1000).toFixed(1)} MWh/month`}
                </option>
              ))}
            </select></label><Hint label="Business profile" /></div>
            {fields.map(([label, key, min, max, step, unit]) =>
              <Field key={key} label={label} value={cfg[key]} min={min} max={max} step={step} unit={unit} onChange={(value) => {
                if (key === "vans") setCfg((old) => ({
                  ...old, vans: value,
                  overrides: Object.fromEntries(Object.entries(old.overrides ?? {}).filter(([index]) => Number(index) < value)),
                }));
                else set(key, value);
              }} />)}
            <Field label="Risk tolerance" value={Math.round(cfg.tolerance * 100)} min={0} max={100} unit="%" onChange={(value) => set("tolerance", value / 100)} />
            {(["arrival", "departure", "off_peak"] as const).map((key) => (
              <fieldset key={key} className="flex flex-wrap gap-3">
                <legend>{key === "off_peak" ? "Off-peak window" : `${key} window`}</legend>
                <Hint label={key === "off_peak" ? "Off-peak window" : key === "arrival" ? "Arrival window" : "Departure window"} />
                {([0, 1] as const).map((i) => <label key={i}>{i ? "End" : "Start"} <input type="time" step={900} value={cfg[key][i]}
                  className="rounded border border-input bg-background p-1"
                  onChange={(e) => set(key, i ? [cfg[key][0], e.target.value] : [e.target.value, cfg[key][1]])} /></label>)}
              </fieldset>
            ))}
            <Field label="Energy per van" value={cfg.energy_kwh[1]} min={5} max={120} unit="kWh maximum" onChange={(value) => set("energy_kwh", [Math.max(0, value - 10), value])} />
            <details className="sm:col-span-2">
              <summary className="cursor-pointer">Advanced · edit individual vans</summary>
              <p className="my-2 text-sm text-muted-foreground"><Hint label="Individual vans" /> Run Optimize once to generate van requests. Times are slots from noon, in 15-minute increments.</p>
              {r && <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead><tr><th>Van</th><th>Arrival slot</th><th>Departure slot</th><th>Energy (kWh)</th><th>Charger (kW)</th></tr></thead>
                <tbody>{r.vans.slice(0, cfg.vans).map(({ name, ...van }, index) => (
                  <tr key={name}><th>{name}</th>{([
                    ["arrival_slot", 0, 95, 1], ["departure_slot", 1, 96, 1],
                    ["energy_kwh", 0, 120, .01], ["charger_kw", 1, 50, 1],
                  ] as const).map(([key, min, max, step]) => {
                    const current: VanOverride = cfg.overrides?.[index] ?? van;
                    return <td key={key}><input className="w-24 rounded border border-input bg-background p-1"
                      aria-label={`${name} ${key.replaceAll("_", " ")}`} type="number" min={min} max={max} step={step}
                      value={current[key]} onChange={(e) => set("overrides", {
                        ...cfg.overrides, [index]: { ...current, [key]: Number(e.target.value) },
                      })} /></td>;
                  })}</tr>
                ))}</tbody></table></div>}
              {Object.keys(cfg.overrides ?? {}).length > 0 && <button className={btnGhost} onClick={() => set("overrides", {})}>Clear van overrides</button>}
            </details>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Hint label="Scenario presets" /><button className={btnGhost} onClick={() => setCfg(initial)}>Development scenario</button>
              <button className={btnGhost} onClick={() => setCfg({ ...initial, vans: 14, limit_kw: 65 })}>Tight connection</button>
              <button className={btnGhost} onClick={() => setCfg({ ...initial, vans: 14, limit_kw: 65, battery_kwh: 60, battery_kw: 20 })}>Battery scenario</button>
              <button className={btnPrimary} disabled={busy || asking || sweeping || whatIfBusy} onClick={optimize}>{busy ? "Running…" : "Optimize"}</button><Hint label="Optimize" />
            </div>
            {error && <p role="alert" className="text-destructive sm:col-span-2">{error}</p>}
          </div>
          <article className="panel mt-4 p-5">
            <h3 className="font-semibold">Your area <Hint label="Your area" /></h3>
            {area ? <>
              <p className={area.status === "shortage" ? "text-destructive" : area.status === "available" ? "text-success" : "text-primary"}>{area.area_name ?? "No information"} · {area.status.replaceAll("_", " ")}</p>
              <p>Waiting list: {area.queue_requests ?? "No information"} requests · {area.queue_mw?.toFixed(2) ?? "No information"} MW. Expected fix: {area.expected_fix_year ?? "No information"}.</p>
              <p>Grid operator: {area.operator ?? "No information"}. Map date: {area.data_date}.</p>
              <p>{area.ambiguous ? "This postcode spans multiple areas. The most severe status is shown. " : ""}{area.note}</p>
              {area.projects.length ? <ul>{area.projects.map((project, i) => <li key={i}>{project.name ?? "No information"} · {project.expected ?? "No information"}</li>)}</ul> : <p>No project information.</p>}
              {area.info_url && <a className="underline" href={area.info_url}>Grid operator information</a>}
            </> : <p>{areaStatus || "Enter a postcode to check the capacity map."}</p>}
            <p className="text-sm text-muted-foreground">Netbeheer Nederland, capaciteitskaart. Indicative; check with your grid operator.</p>
          </article>
        </Section>

        {r && s && report && run ? <>
          <Section id="immediate" n={3} title="Immediate charging">
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Windows over limit" value={report.immediate ? `${report.immediate.days_over_pct.toFixed(2)}%` : "Unavailable"} />
              <Stat label="Worst overshoot" value={report.immediate ? `${report.immediate.worst_overshoot_kw.toFixed(2)} kW` : "Unavailable"} />
              <Stat label="Held-out windows" value={report.n_windows} />
            </div>
          </Section>
          <Section id="compare" n={4} title="Compare charging plans">
            <p className="mb-4" role="status">Verdict: {report.verdict.replaceAll("_", " ")} · Solver: {s.status} · {run.cfg.vans} vans · {run.cfg.month} <Hint label="Verdict and solver" /></p>
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat label="Windows over limit" value={`${report.days_over_pct.toFixed(2)}%`} tone={report.days_over_pct ? "bad" : "good"} />
              <Stat label="Worst overshoot" value={`${report.worst_overshoot_kw.toFixed(2)} kW`} />
              <Stat label="Vans fully charged" value={`${report.vans_short.filter(([, short]) => short === 0).length}/${run.cfg.vans}`} />
              <Stat label="kWh short" value={sum(s.unmet_kwh).toFixed(2)} tone={sum(s.unmet_kwh) ? "bad" : "good"} />
            </div>
            <div className="panel mt-4 p-4">
              <h3 className="font-semibold">Demand chart <Hint label="Demand chart" /></h3>
              <LoadChart title="Planning demand, noon to noon (kW)" limit={r.limit_kw} band={r.normal_band_kw} selectedSlot={selectedSlot} onSelectSlot={setSelectedSlot}
                stacked={[r.baseline_kw, r.baseline_kw.map((kw, slot) => kw + sum(s.power.map((van) => (van[slot] ?? 0))))]}
                series={[
                  { label: "Cautious baseline", data: r.baseline_kw, cls: "stroke-muted-foreground" },
                  { label: "Immediate charging", data: r.baseline_kw.map((kw, slot) => kw + (r.immediate_power_kw[slot] ?? 0)), cls: "stroke-muted-foreground", dash: "4 3" },
                  { label: "Optimized net demand", data: r.baseline_kw.map((kw, slot) => kw + sum(s.power.map((van) => (van[slot] ?? 0))) + (s.battery_charge[slot] ?? 0) - (s.battery_discharge[slot] ?? 0)), cls: "stroke-primary" },
                  ...(run.cfg.battery_kwh ? [
                    { label: "Battery charge", data: s.battery_charge, cls: "stroke-success", dash: "3 3" },
                    { label: "Battery discharge", data: s.battery_discharge, cls: "stroke-success" },
                  ] : []),
                ]} />
              <p className="mt-3 text-sm text-muted-foreground">Click the chart or use the slider to inspect a 15-minute planning interval.</p>
              <label className="mt-3 block text-sm" htmlFor="explain-slot">Selected time: <strong>{time(selectedSlot)}</strong></label>
              <input id="explain-slot" aria-label="Select planning interval" className="w-full accent-primary" type="range" min={0} max={95} step={1} value={selectedSlot} onChange={(e) => setSelectedSlot(Number(e.target.value))} />
              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
                <Row k="Cautious baseline" v={`${(r.baseline_kw[selectedSlot] ?? 0).toFixed(2)} kW`} />
                <Row k="Rounded baseline used by solver" v={`${Math.ceil(r.baseline_kw[selectedSlot] ?? 0)} kW`} />
                <Row k="Van charging" v={`${sum(s.power.map((van) => van[selectedSlot] ?? 0)).toFixed(2)} kW`} />
                <Row k="Battery charge / discharge" v={`${s.battery_charge[selectedSlot] ?? 0} / ${s.battery_discharge[selectedSlot] ?? 0} kW`} />
                <Row k="Conservative planned net demand" v={`${(Math.ceil(r.baseline_kw[selectedSlot] ?? 0) + sum(s.power.map((van) => van[selectedSlot] ?? 0)) + (s.battery_charge[selectedSlot] ?? 0) - (s.battery_discharge[selectedSlot] ?? 0)).toFixed(2)} kW`} />
                <Row k="Modeled limit / rounded limit" v={`${(r.limit_kw[selectedSlot] ?? 0).toFixed(2)} / ${Math.floor(r.limit_kw[selectedSlot] ?? 0)} kW`} />
                <Row k="Conservative headroom" v={`${(Math.floor(r.limit_kw[selectedSlot] ?? 0) - Math.ceil(r.baseline_kw[selectedSlot] ?? 0) - sum(s.power.map((van) => van[selectedSlot] ?? 0)) - (s.battery_charge[selectedSlot] ?? 0) + (s.battery_discharge[selectedSlot] ?? 0)).toFixed(2)} kW`} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">This is the planning profile, not a replayed or measured day. Headroom can be negative when the baseline already exceeds the limit; a tight slot alone does not prove why the solver chose it.</p>
            </div>
            <div className="panel mt-4 p-4">
              <h3 className="font-semibold">Van schedule <Hint label="Van schedule" /></h3>
              <Heatmap schedule={s.power} needs={r.vans.map((van) => Math.ceil(van.energy_kwh * 4) / 4)} chargerKw={run.cfg.charger_kw} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className={btnPrimary} aria-pressed={decision === "approved"} onClick={() => setDecision("approved")}>Approve plan</button>
              <button className={btnGhost} aria-pressed={decision === "rejected"} onClick={() => setDecision("rejected")}>Reject plan</button><Hint label="Approve / Reject" />
              <button className={btnGhost} onClick={exportCsv}>Download schedule (CSV)</button><Hint label="Download schedule (CSV)" />
            </div>
            {decision && <p role="status">Plan {decision} for this demo run.</p>}
          </Section>
          <Section id="explanation" n={5} title="Explanation">
            <article className="panel space-y-4 p-6">
              <p className="text-sm text-muted-foreground">{explanationSource === "groq" ? "Groq-selected evidence from this run’s computed results" : "Template explanation from this run’s computed results"} <Hint label="Explanation and follow-up" /></p>
              <p aria-live="polite">{explanation || "Preparing explanation…"}</p>
              <div className="flex flex-wrap gap-2">
                {["When is risk highest?", "Which vans are short?", "How did the battery help?"].map((question) =>
                  <button key={question} className={btnGhost} disabled={busy || asking} onClick={() => ask(question)}>{question}</button>)}
              </div>
              <ul aria-live="polite">{qa.map(({ question, text }, i) => <li key={i} className="mt-3"><strong>{question}</strong><p>{text}</p></li>)}</ul>
              <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
                <label htmlFor="ask" className="sr-only">Ask about this run</label>
                <input id="ask" className="grow rounded border border-input bg-background p-2" value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this run" />
                <button className={btnPrimary} disabled={busy || asking || !q.trim()}>Ask</button>
              </form>
            </article>
          </Section>
          <section className="panel space-y-4 p-6" aria-labelledby="decision-evidence">
            <h2 id="decision-evidence" className="text-xl font-semibold">Explain this decision</h2>
            <p><strong>Decision:</strong> {report.verdict.replaceAll("_", " ")} · {report.vans_short.filter(([, short]) => short <= 1e-9).length} of {run.cfg.vans} vans meet their rounded request · {sum(s.unmet_kwh).toFixed(2)} kWh unmet.</p>
            <p><strong>Evidence:</strong> {report.days_over_pct.toFixed(2)}% of {report.n_windows} held-out synthetic windows exceed the modeled limit. The worst overshoot is {report.worst_overshoot_kw.toFixed(2)} kW{report.worst_overshoot_time ? ` at ${report.worst_overshoot_time}` : ""}; building demand alone exceeds it in {report.baseline_alone_over_pct.toFixed(2)}% of windows.</p>
            <p><strong>Limits:</strong> Solver status {s.status}; one fixed schedule is replayed against synthetic windows. This is not a real-site guarantee or grid-operator approval.</p>
            <div className="flex flex-wrap gap-2">
              <button className={btnGhost} onClick={() => { const slot = report.over_by_slot.indexOf(Math.max(...report.over_by_slot)); setSelectedSlot(Math.max(0, slot)); document.getElementById("compare")?.scrollIntoView({ behavior: "smooth" }); }} disabled={!report.over_by_slot.some((n) => n > 0)}>Inspect most frequent breach time</button>
              <button className={btnGhost} disabled={!report.worst_overshoot_time} onClick={() => { const [hours, minutes] = report.worst_overshoot_time.split(":").map(Number); setSelectedSlot((((hours ?? 0) * 60 + (minutes ?? 0) - 720 + 1440) % 1440) / 15); document.getElementById("compare")?.scrollIntoView({ behavior: "smooth" }); }}>Inspect worst overshoot time</button>
              <span className="text-xs text-muted-foreground self-center">The most frequent breach slot may differ from the time of the single worst overshoot. The chart shows the planning profile at that clock time, not the replayed worst-case day.</span>
            </div>
            <h3 className="pt-2 font-semibold">What would change the outcome?</h3>
            <p className="text-sm text-muted-foreground">Each option reruns the optimizer and replay on the same synthetic windows. Comparisons are exploratory; equally optimal schedules can differ.</p>
            <div className="flex flex-wrap gap-2">
              <button className={btnGhost} disabled={whatIfBusy || busy} onClick={() => compareWhatIf("extra_capacity")}>Add 10 kW of capacity</button>
              <button className={btnGhost} disabled={whatIfBusy || busy} onClick={() => compareWhatIf("later_departure")}>Depart one hour later</button>
              <button className={btnGhost} disabled={whatIfBusy || busy} onClick={() => compareWhatIf("battery")}>{run.cfg.battery_kwh ? "Remove configured battery" : "Add 60 kWh battery"}</button>
            </div>
            {whatIfBusy && <p role="status">Recalculating both scenarios…</p>}
            {whatIfError && <p role="alert" className="text-destructive">{whatIfError}</p>}
            {whatIf && <div className="overflow-x-auto" aria-live="polite"><p className="mb-2">{whatIf.description}</p>
              <table className="w-full text-left text-sm"><thead><tr><th>Metric</th><th>Current</th><th>Changed</th></tr></thead><tbody>
                <tr><th>Vans fully charged</th><td>{whatIf.current.vans_full}/{whatIf.current.vans_total}</td><td>{whatIf.changed.vans_full}/{whatIf.changed.vans_total}</td></tr>
                <tr><th>Unmet energy</th><td>{whatIf.current.unmet_kwh.toFixed(2)} kWh</td><td>{whatIf.changed.unmet_kwh.toFixed(2)} kWh</td></tr>
                <tr><th>Synthetic windows over limit</th><td>{whatIf.current.days_over_pct.toFixed(2)}%</td><td>{whatIf.changed.days_over_pct.toFixed(2)}%</td></tr>
                <tr><th>Worst overshoot</th><td>{whatIf.current.worst_overshoot_kw.toFixed(2)} kW</td><td>{whatIf.changed.worst_overshoot_kw.toFixed(2)} kW</td></tr>
                <tr><th>Solver status</th><td>{whatIf.current.status}</td><td>{whatIf.changed.status}</td></tr>
              </tbody></table>
              {(whatIf.scenario.battery_kwh > 0 || run.cfg.battery_kwh > 0) && <p className="mt-2 text-xs text-muted-foreground">Battery replay clips negative net demand without recalculating battery state per window; this comparison is exploratory.</p>}
            </div>}
          </section>
          <Section id="edge-case" n={6} title="Risk and sensitivity">
            <div className="panel space-y-2 p-5">
              <Row k="Worst overshoot time" v={report.worst_overshoot_time || "No breaches"} />
              <Row k="Baseline alone over limit" v={`${report.baseline_alone_over_pct.toFixed(2)}%`} />
              <Row k="Blocked planning slots" v={s.blocked_slots.map(time).join(", ") || "None"} />
              <Row k="Vans with shortfalls" v={report.vans_short.filter(([, short]) => short > 0).map(([name, short]) => `${name}: ${short.toFixed(2)} kWh`).join(", ") || "None"} />
              <h3 className="font-semibold">Breach timing <Hint label="Breach timing chart" /></h3>
              <LoadChart title="Number of replay windows breaching the limit by time" series={[{ label: "Windows over limit", data: report.over_by_slot, cls: "stroke-destructive" }]} />
              {!!run.cfg.battery_kwh && <div><h3 className="font-semibold">Battery stored energy <Hint label="Battery chart" /></h3><LoadChart title="Battery stored energy (kWh)" series={[{ label: "Stored energy", data: s.battery_soc_kwh, cls: "stroke-success" }]} /></div>}
              {!!run.cfg.battery_kwh && <p className="text-sm">Replay clips negative net demand without recalculating battery state for each window.</p>}
              <p className="text-sm">15-minute slots. The solver rounds the baseline up and limit down to integer kW, and energy demand up to 0.25 kWh.</p>
            </div>
            <div className="panel mt-4 space-y-4 p-5">
              <button className={btnPrimary} onClick={sweep} disabled={busy || sweeping}>{sweeping ? "Running sweeps…" : "Run exploratory sweeps"}</button><Hint label="Exploratory sweeps" />
              {error && <p role="alert" className="text-destructive">{error}</p>}
              {sweeps.map(({ label, rows }) => <div key={label}><h3 className="font-semibold">{label}</h3>
                <table className="w-full text-left text-sm"><thead><tr><th>Test point</th><th>Windows over</th><th>kWh short</th><th>Solver</th></tr></thead>
                  <tbody>{rows.map((row) => <tr key={row.n ?? row.capacity_kwh}>
                    <td>{row.n ?? `${row.capacity_kwh} kWh`}{row.smallest_fit ? " (smallest tested fit)" : ""}</td>
                    <td>{row.days_over_pct == null ? "—" : <>
                      <meter min={0} max={100} value={row.days_over_pct} aria-label="Windows over limit (%)" className="mr-2 w-24" />
                      {row.days_over_pct.toFixed(2)}%
                    </>}</td>
                    <td>{row.kwh_short?.toFixed(2) ?? "—"}</td><td>{row.status}</td>
                  </tr>)}</tbody></table>
              </div>)}
            </div>
            <div className="panel mt-4 space-y-4 p-5">
              <h3 className="font-semibold">Reality check · GLASS and Liander (2023) <Hint label="Reality check" /></h3>
              {!checks.length && <p>No comparison available for this run.</p>}
              {checks.map((check) => <div key={check.sbi_code}><p>{check.summary}</p>
                <LoadChart title={`Typical working day ${check.sbi_code}, midnight to midnight (relative load)`} startHour={0} band={[check.glass_band[0], check.glass_band[2]]}
                  series={[{ label: "GLASS median", data: check.glass_band[1], cls: "stroke-primary" }, { label: "Liander reference", data: check.liander_band[1].map((v) => v ?? 0), cls: "stroke-success" }]} />
              </div>)}
              <p className="text-sm text-muted-foreground">GLASS was trained on Liander data, so this comparison is not an independent test.</p>
            </div>
          </Section>
        </> : <p className="panel p-8 text-center text-muted-foreground">Choose a scenario and press Optimize to run the planner.</p>}
        <footer className="border-t border-border py-10 text-center font-mono text-xs text-muted-foreground">GLASS (CDLA-Permissive-2.0) · Synthetic data and simulation. Not a grid-operator approval.</footer>
      </main>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between border-b border-border pb-2"><span className="text-muted-foreground">{k}{helpText[k] && <Hint label={k} />}</span><span className="font-mono">{v}</span></div>;
}
