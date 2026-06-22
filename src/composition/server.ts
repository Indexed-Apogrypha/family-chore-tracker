import { type App, makeApp } from "@/app-session/app";
import type { Ports } from "@/ports";

import { buildPorts } from "./container";
import { readEnv } from "./env";

/**
 * The server runtime's single `Ports` bundle (design §4.2, §11). `buildPorts`
 * stays pure — fresh per call, for config-driven tests — while route handlers,
 * server components, and `deriveContext` share this **memoized** instance.
 *
 * Memoization is what makes keyless practice mode work interactively: the
 * in-memory stores live in the adapter, so a process-wide singleton keeps a
 * family and its members across requests in a `next dev` process. In real mode
 * the Supabase adapter is stateless over the shared DB, so reuse is just thrift.
 *
 * The cache hangs off `globalThis` — the standard Next.js pattern — so it
 * survives per-route module bundling and dev HMR re-evaluation, which a plain
 * module-level binding does not (each route bundle would get its own empty store).
 */
const globalForPorts = globalThis as typeof globalThis & {
  __serverPorts?: Ports;
};

export function serverPorts(): Ports {
  globalForPorts.__serverPorts ??= buildPorts(readEnv());
  return globalForPorts.__serverPorts;
}

/** `makeApp` over the shared server ports — the session edge for the app/ layer. */
export function serverApp(): App {
  return makeApp(serverPorts());
}
