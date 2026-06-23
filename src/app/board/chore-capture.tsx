"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ERROR_TEXT: Record<string, string> = {
  forbidden: "That chore isn't yours to submit.",
  not_found: "That chore is no longer available.",
  validation: "Please choose a photo and try again.",
  judge_unavailable: "Couldn't check it just now — your photo is saved.",
};
const explain = (code?: string) =>
  (code && ERROR_TEXT[code]) || "Something went wrong. Try again.";

/**
 * Kid photo-capture control for a `todo` chore (design §7.2). Opens the camera on
 * mobile (`capture="environment"`) or a file picker, uploads to
 * `POST /api/submissions`, and reflects the outcome. On `judge_unavailable` the
 * photo is already stored server-side, so Retry simply re-sends the same photo. A
 * successful submit refreshes the board so the chore moves to "Awaiting parent".
 */
export function ChoreCapture({ instanceId }: { instanceId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);

  async function upload(photo: File) {
    setBusy(true);
    setError(null);
    setRetryable(false);
    const body = new FormData();
    body.set("photo", photo);
    body.set("instanceId", instanceId);
    const res = await fetch("/api/submissions", { method: "POST", body });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(explain(data.error));
      setRetryable(data.error === "judge_unavailable");
      return;
    }
    setPending(null);
    router.refresh();
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    if (picked) {
      setPending(picked);
      void upload(picked);
    }
  }

  return (
    <div className="capture">
      <label className="capture-btn">
        {busy ? "Submitting…" : "📸 Submit photo"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          disabled={busy}
          onChange={onPick}
        />
      </label>
      {error ? (
        <span className="error" role="alert">
          {error}
          {retryable && pending ? (
            <button
              type="button"
              className="capture-retry"
              disabled={busy}
              onClick={() => void upload(pending)}
            >
              Retry
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
