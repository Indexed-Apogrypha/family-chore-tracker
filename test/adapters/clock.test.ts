import { describe, expect, it } from "vitest";

import { fixedClock } from "@/adapters/clock/fixed";
import { systemClock } from "@/adapters/clock/system";

describe("fixedClock", () => {
  it("returns the configured instant and derives today from it", () => {
    const clock = fixedClock("2026-06-21T09:30:00.000Z");
    expect(clock.now()).toBe("2026-06-21T09:30:00.000Z");
    expect(clock.today()).toBe("2026-06-21");
  });

  it("allows today to be set independently of now", () => {
    const clock = fixedClock("2026-06-21T23:30:00.000Z", "2026-06-22");
    expect(clock.today()).toBe("2026-06-22");
  });

  it("is deterministic across calls", () => {
    const clock = fixedClock("2026-01-01T00:00:00.000Z");
    expect(clock.now()).toBe(clock.now());
    expect(clock.today()).toBe(clock.today());
  });
});

describe("systemClock", () => {
  it("returns a YYYY-MM-DD date and an ISO instant whose date part agrees", () => {
    const clock = systemClock();
    expect(clock.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(clock.now()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(clock.now().slice(0, 10)).toBe(clock.today());
  });
});
