import type {
  StreakOptions,
  StreakState,
  StreakSubmission,
  StreakVerdict,
} from './types';

/**
 * Default IANA time zone for bucketing submission timestamps into calendar days
 * when `StreakOptions.timeZone` is omitted. Policy knob, kept next to the rule
 * it governs (mirrors `CONFIDENCE_THRESHOLD` in the judge core).
 */
export const DEFAULT_TIME_ZONE = 'UTC';

/** A calendar day's decisive status after best-of-day aggregation. */
type DayStatus = 'passed' | 'failed' | 'pending';

/** Precedence for folding a day's verdicts: passed beats failed beats pending. */
const RANK: Record<DayStatus, number> = { pending: 0, failed: 1, passed: 2 };

const MS_PER_DAY = 86_400_000;

/**
 * Computes a child's tidy-room streak purely from the submission/verdict event
 * stream — the gamification seam (docs/PRD.md). As with `evaluateVerdict` in the
 * judge core, the *system* owns this definition, not the model: identical
 * inputs always yield an identical `StreakState`, and streaks are computed,
 * never stored.
 *
 * **Joining & day bucketing.** Each verdict is joined to its submission by
 * `submissionId`. Verdicts with no matching submission, and submissions whose
 * timestamp is unparseable, are ignored — they cannot be dated. Every dated
 * verdict is bucketed into a calendar day ('YYYY-MM-DD') in the configured IANA
 * `timeZone` (default 'UTC').
 *
 * **Per-day status (best-of-day),** so a fail-then-fix on the same day doesn't
 * punish:
 *  - `passed`  — the day has ≥1 verdict with result 'pass' and status 'confirmed';
 *  - `failed`  — else ≥1 verdict with result 'fail' and status 'confirmed';
 *  - `pending` — else the day has only `needs_review` verdicts.
 * A day with no submission at all is simply absent ("missing").
 *
 * **Streak rule — `passed` extends, a confirmed `failed` breaks, and everything
 * else (`pending`, missing) is transparent,** wherever it occurs. This is the
 * streak-domain form of the judging philosophy: an uncertain machine call must
 * not unfairly pass *or* fail the child, and "hasn't tidied yet today" is not a
 * failure.
 *  - `current`: passed days since the most recent confirmed fail. It is 0 when
 *    the most recent decisive day is a fail (or nothing has passed).
 *  - `longest`: the most passed days within any fail-free stretch of history.
 *  - `lastPassDate`: the latest passed day, or null.
 *
 * Anchored to the latest day *in the data* (never `Date.now()`), so it stays
 * pure and fully unit-testable.
 *
 * Future knob (not v1): a `gapBreaks`/`asOf` mode would let a *missed* calendar
 * day break `current`, for a stricter "don't break the chain" streak. Forgiving
 * gaps is the deliberate v1 choice.
 */
export function computeStreak(
  submissions: StreakSubmission[],
  verdicts: StreakVerdict[],
  options: StreakOptions = {},
): StreakState {
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;

  // Index submissions by id → a valid Date, dropping unparseable timestamps.
  const dateById = new Map<string, Date>();
  for (const s of submissions) {
    const d = typeof s.createdAt === 'string' ? new Date(s.createdAt) : s.createdAt;
    if (!Number.isNaN(d.getTime())) dateById.set(s.id, d);
  }

  // One formatter reused for every verdict. 'en-CA' with explicit numeric parts
  // renders an ISO-ish 'YYYY-MM-DD'; reading only the date part makes DST moot.
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dayKey = (d: Date): string => {
    const parts = dtf.formatToParts(d);
    const part = (type: string): string =>
      parts.find((p) => p.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };

  // Fold verdicts into one decisive status per day (best-of-day via RANK).
  const statusByDay = new Map<string, DayStatus>();
  for (const v of verdicts) {
    const date = dateById.get(v.submissionId);
    if (date === undefined) continue; // orphan verdict — cannot be dated

    let incoming: DayStatus;
    if (v.status === 'confirmed' && v.result === 'pass') incoming = 'passed';
    else if (v.status === 'confirmed' && v.result === 'fail') incoming = 'failed';
    else incoming = 'pending';

    const key = dayKey(date);
    const existing = statusByDay.get(key);
    if (existing === undefined || RANK[incoming] > RANK[existing]) {
      statusByDay.set(key, incoming);
    }
  }

  // Order days chronologically by integer day-ordinal — DST-immune, and never
  // does wall-clock arithmetic on Dates.
  const days = [...statusByDay.entries()]
    .map(([key, status]) => {
      const [y, m, d] = key.split('-').map(Number) as [number, number, number];
      return { key, status, ord: Date.UTC(y, m - 1, d) / MS_PER_DAY };
    })
    .sort((a, b) => a.ord - b.ord);

  // Single forward pass. `run` = passed days since the last confirmed fail;
  // because a fail resets it to 0 and pending/missing days never touch it, after
  // the loop `run` already equals `current` (it is 0 exactly when the latest
  // decisive day was a fail).
  let longest = 0;
  let run = 0;
  let lastPassDate: string | null = null;
  for (const day of days) {
    if (day.status === 'passed') {
      run += 1;
      lastPassDate = day.key;
      if (run > longest) longest = run;
    } else if (day.status === 'failed') {
      run = 0;
    }
    // 'pending': transparent — neither extends nor breaks.
  }

  return { current: run, longest, lastPassDate };
}
