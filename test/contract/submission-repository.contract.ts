import { describe, expect, it } from "vitest";

import type { ChoreInstance } from "@/domain/chore/types";
import { familyId, submissionId } from "@/domain/shared/ids";
import type { FamilyId, MemberId, SubmissionId } from "@/domain/shared/ids";
import type { Verdict } from "@/ports/judge";

import { type RepoHarness, seedFamilyAndKid } from "./harness";

const DUE = "2026-06-21";
const VERDICT: Verdict = {
  pass: true,
  confidence: 0.8,
  reasoning: "looks clean",
  model: "fake",
};

/**
 * The SubmissionRepository contract (design §5, §7, §10). An instance has many
 * submissions over its life (1:N); the verdict is recorded but advisory.
 *
 * FK-valid: seeds a real family + member + chore instance so submitted_by /
 * instance_id / family_id all resolve — the same suite runs against in-memory
 * and Supabase (#117).
 */
export function runSubmissionRepositoryContract(
  label: string,
  makeHarness: () => RepoHarness,
): void {
  describe(`SubmissionRepository contract — ${label}`, () => {
    const setup = async () => {
      const h = makeHarness();
      const { family, parent, kid } = await seedFamilyAndKid(h);
      const instance = await h.chores.createOneOff({
        familyId: family,
        title: "Sweep",
        points: 5,
        assignedMemberId: kid,
        dueDate: DUE,
      });
      return { h, family, parent, kid, instance };
    };

    const input = (
      family: FamilyId,
      instance: ChoreInstance,
      kid: MemberId,
      id: SubmissionId,
    ) => ({
      id,
      familyId: family,
      instanceId: instance.id,
      submittedBy: kid,
      photoPath: `${family}/${instance.id}/${id}.jpg`,
    });

    it("creates a submission in the evaluating state and reads it back", async () => {
      const { h, family, kid, instance } = await setup();
      const id = submissionId(crypto.randomUUID());
      const sub = await h.submissions.create(input(family, instance, kid, id));
      expect(sub.id).toBe(id); // honors the caller's id
      expect(sub.status).toBe("evaluating");
      expect(sub.instanceId).toBe(instance.id);
      expect(await h.submissions.get(family, sub.id)).toEqual(sub);
    });

    it("records an advisory verdict and advances status", async () => {
      const { h, family, kid, instance } = await setup();
      const id = submissionId(crypto.randomUUID());
      await h.submissions.create(input(family, instance, kid, id));
      await h.submissions.recordVerdict(family, id, VERDICT);
      await h.submissions.setStatus(family, id, "pending_review");
      const got = await h.submissions.get(family, id);
      expect(got?.aiVerdict).toEqual(VERDICT);
      expect(got?.status).toBe("pending_review");
    });

    it("recordVerdictAndAdvance advances BOTH the submission and its instance atomically (#112)", async () => {
      const { h, family, kid, instance } = await setup();
      const id = submissionId(crypto.randomUUID());
      await h.submissions.create(input(family, instance, kid, id));
      await h.submissions.recordVerdictAndAdvance(family, id, instance.id, VERDICT);
      const got = await h.submissions.get(family, id);
      expect(got?.aiVerdict).toEqual(VERDICT);
      expect(got?.status).toBe("pending_review");
      // The instance moved in the same op — the cross-aggregate guarantee.
      expect((await h.chores.getInstance(family, instance.id))?.status).toBe(
        "pending_review",
      );
    });

    it("supports many submissions per instance and lists by status (review queue)", async () => {
      const { h, family, kid, instance } = await setup();
      const a = await h.submissions.create(
        input(family, instance, kid, submissionId(crypto.randomUUID())),
      );
      const b = await h.submissions.create(
        input(family, instance, kid, submissionId(crypto.randomUUID())),
      );
      await h.submissions.setStatus(family, a.id, "pending_review");
      await h.submissions.setStatus(family, b.id, "rejected");
      const pending = await h.submissions.listByStatus(family, "pending_review");
      expect(pending.map((s) => s.id)).toEqual([a.id]);
    });

    it("records a parent's authoritative decision (status + decidedBy + decidedAt)", async () => {
      const { h, family, parent, kid, instance } = await setup();
      const id = submissionId(crypto.randomUUID());
      await h.submissions.create(input(family, instance, kid, id));
      const decidedAt = "2026-06-21T10:00:00.000Z";
      await h.submissions.recordDecision(family, id, {
        status: "approved",
        decidedBy: parent,
        decidedAt,
      });
      const got = await h.submissions.get(family, id);
      expect(got?.status).toBe("approved");
      expect(got?.decidedBy).toBe(parent);
      expect(got?.decidedAt).toBe(decidedAt);
    });

    it("recordDecisionAndSettle approves submission + instance and credits points atomically (#136)", async () => {
      const { h, family, parent, kid, instance } = await setup();
      const id = submissionId(crypto.randomUUID());
      await h.submissions.create(input(family, instance, kid, id));
      await h.submissions.setStatus(family, id, "pending_review");
      const decidedAt = "2026-06-21T10:00:00.000Z";
      await h.submissions.recordDecisionAndSettle(
        family,
        id,
        instance.id,
        { status: "approved", decidedBy: parent, decidedAt },
        { memberId: kid, delta: instance.points },
      );
      const got = await h.submissions.get(family, id);
      expect(got?.status).toBe("approved");
      expect(got?.decidedBy).toBe(parent);
      expect(got?.decidedAt).toBe(decidedAt);
      // Instance and credit moved in the same op — the cross-aggregate guarantee.
      expect((await h.chores.getInstance(family, instance.id))?.status).toBe(
        "approved",
      );
      expect(await h.points.totalFor(family, kid)).toBe(instance.points);

      // A replayed settle is idempotent on submissionId — never double-credits.
      await h.submissions.recordDecisionAndSettle(
        family,
        id,
        instance.id,
        { status: "approved", decidedBy: parent, decidedAt },
        { memberId: kid, delta: instance.points },
      );
      expect(await h.points.totalFor(family, kid)).toBe(instance.points);
    });

    it("recordDecisionAndSettle on reject recycles the instance to todo and credits nothing (§7.1)", async () => {
      const { h, family, parent, kid, instance } = await setup();
      const id = submissionId(crypto.randomUUID());
      await h.submissions.create(input(family, instance, kid, id));
      await h.submissions.setStatus(family, id, "pending_review");
      await h.submissions.recordDecisionAndSettle(
        family,
        id,
        instance.id,
        {
          status: "rejected",
          decidedBy: parent,
          decidedAt: "2026-06-21T10:00:00.000Z",
        },
        null,
      );
      expect((await h.submissions.get(family, id))?.status).toBe("rejected");
      expect((await h.chores.getInstance(family, instance.id))?.status).toBe(
        "todo",
      );
      expect(await h.points.totalFor(family, kid)).toBe(0);
    });

    it("scopes by family: another family's submission resolves to null (§9)", async () => {
      const { h, family, kid, instance } = await setup();
      const id = submissionId(crypto.randomUUID());
      await h.submissions.create(input(family, instance, kid, id));
      expect(await h.submissions.get(familyId("other-family"), id)).toBeNull();
    });
  });
}
