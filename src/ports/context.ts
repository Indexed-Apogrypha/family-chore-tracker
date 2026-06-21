import type { FamilyId, MemberId } from "@/domain/shared/ids";

/**
 * The request context (design §8.3). Identity is proven at the edge (a Supabase
 * session → parent; a PIN check → active kid); capability is then enforced
 * inside each use-case against `ctx.actor`.
 */
export type Actor =
  | { kind: "parent"; memberId: MemberId }
  | { kind: "kid"; memberId: MemberId };

export interface RequestContext {
  familyId: FamilyId;
  actor: Actor;
}
