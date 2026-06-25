import type { Member } from "@/domain/family/types";
import type { MemberId } from "@/domain/shared/ids";
import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import type { RequestContext } from "@/ports/context";

import { requireParent } from "./authz";
import { persistOp } from "./infra";
import { requireName, requirePin } from "./validation";

export interface AddKidInput {
  displayName: string;
  pin: string;
}

export interface VerifyKidPinInput {
  memberId: MemberId;
  pin: string;
}

/**
 * Add a kid profile under the acting family (design §6, §8.1). Parent-only; the
 * adapter hashes the PIN into `pin_hash` (kids hold no auth identity, §3.1).
 */
export async function addKid(
  ports: Ports,
  ctx: RequestContext,
  input: AddKidInput,
): Promise<Result<Member>> {
  const gate = requireParent(ctx);
  if (!gate.ok) return gate;

  const displayName = requireName("displayName", input.displayName);
  if (!displayName.ok) return displayName;
  const pin = requirePin(input.pin);
  if (!pin.ok) return pin;

  const kid = await persistOp(() =>
    ports.members.addKid({
      familyId: ctx.familyId,
      displayName: displayName.value,
      pin: pin.value,
    }),
  );
  if (!kid.ok) return kid;
  return ok(kid.value);
}

/**
 * List the acting family's members — parents and kids (design §8.1, §8.3). Any
 * family member may call it; the repo is scoped to `ctx.familyId`.
 */
export async function listMembers(
  ports: Ports,
  ctx: RequestContext,
): Promise<Result<Member[]>> {
  const members = await persistOp(() => ports.members.listMembers(ctx.familyId));
  if (!members.ok) return members;
  return ok(members.value);
}

/**
 * Verify a kid's PIN and yield the kid so the caller can adopt it as the active
 * profile (design §3.1). Any family member may call it. Unknown/cross-family/
 * non-kid members and wrong PINs all return `bad_pin` — no existence leak, and
 * no kid token is minted (the PIN is an app-level gate, not a security boundary).
 */
export async function verifyKidPin(
  ports: Ports,
  ctx: RequestContext,
  input: VerifyKidPinInput,
): Promise<Result<Member>> {
  const kid = await persistOp(() =>
    ports.members.verifyKidPin(ctx.familyId, input.memberId, input.pin),
  );
  if (!kid.ok) return kid;
  if (!kid.value) return err({ code: "bad_pin" });
  return ok(kid.value);
}
