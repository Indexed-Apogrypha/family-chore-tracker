import { describe, expect, it } from "vitest";

import { memberContext } from "@/app-session/context";
import {
  PRACTICE_KID_PIN,
  resolveContext,
  seedPracticeFamily,
} from "@/composition/session";
import { memberId } from "@/domain/shared/ids";
import type { Result } from "@/domain/shared/result";
import { createFamily } from "@/usecases/family";
import { addKid, verifyKidPin } from "@/usecases/members";

import { inMemoryPorts } from "../usecases/harness";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

async function withFamilyAndKid() {
  const ports = inMemoryPorts();
  const { family, founder } = unwrap(
    await createFamily(ports, { name: "Fam", founderDisplayName: "Parent" }),
  );
  const kid = unwrap(
    await addKid(ports, memberContext(founder), {
      displayName: "Rae",
      pin: "1234",
    }),
  );
  return { ports, family, founder, kid };
}

describe("resolveContext (active-profile → RequestContext, §3.1)", () => {
  it("defaults to the parent actor when no active profile is selected", async () => {
    const { ports, family, founder } = await withFamilyAndKid();
    const ctx = await resolveContext(
      ports,
      { familyId: family.id, parent: founder },
      null,
    );
    expect(ctx).toEqual({
      familyId: family.id,
      actor: { kind: "parent", memberId: founder.id },
    });
  });

  it("adopts a kid actor when the active profile is a kid in the family", async () => {
    const { ports, family, founder, kid } = await withFamilyAndKid();
    const ctx = await resolveContext(
      ports,
      { familyId: family.id, parent: founder },
      kid.id,
    );
    expect(ctx.actor).toEqual({ kind: "kid", memberId: kid.id });
    expect(ctx.familyId).toBe(family.id);
  });

  it("resolves the parent actor when the active profile is the parent", async () => {
    const { ports, family, founder } = await withFamilyAndKid();
    const ctx = await resolveContext(
      ports,
      { familyId: family.id, parent: founder },
      founder.id,
    );
    expect(ctx.actor).toEqual({ kind: "parent", memberId: founder.id });
  });

  it("falls back to the parent for an unknown active-member cookie", async () => {
    const { ports, family, founder } = await withFamilyAndKid();
    const ctx = await resolveContext(
      ports,
      { familyId: family.id, parent: founder },
      memberId("tampered"),
    );
    expect(ctx.actor).toEqual({ kind: "parent", memberId: founder.id });
  });

  it("falls back to the parent for a cross-family active-member cookie", async () => {
    const { ports, family, founder } = await withFamilyAndKid();
    // A kid from another family on the same store must not be adoptable here.
    const other = unwrap(
      await createFamily(ports, { name: "Other", founderDisplayName: "Q" }),
    );
    const otherKid = unwrap(
      await addKid(ports, memberContext(other.founder), {
        displayName: "Max",
        pin: "5678",
      }),
    );
    const ctx = await resolveContext(
      ports,
      { familyId: family.id, parent: founder },
      otherKid.id,
    );
    expect(ctx.actor).toEqual({ kind: "parent", memberId: founder.id });
  });
});

describe("seedPracticeFamily (keyless practice bootstrap)", () => {
  it("creates a parent founder and one demo kid in the same family", async () => {
    const ports = inMemoryPorts();
    const { family, founder, kid } = await seedPracticeFamily(ports);
    expect(founder.kind).toBe("parent");
    expect(founder.familyId).toBe(family.id);
    expect(kid.kind).toBe("kid");
    expect(kid.familyId).toBe(family.id);
  });

  it("seeds the demo kid with a working pin so the switcher is usable", async () => {
    const ports = inMemoryPorts();
    const { founder, kid } = await seedPracticeFamily(ports);
    const verified = await verifyKidPin(ports, memberContext(founder), {
      memberId: kid.id,
      pin: PRACTICE_KID_PIN,
    });
    expect(verified.ok).toBe(true);
  });
});
