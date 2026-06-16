import { describe, it, expect } from 'vitest';
import { JudgmentParseError, parseModelJudgment } from './parse';
import { MESSY_FAIL } from './fixtures';

describe('parseModelJudgment', () => {
  it('parses a valid JSON judgment', () => {
    expect(parseModelJudgment(JSON.stringify(MESSY_FAIL))).toEqual(MESSY_FAIL);
  });

  it('parses JSON wrapped in a markdown code fence', () => {
    const raw = '```json\n' + JSON.stringify(MESSY_FAIL, null, 2) + '\n```';
    expect(parseModelJudgment(raw)).toEqual(MESSY_FAIL);
  });

  it('throws on non-JSON output', () => {
    expect(() => parseModelJudgment('The room looks clean to me!')).toThrow(
      JudgmentParseError,
    );
  });

  it('throws when a required field is missing', () => {
    const raw = JSON.stringify({ verdict: 'pass', confidence: 0.9 });
    expect(() => parseModelJudgment(raw)).toThrow(JudgmentParseError);
  });

  it('throws on an invalid severity value', () => {
    const raw = JSON.stringify({
      ...MESSY_FAIL,
      deviations: [{ item: 'floor', issue: 'mess', severity: 'critical' }],
    });
    expect(() => parseModelJudgment(raw)).toThrow(JudgmentParseError);
  });

  it('throws when confidence is out of the 0..1 range', () => {
    const raw = JSON.stringify({ ...MESSY_FAIL, confidence: 88 });
    expect(() => parseModelJudgment(raw)).toThrow(JudgmentParseError);
  });

  it('throws on an unknown verdict value', () => {
    const raw = JSON.stringify({ ...MESSY_FAIL, verdict: 'maybe' });
    expect(() => parseModelJudgment(raw)).toThrow(JudgmentParseError);
  });

  it('retains the raw output on the error for debugging', () => {
    try {
      parseModelJudgment('not json');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(JudgmentParseError);
      expect((err as JudgmentParseError).raw).toBe('not json');
    }
  });
});
