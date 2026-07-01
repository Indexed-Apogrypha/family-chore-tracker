import { badRequest, errorResponse, readJson, unauthenticated } from "@/app/api/http";
import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { submissionId } from "@/domain/shared/ids";
import { decide } from "@/usecases/review";

/**
 * A parent approves/rejects a pending submission (design §7.1, §8.1). Parent-only
 * is enforced in the use-case. Error mapping via the shared HTTP edge:
 * validation→400, forbidden→403, not_found→404, invalid_transition→409
 * (already decided / not pending), persistence_unavailable→503.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await deriveContext();
  if (!ctx) return unauthenticated();

  const body = await readJson<{ submissionId?: string; decision?: string }>(
    request,
  );
  if (
    !body ||
    typeof body.submissionId !== "string" ||
    (body.decision !== "approve" && body.decision !== "reject")
  ) {
    return badRequest();
  }

  const result = await decide(serverPorts(), ctx, {
    submissionId: submissionId(body.submissionId),
    decision: body.decision,
  });
  if (!result.ok) return errorResponse(result.error);

  return Response.json({ ok: true, status: result.value.status });
}
