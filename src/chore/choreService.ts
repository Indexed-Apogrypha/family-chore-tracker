import { ChoreNotFoundError } from './errors';
import type { Chore, ChoreStore } from './types';

/**
 * Creates a chore (PRD User Story 3). The thin v1 policy lives here, not in the
 * store: trim the name and reject an empty/whitespace-only one. Deliberately NO
 * uniqueness/dedup (mirroring `referenceService`'s "a re-upload is a deliberate
 * act, no dedup") — two chores may share a name; the `id` distinguishes them,
 * and v1 has a single chore anyway.
 *
 * `name` is the source of the `choreName` that `submitChore` later threads into
 * the judge prompt, so it is normalized once here at the write boundary.
 */
export async function createChore(store: ChoreStore, name: string): Promise<Chore> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Chore name must not be empty.');
  }
  return store.add({ name: trimmed });
}

/**
 * Asserts a chore exists and returns it, throwing `ChoreNotFoundError` when it
 * does not — the public "validate this choreId" API and the sibling of
 * submission's throwing precondition. This is the hook reference/submission will
 * wire in to stop treating `choreId` as an opaque key.
 */
export async function getChore(store: ChoreStore, choreId: string): Promise<Chore> {
  const chore = await store.getById(choreId);
  if (chore === null) throw new ChoreNotFoundError(choreId);
  return chore;
}

/** All chores, oldest→newest (store order); `[]` when none. Backs parent chore management. */
export async function listChores(store: ChoreStore): Promise<Chore[]> {
  return store.list();
}
