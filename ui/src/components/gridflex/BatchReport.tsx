import { useState } from "react";
import { simulatePortfolio, type PortfolioSite } from "@/types";
import { Heatmap, LoadChart } from "@/components/gridflex/Charts";
import { slotClock } from "@/lib/schedule-answer";

type CompletedSite = Exclude<PortfolioSite, { error: string }>;

export function usePortfolio(onStart: () => void) {
  const [running, setRunning] = useState(false);
  const [filename, setFilename] = useState("");
  const [total, setTotal] = useState(0);
  const [sites, setSites] = useState<PortfolioSite[]>([]);
  const [report, setReport] = useState<Blob>();
  const [error, setError] = useState("");

  async function generate(file: File) {
    if (running) return;
    setRunning(true);
    onStart();
    setFilename(file.name);
    setTotal(0);
    setSites([]);
    setReport(undefined);
    setError("");
    try {
      const pdf = await simulatePortfolio(await file.text(), (event) => {
        if (event.type === "start") setTotal(event.total);
        else setSites((current) => [...current, event.result]);
      });
      setReport(pdf);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the report.");
    } finally {
      setRunning(false);
    }
  }

  function download() {
    if (!report) return;
    const url = URL.createObjectURL(report);
    const link = document.createElement("a");
    link.href = url;
    link.download = "gridflex-portfolio.pdf";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { running, filename, total, sites, report, error, generate, download };
}

type Portfolio = ReturnType<typeof usePortfolio>;

export function PortfolioUpload({ portfolio }: { portfolio: Portfolio }) {
  return (
    <section className="panel mb-4 space-y-3 p-5" aria-labelledby="portfolio-upload-heading">
      <h3 id="portfolio-upload-heading" className="font-semibold">Multi-depot simulation</h3>
      <p className="text-sm text-muted-foreground">Upload one portfolio CSV to simulate all depots and compare their results.</p>
      <label className="inline-flex cursor-pointer rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary focus-within:ring-2 focus-within:ring-primary has-disabled:opacity-60">
        {portfolio.running ? "Simulation running…" : "Upload portfolio CSV"}
        <input className="sr-only" type="file" accept=".csv,text/csv" disabled={portfolio.running}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void portfolio.generate(file);
          }} />
      </label>
    </section>
  );
}

export function PortfolioResults({ portfolio, canOpenSite, onOpenSite }: { portfolio: Portfolio; canOpenSite: boolean; onOpenSite: (site: CompletedSite) => void }) {
  const { running, filename, total, sites, report, error, download } = portfolio;
  const [selected, setSelected] = useState("");
  const completed = sites.filter((site): site is CompletedSite => !("error" in site));
  const failures = sites.length - completed.length;
  const fullyCharged = completed.reduce((sum, site) => sum + site.full, 0);
  const totalVans = completed.reduce((sum, site) => sum + site.vans, 0);
  const unmet = completed.reduce((sum, site) => sum + site.unmet_kwh, 0);
  const fits = completed.filter((site) => site.verdict === "fits").length;
  const activeSite = completed.find((site) => site.site === selected) ?? completed[0];

  return (
    <section className="panel mb-4 space-y-4 p-5" aria-labelledby="batch-report-heading">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Company portfolio</p>
        <h2 id="batch-report-heading" className="mt-1 text-xl font-semibold">Multi-depot results</h2>
      </div>
      {filename && <p className="break-all text-sm text-muted-foreground">{filename}</p>}
      {running && <div className="space-y-2">
        <p role="status" className="text-sm">{total === 0 ? "Validating CSV…" : sites.length === total ? "Building the PDF…" : `${sites.length} of ${total} sites processed`}</p>
        <progress aria-label="Sites processed" max={total || 1} {...(total ? { value: sites.length } : {})} className="w-full accent-primary" />
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {report && <p role="status" className="text-sm">Report ready. {completed.length} of {total} sites simulated{failures ? `, ${failures} could not be simulated` : ""}.</p>}
      {!!sites.length && <>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ["Sites processed", `${sites.length}/${total}`],
            ["Sites that fit", fits],
            ["Vans fully charged", totalVans ? `${fullyCharged}/${totalVans}` : "—"],
            ["Energy unmet", completed.length ? `${unmet.toFixed(2)} kWh` : "—"],
          ].map(([label, value]) => <div key={label} className="rounded-lg border border-border p-3">
            <dt className="text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-semibold">{value}</dd>
          </div>)}
        </dl>
        <div className="max-h-96 overflow-auto rounded-lg border border-border">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="sticky top-0 bg-card"><tr>{["Depot", "Postcode", "Vans full", "Unmet kWh", "Breach rate", "Verdict"].map((label) => <th key={label} scope="col" className="px-3 py-2">{label}</th>)}</tr></thead>
            <tbody>{sites.map((site) => <tr key={site.site} className="border-t border-border">
              <th scope="row" className="px-3 py-2 font-medium">{site.site}{site.province && <span className="block text-xs text-muted-foreground">{site.province}</span>}</th>
              <td className="px-3 py-2">{site.postcode}</td>
              {"error" in site ? <td colSpan={4} className="px-3 py-2 text-destructive">{site.error}</td> : <>
                <td className="px-3 py-2">{site.full}/{site.vans}</td>
                <td className="px-3 py-2">{site.unmet_kwh.toFixed(2)}</td>
                <td className="px-3 py-2">{site.breach_pct.toFixed(2)}%</td>
                <td className="px-3 py-2 capitalize">{site.verdict.replaceAll("_", " ")}</td>
              </>}
            </tr>)}</tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Fleet totals include successfully simulated sites. Breach rates describe held-out synthetic windows at each site.</p>
      </>}
      {activeSite && (
        <section className="space-y-4 border-t border-border pt-4" aria-label="Depot analysis">
          <label className="flex flex-wrap items-center gap-3 text-sm font-semibold">Inspect depot
            <select className="max-w-full rounded-lg border border-border bg-background px-3 py-2" value={activeSite.site} onChange={(event) => setSelected(event.target.value)}>
              {completed.map((site) => <option key={site.site} value={site.site}>{site.site} · {site.postcode}</option>)}
            </select>
          </label>
          <DepotDetails site={activeSite} />
          <button type="button" disabled={!canOpenSite} onClick={() => onOpenSite(activeSite)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent">
            Open this depot in Charging Plan
          </button>
        </section>
      )}
      {report && <div className="border-t border-border pt-4">
        <button type="button" onClick={download} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Download full PDF report</button>
      </div>}
    </section>
  );
}

