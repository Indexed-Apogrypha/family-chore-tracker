import type { FamilyId, MemberId, SubmissionId } from "@/domain/shared/ids";
import type { IsoInstant } from "@/ports/clock";

/**
 * An append-only points ledger entry (design §6). A member's total is the sum
 * of their entries — there is no mutable balance.
 *
 * v1 note: `delta` is always positive and `reason` is `chore_approved`. Negative
 * deltas / other reasons are the seam for future redemption, deliberately left open.
 */
export interface LedgerEntry {
  familyId: FamilyId;
  memberId: MemberId;
  /** The approved submission that earned these points; unique in the ledger. */
  submissionId: SubmissionId;
  delta: number;
  reason: "chore_approved";
  createdAt: IsoInstant;
}
