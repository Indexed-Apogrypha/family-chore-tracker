import { describe, expect, it } from "vitest";

import { inMemorySubmissionRepository } from "@/adapters/persistence/in-memory/submissions";
import { familyId, instanceId, memberId } from "@/domain/shared/ids";
import type { Verdict } from "@/ports/judge";

const newSubmissionInput = () => ({
  familyId: familyId("f1"),
  instanceId: instanceId("i1"),
  submittedBy: memberId("m1"),
  photoPath: "f1/i1/s.jpg",
});

describe("inMemorySubmissionRepository", () => {
  it("creates a submission in the evaluating state and reads it back", async () => {
    const repo = inMemorySubmissionRepository();
    const sub = await repo.create(newSubmissionInput());
    expect(sub.status).toBe("evaluating");
    expect(sub.instanceId).toBe(instanceId("i1"));
    expect(await repo.get(familyId("f1"), sub.id)).toEqual(sub);
  });

  it("records an advisory verdict and advances status", async () => {
    const repo = inMemorySubmissionRepository();
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

  it("supports many submissions per instance and lists by status (review queue)", async () => {
    const repo = inMemorySubmissionRepository();
    const a = await repo.create(newSubmissionInput());
    const b = await repo.create(newSubmissionInput());
    await repo.setStatus(familyId("f1"), a.id, "pending_review");
    await repo.setStatus(familyId("f1"), b.id, "rejected");
    const pending = await repo.listByStatus(familyId("f1"), "pending_review");
    expect(pending.map((s) => s.id)).toEqual([a.id]);
  });

  it("scopes by family: another family's submission resolves to null", async () => {
    const repo = inMemorySubmissionRepository();
    const sub = await repo.create(newSubmissionInput());
    expect(await repo.get(familyId("other"), sub.id)).toBeNull();
  });
});
