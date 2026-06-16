import { describe, it, expect } from 'vitest';
import { computeStreak } from './computeStreak';
import type { StreakSubmission, StreakVerdict } from './types';
import type { VerdictResult, VerdictStatus } from '../judge/types';

function sub(id: string, createdAt: string): StreakSubmission {
  return { id, createdAt };
}
function vrd(
  submissionId: string,
  result: VerdictResult,
  status: VerdictStatus,
): StreakVerdict {
  return { submissionId, result, status };
}

// Four real consecutive calendar days; noon UTC keeps them unambiguous.
const D1 = '2026-06-10T12:00:00Z';
const D2 = '2026-06-11T12:00:00Z';
const D3 = '2026-06-12T12:00:00Z';
const D4 = '2026-06-13T12:00:00Z';

describe('computeStreak', () => {
  it('returns an empty streak for no events', () => {
    expect(computeStreak([], [])).toEqual({
      current: 0,
      longest: 0,
      lastPassDate: null,
    });
  });

  it('counts a single passed day', () => {
    const streak = computeStreak([sub('s1', D1)], [vrd('s1', 'pass', 'confirmed')]);
    expect(streak).toEqual({ current: 1, longest: 1, lastPassDate: '2026-06-10' });
  });

  it('counts consecutive passed days', () => {
    const streak = computeStreak(
      [sub('s1', D1), sub('s2', D2), sub('s3', D3)],
      [
        vrd('s1', 'pass', 'confirmed'),
        vrd('s2', 'pass', 'confirmed'),
        vrd('s3', 'pass', 'confirmed'),
      ],
    );
    expect(streak).toEqual({ current: 3, longest: 3, lastPassDate: '2026-06-12' });
  });

  it('resumes after a break, so longest can exceed current', () => {
    const streak = computeStreak(
      [sub('s1', D1), sub('s2', D2), sub('s3', D3), sub('s4', D4)],
      [
        vrd('s1', 'pass', 'confirmed'),
        vrd('s2', 'pass', 'confirmed'),
        vrd('s3', 'fail', 'confirmed'),
        vrd('s4', 'pass', 'confirmed'),
      ],
    );
    expect(streak).toEqual({ current: 1, longest: 2, lastPassDate: '2026-06-13' });
  });

  it('zeroes current when the most recent decisive day is a fail', () => {
    const streak = computeStreak(
      [sub('s1', D1), sub('s2', D2), sub('s3', D3)],
      [
        vrd('s1', 'pass', 'confirmed'),
        vrd('s2', 'pass', 'confirmed'),
        vrd('s3', 'fail', 'confirmed'),
      ],
    );
    expect(streak).toEqual({ current: 0, longest: 2, lastPassDate: '2026-06-11' });
  });

  it('treats a day as passed if any verdict that day is a confirmed pass (fail-then-fix)', () => {
    const streak = computeStreak(
      [sub('s1', D1)],
      [vrd('s1', 'fail', 'confirmed'), vrd('s1', 'pass', 'confirmed')],
    );
    expect(streak).toEqual({ current: 1, longest: 1, lastPassDate: '2026-06-10' });
  });

  it('folds a day independently of verdict order', () => {
    const streak = computeStreak(
      [sub('s1', D1)],
      [vrd('s1', 'pass', 'confirmed'), vrd('s1', 'fail', 'confirmed')],
    );
    expect(streak).toEqual({ current: 1, longest: 1, lastPassDate: '2026-06-10' });
  });

  it('counts multiple passes on the same calendar day as one day', () => {
    const streak = computeStreak(
      [sub('s1', '2026-06-10T08:00:00Z'), sub('s2', '2026-06-10T20:00:00Z')],
      [vrd('s1', 'pass', 'confirmed'), vrd('s2', 'pass', 'confirmed')],
    );
    expect(streak).toEqual({ current: 1, longest: 1, lastPassDate: '2026-06-10' });
  });

  it('treats a trailing needs_review day as neutral', () => {
    const streak = computeStreak(
      [sub('s1', D1), sub('s2', D2), sub('s3', D3)],
      [
        vrd('s1', 'pass', 'confirmed'),
        vrd('s2', 'pass', 'confirmed'),
        vrd('s3', 'pass', 'needs_review'),
      ],
    );
    expect(streak).toEqual({ current: 2, longest: 2, lastPassDate: '2026-06-11' });
  });

  it('treats an interior needs_review day as neutral (does not interrupt the run)', () => {
    const streak = computeStreak(
      [sub('s1', D1), sub('s2', D2), sub('s3', D3)],
      [
        vrd('s1', 'pass', 'confirmed'),
        vrd('s2', 'fail', 'needs_review'),
        vrd('s3', 'pass', 'confirmed'),
      ],
    );
    expect(streak).toEqual({ current: 2, longest: 2, lastPassDate: '2026-06-12' });
  });

  it('treats a missing day (a gap) as transparent', () => {
    const streak = computeStreak(
      [sub('s1', D1), sub('s4', D4)],
      [vrd('s1', 'pass', 'confirmed'), vrd('s4', 'pass', 'confirmed')],
    );
    expect(streak).toEqual({ current: 2, longest: 2, lastPassDate: '2026-06-13' });
  });

  it('breaks on a confirmed fail even across a gap', () => {
    const streak = computeStreak(
      [sub('s1', D1), sub('s3', D3), sub('s4', D4)],
      [
        vrd('s1', 'pass', 'confirmed'),
        vrd('s3', 'fail', 'confirmed'),
        vrd('s4', 'pass', 'confirmed'),
      ],
    );
    expect(streak).toEqual({ current: 1, longest: 1, lastPassDate: '2026-06-13' });
  });

  it('ignores a verdict with no matching submission', () => {
    const streak = computeStreak(
      [sub('s1', D1)],
      [vrd('s1', 'pass', 'confirmed'), vrd('ghost', 'fail', 'confirmed')],
    );
    expect(streak).toEqual({ current: 1, longest: 1, lastPassDate: '2026-06-10' });
  });

  it('orders unsorted events chronologically', () => {
    const streak = computeStreak(
      [sub('s3', D3), sub('s1', D1), sub('s2', D2)],
      [
        vrd('s3', 'pass', 'confirmed'),
        vrd('s1', 'pass', 'confirmed'),
        vrd('s2', 'pass', 'confirmed'),
      ],
    );
    expect(streak).toEqual({ current: 3, longest: 3, lastPassDate: '2026-06-12' });
  });

  it('never builds a streak from needs_review alone', () => {
    const streak = computeStreak(
      [sub('s1', D1), sub('s2', D2)],
      [vrd('s1', 'pass', 'needs_review'), vrd('s2', 'pass', 'needs_review')],
    );
    expect(streak).toEqual({ current: 0, longest: 0, lastPassDate: null });
  });

  it('has no streak when every day is a confirmed fail', () => {
    const streak = computeStreak(
      [sub('s1', D1), sub('s2', D2)],
      [vrd('s1', 'fail', 'confirmed'), vrd('s2', 'fail', 'confirmed')],
    );
    expect(streak).toEqual({ current: 0, longest: 0, lastPassDate: null });
  });

  it('buckets timestamps into calendar days using the configured time zone', () => {
    const submissions = [sub('s1', '2026-06-16T01:30:00Z')];
    const verdicts = [vrd('s1', 'pass', 'confirmed')];

    // 01:30 UTC is still 2026-06-15 in Los Angeles (UTC-7 in June).
    expect(
      computeStreak(submissions, verdicts, { timeZone: 'America/Los_Angeles' }),
    ).toEqual({ current: 1, longest: 1, lastPassDate: '2026-06-15' });

    // The same instant is 2026-06-16 under the default UTC bucketing.
    expect(computeStreak(submissions, verdicts)).toEqual({
      current: 1,
      longest: 1,
      lastPassDate: '2026-06-16',
    });
  });
});
