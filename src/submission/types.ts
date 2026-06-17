import type { ImageInput, Verdict } from '../judge';

/**
 * A child's chore submission. Maps onto the `submissions` table in PRD.md
 * (`exif` jsonb; `family_id` denormalized for RLS). `family_id` and child
 * accounts are out of scope for this single-family, accounts-deferred slice.
 * `choreId` existence is now validated by `submitChore` via `getChore` (the chore
 * module) before any write; `childId` stays an opaque key until accounts exist.
 * `{ id, createdAt }` is structurally a `StreakSubmission`, so a record feeds
 * `computeStreak` with no field mapping.
 */
export interface SubmissionRecord {
  id: string;
  choreId: string;
  /** Opaque child key; child accounts are deferred (PRD stories 2/6). */
  childId?: string;
  /**
   * Image bytes, reusing the judge core's `ImageInput` so a submission feeds
   * straight into `JudgeInput.submissionImage` and the parent photo view with
   * no translation. This is the in-memory/domain shape; the live Supabase
   * adapter will keep the bytes in Storage and a path on the row, materializing
   * this on read.
   */
  image: ImageInput;
  /**
   * Opaque submission metadata (EXIF), captured but unused in v1 — kept for
   * future anti-gaming (PRD story 19; CLAUDE.md). Persisted verbatim to a jsonb
   * column; `null` when the caller supplied none. We deliberately don't model
   * its shape yet.
   */
  exif: Record<string, unknown> | null;
  /** ISO 8601, assigned by the store (a DB default in prod; an injected clock in tests). */
  createdAt: string;
}

/**
 * A persisted verdict: the immutable judge `Verdict` (result/status/confidence/
 * deviations/notes/model, plus the raw `judgment` for dispute/audit — PRD story
 * 14) wrapped in a persistence envelope. `id`/`submissionId`/`createdAt` are
 * added by the store and are NOT part of the judge `Verdict`. Maps onto the
 * `verdicts` table. `{ submissionId, result, status }` is structurally a
 * `StreakVerdict`, so it feeds `computeStreak` with no field mapping.
 */
export interface VerdictRecord extends Verdict {
  id: string;
  /** Links to `SubmissionRecord.id`. */
  submissionId: string;
  createdAt: string;
}

/**
 * What `submitChore` hands the store to persist as a submission. The store
 * assigns `id`/`createdAt`. `exif` is fully resolved here (the service defaults
 * a missing EXIF to `null`) so the in-memory and Supabase stores can't diverge
 * on the default.
 */
export interface SubmissionDraft {
  choreId: string;
  childId?: string;
  image: ImageInput;
  exif: Record<string, unknown> | null;
}

/**
 * What `submitChore` hands the store to persist as a verdict: the judge
 * `Verdict` plus the id of the submission it judged. The store assigns
 * `id`/`createdAt`.
 */
export interface VerdictDraft extends Verdict {
  submissionId: string;
}

/**
 * The persistence seam for submissions + verdicts — the sibling of the judge
 * core's `JudgeClient` and the `ReferenceStore`, and the boundary the live
 * Supabase adapter sits behind. Deliberately dumb CRUD over two tables; the
 * `submissionService` owns the orchestration over this port.
 *
 * Two separate writes (not one atomic `record`) so a submission whose judging
 * fails is still persisted and auditable (PRD story 19). Making the pair
 * transactional is a `SupabaseSubmissionStore` concern, like `ReferenceStore`'s
 * atomic demote+insert.
 */
export interface SubmissionStore {
  /** Persist a submission; the store assigns `id`/`createdAt`. */
  addSubmission(draft: SubmissionDraft): Promise<SubmissionRecord>;
  /** Persist a verdict for an already-stored submission; assigns `id`/`createdAt`. */
  addVerdict(draft: VerdictDraft): Promise<VerdictRecord>;
  /** Submissions, oldest→newest; filtered to `choreId` when given, else all. */
  listSubmissions(choreId?: string): Promise<SubmissionRecord[]>;
  /**
   * Verdicts, oldest→newest; filtered to those whose submission matches
   * `choreId` when given (a join through submissions, not a denormalized
   * column), else all.
   */
  listVerdicts(choreId?: string): Promise<VerdictRecord[]>;
}
