import { deriveContext } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { addKid } from "@/usecases/members";

/**
 * Add a kid profile to the acting family (design §8.1) — parent-only, enforced
 * inside the use-case. `forbidden` → 403, `validation` → 400. The created kid is
 * returned without its `pin_hash` (never leaves the server).
 */
export async function POST(request: Request): Promise<Response> {
  const { displayName, pin } = (await request.json()) as {
    displayName?: string;
    pin?: string;
  };

  const ctx = await deriveContext();
  if (!ctx) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const result = await addKid(serverPorts(), ctx, {
    displayName: displayName ?? "",
    pin: pin ?? "",
  });
  if (!result.ok) {
    const status = result.error.code === "forbidden" ? 403 : 400;
    return Response.json({ error: result.error.code }, { status });
  }

  return Response.json({
    ok: true,
    member: {
      id: result.value.id,
      displayName: result.value.displayName,
      kind: result.value.kind,
    },
  });
}
