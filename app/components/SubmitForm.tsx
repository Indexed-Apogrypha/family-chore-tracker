'use client';

import { useActionState, useState, type FormEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { submitChoreAction, type SubmitChoreResult } from '../actions';
import { enqueuePhoto } from '../../lib/offline/client';
import { VerdictCard } from './VerdictCard';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Checking…' : 'Submit photo'}
    </button>
  );
}

export function SubmitForm() {
  const [state, formAction] = useActionState<SubmitChoreResult | null, FormData>(
    submitChoreAction,
    null,
  );
  const [queued, setQueued] = useState(false);

  // Offline: queue the photo on-device instead of calling the action — QueueStatus
  // delivers it when the connection returns. preventDefault cancels the action
  // dispatch; online, we return early and let the Server Action run as usual.
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (typeof navigator !== 'undefined' && navigator.onLine) return;
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('photo');
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    if (!file) return;
    await enqueuePhoto(file, file.type || 'image/jpeg');
    form.reset();
    setQueued(true);
  }

  return (
    <div className="stack">
      <form action={formAction} onSubmit={handleSubmit} className="capture-form">
        <label className="capture-label">
          Photo of your room
          <input type="file" name="photo" accept="image/*" capture="environment" required />
        </label>
        <SubmitButton />
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
