import { useState } from "react";
import { simulatePortfolio, type PortfolioSite } from "@/types";

export function BatchReport() {
  const [running, setRunning] = useState(false);
  const [filename, setFilename] = useState("");
  const [total, setTotal] = useState(0);
  const [sites, setSites] = useState<PortfolioSite[]>([]);
  const [report, setReport] = useState<Blob>();
  const [error, setError] = useState("");

  async function generate(file: File) {
    if (running) return;
    setRunning(true);
    setFilename(file.name);
    setTotal(0);
    setSites([]);
    setReport(undefined);
    setError("");
    try {
      if (file.size > 2_000_000) throw new Error("Choose a CSV under 2 MB.");
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

  const completed = sites.filter((site): site is Exclude<PortfolioSite, { error: string }> => !("error" in site));
  const failures = sites.length - completed.length;
  const fullyCharged = completed.reduce((sum, site) => sum + site.full, 0);
  const totalVans = completed.reduce((sum, site) => sum + site.vans, 0);
  const unmet = completed.reduce((sum, site) => sum + site.unmet_kwh, 0);
  const fits = completed.filter((site) => site.verdict === "fits").length;

  return (
    <section className="panel mb-4 space-y-4 p-5" aria-labelledby="batch-report-heading">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Company portfolio</p>
        <h2 id="batch-report-heading" className="mt-1 text-xl font-semibold">Multi-site simulation</h2>
        <p className="mt-1 text-sm text-muted-foreground">Upload one fleet CSV for all your depots. Each site is simulated against its own postcode, connection limit and fleet requests.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background has-disabled:cursor-wait has-disabled:opacity-60">
          {running ? "Simulation running…" : "Upload portfolio CSV"}
          <input className="sr-only" type="file" accept=".csv,text/csv" disabled={running}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void generate(file);
            }} />
        </label>
        {report && <button type="button" onClick={download} className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-accent">Download full PDF report</button>}
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
    </section>
  );
}
