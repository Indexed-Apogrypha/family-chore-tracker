import { badRequest, errorResponse, readJson, unauthenticated } from "@/app/api/http";
import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { templateId } from "@/domain/shared/ids";
import { setTemplateActive } from "@/usecases/chores";

/**
 * Activate/deactivate a template (design §6, §7.3) — parent-only, enforced in
 * the use-case. Deactivating stops future lazy generation. Errors map via the
 * shared HTTP edge: `forbidden` → 403, `not_found` (unknown/cross-family
 * template) → 404.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await deriveContext();
  if (!ctx) return unauthenticated();

  const body = await readJson<{ templateId?: string; active?: boolean }>(request);
  if (!body || typeof body.templateId !== "string") return badRequest();

  const result = await setTemplateActive(serverPorts(), ctx, {
    templateId: templateId(body.templateId),
    active: Boolean(body.active),
  });
  if (!result.ok) return errorResponse(result.error);

  return Response.json({ ok: true, active: result.value.active });
}
