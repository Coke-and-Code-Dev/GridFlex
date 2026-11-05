import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { analyse, CATEGORIES, DEMO, EDGE, MONTHS, type Result, type Scenario } from "@/lib/gridflex";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GridFlex · Website Wireframe" },
      { name: "description", content: "Clickable storyboard: schedule electric van charging within your connection limit." },
      { property: "og:title", content: "GridFlex · Website Wireframe" },
      { property: "og:description", content: "Clickable storyboard: schedule electric van charging within your connection limit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Storyboard,
});

const STEPS = ["Welcome", "Scenario", "Baseline", "Compare", "Explain"];

function go(id: number) {
  const el = document.getElementById(`frame-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("frame-highlight");
  void el.offsetWidth;
  el.classList.add("frame-highlight");
  el.focus({ preventScroll: true });
}

function Storyboard() {
  const [s, setS] = useState<Scenario>(DEMO);
  const r = analyse(s);
  const edge = analyse(EDGE);

  return (
    <main className="min-h-screen bg-background px-4 py-10 md:px-10">
      <header className="mx-auto mb-10 max-w-7xl">
        <div className="mb-3 inline-block h-2 w-16 bg-primary" />
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">GridFlex · Website Wireframe</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          A fleet manager opens GridFlex, enters their site and van details, sees where uncontrolled charging breaks the
          connection limit, compares a smarter schedule, and reads a plain-language explanation. Click the yellow buttons to
          walk the flow. <span className="font-semibold text-foreground">All figures are demo data.</span>
        </p>
      </header>

      <div className="mx-auto grid max-w-7xl gap-x-8 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
        <Frame n={1} title="Welcome" step={0} next="Start scenario">
          <div className="flex flex-col items-start gap-4 py-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">EY Hackathon · GridFlex</p>
            <h3 className="text-2xl font-bold leading-tight">Charge every van without breaking your grid connection.</h3>
            <p className="text-sm text-muted-foreground">
              GridFlex shifts electric van charging into quiet hours so your site stays under its contracted kW limit.
            </p>
            <Btn onClick={() => go(2)}>Start scenario</Btn>
            <div className="mt-2 grid w-full grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
              {["1 · Describe site", "2 · Run analysis", "3 · Read advice"].map((t) => (
                <div key={t} className="rounded border border-border bg-secondary px-2 py-2">{t}</div>
              ))}
            </div>
          </div>
        </Frame>

        <Frame n={2} title="Configure the scenario" step={1} next="Run analysis">
          <form
            className="grid grid-cols-2 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              go(3);
            }}
          >
            <Field label="Business category">
              <select className={inputCls} value={s.category} onChange={(e) => setS({ ...s, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Month (2023)">
              <select className={inputCls} value={s.month} onChange={(e) => setS({ ...s, month: e.target.value })}>
                {MONTHS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Consumption level">
              <select className={inputCls} value={s.consumption} onChange={(e) => setS({ ...s, consumption: e.target.value as Scenario["consumption"] })}>
                {["Low", "Medium", "High"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Connection limit (kW)">
              <input className={inputCls} type="number" min={20} max={1000} required value={s.limitKw} onChange={(e) => setS({ ...s, limitKw: +e.target.value })} />
            </Field>
            <Field label="Number of vans">
              <input className={inputCls} type="number" min={1} max={50} required value={s.vans} onChange={(e) => setS({ ...s, vans: +e.target.value })} />
            </Field>
            <Field label="Postcode (NL)">
              <input className={inputCls} pattern="[0-9]{4} ?[A-Za-z]{2}" required value={s.postcode} onChange={(e) => setS({ ...s, postcode: e.target.value })} />
            </Field>
            <Field label="Energy per van (kWh)">
              <input className={inputCls} type="number" min={5} max={150} value={s.kwhPerVan} onChange={(e) => setS({ ...s, kwhPerVan: +e.target.value })} />
            </Field>
            <Field label="Charger power (kW)">
              <input className={inputCls} type="number" min={3} max={50} value={s.chargerKw} onChange={(e) => setS({ ...s, chargerKw: +e.target.value })} />
            </Field>
            <div className="col-span-2 flex items-center justify-between gap-2 pt-1">
              <button type="button" className="text-xs underline" onClick={() => setS(DEMO)}>Reset demo</button>
              <Btn type="submit">Run analysis</Btn>
            </div>
          </form>
        </Frame>

        <Frame n={3} title="Review the baseline" step={2} next="Compare schedule" s={s}>
          <Chart r={r} limit={s.limitKw} showProposed={false} />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Kpi label="Peak demand" value={`${r.peakBaseline} kW`} bad={r.peakBaseline > s.limitKw} />
            <Kpi label="Hours over limit" value={`${r.breachBaseline} h`} bad={r.breachBaseline > 0} />
            <Kpi label="Van energy needed" value={`${r.needKwh} kWh`} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Vans plug in at 17:00 and charge at full power (uncontrolled).</p>
          <div className="mt-3 flex justify-end"><Btn onClick={() => go(4)}>Compare schedule</Btn></div>
        </Frame>

        <Frame n={4} title="Compare the proposed schedule" step={3} next="Explain this result" s={s}>
          <Chart r={r} limit={s.limitKw} showProposed />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Kpi label="Peak change" value={`${r.peakBaseline} → ${r.peakProposed} kW`} />
            <Kpi label="Breaches left" value={`${r.breachProposed} h`} bad={r.breachProposed > 0} good={r.breachProposed === 0} />
            <Kpi label="Charging met" value={`${Math.round((r.deliveredKwh / r.needKwh) * 100)}%`} bad={!r.needsMet} good={r.needsMet} />
          </div>
          <div className="mt-3 flex justify-between gap-2">
            <Btn variant="ghost" onClick={() => go(2)}>← Edit scenario</Btn>
            <Btn onClick={() => go(5)}>Explain this result</Btn>
          </div>
        </Frame>

        <Frame n={5} title="AI explanation" step={4} next="Try the edge case" s={s}>
          <Explain s={s} r={r} />
          <div className="mt-3 flex justify-between gap-2">
            <Btn variant="ghost" onClick={() => go(2)}>← Edit scenario</Btn>
            <Btn onClick={() => go(6)}>See edge case</Btn>
          </div>
        </Frame>

        <Frame n={6} title="AI explanation · edge case" step={4} s={EDGE}>
          <p className="mb-2 rounded border border-dashed border-border bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
            State preview: same dashboard when the schedule cannot fully fix the problem.
          </p>
          <Explain s={EDGE} r={edge} />
          <div className="mt-3 flex justify-between gap-2">
            <Btn variant="ghost" onClick={() => go(2)}>← Edit scenario</Btn>
            <Btn variant="ghost" onClick={() => go(1)}>Back to start</Btn>
          </div>
        </Frame>
      </div>
      <p className="mx-auto mt-12 max-w-7xl text-xs text-muted-foreground">Wireframe · mock data only · not EY branded material.</p>
    </main>
  );
}

const inputCls =
  "w-full rounded border border-input bg-card px-2 py-1.5 text-sm focus-visible:border-foreground";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function Btn({ children, variant = "primary", ...p }: { children: ReactNode; variant?: "primary" | "ghost" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:brightness-95 font-semibold"
      : "border border-border bg-card text-foreground hover:bg-muted";
  return (
    <button type="button" {...p} className={`rounded px-4 py-2 text-sm transition ${cls}`}>
      {children}
    </button>
  );
}

function Kpi({ label, value, bad, good }: { label: string; value: string; bad?: boolean; good?: boolean }) {
  return (
    <div className={`rounded border px-2 py-2 ${bad ? "border-destructive" : good ? "border-success" : "border-border"} bg-card`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold ${bad ? "text-destructive" : good ? "text-success" : ""}`}>
        {bad ? "▲ " : good ? "✓ " : ""}{value}
      </div>
    </div>
  );
}

