import {
  type CookieOptions,
  createBrowserClient,
  createServerClient,
} from "@supabase/ssr";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";

/**
 * Supabase client factories. They live in `composition/` because it is the only
 * place allowed to read env / wire infrastructure (the dependency-rule guard).
 * The rest of the app receives the constructed clients.
 */

/**
 * The server-only **service-role** client (design §9). It BYPASSES RLS, so it
 * must never reach the browser — only the composition root constructs it. There
 * is no user session on this client (it authenticates as the project), so token
 * refresh and session persistence are off.
 */
export function createServiceRoleClient(
  url: string,
  serviceRoleKey: string,
): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * The cookie bridge the caller (proxy / route handler) supplies so the auth
 * client can read and write the session cookies it owns.
 */
export interface SupabaseServerCookies {
  getAll(): { name: string; value: string }[];
  setAll(
    cookies: { name: string; value: string; options: CookieOptions }[],
  ): void;
}

/**
 * Cookie-aware **server** auth client (anon key, design §3.1). The browser-safe
 * `NEXT_PUBLIC_*` vars are read here — the one env-reading module — which both
 * satisfies the dependency-rule guard and lets Next inline them for the browser
 * factory below.
 */
export function createSupabaseServerClient(cookies: SupabaseServerCookies) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies },
  );
}

/** Browser auth client (anon key) — safe to use from Client Components. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
