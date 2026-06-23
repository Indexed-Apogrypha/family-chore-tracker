import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/composition/database.types";
import type { Family, Member, MemberKind } from "@/domain/family/types";
import { familyId, memberId } from "@/domain/shared/ids";
import type { MemberRepository } from "@/ports/repositories";

const SCRYPT_KEYLEN = 64;

/**
 * PIN hashing with node's built-in `scrypt` — no native dependency (Windows /
 * Vercel safe). Stored as `saltHex:hashHex`. The PIN is an app-level gate, not a
 * security boundary (§3.1); the contract only asserts hash ≠ plaintext + verify.
 */
function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPin(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Derived from the generated schema (not hand-written) so a column rename/drift
// in the `members` table fails `typecheck` rather than being masked by a cast.
type MemberRow = Database["public"]["Tables"]["members"]["Row"];

function toMember(row: MemberRow): Member {
  return {
    id: memberId(row.id),
    familyId: familyId(row.family_id),
    // `kind` is a check-constrained text column; the generated type widens it to
    // `string`, so narrow back to the domain union here (the one allowed cast).
    kind: row.kind as MemberKind,
    displayName: row.display_name,
    ...(row.auth_user_id !== null ? { authUserId: row.auth_user_id } : {}),
    ...(row.pin_hash !== null ? { pinHash: row.pin_hash } : {}),
  };
}

/**
 * Supabase-backed `MemberRepository` (design §5, §9). Uses the server-only
 * service-role client and scopes **every** query by `familyId`, mirroring the
 * in-memory adapter — the shared contract proves the two interchangeable. RLS is
 * defense-in-depth; service-role bypasses it, so app-layer scoping is the guard.
 *
 * Takes the typed `SupabaseClient<Database>` (like the chores/submissions/points
 * adapters) so queries are checked against the generated schema (#119).
 */
export function supabaseMemberRepository(
  client: SupabaseClient<Database>,
): MemberRepository {
  return {
    async createFamily({ name, founderDisplayName, authUserId }) {
      const { data, error } = await client
        .rpc("create_family", {
          p_name: name,
          p_founder_name: founderDisplayName,
          p_auth_user_id: authUserId ?? undefined,
        })
        .single();
      if (error) throw error;
      const fid = familyId(data.family_id);
      const founderMemberId = memberId(data.founder_id);
      const family: Family = {
        id: fid,
        name: data.family_name,
        createdBy: founderMemberId,
      };
      const founder: Member = {
        id: founderMemberId,
        familyId: fid,
        kind: "parent",
        displayName: founderDisplayName,
        ...(authUserId !== undefined ? { authUserId } : {}),
      };
      return { family, founder };
    },

    async getFamily(id) {
      const { data, error } = await client
        .from("families")
        .select("id, name, created_by")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: familyId(data.id),
        name: data.name,
        createdBy: memberId(data.created_by),
      };
    },

    async addKid({ familyId: family, displayName, pin }) {
      const { data, error } = await client
        .from("members")
        .insert({
          family_id: family,
          kind: "kid",
          display_name: displayName,
          pin_hash: hashPin(pin),
        })
        .select("*")
        .single();
      if (error) throw error;
      return toMember(data);
    },

    async addMember(input) {
      const { data, error } = await client
        .from("members")
        .insert({
          family_id: input.familyId,
          kind: input.kind,
          display_name: input.displayName,
          auth_user_id: input.authUserId ?? null,
          pin_hash: input.pinHash ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return toMember(data);
    },

    async verifyKidPin(family, id, pin) {
      const { data, error } = await client
        .from("members")
        .select("*")
        .eq("id", id)
        .eq("family_id", family)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      if (data.kind !== "kid" || data.pin_hash === null) return null;
      return verifyPin(pin, data.pin_hash) ? toMember(data) : null;
    },

    async getMember(family, id) {
      const { data, error } = await client
        .from("members")
        .select("*")
        .eq("id", id)
        .eq("family_id", family)
        .maybeSingle();
      if (error) throw error;
      return data ? toMember(data) : null;
    },

    async listMembers(family) {
      const { data, error } = await client
        .from("members")
        .select("*")
        .eq("family_id", family);
      if (error) throw error;
      return (data ?? []).map(toMember);
    },

    async findByAuthUserId(authUserId) {
      const { data, error } = await client
        .from("members")
        .select("*")
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      if (error) throw error;
      return data ? toMember(data) : null;
    },
  };
}
