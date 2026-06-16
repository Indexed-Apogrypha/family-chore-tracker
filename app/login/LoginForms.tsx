'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  signInParentAction,
  signUpParentAction,
  signInChildAction,
  type AuthResult,
} from '../auth/actions';

type Tab = 'parent-signin' | 'parent-signup' | 'child-signin';

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function ErrorLine({ state }: { state: AuthResult | null }) {
  if (state?.status === 'error') return <p className="err">{state.message}</p>;
  return null;
}

function ParentSignIn() {
  const [state, action] = useActionState<AuthResult | null, FormData>(signInParentAction, null);
  return (
    <form action={action} className="capture-form">
      <label className="capture-label">
        Email
        <input type="email" name="email" autoComplete="email" required />
      </label>
      <label className="capture-label">
        Password
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      <Submit label="Sign in" pendingLabel="Signing in…" />
      <ErrorLine state={state} />
    </form>
  );
}

function ParentSignUp() {
  const [state, action] = useActionState<AuthResult | null, FormData>(signUpParentAction, null);
  return (
    <form action={action} className="capture-form">
      <label className="capture-label">
        Family name
        <input type="text" name="familyName" placeholder="My Family" />
      </label>
      <label className="capture-label">
        Email
        <input type="email" name="email" autoComplete="email" required />
      </label>
      <label className="capture-label">
        Password (min 6 characters)
        <input type="password" name="password" autoComplete="new-password" required minLength={6} />
      </label>
      <Submit label="Create family" pendingLabel="Creating…" />
      <ErrorLine state={state} />
    </form>
  );
}

function ChildSignIn() {
  const [state, action] = useActionState<AuthResult | null, FormData>(signInChildAction, null);
  return (
    <form action={action} className="capture-form">
      <label className="capture-label">
        Username
        <input type="text" name="username" autoComplete="username" required />
      </label>
      <label className="capture-label">
        Password
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      <Submit label="Sign in" pendingLabel="Signing in…" />
      <ErrorLine state={state} />
    </form>
  );
}

export function LoginForms() {
  const [tab, setTab] = useState<Tab>('parent-signin');
  const tabClass = (t: Tab) => (t === tab ? 'tab tab-active' : 'tab');
  return (
    <div className="stack">
      <div className="tabs">
        <button type="button" className={tabClass('parent-signin')} onClick={() => setTab('parent-signin')}>
          Parent sign in
        </button>
        <button type="button" className={tabClass('parent-signup')} onClick={() => setTab('parent-signup')}>
          Create family
        </button>
        <button type="button" className={tabClass('child-signin')} onClick={() => setTab('child-signin')}>
          Child sign in
        </button>
      </div>
      {tab === 'parent-signin' && <ParentSignIn />}
      {tab === 'parent-signup' && <ParentSignUp />}
      {tab === 'child-signin' && <ChildSignIn />}
    </div>
  );
}
