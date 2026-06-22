import type { Recurrence } from "@/domain/shared/enums";
import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";

/** Max length for the free-text names use-cases accept. */
export const MAX_NAME_LENGTH = 80;

/** Max length for the optional free-text description on a chore template. */
export const MAX_DESCRIPTION_LENGTH = 280;

/** Trim and bound a required free-text field, or return its validation error. */
export function requireName(field: string, value: string): Result<string> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return err({ code: "validation", field, message: `${field} is required.` });
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return err({
      code: "validation",
      field,
      message: `${field} must be ${MAX_NAME_LENGTH} characters or fewer.`,
    });
  }
  return ok(trimmed);
}

/**
 * Require a non-blank PIN, returned **verbatim** (no trimming — a PIN is an
 * exact secret). Format beyond non-empty is an app-level gate detail (§3.1).
 */
export function requirePin(value: string): Result<string> {
  if (value.trim().length === 0) {
    return err({ code: "validation", field: "pin", message: "pin is required." });
  }
  return ok(value);
}

/** Trim an optional free-text field; blank → `undefined`; bound its length. */
export function optionalDescription(
  value: string | undefined,
): Result<string | undefined> {
  if (value === undefined) return ok(undefined);
  const trimmed = value.trim();
  if (trimmed.length === 0) return ok(undefined);
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    return err({
      code: "validation",
      field: "description",
      message: `description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`,
    });
  }
  return ok(trimmed);
}

/** Require a chore's point value to be a positive integer. */
export function requirePoints(value: number): Result<number> {
  if (!Number.isInteger(value) || value <= 0) {
    return err({
      code: "validation",
      field: "points",
      message: "points must be a positive whole number.",
    });
  }
  return ok(value);
}

/**
 * Validate a recurrence shape (design §6). `none`/`daily` are always valid; a
 * `weekly` schedule must list at least one weekday, each an integer in `0..6`
 * (0 = Sunday … 6 = Saturday). A weekly chore with no days would never recur.
 */
export function requireRecurrence(value: Recurrence): Result<Recurrence> {
  if (value.kind === "weekly") {
    const valid =
      value.days.length > 0 &&
      value.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!valid) {
      return err({
        code: "validation",
        field: "recurrence",
        message: "weekly recurrence needs at least one weekday (0–6).",
      });
    }
  }
  return ok(value);
}
