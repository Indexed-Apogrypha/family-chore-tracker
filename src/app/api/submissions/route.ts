import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { instanceId } from "@/domain/shared/ids";
import { submitPhoto } from "@/usecases/submission";

/**
 * Kid submits a chore photo (design §7.2). Parses the multipart upload and runs
 * `submitPhoto` (store → `evaluating` → judge → `pending_review`). Owner-or-parent
 * is enforced inside the use-case. Error mapping: `forbidden`→403, `not_found`→404,
 * `validation`→400, `judge_unavailable`→503 (retryable — the photo is kept).
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await deriveContext();
  if (!ctx) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const form = await request.formData();
  const photo = form.get("photo");
  const instance = form.get("instanceId");
  if (!(photo instanceof File) || typeof instance !== "string") {
    return Response.json({ error: "validation" }, { status: 400 });
  }

  const bytes = new Uint8Array(await photo.arrayBuffer());
  const result = await submitPhoto(serverPorts(), ctx, {
    instanceId: instanceId(instance),
    bytes,
    contentType: photo.type || "application/octet-stream",
  });

  if (!result.ok) {
    const status =
      result.error.code === "forbidden"
        ? 403
        : result.error.code === "not_found"
          ? 404
          : result.error.code === "judge_unavailable"
            ? 503
            : 400;
    return Response.json({ error: result.error.code }, { status });
  }

  return Response.json({ ok: true, status: result.value.status });
}
