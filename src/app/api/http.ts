import type { AppError } from "@/domain/shared/errors";

/**
 * The one HTTP edge mapping for the closed `AppError` set (design §8.2): every
 * route handler renders an error the same way, so the client can rely on the
 * status code and the body shape. Exhaustive over the union — adding an
 * `AppError` variant fails compilation here until it's mapped.
 */
export function errorStatus(error: AppError): number {
  switch (error.code) {
    case "validation":
      return 400;
    case "bad_pin":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "invalid_transition":
      return 409;
    case "judge_unavailable":
    case "storage_unavailable":
    case "persistence_unavailable":
      return 503;
  }
}

/**
 * The error body: always `{ error: code }`, plus the variant's useful details —
 * `field`/`message` for `validation` (so forms can show which field failed and
 * why, not a generic "check the form") and `submissionId` for
 * `judge_unavailable` (so the client can retry that exact submission, §7.2).
 */
export function errorBody(error: AppError): Record<string, unknown> {
  switch (error.code) {
    case "validation":
      return { error: error.code, field: error.field, message: error.message };
    case "judge_unavailable":
      return { error: error.code, submissionId: error.submissionId };
    default:
      return { error: error.code };
  }
}

/** Render an `AppError` as the HTTP response — status + body from one mapping. */
export function errorResponse(error: AppError): Response {
  return Response.json(errorBody(error), { status: errorStatus(error) });
}

/** Bound for the JSON bodies the API accepts — none of them are remotely this big. */
const MAX_JSON_BYTES = 64 * 1024;

/**
 * Read a JSON request body defensively: bound its declared size and map a
 * malformed body to `null` (the route returns 400) instead of letting
 * `request.json()` throw into an unhandled 500.
 */
export async function readJson<T>(request: Request): Promise<T | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_JSON_BYTES) return null;
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** The 400 a route returns when {@link readJson} yields `null` / a bad shape. */
export function badRequest(): Response {
  return Response.json(
    {
      error: "validation",
      message: "Malformed request body.",
    },
    { status: 400 },
  );
}

/** The 401 every authenticated route returns when no session context resolves. */
export function unauthenticated(): Response {
  return Response.json({ error: "unauthenticated" }, { status: 401 });
}
