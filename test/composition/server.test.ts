import { describe, expect, it } from "vitest";

import { serverPorts } from "@/composition/server";

// In the default (keyless) test run no Supabase env is loaded, so serverPorts()
// resolves to the in-memory stack. Memoizing it at module scope is what lets the
// keyless practice mode keep its family/members across requests in a dev process.
describe("serverPorts (per-process singleton)", () => {
  it("returns the same Ports instance across calls", () => {
    expect(serverPorts()).toBe(serverPorts());
  });

  it("persists in-memory data across calls", async () => {
    const { family } = await serverPorts().members.createFamily({
      name: "Persisted",
      founderDisplayName: "P",
    });
    const seen = await serverPorts().members.getFamily(family.id);
    expect(seen).not.toBeNull();
  });
});
