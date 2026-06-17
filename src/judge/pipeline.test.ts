import { describe, it, expect } from 'vitest';
import { runJudgment } from './pipeline';
import { FakeJudgeClient } from './client';
import { BLURRY_UNCERTAIN, CLEAN_PASS, MESSY_FAIL } from './fixtures';
import type { JudgeInput } from './types';

const input: JudgeInput = {
  choreName: 'Tidy room',
  referenceImage: { data: 'ref', mimeType: 'image/jpeg' },
  submissionImage: { data: 'sub', mimeType: 'image/jpeg' },
};

describe('runJudgment (reference→verdict pipeline)', () => {
  it('produces a confirmed pass for a clean submission', async () => {
    const verdict = await runJudgment(new FakeJudgeClient(CLEAN_PASS), input);
    expect(verdict.result).toBe('pass');
    expect(verdict.status).toBe('confirmed');
    expect(verdict.matchesReference).toBe(true);
    expect(verdict.judgment).toEqual(CLEAN_PASS);
  });

  it('produces a confirmed fail when a high-severity deviation exists', async () => {
    const verdict = await runJudgment(new FakeJudgeClient(MESSY_FAIL), input);
    expect(verdict.result).toBe('fail');
    expect(verdict.status).toBe('confirmed');
    expect(verdict.deviations).toHaveLength(2);
  });

  it('routes an uncertain judgment to needs_review', async () => {
    const verdict = await runJudgment(new FakeJudgeClient(BLURRY_UNCERTAIN), input);
    expect(verdict.status).toBe('needs_review');
  });

  it('records the model identifier for auditing', async () => {
    const client = new FakeJudgeClient(CLEAN_PASS, 'gemini-2.5-flash');
    const verdict = await runJudgment(client, input);
    expect(verdict.model).toBe('gemini-2.5-flash');
  });
});
