import { describe, expect, it } from "vitest";

import { familyId } from "@/domain/shared/ids";
import type { MemberRepository } from "@/ports/repositories";

/**
 * The MemberRepository contract (design §5, §10). The in-memory adapter is the
 * executable spec; the Supabase adapter must pass the same suite (wired in M1).
 */
export function runMemberRepositoryContract(
  label: string,
  makeRepo: () => MemberRepository,
): void {
  describe(`MemberRepository contract — ${label}`, () => {
    it("createFamily creates a family and its founding parent, linked both ways", async () => {
      const repo = makeRepo();
      const { family, founder } = await repo.createFamily({
        name: "The Harpers",
        founderDisplayName: "Sam",
      });
      expect(family.name).toBe("The Harpers");
      expect(founder.kind).toBe("parent");
      expect(founder.familyId).toBe(family.id);
      expect(family.createdBy).toBe(founder.id);
    });

    it("getFamily returns the created family and null for unknown ids", async () => {
      const repo = makeRepo();
      const { family } = await repo.createFamily({
        name: "F",
        founderDisplayName: "P",
      });
      expect(await repo.getFamily(family.id)).toEqual(family);
      expect(await repo.getFamily(familyId("nope"))).toBeNull();
    });

    it("addMember adds a kid that listMembers then returns", async () => {
      const repo = makeRepo();
      const { family, founder } = await repo.createFamily({
        name: "F",
        founderDisplayName: "P",
      });
      const kid = await repo.addMember({
        familyId: family.id,
        kind: "kid",
        displayName: "Rae",
        pinHash: "hashed",
      });
      expect(kid.kind).toBe("kid");
      const members = await repo.listMembers(family.id);
      expect(members.map((m) => m.id).sort()).toEqual(
        [founder.id, kid.id].sort(),
      );
    });

    it("scopes by family: another family's member resolves to null (§9)", async () => {
      const repo = makeRepo();
      const a = await repo.createFamily({ name: "A", founderDisplayName: "Pa" });
      const b = await repo.createFamily({ name: "B", founderDisplayName: "Pb" });
      expect(await repo.getMember(a.family.id, a.founder.id)).toEqual(a.founder);
      expect(await repo.getMember(b.family.id, a.founder.id)).toBeNull();
    });
  });
}
