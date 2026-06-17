import type { QueueStore, QueuedSubmission } from './types';

/**
 * The fully-working in-memory `QueueStore` fake — the tested path (sibling of the
 * domain `InMemory*Store`s). Insertion-ordered (FIFO), copy-on-read. The real
 * `IndexedDbQueueStore` is the browser edge and stays untested, like `gemini.ts`.
 */
export class InMemoryQueueStore implements QueueStore {
  private items: QueuedSubmission[] = [];

  async add(item: QueuedSubmission): Promise<void> {
    this.items.push({ ...item });
  }

  async list(): Promise<QueuedSubmission[]> {
    return this.items.map((i) => ({ ...i }));
  }

  async remove(clientId: string): Promise<void> {
    this.items = this.items.filter((i) => i.clientId !== clientId);
  }

  async count(): Promise<number> {
    return this.items.length;
  }
}
