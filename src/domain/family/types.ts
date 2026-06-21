import type { FamilyId, MemberId } from "@/domain/shared/ids";

/**
 * The family aggregate (design §6). A parent owns a family; kids are profiles
 * under it with no auth identity, gated by a hashed PIN (§3.1).
 */
export type MemberKind = "parent" | "kid";

export interface Family {
  id: FamilyId;
  name: string;
  /** The founding parent member. */
  createdBy: MemberId;
}

export interface Member {
  id: MemberId;
  familyId: FamilyId;
  kind: MemberKind;
  displayName: string;
  /** Parents are backed by a Supabase Auth user; kids are not. */
  authUserId?: string;
  /** Kids' hashed PIN for the app-level profile gate (§3.1, §9). */
  pinHash?: string;
}
