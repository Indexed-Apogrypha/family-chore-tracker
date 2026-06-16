import Link from 'next/link';
import { authMode, getIdentity } from '../../lib/server/auth';
import { signOutAction } from '../auth/actions';

/**
 * The header nav. In legacy keyless mode it's the original open, role-by-URL set
 * of links. In auth mode it reflects the signed-in user: role-appropriate links
 * plus a sign-out button, or just a sign-in link when signed out.
 */
export async function Nav() {
  if (!authMode()) {
    return (
      <nav className="nav">
        <Link href="/">Home</Link>
        <Link href="/parent">Parent</Link>
        <Link href="/child">Child</Link>
        <Link href="/parent/history">History</Link>
      </nav>
    );
  }

  const identity = await getIdentity();
  if (!identity) {
    return (
      <nav className="nav">
        <Link href="/login">Sign in</Link>
      </nav>
    );
  }

  return (
    <nav className="nav">
      <Link href="/">Home</Link>
      {identity.role === 'parent' ? (
        <>
          <Link href="/parent">Parent</Link>
          <Link href="/parent/history">History</Link>
          <Link href="/parent/children">Children</Link>
        </>
      ) : (
        <Link href="/child">Child</Link>
      )}
      <form action={signOutAction} className="nav-signout">
        <button type="submit" className="linklike">
          Sign out{identity.username ? ` (${identity.username})` : ''}
        </button>
      </form>
    </nav>
  );
}
