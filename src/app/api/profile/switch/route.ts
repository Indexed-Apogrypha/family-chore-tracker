import { deriveContext, setActiveMember } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { memberId } from "@/domain/shared/ids";
import { switchProfile } from "@/usecases/profile";

/**
 * Switch the active profile on a shared device (design §3.1). Selecting the
 * parent needs no PIN; selecting a kid requires it. On success the chosen member
 * becomes the `active_member` cookie the rest of the app reads as `ctx.actor`.
 * `bad_pin` → 401, `not_found` → 404 — the screen renders the failure as-is.
 */
export async function POST(request: Request): Promise<Response> {
  const { memberId: targetId, pin } = (await request.json()) as {
    memberId?: string;
    pin?: string;
  };
  if (!targetId) {
    return Response.json({ error: "missing_member" }, { status: 400 });
  }

  const ctx = await deriveContext();
  if (!ctx) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const result = await switchProfile(serverPorts(), ctx, {
    memberId: memberId(targetId),
    pin,
  });
  if (!result.ok) {
    const status = result.error.code === "not_found" ? 404 : 401;
    return Response.json({ error: result.error.code }, { status });
  }

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
