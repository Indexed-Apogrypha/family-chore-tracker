import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";

/** Max length for the free-text names use-cases accept. */
export const MAX_NAME_LENGTH = 80;

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
