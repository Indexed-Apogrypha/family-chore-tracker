import type { ModelJudgment, VerdictResult, VerdictStatus } from './types';

/**
 * At or above this confidence a judgment is treated as decisive; below it the
 * verdict is routed to a parent rather than auto-applied. Policy knob, kept
 * here so the tuning lives next to the rule it governs.
 */
export const CONFIDENCE_THRESHOLD = 0.7;

export interface VerdictDecision {
  result: VerdictResult;
  status: VerdictStatus;
}

/**
 * Applies the v1 verdict policy to a model judgment. The system owns this
 * decision, not the model (see the "AI contract" in docs/PRD.md):
 *
 *  - result: `fail` iff there is at least one high-severity deviation.
 *    Medium/low deviations are recorded but never fail a child on their own
 *    ("minor messiness shouldn't fail me"). Derived from severity rather than
 *    the model's own holistic `verdict` field, so the rule is auditable.
 *  - status: `needs_review` when the model is `uncertain` or its confidence is
 *    below CONFIDENCE_THRESHOLD, so an unsure machine call gets a human look
 *    instead of silently passing or failing. Otherwise `confirmed`.
 *
 * Pure function: same input always yields the same decision.
 */
export function evaluateVerdict(judgment: ModelJudgment): VerdictDecision {
  const hasHighSeverity = judgment.deviations.some((d) => d.severity === 'high');
  const result: VerdictResult = hasHighSeverity ? 'fail' : 'pass';

  const needsReview =
    judgment.uncertain || judgment.confidence < CONFIDENCE_THRESHOLD;
  const status: VerdictStatus = needsReview ? 'needs_review' : 'confirmed';

  return { result, status };
}
