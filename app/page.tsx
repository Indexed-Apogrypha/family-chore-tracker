import Link from 'next/link';
import { StreakBadge } from './components/StreakBadge';
import { getStreakState } from '../lib/server/container';

// Reads live, per-request state (the in-memory store now, Supabase later) — never
// prerender to a build-time snapshot.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
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
