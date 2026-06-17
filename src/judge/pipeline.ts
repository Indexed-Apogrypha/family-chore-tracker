import { evaluateVerdict } from './evaluateVerdict';
import type { JudgeClient } from './client';
import type { JudgeInput, Verdict } from './types';

/**
 * The reference→verdict tracer bullet: take a reference + submission (+ chore
 * name), ask the judge to compare them (vendor seam), apply v1 policy, and
 * return a Verdict ready to persist. This is the spine the rest of the app —
 * camera capture, storage, history, streaks — hangs off of.
 */
export async function runJudgment(
  client: JudgeClient,
  input: JudgeInput,
): Promise<Verdict> {
  const judgment = await client.judge(input);
  const { result, status } = evaluateVerdict(judgment);

  return {
    result,
    status,
    confidence: judgment.confidence,
    matchesReference: judgment.matches_reference,
    deviations: judgment.deviations,
    notes: judgment.notes,
    model: client.model,
    judgment,
  };
}
