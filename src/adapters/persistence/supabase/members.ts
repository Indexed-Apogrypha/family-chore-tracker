import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

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

interface MemberRow {
  id: string;
  family_id: string;
  kind: MemberKind;
  display_name: string;
  auth_user_id: string | null;
  pin_hash: string | null;
}

const MEMBER_COLS = "id, family_id, kind, display_name, auth_user_id, pin_hash";

function toMember(row: MemberRow): Member {
  return {
    id: memberId(row.id),
    familyId: familyId(row.family_id),
    kind: row.kind,
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
 */
export function supabaseMemberRepository(
  client: SupabaseClient,
): MemberRepository {
  return {
    async createFamily({ name, founderDisplayName, authUserId }) {
      const { data, error } = await client
        .rpc("create_family", {
          p_name: name,
          p_founder_name: founderDisplayName,
          p_auth_user_id: authUserId ?? null,
        })
        .single();
      if (error) throw error;
      const row = data as {
        family_id: string;
        family_name: string;
        founder_id: string;
      };
      const fid = familyId(row.family_id);
      const founderMemberId = memberId(row.founder_id);
      const family: Family = {
        id: fid,
        name: row.family_name,
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
      const row = data as { id: string; name: string; created_by: string };
      return {
        id: familyId(row.id),
        name: row.name,
        createdBy: memberId(row.created_by),
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
        .select(MEMBER_COLS)
        .single();
      if (error) throw error;
      return toMember(data as MemberRow);
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
        .select(MEMBER_COLS)
        .single();
      if (error) throw error;
      return toMember(data as MemberRow);
    },

    async verifyKidPin(family, id, pin) {
      const { data, error } = await client
        .from("members")
        .select(MEMBER_COLS)
        .eq("id", id)
        .eq("family_id", family)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as MemberRow;
      if (row.kind !== "kid" || row.pin_hash === null) return null;
      return verifyPin(pin, row.pin_hash) ? toMember(row) : null;
    },

    async getMember(family, id) {
      const { data, error } = await client
        .from("members")
        .select(MEMBER_COLS)
        .eq("id", id)
        .eq("family_id", family)
        .maybeSingle();
      if (error) throw error;
      return data ? toMember(data as MemberRow) : null;
    },

    async listMembers(family) {
      const { data, error } = await client
        .from("members")
        .select(MEMBER_COLS)
        .eq("family_id", family);
      if (error) throw error;
      return ((data ?? []) as MemberRow[]).map(toMember);
    },

    async findByAuthUserId(authUserId) {
      const { data, error } = await client
        .from("members")
        .select(MEMBER_COLS)
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      if (error) throw error;
      return data ? toMember(data as MemberRow) : null;
    },
  };
}
