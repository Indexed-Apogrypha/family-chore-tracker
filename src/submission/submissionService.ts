import { runJudgment, type ImageInput, type JudgeClient } from '../judge';
import { getCurrentReference, type ReferenceStore } from '../reference';
import { NoCurrentReferenceError } from './errors';
import type { SubmissionRecord, SubmissionStore, VerdictRecord } from './types';

/** The three seams `submitChore` composes — wired once at the composition root. */
export interface SubmitChoreDeps {
  judge: JudgeClient;
  references: ReferenceStore;
  submissions: SubmissionStore;
}

/** What a child submits. `exif` is optional; absent EXIF is recorded as `null`. */
export interface SubmitChoreInput {
  choreId: string;
  choreName: string;
  childId?: string;
  image: ImageInput;
  exif?: Record<string, unknown> | null;
}

/**
 * Orchestrates a child's chore submission (PRD `submissionService`; stories
 * 7–9, 15, 19): fetch the chore's current reference, judge the submission
 * against it (the vendor seam), and persist both the submission and its verdict.
 *
 * Composition only — it reuses `getCurrentReference` and `runJudgment`, and does
 * NOT re-implement the reference invariant or the verdict policy.
 *
 * Sequence & failure semantics (NOT transactional in this slice, by design):
 *  1. `getCurrentReference`; if none → throw `NoCurrentReferenceError` BEFORE any
 *     write (the chore isn't set up — not the child's attempt to record).
 *  2. Persist the submission (image + EXIF) FIRST, so the attempt is durable and
 *     auditable for future anti-gaming even if step 3 fails (story 19).
 *  3. `runJudgment` against the current reference. If it throws (e.g. a live
 *     adapter's `JudgmentParseError` or a network error), the submission stays
 *     stored with NO verdict — a state `computeStreak` already treats as a
 *     transparent non-event — and the error propagates. Making the two writes
 *     atomic is a `SupabaseSubmissionStore` concern, like `ReferenceStore`'s
 *     atomic demote+insert.
 *  4. Persist the verdict, linked to the submission by id.
 */
export async function submitChore(
  deps: SubmitChoreDeps,
  input: SubmitChoreInput,
): Promise<{ submission: SubmissionRecord; verdict: VerdictRecord }> {
  const reference = await getCurrentReference(deps.references, input.choreId);
  if (reference === null) throw new NoCurrentReferenceError(input.choreId);

  const submission = await deps.submissions.addSubmission({
    choreId: input.choreId,
    childId: input.childId,
    image: input.image,
    exif: input.exif ?? null,
  });

  const verdict = await runJudgment(deps.judge, {
    referenceImage: reference.image,
    submissionImage: input.image,
    choreName: input.choreName,
  });

  const verdictRecord = await deps.submissions.addVerdict({
    ...verdict,
    submissionId: submission.id,
  });

  return { submission, verdict: verdictRecord };
}

/** One submission joined to its verdict (`null` until judged), for the history view. */
export interface SubmissionHistoryEntry {
  submission: SubmissionRecord;
  verdict: VerdictRecord | null;
}

/**
 * The parent's submission history (PRD story 13), oldest→newest, each submission
 * joined to its verdict (`null` when judging hasn't produced one — e.g. a failed
 * judge left an auditable submission, per `submitChore`). A read-side join over
 * the dumb port so call sites don't re-implement it; the raw event streams stay
 * available via `store.listSubmissions`/`listVerdicts` for `computeStreak`.
 *
 * If more than one verdict ever exists per submission (a future dispute), the
 * latest in insertion order wins — the right default for a "current state" view.
 */
export async function getHistory(
  submissions: SubmissionStore,
  choreId?: string,
): Promise<SubmissionHistoryEntry[]> {
  const [subs, verdicts] = await Promise.all([
    submissions.listSubmissions(choreId),
    submissions.listVerdicts(choreId),
  ]);
  const verdictBySubmission = new Map<string, VerdictRecord>();
  for (const verdict of verdicts) verdictBySubmission.set(verdict.submissionId, verdict);
  return subs.map((submission) => ({
    submission,
    verdict: verdictBySubmission.get(submission.id) ?? null,
  }));
}
