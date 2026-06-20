import type { QueueStore, QueuedSubmission } from './types';

/**
 * The live `QueueStore` adapter — IndexedDB, so multi-MB photo Blobs persist across
 * reloads/relaunches (localStorage can't hold Blobs and is too small). The browser
 * edge: not unit-tested (no DOM/IndexedDB in vitest), exercised on a device — the
 * same scaffold-&-defer posture as `gemini.ts` / the Supabase adapters. Only ever
 * imported by client code.
 */
const DB_NAME = 'chore-tracker-offline';
const STORE = 'queued';
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = op(tx.objectStore(STORE));
        tx.oncomplete = () => {
          resolve(request.result);
          db.close();
        };
        tx.onerror = () => {
          reject(tx.error);
          db.close();
        };
      }),
  );
}

export class IndexedDbQueueStore implements QueueStore {
  async add(item: QueuedSubmission): Promise<void> {
    await run('readwrite', (s) => s.add(item));
  }

  async list(): Promise<QueuedSubmission[]> {
    const all = await run<QueuedSubmission[]>('readonly', (s) => s.getAll());
    // getAll() returns key order (clientId, a UUID), so sort to FIFO by capture time.
    return all.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  }

  async remove(clientId: string): Promise<void> {
    await run('readwrite', (s) => s.delete(clientId));
  }

  async count(): Promise<number> {
    return run<number>('readonly', (s) => s.count());
  }
}
