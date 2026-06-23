import { ok } from "@/domain/shared/result";
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
    submissions.map(async (submission) => ({
      submission,
      photoUrl: await ports.photos.signedUrl({ path: submission.photoPath }),
    })),
  );
  return ok(items);
}
