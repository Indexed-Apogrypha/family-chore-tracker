import { describe, expect, it } from "vitest";

import { memberContext } from "@/app-session/context";
import { memberId } from "@/domain/shared/ids";
import type { Result } from "@/domain/shared/result";
import { addKid, listMembers, verifyKidPin } from "@/usecases/members";
import { createFamily } from "@/usecases/family";

import { inMemoryPorts } from "./harness";
import type { Ports } from "@/ports";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** Bootstrap a family and return its ports + the founding parent's context. */
async function withParent(ports: Ports = inMemoryPorts()) {
  const { family, founder } = unwrap(
    await createFamily(ports, { name: "Fam", founderDisplayName: "Parent" }),
  );
  return { ports, family, founder, parentCtx: memberContext(founder) };
}

describe("addKid (parent-only, §8.3)", () => {
  it("lets a parent add a kid whose pin is stored hashed", async () => {
    const { ports, parentCtx } = await withParent();
    const result = await addKid(ports, parentCtx, {
      displayName: "Rae",
      pin: "1234",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("kid");
      expect(result.value.displayName).toBe("Rae");
      expect(result.value.pinHash).not.toBe("1234");
    }
  });

  it("forbids a kid actor from adding a kid", async () => {
    const { ports, parentCtx } = await withParent();
    const kid = unwrap(
      await addKid(ports, parentCtx, { displayName: "Rae", pin: "1234" }),
    );
    const result = await addKid(ports, memberContext(kid), {
      displayName: "Sib",
      pin: "9999",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("forbidden");
      if (result.error.code === "forbidden") {
        expect(result.error.need).toBe("parent");
      }
    }
  });

  it("rejects a blank display name with a validation error", async () => {
    const { ports, parentCtx } = await withParent();
    const result = await addKid(ports, parentCtx, {
      displayName: "   ",
      pin: "1234",
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "validation") {
      expect(result.error.field).toBe("displayName");
    }
  });

  it("rejects a blank pin with a validation error", async () => {
    const { ports, parentCtx } = await withParent();
    const result = await addKid(ports, parentCtx, {
      displayName: "Rae",
      pin: "   ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "validation") {
      expect(result.error.field).toBe("pin");
    }
  });
});

describe("listMembers (any family member, §8.3)", () => {
  it("returns parents and kids scoped to the acting family", async () => {
    const { ports, parentCtx } = await withParent();
    await addKid(ports, parentCtx, { displayName: "Rae", pin: "1234" });

    // A second family on the same store must not leak into the first's list.
    const other = unwrap(
      await createFamily(ports, { name: "Other", founderDisplayName: "Q" }),
    );
    await addKid(ports, memberContext(other.founder), {
      displayName: "Max",
      pin: "5678",
    });

    const result = await listMembers(ports, parentCtx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value.map((m) => m.kind).sort()).toEqual(["kid", "parent"]);
      expect(result.value.every((m) => m.familyId === parentCtx.familyId)).toBe(
        true,
      );
    }
  });

  it("is allowed for a kid actor too", async () => {
    const { ports, parentCtx } = await withParent();
    const kid = unwrap(
      await addKid(ports, parentCtx, { displayName: "Rae", pin: "1234" }),
    );
    const result = await listMembers(ports, memberContext(kid));
    expect(result.ok).toBe(true);
  });
});

describe("verifyKidPin (any family member, §3.1)", () => {
  it("returns the kid for the right pin, ready to become the active profile", async () => {
    const { ports, parentCtx } = await withParent();
    const kid = unwrap(
      await addKid(ports, parentCtx, { displayName: "Rae", pin: "1234" }),
    );
    const result = await verifyKidPin(ports, parentCtx, {
      memberId: kid.id,
      pin: "1234",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(kid.id);
      // the caller adopts the kid as the active profile (no token minted, §3.1)
      expect(memberContext(result.value).actor).toEqual({
        kind: "kid",
        memberId: kid.id,
      });
    }
  });

  it("rejects a wrong pin with bad_pin", async () => {
    const { ports, parentCtx } = await withParent();
    const kid = unwrap(
      await addKid(ports, parentCtx, { displayName: "Rae", pin: "1234" }),
    );
    const result = await verifyKidPin(ports, parentCtx, {
      memberId: kid.id,
      pin: "0000",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("bad_pin");
  });

  it("rejects an unknown member id with bad_pin (no existence leak)", async () => {
    const { ports, parentCtx } = await withParent();
    const result = await verifyKidPin(ports, parentCtx, {
      memberId: memberId("nope"),
      pin: "1234",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("bad_pin");
  });
});
