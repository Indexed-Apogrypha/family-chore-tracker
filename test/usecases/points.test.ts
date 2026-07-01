import { describe, expect, it } from "vitest";

import { memberContext } from "@/app-session/context";
import { memberId } from "@/domain/shared/ids";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import { createOneOff } from "@/usecases/chores";
import { createFamily } from "@/usecases/family";
import { addKid } from "@/usecases/members";
import { pointsHistory, pointsTotal } from "@/usecases/points";
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

describe("pointsHistory (any family member, §6, §8.1)", () => {
  async function approveOneOff(
    seed: Awaited<ReturnType<typeof withFamilyAndKid>>,
    title: string,
    points: number,
  ) {
    const { ports, parentCtx, kid, kidCtx } = seed;
    const instance = unwrap(
      await createOneOff(ports, parentCtx, {
        title,
        points,
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
    unwrap(
      await decide(ports, parentCtx, {
        submissionId: submission.id,
        decision: "approve",
      }),
    );
  }

  it("is empty before any chore is approved", async () => {
    const { ports, kidCtx, kid } = await withFamilyAndKid();
    expect(unwrap(await pointsHistory(ports, kidCtx, { memberId: kid.id }))).toEqual(
      [],
    );
  });

  it("lists each credit with its chore title, readable by parent and kid", async () => {
    const seed = await withFamilyAndKid();
    await approveOneOff(seed, "Sweep", 8);
    await approveOneOff(seed, "Dishes", 3);

    const history = unwrap(
      await pointsHistory(seed.ports, seed.kidCtx, { memberId: seed.kid.id }),
    );
    expect(history).toHaveLength(2);
    // Every credit resolves to its chore snapshot; totals reconcile with the sum.
    expect(new Set(history.map((h) => `${h.choreTitle}:${h.delta}`))).toEqual(
      new Set(["Sweep:8", "Dishes:3"]),
    );
    expect(
      unwrap(await pointsTotal(seed.ports, seed.parentCtx, { memberId: seed.kid.id })),
    ).toBe(history.reduce((sum, h) => sum + h.delta, 0));
  });

  it("resolves an unknown or cross-family member to not_found (§9)", async () => {
    const a = await withFamilyAndKid();
    const b = await withFamilyAndKid(a.ports);
    const unknown = await pointsHistory(a.ports, a.parentCtx, {
      memberId: memberId("nope"),
    });
    expect(unknown.ok).toBe(false);
    const crossFamily = await pointsHistory(a.ports, a.parentCtx, {
      memberId: b.kid.id,
    });
    expect(crossFamily.ok).toBe(false);
    if (!crossFamily.ok) expect(crossFamily.error.code).toBe("not_found");
  });
});
