import type { SubmissionId } from "@/domain/shared/ids";
import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { Submission } from "@/domain/submission/types";
import type { Ports } from "@/ports";
import type { RequestContext } from "@/ports/context";

import { requireParent } from "./authz";
import { persistOp, storeOp } from "./infra";

/** A submission awaiting a parent's decision, with a viewable photo URL (§8.1). */
export interface ReviewItem {
  submission: Submission;
  /** Short-lived signed URL for viewing the photo — never a public link (§9). */
  photoUrl: string;
  /** The chore's title at submission time (snapshot on the instance). */
  choreTitle: string;
  /** Points the kid earns if this is approved. */
  points: number;
}

/**
 * The parent's review queue (design §8.1): every `pending_review` submission in
 * the family, each with its advisory AI verdict (already on the submission) and a
 * short-lived signed photo URL. Parent-only; family-scoped so another family's
 * submissions never appear (§9).
 */
export async function getReviewQueue(
  ports: Ports,
  ctx: RequestContext,
): Promise<Result<ReviewItem[]>> {
  const gate = requireParent(ctx);
  if (!gate.ok) return gate;

  const submissionsR = await persistOp(() =>
    ports.submissions.listByStatus(ctx.familyId, "pending_review"),
  );
  if (!submissionsR.ok) return submissionsR;

  const items: ReviewItem[] = [];
  for (const submission of submissionsR.value) {
    const [photoUrlR, instanceR] = await Promise.all([
      storeOp(() => ports.photos.signedUrl({ path: submission.photoPath })),
      persistOp(() => ports.chores.getInstance(ctx.familyId, submission.instanceId)),
    ]);
    if (!photoUrlR.ok) return photoUrlR;
    if (!instanceR.ok) return instanceR;
    // Display-only fallback if the instance is somehow missing; the
    // authoritative points credit re-reads the instance in `decide`.
    items.push({
      submission,
      photoUrl: photoUrlR.value,
      choreTitle: instanceR.value?.title ?? "Chore",
      points: instanceR.value?.points ?? 0,
    });
  }
  return ok(items);
}

export interface DecideInput {
  submissionId: SubmissionId;
  decision: "approve" | "reject";
}

/**
 * A parent's **authoritative** decision on a submission (design §7.1, §8.1).
 * Valid only while the submission is `pending_review` (else `invalid_transition`).
 * The parent may override the advisory AI verdict either way — `decide` never
 * consults it.
 *
 * - **approve** → submission + instance `approved`, and the kid is credited the
 *   instance's points **exactly once** (the ledger is idempotent on
 *   `submissionId`, §6).
 * - **reject** → submission terminal `rejected`; the instance recycles to `todo`
 *   so a fresh photo starts a new submission (`chore_instances` has no `rejected`).
 *
 * Parent-only; every id is family-scoped (cross-family → `not_found`). The
 * decision, the instance move, and the credit settle as **one atomic op** —
 * a transaction on the real adapter (#136) — so a fault can never approve a
 * submission without crediting its points.
 */
export async function decide(
  ports: Ports,
  ctx: RequestContext,
  input: DecideInput,
): Promise<Result<Submission>> {
  const gate = requireParent(ctx);
  if (!gate.ok) return gate;

  const submissionR = await persistOp(() =>
    ports.submissions.get(ctx.familyId, input.submissionId),
  );
  if (!submissionR.ok) return submissionR;
  const submission = submissionR.value;
  if (!submission) {
    return err({
      code: "not_found",
      entity: "submission",
      id: input.submissionId,
    });
  }
  const approve = input.decision === "approve";
  const status = approve ? "approved" : "rejected";
  if (submission.status !== "pending_review") {
    return err({
      code: "invalid_transition",
      from: submission.status,
      to: status,
    });
  }

  const instanceR = await persistOp(() =>
    ports.chores.getInstance(ctx.familyId, submission.instanceId),
  );
  if (!instanceR.ok) return instanceR;
  const instance = instanceR.value;
  if (!instance) {
    return err({
      code: "not_found",
      entity: "instance",
      id: submission.instanceId,
    });
  }

  const decidedAt = ports.clock.now();

  // One atomic op (a transaction on the real adapter, #136): the decision, the
  // instance move (approve → `approved`, reject → recycle to `todo`, §7.1), and
  // the idempotent points credit commit or fail together — never a submission
  // `approved` with no points credited.
  const settled = await persistOp(() =>
    ports.submissions.recordDecisionAndSettle(
      ctx.familyId,
      submission.id,
      instance.id,
      { status, decidedBy: ctx.actor.memberId, decidedAt },
      approve
        ? { memberId: instance.assignedMemberId, delta: instance.points }
        : null,
    ),
  );
  if (!settled.ok) return settled;

  const updatedR = await persistOp(() =>
    ports.submissions.get(ctx.familyId, submission.id),
  );
  if (!updatedR.ok) return updatedR;
  if (!updatedR.value) {
    return err({ code: "not_found", entity: "submission", id: submission.id });
  }
  return ok(updatedR.value);
}
