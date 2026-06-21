import { describe, expect, it } from "vitest";

import { inMemoryPorts, makeTestApp } from "./harness";

describe("use-case test harness", () => {
  it("wires a fixed clock and fake judge over in-memory stores", () => {
    expect(inMemoryPorts("2026-06-21T09:00:00.000Z").clock.today()).toBe(
      "2026-06-21",
    );
  });

  it("runs a use-case end-to-end with no network (createFamily)", async () => {
    const result = await makeTestApp().createFamily({
      name: "Fam",
      founderDisplayName: "P",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.founder.kind).toBe("parent");
    }
  });
});
