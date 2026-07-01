import { badRequest, errorResponse, readJson, unauthenticated } from "@/app/api/http";
import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import type { Recurrence } from "@/domain/shared/enums";
import { memberId } from "@/domain/shared/ids";
import { createTemplate } from "@/usecases/chores";

/**
 * Create a chore template for the acting family (design §6, §8.1) — parent-only,
 * enforced inside the use-case. Errors map via the shared HTTP edge: `forbidden`
 * → 403, `not_found` (unknown assignee) → 404, `validation` → 400 (with the
 * failing field + message so the form can say why).
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await deriveContext();
  if (!ctx) return unauthenticated();

  const body = await readJson<{
    title?: string;
    description?: string;
    points?: number;
    recurrence?: Recurrence;
    assignedMemberId?: string;
  }>(request);
  if (!body) return badRequest();

  const result = await createTemplate(serverPorts(), ctx, {
    title: body.title ?? "",
    description: body.description,
    points: body.points ?? 0,
    recurrence: body.recurrence ?? { kind: "none" },
    assignedMemberId: memberId(body.assignedMemberId ?? ""),
  });
  if (!result.ok) return errorResponse(result.error);

  return Response.json({ ok: true });
}
