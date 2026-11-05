import { useState } from "react";
import { downloadReport } from "@/types";

export function BatchReport() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function generate(source: () => Promise<string>) {
    if (running) return;
    setRunning(true);
    setStatus("Simulating each site and building the PDF. Larger files take longer.");
    setError("");
    try {
      const blob = await downloadReport(await source());
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "gridflex-portfolio.pdf";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("Portfolio report downloaded.");
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Could not generate the report.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="panel mb-4 space-y-3 p-5" aria-labelledby="batch-report-heading">
      <h3 id="batch-report-heading" className="font-semibold">Multi-site simulation and PDF</h3>
      <p className="text-sm text-muted-foreground">Upload a fleet CSV with one site ID per depot. GridFlex simulates each site independently and downloads an overview with individual site results and charts.</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">Portfolio CSV <input type="file" accept=".csv,text/csv" disabled={running}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void generate(() => file.size > 2_000_000 ? Promise.reject(new Error("Choose a CSV under 2 MB.")) : file.text());
          }} /></label>
        <button type="button" disabled={running} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
          onClick={() => void generate(async () => {
            const sample = await fetch("/gridflex-portfolio-example.csv");
            if (!sample.ok) throw new Error("The sample CSV is unavailable.");
            return sample.text();
          })}>Run three-depot sample</button>
        <a className="text-sm text-primary underline" href="/gridflex-portfolio-example.csv" download>Download sample CSV</a>
      </div>
      {status && <p role="status" className="text-sm">{status}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