function Frame({ n, title, step, next, s, children }: { n: number; title: string; step: number; next?: string; s?: Scenario; children: ReactNode }) {
  const dash = n >= 3;
  return (
    <section className="relative" aria-labelledby={`t-${n}`}>
      <h2 id={`t-${n}`} className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-foreground text-xs text-background">{n}</span>
        {title}
      </h2>
      <div id={`frame-${n}`} tabIndex={-1} className="overflow-hidden rounded-md border border-border bg-card shadow-sm outline-none">
        <div className="flex items-center gap-1.5 border-b border-border bg-muted px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="ml-2 flex-1 truncate rounded bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
            gridflex.app/{["", "scenario", "dashboard", "dashboard#compare", "dashboard#explain", "dashboard#explain"][n - 1]}
          </span>
        </div>
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-sm font-bold">Grid<span className="bg-primary px-0.5">Flex</span></span>
          <nav className="flex gap-1 text-[10px]">
            {STEPS.map((t, i) => (
              <span key={t} className={`rounded px-1.5 py-0.5 ${i === step ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"}`}>{t}</span>
            ))}
          </nav>
        </div>
        {dash && s && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-secondary px-4 py-1.5 text-[10px] text-muted-foreground">
            <span>{s.category}</span><span>{s.month} 2023</span><span>{s.consumption} use</span>
            <span>Limit {s.limitKw} kW</span><span>{s.vans} vans</span><span>{s.postcode}</span>
            <span className="ml-auto rounded bg-accent px-1.5 font-semibold text-accent-foreground">DEMO DATA</span>
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
      {next && (
        <div className="mt-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span className="rounded-full border border-border bg-card px-3 py-1">{next} <span aria-hidden>→</span> {n + 1}</span>
        </div>
      )}
    </section>
  );
}

function Chart({ r, limit, showProposed }: { r: Result; limit: number; showProposed: boolean }) {
  const W = 340, H = 170, L = 30, R = 62, T = 10, B = 22;
  const max = Math.ceil(Math.max(r.peakBaseline, limit, r.peakProposed) / 50) * 50 + 10;
  const x = (i: number) => L + (i / 23) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const path = (a: number[]) => a.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const last = (a: number[]) => y(a[23] ?? 0);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Site demand over 24 hours versus connection limit">
        {[0, Math.round(max / 2), max].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={L - 4} y={y(v) + 3} fontSize="8" textAnchor="end" fill="var(--muted-foreground)">{v}</text>
          </g>
        ))}
        {r.baseline.map((v, i) =>
          v > limit ? <rect key={i} x={x(i) - 5} width={10} y={T} height={H - T - B} fill="var(--destructive)" opacity={showProposed ? 0.06 : 0.12} /> : null,
        )}
        {showProposed && r.proposed.map((v, i) =>
          v > limit ? <rect key={`p${i}`} x={x(i) - 5} width={10} y={T} height={H - T - B} fill="var(--destructive)" opacity={0.25} /> : null,
        )}
        {[0, 6, 12, 18, 23].map((h) => (
          <text key={h} x={x(h)} y={H - 8} fontSize="8" textAnchor="middle" fill="var(--muted-foreground)">{String(h).padStart(2, "0")}:00</text>
        ))}
        <line x1={L} x2={W - R} y1={y(limit)} y2={y(limit)} stroke="var(--destructive)" strokeWidth={1.5} strokeDasharray="6 3" />
        <text x={W - R + 4} y={y(limit) + 3} fontSize="8" fontWeight="600" fill="var(--destructive)">Limit {limit} kW</text>
        <path d={path(r.baseline)} fill="none" stroke={showProposed ? "var(--muted-foreground)" : "var(--foreground)"} strokeWidth={showProposed ? 1.5 : 2} strokeDasharray={showProposed ? "2 2" : undefined} />
        <text x={W - R + 4} y={last(r.baseline) + (showProposed ? 12 : 3)} fontSize="8" fill="var(--muted-foreground)">Baseline</text>
        {showProposed && (
          <>
            <path d={path(r.proposed)} fill="none" stroke="var(--foreground)" strokeWidth={2.5} />
            {r.proposed.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={1.8} fill="var(--primary)" stroke="var(--foreground)" strokeWidth={0.6} />)}
            <text x={W - R + 4} y={last(r.proposed) - 4} fontSize="8" fontWeight="700" fill="var(--foreground)">Proposed</text>
          </>
        )}
        <text x={L + 3} y={T + 8} fontSize="7" fill="var(--muted-foreground)">kW</text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span><span className="text-destructive">- - -</span> Connection limit</span>
        <span>{showProposed ? "····· Baseline (dotted)" : "—— Baseline demand"}</span>
        {showProposed && <span className="font-semibold text-foreground">—●— Proposed schedule</span>}
        <span><span className="inline-block h-2 w-3 bg-destructive/25 align-middle" /> Over limit</span>
      </figcaption>
    </figure>
  );
}

