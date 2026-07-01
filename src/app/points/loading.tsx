/** Streaming fallback while the points ledger loads (§6, §8.1). */
export default function PointsLoading() {
  return (
    <main aria-busy="true">
      <h1>Points</h1>
      <p className="hint">Loading your points…</p>
    </main>
  );
}
