import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { submissionId } from "@/domain/shared/ids";
import { decide } from "@/usecases/review";

/**
 * A parent approves/rejects a pending submission (design §7.1, §8.1). Parent-only
 * is enforced in the use-case. Error mapping: validation→400, forbidden→403,
 * not_found→404, invalid_transition→409 (already decided / not pending).
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await deriveContext();
  if (!ctx) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    submissionId?: string;
    decision?: string;
  };
  if (
    typeof body.submissionId !== "string" ||
    (body.decision !== "approve" && body.decision !== "reject")
  ) {
    return Response.json({ error: "validation" }, { status: 400 });
  }

  const result = await decide(serverPorts(), ctx, {
    submissionId: submissionId(body.submissionId),
    decision: body.decision,
  });

  if (!result.ok) {
    const status =
      result.error.code === "forbidden"
        ? 403
        : result.error.code === "not_found"
          ? 404
          : result.error.code === "invalid_transition"
            ? 409
            : 400;
    return Response.json({ error: result.error.code }, { status });
  }

  return Response.json({ ok: true, status: result.value.status });
}
