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
