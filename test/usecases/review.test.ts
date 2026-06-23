import { describe, expect, it } from "vitest";

import { memberContext } from "@/app-session/context";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import { createOneOff } from "@/usecases/chores";
import { createFamily } from "@/usecases/family";
import { addKid } from "@/usecases/members";
import { getReviewQueue } from "@/usecases/review";
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
