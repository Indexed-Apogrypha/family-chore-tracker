import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import type { Recurrence } from "@/domain/shared/enums";
import { memberId } from "@/domain/shared/ids";
import { createTemplate } from "@/usecases/chores";

/**
 * Create a chore template for the acting family (design §6, §8.1) — parent-only,
 * enforced inside the use-case. `forbidden` → 403, `not_found` (unknown assignee)
 * → 404, `validation` → 400.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as {
    title?: string;
    description?: string;
    points?: number;
    recurrence?: Recurrence;
    assignedMemberId?: string;
  };

  const ctx = await deriveContext();
  if (!ctx) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const result = await createTemplate(serverPorts(), ctx, {
    title: body.title ?? "",
    description: body.description,
    points: body.points ?? 0,
    recurrence: body.recurrence ?? { kind: "none" },
    assignedMemberId: memberId(body.assignedMemberId ?? ""),
  });
  if (!result.ok) {
    const status =
      result.error.code === "forbidden"
        ? 403
        : result.error.code === "not_found"
          ? 404
          : 400;
    return Response.json({ error: result.error.code }, { status });
  }

  return Response.json({ ok: true });
}
