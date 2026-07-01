import { describe, expect, it } from "vitest";

import { createPinRateLimiter } from "@/composition/rate-limit";

const T0 = 1_000_000;
const MINUTE = 60_000;

describe("pin rate limiter (§3.1 hardening)", () => {
  it("allows attempts until the failure cap, then backs off", () => {
    const limiter = createPinRateLimiter();
    for (let i = 0; i < 5; i++) {
      expect(limiter.allowed("fam:kid", T0)).toBe(true);
      limiter.recordFailure("fam:kid", T0);
    }
    expect(limiter.allowed("fam:kid", T0)).toBe(false);
  });

  it("scopes by key — another member is unaffected", () => {
    const limiter = createPinRateLimiter();
    for (let i = 0; i < 5; i++) limiter.recordFailure("fam:kid-a", T0);
    expect(limiter.allowed("fam:kid-a", T0)).toBe(false);
    expect(limiter.allowed("fam:kid-b", T0)).toBe(true);
  });

  it("resets once the window elapses", () => {
    const limiter = createPinRateLimiter();
    for (let i = 0; i < 5; i++) limiter.recordFailure("fam:kid", T0);
    expect(limiter.allowed("fam:kid", T0 + MINUTE)).toBe(false);
    expect(limiter.allowed("fam:kid", T0 + 5 * MINUTE)).toBe(true);
  });

  it("clears on success — a correct PIN proves the actor knows it", () => {
    const limiter = createPinRateLimiter();
    for (let i = 0; i < 5; i++) limiter.recordFailure("fam:kid", T0);
    limiter.clear("fam:kid");
    expect(limiter.allowed("fam:kid", T0)).toBe(true);
  });
});
