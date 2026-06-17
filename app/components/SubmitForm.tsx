'use client';

import { useActionState, useState, startTransition, type FormEvent } from 'react';
import { submitChoreAction, type SubmitChoreResult } from '../actions';
import { enqueuePhoto } from '../../lib/offline/client';
import { downscaleImage } from '../../lib/client/downscaleImage';
import { VerdictCard } from './VerdictCard';

export function SubmitForm() {
  const [state, formAction, isPending] = useActionState<SubmitChoreResult | null, FormData>(
    submitChoreAction,
    null,
  );
  const [queued, setQueued] = useState(false);
  const [preparing, setPreparing] = useState(false);

  // Always intercept: downscale the captured photo in-browser first. Offline, the
  // (smaller) photo is queued on-device and QueueStatus delivers it when the
  // connection returns; online, we dispatch the Server Action manually (wrapped in
  // startTransition so `isPending` tracks it).
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('photo');
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    if (!file) return;

    setPreparing(true);
    const prepared = await downscaleImage(file);
    setPreparing(false);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await enqueuePhoto(prepared, prepared.type || 'image/jpeg');
      form.reset();
      setQueued(true);
      return;
    }

    const fd = new FormData();
    fd.set('photo', prepared);
    startTransition(() => formAction(fd));
  }

  const busy = preparing || isPending;

  return (
    <div className="stack">
      <form onSubmit={handleSubmit} className="capture-form">
        <label className="capture-label">
          Photo of your room
          <input type="file" name="photo" accept="image/*" capture="environment" required />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Submit photo'}
        </button>
      </form>
      {queued && (
        <p className="ok">Saved! We’ll check it automatically when you’re back online.</p>
      )}
      {state?.status === 'ok' && <VerdictCard verdict={state.verdict} />}
      {state?.status === 'no_reference' && (
        <p className="notice">Ask a parent to set the reference photo first.</p>
      )}
      {state?.status === 'error' && <p className="err">{state.message}</p>}
    </div>
  );
}
