import { describe, expect, it } from "vitest";

import {
  familyId,
  instanceId,
  memberId,
  submissionId,
} from "@/domain/shared/ids";
import type { MemberId } from "@/domain/shared/ids";
import type { Verdict } from "@/ports/judge";
import type { SubmissionRepository } from "@/ports/repositories";

// The caller mints the submission id (the photo path is keyed on it, §9), so
// `create` takes it explicitly rather than generating one. Distinct ids model
// the 1:N submissions-per-instance life.
const newSubmissionInput = (id = "s1") => ({
  id: submissionId(id),
  familyId: familyId("f1"),
  instanceId: instanceId("i1"),
  submittedBy: memberId("m1"),
  photoPath: `f1/i1/${id}.jpg`,
});

/**
 * The SubmissionRepository contract (design §5, §7, §10). An instance has many
 * submissions over its life (1:N); the verdict is recorded but advisory.
 */
export function runSubmissionRepositoryContract(
  label: string,
  makeRepo: () => SubmissionRepository,
): void {
  describe(`SubmissionRepository contract — ${label}`, () => {
    it("creates a submission in the evaluating state and reads it back", async () => {
      const repo = makeRepo();
      const sub = await repo.create(newSubmissionInput());
      expect(sub.id).toBe(submissionId("s1")); // honors the caller's id
      expect(sub.status).toBe("evaluating");
      expect(sub.instanceId).toBe(instanceId("i1"));
      expect(await repo.get(familyId("f1"), sub.id)).toEqual(sub);
    });

    it("records an advisory verdict and advances status", async () => {
      const repo = makeRepo();
      const sub = await repo.create(newSubmissionInput());
      const verdict: Verdict = {
        pass: true,
        confidence: 0.8,
        reasoning: "looks clean",
        model: "fake",
      };
      await repo.recordVerdict(familyId("f1"), sub.id, verdict);
      await repo.setStatus(familyId("f1"), sub.id, "pending_review");
      const got = await repo.get(familyId("f1"), sub.id);
      expect(got?.aiVerdict).toEqual(verdict);
      expect(got?.status).toBe("pending_review");
    });

    it("recordVerdictAndAdvance attaches the verdict and advances the submission (#112)", async () => {
      const repo = makeRepo();
      const sub = await repo.create(newSubmissionInput());
      const verdict: Verdict = {
        pass: true,
        confidence: 0.9,
        reasoning: "looks done",
        model: "fake",
      };
      await repo.recordVerdictAndAdvance(
        familyId("f1"),
        sub.id,
        instanceId("i1"),
        verdict,
      );
      const got = await repo.get(familyId("f1"), sub.id);
      expect(got?.aiVerdict).toEqual(verdict);
      expect(got?.status).toBe("pending_review");
    });

    it("supports many submissions per instance and lists by status (review queue)", async () => {
      const repo = makeRepo();
      const a = await repo.create(newSubmissionInput("a"));
      const b = await repo.create(newSubmissionInput("b"));
      await repo.setStatus(familyId("f1"), a.id, "pending_review");
      await repo.setStatus(familyId("f1"), b.id, "rejected");
      const pending = await repo.listByStatus(familyId("f1"), "pending_review");
      expect(pending.map((s) => s.id)).toEqual([a.id]);
    });

    it("records a parent's authoritative decision (status + decidedBy + decidedAt)", async () => {
      const repo = makeRepo();
      const sub = await repo.create(newSubmissionInput());
      const decidedBy: MemberId = memberId("parent-1");
      const decidedAt = "2026-06-21T10:00:00.000Z";
      await repo.recordDecision(familyId("f1"), sub.id, {
        status: "approved",
        decidedBy,
        decidedAt,
      });
      const got = await repo.get(familyId("f1"), sub.id);
      expect(got?.status).toBe("approved");
      expect(got?.decidedBy).toBe(decidedBy);
      expect(got?.decidedAt).toBe(decidedAt);
    });

    it("scopes by family: another family's submission resolves to null (§9)", async () => {
      const repo = makeRepo();
      const sub = await repo.create(newSubmissionInput());
      expect(await repo.get(familyId("other"), sub.id)).toBeNull();
    });
  });
}
