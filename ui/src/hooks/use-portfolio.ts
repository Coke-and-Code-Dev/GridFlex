import { useEffect, useState } from "react";
import { simulatePortfolio, type PortfolioSite } from "@/types";

export function usePortfolio(onStart: () => void) {
  const [runId, setRunId] = useState(0);
  const [serverRunId, setServerRunId] = useState("");
  const [selected, setSelected] = useState("");
  const [running, setRunning] = useState(false);
  const [filename, setFilename] = useState("");
  const [total, setTotal] = useState(0);
  const [sites, setSites] = useState<PortfolioSite[]>([]);
  const [report, setReport] = useState<Blob>();
  const [error, setError] = useState("");

  async function generate(file: File) {
    if (running) return;
    setRunning(true);
    setRunId((id) => id + 1);
    setSelected("");
    setServerRunId("");
    onStart();
    setFilename(file.name);
    setTotal(0);
    setSites([]);
    setReport(undefined);
    setError("");
    try {
      const pdf = await simulatePortfolio(await file.text(), (event) => {
        if (event.type === "start") { setTotal(event.total); setServerRunId(event.run_id); }
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

  const hasResultsToKeep = running || sites.length > 0 || Boolean(report);
  useEffect(() => {
    if (!hasResultsToKeep) return;
    function confirmLeave(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", confirmLeave);
    return () => window.removeEventListener("beforeunload", confirmLeave);
  }, [hasResultsToKeep]);

  return { runId, serverRunId, selected, setSelected, running, filename, total, sites, report, error, generate, download };
}

export type Portfolio = ReturnType<typeof usePortfolio>;
