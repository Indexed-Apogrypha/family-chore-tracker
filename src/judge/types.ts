import { z } from 'zod';

/** Deviation severities, ordered most→least serious. */
export const SEVERITIES = ['high', 'medium', 'low'] as const;
export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;

export const DeviationSchema = z.object({
  item: z.string(),
  issue: z.string(),
  severity: SeveritySchema,
});
export type Deviation = z.infer<typeof DeviationSchema>;

/**
 * The strict JSON contract the vision model must return. Mirrors the "AI
 * contract" in PRD.md. Field names are snake_case because that is what we ask
 * the model to emit; the rest of the app reads these through the Verdict the
 * pipeline produces.
 */
export const ModelJudgmentSchema = z.object({
  matches_reference: z.boolean(),
  verdict: z.enum(['pass', 'fail']),
  confidence: z.number().min(0).max(1),
  deviations: z.array(DeviationSchema),
  uncertain: z.boolean(),
  notes: z.string(),
});
export type ModelJudgment = z.infer<typeof ModelJudgmentSchema>;

/** Final pass/fail decision. The *system* owns this, not the model. */
export type VerdictResult = 'pass' | 'fail';

/**
 * Workflow status the system stamps on a verdict.
 *  - `confirmed`:    decisive enough to show the child directly.
 *  - `needs_review`: ambiguous/low-confidence; routed for a parent to look at.
 */
export type VerdictStatus = 'confirmed' | 'needs_review';

export interface ImageInput {
  /** Base64-encoded image bytes (no `data:` prefix). */
  data: string;
  /** IANA mime type, e.g. "image/jpeg". */
  mimeType: string;
}

export interface JudgeInput {
  /** The parent's photo of the room in its accepted "done" state. */
  referenceImage: ImageInput;
  /** The child's photo to be judged against the reference. */
  submissionImage: ImageInput;
  /** Human-readable chore name, e.g. "Tidy room". */
  choreName: string;
}

/**
 * The verdict the pipeline produces. Maps onto the `verdicts` table in PRD.md
 * (result, status, confidence, deviations, model) and retains the raw model
 * judgment so disputes and audits have the original output to inspect.
 */
export interface Verdict {
  result: VerdictResult;
  status: VerdictStatus;
  confidence: number;
  matchesReference: boolean;
  deviations: Deviation[];
  notes: string;
  /** Model identifier, recorded per verdict for titration auditing. */
  model: string;
  /** The raw, validated model output. */
  judgment: ModelJudgment;
}
