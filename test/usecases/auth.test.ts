import { describe, expect, it } from "vitest";

import { findActingParent } from "@/usecases/auth";
import { createFamily } from "@/usecases/family";

import { inMemoryPorts } from "./harness";

/**
 * `findActingParent` maps an authenticated Supabase user to their parent member,
 * the seam the login edge uses to build a RequestContext (design §3.1, §8.3).
 */
describe("findActingParent (§3.1, §8.3)", () => {
  it("resolves the parent backing an authenticated user", async () => {
    const ports = inMemoryPorts();
    await createFamily(ports, {
      name: "Fam",
      founderDisplayName: "P",
      authUserId: "auth-1",
    });
    const result = await findActingParent(ports, "auth-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("parent");
      expect(result.value.authUserId).toBe("auth-1");
    }
  });

  it("returns not_found when the auth user has no family yet (bootstrap signal)", async () => {
    const result = await findActingParent(inMemoryPorts(), "nobody");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_found");
    }
  });
});