function Explain({ s, r }: { s: Scenario; r: Result }) {
  const pct = Math.round((r.deliveredKwh / r.needKwh) * 100);
  const ok = r.breachProposed === 0 && r.needsMet;
  return (
    <div className="space-y-3 text-sm">
      <div className={`rounded border-l-4 px-3 py-2 text-xs font-semibold ${ok ? "border-success bg-secondary" : "border-destructive bg-secondary"}`}>
        {ok ? "✓ Schedule fits within your limit" : "▲ Schedule needs attention"}
      </div>
      <Section title="What happened">
        With {s.vans} vans plugging in at 17:00, your {s.category.toLowerCase()} would peak at {r.peakBaseline} kW in {s.month} —{" "}
        {r.breachBaseline > 0 ? `${r.breachBaseline} hours above the ${s.limitKw} kW limit.` : `within the ${s.limitKw} kW limit.`}
      </Section>
      <Section title="What changed">
        GridFlex moved charging into the evening and night. Peak demand goes from {r.peakBaseline} to {r.peakProposed} kW, with{" "}
        {r.breachProposed} hours over the limit and {pct}% of the {r.needKwh} kWh van energy delivered by 07:00.
      </Section>
      <Section title="What to check">
        {ok
          ? "Confirm vans really stay plugged in until 07:00 and that chargers support power control."
          : [
              r.breachProposed > 0 && `Your building alone exceeds ${s.limitKw} kW for ${r.breachProposed} hours — charging cannot fix that.`,
              !r.needsMet && `${r.needKwh - r.deliveredKwh} kWh is still missing; consider a higher limit, fewer vans per night, or daytime top-ups.`,
            ].filter(Boolean).join(" ")}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-0.5 text-xs font-bold uppercase tracking-wide">{title}</h4>
      <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
