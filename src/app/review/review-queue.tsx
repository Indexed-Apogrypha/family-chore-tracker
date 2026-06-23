"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage } from "@/app/error-copy";

export interface ReviewItemDto {
  submissionId: string;
  choreTitle: string;
  points: number;
  submittedByName: string;
  photoUrl: string;
  verdict: { pass: boolean; confidence: number; reasoning: string } | null;
}

const REVIEW_ERRORS = {
  forbidden: "Only a parent can review.",
  not_found: "That submission is no longer available.",
  invalid_transition: "That submission was already decided — refreshing.",
};

/**
 * Parent review queue (design §7.1, §8). Each pending submission shows the photo
 * and the **advisory** AI verdict; the parent's approve/reject is authoritative
 * and may override the verdict. Decisions post to `/api/review/decide`, then the
 * server component re-renders.
 */
export function ReviewQueue({ items }: { items: ReviewItemDto[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(submissionId: string, decision: "approve" | "reject") {
    setBusyId(submissionId);
    setError(null);
    const res = await fetch("/api/review/decide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ submissionId, decision }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusyId(null);
    if (!res.ok) {
      setError(errorMessage(data.error, REVIEW_ERRORS));
    }
    router.refresh();
  }

  if (items.length === 0) {
    return <p className="hint">Nothing to review right now. 🎉</p>;
  }

  return (
    <section className="review">
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="review-list">
        {items.map((item) => (
          <li key={item.submissionId} className="review-card">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset */}
            <img
              className="review-photo"
              src={item.photoUrl}
              alt={`Photo for ${item.choreTitle}`}
            />
            <div className="review-body">
              <div className="review-head">
                <span className="review-title">{item.choreTitle}</span>
                <span className="review-points">{item.points} pts</span>
              </div>
              <p className="review-by">{item.submittedByName}</p>
              {item.verdict ? (
                <p className={`verdict verdict-${item.verdict.pass ? "pass" : "fail"}`}>
                  AI: {item.verdict.pass ? "looks done" : "not sure"} ·{" "}
                  {Math.round(item.verdict.confidence * 100)}% — {item.verdict.reasoning}
                </p>
              ) : (
                <p className="verdict">AI verdict unavailable</p>
              )}
              <div className="review-actions">
                <button
                  type="button"
                  disabled={busyId === item.submissionId}
                  onClick={() => review(item.submissionId, "approve")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="reject"
                  disabled={busyId === item.submissionId}
                  onClick={() => review(item.submissionId, "reject")}
                >
                  Reject
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
