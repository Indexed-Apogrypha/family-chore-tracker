'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { submitChoreAction, type SubmitChoreResult } from '../actions';
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

  return (
    <div className="stack">
      <form action={formAction} className="capture-form">
        <label className="capture-label">
          Photo of your room
          <input type="file" name="photo" accept="image/*" capture="environment" required />
        </label>
        <SubmitButton />
      </form>
      {state?.status === 'ok' && <VerdictCard verdict={state.verdict} />}
      {state?.status === 'no_reference' && (
        <p className="notice">Ask a parent to set the reference photo first.</p>
      )}
      {state?.status === 'error' && <p className="err">{state.message}</p>}
    </div>
  );
}
