import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { instanceId } from "@/domain/shared/ids";
import { submitPhoto } from "@/usecases/submission";

import { submissionResponse } from "./respond";

/** Bound the in-memory read of an upload (memory / storage-cost defense). */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

/**
 * Kid submits a chore photo (design §7.2). Parses the multipart upload, bounds it
 * (size + image MIME), and runs `submitPhoto` (store → `evaluating` → judge →
 * `pending_review`). Owner-or-parent is enforced inside the use-case; the closed
 * error set maps to HTTP in {@link submissionResponse} (`judge_unavailable`→503
 * carries the submission id to retry against).
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await deriveContext();
  if (!ctx) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Reject oversized uploads before buffering the body into memory.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_PHOTO_BYTES) {
    return Response.json({ error: "too_large" }, { status: 413 });
  }

  const form = await request.formData();
  const photo = form.get("photo");
  const instance = form.get("instanceId");
  if (!(photo instanceof File) || typeof instance !== "string") {
    return Response.json({ error: "validation" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(photo.type)) {
    return Response.json({ error: "validation" }, { status: 400 });
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return Response.json({ error: "too_large" }, { status: 413 });
  }

  const bytes = new Uint8Array(await photo.arrayBuffer());
  const result = await submitPhoto(serverPorts(), ctx, {
    instanceId: instanceId(instance),
    bytes,
    contentType: photo.type,
  });

  return submissionResponse(result);
}
