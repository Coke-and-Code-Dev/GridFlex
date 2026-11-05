import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PRESETS, simulate, toCsv, explain, diff, answer, type Config, type PresetKey, type Result } from "@/lib/sim";
import { LoadChart, Heatmap } from "@/components/gridflex/Charts";

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
      <label htmlFor={id} className="flex justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-foreground">{value} {unit}</span>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-primary" />
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "bad" | "good" }) {
  const c = tone === "bad" ? "text-destructive" : tone === "good" ? "text-success" : "text-foreground";
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-semibold ${c}`}>{value}</div>
    </div>
  );
}

const btn = "rounded-lg px-4 py-2 text-sm font-medium transition-colors";
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:shadow-glow`;
const btnGhost = `${btn} border border-border hover:bg-accent`;

function Dashboard() {
  const py = useParallax();
  const [cfg, setCfg] = useState<Config>(PRESETS.tight);
  const [preset, setPreset] = useState<PresetKey | "custom">("tight");
  const [result, setResult] = useState<Result | null>(null);
  const [runCfg, setRunCfg] = useState<Config | null>(null);
  const [changes, setChanges] = useState<string[]>([]);
  const [day, setDay] = useState(0);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [q, setQ] = useState("");
  const [qa, setQa] = useState<{ q: string; a: string }[]>([]);
  const prev = useRef<Result | null>(null);

  const set = <K extends keyof Config>(k: K, v: Config[K]) => { setCfg((c) => ({ ...c, [k]: v })); setPreset("custom"); };
  const optimize = () => {
    const r = simulate(cfg);
    setChanges(diff(prev.current, r));
    prev.current = r;
    setResult(r);
    setRunCfg(cfg);
    setDecision(null);
    setDay(Math.min(day, r.days.length - 1));
    document.getElementById("immediate")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const explanation = useMemo(() => (result && runCfg ? explain(runCfg, result) : []), [result, runCfg]);

  const exportCsv = () => {
    if (!result) return;
    const blob = new Blob([toCsv(cfg, result)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gridflex-synthetic-${cfg.site.replace(/\W+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const d = result?.days[day];
  const rc = runCfg ?? cfg;
  const verdictStyle = { safe: "text-success", caution: "text-primary", unsafe: "text-destructive" } as const;

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
            Charge every van. <span className="text-primary">Never trip the grid.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            A demo planner for overnight depot charging. Set your site, run deterministic synthetic scenarios, and see how a smart schedule compares with plugging everything in at once.
          </p>
          <div className="mt-8 flex gap-3">
            <a href="#configure" className={btnPrimary}>Start planning</a>
            <a href="#edge-case" className={btnGhost}>See the edge case</a>
          </div>
          <p className="mt-10 font-mono text-xs text-muted-foreground">No live API · no providers · all numbers generated locally</p>
        </section>

        {/* 02 Configure */}
        <Section id="configure" n={2} title="Configure your depot">
          <div className="panel grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
            <div className="space-y-4">
              <div>
                <label htmlFor="site" className="text-sm text-muted-foreground">Site name</label>
                <input id="site" value={cfg.site} onChange={(e) => set("site", e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" />
              </div>
              <fieldset>
                <legend className="text-sm text-muted-foreground">Presets</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["normal", "tight", "battery"] as PresetKey[]).map((k) => (
                    <button key={k} aria-pressed={preset === k} onClick={() => { setCfg({ ...PRESETS[k], site: cfg.site }); setPreset(k); }}
                      className={preset === k ? btnPrimary : btnGhost}>{k.charAt(0).toUpperCase() + k.slice(1)}</button>
                  ))}
                </div>
              </fieldset>
              <button onClick={optimize} className={`${btnPrimary} w-full py-3 text-base`}>⚡ Optimize</button>
              <p className="text-xs text-muted-foreground">Runs 7 deterministic synthetic days, noon to noon.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Fleet size" value={cfg.vans} onChange={(v) => set("vans", v)} min={2} max={40} unit="vans" />
              <Field label="Energy per van" value={cfg.energyPerVanKwh} onChange={(v) => set("energyPerVanKwh", v)} min={10} max={120} unit="kWh" />
              <Field label="Grid capacity" value={cfg.gridLimitKw} onChange={(v) => set("gridLimitKw", v)} min={80} max={600} step={10} unit="kW" />
              <Field label="Charger power" value={cfg.chargerKw} onChange={(v) => set("chargerKw", v)} min={7} max={50} unit="kW" />
              <Field label="Battery size" value={cfg.batteryKwh} onChange={(v) => set("batteryKwh", v)} min={0} max={800} step={20} unit="kWh" />
              <Field label="Battery power" value={cfg.batteryKw} onChange={(v) => set("batteryKw", v)} min={0} max={250} step={10} unit="kW" />
              <Field label="Risk margin" value={cfg.riskMarginPct} onChange={(v) => set("riskMarginPct", v)} min={0} max={30} unit="%" />
              <Field label="Scenario seed" value={cfg.seed} onChange={(v) => set("seed", v)} min={1} max={99} unit="" />
            </div>
          </div>
        </Section>

        {!result || !d ? (
          <p className="panel p-8 text-center text-muted-foreground">Press <strong className="text-primary">Optimize</strong> to generate the synthetic scenarios.</p>
        ) : (
          <>
            {/* 03 Immediate */}
            <Section id="immediate" n={3} title="Immediate charging: what happens today">
              <div className="grid gap-4 sm:grid-cols-4">
                <Stat label="Days over limit" value={`${result.imm.daysOver}/7`} tone={result.imm.daysOver ? "bad" : "good"} />
                <Stat label="Worst overshoot" value={`${result.imm.worstOvershoot.toFixed(0)} kW`} tone={result.imm.worstOvershoot ? "bad" : "good"} />
                <Stat label="Vans fully charged" value={`${result.imm.vansFull}/${rc.vans}`} />
                <Stat label="kWh short (week)" value={result.imm.kwhShort} />
              </div>
              <div className="panel mt-4 p-4">
                <LoadChart title="Immediate charging site load" limit={rc.gridLimitKw}
                  series={[{ label: "Immediate", data: d.immediate, cls: "stroke-destructive" }, { label: "Base load", data: d.base, cls: "stroke-muted-foreground", dash: "3 3" }]} />
              </div>
            </Section>

            {/* 04 Compare */}
            <Section id="compare" n={4} title="Compare: optimized vs immediate">
              <div className="mb-4 flex flex-wrap items-center gap-4">
                <div className={`panel px-5 py-3 font-mono text-lg uppercase ${verdictStyle[result.verdict]}`} role="status">
                  Verdict: {result.verdict}
                </div>
                <div role="tablist" aria-label="Synthetic day" className="flex flex-wrap gap-1">
                  {result.days.map((x, i) => (
                    <button key={i} role="tab" aria-selected={day === i} onClick={() => setDay(i)} className={`${day === i ? btnPrimary : btnGhost} px-3 py-1`}>Day {x.day}</button>
                  ))}
                </div>
                <button onClick={exportCsv} className={`${btnGhost} ml-auto`}>⬇ Export CSV</button>
              </div>
              <div className="grid gap-4 sm:grid-cols-4">
                <Stat label="Days over limit" value={`${result.opt.daysOver}/7`} tone={result.opt.daysOver ? "bad" : "good"} />
                <Stat label="Worst overshoot" value={`${result.opt.worstOvershoot.toFixed(0)} kW`} tone={result.opt.worstOvershoot ? "bad" : "good"} />
                <Stat label="Vans fully charged" value={`${result.opt.vansFull}/${rc.vans}`} tone={result.opt.vansFull < rc.vans ? "bad" : "good"} />
                <Stat label="kWh short (week)" value={result.opt.kwhShort} tone={result.opt.kwhShort ? "bad" : "good"} />
              </div>
              <div className="panel mt-4 p-4">
                <h3 className="mb-2 text-sm text-muted-foreground">Site load, noon to noon — Day {d.day}</h3>
                <LoadChart title={`Optimized versus immediate load, day ${d.day}`} limit={rc.gridLimitKw}
                  series={[{ label: "Immediate", data: d.immediate, cls: "stroke-destructive/60", dash: "4 3" }, { label: "Optimized", data: d.optimized, cls: "stroke-primary" }]} />
              </div>
              <div className="panel mt-4 p-4">
                <h3 className="mb-3 text-sm text-muted-foreground">Per-van schedule heatmap (kW) — delivered / needed kWh</h3>
                <Heatmap schedule={d.schedule} needs={d.needs} chargerKw={rc.chargerKw} />
              </div>
            </Section>

            {/* 05 Explanation */}
            <Section id="explanation" n={5} title="Explanation">
              <div className="grid gap-4 md:grid-cols-2">
                <article className="panel p-6">
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Template explanation · generated locally from results · not AI</p>
                  <ul className="space-y-3">{explanation.map((e) => <li key={e} className="border-l-2 border-primary pl-3">{e}</li>)}</ul>
                  {changes.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold text-primary">What changed on rerun</h3>
                      <ul className="mt-2 space-y-1 font-mono text-sm">{changes.map((c) => <li key={c}>{c}</li>)}</ul>
                    </div>
                  )}
                </article>
                <div className="panel flex flex-col p-6">
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Follow-up · local answers only</p>
                  <div className="flex flex-wrap gap-2">
                    {["Why did it go over?", "Would a battery help?", "Why kWh short?", "What does risk margin do?"].map((s) => (
                      <button key={s} onClick={() => setQa((x) => [...x, { q: s, a: answer(s, rc, result) }])} className={`${btnGhost} px-3 py-1 text-xs`}>{s}</button>
                    ))}
                  </div>
                  <ul className="mt-4 flex-1 space-y-3 text-sm" aria-live="polite">
                    {qa.map((x, i) => <li key={i}><p className="text-muted-foreground">› {x.q}</p><p>{x.a}</p></li>)}
                  </ul>
                  <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) { setQa((x) => [...x, { q, a: answer(q, rc, result) }]); setQ(""); } }}>
                    <label htmlFor="ask" className="sr-only">Ask a follow-up question</label>
                    <input id="ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about battery, limit, risk…" className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                    <button className={btnPrimary}>Ask</button>
                  </form>
                </div>
              </div>
            </Section>

            {/* 06 Edge case */}
            <Section id="edge-case" n={6} title="Edge case: battery & risk diagnostics">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="panel p-4">
                  <h3 className="mb-2 text-sm text-muted-foreground">Battery state of charge & flow — Day {d.day}</h3>
                  {rc.batteryKwh > 0 ? (
                    <LoadChart title="Battery state of charge and power" limit={rc.batteryKwh}
                      series={[{ label: "State of charge (kWh)", data: d.soc, cls: "stroke-success" }, { label: "Discharge (kW)", data: d.battery.map((b) => Math.max(0, b)), cls: "stroke-primary" }]} />
                  ) : (
                    <p className="p-6 text-muted-foreground">No battery configured. Try the <button className="text-primary underline" onClick={() => { setCfg({ ...PRESETS.battery, site: cfg.site }); setPreset("battery"); }}>Battery preset</button> and Optimize again.</p>
                  )}
                </div>
                <div className="panel space-y-3 p-6 text-sm">
                  <h3 className="text-sm text-muted-foreground">Risk diagnostics</h3>
                  <Row k="Planning cap" v={`${(rc.gridLimitKw * (1 - rc.riskMarginPct / 100)).toFixed(0)} kW (${rc.riskMarginPct}% margin)`} />
                  <Row k="Peak optimized load" v={`${Math.max(...d.optimized).toFixed(0)} kW`} />
                  <Row k="Unmanaged demand" v={`${rc.vans * rc.chargerKw} kW`} />
                  <Row k="Fleet energy need (day)" v={`${d.needs.reduce((a, b) => a + b, 0)} kWh`} />
                  <Row k="Short this day" v={`${Math.round(d.optShort)} kWh`} />
                  {result.verdict !== "safe" && <p className="rounded-lg border border-primary/50 p-3 text-primary">Limit is respected, but not every van leaves full. Consider more capacity, a battery, or a lower margin.</p>}
                  <div className="flex gap-2 pt-3">
                    <button onClick={() => setDecision("approved")} aria-pressed={decision === "approved"} className={btnPrimary}>Approve plan</button>
                    <button onClick={() => setDecision("rejected")} aria-pressed={decision === "rejected"} className={btnGhost}>Reject</button>
                  </div>
                  {decision && <p role="status" className={decision === "approved" ? "text-success" : "text-destructive"}>Plan {decision} locally for {rc.site}. Nothing was sent anywhere.</p>}
                </div>
              </div>
            </Section>
          </>
        )}
        <footer className="border-t border-border py-10 text-center font-mono text-xs text-muted-foreground">GridFlex AI demo · all data synthetic · no live API, providers or publishing</footer>
      </main>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between border-b border-border pb-2"><span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span></div>;
}
