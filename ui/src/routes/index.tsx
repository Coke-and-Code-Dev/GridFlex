import { scheduleAnswer, slotClock as time } from "@/lib/schedule-answer";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { api, type Area, type Condition, type OptimizeResult, type Reality, type Scenario, type Sweep, type VanOverride, type ExplanationResponse, type ExplanationProvider, type WhatIfAction, type WhatIfResponse } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortfolioResults, PortfolioUpload, usePortfolio } from "@/components/gridflex/BatchReport";
import { DepotVan, VAN_DRIVE_MS } from "@/components/gridflex/DepotVan";
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

const TABS = [
  ["welcome", "Welcome"], ["configure", "Setup"],
  ["compare", "Charging plan"], ["schedule", "Van schedule"], ["explanation", "Explanation"], ["analysis", "Analysis"],
] as const;
type DashboardTab = (typeof TABS)[number][0] | "portfolio";
const RESULT_TABS = TABS.slice(2);

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
  category: "009", month: "2023-01", level: 1, postcode: "2311BD", vans: 10, limit_kw: 100,
  extra_kw: 0, off_peak: ["22:00", "06:00"], arrival: ["17:00", "19:00"], departure: ["06:00", "07:00"],
  energy_kwh: [30, 40], charger_kw: 11, battery_kwh: 0, battery_kw: 0, q: .9, tolerance: .05, seed: 42,
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function csvName(name: string) {
  const safe = /^[=+@-]/.test(name.trimStart()) ? "'" + name : name;
  return '"' + safe.replaceAll('"', '""') + '"';
}

