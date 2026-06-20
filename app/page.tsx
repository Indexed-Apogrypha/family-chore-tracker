import Link from 'next/link';
import { redirect } from 'next/navigation';
import { StreakBadge } from './components/StreakBadge';
import { getStreakState } from '../lib/server/container';
import { authMode, getIdentity } from '../lib/server/auth';

// Reads live, per-request state — never prerender to a build-time snapshot.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  if (authMode()) {
    const identity = await getIdentity();
    if (!identity) redirect('/login');
    const streak = await getStreakState();
    return (
      <section className="stack">
        <StreakBadge streak={streak} />
        {identity.role === 'parent' ? (
          <div className="cards">
            <Link className="card" href="/parent">
              Set the reference photo
            </Link>
            <Link className="card" href="/parent/history">
              See history
            </Link>
            <Link className="card" href="/parent/children">
              Manage children
            </Link>
          </div>
        ) : (
          <div className="cards">
            <Link className="card" href="/child">
              Submit my room
            </Link>
          </div>
        )}
      </section>
    );
  }

  // Legacy keyless mode: the original open "pick who you are".
  const streak = await getStreakState();
  return (
    <section className="stack">
      <StreakBadge streak={streak} />
      <p>Welcome! Pick who you are:</p>
      <div className="cards">
        <Link className="card" href="/parent">
          I’m a parent — set the reference photo
        </Link>
        <Link className="card" href="/child">
          I’m a child — submit my room
        </Link>
        <Link className="card" href="/parent/history">
          See history
        </Link>
      </div>
    </section>
  );
}
