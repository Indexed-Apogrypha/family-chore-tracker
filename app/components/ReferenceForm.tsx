'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { setReferenceAction, type SetReferenceResult } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Uploading…' : 'Save reference'}
    </button>
  );
}

export function ReferenceForm() {
  const [state, formAction] = useActionState<SetReferenceResult | null, FormData>(
    setReferenceAction,
    null,
  );

  return (
    <form action={formAction} className="capture-form">
      <label className="capture-label">
        Reference photo (the tidy “done” state)
        <input type="file" name="photo" accept="image/*" capture="environment" required />
      </label>
      <SubmitButton />
      {state?.status === 'ok' && <p className="ok">Reference saved.</p>}
      {state?.status === 'error' && <p className="err">{state.message}</p>}
    </form>
  );
}
