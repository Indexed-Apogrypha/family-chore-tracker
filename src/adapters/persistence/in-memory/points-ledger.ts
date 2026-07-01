import type { LedgerEntry } from "@/domain/points/types";
import type { FamilyId, MemberId } from "@/domain/shared/ids";
import type { PointsLedger } from "@/ports/repositories";

import { type InMemoryStore, createInMemoryStore } from "./store";

/**
 * In-memory append-only points ledger. Keyed by `submissionId` so a replayed
 * approve never double-credits — the idempotency guarantee behind "+points
 * once" (design §6, §7.1). A member's total is the sum of their entries.
 *
 * Shares the {@link InMemoryStore} with the submission repo so the atomic
 * `recordDecisionAndSettle` (§7.1, #136) credits the same ledger this repo
 * sums — the in-memory mirror of the Supabase adapter's transactional RPC.
 */
export function inMemoryPointsLedger(
  store: InMemoryStore = createInMemoryStore(),
): PointsLedger {
  const ledger = store.ledger;

  return {
    async append(entry: LedgerEntry) {
      if (ledger.has(entry.submissionId)) {
        return; // already credited for this submission — no-op
      }
      ledger.set(entry.submissionId, entry);
    },

    async totalFor(family: FamilyId, member: MemberId) {
      let total = 0;
      for (const entry of ledger.values()) {
        if (entry.familyId === family && entry.memberId === member) {
          total += entry.delta;
        }
      }
      return total;
    },

    async listFor(family: FamilyId, member: MemberId) {
      return [...ledger.values()]
        .filter((e) => e.familyId === family && e.memberId === member)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}
