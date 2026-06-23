import { fixedClock } from "@/adapters/clock/fixed";
import { fakeJudge } from "@/adapters/judge/fake";
import {
  createInMemoryStore,
  inMemoryChoreRepository,
  inMemoryMemberRepository,
  inMemoryPointsLedger,
  inMemorySubmissionRepository,
} from "@/adapters/persistence/in-memory";
import { inMemoryPhotoStorage } from "@/adapters/storage/in-memory";
import { type App, makeApp } from "@/app-session/app";
import type { Ports } from "@/ports";

const DEFAULT_NOW = "2026-06-21T09:00:00.000Z";

/**
 * A fully in-memory `Ports` bundle with a fixed clock + fake judge — the wiring
 * for use-case tests (design §10): full coverage, no network, no AI spend.
 */
export function inMemoryPorts(now: string = DEFAULT_NOW): Ports {
  // Shared store → the atomic advance flips the same instance the chore repo
  // reads (§7.2), so use-case tests see submission + instance move together.
  const store = createInMemoryStore();
  return {
    judge: fakeJudge(),
    clock: fixedClock(now),
    photos: inMemoryPhotoStorage(),
    chores: inMemoryChoreRepository(store),
    submissions: inMemorySubmissionRepository(store),
    members: inMemoryMemberRepository(),
    points: inMemoryPointsLedger(),
  };
}

/** `makeApp` over in-memory wiring — the entrypoint for use-case tests. */
export function makeTestApp(now?: string): App {
  return makeApp(inMemoryPorts(now));
}
