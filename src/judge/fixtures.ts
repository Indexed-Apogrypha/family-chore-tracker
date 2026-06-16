import type { ModelJudgment } from './types';

/**
 * Sample model judgments covering the three policy paths (pass, fail-on-high,
 * uncertain). Shared by the pipeline tests and the demo runner so the tracer
 * bullet can fire without a live model.
 */

/** Clean room: only trivial differences → confirmed pass. */
export const CLEAN_PASS: ModelJudgment = {
  matches_reference: true,
  verdict: 'pass',
  confidence: 0.94,
  deviations: [
    { item: 'desk', issue: 'one book slightly out of place', severity: 'low' },
  ],
  uncertain: false,
  notes: 'Room closely matches the reference; only trivial differences.',
};

/** Clothes on the floor: a high-severity deviation → confirmed fail. */
export const MESSY_FAIL: ModelJudgment = {
  matches_reference: false,
  verdict: 'fail',
  confidence: 0.88,
  deviations: [
    { item: 'floor', issue: 'clothing on floor not in reference', severity: 'high' },
    { item: 'desk', issue: 'minor clutter', severity: 'low' },
  ],
  uncertain: false,
  notes: 'Bed matches reference; floor is the main difference.',
};

/** Underexposed photo: model is unsure → routed to a parent for review. */
export const BLURRY_UNCERTAIN: ModelJudgment = {
  matches_reference: false,
  verdict: 'fail',
  confidence: 0.4,
  deviations: [
    { item: 'overall', issue: 'submission too dark to compare reliably', severity: 'medium' },
  ],
  uncertain: true,
  notes: 'Submission photo is underexposed; cannot confidently compare to reference.',
};
