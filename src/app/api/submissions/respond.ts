import { errorResponse } from "@/app/api/http";
import type { Result } from "@/domain/shared/result";
import type { Submission } from "@/domain/submission/types";

/**
 * Map a submission-use-case `Result` to an HTTP response (shared by the submit
 * and retry routes) via the shared HTTP edge. `judge_unavailable` carries the
 * `submissionId` so the client can retry that exact submission — the photo is
 * kept and never re-stored (§7.2).
 */
export function submissionResponse(result: Result<Submission>): Response {
  if (result.ok) {
    return Response.json({ ok: true, status: result.value.status });
  }
  return errorResponse(result.error);
}
