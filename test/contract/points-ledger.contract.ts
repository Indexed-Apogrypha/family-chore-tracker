import { describe, expect, it } from "vitest";

import type { LedgerEntry } from "@/domain/points/types";
import { memberId, submissionId } from "@/domain/shared/ids";
import type { FamilyId, MemberId, SubmissionId } from "@/domain/shared/ids";

import { type RepoHarness, seedFamilyAndKid } from "./harness";

const DUE = "2026-06-21";

interface LedgerFamily {
  family: FamilyId;
  kid: MemberId;
  /** Add another kid to this family (a real, FK-valid member). */
  addKid: () => Promise<MemberId>;
  /** Create a real submission (the ledger's submission_id FK) and return its id. */
  mkSubmission: () => Promise<SubmissionId>;
  entry: (submission: SubmissionId, over?: Partial<LedgerEntry>) => LedgerEntry;
}

/**
 * The PointsLedger contract (design §5, §6, §7.1, §10). The idempotency on
 * submissionId is the mechanism behind the "+points exactly once" guarantee.
 *
 * FK-valid: a ledger row references a real `submission_id` (and member/family),
 * so the same suite runs against in-memory and Supabase (#117) where the FK is
 * enforced.
 */
export function runPointsLedgerContract(
  label: string,
  makeHarness: () => RepoHarness,
): void {
  describe(`PointsLedger contract — ${label}`, () => {
    // Seed an FK-valid family + kid + instance, returning makers for the real
    // submissions/members a ledger entry must reference. Call it twice (same
    // backend) for the cross-family scoping test.
    const seedLedgerFamily = async (h: RepoHarness): Promise<LedgerFamily> => {
      const { family, kid } = await seedFamilyAndKid(h);
      const instance = await h.chores.createOneOff({
        familyId: family,
        title: "Tidy",
        points: 5,
        assignedMemberId: kid,
        dueDate: DUE,
      });
      return {
        family,
        kid,
        addKid: async () =>
          (await h.members.addKid({ familyId: family, displayName: "Sib", pin: "9999" }))
            .id,
        mkSubmission: async () => {
          const id = submissionId(crypto.randomUUID());
          await h.submissions.create({
            id,
            familyId: family,
            instanceId: instance.id,
            submittedBy: kid,
            photoPath: `${family}/${instance.id}/${id}.jpg`,
          });
          return id;
        },
        entry: (submission, over = {}) => ({
          familyId: family,
          memberId: kid,
          submissionId: submission,
          delta: 5,
          reason: "chore_approved",
          createdAt: "2026-06-21T09:00:00.000Z",
          ...over,
        }),
      };
    };

    it("totalFor sums a member's credits", async () => {
      const h = makeHarness();
      const f = await seedLedgerFamily(h);
      await h.points.append(f.entry(await f.mkSubmission(), { delta: 5 }));
      await h.points.append(f.entry(await f.mkSubmission(), { delta: 3 }));
      expect(await h.points.totalFor(f.family, f.kid)).toBe(8);
    });

    it("is idempotent on submissionId — a replayed credit never double-counts", async () => {
      const h = makeHarness();
      const f = await seedLedgerFamily(h);
      const sub = await f.mkSubmission();
      await h.points.append(f.entry(sub, { delta: 5 }));
      await h.points.append(f.entry(sub, { delta: 5 }));
      expect(await h.points.totalFor(f.family, f.kid)).toBe(5);
    });

    it("isolates totals per member and is zero for the unknown", async () => {
      const h = makeHarness();
      const f = await seedLedgerFamily(h);
      const sib = await f.addKid();
      await h.points.append(f.entry(await f.mkSubmission(), { memberId: f.kid, delta: 5 }));
      await h.points.append(f.entry(await f.mkSubmission(), { memberId: sib, delta: 9 }));
      expect(await h.points.totalFor(f.family, f.kid)).toBe(5);
      expect(await h.points.totalFor(f.family, sib)).toBe(9);
      expect(await h.points.totalFor(f.family, memberId("no-such-member"))).toBe(0);
    });

    it("listFor returns the member's entries newest first — the history behind the total", async () => {
      const h = makeHarness();
      const f = await seedLedgerFamily(h);
      const older = await f.mkSubmission();
      const newer = await f.mkSubmission();
      await h.points.append(
        f.entry(older, { delta: 5, createdAt: "2026-06-21T09:00:00.000Z" }),
      );
      await h.points.append(
        f.entry(newer, { delta: 3, createdAt: "2026-06-22T09:00:00.000Z" }),
      );
      const history = await h.points.listFor(f.family, f.kid);
      expect(history.map((e) => e.submissionId)).toEqual([newer, older]);
      expect(history[0]).toEqual(
        f.entry(newer, { delta: 3, createdAt: "2026-06-22T09:00:00.000Z" }),
      );
    });

    it("listFor isolates by member and family (§9)", async () => {
      const h = makeHarness();
      const f1 = await seedLedgerFamily(h);
      const f2 = await seedLedgerFamily(h);
      const sib = await f1.addKid();
      await h.points.append(f1.entry(await f1.mkSubmission(), { delta: 5 }));
      await h.points.append(
        f1.entry(await f1.mkSubmission(), { memberId: sib, delta: 9 }),
      );
      await h.points.append(f2.entry(await f2.mkSubmission(), { delta: 7 }));
      expect(await h.points.listFor(f1.family, f1.kid)).toHaveLength(1);
      expect(await h.points.listFor(f1.family, sib)).toHaveLength(1);
      expect(
        await h.points.listFor(f1.family, memberId("no-such-member")),
      ).toEqual([]);
    });

    it("scopes totals by family: another family's entries never count (§9)", async () => {
      const h = makeHarness();
      const f1 = await seedLedgerFamily(h);
      const f2 = await seedLedgerFamily(h);
      await h.points.append(f1.entry(await f1.mkSubmission(), { delta: 5 }));
      await h.points.append(f2.entry(await f2.mkSubmission(), { delta: 9 }));
      expect(await h.points.totalFor(f1.family, f1.kid)).toBe(5);
      expect(await h.points.totalFor(f2.family, f2.kid)).toBe(9);
    });
  });
}
