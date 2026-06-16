import Link from 'next/link';

export function Nav() {
  return (
    <nav className="nav">
      <Link href="/">Home</Link>
      <Link href="/parent">Parent</Link>
      <Link href="/child">Child</Link>
      <Link href="/parent/history">History</Link>
    </nav>
  );
}
