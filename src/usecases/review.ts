import type { SubmissionId } from "@/domain/shared/ids";
import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { Submission } from "@/domain/submission/types";
import type { Ports } from "@/ports";
import type { RequestContext } from "@/ports/context";

import { requireParent } from "./authz";

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

  const submissions = await ports.submissions.listByStatus(
    ctx.familyId,
    "pending_review",
  );
  const items = await Promise.all(
    submissions.map(async (submission) => {
      const [photoUrl, instance] = await Promise.all([
        ports.photos.signedUrl({ path: submission.photoPath }),
        ports.chores.getInstance(ctx.familyId, submission.instanceId),
      ]);
      // Display-only fallback if the instance is somehow missing; the
      // authoritative points credit re-reads the instance in `decide`.
      return {
        submission,
        photoUrl,
        choreTitle: instance?.title ?? "Chore",
        points: instance?.points ?? 0,
      };
    }),
  );
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
 * Parent-only; every id is family-scoped (cross-family → `not_found`).
 */
export async function decide(
  ports: Ports,
  ctx: RequestContext,
  input: DecideInput,
): Promise<Result<Submission>> {
  const gate = requireParent(ctx);
  if (!gate.ok) return gate;

  const submission = await ports.submissions.get(ctx.familyId, input.submissionId);
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

  const instance = await ports.chores.getInstance(
    ctx.familyId,
    submission.instanceId,
  );
  if (!instance) {
    return err({
      code: "not_found",
      entity: "instance",
      id: submission.instanceId,
    });
  }

  const decidedAt = ports.clock.now();

  // One atomic op (a transaction on the real adapter, #136) applies all three
  // writes of the authoritative path together: record the decision on the
  // submission, advance the instance (`approved`, or `todo` to recycle on
  // reject, §7.1), and — on approve — credit the instance's points to its
  // assignee. A partial failure can no longer leave a submission `approved` with
  // no points credited; the credit stays idempotent on `submissionId`.
  await ports.submissions.recordDecisionAndAdvance(ctx.familyId, {
    submissionId: submission.id,
    instanceId: instance.id,
    status,
    decidedBy: ctx.actor.memberId,
    decidedAt,
  });

  const updated = await ports.submissions.get(ctx.familyId, submission.id);
  if (!updated) {
    return err({ code: "not_found", entity: "submission", id: submission.id });
  }
  return ok(updated);
}
