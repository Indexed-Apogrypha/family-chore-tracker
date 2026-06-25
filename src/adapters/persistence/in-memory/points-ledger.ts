import type { LedgerEntry } from "@/domain/points/types";
import type { FamilyId, MemberId } from "@/domain/shared/ids";
import type { PointsLedger } from "@/ports/repositories";

import { type InMemoryStore, createInMemoryStore } from "./store";

/**
 * In-memory append-only points ledger. Keyed by `submissionId` so a replayed
 * approve never double-credits — the idempotency guarantee behind "+points
 * once" (design §6, §7.1). A member's total is the sum of their entries.
 *
 * Shares the {@link InMemoryStore} with the submission repo so the parent's
 * decision can credit points together with the submission + instance status in
 * one synchronous step (`recordDecisionAndAdvance`, §7.1) — the in-memory mirror
 * of the Supabase adapter's single transactional RPC. Defaults to a fresh store
 * so the per-seam contract can still build it standalone.
 */
export function inMemoryPointsLedger(
  store: InMemoryStore = createInMemoryStore(),
): PointsLedger {
  const bySubmission = store.ledger;

  return {
    async append(entry: LedgerEntry) {
      if (bySubmission.has(entry.submissionId)) {
        return; // already credited for this submission — no-op
      }
      bySubmission.set(entry.submissionId, entry);
    },

    async totalFor(family: FamilyId, member: MemberId) {
      let total = 0;
      for (const entry of bySubmission.values()) {
        if (entry.familyId === family && entry.memberId === member) {
          total += entry.delta;
        }
      }
      return total;
    },
  };
}
