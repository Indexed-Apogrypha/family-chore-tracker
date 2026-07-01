/** Streaming fallback while the board materializes today's chores (§7.3). */
export default function BoardLoading() {
  return (
    <main aria-busy="true">
      <h1>Today&rsquo;s chores</h1>
      <p className="hint">Loading your chores…</p>
    </main>
  );
}
