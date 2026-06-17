'use client';

import { useState, type FormEvent } from 'react';
import { enqueuePhoto } from '../../lib/offline/client';

/**
 * Lets a child capture a room photo from the cached `/offline` page when the app was
 * cold-opened with no network — the bytes are queued on-device and delivered when the
 * connection returns (the `QueueStatus` driver does the sync). Auth-free and
 * data-light: v1 is single-chore, so the queued item needs no server data; the chore
 * and child are resolved server-side at sync. (In-app capture while connected-then-
 * dropped is handled by `SubmitForm`'s own offline branch.)
 */
export function OfflineCapture() {
  const [savedCount, setSavedCount] = useState(0);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('photo');
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    if (!file) return;
    await enqueuePhoto(file, file.type || 'image/jpeg');
    form.reset();
    setSavedCount((n) => n + 1);
  }

  return (
    <form onSubmit={onSubmit} className="capture-form">
      <label className="capture-label">
        Photo of your room
        <input type="file" name="photo" accept="image/*" capture="environment" required />
      </label>
      <button type="submit">Save for later</button>
      {savedCount > 0 && (
        <p className="ok">
          Saved! We’ll check it when you’re back online{savedCount > 1 ? ` (${savedCount} saved)` : ''}.
        </p>
      )}
    </form>
  );
}
