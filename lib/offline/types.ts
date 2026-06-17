/**
 * The offline submission queue lives entirely at the PWA edge — see
 * docs/offline-queue.md. These types are the seam: a dumb `QueueStore` port (the
 * in-memory fake is the tested path; the IndexedDB adapter is the browser edge,
 * like the Supabase adapters) and the data a queued photo carries.
 */

/**
 * One photo a child captured while offline, awaiting delivery. Chore- and
 * child-agnostic on purpose: `submitChoreAction` resolves both server-side at
 * sync, so the offline surface needs no authenticated server data.
 */
export interface QueuedSubmission {
  /** Stable client id — the idempotency seam (Phase 2 sends it to the server for dedup). */
  clientId: string;
  /** The photo bytes (stored directly in IndexedDB; no base64). */
  blob: Blob;
  mimeType: string;
  /** ISO capture time — orders the queue, and is the Phase 2 seam for fair streak bucketing. */
  capturedAt: string;
  /** Phase 2 seam: widens to `'syncing' | 'failed'` for retry/backoff. */
  status: 'pending';
}

/**
 * The persistence seam for the queue — sibling of the domain `*Store` ports.
 * Deliberately dumb CRUD; `drainQueue` owns the orchestration over it.
 */
export interface QueueStore {
  /** Persist a queued submission. */
  add(item: QueuedSubmission): Promise<void>;
  /** All queued submissions, oldest→newest (FIFO). */
  list(): Promise<QueuedSubmission[]>;
  /** Remove a delivered submission by its client id. */
  remove(clientId: string): Promise<void>;
  /** How many are still queued. */
  count(): Promise<number>;
}

/**
 * Delivers one queued item. Resolving means the server PROCESSED it (any verdict —
 * even `no_reference`/`error` — counts as delivered); rejecting means we couldn't
 * reach the server. The value is ignored by the drain. The real impl builds a
 * `FormData{photo}` and calls `submitChoreAction`.
 */
export type SubmitFn = (item: QueuedSubmission) => Promise<unknown>;

export interface DrainResult {
  /** Items confirmed delivered (and removed). */
  delivered: number;
  /** Items left unsent (a network failure stopped the drain). */
  failed: number;
  /** Items still queued after this pass. */
  remaining: number;
}
