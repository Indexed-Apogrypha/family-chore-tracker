import { afterAll, beforeEach } from "vitest";

import { supabaseMemberRepository } from "@/adapters/persistence/supabase/members";
import { createServiceRoleClient } from "@/composition/supabase";

import { runMemberRepositoryContract } from "./member-repository.contract";

/**
 * Runs the **shared** MemberRepository contract against the live Supabase DB —
 * the proof that the Supabase adapter is interchangeable with the in-memory one
 * (design §5, §10). Gated: `*.supabase.test.ts` is excluded from the default
 * keyless run + CI; invoke with `npm run test:supabase` (loads `.env`).
 *
 * ⚠️ This wipes `members`/`families` between tests — run it only against the dev
 * project, never production.
 */
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env) to run the Supabase contract.",
  );
}

const client = createServiceRoleClient(url, serviceRoleKey);
const NO_ID = "00000000-0000-0000-0000-000000000000"; // matches no real row → deletes all

async function wipe(): Promise<void> {
  // Delete members first, then families (service-role bypasses RLS).
  await client.from("members").delete().neq("id", NO_ID);
  await client.from("families").delete().neq("id", NO_ID);
}

beforeEach(wipe);
afterAll(wipe);

runMemberRepositoryContract("supabaseMemberRepository", () =>
  supabaseMemberRepository(client),
);
