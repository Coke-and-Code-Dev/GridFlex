import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PortfolioResults } from "@/components/gridflex/BatchReport";
import type { Portfolio } from "@/hooks/use-portfolio";
import { api } from "@/types";

vi.mock("@/types", () => ({ api: vi.fn() }));
vi.mock("@/components/gridflex/Charts", () => ({ Heatmap: () => null, LoadChart: () => null }));

it("asks about the active portfolio using the chosen model", async () => {
  vi.mocked(api).mockResolvedValue({ text: "Depot B has the highest risk.", source: "ollama", evidence: [], warnings: [] });
  const portfolio = { running: false, filename: "fleet.csv", total: 0, sites: [], report: new Blob(), error: "",
    download: vi.fn(), selected: "", setSelected: vi.fn(), serverRunId: "a".repeat(32) } as unknown as Portfolio;
  render(<PortfolioResults portfolio={portfolio} canOpenSite={false} onOpenSite={() => {}} />);
  fireEvent.change(screen.getByLabelText("Explanation model"), { target: { value: "ollama" } });
  fireEvent.change(screen.getByLabelText("Ask about this portfolio"), { target: { value: "Which depot has the highest risk?" } });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await waitFor(() => expect(screen.getByText("Depot B has the highest risk.")).toBeInTheDocument());
  expect(api).toHaveBeenCalledWith("/portfolio/ask", expect.objectContaining({ run_id: "a".repeat(32), provider: "ollama" }));
});
