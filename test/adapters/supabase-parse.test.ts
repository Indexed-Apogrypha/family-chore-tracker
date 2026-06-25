import { describe, expect, it } from "vitest";

import {
  parseStoredRecurrence,
  parseStoredVerdict,
} from "@/adapters/persistence/supabase/parse";

// Pure unit coverage for the Supabase JSON read-boundary validators (#137). No
// DB needed — these guard the moment a `Json` column re-enters the type system.
describe("parseStoredVerdict", () => {
  it("maps a well-formed verdict row", () => {
    expect(
      parseStoredVerdict({
        pass: true,
        confidence: 0.8,
        reasoning: "Looks clean.",
        model: "claude",
      }),
    ).toEqual({
      pass: true,
      confidence: 0.8,
      reasoning: "Looks clean.",
      model: "claude",
    });
  });

  it("clamps confidence into [0,1] and coerces a falsy pass", () => {
    expect(
      parseStoredVerdict({ pass: 0, confidence: 5, reasoning: "x", model: "m" }),
    ).toMatchObject({ pass: false, confidence: 1 });
    expect(
      parseStoredVerdict({ pass: 1, confidence: -2, reasoning: "x", model: "m" }),
    ).toMatchObject({ pass: true, confidence: 0 });
  });

  it("fills a non-empty reasoning and model when the row omits them", () => {
    const v = parseStoredVerdict({ pass: true, confidence: 0.5 });
    expect(v.reasoning).toBe("No reasoning provided.");
    expect(v.model).toBe("unknown");
  });

  it("fails loud on a structurally corrupt (non-object) row", () => {
    expect(() => parseStoredVerdict("nope")).toThrow(/ai_verdict/);
    expect(() => parseStoredVerdict([1, 2])).toThrow(/ai_verdict/);
    expect(() => parseStoredVerdict(null as never)).toThrow(/ai_verdict/);
  });
});

describe("parseStoredRecurrence", () => {
  it("passes none and daily", () => {
    expect(parseStoredRecurrence({ kind: "none" })).toEqual({ kind: "none" });
    expect(parseStoredRecurrence({ kind: "daily" })).toEqual({ kind: "daily" });
  });

  it("passes a well-formed weekly row", () => {
    expect(parseStoredRecurrence({ kind: "weekly", days: [1, 3, 5] })).toEqual({
      kind: "weekly",
      days: [1, 3, 5],
    });
  });

  it("fails loud on a malformed weekly row", () => {
    expect(() => parseStoredRecurrence({ kind: "weekly", days: [] })).toThrow();
    expect(() => parseStoredRecurrence({ kind: "weekly", days: [7] })).toThrow();
    expect(() =>
      parseStoredRecurrence({ kind: "weekly", days: [1.5] }),
    ).toThrow();
    expect(() => parseStoredRecurrence({ kind: "weekly" })).toThrow();
  });

  it("fails loud on an unknown kind or non-object", () => {
    expect(() => parseStoredRecurrence({ kind: "monthly" })).toThrow();
    expect(() => parseStoredRecurrence("none")).toThrow(/recurrence/);
  });
});
