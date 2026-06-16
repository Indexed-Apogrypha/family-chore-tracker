import { redirect } from 'next/navigation';
import { authMode, getIdentity } from '../../lib/server/auth';
import { LoginForms } from './LoginForms';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // Login only exists in auth mode; otherwise the app is open (role-by-URL).
  if (!authMode()) redirect('/');
  const identity = await getIdentity();
  if (identity) redirect(identity.role === 'parent' ? '/parent' : '/child');

  return (
    <section className="stack">
      <h2>Sign in</h2>
      <p className="muted">
        Parents sign in with email. Children sign in with the username a parent set for them.
      </p>
      <LoginForms />
    </section>
  );
}
