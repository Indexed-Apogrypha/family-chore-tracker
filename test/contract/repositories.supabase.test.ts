import { afterAll, beforeEach } from "vitest";

import { supabaseChoreRepository } from "@/adapters/persistence/supabase/chores";
import { supabaseMemberRepository } from "@/adapters/persistence/supabase/members";
import { supabasePointsLedger } from "@/adapters/persistence/supabase/points-ledger";
import { supabaseSubmissionRepository } from "@/adapters/persistence/supabase/submissions";
import { createServiceRoleClient } from "@/composition/supabase";

import { runChoreRepositoryContract } from "./chore-repository.contract";
import { type RepoHarness } from "./harness";
import { runPointsLedgerContract } from "./points-ledger.contract";
import { runSubmissionRepositoryContract } from "./submission-repository.contract";
import { resetSupabase } from "./supabase-reset";

/**
 * Runs the **shared** chore/submission/points contracts against the live Supabase
 * DB — the same suites the in-memory adapters pass (test/contract/in-memory.test.ts),
 * now FK-valid so they run verbatim here too (#117). This replaces the bespoke
 * hand-written integration tests that previously lived in this file.
 *
 * Gated: `*.supabase.test.ts` is excluded from the default keyless run + CI;
 * invoke with `npm run test:supabase` (loads `.env`).
 *
 * ⚠️ Wipes all accounts/chore tables between tests — run only against a dev
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

const supabaseHarness = (): RepoHarness => ({
  members: supabaseMemberRepository(client),
  chores: supabaseChoreRepository(client),
  submissions: supabaseSubmissionRepository(client),
  points: supabasePointsLedger(client),
});

// Reset before each test so the contracts' count assertions hold on the shared
// live DB, and after all so the suite leaves nothing behind (#103).
beforeEach(() => resetSupabase(client));
afterAll(() => resetSupabase(client));

runChoreRepositoryContract("supabase", supabaseHarness);
runSubmissionRepositoryContract("supabase", supabaseHarness);
runPointsLedgerContract("supabase", supabaseHarness);
