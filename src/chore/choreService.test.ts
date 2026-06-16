import { describe, it, expect } from 'vitest';
import { InMemoryChoreStore } from './memoryStore';
import { createChore, getChore, listChores } from './choreService';
import { ChoreNotFoundError } from './errors';

/** A fixed clock proves ordering comes from insertion order, not timestamps. */
function freshStore(): InMemoryChoreStore {
  return new InMemoryChoreStore({ clock: () => '2026-06-16T00:00:00.000Z' });
}

describe('createChore', () => {
  it('creates a chore with a generated id, the name, and a timestamp', async () => {
    const store = freshStore();
    const chore = await createChore(store, 'Tidy room');

    expect(chore.id).toBe('chore-1');
    expect(chore.name).toBe('Tidy room');
    expect(chore.createdAt).toBe('2026-06-16T00:00:00.000Z');
  });

  it('trims surrounding whitespace from the name', async () => {
    const store = freshStore();
    const chore = await createChore(store, '  Tidy room  ');
    expect(chore.name).toBe('Tidy room');
  });

  it('rejects an empty name, persisting nothing', async () => {
    const store = freshStore();
    await expect(createChore(store, '')).rejects.toThrow();
    expect(await listChores(store)).toHaveLength(0);
  });

  it('rejects a whitespace-only name, persisting nothing', async () => {
    const store = freshStore();
    await expect(createChore(store, '   ')).rejects.toThrow();
    expect(await listChores(store)).toHaveLength(0);
  });

  it('assigns monotonic ids chore-1, chore-2, …', async () => {
    const store = freshStore();
    const first = await createChore(store, 'Tidy room');
    const second = await createChore(store, 'Make bed');
    expect(first.id).toBe('chore-1');
    expect(second.id).toBe('chore-2');
  });

  it('allows duplicate names as distinct chores (no dedup)', async () => {
    const store = freshStore();
    const a = await createChore(store, 'Tidy room');
    const b = await createChore(store, 'Tidy room');
    expect(a.id).not.toBe(b.id);
    expect(await listChores(store)).toHaveLength(2);
  });
});

describe('getChore', () => {
  it('returns a previously created chore', async () => {
    const store = freshStore();
    const created = await createChore(store, 'Tidy room');
    expect(await getChore(store, created.id)).toEqual(created);
  });

  it('throws ChoreNotFoundError for an unknown id, carrying the id', async () => {
    const store = freshStore();

    let caught: unknown;
    try {
      await getChore(store, 'nope');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ChoreNotFoundError);
    expect((caught as ChoreNotFoundError).choreId).toBe('nope');
  });
});

describe('listChores', () => {
  it('returns an empty array when there are no chores', async () => {
    expect(await listChores(freshStore())).toEqual([]);
  });

  it('returns chores oldest→newest', async () => {
    const store = freshStore();
    await createChore(store, 'a');
    await createChore(store, 'b');
    await createChore(store, 'c');
    expect((await listChores(store)).map((chore) => chore.name)).toEqual(['a', 'b', 'c']);
  });
});

describe('InMemoryChoreStore copy-on-read', () => {
  it('does not let a mutated result change what a later read returns', async () => {
    const store = freshStore();
    const created = await createChore(store, 'Tidy room');

    // Mutate the createChore result, a getChore result, and a listChores result.
    created.name = 'mutated';
    const fetched = await getChore(store, 'chore-1');
    fetched.name = 'mutated too';
    const listed = await listChores(store);
    const firstListed = listed[0];
    if (firstListed) firstListed.name = 'mutated three';

    const afterAll = await getChore(store, 'chore-1');
    expect(afterAll.name).toBe('Tidy room');
  });
});
