# Namespaced local `.env` for both Supabase projects (staging-default)

> **Status:** Approved (brainstormed 2026-06-23). Local-developer-ergonomics
> change only — no application-runtime or Vercel behaviour changes.
>
> **Date:** 2026-06-23

## 1. Problem

The local, gitignored `.env` holds **one** set of Supabase credentials under the
canonical names the app reads (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ANON_KEY`, `SUPABASE_STORAGE_BUCKET`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`). When those values point at **production**, a
local `npm run dev` or `npm run test:supabase` writes to the **live** database —
the traced root cause of production "test orphan" rows.

## 2. Goal

Local dev **and** the gated live-DB tests default to the **staging** project
(`mbzuvvtqtyhdiohiukgo`) so nothing local can write to production
(`ayuhskelywuvdcggomre`) again. Targeting production must be an explicit,
deliberate opt-in, never the accidental default.

## 3. Constraints (these shape the whole design)

1. **The deployed app does not read `.env`.** On Vercel, the staging (Preview)
   and production builds get their `SUPABASE_*` / `NEXT_PUBLIC_SUPABASE_*` from
   Vercel's per-environment variables, pulled by `vercel pull` and built with
   `vercel build` in `.github/workflows/deploy.yml`. → Do not rename what the app
   reads; do not touch Vercel env. This is a **local-only** change.
2. **`NEXT_PUBLIC_*` are inlined at build time** into the client bundle. They
   must already hold the selected target's values *before* `next dev` / `next
   build` runs.
3. **Dependency-rule guard** (`test/architecture/dependency-rule.test.ts`): only
   files under `src/composition/` may read `process.env` or import an adapter. →
   All resolver logic lives in `scripts/` (and the vitest config), never in `src/`.
4. **The CI `build` check runs `npm run build`** (via
   `.github/scripts/run-script.sh`) in a **keyless** environment — no `.env`, no
   Supabase vars. The deploy pipeline uses `vercel build` (unaffected). → Wiring
   the resolver into `npm run build` means the resolver must **no-op cleanly**
   when no namespaced vars are present, or it breaks the required CI `build`.

## 4. Design

### 4.1 `.env` shape (single source of truth)

The gitignored `.env` holds one switch plus two clearly-labeled blocks. The old
canonical `SUPABASE_*` / `NEXT_PUBLIC_SUPABASE_*` lines are **removed** (now
generated). `JUDGE_*` lines are unchanged.

```
SUPABASE_TARGET=stage          # stage | prod — local dev + gated tests target

# --- Staging (mbzuvvtqtyhdiohiukgo) — DEFAULT, safe local target ---
SUPABASE_STAGE_URL=https://mbzuvvtqtyhdiohiukgo.supabase.co
SUPABASE_STAGE_SERVICE_ROLE_KEY=<staging service_role>
SUPABASE_STAGE_ANON_KEY=<staging anon>

