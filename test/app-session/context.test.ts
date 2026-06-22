import { describe, expect, it } from "vitest";

import { memberContext } from "@/app-session/context";
import type { Member } from "@/domain/family/types";
import { familyId, memberId } from "@/domain/shared/ids";

/**
 * `memberContext` binds a loaded member into the request context the session
 * edge runs on (design §4.2, §8.3): a parent founder after `createFamily`, or
 * the active kid after `verifyKidPin`.
 */
describe("memberContext (§4.2, §8.3)", () => {
  it("derives a parent request context from a parent member", () => {
    const parent: Member = {
      id: memberId("m1"),
      familyId: familyId("f1"),
      kind: "parent",
      displayName: "Sam",
    };
    const ctx = memberContext(parent);
    expect(ctx.familyId).toBe(familyId("f1"));
    expect(ctx.actor).toEqual({ kind: "parent", memberId: memberId("m1") });
  });

  it("derives a kid request context from a kid member", () => {
    const kid: Member = {
      id: memberId("m2"),
      familyId: familyId("f1"),
      kind: "kid",
      displayName: "Rae",
      pinHash: "fake$1234",
    };
    const ctx = memberContext(kid);
    expect(ctx.familyId).toBe(familyId("f1"));
    expect(ctx.actor).toEqual({ kind: "kid", memberId: memberId("m2") });
  });
});
