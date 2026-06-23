// CLI run by the `dev` / `build` / `start` npm scripts (and safe to run by hand).
//
// Loads the gitignored `.env` (the namespaced source of truth), resolves the
// SUPABASE_TARGET block onto the canonical names, and writes them to `.env.local`
// — which Next.js loads natively with precedence over `.env`, so the canonical
// SUPABASE_* (and the build-time-inlined NEXT_PUBLIC_SUPABASE_*) are present
// before `next` starts. This is glue around the unit-tested pure resolver; the
// real I/O is exercised by the end-to-end verification (npm run dev/build).
//
// Keyless / CI: when no SUPABASE_<TARGET>_* block exists the resolver returns
// null and this exits 0 without writing, so wiring it into `npm run build` never
// breaks the keyless CI build.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";

import { formatEnvLocal, resolveSupabaseEnv } from "./resolve-supabase-env.mjs";

loadEnv();

const { target, canonical } = resolveSupabaseEnv(process.env);

if (!canonical) {
  console.log(
    `[supabase-env] no SUPABASE_${target.toUpperCase()}_* configured — keyless mode, leaving .env.local untouched.`,
  );
  process.exit(0);
}

const outPath = fileURLToPath(new URL("../.env.local", import.meta.url));
writeFileSync(outPath, formatEnvLocal(target, canonical));

const summary = `[supabase-env] → ${target.toUpperCase()} (${canonical.SUPABASE_URL})`;
if (target === "prod") {
  console.warn(`⚠️  ${summary} — LOCAL IS TARGETING PRODUCTION`);
} else {
  console.log(summary);
}
