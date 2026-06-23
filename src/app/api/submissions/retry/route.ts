import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { submissionId } from "@/domain/shared/ids";
import { retrySubmission } from "@/usecases/submission";

import { submissionResponse } from "../respond";

/**
 * Retry a submission stuck in `evaluating` after a judge outage (design §7.2) —
 * re-runs the judge on the already-stored photo (never re-uploads). Owner-or-parent
 * is enforced inside the use-case; `invalid_transition`→409, `judge_unavailable`→503
 * (still retryable), via {@link submissionResponse}.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await deriveContext();
  if (!ctx) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    submissionId?: string;
  };
  if (typeof body.submissionId !== "string") {
    return Response.json({ error: "validation" }, { status: 400 });
  }

  const result = await retrySubmission(serverPorts(), ctx, {
    submissionId: submissionId(body.submissionId),
  });

  return submissionResponse(result);
}