function DepotDetails({ site }: { site: CompletedSite }) {
  const { detail, scenario, area } = site;
  const { schedule, report } = detail;
  const charging = detail.baseline_kw.map((base, slot) => base + schedule.power.reduce((sum, row) => sum + (row[slot] ?? 0), 0));
  return <div className="space-y-4">
    <div>
      <h3 className="text-lg font-semibold">{site.site} · {site.postcode}</h3>
      <p className="text-sm text-muted-foreground">
        {area ? `${area.area_name ?? "Area unknown"} · ${area.status.replaceAll("_", " ")} · Map date ${area.data_date}` : "No matching grid-map entry"}
      </p>
      {area && <p className="text-sm text-muted-foreground">{area.operator ?? "Operator unknown"} · Waiting list {area.queue_requests ?? "unavailable"} · Expected fix {area.expected_fix_year ?? "unavailable"}</p>}
      <p className="mt-2 text-sm">{scenario.limit_kw} kW firm connection · {scenario.vans} vans · {report.n_windows} synthetic test windows · Solver {schedule.status}</p>
      <p className="mt-1 text-sm">Optimized breach rate {site.breach_pct.toFixed(2)}% versus {site.immediate_pct.toFixed(2)}% for immediate charging. Worst optimized overshoot {site.worst_kw.toFixed(2)} kW{report.worst_overshoot_time ? ` at ${report.worst_overshoot_time}` : ""}.</p>
      <p className="mt-1 text-sm">{site.full}/{site.vans} vans fully charged · {site.unmet_kwh.toFixed(2)} kWh unmet · Verdict {site.verdict.replaceAll("_", " ")}.</p>
    </div>
    <LoadChart title="Depot demand from noon to noon (kW)" limit={detail.limit_kw} band={detail.normal_band_kw}
      stacked={[detail.baseline_kw, charging]} series={[
        { label: "Cautious baseline", data: detail.baseline_kw, cls: "stroke-muted-foreground" },
        { label: "Immediate charging", data: detail.baseline_kw.map((base, slot) => base + (detail.immediate_power_kw[slot] ?? 0)), cls: "stroke-muted-foreground", dash: "4 3" },
        { label: "Optimized net demand", data: charging.map((load, slot) => load + (schedule.battery_charge[slot] ?? 0) - (schedule.battery_discharge[slot] ?? 0)), cls: "stroke-primary" },
      ]} />
    <h4 className="font-semibold">Van charging schedule</h4>
    <Heatmap schedule={schedule.power} needs={detail.vans.map((van) => Math.ceil(van.energy_kwh * 4) / 4)} chargerKw={Math.max(...detail.vans.map((van) => van.charger_kw))} />
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr><th>Van</th><th>Charging ends</th><th>Energy short</th></tr></thead>
        <tbody>{detail.vans.map((van, i) => {
          const end = schedule.power[i]?.reduce((last, kw, slot) => kw > 0 ? slot + 1 : last, 0) ?? 0;
          return <tr key={van.name}><td>{van.name}</td><td>{end ? `${slotClock(end)}${end >= 48 ? " next day" : ""}` : "No charging scheduled"}</td><td>{(schedule.unmet_kwh[i] ?? 0).toFixed(2)} kWh</td></tr>;
        })}</tbody>
      </table>
    </div>
    <h4 className="font-semibold">Breach timing</h4>
    <LoadChart title="Held-out windows over the limit by time" series={[{ label: "Windows over limit", data: report.over_by_slot, cls: "stroke-destructive" }]} />
    {scenario.battery_kwh > 0 && <><h4 className="font-semibold">Battery stored energy</h4>
      <LoadChart title="Battery stored energy (kWh)" series={[{ label: "Stored energy", data: schedule.battery_soc_kwh, cls: "stroke-success" }]} />
      <p className="text-xs text-muted-foreground">Battery replay clips negative net demand without recalculating battery state for each window.</p></>}
  </div>;
}
