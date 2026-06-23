import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/composition/database.types";

const NO_ID = "00000000-0000-0000-0000-000000000000"; // matches no real row → deletes all

/**
 * Reset the shared live test DB to empty (#103): every `public` table AND every
 * auth user, in one place, so a gated `test:supabase` run can never leave
 * orphaned families/members — or dangling auth accounts — behind. Service-role
 * bypasses RLS.
 *
 * Errors are surfaced, not swallowed: the M1 residue came from a wipe that could
 * fail silently and accumulate. Run this in BOTH `beforeEach` and `afterAll` so a
 * crashed run is still cleaned by the next run's `beforeEach`.
 *
 * ⚠️ Destructive — only ever point the gated suite at a NON-production project.
 */
export async function resetSupabase(
  client: SupabaseClient<Database>,
): Promise<void> {
  // Children → parents. FKs cascade, but delete explicitly + in order.
  const ledger = await client.from("points_ledger").delete().neq("id", NO_ID);
  if (ledger.error) throw ledger.error;
  const subs = await client.from("submissions").delete().neq("id", NO_ID);
  if (subs.error) throw subs.error;
  const inst = await client.from("chore_instances").delete().neq("id", NO_ID);
  if (inst.error) throw inst.error;
  const tmpl = await client.from("chore_templates").delete().neq("id", NO_ID);
  if (tmpl.error) throw tmpl.error;
  const members = await client.from("members").delete().neq("id", NO_ID);
  if (members.error) throw members.error;
  const families = await client.from("families").delete().neq("id", NO_ID);
  if (families.error) throw families.error;

  // Purge auth users too — a wiped family must not leave a dangling account
  // (the M1 residue was families/members with no corresponding auth user).
  const { data, error } = await client.auth.admin.listUsers();
  if (error) throw error;
  for (const user of data.users) {
    const removed = await client.auth.admin.deleteUser(user.id);
    if (removed.error) throw removed.error;
  }
}
