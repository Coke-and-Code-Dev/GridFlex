import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PortfolioAssistant } from "@/components/gridflex/BatchReport";
import { api } from "@/types";

vi.mock("@/types", () => ({ api: vi.fn() }));
vi.mock("@/components/gridflex/Charts", () => ({ Heatmap: () => null, LoadChart: () => null }));

it("asks about the active portfolio using the chosen model", async () => {
  vi.mocked(api).mockResolvedValue({ text: "Depot B has the highest risk.", source: "ollama", evidence: [], warnings: [] });
  render(<PortfolioAssistant runId={"a".repeat(32)} currentDepot="Depot A" />);
  fireEvent.change(screen.getByLabelText("Explanation model"), { target: { value: "ollama" } });
  fireEvent.change(screen.getByLabelText("Ask about this portfolio"), { target: { value: "Which depot has the highest risk?" } });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await waitFor(() => expect(screen.getByText("Depot B has the highest risk.")).toBeInTheDocument());
  expect(api).toHaveBeenCalledWith("/portfolio/ask", expect.objectContaining({ run_id: "a".repeat(32), provider: "ollama", current_depot: "Depot A" }));
});
