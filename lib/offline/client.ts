import { IndexedDbQueueStore } from './indexedDbQueueStore';
import { drainQueue } from './drain';
import type { DrainResult, SubmitFn } from './types';

/**
 * The browser-side facade over the offline queue — the single import point for the
 * client components (`SubmitForm`, `OfflineCapture`, `QueueStatus`). Binds the
 * IndexedDB adapter and emits a window event when the queue changes so the pending
 * indicator can refresh without polling. Client-only (touches IndexedDB + window).
 */
const store = new IndexedDbQueueStore();
const CHANGED = 'offline-queue-changed';

function notifyChanged(): void {
  window.dispatchEvent(new Event(CHANGED));
}

/** Queue a captured photo for later delivery. */
export async function enqueuePhoto(blob: Blob, mimeType: string): Promise<void> {
  await store.add({
    clientId: crypto.randomUUID(),
    blob,
    mimeType,
    capturedAt: new Date().toISOString(),
    status: 'pending',
  });
  notifyChanged();
}

/** How many photos are waiting to sync. */
export function getQueueCount(): Promise<number> {
  return store.count();
}

/** Deliver everything queued (FIFO, dequeue-on-confirm). */
export async function drainQueueClient(submit: SubmitFn): Promise<DrainResult> {
  const result = await drainQueue(store, submit);
  if (result.delivered > 0) notifyChanged();
  return result;
}

/** Subscribe to queue changes (enqueue / drain); returns an unsubscribe. */
export function onQueueChanged(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}
