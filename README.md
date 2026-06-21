# family-chore-tracker

AI photo-based family chore verification: kids submit a photo of a completed
chore, and a vision "judge" (Anthropic or Gemini) decides whether it passes.

> **Status:** rebuilding from scratch. The governance and CI scaffolding is in
> place; the application is being built against the
> **[architecture &amp; design spec](docs/superpowers/specs/2026-06-21-family-chore-tracker-design.md)**.
> Old code lives only in the `ABANDONED/*` branches.

## Planned stack

- **Next.js 16** + React 19, TypeScript
- **Supabase** — Postgres, Auth, Storage (per-family RLS)
- **Vision judge** — Anthropic / Gemini behind one adapter seam
- **Vitest** for tests

## Architecture

The full design is specified in
**[docs/superpowers/specs/2026-06-21-family-chore-tracker-design.md](docs/superpowers/specs/2026-06-21-family-chore-tracker-design.md)**
— a ports-and-adapters core with an ergonomic session edge, four swappable seams
(judge, persistence, photo storage, clock) whose in-memory and real adapters are
proven equivalent by contract tests, an advisory AI judge with parent approval,
and an M0–M7 delivery plan. Start there before adding application code.

## Development workflow

This repository enforces its SDLC through GitHub's architecture — every change
goes through a branch → pull request → required checks → squash-merge to `main`;
direct pushes to `main` are blocked. See **[.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)**
for the full workflow and the gates every PR must pass.

## Security

Found a vulnerability? **Don't open a public issue.** Report it privately via
GitHub's **Report a vulnerability** button (Security tab). The full policy,
scope, and accepted v1 trade-offs are in **[.github/SECURITY.md](.github/SECURITY.md)**.

## Configuration

Copy [.env.example](.env.example) to `.env` and fill in the keys. The real `.env`
is gitignored — never commit secrets.
