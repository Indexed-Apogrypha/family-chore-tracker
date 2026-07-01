import type { Json } from "@/composition/database.types";
import type { Recurrence } from "@/domain/shared/enums";
import type { Verdict } from "@/ports/judge";

/**
 * Validating mappers for the JSON columns read back from Supabase (#137).
 *
 * The judge **write** boundary is validated (`adapters/judge/verdict.ts`
 * `parseVerdict` clamps/coerces before anything is stored), but a legacy row,
 * a hand-edited record, or a schema migration could still put a malformed
 * shape in `submissions.ai_verdict` / `chore_templates.recurrence`. These
 * mappers re-validate at the **read** boundary so a bad row fails loud — a
 * thrown fault the use-case maps to `persistence_unavailable` (§8.2) — instead
 * of feeding a mis-shaped `Verdict`/`Recurrence` into domain logic.
 */

function fail(column: string, value: Json): never {
  throw new Error(
    `malformed ${column} JSON read back from Supabase: ${JSON.stringify(value)}`,
  );
}

/** Validate a stored `ai_verdict` row value into a {@link Verdict}. */
export function storedVerdict(value: Json): Verdict {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("ai_verdict", value);
  }
  const v = value as Record<string, unknown>;
  if (
    typeof v.pass !== "boolean" ||
    typeof v.confidence !== "number" ||
    !Number.isFinite(v.confidence) ||
    typeof v.reasoning !== "string" ||
    typeof v.model !== "string"
  ) {
    fail("ai_verdict", value);
  }
  return {
    pass: v.pass,
    // Clamp like the write boundary does — display math assumes 0..1.
    confidence: Math.max(0, Math.min(1, v.confidence)),
    reasoning: v.reasoning,
    model: v.model,
  };
}

/** Validate a stored `recurrence` row value into a {@link Recurrence}. */
export function storedRecurrence(value: Json): Recurrence {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("recurrence", value);
  }
  const r = value as Record<string, unknown>;
  if (r.kind === "none" || r.kind === "daily") {
    return { kind: r.kind };
  }
  if (r.kind === "weekly") {
    const days = r.days;
    const valid =
      Array.isArray(days) &&
      days.length > 0 &&
      days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (valid) return { kind: "weekly", days: days as number[] };
  }
  fail("recurrence", value);
}
