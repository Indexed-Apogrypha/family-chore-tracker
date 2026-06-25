import type { Member } from "@/domain/family/types";
import type { MemberId } from "@/domain/shared/ids";
import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import type { RequestContext } from "@/ports/context";

/**
 * Resolve a member of the acting family, or `not_found` (design §8.3). The repo
 * is scoped to `ctx.familyId`, so a cross-family or unknown id resolves to
 * `null` — mirroring Supabase RLS — which this maps to the closed `not_found`
 * value. One shared place to turn an `assignedMemberId`/`memberId` into a
 * `Member`, so every use-case that needs one produces the identical refusal.
 */
export async function requireFamilyMember(
  ports: Ports,
  ctx: RequestContext,
  id: MemberId,
): Promise<Result<Member>> {
  const member = await ports.members.getMember(ctx.familyId, id);
  if (!member) {
    return err({ code: "not_found", entity: "member", id });
  }
  return ok(member);
}
