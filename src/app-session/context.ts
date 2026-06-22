import type { Member } from "@/domain/family/types";
import type { Actor, RequestContext } from "@/ports/context";

/**
 * Bind a loaded member into the request context the session edge runs on
 * (design §4.2, §8.3): the parent founder after `createFamily`, or the active
 * kid after `verifyKidPin`. The actor kind mirrors the member's kind — identity
 * is proven at the edge, so this just packages it for capability checks.
 */
export function memberContext(member: Member): RequestContext {
  const actor: Actor =
    member.kind === "parent"
      ? { kind: "parent", memberId: member.id }
      : { kind: "kid", memberId: member.id };
  return { familyId: member.familyId, actor };
}
