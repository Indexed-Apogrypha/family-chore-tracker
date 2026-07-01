import { badRequest, errorResponse, readJson, unauthenticated } from "@/app/api/http";
import { pinRateLimiter } from "@/composition/rate-limit";
import { deriveContext, setActiveMember } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { memberId } from "@/domain/shared/ids";
import { switchProfile } from "@/usecases/profile";

/**
 * Switch the active profile on a shared device (design §3.1). Selecting the
 * parent needs no PIN; selecting a kid requires it. On success the chosen member
 * becomes the `active_member` cookie the rest of the app reads as `ctx.actor`.
 *
 * Wrong PINs are rate-limited per (family, member): after several failures that
 * member's switch backs off for a few minutes (429 `too_many_attempts`), so a
 * 4-digit PIN can't be walked by brute force. Errors map via the shared HTTP
 * edge: `bad_pin` → 401, `not_found` → 404.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await deriveContext();
  if (!ctx) return unauthenticated();

  const body = await readJson<{ memberId?: string; pin?: string }>(request);
  if (!body || typeof body.memberId !== "string") return badRequest();

  const limiter = pinRateLimiter();
  const attemptKey = `${ctx.familyId}:${body.memberId}`;
  if (!limiter.allowed(attemptKey, Date.now())) {
    return Response.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const result = await switchProfile(serverPorts(), ctx, {
    memberId: memberId(body.memberId),
    pin: body.pin,
  });
  if (!result.ok) {
    if (result.error.code === "bad_pin") {
      limiter.recordFailure(attemptKey, Date.now());
    }
    return errorResponse(result.error);
  }

  limiter.clear(attemptKey);
  await setActiveMember(result.value.id);
  return Response.json({
    ok: true,
    member: {
      id: result.value.id,
      displayName: result.value.displayName,
      kind: result.value.kind,
    },
  });
}
