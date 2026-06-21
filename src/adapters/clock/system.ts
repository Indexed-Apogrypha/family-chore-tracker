import type { Clock, IsoDate, IsoInstant } from "@/ports/clock";

/**
 * The real clock. `today()` is the UTC calendar date — a deliberate, documented
 * v1 simplification (no per-family timezone yet).
 */
export function systemClock(): Clock {
  return {
    today: (): IsoDate => new Date().toISOString().slice(0, 10),
    now: (): IsoInstant => new Date().toISOString(),
  };
}
