import { redirect } from 'next/navigation';
import { authMode, getAuthedClient, requireParent } from '../../../lib/server/auth';
import { ProvisionChildForm } from './ProvisionChildForm';

export const dynamic = 'force-dynamic';

export default async function ChildrenPage() {
  // Child management only exists in auth mode; keyless mode has no accounts.
  if (!authMode()) redirect('/parent');
  await requireParent();
  const client = await getAuthedClient();
  // RLS (users_select_same_family) scopes this to the parent's own family.
  const { data } = await client.from('users').select('username').eq('role', 'child');
  const children = (data ?? []) as { username: string | null }[];

  return (
    <section className="stack">
      <h2>Children</h2>
      <p className="muted">
        Add a child account. They sign in with the username and password you set — there is no
        child self-registration.
      </p>
      <ProvisionChildForm />
      {children.length > 0 && (
        <div className="stack">
          <p className="muted">Your children:</p>
          <ul className="history">
            {children.map((c) => (
              <li key={c.username} className="history-item">
                {c.username}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