# --- Production (ayuhskelywuvdcggomre) — explicit opt-in only ---
SUPABASE_PROD_URL=https://ayuhskelywuvdcggomre.supabase.co
SUPABASE_PROD_SERVICE_ROLE_KEY=<prod service_role>
SUPABASE_PROD_ANON_KEY=<prod anon>
```

Optional `SUPABASE_{STAGE,PROD}_STORAGE_BUCKET`; both default to `chore-photos`.

### 4.2 The resolver (pure core + thin CLI, both in `scripts/`)

**`scripts/resolve-supabase-env.mjs`** — a pure, exported, unit-tested function
`resolveSupabaseEnv(env) → { target, canonical }`:

- `target` = `(env.SUPABASE_TARGET ?? "stage").toLowerCase()`; throws on any value
  other than `stage` / `prod`.
- Reads `SUPABASE_<TARGET>_URL` / `_SERVICE_ROLE_KEY` / `_ANON_KEY` /
  `_STORAGE_BUCKET`.
- **No-op rule:** if `SUPABASE_<TARGET>_URL` is absent → returns
  `{ target, canonical: null }` with **no error** (keyless / CI / unconfigured).
- **Fail-loud rule:** if the URL is present but `_SERVICE_ROLE_KEY` or `_ANON_KEY`
  is missing → throws, naming the missing key(s) (genuine misconfiguration).
- Otherwise returns `canonical`:
  ```
  SUPABASE_URL                  = <target>_URL
  SUPABASE_SERVICE_ROLE_KEY     = <target>_SERVICE_ROLE_KEY
  SUPABASE_ANON_KEY             = <target>_ANON_KEY
  SUPABASE_STORAGE_BUCKET       = <target>_STORAGE_BUCKET ?? "chore-photos"
  NEXT_PUBLIC_SUPABASE_URL      = <target>_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY = <target>_ANON_KEY
  ```

**`scripts/write-supabase-env-local.mjs`** — the CLI wired into `package.json`:
`loadEnv()` (dotenv reads `.env`) → `resolveSupabaseEnv(process.env)` → if
`canonical` is null, log a notice and exit 0 (keyless no-op); else write the
canonical pairs to a gitignored **`.env.local`** (a generated, banner-commented
file) and log the active target loudly, e.g.
`Supabase env → STAGE (https://mbzuvvtqtyhdiohiukgo.supabase.co)`, with an extra
warning line when the target is `prod`.

`.env.local` is chosen because Next.js loads it natively with precedence over
`.env`, so no process-spawn wrapper (and its Windows signal/exit-code fragility)
is needed — just an `&&` chain in the npm script.

### 4.3 Wiring

- **`package.json`:**
  ```
  "dev":   "node scripts/write-supabase-env-local.mjs && next dev",
  "build": "node scripts/write-supabase-env-local.mjs && next build",
  "start": "node scripts/write-supabase-env-local.mjs && next start",
  ```
  `test:supabase` is unchanged (resolver wired via the vitest config instead).
- **`vitest.supabase.config.ts`:** after `loadEnv()`,
  `const { canonical } = resolveSupabaseEnv(process.env); if (canonical) Object.assign(process.env, canonical);`
  — gated tests default to staging in-process; `SUPABASE_TARGET=prod npm run
  test:supabase` opts into prod.

### 4.4 Explicitly unchanged

`src/composition/env.ts`, `src/composition/supabase.ts`, the four
`*.supabase.test.ts` files (all read canonical names the resolver now
populates), `test/setup/keyless-env.ts` (its `SUPABASE_` prefix already strips
the new `SUPABASE_STAGE_*` / `SUPABASE_PROD_*` / `SUPABASE_TARGET` → the keyless
suite stays hermetic), all Vercel env, and `.env.vercel.local`. `.gitignore`
already ignores `.env.local` (`.env.*` with `!.env.example`).

## 5. Why not the alternatives

- **Staging values hardwired into the canonical names in `.env`** (lighter
  variant): zero script churn, but the staging values are duplicated (canonical +
  `STAGE` block → two-place key rotation) and the dev target isn't switchable
  without hand-editing. Rejected in favour of a single source of truth + one
  switch covering both dev and tests.
- **Process-spawn wrapper** (`node wrapper.mjs next dev`): the originally-proposed
  mechanic, but spawning `next` and forwarding signals/exit codes is fragile on
  Windows. Replaced by generating `.env.local` and letting Next load it natively.

## 6. Testing & verification

Unit-test `resolveSupabaseEnv` first (red→green), in the keyless `npm run test`
suite (pure, hermetic — passes explicit env objects, not `process.env`):

- default target is `stage` when `SUPABASE_TARGET` is unset;
- maps the stage block → canonical, including the `NEXT_PUBLIC_*` mirror and the
  `chore-photos` bucket default;
- maps the prod block when `SUPABASE_TARGET=prod`;
- returns `canonical: null` (no throw) when the target URL is absent (keyless/CI);
- throws, naming the missing key, when the URL is present but service-role / anon
  is missing;
- throws on an invalid `SUPABASE_TARGET`.

Then end-to-end:

- `npm run test` (keyless) green; production families stay **0** (verify via
  Supabase MCP).
- `SUPABASE_TARGET=stage npm run test:supabase` → 31/31 green against **staging**;
  rows land in staging, production untouched.
- `npm run dev` → a local signup writes to **staging** (verify via MCP row count).
- `npm run build` succeeds with `NEXT_PUBLIC_*` from the selected target; the CI
  keyless `build` stays green (resolver no-ops).
- `npm run lint && npm run typecheck` green (dependency-rule guard still passes).

## 7. Out of scope

Any change to the deployed app's env, the Vercel pipeline, the canonical names
the app reads, or the keyless-mode behaviour. This change only restructures the
local `.env` and how local dev / gated tests select a Supabase target.
