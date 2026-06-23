import type { FamilyId, MemberId } from "@/domain/shared/ids";
import type {
  ChoreRepository,
  MemberRepository,
  PointsLedger,
  SubmissionRepository,
} from "@/ports/repositories";

/**
 * The repos a chore/submission/points contract needs to build **FK-valid** data,
 * all over ONE backend (one in-memory store, or one Supabase client). The member
 * repo seeds a real family + members so every foreign key resolves — the reason
 * these contracts can run verbatim against Supabase, not just in-memory (#117).
 */
export interface RepoHarness {
  members: MemberRepository;
  chores: ChoreRepository;
  submissions: SubmissionRepository;
  points: PointsLedger;
}

export interface SeededFamily {
  family: FamilyId;
  parent: MemberId;
  kid: MemberId;
}

/** Seed a real family + a kid via the harness; returns FK-valid ids. */
export async function seedFamilyAndKid(h: RepoHarness): Promise<SeededFamily> {
  const { family, founder } = await h.members.createFamily({
    name: "Fam",
    founderDisplayName: "Parent",
  });
  const kid = await h.members.addKid({
    familyId: family.id,
    displayName: "Rae",
    pin: "1234",
  });
  return { family: family.id, parent: founder.id, kid: kid.id };
}
