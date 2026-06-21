import type { Clock, IsoDate, IsoInstant } from "@/ports/clock";

/**
 * A frozen clock for tests. `today` defaults to the date part of `now` but can
 * be set independently (e.g. to probe due-date boundaries).
 */
export function fixedClock(
  now: IsoInstant,
  today: IsoDate = now.slice(0, 10),
): Clock {
  return {
    today: () => today,
    now: () => now,
  };
}
