// The default (keyless) test suite must NEVER touch a real backend. Vitest loads
// the gitignored `.env` into `process.env`, so without this a test that resolves
// the env-selected composition — `serverPorts()` / `buildPorts(readEnv())` — would
// pick up real SUPABASE_* creds and WRITE to the live project (the true source of
// the prod orphans: the serverPorts singleton test created a family on prod, #103).
//
// Strip the real-mode selectors (see src/composition/env.ts) before any test runs
// so the env-derived stack is always keyless (fake judge + in-memory), exactly as
// CI runs it (CI has no `.env`). The gated `*.supabase.test.ts` use their own
// config (vitest.supabase.config.ts), which loads `.env` and is excluded here.
const REAL_MODE_PREFIXES = ["SUPABASE_", "NEXT_PUBLIC_SUPABASE_", "JUDGE_"];

for (const key of Object.keys(process.env)) {
  if (REAL_MODE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    delete process.env[key];
  }
}
