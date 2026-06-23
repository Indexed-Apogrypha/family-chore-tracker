import type { ChoreContext, Verdict } from "@/ports/judge";
import type { PhotoRef } from "@/ports/photo-storage";

/**
 * Shared helpers for the real vision-judge adapters (Anthropic, Gemini) so they
 * derive identical prompts and map replies to {@link Verdict} the same way.
 */

/** Resolve a stored photo to a URL the vision API can read (a short-lived signed URL). */
export type ResolveImageUrl = (photo: PhotoRef) => Promise<string>;

/** Advisory-only judge instruction — only a parent's decision is authoritative (§3, §7.1). */
export const JUDGE_SYSTEM_PROMPT =
  "You judge whether a child's chore looks complete from a photo. Your verdict " +
  "is advisory only — a parent makes the authoritative decision. Reply with a " +
  "single JSON object and nothing else: " +
  '{"pass": boolean, "confidence": number between 0 and 1, "reasoning": a short sentence}.';

/** The user prompt naming the chore (and its details, when present). */
export function chorePrompt(chore: ChoreContext): string {
  return chore.description
    ? `Chore: "${chore.title}". Details: ${chore.description}. Is it done?`
    : `Chore: "${chore.title}". Is it done?`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Parse a vision model's JSON reply into a {@link Verdict}, tolerating prose or
 * code fences around the object. Throws if no JSON object is present — the
 * caller (the use-case) maps the throw to `judge_unavailable` (§7.2, §8.2).
 */
export function parseVerdict(text: string, model: string): Verdict {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("judge response contained no JSON object");
  }
  const parsed = JSON.parse(text.slice(start, end + 1)) as {
    pass?: unknown;
    confidence?: unknown;
    reasoning?: unknown;
  };
  return {
    pass: Boolean(parsed.pass),
    confidence: clamp01(Number(parsed.confidence)),
    // Keep reasoning non-empty so every adapter satisfies the JudgePort contract
    // even when the model omits it (it is advisory display text, not control flow).
    reasoning: String(parsed.reasoning ?? "").trim() || "No reasoning provided.",
    model,
  };
}
