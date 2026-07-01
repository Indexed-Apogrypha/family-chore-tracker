import { badRequest, errorResponse, readJson, unauthenticated } from "@/app/api/http";
import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { memberId } from "@/domain/shared/ids";
import { createOneOff } from "@/usecases/chores";

/**
 * Create a one-off chore for the acting family (design §6) — parent-only,
 * enforced inside the use-case. Errors map via the shared HTTP edge:
 * `forbidden` → 403, `not_found` (unknown assignee) → 404, `validation`
 * (bad title/points/date) → 400 with the failing field + message.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await deriveContext();
  if (!ctx) return unauthenticated();

  const body = await readJson<{
    title?: string;
    points?: number;
    assignedMemberId?: string;
    dueDate?: string;
  }>(request);
  if (!body) return badRequest();

  const result = await createOneOff(serverPorts(), ctx, {
    title: body.title ?? "",
    points: body.points ?? 0,
    assignedMemberId: memberId(body.assignedMemberId ?? ""),
    dueDate: body.dueDate ?? "",
  });
  if (!result.ok) return errorResponse(result.error);

  return Response.json({ ok: true });
}
