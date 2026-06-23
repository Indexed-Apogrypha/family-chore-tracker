import type { Result } from "@/domain/shared/result";
import type { Submission } from "@/domain/submission/types";

/**
 * Map a submission-use-case `Result` to an HTTP response (shared by the submit
 * and retry routes). `judge_unavailable` carries the `submissionId` so the client
 * can retry that exact submission — the photo is kept and never re-stored (§7.2).
 */
export function submissionResponse(result: Result<Submission>): Response {
  if (result.ok) {
    return Response.json({ ok: true, status: result.value.status });
  }
  const { error } = result;
  const status =
    error.code === "forbidden"
      ? 403
      : error.code === "not_found"
        ? 404
        : error.code === "invalid_transition"
          ? 409
          : error.code === "judge_unavailable"
            ? 503
            : 400;
  const body =
    error.code === "judge_unavailable"
      ? { error: error.code, submissionId: error.submissionId }
      : { error: error.code };
  return Response.json(body, { status });
}
