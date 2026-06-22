import { describe, expect, it } from "vitest";

import { makeApp } from "@/app-session/app";
import { memberContext } from "@/app-session/context";
import { familyId, memberId } from "@/domain/shared/ids";
import type { Result } from "@/domain/shared/result";
import { requireParent } from "@/usecases/authz";

import { inMemoryPorts } from "./harness";

/**
 * The capability matrix (design §8.3) as executable spec. `members.test.ts`
 * proves each verb's behavior; this proves the *authorization dimension* — who
 * may call what — both at the guard and wired through the session edge. The
 * enforcement itself shipped with #51/#52; this locks it in against regressions.
 */

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

describe("requireParent guard (§8.3)", () => {
  it("admits a parent actor", () => {
    const result = requireParent({
      familyId: familyId("f1"),
      actor: { kind: "parent", memberId: memberId("m1") },
    });
    expect(result.ok).toBe(true);
  });

  it("refuses a kid actor with forbidden(parent)", () => {
    const result = requireParent({
      familyId: familyId("f1"),
      actor: { kind: "kid", memberId: memberId("m1") },
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "forbidden") {
      expect(result.error.need).toBe("parent");
    }
  });
});

describe("M1 capability matrix, enforced through the session edge (§8.3)", () => {
  /** One app with a bootstrapped family, plus parent and kid sessions. */
  async function family() {
    const app = makeApp(inMemoryPorts());
    const { founder } = unwrap(
      await app.createFamily({ name: "Fam", founderDisplayName: "P" }),
    );
    const parent = app.as(memberContext(founder));
    const kid = unwrap(await parent.addKid({ displayName: "Rae", pin: "1234" }));
    return { app, parent, kidSession: app.as(memberContext(kid)), kid };
  }

  it("addKid is parent-only", async () => {
    const { parent, kidSession } = await family();
    expect((await parent.addKid({ displayName: "Sib", pin: "1111" })).ok).toBe(
      true,
    );
    const denied = await kidSession.addKid({ displayName: "Sib", pin: "2222" });
    expect(denied.ok).toBe(false);
    if (!denied.ok && denied.error.code === "forbidden") {
      expect(denied.error.need).toBe("parent");
    }
  });

  it("listMembers and verifyKidPin are open to any family member", async () => {
    const { parent, kidSession, kid } = await family();
    expect((await parent.listMembers()).ok).toBe(true);
    expect((await kidSession.listMembers()).ok).toBe(true);
    expect(
      (await parent.verifyKidPin({ memberId: kid.id, pin: "1234" })).ok,
    ).toBe(true);
    expect(
      (await kidSession.verifyKidPin({ memberId: kid.id, pin: "1234" })).ok,
    ).toBe(true);
  });

  it("mirrors RLS: a cross-family member id is invisible (verifyKidPin → bad_pin)", async () => {
    const app = makeApp(inMemoryPorts());
    const a = unwrap(
      await app.createFamily({ name: "A", founderDisplayName: "Pa" }),
    );
    const b = unwrap(
      await app.createFamily({ name: "B", founderDisplayName: "Pb" }),
    );
    const bKid = unwrap(
      await app
        .as(memberContext(b.founder))
        .addKid({ displayName: "Max", pin: "5678" }),
    );
    // Acting in family A, the right PIN for B's kid must still fail.
    const result = await app
      .as(memberContext(a.founder))
      .verifyKidPin({ memberId: bKid.id, pin: "5678" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("bad_pin");
  });
});
