import { badRequest, errorResponse, readJson, unauthenticated } from "@/app/api/http";
import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { addKid } from "@/usecases/members";

/**
 * Add a kid profile to the acting family (design §8.1) — parent-only, enforced
 * inside the use-case. Errors map via the shared HTTP edge: `forbidden` → 403,
 * `validation` → 400 (with field + message). The created kid is returned
 * without its `pin_hash` (never leaves the server).
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await deriveContext();
  if (!ctx) return unauthenticated();

  const body = await readJson<{ displayName?: string; pin?: string }>(request);
  if (!body) return badRequest();

  const result = await addKid(serverPorts(), ctx, {
    displayName: body.displayName ?? "",
    pin: body.pin ?? "",
  });
  if (!result.ok) return errorResponse(result.error);

  return Response.json({
    ok: true,
    member: {
      id: result.value.id,
      displayName: result.value.displayName,
      kind: result.value.kind,
    },
  });
}
