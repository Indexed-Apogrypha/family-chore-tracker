# Configuration

How the app is configured and how it picks a **run mode**. The canonical, commented template is
[`.env.example`](../../.env.example); the local-namespacing design is
[`2026-06-23-supabase-env-namespacing-design.md`](../superpowers/specs/2026-06-23-supabase-env-namespacing-design.md).

---

## Run modes

The mode is chosen **automatically** from which env keys are present — no code change, no flag:

| | Keyless (practice) | Real |
|---|---|---|
| **Trigger** | no Supabase keys | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set |
| **Persistence** | in-memory (per-process) | Supabase Postgres + per-family RLS |
| **Auth** | one-click practice family | Supabase Auth (parents) + PIN (kids) |
| **Judge** | fake (deterministic) | Anthropic → Gemini → fake |
| **Photos** | in-memory (`memory://`) | Supabase Storage (signed URLs) |

Keyless is the default for local dev, the test suite, and CI: no accounts, no network, no AI spend.
The single switch lives in [`src/composition/env.ts`](../../src/composition/env.ts) — the only place
that reads `process.env` (see the [dependency rule](architecture.md#the-dependency-rule)).

---

## Environment variables

Copy `.env.example` to `.env` and fill in what you need. `.env` is **gitignored — never commit
secrets.**

### Judge (vision provider)
| Var | Default | Notes |
|---|---|---|
| `JUDGE_ANTHROPIC_API_KEY` | — | enables the Anthropic judge (takes precedence) |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Anthropic model id |
| `JUDGE_GEMINI_API_KEY` | — | enables the Gemini judge (fallback) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model id |

With neither key, the **fake** judge is used. A real judge **requires Supabase storage** (it reads
the photo via a signed URL).

### Persistence + storage
| Var | Default | Notes |
|---|---|---|
| `SUPABASE_URL` | — | enables real mode (with the service-role key) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **server-only**, bypasses RLS — keep secret |
| `SUPABASE_STORAGE_BUCKET` | `chore-photos` | the private photo bucket |

### Auth (browser)
| Var | Notes |
|---|---|
| `SUPABASE_ANON_KEY` | the public anon key for the `@supabase/ssr` clients |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client-side mirrors |

> ⚠️ **`NEXT_PUBLIC_*` must be non-sensitive.** They are inlined into the browser bundle at build
> time. If they're marked *Sensitive* in Vercel, `vercel pull` hides them and the build inlines
> **empty** values → a site-wide 500. This was the root cause of the prod-500 incidents — see
> [Deployment § The NEXT_PUBLIC gotcha](deployment.md#the-next_public-gotcha-the-prod-500-root-cause).

---

## Forcing keyless with a real `.env` present

To run keyless locally even though `.env` has real keys, start the dev server with the relevant vars
emptied for that one process (empty is falsy, and Next won't override an already-set var). In bash,
prefix each as empty:

```bash
# Empty the real-mode vars for this one run (empty is falsy; Next won't override a set var):
( for v in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY JUDGE_ANTHROPIC_API_KEY JUDGE_GEMINI_API_KEY; do
    export "$v="
  done
  npm run dev )
```

In PowerShell:

```powershell
$env:SUPABASE_URL=''; $env:SUPABASE_SERVICE_ROLE_KEY=''; npm run dev
```

Don't run `next build` while `next dev` is running — both write `.next/`.

---

## Local env namespacing (stage vs prod)

Locally, `.env` holds **both** Supabase projects' keys, namespaced, plus a switch — so a local run
can never accidentally write to production:

- **`SUPABASE_TARGET`** picks the project for `npm run dev` and `npm run test:supabase`. It
  **defaults to `stage`**; production requires deliberately setting `SUPABASE_TARGET=prod` (an env
  override wins, e.g. `SUPABASE_TARGET=prod npm run test:supabase`).
- **Blocks:** `SUPABASE_STAGE_*` (staging, default) and `SUPABASE_PROD_*` (prod, opt-in).
- **Resolver:** [`scripts/resolve-supabase-env.mjs`](../../scripts/resolve-supabase-env.mjs) (pure,
  unit-tested) + [`scripts/write-supabase-env-local.mjs`](../../scripts/write-supabase-env-local.mjs).
  `dev`/`build`/`start` run the CLI first; it copies the selected block onto the **canonical** names
  (`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_*`, …) into a generated, gitignored **`.env.local`** that
  Next loads natively.

**Do not** put canonical `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_*` in `.env` — they're **generated**.
Do not hand-edit `.env.local`. The deployed app is unaffected (Vercel injects canonical names per
environment via `vercel pull` — see [Deployment](deployment.md)).

---

## Related
- [Deployment](deployment.md) — how the same variables are supplied per Vercel scope.
- [Testing guide](testing-guide.md) — the keyless-forcing setup the test suite uses.
- [Architecture § Composition root](architecture.md#composition-root--the-only-switch) — where env is read.
