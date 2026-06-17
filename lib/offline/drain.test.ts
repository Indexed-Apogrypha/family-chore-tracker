import { describe, it, expect } from 'vitest';
import { InMemoryQueueStore } from './memoryQueueStore';
import { drainQueue } from './drain';
import type { QueuedSubmission, SubmitFn } from './types';

/** A queued item with a sortable capturedAt so FIFO order is observable. */
function item(tag: string, seq: number): QueuedSubmission {
  return {
    clientId: tag,
    blob: new Blob([tag]),
    mimeType: 'image/jpeg',
    capturedAt: `2026-06-17T00:00:0${seq}.000Z`,
    status: 'pending',
  };
}

async function seed(...tags: string[]): Promise<InMemoryQueueStore> {
  const store = new InMemoryQueueStore();
  let seq = 0;
  for (const t of tags) await store.add(item(t, seq++));
  return store;
}

describe('drainQueue', () => {
  it('delivers every item and empties the queue when submit resolves', async () => {
    const store = await seed('a', 'b', 'c');
    const sent: string[] = [];
    const submit: SubmitFn = async (i) => void sent.push(i.clientId);

    const result = await drainQueue(store, submit);

    expect(sent).toEqual(['a', 'b', 'c']); // FIFO
    expect(result).toEqual({ delivered: 3, failed: 0, remaining: 0 });
    expect(await store.count()).toBe(0);
  });

  it('is a no-op on an empty queue', async () => {
    const store = new InMemoryQueueStore();
    const result = await drainQueue(store, async () => {
      throw new Error('should not be called');
    });
    expect(result).toEqual({ delivered: 0, failed: 0, remaining: 0 });
  });

  it('stops at the first network failure, retaining that item and the rest', async () => {
    const store = await seed('a', 'b', 'c');
    const sent: string[] = [];
    // 'a' delivers, 'b' fails (offline again) → 'b' and 'c' must remain.
    const submit: SubmitFn = async (i) => {
      if (i.clientId === 'b') throw new Error('network');
      sent.push(i.clientId);
    };

    const result = await drainQueue(store, submit);

    expect(sent).toEqual(['a']);
    expect(result).toEqual({ delivered: 1, failed: 2, remaining: 2 });
    const left = (await store.list()).map((i) => i.clientId);
    expect(left).toEqual(['b', 'c']); // 'a' removed, FIFO preserved
  });

  it('removes an item even when the server returns an error verdict (delivered = resolved)', async () => {
    const store = await seed('a');
    // A returned value of any shape counts as delivered — the server processed it.
    const submit: SubmitFn = async () => ({ status: 'no_reference' });

    const result = await drainQueue(store, submit);

    expect(result.delivered).toBe(1);
    expect(await store.count()).toBe(0);
  });
});
