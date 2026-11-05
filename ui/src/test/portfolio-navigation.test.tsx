import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { usePortfolio } from "@/hooks/use-portfolio";
import { simulatePortfolio } from "@/types";

vi.mock("@/types", () => ({ simulatePortfolio: vi.fn() }));

it("keeps an active run across view changes and warns before unloading", async () => {
  let finish!: (report: Blob) => void;
  const pending = new Promise<Blob>((resolve) => { finish = resolve; });
  vi.mocked(simulatePortfolio).mockImplementation(async (_csv, progress) => {
    progress({ type: "start", total: 2, run_id: "a".repeat(32) });
    progress({ type: "site", result: { site: "Depot A", postcode: "2311BD", province: null, vans: 3, error: "No result" } });
    return pending;
  });
  const { result, rerender, unmount } = renderHook(
    ({ tab }) => usePortfolio(() => { void tab; }),
    { initialProps: { tab: "setup" } },
  );
  const file = { name: "fleet.csv", text: async () => "csv" } as File;
  let generation!: Promise<void>;
  await act(async () => { generation = result.current.generate(file); });
  expect(result.current.running).toBe(true);
  expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);

  rerender({ tab: "explanation" });
  expect(result.current.sites).toHaveLength(1);
  expect(simulatePortfolio).toHaveBeenCalledTimes(1);

  await act(async () => { finish(new Blob(["%PDF"], { type: "application/pdf" })); await generation; });
  expect(result.current.report).toBeDefined();
  expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
  unmount();
  expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true);
});
