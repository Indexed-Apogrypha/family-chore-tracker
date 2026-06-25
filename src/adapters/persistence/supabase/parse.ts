import type { Json } from "@/composition/database.types";
import type { Recurrence } from "@/domain/shared/enums";
import type { Verdict } from "@/ports/judge";

/**
 * Validating mappers for the JSON columns the Supabase adapters read back
 * (#137). The judge **write** boundary already clamps/coerces every verdict
 * (`adapters/judge/verdict.ts` `parseVerdict`) and the use-case validates every
 * recurrence (`usecases/validation.ts` `requireRecurrence`) — but the DB **read**
 * boundary used to trust the row blindly (`row.x as unknown as T`), erasing the
 * type system exactly where external data (a legacy row, a hand-edited record, a
 * migration) re-enters. These parsers fail **loud** on a malformed row instead
 * of feeding a bad `Verdict`/`Recurrence` straight into domain logic.
 */

function asObject(value: Json, column: string): { [key: string]: Json | undefined } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${column} is not a JSON object`);
  }
  return value;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Validate + coerce a stored `submissions.ai_verdict` back into a {@link Verdict},
 * mirroring `parseVerdict`'s coercion: clamp `confidence` to `[0,1]`, keep
 * `reasoning` non-empty. A non-object value (the structural corruption a cast
 * would have hidden) throws.
 */
export function parseStoredVerdict(value: Json): Verdict {
  const obj = asObject(value, "submissions.ai_verdict");
  return {
    pass: Boolean(obj.pass),
    confidence: clamp01(Number(obj.confidence)),
    reasoning: String(obj.reasoning ?? "").trim() || "No reasoning provided.",
    model: String(obj.model ?? "").trim() || "unknown",
  };
}

/**
 * Validate a stored `chore_templates.recurrence` back into a {@link Recurrence},
 * mirroring `requireRecurrence`'s shape check: `none`/`daily` pass; `weekly` must
 * carry a non-empty `days` array of integers in `0..6`. Any other shape throws.
 */
export function parseStoredRecurrence(value: Json): Recurrence {
  const obj = asObject(value, "chore_templates.recurrence");
  if (obj.kind === "none" || obj.kind === "daily") {
    return { kind: obj.kind };
  }
  if (obj.kind === "weekly") {
    const days = obj.days;
    const valid =
      Array.isArray(days) &&
      days.length > 0 &&
      days.every(
        (d) => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6,
      );
    if (!valid) {
      throw new Error(
        "chore_templates.recurrence: weekly needs a non-empty days array in 0..6",
      );
    }
    return { kind: "weekly", days: days as number[] };
  }
  throw new Error(
    `chore_templates.recurrence: unknown kind ${JSON.stringify(obj.kind)}`,
  );
}
