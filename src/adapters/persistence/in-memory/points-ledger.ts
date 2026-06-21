import type { LedgerEntry } from "@/domain/points/types";
import type { FamilyId, MemberId, SubmissionId } from "@/domain/shared/ids";
import type { PointsLedger } from "@/ports/repositories";

/**
 * In-memory append-only points ledger. Keyed by `submissionId` so a replayed
 * approve never double-credits — the idempotency guarantee behind "+points
 * once" (design §6, §7.1). A member's total is the sum of their entries.
 */
export function inMemoryPointsLedger(): PointsLedger {
  const bySubmission = new Map<SubmissionId, LedgerEntry>();

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
