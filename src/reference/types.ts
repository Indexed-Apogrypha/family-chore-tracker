import type { ImageInput } from '../judge/types';

/**
 * A stored version of a chore's "clean state" reference photo. Maps onto the
 * `chore_references` table in PRD.md: the `isCurrent` flag marks the one
 * reference the judge compares against, while prior versions are retained
 * (PRD User Story 5 — "update the reference later without losing the old one").
 * `family_id` is denormalized on that table for multi-tenancy but is out of
 * scope for this single-family slice.
 */
export interface ChoreReference {
  id: string;
  choreId: string;
  /**
   * The image bytes, reusing the judge core's `ImageInput` so a reference feeds
   * straight into `JudgeInput.referenceImage` with no translation. This is the
   * in-memory/domain shape; the live Supabase adapter will keep the bytes in
   * Storage and a path on the row, materializing this on read.
   */
  image: ImageInput;
  /** Exactly one reference per chore is current at a time (see ReferenceStore). */
  isCurrent: boolean;
  /** ISO 8601, assigned by the store (a DB default in prod; an injected clock in tests). */
  createdAt: string;
}

/**
 * What `setReference` hands the store to persist. There is deliberately no
 * `isCurrent` here: the store always inserts a new reference as current, so the
 * "exactly one current" invariant cannot be broken through the dumb port — the
 * only way to demote a reference is `setCurrent`.
 */
export interface ReferenceDraft {
  choreId: string;
  image: ImageInput;
}

/**
 * The persistence seam for references — the sibling of the judge core's
 * `JudgeClient` vendor seam, and the boundary the live Supabase adapter sits
 * behind. Deliberately dumb CRUD: the `referenceService` policy owns the
 * `isCurrent` invariant over this port, just as `runJudgment`/`evaluateVerdict`
 * own policy over `JudgeClient`. The system owns the invariant, not the store.
 *
 * Making demote+insert atomic under concurrent callers is an adapter concern
 * (a transaction plus a partial unique index `WHERE is_current`), not this
 * seam's — the in-memory fake is single-threaded within a tick.
 */
export interface ReferenceStore {
  /** All references for a chore, oldest→newest; `[]` if the chore has none. */
  listByChore(choreId: string): Promise<ChoreReference[]>;
  /** Persist a new reference as the current one; the store assigns `id`/`createdAt`. */
  add(draft: ReferenceDraft): Promise<ChoreReference>;
  /** Flip `isCurrent` on an existing reference by id — the only demotion lever. */
  setCurrent(id: string, isCurrent: boolean): Promise<void>;
}
