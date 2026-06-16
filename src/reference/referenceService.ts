import type { ImageInput } from '../judge/types';
import type { ChoreReference, ReferenceStore } from './types';

/**
 * Sets a new current reference for a chore, versioning rather than replacing.
 * Enforces the `chore_references.isCurrent` invariant (PRD): any existing
 * current reference is demoted — retained, never deleted (User Story 5) — and
 * the new one is inserted as current. The *system* owns this invariant over a
 * dumb `ReferenceStore`, the persistence-side sibling of how `runJudgment` owns
 * policy over `JudgeClient`.
 *
 * Every call creates a new version even when the bytes match a prior one (no
 * dedup): a parent re-uploading is a deliberate, history-worthy act, and
 * collapsing it would lose a timestamped version. `choreId` is treated as an
 * opaque key here; `getChore` (the chore module) now provides that existence
 * check, and wiring it into `setReference` is the next integration step.
 *
 * The read→demote→insert sequence is the correct serial logic; making it atomic
 * under concurrent callers is a `SupabaseReferenceStore` concern (transaction +
 * partial unique index `WHERE is_current`), out of scope here.
 */
export async function setReference(
  store: ReferenceStore,
  choreId: string,
  image: ImageInput,
): Promise<ChoreReference> {
  const existing = await store.listByChore(choreId);
  for (const ref of existing) {
    if (ref.isCurrent) await store.setCurrent(ref.id, false);
  }
  return store.add({ choreId, image });
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
