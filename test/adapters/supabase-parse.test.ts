import { describe, expect, it } from "vitest";

import {
  storedRecurrence,
  storedVerdict,
} from "@/adapters/persistence/supabase/parse";

/**
 * The Supabase read-boundary validators (#137): JSON columns read back from the
 * DB re-enter the type system here, so a legacy/hand-edited/migrated bad row
 * fails loud (→ persistence_unavailable via the use-case wrapping, §8.2)
 * instead of feeding malformed data into domain logic.
 */

describe("storedVerdict (#137)", () => {
  it("accepts a well-formed stored verdict", () => {
    const verdict = {
      pass: true,
      confidence: 0.8,
      reasoning: "looks clean",
      model: "fake",
    };
    expect(storedVerdict(verdict)).toEqual(verdict);
  });

  it("clamps confidence into 0..1 like the write boundary", () => {
    expect(
      storedVerdict({ pass: false, confidence: 3, reasoning: "r", model: "m" })
        .confidence,
    ).toBe(1);
  });

  it.each([
    ["null", null],
    ["an array", [1, 2]],
    ["a string", "verdict"],
    ["missing fields", { pass: true }],
    ["wrong types", { pass: "yes", confidence: "high", reasoning: 1, model: 2 }],
    ["non-finite confidence", { pass: true, confidence: null, reasoning: "r", model: "m" }],
  ])("throws on %s", (_label, value) => {
    expect(() => storedVerdict(value as never)).toThrow(/ai_verdict/);
  });
});

describe("storedRecurrence (#137)", () => {
  it("accepts none / daily / weekly shapes", () => {
    expect(storedRecurrence({ kind: "none" })).toEqual({ kind: "none" });
    expect(storedRecurrence({ kind: "daily" })).toEqual({ kind: "daily" });
    expect(storedRecurrence({ kind: "weekly", days: [1, 3] })).toEqual({
      kind: "weekly",
      days: [1, 3],
    });
  });

  it.each([
    ["null", null],
    ["a string", "daily"],
    ["an unknown kind", { kind: "monthly" }],
    ["weekly without days", { kind: "weekly" }],
    ["weekly with empty days", { kind: "weekly", days: [] }],
    ["weekly with out-of-range days", { kind: "weekly", days: [7] }],
    ["weekly with non-integer days", { kind: "weekly", days: [1.5] }],
  ])("throws on %s", (_label, value) => {
    expect(() => storedRecurrence(value as never)).toThrow(/recurrence/);
  });
});
