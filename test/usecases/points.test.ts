import { describe, expect, it } from "vitest";

import { memberContext } from "@/app-session/context";
import { memberId } from "@/domain/shared/ids";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import { createOneOff } from "@/usecases/chores";
import { createFamily } from "@/usecases/family";
import { addKid } from "@/usecases/members";
import { pointsTotal } from "@/usecases/points";
import { decide } from "@/usecases/review";
import { submitPhoto } from "@/usecases/submission";

import { inMemoryPorts } from "./harness";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

async function withFamilyAndKid(ports: Ports = inMemoryPorts()) {
  const { founder } = unwrap(
    await createFamily(ports, { name: "Fam", founderDisplayName: "Parent" }),
  );
  const parentCtx = memberContext(founder);
  const kid = unwrap(
    await addKid(ports, parentCtx, { displayName: "Rae", pin: "1234" }),
  );
  return { ports, parentCtx, kid, kidCtx: memberContext(kid) };
}

describe("pointsTotal (any family member, §8.1)", () => {
  it("is zero before any chore is approved", async () => {
    const { ports, parentCtx, kid } = await withFamilyAndKid();
    expect(unwrap(await pointsTotal(ports, parentCtx, { memberId: kid.id }))).toBe(0);
  });

  it("reflects approved-chore credits and is readable by the kid themselves", async () => {
    const { ports, parentCtx, kid, kidCtx } = await withFamilyAndKid();
    const instance = unwrap(
      await createOneOff(ports, parentCtx, {
        title: "Sweep",
        points: 8,
        assignedMemberId: kid.id,
        dueDate: "2026-06-21",
      }),
    );
    const submission = unwrap(
      await submitPhoto(ports, kidCtx, {
        instanceId: instance.id,
        bytes: new Uint8Array([1, 2, 3]),
        contentType: "image/jpeg",
      }),
    );
    unwrap(await decide(ports, parentCtx, { submissionId: submission.id, decision: "approve" }));

    // Both the parent and the kid can read the kid's total.
    expect(unwrap(await pointsTotal(ports, parentCtx, { memberId: kid.id }))).toBe(8);
    expect(unwrap(await pointsTotal(ports, kidCtx, { memberId: kid.id }))).toBe(8);
  });

  it("resolves an unknown member to not_found", async () => {
    const { ports, parentCtx } = await withFamilyAndKid();
    const result = await pointsTotal(ports, parentCtx, { memberId: memberId("nope") });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "not_found") {
      expect(result.error.entity).toBe("member");
    } else {
      throw new Error("expected not_found");
    }
  });

  it("scopes to the family: a cross-family member is not_found (§9)", async () => {
    const a = await withFamilyAndKid();
    const b = await withFamilyAndKid(a.ports);
    const result = await pointsTotal(a.ports, a.parentCtx, { memberId: b.kid.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("not_found");
  });
});
