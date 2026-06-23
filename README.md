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

## Development workflow

Every change goes through a branch → pull request → required checks
(`lint`, `typecheck`, `test`, `build`, `secret-scan`, `pr-title`) → squash-merge to
`main`; direct pushes to `main` are blocked. See
**[.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)**.

## Deployment

Production deploys to **Vercel** through a **gated GitHub Actions workflow**
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)): a merge to `main`
*queues* a deploy that waits for **manual approval** in the Actions UI (the
`production` environment's required-reviewers rule). Merging is always safe —
nothing ships until approved. The deploy needs `VERCEL_TOKEN` / `VERCEL_ORG_ID` /
`VERCEL_PROJECT_ID` and the production `SUPABASE_*` secrets configured on the
`production` environment, and Vercel's native Git auto-deploy disabled so the
GitHub gate stays authoritative.

## Security

Found a vulnerability? **Don't open a public issue.** Report it privately via
GitHub's **Report a vulnerability** button (Security tab). Policy + scope:
**[.github/SECURITY.md](.github/SECURITY.md)**.
