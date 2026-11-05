import { describe, expect, it } from "vitest";
import { scheduleAnswer } from "@/lib/schedule-answer";

describe("scheduled charging completion", () => {
  const result = {
    vans: [{ name: "Van 1" }, { name: "Van 2" }, { name: "Van 3" }],
    schedule: {
      power: [
        Array.from({ length: 96 }, (_, slot) => slot === 47 ? 11 : 0),
        Array.from({ length: 96 }, (_, slot) => slot === 75 ? 11 : 0),
        Array.from({ length: 96 }, () => 0),
      ],
      unmet_kwh: [0, 5, 10],
    },
  };

  it("reads each van's last powered interval, not the departure window", () => {
    const answer = scheduleAnswer("When will the charging of all the vans complete?", result);
    expect(answer).toContain("07:00 next day (Van 2)");
    expect(answer).toContain("Van 1: finishes at 00:00 next day");
    expect(answer).toContain("Van 2: charging ends at 07:00 next day, 5.00 kWh short");
    expect(answer).toContain("Van 3: no charging scheduled, 10.00 kWh short");
  });

  it("answers for a named van and leaves hypothetical questions to the assistant", () => {
    expect(scheduleAnswer("When will Van 1 finish charging?", result)).toBe("Van 1: finishes at 00:00 next day.");
    expect(scheduleAnswer("When would charging finish if I added a battery?", result)).toBeUndefined();
  });
});
