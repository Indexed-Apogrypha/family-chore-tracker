"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { type ApiErrorBody, errorMessageFromBody } from "@/app/error-copy";

const CAPTURE_ERRORS = {
  forbidden: "That chore isn't yours to submit.",
  not_found: "That chore is no longer available.",
  validation: "Please choose an image and try again.",
};

interface SubmitResult extends ApiErrorBody {
  submissionId?: string;
}

/**
 * Kid photo-capture control for a `todo` chore (design §7.2). Opens the camera on
 * mobile (`capture="environment"`) or a file picker and uploads to
 * `POST /api/submissions`. On `judge_unavailable` the photo is already stored
 * server-side, so **Retry re-runs the judge on that same submission** via
 * `POST /api/submissions/retry` — it never re-uploads. A success refreshes the
 * board so the chore moves to "Awaiting parent".
 */
export function ChoreCapture({ instanceId }: { instanceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set only on judge_unavailable: the submission to retry the judge against.
  const [retryId, setRetryId] = useState<string | null>(null);

  function applyResult(res: Response, data: SubmitResult) {
    if (res.ok) {
      setError(null);
      setRetryId(null);
      router.refresh();
      return;
    }
    setError(errorMessageFromBody(data, CAPTURE_ERRORS));
    setRetryId(
      data.error === "judge_unavailable" ? (data.submissionId ?? null) : null,
    );
  }

  async function send(req: Promise<Response>) {
    setBusy(true);
    setError(null);
    const res = await req;
    const data = (await res.json().catch(() => ({}))) as SubmitResult;
    setBusy(false);
    applyResult(res, data);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const photo = e.target.files?.[0];
    if (!photo) return;
    const body = new FormData();
    body.set("photo", photo);
    body.set("instanceId", instanceId);
    void send(fetch("/api/submissions", { method: "POST", body }));
  }

  function retry() {
    if (!retryId) return;
    void send(
      fetch("/api/submissions/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId: retryId }),
      }),
    );
  }

  return (
    <div className="capture" aria-busy={busy}>
      <label className="capture-btn">
        {busy ? "Submitting…" : "📸 Submit photo"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Choose a photo of the finished chore"
          hidden
          disabled={busy}
          onChange={onPick}
        />
      </label>
      {error ? (
        <span className="error" role="alert">
          {error}
          {retryId ? (
            <button
              type="button"
              className="capture-retry"
              disabled={busy}
              onClick={retry}
            >
              Retry
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
