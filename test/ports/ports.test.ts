import { describe, expect, expectTypeOf, it } from "vitest";

import type { ChoreInstance } from "@/domain/chore/types";
import type { Member } from "@/domain/family/types";
import type { LedgerEntry } from "@/domain/points/types";
import {
  familyId,
  instanceId,
  memberId,
  submissionId,
} from "@/domain/shared/ids";
import type { Submission } from "@/domain/submission/types";
import type {
  ChoreRepository,
  Clock,
  JudgePort,
  PhotoStorage,
  PointsLedger,
  RequestContext,
} from "@/ports";

// #43 is a types-only issue: the four seams + request context + the entity
// vocabulary they traffic in. The real behavioral proof arrives with the
// in-memory adapters (#45) and contract suites (#48). Here we prove the
// interfaces are coherent and *implementable* — value-shaped ports get minimal
// stubs exercised at runtime; the rest is enforced by the typecheck gate.

describe("port seams", () => {
  it("Clock is implementable and returns ISO strings", () => {
    const clock: Clock = {
      today: () => "2026-06-21",
      now: () => "2026-06-21T09:00:00.000Z",
    };
    expect(clock.today()).toBe("2026-06-21");
    expect(clock.now()).toContain("T");
  });

  it("JudgePort yields a Verdict", async () => {
    const judge: JudgePort = {
      evaluate: async () => ({
        pass: true,
        confidence: 0.9,
        reasoning: "looks done",
        model: "stub",
      }),
    };
    const verdict = await judge.evaluate({ path: "p" }, { title: "Dishes" });
    expect(verdict.pass).toBe(true);
  });

  it("PhotoStorage round-trips a ref to a signed URL", async () => {
    const storage: PhotoStorage = {
      put: async () => ({ path: "f1/i1/s1.jpg" }),
      signedUrl: async (ref) => `https://signed.example/${ref.path}`,
    };
    const ref = await storage.put(new Uint8Array([1, 2, 3]), {
      familyId: familyId("f1"),
      instanceId: instanceId("i1"),
      submissionId: submissionId("s1"),
      contentType: "image/jpeg",
    });
    expect(await storage.signedUrl(ref)).toContain("f1/i1/s1.jpg");
  });

  it("RequestContext binds a family and an acting member (§8.3)", () => {
    const ctx: RequestContext = {
      familyId: familyId("f1"),
      actor: { kind: "kid", memberId: memberId("m1") },
    };
    expect(ctx.actor.kind).toBe("kid");
  });

  it("domain entities compose with branded ids and shared enums", () => {
    const member: Member = {
      id: memberId("m1"),
      familyId: familyId("f1"),
      kind: "parent",
      displayName: "Sam",
    };
    const instance: ChoreInstance = {
      id: instanceId("i1"),
      familyId: familyId("f1"),
      templateId: null,
      title: "Take out the trash",
      points: 5,
      assignedMemberId: memberId("m2"),
      dueDate: "2026-06-21",
      status: "todo",
    };
    const submission: Submission = {
      id: submissionId("s1"),
      familyId: familyId("f1"),
      instanceId: instanceId("i1"),
      submittedBy: memberId("m2"),
      photoPath: "f1/i1/s1.jpg",
      status: "evaluating",
    };
    const entry: LedgerEntry = {
      familyId: familyId("f1"),
      memberId: memberId("m2"),
      submissionId: submissionId("s1"),
      delta: 5,
      reason: "chore_approved",
      createdAt: "2026-06-21T09:00:00.000Z",
    };
    expect(member.kind).toBe("parent");
    expect(instance.templateId).toBeNull();
    expect(submission.status).toBe("evaluating");
    expect(entry.delta).toBe(5);
  });

  it("repository method shapes are well-formed (compile-time)", () => {
    expectTypeOf<
      ChoreRepository["upsertGeneratedInstance"]
    >().returns.resolves.toEqualTypeOf<ChoreInstance>();
    expectTypeOf<
      PointsLedger["totalFor"]
    >().returns.resolves.toEqualTypeOf<number>();
  });
});
