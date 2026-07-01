import Link from "next/link";

/** Branded 404 (App Router convention) — a wrong URL gets a way home, not a dead end. */
export default function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <p className="hint">That page doesn&rsquo;t exist (or moved).</p>
      <p className="board-link">
        <Link href="/">← Back to profiles</Link>
      </p>
    </main>
  );
}
