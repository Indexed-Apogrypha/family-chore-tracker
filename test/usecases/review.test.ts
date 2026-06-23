import { describe, expect, it } from "vitest";

import { memberContext } from "@/app-session/context";
import { submissionId } from "@/domain/shared/ids";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import type { JudgePort } from "@/ports/judge";
import { createOneOff } from "@/usecases/chores";
import { createFamily } from "@/usecases/family";
import { addKid } from "@/usecases/members";
import { decide, getReviewQueue } from "@/usecases/review";
import { submitPhoto } from "@/usecases/submission";

import { inMemoryPorts } from "./harness";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

const PHOTO = new Uint8Array([1, 2, 3]);

/** Seed a family + kid + a kid-owned instance with one submission in pending_review. */
async function seedPendingReview(ports: Ports = inMemoryPorts()) {
  const { founder } = unwrap(
    await createFamily(ports, { name: "Fam", founderDisplayName: "Parent" }),
  );
  const parentCtx = memberContext(founder);
  const kid = unwrap(
    await addKid(ports, parentCtx, { displayName: "Rae", pin: "1234" }),
  );
  const kidCtx = memberContext(kid);
  const instance = unwrap(
    await createOneOff(ports, parentCtx, {
      title: "Sweep the floor",
      points: 5,
      assignedMemberId: kid.id,
      dueDate: "2026-06-21",
    }),
  );
  const submission = unwrap(
    await submitPhoto(ports, kidCtx, {
      instanceId: instance.id,
      bytes: PHOTO,
      contentType: "image/jpeg",
    }),
  );
  return { ports, parentCtx, kid, kidCtx, instance, submission };
}

describe("getReviewQueue (parent-only, §8.1)", () => {
  it("returns pending_review submissions with verdict + signed photo URL", async () => {
    const { ports, parentCtx, submission } = await seedPendingReview();

    const queue = unwrap(await getReviewQueue(ports, parentCtx));

    expect(queue).toHaveLength(1);
    expect(queue[0].submission.id).toBe(submission.id);
    expect(queue[0].submission.status).toBe("pending_review");
    expect(queue[0].submission.aiVerdict).toBeDefined();
    expect(queue[0].photoUrl.length).toBeGreaterThan(0);
  });

  it("is parent-only — a kid gets forbidden", async () => {
    const { ports, kidCtx } = await seedPendingReview();

    const result = await getReviewQueue(ports, kidCtx);

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "forbidden") {
      expect(result.error.need).toBe("parent");
    } else {
      throw new Error("expected forbidden");
    }
  });

  it("scopes to the family: another family's pending submission is invisible (§9)", async () => {
    const a = await seedPendingReview();
    const b = await seedPendingReview(a.ports); // second family on shared ports

    const queueA = unwrap(await getReviewQueue(a.ports, a.parentCtx));
    expect(queueA.map((i) => i.submission.id)).toEqual([a.submission.id]);
    expect(queueA.map((i) => i.submission.id)).not.toContain(b.submission.id);
  });

  it("returns an empty queue when nothing is pending", async () => {
    const ports = inMemoryPorts();
    const { founder } = unwrap(
      await createFamily(ports, { name: "Empty", founderDisplayName: "P" }),
    );
    expect(unwrap(await getReviewQueue(ports, memberContext(founder)))).toEqual([]);
  });
});

describe("decide (parent-only, authoritative, §7.1)", () => {
  it("approve: lands approved, credits the kid the instance points once, records the decider", async () => {
    const { ports, parentCtx, kid, instance, submission } = await seedPendingReview();

    const decided = unwrap(
      await decide(ports, parentCtx, { submissionId: submission.id, decision: "approve" }),
    );

    expect(decided.status).toBe("approved");
    expect(decided.decidedBy).toBe(parentCtx.actor.memberId);
    expect(decided.decidedAt).toBeDefined();
    const inst = await ports.chores.getInstance(instance.familyId, instance.id);
    expect(inst?.status).toBe("approved");
    expect(await ports.points.totalFor(instance.familyId, kid.id)).toBe(instance.points);
  });

  it("reject: submission terminal rejected, instance recycles to todo, no points", async () => {
    const { ports, parentCtx, kid, instance, submission } = await seedPendingReview();

    const decided = unwrap(
      await decide(ports, parentCtx, { submissionId: submission.id, decision: "reject" }),
    );

    expect(decided.status).toBe("rejected");
    const inst = await ports.chores.getInstance(instance.familyId, instance.id);
    expect(inst?.status).toBe("todo");
    expect(await ports.points.totalFor(instance.familyId, kid.id)).toBe(0);
  });

  it("deciding an already-decided submission is an invalid_transition (credit stays once)", async () => {
    const { ports, parentCtx, kid, instance, submission } = await seedPendingReview();
    unwrap(await decide(ports, parentCtx, { submissionId: submission.id, decision: "approve" }));

    const again = await decide(ports, parentCtx, {
      submissionId: submission.id,
      decision: "approve",
    });

    expect(again.ok).toBe(false);
    if (!again.ok && again.error.code === "invalid_transition") {
      expect(again.error.from).toBe("approved");
    } else {
      throw new Error("expected invalid_transition");
    }
    expect(await ports.points.totalFor(instance.familyId, kid.id)).toBe(instance.points);
  });

  it("is parent-only — a kid gets forbidden", async () => {
    const { ports, kidCtx, submission } = await seedPendingReview();
    const result = await decide(ports, kidCtx, {
      submissionId: submission.id,
      decision: "approve",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("forbidden");
  });

  it("resolves an unknown submission to not_found", async () => {
    const { ports, parentCtx } = await seedPendingReview();
    const result = await decide(ports, parentCtx, {
      submissionId: submissionId("nope"),
      decision: "approve",
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "not_found") {
      expect(result.error.entity).toBe("submission");
    } else {
      throw new Error("expected not_found");
    }
  });

  it("a parent may override a failing AI verdict (approve despite pass:false)", async () => {
    // Inject a judge that always fails; the parent approves anyway → approved + points.
    const base = inMemoryPorts();
    const failing: JudgePort = {
      async evaluate() {
        return { pass: false, confidence: 0.9, reasoning: "looks undone", model: "stub" };
      },
    };
    const ports = { ...base, judge: failing };
    const { founder } = unwrap(
      await createFamily(ports, { name: "Fam", founderDisplayName: "Parent" }),
    );
    const parentCtx = memberContext(founder);
    const kid = unwrap(await addKid(ports, parentCtx, { displayName: "Rae", pin: "1234" }));
    const instance = unwrap(
      await createOneOff(ports, parentCtx, {
        title: "Sweep",
        points: 7,
        assignedMemberId: kid.id,
        dueDate: "2026-06-21",
      }),
    );
    const submission = unwrap(
      await submitPhoto(ports, memberContext(kid), {
        instanceId: instance.id,
        bytes: PHOTO,
        contentType: "image/jpeg",
      }),
    );
    expect(submission.aiVerdict?.pass).toBe(false);

    const decided = unwrap(
      await decide(ports, parentCtx, { submissionId: submission.id, decision: "approve" }),
    );

    expect(decided.status).toBe("approved");
    expect(await ports.points.totalFor(instance.familyId, kid.id)).toBe(7);
  });
});
