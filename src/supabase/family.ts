import type { SupabaseContext } from './client';

/**
 * Find-or-create the single seeded family (the families analog of the container's
 * `ensureSeededChore`). v1 is single-family: the first `families` row by
 * `created_at` IS the family, and we create one named `name` if none exists. This
 * is the ONLY `families` access in the app — there is intentionally no families
 * port/service yet (account management is the deferred auth slice), so this
 * raw-client helper sits alongside `client.ts`/`storage.ts` inside the
 * SDK-confinement zone rather than leaking a `.from('families')` call into
 * `container.ts`. Loaded by the same dynamic `import()` the container already uses,
 * so the SDK still never enters the browser bundle.
 *
 * Returns the family id the three Supabase stores bind to. The row is "ownerless"
 * (no `users` reference it) until the auth slice provisions a parent — fine,
 * because the server uses the service-role key, which bypasses RLS.
 *
 * Like `ensureSeededChore`, there is a benign cold-start race if two server
 * instances seed simultaneously (no uniqueness constraint yet); acceptable for v1,
 * hardened with the deferred accounts work.
 */
export async function ensureSeededFamily(ctx: SupabaseContext, name: string): Promise<string> {
  const existing = await ctx.client
    .from('families')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`Failed to load seeded family: ${existing.error.message}`);
  }
  if (existing.data) {
    return (existing.data as { id: string }).id;
  }
  const created = await ctx.client.from('families').insert({ name }).select('id').single();
  if (created.error || !created.data) {
    throw new Error(`Failed to seed family: ${created.error?.message ?? 'no row returned'}`);
  }
  return (created.data as { id: string }).id;
}
