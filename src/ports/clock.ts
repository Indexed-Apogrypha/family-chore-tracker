/**
 * The clock seam (design §5). `system` in real mode; `fixed` in tests so dated
 * behaviour (lazy instance generation, ledger timestamps) is deterministic.
 */

/** A calendar date in `YYYY-MM-DD` form — no time, no zone. */
export type IsoDate = string;

/** An instant in ISO-8601 form, e.g. `2026-06-21T09:00:00.000Z`. */
export type IsoInstant = string;

export interface Clock {
  today(): IsoDate;
  now(): IsoInstant;
}
