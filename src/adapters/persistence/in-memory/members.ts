import type { Family, Member } from "@/domain/family/types";
import { familyId, memberId } from "@/domain/shared/ids";
import type { FamilyId, MemberId } from "@/domain/shared/ids";
import type { MemberRepository } from "@/ports/repositories";

/**
 * Deterministic stand-in for a real KDF — the keyless executable spec. The
 * Supabase adapter swaps in a real hash (§9); the contract checks behavior
 * (`pin_hash` ≠ plaintext, verify matches), never the format.
 */
const fakePinHash = (pin: string): string => `fake$${pin}`;

/**
 * In-memory members/families store — the executable spec for the Supabase
 * adapter. Reads are scoped by `familyId` so cross-family access resolves to
 * `null`, mirroring the per-family RLS of the real database (design §9).
 */
export function inMemoryMemberRepository(): MemberRepository {
  const families = new Map<FamilyId, Family>();
  const members = new Map<MemberId, Member>();

  return {
    async createFamily({ name, founderDisplayName, authUserId }) {
      const fid = familyId(crypto.randomUUID());
      const founderId = memberId(crypto.randomUUID());
      const founder: Member = {
        id: founderId,
        familyId: fid,
        kind: "parent",
        displayName: founderDisplayName,
        ...(authUserId !== undefined ? { authUserId } : {}),
      };
      const family: Family = { id: fid, name, createdBy: founderId };
      families.set(fid, family);
      members.set(founderId, founder);
      return { family, founder };
    },

    async getFamily(id) {
      return families.get(id) ?? null;
    },

    async addKid({ familyId: family, displayName, pin }) {
      const kid: Member = {
        id: memberId(crypto.randomUUID()),
        familyId: family,
        kind: "kid",
        displayName,
        pinHash: fakePinHash(pin),
      };
      members.set(kid.id, kid);
      return kid;
    },

    async addMember(input) {
      const member: Member = { ...input, id: memberId(crypto.randomUUID()) };
      members.set(member.id, member);
      return member;
    },

    async verifyKidPin(family, id, pin) {
      const member = members.get(id);
      if (!member || member.familyId !== family) return null;
      if (member.kind !== "kid" || member.pinHash === undefined) return null;
      return member.pinHash === fakePinHash(pin) ? member : null;
    },

    async getMember(family, id) {
      const member = members.get(id);
      return member && member.familyId === family ? member : null;
    },

    async listMembers(family) {
      return [...members.values()].filter((m) => m.familyId === family);
    },
  };
}
