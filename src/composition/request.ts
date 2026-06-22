import { cookies } from "next/headers";

import { familyId, memberId } from "@/domain/shared/ids";
import type { RequestContext } from "@/ports/context";
import { findActingParent } from "@/usecases/auth";

import { isRealMode } from "./env";
import { serverPorts } from "./server";
import { type Identity, resolveContext } from "./session";
import { createSupabaseServerClient } from "./supabase";

/**
 * The request-scoped composition glue (design §4.2, §11). It turns the live HTTP
 * request — Supabase session cookies in real mode, the practice cookie in keyless
 * mode — into the {@link RequestContext} the use-cases run on. Kept apart from the
 * pure `session.ts` kernel so no Next runtime import (`next/headers`) leaks into
 * the node test path; this module is only ever imported by the app/ layer.
 */

/** App-level active-profile selection: which member is acting (§3.1). */
export const ACTIVE_MEMBER_COOKIE = "active_member";
/** Keyless practice mode: the bootstrapped family this device is "logged in" as. */
export const PRACTICE_FAMILY_COOKIE = "practice_family";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
} as const;

/**
 * Resolve the proven identity (family + parent) for this request, or `null` when
 * the device is not authenticated — the signal to redirect to `/login`.
 */
export async function deriveIdentity(): Promise<Identity | null> {
  const store = await cookies();

  if (isRealMode()) {
    // Read-only auth client: server components can't write cookies; the
    // proxy already refreshed the session on this request (§3.1).
    const supabase = createSupabaseServerClient({
      getAll: () => store.getAll(),
      setAll: () => {},
    });
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const parent = await findActingParent(serverPorts(), data.user.id);
    if (!parent.ok) return null;
    return { familyId: parent.value.familyId, parent: parent.value };
  }

  const fid = store.get(PRACTICE_FAMILY_COOKIE)?.value;
  if (!fid) return null;
  const members = await serverPorts().members.listMembers(familyId(fid));
  const parent = members.find((m) => m.kind === "parent");
  if (!parent) return null;
  return { familyId: familyId(fid), parent };
}

/**
 * Build the full request context: proven identity + the app-level active profile
 * (the `active_member` cookie, validated against the family). `null` means not
 * authenticated.
 */
export async function deriveContext(): Promise<RequestContext | null> {
  const identity = await deriveIdentity();
  if (!identity) return null;
  const store = await cookies();
  const active = store.get(ACTIVE_MEMBER_COOKIE)?.value ?? null;
  return resolveContext(
    serverPorts(),
    identity,
    active ? memberId(active) : null,
  );
}

/** Set the active profile cookie (used by login + the profile switch route). */
export async function setActiveMember(id: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_MEMBER_COOKIE, id, COOKIE_OPTS);
}

/** Enter keyless practice mode: anchor the family + default to the parent. */
export async function setPracticeSession(
  familyIdValue: string,
  founderId: string,
): Promise<void> {
  const store = await cookies();
  store.set(PRACTICE_FAMILY_COOKIE, familyIdValue, COOKIE_OPTS);
  store.set(ACTIVE_MEMBER_COOKIE, founderId, COOKIE_OPTS);
}

/** Clear all app session cookies (used by logout). */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(ACTIVE_MEMBER_COOKIE);
  store.delete(PRACTICE_FAMILY_COOKIE);
}