function Dashboard() {
  const py = useParallax();
  const [activeTab, setActiveTab] = useState<DashboardTab>("welcome");
  const portfolio = usePortfolio(() => setActiveTab("portfolio"));

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [activeTab]);
  const [cfg, setCfg] = useState(initial);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [run, setRun] = useState<{ cfg: Scenario; previous: Scenario | undefined; result: OptimizeResult }>();
  const [area, setArea] = useState<Area>();
  const [areaStatus, setAreaStatus] = useState("");
  const [checks, setChecks] = useState<Reality[]>([]);
  const [sweeps, setSweeps] = useState<{ label: string; rows: Sweep[] }[]>([]);
  const [sweeping, setSweeping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vanDriving, setVanDriving] = useState(false);
  const [error, setError] = useState("");
  const [explanation, setExplanation] = useState("");
  const [explanationSource, setExplanationSource] = useState<ExplanationProvider | "template">("template");
  const [provider, setProvider] = useState<ExplanationProvider>("groq");
  const [selectedSlot, setSelectedSlot] = useState(24);
  const [whatIf, setWhatIf] = useState<WhatIfResponse>();
  const [whatIfBusy, setWhatIfBusy] = useState(false);
  const [whatIfError, setWhatIfError] = useState("");
  const [q, setQ] = useState("");
  const [qa, setQa] = useState<{ question: string; text: string; source?: ExplanationProvider | "template" | "schedule"; evidence?: { id: string; text: string }[] }[]>([]);
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

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importedFile, setImportedFile] = useState("");

  async function importSetup(file: File) {
    if (importing || busy || asking || sweeping || whatIfBusy) return;
    setImporting(true);
    setImportError("");
    try {
      const scenario = await api<Scenario>("/import-setup", { csv: await file.text() });
      setCfg(scenario);
      setRun(undefined);
      setError("");
      setImportedFile(file.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : "CSV import failed.";
      setImportError(message === "Failed to fetch" ? "Could not reach the GridFlex API. Start it, then try the upload again." : message);
    } finally {
      setImporting(false);
    }
  }

  async function optimize() {
    if (busy || asking || sweeping || whatIfBusy) return;
    const snapshot = cfg;
    const previous = run?.cfg;
    setBusy(true);
    setVanDriving(true);
    setError("");
    const travelTime = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : VAN_DRIVE_MS + 100;
    const startedAt = performance.now();
    try {
      const result = await api<OptimizeResult>("/optimize", snapshot);
      const remainingTravel = travelTime - (performance.now() - startedAt);
      if (remainingTravel > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, remainingTravel));
      }
      setVanDriving(false);
      setActiveTab((current) => current === "configure" ? "compare" : current);
      await applyResult(snapshot, result, previous);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Optimization failed.");
    } finally {
      setVanDriving(false);
      setBusy(false);
    }
  }

  async function applyResult(snapshot: Scenario, result: OptimizeResult, previous?: Scenario) {
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
      api<ExplanationResponse>("/explain", { scenario: snapshot, previous, provider })
        .then(({ text, source }) => { setExplanation(text); setExplanationSource(source); })
        .catch(() => { setExplanationSource("template"); setExplanation(`The plan exceeded the limit in ${result.report.days_over_pct.toFixed(2)}% of held-out windows and left ${sum(result.schedule.unmet_kwh).toFixed(2)} kWh unmet.`); }),
    ]);
  }

  async function ask(question: string) {
    if (!run || busy || asking || whatIfBusy || !question.trim()) return;
    setQ("");
    const scheduled = scheduleAnswer(question, run.result);
    if (scheduled !== undefined) {
      setQa((items) => [...items, { question, text: scheduled, source: "schedule" }]);
      return;
    }
    setAsking(true);
    try {
      const response = await api<ExplanationResponse>("/explain", { scenario: run.cfg, previous: run.previous, question, provider, history: qa.slice(-6).map(({ question, text }) => ({ question, text: text.slice(0, 3000) })) });
      setQa((items) => [...items, { question, ...response }]);
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
      `${csvName(vans[van]?.name ?? "")},${slot},${time(slot)},${kw},${kw / 4}`));
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
  const imported = Boolean(importedFile);
  const setupVans = imported
    ? Object.entries(cfg.overrides ?? {}).map(([index, van]) => ({ index: Number(index), name: van.name ?? `Van ${Number(index) + 1}`, van }))
    : r?.vans.slice(0, cfg.vans).map((van, index) => ({ index, name: van.name, van })) ?? [];
  const fields = [
    ["Fleet size", "vans", 1, 40, 1, "vans"], ["Connection limit", "limit_kw", 60, 160, 1, "kW"],
    ["Off-peak uplift", "extra_kw", 0, 160, 1, "kW"], ["Charger power", "charger_kw", 1, 50, 1, "kW"],
    ["Battery capacity", "battery_kwh", 0, 800, 10, "kWh"], ["Battery power", "battery_kw", 0, 250, 1, "kW"],
    ["Caution quantile", "q", .5, .99, .01, ""],
  ] as const;

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DashboardTab)} className="relative min-h-screen overflow-x-clip">
      <div aria-hidden className="grid-bg pointer-events-none fixed inset-0 opacity-60" style={{ transform: `translateY(${py * -0.15}px)` }} />
      <div aria-hidden className="pointer-events-none fixed -right-40 top-20 h-[32rem] w-[32rem] rounded-full bg-primary/10 blur-3xl" style={{ transform: `translateY(${py * -0.35}px)` }} />

      <header className="top-0 z-20 border-b border-border bg-background/95 backdrop-blur md:sticky">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <button type="button" onClick={() => setActiveTab("welcome")} aria-label="GridFlex.ai home"
            className="my-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 font-bold tracking-tight hover:bg-accent">
            <img src="/gridflex-mark.png" alt="" width={40} height={27} className="h-auto w-10 rounded object-contain" />
            <span>GridFlex<span className="text-primary">.ai</span></span>
          </button>
          <TabsList aria-label="Dashboard sections" className="flex h-auto w-full flex-wrap justify-start gap-1 border-t border-border bg-transparent px-0 py-2">
            {TABS.map(([id, label]) => (
              <TabsTrigger key={id} value={id} className="min-h-9 px-2.5 sm:px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6">
        {portfolio.filename && <TabsContent value="portfolio" className="py-8">
          <PortfolioResults portfolio={portfolio} canOpenSite={!busy && !asking && !sweeping && !whatIfBusy && !importing}
            onOpenSite={(site) => {
              setBusy(true);
              setCfg(site.scenario);
              setImportedFile(portfolio.filename);
              setError("");
              setActiveTab("compare");
              void applyResult(site.scenario, site.detail).finally(() => setBusy(false));
            }} />
        </TabsContent>}
        {/* 01 Welcome */}
        <TabsContent value="welcome"><section id="welcome" className="grid min-h-[72vh] items-center gap-8 py-12 lg:grid-cols-2">
          <div>
          <Synthetic />
          <h1 className="mt-6 max-w-4xl text-5xl font-bold leading-[1.02] tracking-tight md:text-7xl">
            Plan fleet charging. <span className="text-primary">See the risk.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            A demo planner for overnight depot charging. Set your site, run the scheduler and replay on held-out synthetic profiles, and see how a planned schedule compares with plugging everything in at once.
          </p>
          <div className="mt-8 flex gap-3">
            <button type="button" onClick={() => setActiveTab("configure")} className={btnPrimary}>Start planning</button>
            <button type="button" onClick={() => setActiveTab("analysis")} className={btnGhost}>Explore analysis</button>
          </div>
          <p className="mt-10 font-mono text-xs text-muted-foreground">Synthetic load profiles · Held-out replay · Human decision</p>
          </div>
          <img src="/gridflex-brand.png" alt="GridFlex.ai logo with a yellow lightning bolt above an electric fleet depot"
            width={1536} height={1024} className="h-auto w-full rounded-2xl border border-border" />
        </section></TabsContent>

        {/* 02 Configure */}
        <TabsContent value="configure"><Section id="configure" n={2} title="Configure your depot">
          <div className="panel mb-4 space-y-3 p-5">
            <label className="inline-flex cursor-pointer items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background has-disabled:cursor-wait has-disabled:opacity-60">
              {importing ? "Reading CSV…" : "Upload setup CSV"}
              <input className="sr-only" type="file" accept=".csv,text/csv" disabled={importing || busy || asking || sweeping || whatIfBusy}
                onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importSetup(file); }} />
            </label>
            <p className="text-sm text-muted-foreground">Upload a CSV for one depot. GridFlex fills the site settings and fleet below.</p>
            {importError && <p role="alert" className="text-sm text-destructive">{importError}</p>}
            {importedFile && !importing && <p role="status" className="text-sm">Loaded {importedFile} · {cfg.postcode} · {cfg.vans} vans. Review the setup and press Optimize.</p>}
          </div>
          <PortfolioUpload portfolio={portfolio} />
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
            {fields.filter(([, key]) => !imported || (key !== "vans" && key !== "charger_kw")).map(([label, key, min, max, step, unit]) =>
              <Field key={key} label={label} value={cfg[key]} min={min} max={max} step={step} unit={unit} onChange={(value) => {
                if (key === "vans") setCfg((old) => ({
                  ...old, vans: value,
                  overrides: Object.fromEntries(Object.entries(old.overrides ?? {}).filter(([index]) => Number(index) < value)),
                }));
                else set(key, value);
              }} />)}
            <Field label="Risk tolerance" value={Math.round(cfg.tolerance * 100)} min={0} max={100} unit="%" onChange={(value) => set("tolerance", value / 100)} />
            {(["arrival", "departure", "off_peak"] as const).filter((key) => !imported || key === "off_peak").map((key) => (
              <fieldset key={key} className="flex flex-wrap gap-3">
                <legend>{key === "off_peak" ? "Off-peak window" : `${key} window`}</legend>
                <Hint label={key === "off_peak" ? "Off-peak window" : key === "arrival" ? "Arrival window" : "Departure window"} />
                {([0, 1] as const).map((i) => <label key={i}>{i ? "End" : "Start"} <input type="time" step={900} value={cfg[key][i]}
                  className="rounded border border-input bg-background p-1"
                  onChange={(e) => set(key, i ? [cfg[key][0], e.target.value] : [e.target.value, cfg[key][1]])} /></label>)}
              </fieldset>
            ))}
            {!imported && <Field label="Energy per van" value={cfg.energy_kwh[1]} min={5} max={120} unit="kWh maximum" onChange={(value) => set("energy_kwh", [Math.max(0, value - 10), value])} />}
            {Object.keys(cfg.overrides ?? {}).length > 0 && <p className="text-sm text-muted-foreground sm:col-span-2">
              Individual van requests override the fleet defaults. View or clear them under Advanced.
            </p>}
            <details key={imported ? "imported" : "manual"} open={imported} className="sm:col-span-2">
              <summary className="cursor-pointer">{imported ? "Imported fleet" : "Advanced · edit individual vans"}</summary>
              <p className="my-2 text-sm text-muted-foreground"><Hint label="Individual vans" /> {imported ? "These exact requests will be used for optimization." : "Run Optimize once to generate van requests."}</p>
              {setupVans.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead><tr><th>Van</th><th>Arrival</th><th>Departure</th><th>Energy (kWh)</th><th>Charger (kW)</th></tr></thead>
                <tbody>{setupVans.map(({ name, van, index }) => (
                  <tr key={name}><th>{name}</th>{([
                    ["arrival_slot", 0, 95, 1], ["departure_slot", 1, 96, 1],
                    ["energy_kwh", 0, 120, .01], ["charger_kw", 1, 50, 1],
                  ] as const).map(([key, min, max, step]) => {
                    const current: VanOverride = cfg.overrides?.[index] ?? { ...van, name };
                    if (imported && (key === "arrival_slot" || key === "departure_slot")) {
                      const slot = current[key];
                      return <td key={key}>{time(slot)}{slot >= 48 ? " next day" : ""}</td>;
                    }
                    return <td key={key}><input className="w-24 rounded border border-input bg-background p-1"
                      aria-label={`${name} ${key.replaceAll("_", " ")}`} type="number" min={min} max={max} step={step}
                      value={current[key]} onChange={(e) => set("overrides", {
                        ...cfg.overrides, [index]: { ...current, [key]: Number(e.target.value) },
                      })} /></td>;
                  })}</tr>
                ))}</tbody></table></div>}
              {Object.keys(cfg.overrides ?? {}).length > 0 && <button className={btnGhost} onClick={() => { set("overrides", {}); setImportedFile(""); }}>Clear van overrides</button>}
            </details>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button className={btnPrimary} disabled={importing || busy || asking || sweeping || whatIfBusy} onClick={() => void optimize()}>{busy ? "Running…" : "Optimize"}</button><Hint label="Optimize" />
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
        </Section></TabsContent>

        {r && s && report && run ? <>
          <TabsContent value="compare">
          <Section id="compare" n={3} title="Compare charging plans">
            <p className="mb-4" role="status">Verdict: {report.verdict.replaceAll("_", " ")} · Solver: {s.status} · {run.cfg.vans} vans · {run.cfg.month} <Hint label="Verdict and solver" /></p>
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat label="Windows over limit" value={`${report.days_over_pct.toFixed(2)}%`} tone={report.days_over_pct ? "bad" : "good"} />
              <Stat label="Worst overshoot" value={`${report.worst_overshoot_kw.toFixed(2)} kW`} />
              <Stat label="Vans fully charged" value={`${report.vans_short.filter(([, short]) => short === 0).length}/${run.cfg.vans}`} />
              <Stat label="kWh short" value={sum(s.unmet_kwh).toFixed(2)} tone={sum(s.unmet_kwh) ? "bad" : "good"} />
            </div>
            <section aria-label="Immediate charging comparison" className="panel mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
              <div>
                <h3 className="font-semibold">Immediate charging</h3>
                <p className="text-xs text-muted-foreground">Each van starts charging as soon as it arrives.</p>
              </div>
              {report.immediate ? <>
                <span><strong>{report.immediate.days_over_pct.toFixed(2)}%</strong> windows over limit <Hint label="Windows over limit" /></span>
                <span><strong>{report.immediate.worst_overshoot_kw.toFixed(2)} kW</strong> worst overshoot <Hint label="Worst overshoot" /></span>
              </> : <span className="text-muted-foreground">Comparison unavailable</span>}
              <span><strong>{report.n_windows}</strong> held-out windows <Hint label="Held-out windows" /></span>
            </section>
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
            <div className="mt-4 flex flex-wrap gap-2">
              <button className={btnPrimary} aria-pressed={decision === "approved"} onClick={() => setDecision("approved")}>Approve plan</button>
              <button className={btnGhost} aria-pressed={decision === "rejected"} onClick={() => setDecision("rejected")}>Reject plan</button><Hint label="Approve / Reject" />
            </div>
            {decision && <p role="status">Plan {decision} for this demo run.</p>}
          </Section>
          </TabsContent>
          <TabsContent value="schedule">
            <Section id="schedule" n={4} title="Per-van charging schedule">
              <div className="panel mt-4 p-4">
              <h3 className="font-semibold">Van schedule <Hint label="Van schedule" /></h3>
              <Heatmap schedule={s.power} needs={r.vans.map((van) => Math.ceil(van.energy_kwh * 4) / 4)} chargerKw={run.cfg.charger_kw} />
            </div>
              <div className="mt-4 flex items-center gap-2">
              <button className={btnGhost} onClick={exportCsv}>Download schedule (CSV)</button><Hint label="Download schedule (CSV)" />
              </div>
            </Section>
          </TabsContent>
          <TabsContent value="explanation">
          <Section id="explanation" n={5} title="Explanation">
            <article className="panel space-y-4 p-6">
              <fieldset className="flex flex-wrap items-center gap-2" disabled={busy || asking}>
                <legend className="mb-2 text-sm font-semibold">Choose explanation model</legend>
                {([ ["groq", "Groq (cloud)"], ["ollama", "Qwen 3.5 9B (local)"] ] as const).map(([value, label]) =>
                  <button type="button" key={value} aria-pressed={provider === value} onClick={() => setProvider(value)} className={provider === value ? btnPrimary : btnGhost}>{label}</button>)}
                <span className="text-xs text-muted-foreground">Applies to your next question or optimization.</span>
              </fieldset>
              <p className="text-sm text-muted-foreground">{explanationSource === "groq" ? "Groq explanation based on computed evidence" : explanationSource === "ollama" ? "Local Qwen explanation based on computed evidence" : "Template explanation from this run’s computed results"} <Hint label="Explanation and follow-up" /></p>
              <p aria-live="polite">{explanation || "Preparing explanation…"}</p>
              <div className="flex flex-wrap gap-2">
                {["When do all vans finish charging?", "When is risk highest?", "Which vans are short?", "How did the battery help?"].map((question) =>
                  <button key={question} className={btnGhost} disabled={busy || asking} onClick={() => ask(question)}>{question}</button>)}
              </div>
              <ul aria-live="polite">{qa.map(({ question, text, source, evidence }, i) => <li key={i} className="mt-3"><strong>{question}</strong><p className="whitespace-pre-line">{text}</p><p className="text-xs text-muted-foreground">{source === "schedule" ? "Calculated from this run’s van schedule" : source === "groq" ? "Groq response" : source === "ollama" ? "Local Qwen response" : evidence?.length ? "Calculated from simulation evidence" : "Local fallback"}</p>{!!evidence?.length && <details className="text-sm text-muted-foreground"><summary>Based on {evidence.length} evidence item{evidence.length === 1 ? "" : "s"}</summary><ul>{evidence.map((item) => <li key={item.id}>{item.text}</li>)}</ul></details>}</li>)}</ul>
              <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
                <label htmlFor="ask" className="sr-only">Ask about this run</label>
                <input id="ask" className="grow rounded border border-input bg-background p-2" value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this run" />
                <button className={btnPrimary} disabled={busy || asking || !q.trim()}>{asking ? "Thinking…" : "Ask"}</button>
              </form>
            </article>
          </Section>
          </TabsContent>
          <TabsContent value="analysis">
            <Section id="analysis" n={6} title="Analysis">
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <section className="panel min-w-0 space-y-4 p-5" aria-labelledby="decision-evidence">
                  <h3 id="decision-evidence" className="text-xl font-semibold">What-if scenarios</h3>
                  <p><strong>Decision:</strong> {report.verdict.replaceAll("_", " ")} · {report.vans_short.filter(([, short]) => short <= 1e-9).length} of {run.cfg.vans} vans meet their rounded request · {sum(s.unmet_kwh).toFixed(2)} kWh unmet.</p>
                  <p><strong>Evidence:</strong> {report.days_over_pct.toFixed(2)}% of {report.n_windows} held-out synthetic windows exceed the modeled limit. The worst overshoot is {report.worst_overshoot_kw.toFixed(2)} kW{report.worst_overshoot_time ? ` at ${report.worst_overshoot_time}` : ""}; building demand alone exceeds it in {report.baseline_alone_over_pct.toFixed(2)}% of windows.</p>
                  <p><strong>Limits:</strong> Solver status {s.status}; one fixed schedule is replayed against synthetic windows. This is not a real-site guarantee or grid-operator approval.</p>
                  <h3 className="pt-2 font-semibold">What would change the outcome?</h3>
                  <p className="text-sm text-muted-foreground">Change one setting and compare both plans on the same synthetic windows. Equally optimal schedules can differ.</p>
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
                <div className="min-w-0 space-y-4">
                  <section className="panel space-y-2 p-5" aria-labelledby="risk-heading">
                    <h3 id="risk-heading" className="text-xl font-semibold">Risk and sensitivity</h3>
                    <Row k="Worst overshoot time" v={report.worst_overshoot_time || "No breaches"} />
                    <Row k="Baseline alone over limit" v={`${report.baseline_alone_over_pct.toFixed(2)}%`} />
                    <Row k="Blocked planning slots" v={s.blocked_slots.map(time).join(", ") || "None"} />
                    <Row k="Vans with shortfalls" v={report.vans_short.filter(([, short]) => short > 0).map(([name, short]) => `${name}: ${short.toFixed(2)} kWh`).join(", ") || "None"} />
                    <h3 className="font-semibold">Breach timing <Hint label="Breach timing chart" /></h3>
                    <LoadChart title="Number of replay windows breaching the limit by time" series={[{ label: "Windows over limit", data: report.over_by_slot, cls: "stroke-destructive" }]} />
                    {!!run.cfg.battery_kwh && <div><h3 className="font-semibold">Battery stored energy <Hint label="Battery chart" /></h3><LoadChart title="Battery stored energy (kWh)" series={[{ label: "Stored energy", data: s.battery_soc_kwh, cls: "stroke-success" }]} /></div>}
                    {!!run.cfg.battery_kwh && <p className="text-sm">Replay clips negative net demand without recalculating battery state for each window.</p>}
                    <p className="text-sm">15-minute slots. The solver rounds the baseline up and limit down to integer kW, and energy demand up to 0.25 kWh.</p>
                  </section>
                  <section className="panel space-y-4 p-5" aria-labelledby="sweep-heading">
                    <h3 id="sweep-heading" className="text-xl font-semibold">Sweeps</h3>
                    <button className={btnPrimary} onClick={sweep} disabled={busy || sweeping}>{sweeping ? "Running sweeps…" : "Run exploratory sweeps"}</button><Hint label="Exploratory sweeps" />
                    {error && <p role="alert" className="text-destructive">{error}</p>}
                    {sweeps.map(({ label, rows }) => <div key={label} className="overflow-x-auto"><h3 className="font-semibold">{label}</h3>
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
                  </section>
                </div>
                <section className="panel min-w-0 space-y-4 p-5 lg:col-span-2" aria-labelledby="reality-heading">
                    <h3 id="reality-heading" className="text-xl font-semibold">Reality check · GLASS and Liander (2023) <Hint label="Reality check" /></h3>
                    {!checks.length && <p>No comparison available for this run.</p>}
                    <div className="grid gap-4 xl:grid-cols-3">
                    {checks.map((check) => <div className="min-w-0" key={check.sbi_code}><p>{check.summary}</p>
                      <LoadChart title={`Typical working day ${check.sbi_code}, midnight to midnight (relative load)`} startHour={0} band={[check.glass_band[0], check.glass_band[2]]}
                        series={[{ label: "GLASS median", data: check.glass_band[1], cls: "stroke-primary" }, { label: "Liander reference", data: check.liander_band[1].map((v) => v ?? 0), cls: "stroke-success" }]} />
                    </div>)}
                    </div>
                    <p className="text-sm text-muted-foreground">GLASS was trained on Liander data, so this comparison is not an independent test.</p>
                </section>
              </div>
            </Section>
          </TabsContent>
        </> : RESULT_TABS.map(([id, label]) => (
          <TabsContent key={id} value={id} className="py-12">
            <div className="panel space-y-4 p-8 text-center">
              <h2 className="text-xl font-semibold">{label}</h2>
              <p className="text-muted-foreground">{busy ? "Optimize is running." : "Run Optimize in Setup to see results here."}</p>
              <button type="button" className={btnPrimary} onClick={() => setActiveTab("configure")}>Go to Setup</button>
            </div>
          </TabsContent>
        ))}
        <DepotVan busy={vanDriving} hasResults={Boolean(run)} onViewResults={() => setActiveTab("compare")} />
        <footer className="border-t border-border py-10 text-center font-mono text-xs text-muted-foreground">GLASS (CDLA-Permissive-2.0) · Synthetic data and simulation. Not a grid-operator approval.</footer>
      </main>
    </Tabs>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between border-b border-border pb-2"><span className="text-muted-foreground">{k}{helpText[k] && <Hint label={k} />}</span><span className="font-mono">{v}</span></div>;
}
