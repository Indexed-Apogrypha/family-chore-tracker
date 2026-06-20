'use client';

import { useActionState, useState, startTransition, type FormEvent } from 'react';
import { setReferenceAction, type SetReferenceResult } from '../actions';
import { downscaleImage } from '../../lib/client/downscaleImage';

export function ReferenceForm() {
  const [state, formAction, isPending] = useActionState<SetReferenceResult | null, FormData>(
    setReferenceAction,
    null,
  );
  const [preparing, setPreparing] = useState(false);

  // Downscale the captured photo in-browser before it hits the Server Action, then
  // dispatch the action manually. The manual dispatch is wrapped in startTransition
  // so `isPending` tracks it (React requirement for non-form-driven dispatch).
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('photo');
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    if (!file) return;

    setPreparing(true);
    const prepared = await downscaleImage(file);
    setPreparing(false);

    const fd = new FormData();
    fd.set('photo', prepared);
    startTransition(() => formAction(fd));
  }

  const busy = preparing || isPending;

  return (
    <form onSubmit={handleSubmit} className="capture-form">
      <label className="capture-label">
        Reference photo (the tidy “done” state)
        <input type="file" name="photo" accept="image/*" capture="environment" required />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Uploading…' : 'Save reference'}
      </button>
      {state?.status === 'ok' && <p className="ok">Reference saved.</p>}
      {state?.status === 'error' && <p className="err">{state.message}</p>}
    </form>
  );
}
