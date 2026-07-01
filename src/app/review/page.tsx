import Link from "next/link";
import { redirect } from "next/navigation";

import { errorMessage } from "@/app/error-copy";
import { RefreshOnFocus } from "@/app/refresh-on-focus";
import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { listMembers } from "@/usecases/members";
import { getReviewQueue } from "@/usecases/review";

import { type ReviewItemDto, ReviewQueue } from "./review-queue";

/**
 * Parent review screen (design §7.1, §8). A thin server component: derive the
 * context, load the pending-review queue + members through use-cases, and render
 * the queue. Parent-only — a kid actor is sent back to the hub; unauthenticated
 * devices to `/login`. Capability is also enforced inside `getReviewQueue`/`decide`.
 */
export default async function ReviewPage() {
  const ctx = await deriveContext();
  if (!ctx) redirect("/login");
  if (ctx.actor.kind !== "parent") redirect("/");

  const ports = serverPorts();
  const [queueResult, membersResult] = await Promise.all([
    getReviewQueue(ports, ctx),
    listMembers(ports, ctx),
  ]);

  const nameById = new Map(
    (membersResult.ok ? membersResult.value : []).map((m) => [
      m.id as string,
      m.displayName,
    ]),
  );

  const items: ReviewItemDto[] = (queueResult.ok ? queueResult.value : []).map(
    (item) => ({
      submissionId: item.submission.id as string,
      choreTitle: item.choreTitle,
      points: item.points,
      submittedByName: nameById.get(item.submission.submittedBy as string) ?? "—",
      photoUrl: item.photoUrl,
      verdict: item.submission.aiVerdict
        ? {
            pass: item.submission.aiVerdict.pass,
            confidence: item.submission.aiVerdict.confidence,
            reasoning: item.submission.aiVerdict.reasoning,
          }
        : null,
    }),
  );

  return (
    <main>
      {/* New submissions arrive from the kids' screens — refetch on focus. */}
      <RefreshOnFocus />
      <p className="board-nav">
        <Link href="/">← Profiles</Link>
      </p>
      <h1>Review submissions</h1>
      {!queueResult.ok ? (
        <p className="error" role="alert">
          {errorMessage(queueResult.error.code, {
            persistence_unavailable:
              "Couldn't load the review queue just now — try again shortly.",
            storage_unavailable:
              "Couldn't load the submission photos just now — try again shortly.",
          })}
        </p>
      ) : (
        <ReviewQueue items={items} />
      )}
    </main>
  );
}
