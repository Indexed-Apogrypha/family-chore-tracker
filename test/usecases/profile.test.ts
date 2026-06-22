import { describe, expect, it } from "vitest";

import { memberContext } from "@/app-session/context";
import { memberId } from "@/domain/shared/ids";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import { createFamily } from "@/usecases/family";
import { addKid } from "@/usecases/members";
import { switchProfile } from "@/usecases/profile";

import { inMemoryPorts } from "./harness";

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

describe("switchProfile (active profile selection, §3.1)", () => {
  it("switches to the parent profile with no pin", async () => {
    const { ports, founder, parentCtx } = await withParent();
    const result = await switchProfile(ports, parentCtx, {
      memberId: founder.id,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(founder.id);
      expect(result.value.kind).toBe("parent");
    }
  });

  it("switches to a kid when the pin is right", async () => {
    const { ports, parentCtx } = await withParent();
    const kid = unwrap(
      await addKid(ports, parentCtx, { displayName: "Rae", pin: "1234" }),
    );
    const result = await switchProfile(ports, parentCtx, {
      memberId: kid.id,
      pin: "1234",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(kid.id);
      // the caller adopts this as the active profile (§3.1)
      expect(memberContext(result.value).actor).toEqual({
        kind: "kid",
        memberId: kid.id,
      });
    }
  });

  it("rejects a wrong kid pin with bad_pin", async () => {
    const { ports, parentCtx } = await withParent();
    const kid = unwrap(
      await addKid(ports, parentCtx, { displayName: "Rae", pin: "1234" }),
    );
    const result = await switchProfile(ports, parentCtx, {
      memberId: kid.id,
      pin: "0000",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("bad_pin");
  });

  it("rejects a kid switch with a missing pin as bad_pin", async () => {
    const { ports, parentCtx } = await withParent();
    const kid = unwrap(
      await addKid(ports, parentCtx, { displayName: "Rae", pin: "1234" }),
    );
    const result = await switchProfile(ports, parentCtx, { memberId: kid.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("bad_pin");
  });

  it("rejects an unknown member id with not_found", async () => {
    const { ports, parentCtx } = await withParent();
    const result = await switchProfile(ports, parentCtx, {
      memberId: memberId("nope"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_found");
      if (result.error.code === "not_found") {
        expect(result.error.entity).toBe("member");
      }
    }
  });

  it("treats a cross-family member as not_found (family scoping)", async () => {
    const { ports, parentCtx } = await withParent();
    // A second family on the same store; its kid must not be switchable here.
    const other = unwrap(
      await createFamily(ports, { name: "Other", founderDisplayName: "Q" }),
    );
    const otherKid = unwrap(
      await addKid(ports, memberContext(other.founder), {
        displayName: "Max",
        pin: "5678",
      }),
    );
    const result = await switchProfile(ports, parentCtx, {
      memberId: otherKid.id,
      pin: "5678",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("not_found");
  });

  it("lets a kid actor switch back to the parent without a pin (accepted v1 limitation, §3.1)", async () => {
    const { ports, founder, parentCtx } = await withParent();
    const kid = unwrap(
      await addKid(ports, parentCtx, { displayName: "Rae", pin: "1234" }),
    );
    // Now acting as the kid, switch back to the parent — no pin gate on parent.
    const result = await switchProfile(ports, memberContext(kid), {
      memberId: founder.id,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kind).toBe("parent");
  });
});
