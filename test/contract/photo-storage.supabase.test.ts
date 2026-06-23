import { afterAll, beforeEach } from "vitest";

import { supabasePhotoStorage } from "@/adapters/storage/supabase";
import { createServiceRoleClient } from "@/composition/supabase";

import { runPhotoStorageContract } from "./photo-storage.contract";

/**
 * Runs the **shared** PhotoStorage contract against live Supabase Storage — the
 * proof that `supabasePhotoStorage` is interchangeable with the in-memory adapter
 * (design §5, §10). Gated: `*.supabase.test.ts` is excluded from the default
 * keyless run + CI; invoke with `npm run test:supabase` (loads `.env`). Needs the
 * `chore-photos` bucket provisioned (supabase/migrations/0002_storage.sql).
 */
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env) to run the Supabase contract.",
  );
}

const client = createServiceRoleClient(url, serviceRoleKey);
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "chore-photos";

// The contract writes these fixed paths; clear them so re-runs start clean.
const TEST_PATHS = ["f1/i1/s1.jpg", "f1/i1/s1.png"];
async function wipe(): Promise<void> {
  await client.storage.from(bucket).remove(TEST_PATHS);
}

beforeEach(wipe);
afterAll(wipe);

runPhotoStorageContract("supabasePhotoStorage", () =>
  supabasePhotoStorage(client, bucket),
);
