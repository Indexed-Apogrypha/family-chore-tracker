/**
 * User-facing copy for every error code the API surfaces — the closed `AppError`
 * set (design §8.2) plus the HTTP-layer codes the route handlers emit. One place
 * so every flow renders an intelligible message and no code ever falls through to
 * a blank screen. Components pass `overrides` for codes that read better with
 * flow-specific wording (e.g. `validation` on a photo upload vs a name field).
 */
const ERROR_COPY: Record<string, string> = {
  // Closed AppError set (§8.2)
  forbidden: "You don't have permission to do that.",
  not_found: "That item is no longer available.",
  invalid_transition: "That was already decided — refreshing.",
  bad_pin: "Wrong PIN — try again.",
  judge_unavailable: "Couldn't check it just now — your photo is saved.",
  storage_unavailable: "Couldn't save your photo just now — please try again.",
  persistence_unavailable: "Couldn't save that just now — please try again.",
  validation: "Please check the form and try again.",
  // HTTP-layer codes the route handlers add
  unauthenticated: "Please sign in again.",
  too_large: "That photo is too large.",
  too_many_attempts: "Too many wrong PINs — wait a few minutes and try again.",
  cross_origin: "That request didn't come from this app.",
  // Parent auth route codes (§3.1)
  missing_fields: "Enter your email and password.",
  invalid_credentials: "Email or password is incorrect.",
  no_family: "That account has no family yet — create one on the signup page.",
};

const FALLBACK = "Something went wrong. Try again.";

/** Map an error code to user-facing copy; `overrides` win, then the shared map, then a generic fallback. */
export function errorMessage(
  code: string | undefined,
  overrides?: Record<string, string>,
): string {
  if (code && overrides?.[code]) return overrides[code];
  return (code && ERROR_COPY[code]) || FALLBACK;
}

/** The error body shape every API route returns (see `app/api/http.ts`). */
export interface ApiErrorBody {
  error?: string;
  message?: string;
}

/**
 * Map an API error body to user-facing copy. `overrides` win (flow-specific
 * wording), then a `validation` error's server-provided field message — "title
 * must be 80 characters or fewer.", not a generic "check the form" (§8.2) —
 * then the shared map.
 */
export function errorMessageFromBody(
  body: ApiErrorBody,
  overrides?: Record<string, string>,
): string {
  if (body.error && overrides?.[body.error]) return overrides[body.error];
  if (body.error === "validation" && body.message) return body.message;
  return errorMessage(body.error, overrides);
}
