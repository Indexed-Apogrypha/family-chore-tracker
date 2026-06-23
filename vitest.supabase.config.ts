import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

import { resolveSupabaseEnv } from "./scripts/resolve-supabase-env.mjs";

// Gated, live-Supabase test config. Run via `npm run test:supabase` — NOT part
// of the default keyless run or required CI. Loads `.env` (gitignored) so the
// live-DB credentials are present before the suite imports the adapter.
loadEnv();

// Resolve the namespaced SUPABASE_<TARGET>_* block onto the canonical names the
// suites read (SUPABASE_URL / _SERVICE_ROLE_KEY / _ANON_KEY / _STORAGE_BUCKET).
// Defaults to the staging project, so `npm run test:supabase` is safe; opt into
// production deliberately with `SUPABASE_TARGET=prod npm run test:supabase`.
const { canonical } = resolveSupabaseEnv(process.env);
if (canonical) {
  Object.assign(process.env, canonical);
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.supabase.test.ts"],
    // The suites share one live DB and wipe accounts tables — run them one file
    // at a time so they don't race.
    fileParallelism: false,
  },
});
