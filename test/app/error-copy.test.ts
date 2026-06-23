import { describe, expect, it } from "vitest";

import { errorMessage } from "@/app/error-copy";

/**
 * Every closed-set AppError code (design §8.2) must map to a specific,
 * intelligible message — never the generic fallback — so no flow shows a blank
 * or confusing error. This guards against a new error variant slipping through
 * the UI unhandled.
 */
const APP_ERROR_CODES = [
  "forbidden",
  "not_found",
  "invalid_transition",
  "bad_pin",
  "judge_unavailable",
  "validation",
] as const;

const FALLBACK = "Something went wrong. Try again.";

describe("errorMessage", () => {
  it("maps every AppError code to a specific (non-fallback) message", () => {
    for (const code of APP_ERROR_CODES) {
      const message = errorMessage(code);
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toBe(FALLBACK);
    }
  });

  it("also covers the HTTP-layer codes the routes emit", () => {
    expect(errorMessage("unauthenticated")).not.toBe(FALLBACK);
    expect(errorMessage("too_large")).not.toBe(FALLBACK);
  });

  it("falls back for an unknown or missing code", () => {
    expect(errorMessage("???")).toBe(FALLBACK);
    expect(errorMessage(undefined)).toBe(FALLBACK);
  });

  it("prefers a flow-specific override", () => {
    expect(errorMessage("validation", { validation: "Pick a photo." })).toBe(
      "Pick a photo.",
    );
    // Override only applies to the matching code; others use the shared map.
    expect(errorMessage("forbidden", { validation: "Pick a photo." })).not.toBe(
      "Pick a photo.",
    );
  });
});
