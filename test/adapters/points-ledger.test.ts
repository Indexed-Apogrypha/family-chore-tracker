import { describe, expect, it } from "vitest";

import { inMemoryPointsLedger } from "@/adapters/persistence/in-memory/points-ledger";
import type { LedgerEntry } from "@/domain/points/types";
import { familyId, memberId, submissionId } from "@/domain/shared/ids";

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  familyId: familyId("f1"),
  memberId: memberId("m1"),
  submissionId: submissionId("s1"),
  delta: 5,
  reason: "chore_approved",
  createdAt: "2026-06-21T09:00:00.000Z",
  ...over,
});

describe("inMemoryPointsLedger", () => {
  it("totalFor sums a member's credits", async () => {
    const ledger = inMemoryPointsLedger();
    await ledger.append(entry({ submissionId: submissionId("s1"), delta: 5 }));
    await ledger.append(entry({ submissionId: submissionId("s2"), delta: 3 }));
    expect(await ledger.totalFor(memberId("m1"))).toBe(8);
  });

  it("is idempotent on submissionId — a replayed credit never double-counts (§7.1)", async () => {
    const ledger = inMemoryPointsLedger();
    await ledger.append(entry({ submissionId: submissionId("s1"), delta: 5 }));
    await ledger.append(entry({ submissionId: submissionId("s1"), delta: 5 }));
    expect(await ledger.totalFor(memberId("m1"))).toBe(5);
  });

  it("isolates totals per member and is zero for the unknown", async () => {
    const ledger = inMemoryPointsLedger();
    await ledger.append(
      entry({ memberId: memberId("m1"), submissionId: submissionId("s1"), delta: 5 }),
    );
    await ledger.append(
      entry({ memberId: memberId("m2"), submissionId: submissionId("s2"), delta: 9 }),
    );
    expect(await ledger.totalFor(memberId("m1"))).toBe(5);
    expect(await ledger.totalFor(memberId("m2"))).toBe(9);
    expect(await ledger.totalFor(memberId("m3"))).toBe(0);
  });
});
