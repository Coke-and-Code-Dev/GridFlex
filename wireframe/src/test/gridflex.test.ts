import { describe, it, expect } from "vitest";
import { analyse, DEMO, EDGE } from "../lib/gridflex";
describe("gridflex", () => {
  it("demo: proposed stays under limit and meets needs", () => {
    const r = analyse(DEMO);
    expect(r.breachBaseline).toBeGreaterThan(0);
    expect(r.breachProposed).toBe(0);
    expect(r.needsMet).toBe(true);
    console.log(r.peakBaseline, r.peakProposed, r.breachBaseline);
  });
  it("edge: still breaches or short", () => {
    const r = analyse(EDGE);
    console.log(r.breachProposed, r.deliveredKwh, r.needKwh);
    expect(r.breachProposed > 0 || !r.needsMet).toBe(true);
  });
});
