import { describe, expect, it } from "vitest";

import type { Clock } from "@/ports/clock";

/** The Clock contract (design §5): the ISO shape invariants any clock must hold. */
export function runClockContract(label: string, makeClock: () => Clock): void {
  describe(`Clock contract — ${label}`, () => {
    it("today() is a YYYY-MM-DD date", () => {
      expect(makeClock().today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("now() is an ISO instant whose date part agrees with today()", () => {
      const clock = makeClock();
      expect(clock.now()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(clock.now().slice(0, 10)).toBe(clock.today());
    });
  });
}
