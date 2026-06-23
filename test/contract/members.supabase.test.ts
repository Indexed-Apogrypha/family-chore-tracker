import { afterAll, beforeEach } from "vitest";

import { supabaseMemberRepository } from "@/adapters/persistence/supabase/members";
import { createServiceRoleClient } from "@/composition/supabase";

import { runMemberRepositoryContract } from "./member-repository.contract";
import { resetSupabase } from "./supabase-reset";

/**
 * Runs the **shared** MemberRepository contract against the live Supabase DB —
 * the proof that the Supabase adapter is interchangeable with the in-memory one
 * (design §5, §10). Gated: `*.supabase.test.ts` is excluded from the default
 * keyless run + CI; invoke with `npm run test:supabase` (loads `.env`).
 *
 * ⚠️ This wipes all accounts/chore tables between tests — run it only against a
 * dev project, never production.
 */
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env) to run the Supabase contract.",
  );
}

const client = createServiceRoleClient(url, serviceRoleKey);

beforeEach(() => resetSupabase(client));
afterAll(() => resetSupabase(client));

runMemberRepositoryContract("supabaseMemberRepository", () =>
  supabaseMemberRepository(client),
);
