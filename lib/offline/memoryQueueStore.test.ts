import { describe, it, expect } from 'vitest';
import { InMemoryQueueStore } from './memoryQueueStore';
import type { QueuedSubmission } from './types';

function item(clientId: string): QueuedSubmission {
  return {
    clientId,
    blob: new Blob([clientId]),
    mimeType: 'image/jpeg',
    capturedAt: '2026-06-17T00:00:00.000Z',
    status: 'pending',
  };
}

describe('InMemoryQueueStore', () => {
  it('lists items oldest→newest and counts them', async () => {
    const store = new InMemoryQueueStore();
    await store.add(item('a'));
    await store.add(item('b'));

    expect((await store.list()).map((i) => i.clientId)).toEqual(['a', 'b']);
    expect(await store.count()).toBe(2);
  });

  it('removes by clientId', async () => {
    const store = new InMemoryQueueStore();
    await store.add(item('a'));
    await store.add(item('b'));

    await store.remove('a');

    expect((await store.list()).map((i) => i.clientId)).toEqual(['b']);
    expect(await store.count()).toBe(1);
  });

  it('copies on read so a mutated result cannot corrupt the store', async () => {
    const store = new InMemoryQueueStore();
    await store.add(item('a'));

    const first = await store.list();
    first[0]!.clientId = 'mutated';

    expect((await store.list())[0]!.clientId).toBe('a');
  });
});
