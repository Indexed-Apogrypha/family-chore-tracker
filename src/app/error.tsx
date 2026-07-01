"use client";

/**
 * Global error boundary (App Router convention). A thrown render/runtime error
 * in any screen lands here instead of the framework's default crash page —
 * the same "no blank screens" promise the closed AppError set makes for
 * expected failures (design §8.2). `reset()` re-renders the segment.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <h1>Something went wrong</h1>
      <p className="hint">
        An unexpected error interrupted this screen. Your chores and points are
        safe — try again.
      </p>
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
