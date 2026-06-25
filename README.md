# family-chore-tracker

AI photo-based family chore verification: a kid photographs a completed chore and
submits it, a vision **judge** (Anthropic or Gemini) returns an *advisory* verdict,
and a **parent's approve/reject is authoritative**. Approved chores credit points
(append-only ledger).

> **Status:** v1 **feature-complete** (milestones M0–M7 built against the
> **[architecture &amp; design spec](docs/superpowers/specs/2026-06-21-family-chore-tracker-design.md)**).
> The production deploy is **gated on manual approval** (see Deployment). Old code
> lives only in the `ABANDONED/*` branches — never build on them.

## Run modes

The app runs in two configurations, **proven equivalent by contract tests** — the
mode is chosen automatically from which env keys are present (no code change):

| Mode | When | Persistence | Auth | Judge | Photo storage |
|---|---|---|---|---|---|
| **Keyless (practice)** | no Supabase keys | in-memory (per-process) | none — one-click practice family | fake (deterministic) | in-memory (`memory://`) |
| **Real** | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set | Supabase Postgres + per-family RLS | Supabase Auth (parents) + PIN (kids) | Anthropic → Gemini → fake | Supabase Storage (signed URLs) |

Keyless mode is the default for local dev, the test suite, and CI — no accounts,
no network, no AI spend. Real mode switches on by the presence of env keys. See
the degradation contract in [.env.example](.env.example).

## Quick start (keyless practice mode)

```bash
npm install
npm run dev          # http://localhost:3000 — click "Enter practice family"
```

The demo family ships with one parent and one kid (`Kiddo`, PIN `1234`). A parent
creates chores (Manage chores), a kid photographs and submits one (Today's chores),
the parent reviews and approves/rejects it (Review submissions), and points accrue.

If a real `.env` is present but you still want a keyless local run, start
`npm run dev` with the Supabase and judge vars set to empty for that one process —
empty values are falsy, and Next won't override an already-set env var. Clear
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JUDGE_ANTHROPIC_API_KEY`, and
`JUDGE_GEMINI_API_KEY` (in bash, prefix the command with an empty `NAME=` for
each). Don't run `next build` while `next dev` is running — both write `.next/`.

## Configuration

Copy [.env.example](.env.example) to `.env` and fill in what you need. The real
`.env` is gitignored — never commit secrets.

- **Judge:** `JUDGE_ANTHROPIC_API_KEY` (model `CLAUDE_MODEL`, default
  `claude-sonnet-4-6`) → Anthropic, else `JUDGE_GEMINI_API_KEY` (model
  `GEMINI_MODEL`, default `gemini-2.5-flash`) → Gemini, else the keyless fake.
  Anthropic takes precedence when both are set. A real judge requires Supabase
  storage (it reads the photo via a signed URL).
- **Persistence + storage:** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  (server-only, bypasses RLS — keep secret). `SUPABASE_STORAGE_BUCKET` defaults to
  `chore-photos`.
- **Auth (browser):** `SUPABASE_ANON_KEY` and the `NEXT_PUBLIC_SUPABASE_*` mirror
  vars for the App Router `@supabase/ssr` clients.

## Commands

```bash
npm run dev          # next dev (keyless unless .env has Supabase keys)
npm run build        # next build
npm run lint         # eslint (flat config)
npm run typecheck    # next typegen && tsc --noEmit
npm run test         # vitest — keyless; excludes *.supabase.test.ts (the CI suite)
npm run test:supabase  # gated live tests against a Supabase dev DB (needs .env; wipes dev data)
```

The Supabase schema lives in [supabase/migrations/](supabase/migrations/);
regenerate `src/composition/database.types.ts` after a migration (command in that
file's header).

## Architecture

A ports-and-adapters core with an ergonomic session edge, four swappable seams
(judge · persistence · photo storage · clock) whose in-memory and real adapters
are proven equivalent by contract tests, an advisory AI judge with authoritative
parent approval, and an append-only points ledger. The full design is in
**[the design spec](docs/superpowers/specs/2026-06-21-family-chore-tracker-design.md)**;
`CLAUDE.md` summarizes the dependency rule and conventions. *Deferred:* a
service-worker offline shell (the PWA manifest + installability ship in v1).

## Documentation

A full **[developer + user wiki](docs/wiki/README.md)** documents the system in depth:
[architecture](docs/wiki/architecture.md) · [data model & state machine](docs/wiki/data-model.md) ·
[API reference](docs/wiki/api-reference.md) · [testing](docs/wiki/testing-guide.md) ·
[configuration](docs/wiki/configuration.md) · [deployment](docs/wiki/deployment.md) ·
[user guide](docs/wiki/user-guide.md) · [glossary](docs/wiki/glossary.md). Start at the
**[wiki home](docs/wiki/README.md)**. The authoritative design remains the
[spec](docs/superpowers/specs/2026-06-21-family-chore-tracker-design.md); release history is in the
[CHANGELOG](CHANGELOG.md).

## Development workflow

Every change goes through a branch → pull request → required checks
(`lint`, `typecheck`, `test`, `build`, `secret-scan`, `pr-title`) → squash-merge to
`main`; direct pushes to `main` are blocked. See
**[.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)**.

## Deployment

Two environments on **Vercel**, driven by one GitHub Actions workflow
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)):

- **Staging** — every merge to `main` auto-builds and deploys to an **isolated
  staging environment** (its own Supabase project, via Vercel's *Preview* scope) at
  **https://family-chore-tracker-staging.vercel.app**. No gate — validate here freely.
- **Production** — graduating is a **gated rebuild of the same commit** (`github.sha`)
  with production env. The `production` job waits at that environment's
  required-reviewers rule; one approval ships it. (We rebuild rather than byte-promote
  the staging artifact because the staging build bakes in staging's database.)

Merging is always safe — nothing reaches production until approved. Rollback with
`vercel rollback <previous-deployment>`.

**Three aligned environments** — identical variable *names* in every Vercel scope;
only the values differ:

| Scope | Backend | Notes |
|---|---|---|
| Development | keyless (in-memory) | Supabase keys unset → practice mode |
| Preview (staging) | staging Supabase | isolated test data |
| Production | prod Supabase | live |

Each real scope needs `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` (secrets)
plus its `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*`, and `JUDGE_GEMINI_API_KEY`. Vercel's
native Git auto-deploy for `main` is **disabled** via [vercel.json](vercel.json)
(`git.deploymentEnabled`) so the GitHub gate stays authoritative; CLI `--prebuilt`
deploys and PR previews are unaffected.

**Migrations** now touch two databases: apply to staging → validate → apply to prod →
graduate; keep them backward-compatible.

## Security

Found a vulnerability? **Don't open a public issue.** Report it privately via
GitHub's **Report a vulnerability** button (Security tab). Policy + scope:
**[.github/SECURITY.md](.github/SECURITY.md)**.
