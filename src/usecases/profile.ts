import type { Member } from "@/domain/family/types";
import type { MemberId } from "@/domain/shared/ids";
import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import type { RequestContext } from "@/ports/context";

import { persistOp, requireFamilyMember } from "./infra";

export interface SwitchProfileInput {
  memberId: MemberId;
  /** Required when switching to a kid; ignored for the parent (§3.1). */
  pin?: string;
}

/**
 * Switch the active profile on a shared device (design §3.1). Any family member
 * may switch; the family is anchored by `ctx.familyId`, so cross-family or
 * unknown ids resolve to `not_found`. Selecting the **parent** needs no PIN — the
 * device already holds the authenticated parent session, and the active profile
 * is a UI lens, not a security boundary (an accepted v1 limitation). Selecting a
 * **kid** requires the PIN: a wrong or missing PIN returns `bad_pin`, and no kid
 * token is minted. The caller adopts the returned member as `ctx.actor`.
 */
export async function switchProfile(
  ports: Ports,
  ctx: RequestContext,
  input: SwitchProfileInput,
): Promise<Result<Member>> {
  const memberR = await requireFamilyMember(ports, ctx.familyId, input.memberId);
  if (!memberR.ok) return memberR;
  if (memberR.value.kind === "parent") return ok(memberR.value);

  const kidR = await persistOp(() =>
    ports.members.verifyKidPin(ctx.familyId, input.memberId, input.pin ?? ""),
  );
  if (!kidR.ok) return kidR;
  if (!kidR.value) return err({ code: "bad_pin" });
  return ok(kidR.value);
}
