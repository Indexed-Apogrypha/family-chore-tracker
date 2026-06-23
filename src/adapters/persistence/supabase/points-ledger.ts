import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/composition/database.types";
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
  };
}
