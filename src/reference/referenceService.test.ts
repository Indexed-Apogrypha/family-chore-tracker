import { describe, it, expect } from 'vitest';
import { InMemoryReferenceStore } from './memoryStore';
import {
  getCurrentReference,
  listReferences,
  setReference,
} from './referenceService';
import type { ImageInput } from '../judge/types';

/** A tiny labelled image so "the bytes are intact" assertions read clearly. */
function img(tag: string): ImageInput {
  return { data: tag, mimeType: 'image/jpeg' };
}

/** A fixed clock proves ordering comes from insertion order, not timestamps. */
function freshStore(): InMemoryReferenceStore {
  return new InMemoryReferenceStore({ clock: () => '2026-06-16T00:00:00.000Z' });
}

describe('referenceService', () => {
  it('returns null for the current reference of an unknown chore', async () => {
    const store = freshStore();
    expect(await getCurrentReference(store, 'chore-1')).toBeNull();
  });

  it('returns an empty history for an unknown chore', async () => {
    const store = freshStore();
    expect(await listReferences(store, 'chore-1')).toEqual([]);
  });

  it('makes the first reference current', async () => {
    const store = freshStore();
    const ref = await setReference(store, 'c1', img('a'));

    expect(ref.choreId).toBe('c1');
    expect(ref.image).toEqual(img('a'));
    expect(ref.isCurrent).toBe(true);
    expect((await getCurrentReference(store, 'c1'))?.id).toBe(ref.id);
  });

  it('demotes the prior reference so exactly one stays current', async () => {
    const store = freshStore();
    await setReference(store, 'c1', img('a'));
    const second = await setReference(store, 'c1', img('b'));

    const current = await getCurrentReference(store, 'c1');
    expect(current?.id).toBe(second.id);
    expect(current?.image).toEqual(img('b'));

    const history = await listReferences(store, 'c1');
    expect(history.filter((ref) => ref.isCurrent)).toHaveLength(1);
  });

  it('retains the demoted reference with its original image intact', async () => {
    const store = freshStore();
    const first = await setReference(store, 'c1', img('a'));
    await setReference(store, 'c1', img('b'));

    const history = await listReferences(store, 'c1');
    expect(history).toHaveLength(2);

    const prior = history.find((ref) => ref.id === first.id);
    expect(prior?.isCurrent).toBe(false);
    expect(prior?.image).toEqual(img('a'));
  });

  it('keeps exactly one current across three versions, retaining all', async () => {
    const store = freshStore();
    await setReference(store, 'c1', img('a'));
    await setReference(store, 'c1', img('b'));
    const third = await setReference(store, 'c1', img('c'));

    const history = await listReferences(store, 'c1');
    expect(history).toHaveLength(3);

    const current = history.filter((ref) => ref.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0]?.id).toBe(third.id);
  });

  it('isolates references across chores', async () => {
    const store = freshStore();
    await setReference(store, 'c1', img('a'));
    await setReference(store, 'c2', img('x'));

    // A new version on c1 must not disturb c2's current.
    await setReference(store, 'c1', img('a2'));

    expect((await getCurrentReference(store, 'c1'))?.image).toEqual(img('a2'));
    expect((await getCurrentReference(store, 'c2'))?.image).toEqual(img('x'));
    expect(await listReferences(store, 'c2')).toHaveLength(1);
  });

  it('lists references oldest to newest', async () => {
    const store = freshStore();
    await setReference(store, 'c1', img('a'));
    await setReference(store, 'c1', img('b'));
    await setReference(store, 'c1', img('c'));

    const order = (await listReferences(store, 'c1')).map((ref) => ref.image.data);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('creates a new retained version when the same image is re-set (no dedup)', async () => {
    const store = freshStore();
    const first = await setReference(store, 'c1', img('same'));
    const second = await setReference(store, 'c1', img('same'));

    const history = await listReferences(store, 'c1');
    expect(history).toHaveLength(2);
    expect(history.filter((ref) => ref.isCurrent)).toHaveLength(1);
    expect(first.id).not.toBe(second.id);
  });

  it('returns the newly created current reference from setReference', async () => {
    const store = freshStore();
    await setReference(store, 'c1', img('a'));
    const latest = await setReference(store, 'c1', img('b'));

    expect(latest.isCurrent).toBe(true);
    expect((await getCurrentReference(store, 'c1'))?.id).toBe(latest.id);
    expect((await listReferences(store, 'c1')).at(-1)?.id).toBe(latest.id);
  });
});
