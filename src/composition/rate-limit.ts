/**
 * A small fixed-window failure limiter for PIN attempts (§3.1 hardening). The
 * PIN is a 4-digit app-level gate, so unthrottled guessing (~10k tries) would
 * walk the whole space; after {@link MAX_FAILURES} wrong PINs for one member
 * the switch endpoint backs off for the rest of the window.
 *
 * In-memory by design: per-instance on serverless is still an effective brake
 * (an attacker can't pick which instance serves them), and the PIN is not a
 * security boundary (design §3.1) — the parent's Supabase session is.
 */

const WINDOW_MS = 5 * 60_000;
const MAX_FAILURES = 5;

interface Window {
  failures: number;
  windowStart: number;
}

export interface PinRateLimiter {
  /** May this key attempt a PIN right now? */
  allowed(key: string, nowMs: number): boolean;
  /** Record a wrong PIN for this key. */
  recordFailure(key: string, nowMs: number): void;
  /** Reset the key (a correct PIN proves the actor knows it). */
  clear(key: string): void;
}

export function createPinRateLimiter(): PinRateLimiter {
  const windows = new Map<string, Window>();

  const current = (key: string, nowMs: number): Window | undefined => {
    const w = windows.get(key);
    if (w && nowMs - w.windowStart >= WINDOW_MS) {
      windows.delete(key);
      return undefined;
    }
    return w;
  };

  return {
    allowed(key, nowMs) {
      const w = current(key, nowMs);
      return !w || w.failures < MAX_FAILURES;
    },
    recordFailure(key, nowMs) {
      const w = current(key, nowMs);
      if (w) {
        w.failures += 1;
      } else {
        windows.set(key, { failures: 1, windowStart: nowMs });
      }
    },
    clear(key) {
      windows.delete(key);
    },
  };
}

// Hangs off globalThis like `serverPorts` so dev HMR / per-route bundling
// doesn't mint fresh (empty) limiters per module instance.
const globalForLimiter = globalThis as typeof globalThis & {
  __pinRateLimiter?: PinRateLimiter;
};

/** The process-wide limiter the route handlers share. */
export function pinRateLimiter(): PinRateLimiter {
  globalForLimiter.__pinRateLimiter ??= createPinRateLimiter();
  return globalForLimiter.__pinRateLimiter;
}
