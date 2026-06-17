import { ModelJudgmentSchema, type ModelJudgment } from './types';

/** Raised when model output is not valid JSON or violates the verdict schema. */
export class JudgmentParseError extends Error {
  constructor(
    message: string,
    /** The raw model text, retained for logging/debugging. */
    readonly raw: string,
  ) {
    super(message);
    this.name = 'JudgmentParseError';
  }
}

/**
 * Strips a surrounding Markdown code fence (```json ... ```), which vision
 * models sometimes wrap JSON in even when asked for raw JSON.
 */
function stripCodeFences(text: string): string {
  const match = text.match(/^\s*```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  return match?.[1] ?? text;
}

/**
 * Parses and validates raw model text into a ModelJudgment, enforcing the AI
 * contract. Throws JudgmentParseError on invalid JSON or schema violations.
 * This is the deterministic, testable core of the vendor seam — the model's
 * actual visual judgment is non-deterministic and belongs in eval testing, but
 * "does the output parse and conform?" is a hard contract we can unit-test.
 */
export function parseModelJudgment(raw: string): ModelJudgment {
  const cleaned = stripCodeFences(raw).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new JudgmentParseError(
      `Model output was not valid JSON: ${(err as Error).message}`,
      raw,
    );
  }

  const result = ModelJudgmentSchema.safeParse(parsed);
  if (!result.success) {
    throw new JudgmentParseError(
      `Model output did not match the verdict schema: ${result.error.message}`,
      raw,
    );
  }
  return result.data;
}
