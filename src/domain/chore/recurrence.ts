import type { IsoDate } from "@/ports/clock";

import type { ChoreTemplate } from "./types";

/**
 * Recurrence due-date logic (design §6, §7.3). Pure: given a template and a
 * calendar date, decide whether the template's schedule lands an instance on
 * that date. The caller (`getTodayBoard`) is responsible for the separate
 * `active` filter and for the idempotent generation itself.
 *
 * - `none` — a one-off; never scheduled by recurrence (one-offs are created
 *   explicitly via `createOneOff`, never lazily regenerated — §6).
 * - `daily` — every date.
 * - `weekly` — when the date's weekday is listed in `days`.
 */
export function isDue(template: ChoreTemplate, date: IsoDate): boolean {
  const { recurrence } = template;
  switch (recurrence.kind) {
    case "none":
      return false;
    case "daily":
      return true;
    case "weekly":
      return recurrence.days.includes(weekday(date));
  }
}

/**
 * The day of the week for an ISO `YYYY-MM-DD` date: `0` = Sunday … `6` =
 * Saturday (matching `Date.prototype.getUTCDay`). Parsed via `Date.UTC` so the
 * result never depends on the host timezone.
 */
export function weekday(date: IsoDate): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
