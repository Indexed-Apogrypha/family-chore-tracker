import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The shared Supabase client factory — the single place (alongside the three
 * `supabaseStore.ts` adapters and `storage.ts`) that imports the Supabase SDK.
 * It is the persistence-side analog of `judge/gemini.ts`: the live vendor
 * client lives here, behind the env, and is NEVER re-exported from a module
 * `index.ts`, so importing the chore/reference/submission cores never pulls in
 * `@supabase/supabase-js`.
 *
 * Deliberately NOT `import 'server-only'`: the core stays framework-portable
 * (it's typechecked by tsconfig.core.json and could run under `tsx`). The
 * server-only boundary lives in `lib/server/container.ts`, whose dynamic
 * `import()` is what keeps this SDK out of the browser bundle.
 *
 * Mirrors `GeminiJudgeOptions`: overridable opts fall back to env, and a missing
 * required value throws at construction.
 */
export interface SupabaseStoreOptions {
  /** Project URL. Defaults to process.env.SUPABASE_URL. */
  url?: string;
  /** Service-role key (bypasses RLS). Defaults to process.env.SUPABASE_SERVICE_ROLE_KEY. */
  serviceRoleKey?: string;
  /** Storage bucket for photo bytes. Defaults to process.env.SUPABASE_STORAGE_BUCKET. */
  bucket?: string;
}

/** A constructed client plus the bucket name, shared by the three adapters. */
export interface SupabaseContext {
  /** The client used for table (DB) I/O. Service-role here, or — once the app
   *  flips on Auth — a per-request authenticated (anon-key + user-JWT) client, so
   *  the per-family RLS policies actually enforce. The adapters can't tell which. */
  client: SupabaseClient;
  bucket: string;
  /**
   * Optional separate client for Storage object I/O; defaults to `client`. Under
   * the authenticated-client flip the DB `client` respects RLS, but photo bytes
   * still go through the service-role client here: the private bucket has no
   * per-family object policies yet (paths aren't family-prefixed), and an object
   * path is only discoverable via a family-scoped DB row, so this is a documented
   * v1 compromise, not a hole. A future slice adds family-prefixed paths + Storage
   * RLS and drops this back to `client`.
   */
  storageClient?: SupabaseClient;
}

export function createSupabaseContext(opts: SupabaseStoreOptions = {}): SupabaseContext {
  const url = opts.url ?? process.env.SUPABASE_URL;
  const serviceRoleKey = opts.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = opts.bucket ?? process.env.SUPABASE_STORAGE_BUCKET;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set; cannot construct the Supabase stores.',
    );
  }
  if (!bucket) {
    throw new Error(
      'SUPABASE_STORAGE_BUCKET is not set; cannot construct the Supabase stores.',
    );
  }
  // A service-role server client: no session persistence or token refresh.
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, bucket };
}
