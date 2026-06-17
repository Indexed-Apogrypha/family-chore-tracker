import { redirect } from 'next/navigation';
import { authMode, getIdentity } from '../../lib/server/auth';
import { LoginForms, type LoginTab } from './LoginForms';

export const dynamic = 'force-dynamic';

const TABS: readonly LoginTab[] = ['parent-signin', 'parent-signup', 'child-signin'];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Login only exists in auth mode; otherwise the app is open (role-by-URL).
  if (!authMode()) redirect('/');
  const identity = await getIdentity();
  if (identity) redirect(identity.role === 'parent' ? '/parent' : '/child');

  // `?tab=` selects which form is SERVER-rendered, so each login form is reachable
  // without JS (deep-linkable + progressive enhancement); the client tabs still
  // toggle instantly from this initial value.
  const { tab } = await searchParams;
  const initialTab: LoginTab = TABS.includes(tab as LoginTab) ? (tab as LoginTab) : 'parent-signin';

  return (
    <section className="stack">
      <h2>Sign in</h2>
      <p className="muted">
        Parents sign in with email. Children sign in with the username a parent set for them.
      </p>
      <LoginForms initialTab={initialTab} />
    </section>
  );
}
