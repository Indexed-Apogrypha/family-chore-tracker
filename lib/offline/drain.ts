import type { DrainResult, QueueStore, SubmitFn } from './types';

/**
 * Drains queued submissions FIFO by delivering each through `submit`.
 *
 * Dequeue-on-confirm: an item is removed only when `submit` RESOLVES (the server
 * processed it, whatever the verdict). If `submit` REJECTS we couldn't reach the
 * server, so we keep the item and STOP — the network is likely down again, and
 * hammering the rest would just pile up failures (they retry on the next `online`
 * event). Pure orchestration over the `QueueStore` port + an injected submitter, so
 * it's unit-tested with the in-memory store and a fake `submit`.
 *
 * Phase 2 will add per-item `status` + retry/backoff here (skip-and-continue past a
 * poisoned item rather than stop), keyed on `clientId` for idempotent retries.
 */
export async function drainQueue(store: QueueStore, submit: SubmitFn): Promise<DrainResult> {
  const items = await store.list();
  let delivered = 0;
  for (const item of items) {
    try {
      await submit(item);
    } catch {
      break; // couldn't reach the server — leave this and the rest for next time
    }
    await store.remove(item.clientId);
    delivered++;
  }
  return { delivered, failed: items.length - delivered, remaining: await store.count() };
}
