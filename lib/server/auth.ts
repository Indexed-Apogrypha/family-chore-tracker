import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseContext } from '../../src/supabase/client';

/**
 * The auth seam — env-gated exactly like persistence and the judge. AUTH is ON
 * only when the authenticated-client key (`SUPABASE_ANON_KEY`) is present
 * alongside the persistence keys; otherwise the app runs in the legacy
 * single-implicit-family / role-by-URL mode with no login (the keyless default
 * here + in CI), so the whole auth layer is transparent when unconfigured.
 *
 * Two clients, by design — the service-role/authenticated split that makes RLS
 * real:
 *  - the per-request AUTHENTICATED client (anon key + the user's session cookies)
 *    is what user-facing reads/writes go through, so the per-family RLS policies
 *    (0002/0003) actually enforce;
 *  - the service-role ADMIN client (`getAdminContext`) is kept only for privileged
 *    provisioning (creating families/users, minting child auth users) and for
 *    Storage object I/O (the private bucket has no per-family object policies yet).
 *
 * `import 'server-only'` keeps the cookie/session handling off the client bundle.
 */

export type Role = 'parent' | 'child';

export interface Identity {
  userId: string;
  familyId: string;
  role: Role;
  /** A child's login handle; null for parents (who sign in by email). */
  username: string | null;
}

/** True when real Supabase Auth + RLS are configured (else legacy keyless mode). */
export function authMode(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * The per-request authenticated server client: anon key + the user's session
 * cookies (the JWT), so Postgres sees role `authenticated` + `auth.uid()` and the
 * RLS policies apply. `cache()` memoizes it within one request render/action.
 * Cookie WRITES only land in a Server Action / Route Handler; in a Server
 * Component render they throw, and the middleware is what actually refreshes the
 * session — so we swallow that throw. Only call in `authMode()`.
 */
export const getAuthedClient = cache(async (): Promise<SupabaseClient> => {
  const cookieStore = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Component render: cookies are read-only here; middleware refreshes.
        }
      },
    },
  });
});

/** The service-role admin context (bucket + service-role client). Bypasses RLS. */
export const getAdminContext = cache(async (): Promise<SupabaseContext> => {
  const { createSupabaseContext } = await import('../../src/supabase/client');
  return createSupabaseContext();
});

/**
 * The current session resolved to a domain `Identity` via the user's OWN `users`
 * row (RLS policy `users_select_self`). `null` when not signed in (or the row is
 * missing — e.g. provisioning failed mid-way). Per-request cached.
 */
export const getIdentity = cache(async (): Promise<Identity | null> => {
  const client = await getAuthedClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from('users')
    .select('family_id, role, username')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { family_id: string; role: Role; username: string | null };
  return { userId: user.id, familyId: row.family_id, role: row.role, username: row.username };
});

/** Redirect to /login unless signed in; otherwise return the `Identity`. */
export async function requireUser(): Promise<Identity> {
  const identity = await getIdentity();
  if (!identity) redirect('/login');
  return identity;
}

/** Require a parent; a signed-in child is bounced to their own home. */
export async function requireParent(): Promise<Identity> {
  const identity = await requireUser();
  if (identity.role !== 'parent') redirect('/child');
  return identity;
}

/** Require a child; a signed-in parent is bounced to their own home. */
export async function requireChild(): Promise<Identity> {
  const identity = await requireUser();
  if (identity.role !== 'child') redirect('/parent');
  return identity;
}
