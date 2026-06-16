import { describe, it, expect } from 'vitest';
import { CONFIDENCE_THRESHOLD, evaluateVerdict } from './evaluateVerdict';
import type { ModelJudgment } from './types';

function judgment(overrides: Partial<ModelJudgment> = {}): ModelJudgment {
  return {
    matches_reference: true,
    verdict: 'pass',
    confidence: 0.95,
    deviations: [],
    uncertain: false,
    notes: '',
    ...overrides,
  };
}

describe('evaluateVerdict', () => {
  it('passes and confirms when there are no deviations', () => {
    expect(evaluateVerdict(judgment())).toEqual({
      result: 'pass',
      status: 'confirmed',
    });
  });

  it('passes when deviations are only medium/low (minor messiness is fair)', () => {
    const j = judgment({
      deviations: [
        { item: 'desk', issue: 'minor clutter', severity: 'low' },
        { item: 'shelf', issue: 'slightly disordered', severity: 'medium' },
      ],
    });
    expect(evaluateVerdict(j)).toEqual({ result: 'pass', status: 'confirmed' });
  });

  it('fails when any deviation is high severity', () => {
    const j = judgment({
      matches_reference: false,
      verdict: 'fail',
      deviations: [
        { item: 'floor', issue: 'clothing on floor', severity: 'high' },
        { item: 'desk', issue: 'minor clutter', severity: 'low' },
      ],
    });
    expect(evaluateVerdict(j)).toEqual({ result: 'fail', status: 'confirmed' });
  });

  it('routes to needs_review when the model is uncertain, regardless of result', () => {
    expect(evaluateVerdict(judgment({ uncertain: true }))).toEqual({
      result: 'pass',
      status: 'needs_review',
    });
  });

  it('routes to needs_review when confidence is below threshold', () => {
    const j = judgment({ confidence: CONFIDENCE_THRESHOLD - 0.01 });
    expect(evaluateVerdict(j).status).toBe('needs_review');
  });

  it('confirms when confidence is exactly at threshold', () => {
    const j = judgment({ confidence: CONFIDENCE_THRESHOLD });
    expect(evaluateVerdict(j).status).toBe('confirmed');
  });

  it('derives fail independently of needs_review (high severity + low confidence)', () => {
    const j = judgment({
      confidence: 0.2,
      deviations: [{ item: 'floor', issue: 'toys everywhere', severity: 'high' }],
    });
    expect(evaluateVerdict(j)).toEqual({ result: 'fail', status: 'needs_review' });
  });
});
