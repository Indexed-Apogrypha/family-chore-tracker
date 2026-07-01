import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/composition/database.types";
import { familyId, memberId, submissionId } from "@/domain/shared/ids";
import type { PointsLedger } from "@/ports/repositories";

/** A duplicate `submission_id` means this submission was already credited. */
const UNIQUE_VIOLATION = "23505";

/**
 * Supabase-backed `PointsLedger` (design §5, §6, §7.1). Append-only; a member's
 * total is the sum of their entries (no mutable balance). Idempotent on
 * `submission_id` via the unique constraint — a replayed credit raises 23505 and
 * is a no-op, preserving "+points exactly once". Family-scoped.
 */
export function supabasePointsLedger(
  client: SupabaseClient<Database>,
): PointsLedger {
  return {
    async append(entry) {
      const { error } = await client.from("points_ledger").insert({
        family_id: entry.familyId,
        member_id: entry.memberId,
        submission_id: entry.submissionId,
        delta: entry.delta,
        reason: entry.reason,
        created_at: entry.createdAt,
      });
      if (error && error.code !== UNIQUE_VIOLATION) throw error;
    },

    async totalFor(family, member) {
      const { data, error } = await client
        .from("points_ledger")
        .select("delta")
        .eq("family_id", family)
        .eq("member_id", member);
      if (error) throw error;
      return data.reduce((sum, row) => sum + row.delta, 0);
    },

    async listFor(family, member) {
      const { data, error } = await client
        .from("points_ledger")
        .select("*")
        .eq("family_id", family)
        .eq("member_id", member)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((row) => ({
        familyId: familyId(row.family_id),
        memberId: memberId(row.member_id),
        submissionId: submissionId(row.submission_id),
        delta: row.delta,
        reason: "chore_approved" as const,
        // Canonicalize timestamptz (`…+00:00`) to the app's ISO instant (`…Z`),
        // matching the in-memory adapter and the clock (#117).
        createdAt: new Date(row.created_at).toISOString(),
      }));
    },
  };
}
