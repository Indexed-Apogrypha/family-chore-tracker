import type { PhotoRef } from "./photo-storage";

/**
 * The vision-judge seam (design §5). `fake` (deterministic, keyless) | `anthropic`
 * | `gemini`, selected at the composition root with Anthropic precedence. The
 * verdict is **advisory** — only a parent's decision is authoritative (§3, §7.1).
 */

/** What the judge is told the chore is. */
export interface ChoreContext {
  title: string;
  description?: string;
}

/** The advisory verdict; persisted verbatim as `submissions.ai_verdict` (§5, §6). */
export interface Verdict {
  pass: boolean;
  confidence: number;
  reasoning: string;
  model: string;
}

export interface JudgePort {
  evaluate(photo: PhotoRef, chore: ChoreContext): Promise<Verdict>;
}
