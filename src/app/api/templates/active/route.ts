import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { templateId } from "@/domain/shared/ids";
import { setTemplateActive } from "@/usecases/chores";

/**
 * Activate/deactivate a template (design §6, §7.3) — parent-only, enforced in
 * the use-case. Deactivating stops future lazy generation. `forbidden` → 403,
 * `not_found` (unknown/cross-family template) → 404.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as {
    templateId?: string;
    active?: boolean;
  };
  if (!body.templateId) {
    return Response.json({ error: "missing_template" }, { status: 400 });
  }

  const ctx = await deriveContext();
  if (!ctx) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const result = await setTemplateActive(serverPorts(), ctx, {
    templateId: templateId(body.templateId),
    active: Boolean(body.active),
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

  return Response.json({ ok: true, active: result.value.active });
}
