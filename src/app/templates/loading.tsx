/** Streaming fallback while the chore templates load (§6). */
export default function TemplatesLoading() {
  return (
    <main aria-busy="true">
      <h1>Manage chores</h1>
      <p className="hint">Loading chores…</p>
    </main>
  );
}
