import { describe, expect, it } from "vitest";

import { createFamily } from "@/usecases/family";

import { inMemoryPorts, makeTestApp } from "./harness";

describe("createFamily (validation, §8.2)", () => {
  it("rejects a blank family name with a validation error", async () => {
    const result = await createFamily(inMemoryPorts(), {
      name: "   ",
      founderDisplayName: "Sam",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation");
      if (result.error.code === "validation") {
        expect(result.error.field).toBe("name");
      }
    }
  });

  it("rejects a blank founder display name with a validation error", async () => {
    const result = await createFamily(inMemoryPorts(), {
      name: "The Harpers",
      founderDisplayName: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "validation") {
      expect(result.error.field).toBe("founderDisplayName");
    }
  });

  it("rejects an over-long family name", async () => {
    const result = await createFamily(inMemoryPorts(), {
      name: "x".repeat(81),
      founderDisplayName: "Sam",
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "validation") {
      expect(result.error.field).toBe("name");
    }
  });

  it("trims surrounding whitespace before persisting", async () => {
    const result = await createFamily(inMemoryPorts(), {
      name: "  The Harpers  ",
      founderDisplayName: "  Sam  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.family.name).toBe("The Harpers");
      expect(result.value.founder.displayName).toBe("Sam");
    }
  });
});

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
