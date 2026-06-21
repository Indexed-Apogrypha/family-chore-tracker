import { describe, expect, it } from "vitest";

import { fixedClock } from "@/adapters/clock/fixed";

// The Clock *shape* contract (system clock) lives in test/contract/clock.contract.ts.
// These cover the fixed clock's fixture-specific behaviour.
describe("fixedClock", () => {
  it("returns the configured instant and derives today from it", () => {
    const clock = fixedClock("2026-06-21T09:30:00.000Z");
    expect(clock.now()).toBe("2026-06-21T09:30:00.000Z");
    expect(clock.today()).toBe("2026-06-21");
  });

  it("allows today to be set independently of now", () => {
    expect(fixedClock("2026-06-21T23:30:00.000Z", "2026-06-22").today()).toBe(
      "2026-06-22",
    );
  });

  it("is deterministic across calls", () => {
    const clock = fixedClock("2026-01-01T00:00:00.000Z");
    expect(clock.now()).toBe(clock.now());
    expect(clock.today()).toBe(clock.today());
  });
});
