/**
 * A chore a parent has defined (PRD User Story 3; the `chores` table). v1 has a
 * single chore ("Tidy room"); `choreService` is deliberately thin but is the
 * entry point for the multi-chore future (PRD lines 45–46).
 *
 * The PRD's `chores` table also carries `type` and `criteria` (a future
 * rubric-judgment mode — judging without a reference) and a denormalized
 * `family_id` for multi-tenancy/RLS. All three are deferred schema SEAMS: like
 * `referenceService`/`submissionService`, which model no `family_id` in their
 * in-memory records, we model only what v1 reads. `name` is the source of the
 * `choreName` string that `submitChore` threads into `runJudgment`'s prompt.
 */
export interface Chore {
  id: string;
  /** Human-readable label, e.g. "Tidy room" — the source of `SubmitChoreInput.choreName`. */
  name: string;
  /** ISO 8601, assigned by the store (a DB default in prod; an injected clock in tests). */
  createdAt: string;
}

/**
 * What `createChore` hands the store to persist. Excludes the store-assigned
 * `id`/`createdAt` (sibling of `ReferenceDraft`/`SubmissionDraft`). The service
 * normalizes `name` (trims it) before constructing this, so the in-memory and
 * Supabase stores can't diverge on normalization.
 */
export interface ChoreDraft {
  name: string;
}

/**
 * The persistence seam for chores — the sibling of `ReferenceStore`/
 * `SubmissionStore` and the boundary the live Supabase adapter sits behind.
 * Deliberately dumb CRUD: `choreService` owns all policy (name normalization)
 * over this port, just as `referenceService` owns the `isCurrent` invariant. The
 * store assigns `id`/`createdAt` and performs no validation.
 */
export interface ChoreStore {
  /** Persist a new chore; the store assigns `id`/`createdAt`. */
  add(draft: ChoreDraft): Promise<Chore>;
  /** A chore by id, or `null` when none exists. */
  getById(id: string): Promise<Chore | null>;
  /** All chores, oldest→newest (insertion order); `[]` when none. */
  list(): Promise<Chore[]>;
}
