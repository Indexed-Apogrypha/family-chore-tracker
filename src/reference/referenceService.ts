import type { ImageInput } from '../judge/types';
import { getChore, type ChoreStore } from '../chore';
import type { ChoreReference, ReferenceStore } from './types';

/**
 * The two seams `setReference` spans: the `references` store it versions the
 * reference in, and the `chores` store it validates the `choreId` against before
 * writing. Mirrors `submitChore`'s `SubmitChoreDeps` — a deps object once a free
 * function operates over more than one seam.
 */
export interface SetReferenceDeps {
  references: ReferenceStore;
  chores: ChoreStore;
}

/**
 * Sets a new current reference for a chore, versioning rather than replacing.
 * Enforces the `chore_references.isCurrent` invariant (PRD): any existing
 * current reference is demoted — retained, never deleted (User Story 5) — and
 * the new one is inserted as current. The *system* owns this invariant over a
 * dumb `ReferenceStore`, the persistence-side sibling of how `runJudgment` owns
 * policy over `JudgeClient`.
 *
 * The `choreId` is no longer an opaque key: `getChore` validates it exists first,
 * throwing `ChoreNotFoundError` BEFORE any write so a reference can never be
 * versioned under a chore that doesn't exist. Reads (`getCurrentReference`/
 * `listReferences`) stay validation-free — they're harmless and return empty for
 * an unknown chore.
 *
 * Every call creates a new version even when the bytes match a prior one (no
 * dedup): a parent re-uploading is a deliberate, history-worthy act, and
 * collapsing it would lose a timestamped version.
 *
 * The read→demote→insert sequence is the correct serial logic; making it atomic
 * under concurrent callers is a `SupabaseReferenceStore` concern (transaction +
 * partial unique index `WHERE is_current`), out of scope here.
 */
export async function setReference(
  deps: SetReferenceDeps,
  choreId: string,
  image: ImageInput,
): Promise<ChoreReference> {
  await getChore(deps.chores, choreId); // throws ChoreNotFoundError if the chore is unreal
  const existing = await deps.references.listByChore(choreId);
  for (const ref of existing) {
    if (ref.isCurrent) await deps.references.setCurrent(ref.id, false);
  }
  return deps.references.add({ choreId, image });
}

/** The current reference for a chore, or `null` if it has none. */
export async function getCurrentReference(
  store: ReferenceStore,
  choreId: string,
): Promise<ChoreReference | null> {
  const refs = await store.listByChore(choreId);
  return refs.find((ref) => ref.isCurrent) ?? null;
}

/**
 * The full version history for a chore, oldest→newest (store order); `[]` if it
 * has none. Backs the parent's reference history and the retention guarantee.
 */
export async function listReferences(
  store: ReferenceStore,
  choreId: string,
): Promise<ChoreReference[]> {
  return store.listByChore(choreId);
}
