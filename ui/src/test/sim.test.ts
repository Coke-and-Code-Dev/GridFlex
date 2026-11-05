import { describe, expect, it } from "vitest";
import { PRESETS, simulate } from "@/lib/sim";

describe("simulator", () => {
  it("is deterministic", () => {
    expect(simulate(PRESETS.tight)).toEqual(simulate(PRESETS.tight));
  });
  it("optimized never exceeds the limit", () => {
    for (const p of Object.values(PRESETS)) expect(simulate(p).opt.daysOver).toBe(0);
  });
  it("tight immediate charging exceeds the limit", () => {
    expect(simulate(PRESETS.tight).imm.daysOver).toBeGreaterThan(0);
  });
  it("battery reduces shortfall vs tight", () => {
    expect(simulate(PRESETS.battery).opt.kwhShort).toBeLessThan(simulate(PRESETS.tight).opt.kwhShort);
  });
});
