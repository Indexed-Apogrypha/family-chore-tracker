import type { MemberId } from "@/domain/shared/ids";
import { ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import type { RequestContext } from "@/ports/context";

import { requireFamilyMember } from "./resolve";

export interface PointsTotalInput {
  memberId: MemberId;
}

/**
 * A member's running points total (design §8.1) — the sum of their approved-chore
 * ledger credits (there is no mutable balance, §6). Any family member may read it
 * (parent or kid); family-scoped, so an unknown or cross-family member resolves
 * to `not_found`, never leaking another family's total (§9).
 */
export async function pointsTotal(
  ports: Ports,
  ctx: RequestContext,
  input: PointsTotalInput,
): Promise<Result<number>> {
  const member = await requireFamilyMember(ports, ctx, input.memberId);
  if (!member.ok) return member;
  return ok(await ports.points.totalFor(ctx.familyId, input.memberId));
}
