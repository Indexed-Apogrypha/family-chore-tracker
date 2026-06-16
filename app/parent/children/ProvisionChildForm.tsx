'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { provisionChildAction, type AuthResult } from '../../auth/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Adding…' : 'Add child'}
    </button>
  );
}

export function ProvisionChildForm() {
  const [state, action] = useActionState<AuthResult | null, FormData>(provisionChildAction, null);
  return (
    <form action={action} className="capture-form">
      <label className="capture-label">
        Username (their login handle)
        <input type="text" name="username" autoComplete="off" required />
      </label>
      <label className="capture-label">
        Password (min 6 characters)
        <input type="password" name="password" autoComplete="new-password" required minLength={6} />
      </label>
      <SubmitButton />
      {state?.status === 'ok' && (
        <p className="ok">Child added. Share their username and password with them.</p>
      )}
      {state?.status === 'error' && <p className="err">{state.message}</p>}
    </form>
  );
}
