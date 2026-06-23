import { describe, expect, it } from "vitest";

import { memberContext } from "@/app-session/context";
import { submissionId } from "@/domain/shared/ids";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import type { JudgePort } from "@/ports/judge";
import { createOneOff } from "@/usecases/chores";
import { createFamily } from "@/usecases/family";
import { addKid } from "@/usecases/members";
import { retrySubmission, submitPhoto } from "@/usecases/submission";

import { inMemoryPorts } from "./harness";

/**
 * `submitPhoto` is the M3 orchestration whose **ordering is the contract** (§7.2):
 * store the photo → persist `Submission(evaluating)` + instance `evaluating` →
 * judge → `pending_review`. A judge fault leaves the submission `evaluating` with
 * the photo kept; the only exit is a retry that re-runs the judge.
 */

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

const SUNDAY = "2026-06-21"; // === inMemoryPorts() clock.today()

/** Bootstrap a family + kid + a one-off instance the kid owns. */
async function seed(ports: Ports = inMemoryPorts()) {
  const { founder } = unwrap(
    await createFamily(ports, { name: "Fam", founderDisplayName: "Parent" }),
  );
  const parentCtx = memberContext(founder);
  const kid = unwrap(
    await addKid(ports, parentCtx, { displayName: "Rae", pin: "1234" }),
  );
  const instance = unwrap(
    await createOneOff(ports, parentCtx, {
      title: "Sweep the floor",
      points: 5,
      assignedMemberId: kid.id,
      dueDate: SUNDAY,
    }),
  );
  return { ports, parentCtx, kid, kidCtx: memberContext(kid), instance };
}

/** A judge that always faults — models an unavailable vision provider. */
const throwingJudge: JudgePort = {
  async evaluate() {
    throw new Error("judge down");
  },
};

/** A judge that faults on its first call, then succeeds — drives the retry path. */
function failOnceJudge(): JudgePort {
  let calls = 0;
  return {
    async evaluate(_photo, chore) {
      calls += 1;
      if (calls === 1) throw new Error("judge down");
      return {
        pass: true,
        confidence: 0.9,
        reasoning: `retried ok for ${chore.title}`,
        model: "stub",
      };
    },
  };
}

const PHOTO = new Uint8Array([1, 2, 3]);

