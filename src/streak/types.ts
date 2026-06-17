import type { VerdictResult, VerdictStatus } from '../judge/types';

/**
 * The submission/verdict event stream that feeds a streak. These are the
 * minimal shapes the streak needs — they map onto the `submissions` and
 * `verdicts` tables in PRD.md, but the photo bytes, EXIF, family_id, etc. are
 * irrelevant here. Streaks are *computed* from this stream, never stored.
 */

/** A child's submission event. Only its identity and timestamp matter to streaks. */
export interface StreakSubmission {
  id: string;
  /** When the child submitted. A `Date`, or an ISO 8601 string. */
  createdAt: Date | string;
}

/**
 * A verdict event, joined to its submission by id. Reuses the judge core's
 * canonical result/status unions so there is a single source of truth that
 * matches the future `verdicts` table columns.
 */
export interface StreakVerdict {
  /** Links to `StreakSubmission.id`. */
  submissionId: string;
  result: VerdictResult; // 'pass' | 'fail'
  status: VerdictStatus; // 'confirmed' | 'needs_review'
}

/** Knobs for the streak computation. */
export interface StreakOptions {
  /**
   * IANA time zone used to bucket timestamps into calendar days, e.g.
   * "America/Los_Angeles". Defaults to `DEFAULT_TIME_ZONE` ('UTC').
   */
  timeZone?: string;
}

/** The computed streak a child sees. */
export interface StreakState {
  /** Passed days since the most recent confirmed fail; 0 if the latest decisive day is a fail or nothing has passed. */
  current: number;
  /** Longest run of passed days within any fail-free stretch of history. */
  longest: number;
  /** 'YYYY-MM-DD' (in the chosen time zone) of the latest passed day, else null. */
  lastPassDate: string | null;
}
