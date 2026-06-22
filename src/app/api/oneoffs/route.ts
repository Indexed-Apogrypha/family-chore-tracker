import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { memberId } from "@/domain/shared/ids";
import { createOneOff } from "@/usecases/chores";

/**
 * Create a one-off chore for the acting family (design §6) — parent-only,
 * enforced inside the use-case. `forbidden` → 403, `not_found` (unknown
 * assignee) → 404, `validation` (bad title/points/date) → 400.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as {
    title?: string;
    points?: number;
    assignedMemberId?: string;
    dueDate?: string;
  };

  const ctx = await deriveContext();
  if (!ctx) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const result = await createOneOff(serverPorts(), ctx, {
    title: body.title ?? "",
    points: body.points ?? 0,
    assignedMemberId: memberId(body.assignedMemberId ?? ""),
    dueDate: body.dueDate ?? "",
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
