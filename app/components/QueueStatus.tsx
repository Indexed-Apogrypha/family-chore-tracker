'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitChoreAction } from '../actions';
import { drainQueueClient, getQueueCount, onQueueChanged } from '../../lib/offline/client';
import type { QueuedSubmission } from '../../lib/offline/types';

/**
 * Delivers one queued photo through the SAME Server Action the online path uses —
 * which resolves the chore + child server-side, so the queued item carries neither.
 * Resolving = delivered (any verdict); a throw = couldn't reach the server.
 */
async function deliver(item: QueuedSubmission): Promise<unknown> {
  const formData = new FormData();
  formData.set('photo', new File([item.blob], 'offline-photo', { type: item.mimeType }));
  return submitChoreAction(null, formData);
}

/**
 * The pending-sync indicator + the foreground drain driver. Mounted on the child
 * surfaces (`/child`, `/offline`). On load and on every `online` event it drains the
 * queue (FIFO, dequeue-on-confirm) and, once anything lands, `router.refresh()`es so
 * the freshly-synced verdict + streak show. Renders nothing when the queue is empty.
 */
export function QueueStatus() {
  const [count, setCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const c = await getQueueCount();
      if (active) setCount(c);
    };
    const flush = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await refresh();
        return;
      }
      const result = await drainQueueClient(deliver);
      await refresh();
      if (result.delivered > 0) router.refresh();
    };

    void flush();
    const offChange = onQueueChanged(refresh);
    window.addEventListener('online', flush);
    return () => {
      active = false;
      offChange();
      window.removeEventListener('online', flush);
    };
  }, [router]);

  if (count === 0) return null;
  return (
    <p className="notice">
      📷 {count} photo{count === 1 ? '' : 's'} waiting to sync — we’ll check{' '}
      {count === 1 ? 'it' : 'them'} automatically when you’re back online.
    </p>
  );
}
