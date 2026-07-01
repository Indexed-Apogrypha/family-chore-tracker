/** Streaming fallback while the review queue (photos + verdicts) loads (§8.1). */
export default function ReviewLoading() {
  return (
    <main aria-busy="true">
      <h1>Review submissions</h1>
      <p className="hint">Loading the review queue…</p>
    </main>
  );
}
