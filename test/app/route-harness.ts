import { serverPorts } from "@/composition/server";
import { seedPracticeFamily } from "@/composition/session";

/**
 * A request→response integration harness for the API route handlers under
 * `src/app/api/**\/route.ts` (#139). It exercises the real handlers in keyless
 * practice mode — fake judge + in-memory stores (the executable spec) — to assert
 * two things the HTTP edge owns: auth/ctx wiring (cookies → `deriveContext`) and
 * the closed `AppError` → HTTP-status mapping.
 *
 * The handlers read auth from cookies via `next/headers`, a server-only module
 * that cannot be imported in the node test env. The test file therefore mocks
 * `next/headers` with a {@link CookieJar}-shaped store this harness reads and
 * writes — exactly as the practice/login routes do — so no production code needs
 * a test-only seam.
 */

/** A minimal cookie record, matching what `cookies().getAll()` returns. */
interface CookieRecord {
  name: string;
  value: string;
}

/**
 * An in-memory stand-in for Next's request cookie store. Implements the subset
 * of the `cookies()` API the app/ + composition/ layers actually use:
 * `get`, `getAll`, `set`, `delete`.
 */
export class CookieJar {
  private store = new Map<string, string>();

  get(name: string): { name: string; value: string } | undefined {
    const value = this.store.get(name);
    return value === undefined ? undefined : { name, value };
  }

  getAll(): CookieRecord[] {
    return [...this.store.entries()].map(([name, value]) => ({ name, value }));
  }

  set(name: string, value: string): void {
    this.store.set(name, value);
  }

  delete(name: string): void {
    this.store.delete(name);
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Reset the process-wide `serverPorts()` singleton so each test starts on a
 * fresh in-memory family/store. The memoized bundle hangs off `globalThis`
 * (see composition/server.ts), so deleting that key forces a rebuild on the
 * next `serverPorts()` call — the same fresh-stack guarantee the use-case
 * harness gives, but for the real composition the routes import.
 */
export function resetServerPorts(): void {
  delete (globalThis as { __serverPorts?: unknown }).__serverPorts;
}

/**
 * Anchor the harness's cookie jar to a freshly seeded keyless practice family
 * (founding parent + one demo kid), defaulting the active profile to the parent
 * — the post-`/api/auth/practice` state. Returns the seeded family/members so a
 * test can switch the active member or target a known entity.
 */
export async function seedAuthenticatedSession(jar: CookieJar) {
  const seeded = await seedPracticeFamily(serverPorts());
  jar.set("practice_family", seeded.family.id);
  jar.set("active_member", seeded.founder.id);
  return seeded;
}
