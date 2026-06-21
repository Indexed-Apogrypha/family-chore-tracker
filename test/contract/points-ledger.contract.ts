import { describe, expect, it } from "vitest";

import type { LedgerEntry } from "@/domain/points/types";
import { familyId, memberId, submissionId } from "@/domain/shared/ids";
import type { PointsLedger } from "@/ports/repositories";

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  familyId: familyId("f1"),
  memberId: memberId("m1"),
  submissionId: submissionId("s1"),
  delta: 5,
  reason: "chore_approved",
  createdAt: "2026-06-21T09:00:00.000Z",
  ...over,
});

/**
 * The PointsLedger contract (design §5, §6, §7.1, §10). The idempotency on
 * submissionId is the mechanism behind the "+points exactly once" guarantee.
 */
export function runPointsLedgerContract(
  label: string,
  makeLedger: () => PointsLedger,
): void {
  describe(`PointsLedger contract — ${label}`, () => {
    it("totalFor sums a member's credits", async () => {
      const ledger = makeLedger();
      await ledger.append(entry({ submissionId: submissionId("s1"), delta: 5 }));
      await ledger.append(entry({ submissionId: submissionId("s2"), delta: 3 }));
      expect(await ledger.totalFor(memberId("m1"))).toBe(8);
    });

    it("is idempotent on submissionId — a replayed credit never double-counts", async () => {
      const ledger = makeLedger();
      await ledger.append(entry({ submissionId: submissionId("s1"), delta: 5 }));
      await ledger.append(entry({ submissionId: submissionId("s1"), delta: 5 }));
      expect(await ledger.totalFor(memberId("m1"))).toBe(5);
    });

    it("isolates totals per member and is zero for the unknown", async () => {
      const ledger = makeLedger();
      await ledger.append(
        entry({
          memberId: memberId("m1"),
          submissionId: submissionId("s1"),
          delta: 5,
        }),
      );
      await ledger.append(
        entry({
          memberId: memberId("m2"),
          submissionId: submissionId("s2"),
          delta: 9,
        }),
      );
      expect(await ledger.totalFor(memberId("m1"))).toBe(5);
      expect(await ledger.totalFor(memberId("m2"))).toBe(9);
      expect(await ledger.totalFor(memberId("m3"))).toBe(0);
    });
  });
}