describe("submitPhoto (owner-or-parent, §7.2)", () => {
  it("happy path: stores photo, lands pending_review with verdict, advances the instance", async () => {
    const { ports, kid, kidCtx, instance } = await seed();

    const result = await submitPhoto(ports, kidCtx, {
      instanceId: instance.id,
      bytes: PHOTO,
      contentType: "image/jpeg",
    });

    const submission = unwrap(result);
    expect(submission.status).toBe("pending_review");
    expect(submission.aiVerdict).toBeDefined();
    expect(submission.submittedBy).toBe(kid.id);
    // Path embeds the submission id → proves put() ran with the minted id before
    // create() recorded that exact ref.path (the §7.2 ordering).
    expect(submission.photoPath).toBe(
      `${instance.familyId}/${instance.id}/${submission.id}.jpg`,
    );

    const advanced = await ports.chores.getInstance(
      instance.familyId,
      instance.id,
    );
    expect(advanced?.status).toBe("pending_review");
  });

  it("lets a parent submit on a kid's behalf", async () => {
    const { ports, parentCtx, instance } = await seed();

    const result = await submitPhoto(ports, parentCtx, {
      instanceId: instance.id,
      bytes: PHOTO,
      contentType: "image/png",
    });

    expect(unwrap(result).status).toBe("pending_review");
  });

  it("refuses a kid who does not own the instance and writes nothing", async () => {
    const { ports, parentCtx, instance } = await seed();
    const otherKid = unwrap(
      await addKid(ports, parentCtx, { displayName: "Sib", pin: "9999" }),
    );

    const result = await submitPhoto(ports, memberContext(otherKid), {
      instanceId: instance.id,
      bytes: PHOTO,
      contentType: "image/jpeg",
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "forbidden") {
      expect(result.error.need).toBe("family_member");
    }
    // No submission created; instance untouched.
    expect(
      await ports.submissions.listByStatus(instance.familyId, "evaluating"),
    ).toHaveLength(0);
    const still = await ports.chores.getInstance(instance.familyId, instance.id);
    expect(still?.status).toBe("todo");
  });

  it("resolves a cross-family instance to not_found (§8.3)", async () => {
    const a = await seed();
    const b = await seed(a.ports); // second family on the same ports

    const result = await submitPhoto(a.ports, a.parentCtx, {
      instanceId: b.instance.id,
      bytes: PHOTO,
      contentType: "image/jpeg",
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "not_found") {
      expect(result.error.entity).toBe("instance");
    }
  });

  it("rejects a blank contentType (validation)", async () => {
    const { ports, kidCtx, instance } = await seed();

    const result = await submitPhoto(ports, kidCtx, {
      instanceId: instance.id,
      bytes: PHOTO,
      contentType: "  ",
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "validation") {
      expect(result.error.field).toBe("contentType");
    }
  });

  it("on judge failure keeps the photo, stays evaluating, surfaces judge_unavailable", async () => {
    const base = await seed();
    const ports = { ...base.ports, judge: throwingJudge };

    const result = await submitPhoto(ports, base.kidCtx, {
      instanceId: base.instance.id,
      bytes: PHOTO,
      contentType: "image/jpeg",
    });

    // The submission survives in evaluating with the photo persisted and no verdict.
    const evaluating = await ports.submissions.listByStatus(
      base.instance.familyId,
      "evaluating",
    );
    expect(evaluating).toHaveLength(1);
    expect(evaluating[0].photoPath).not.toBe("");
    expect(evaluating[0].aiVerdict).toBeUndefined();
    // The error names the submission to retry against (the photo's handle, §7.2).
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "judge_unavailable") {
      expect(result.error.submissionId).toBe(evaluating[0].id);
    } else {
      throw new Error("expected judge_unavailable");
    }
    // Instance moved to evaluating (persist-first), not rolled back.
    const inst = await ports.chores.getInstance(
      base.instance.familyId,
      base.instance.id,
    );
    expect(inst?.status).toBe("evaluating");
  });
});

describe("retrySubmission (the only exit from evaluating, §7.2)", () => {
  /** Submit once against a fault-injected judge so a submission is stuck evaluating. */
  async function stuckEvaluating(judge: JudgePort) {
    const base = await seed();
    const ports = { ...base.ports, judge };
    const first = await submitPhoto(ports, base.kidCtx, {
      instanceId: base.instance.id,
      bytes: PHOTO,
      contentType: "image/jpeg",
    });
    expect(first.ok).toBe(false); // judge faulted
    const [submission] = await ports.submissions.listByStatus(
      base.instance.familyId,
      "evaluating",
    );
    return { ...base, ports, submission };
  }

  it("re-runs the judge and reaches pending_review, reusing the same photo", async () => {
    const { ports, kidCtx, instance, submission } = await stuckEvaluating(
      failOnceJudge(),
    );

    const result = await retrySubmission(ports, kidCtx, {
      submissionId: submission.id,
    });

    const retried = unwrap(result);
    expect(retried.status).toBe("pending_review");
    expect(retried.aiVerdict).toBeDefined();
    expect(retried.photoPath).toBe(submission.photoPath); // photo reused, not re-put

    const inst = await ports.chores.getInstance(instance.familyId, instance.id);
    expect(inst?.status).toBe("pending_review");
  });

  it("refuses retry on a submission that is not evaluating (invalid_transition)", async () => {
    const { ports, kidCtx, instance } = await seed();
    // Happy submit → pending_review (default fake judge never throws).
    const submission = unwrap(
      await submitPhoto(ports, kidCtx, {
        instanceId: instance.id,
        bytes: PHOTO,
        contentType: "image/jpeg",
      }),
    );

    const result = await retrySubmission(ports, kidCtx, {
      submissionId: submission.id,
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "invalid_transition") {
      expect(result.error.from).toBe("pending_review");
      expect(result.error.to).toBe("pending_review");
    }
  });

  it("refuses retry by a kid who does not own the instance", async () => {
    const { ports, parentCtx, submission } = await stuckEvaluating(throwingJudge);
    const otherKid = unwrap(
      await addKid(ports, parentCtx, { displayName: "Sib", pin: "9999" }),
    );

    const result = await retrySubmission(ports, memberContext(otherKid), {
      submissionId: submission.id,
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "forbidden") {
      expect(result.error.need).toBe("family_member");
    }
  });

  it("resolves an unknown submission to not_found", async () => {
    const { ports, kidCtx } = await seed();

    const result = await retrySubmission(ports, kidCtx, {
      submissionId: submissionId("nope"),
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "not_found") {
      expect(result.error.entity).toBe("submission");
    }
  });
});
