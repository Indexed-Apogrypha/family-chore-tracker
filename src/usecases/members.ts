import type { Member } from "@/domain/family/types";
import { ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import type { RequestContext } from "@/ports/context";

import { requireParent } from "./authz";
import { requireName, requirePin } from "./validation";

export interface AddKidInput {
  displayName: string;
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

  const kid = await ports.members.addKid({
    familyId: ctx.familyId,
    displayName: displayName.value,
    pin: pin.value,
  });
  return ok(kid);
}

/**
 * List the acting family's members — parents and kids (design §8.1, §8.3). Any
 * family member may call it; the repo is scoped to `ctx.familyId`.
 */
export async function listMembers(
  ports: Ports,
  ctx: RequestContext,
): Promise<Result<Member[]>> {
  const members = await ports.members.listMembers(ctx.familyId);
  return ok(members);
}
