# Family Chore Tracker — Wiki

The developer **and** user wiki for **Family Chore Tracker**: AI photo-based family chore
verification. A kid photographs a finished chore and submits it; an AI **judge** (Anthropic or
Gemini) returns an *advisory* verdict; a **parent's approve/reject is authoritative**. Approved
chores credit points on an append-only ledger.

> **Status:** v1 feature-complete (milestones M0–M7). The authoritative design is the
> [architecture & design spec](../superpowers/specs/2026-06-21-family-chore-tracker-design.md);
> this wiki is the navigable, task-oriented companion to it.

---

## Table of contents

### Start here
- **[Glossary](glossary.md)** — the vocabulary: advisory judge, verdict, seam, template vs instance, ledger, PIN gate, keyless mode…
- **[User guide](user-guide.md)** — how a parent and a kid actually use the app, end to end.

### Understand the system
- **[Architecture](architecture.md)** — ports & adapters, the four seams, the dependency rule, and *where to start reading the code*.
- **[Data model & state machine](data-model.md)** — the tables, the submission/instance lifecycle (with a diagram), RLS tenancy, and the points ledger.
- **[API reference](api-reference.md)** — the 12 HTTP routes: method, auth, request/response, and error→status mapping.

### Build & operate
- **[Configuration](configuration.md)** — environment variables, the two run modes, and the keyless-vs-real switch.
- **[Testing guide](testing-guide.md)** — the test layers, keyless vs `test:supabase`, and how to add a test at each layer.
- **[Deployment & operations](deployment.md)** — the staging→gated-production pipeline, first-time setup, rollback, and smoke checks.

### Authoritative & governance docs (elsewhere in the repo)
- [Design spec](../superpowers/specs/2026-06-21-family-chore-tracker-design.md) — the source of truth; when code and spec disagree, the spec wins.
- [Supabase env-namespacing design](../superpowers/specs/2026-06-23-supabase-env-namespacing-design.md) · [SDLC enforcement design](../superpowers/specs/2026-06-20-github-sdlc-enforcement-design.md)
- [README](../../README.md) · [CHANGELOG](../../CHANGELOG.md) · [CONTRIBUTING](../../.github/CONTRIBUTING.md) · [SECURITY](../../.github/SECURITY.md)
- [CLAUDE.md](../../CLAUDE.md) — conventions for working in the repo (the dependency rule, toolchain gotchas).
- Runbook: [orphaned-photo GC](../ops/chore-photos-gc.md)
- Reports: [v1 retrospective](../reports/2026-06-23-retrospective-m0-m7.md) · [multi-platform demo](../reports/2026-06-23-multi-platform-demo-report.md)

---

## The 30-second model

```
Parent creates a chore ─▶ Kid photographs it ─▶ AI judge gives an *advisory* verdict
        ▲                                                      │
        │                                                      ▼
   Points credited ◀── Parent approves/rejects (authoritative) ── submission waits in review
```

Two configurations, **proven equivalent by contract tests**, chosen automatically from which env
keys are present:

| | Keyless (practice) | Real |
|---|---|---|
| **When** | no Supabase keys | `SUPABASE_URL` + service-role key set |
| **Persistence** | in-memory (per-process) | Supabase Postgres + per-family RLS |
| **Auth** | one-click practice family | Supabase Auth (parents) + PIN (kids) |
| **Judge** | fake (deterministic) | Anthropic → Gemini → fake |
| **Photos** | in-memory (`memory://`) | Supabase Storage (signed URLs) |

New to the codebase? Read **[Architecture](architecture.md)** then **[Data model](data-model.md)**.
New to the product? Read the **[User guide](user-guide.md)**.
