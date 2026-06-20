# family-chore-tracker

AI photo-based family chore verification: kids submit a photo of a completed
chore, and a vision "judge" (Anthropic or Gemini) decides whether it passes.

> **Status:** rebuilding from scratch. The governance and CI scaffolding is in
> place; the application code is being rebuilt. Old code lives only in the
> `ABANDONED/*` branches.

## Planned stack

- **Next.js 16** + React 19, TypeScript
- **Supabase** — Postgres, Auth, Storage (per-family RLS)
- **Vision judge** — Anthropic / Gemini behind one adapter seam
- **Vitest** for tests

## Development workflow

This repository enforces its SDLC through GitHub's architecture — every change
goes through a branch → pull request → required checks → squash-merge to `main`;
direct pushes to `main` are blocked. See **[.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)**
for the full workflow and the gates every PR must pass.

## Configuration

Copy [.env.example](.env.example) to `.env` and fill in the keys. The real `.env`
is gitignored — never commit secrets.
