# Changelog

All notable changes to **Family Chore Tracker**. The format is loosely based on
[Keep a Changelog](https://keepachangelog.com/); the project predates formal version tags, so the v1
history is recorded by **milestone** (M0–M7) as squash-merged to `main`.

> The authoritative design is the
> [architecture & design spec](docs/superpowers/specs/2026-06-21-family-chore-tracker-design.md). A
> deeper narrative of this arc — what worked and what hurt — is in the
> [v1 retrospective](docs/reports/2026-06-23-retrospective-m0-m7.md).

---

## [0.1.0] — v1 feature-complete — 2026-06-23

The first feature-complete version: the full loop **signup → family → chore → photo → AI verdict →
parent approval → points**, in a ports-&-adapters core proven equivalent across keyless and real
modes by contract tests, deployed through a gated staging→production pipeline.

Built from an empty-repo reset (`860b552`, 2026-06-20) across eight milestones.

### M0 — Scaffold & seams (PRs [#83](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/83)–[#91](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/91), [#93](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/93))
- Next.js 16 + TypeScript + Vitest scaffold; CI scripts.
- Domain kernel: `Result`, the closed `AppError` set, branded ids, enums.
- The four port seams (judge · repositories · photo-storage · clock) + in-memory/fake adapters.
- Composition root (env→adapter switch) and the `makeApp(ports).as(ctx)` session edge.
- The **dependency-rule guard test** and the per-seam contract harness.
- Security policy + CodeQL; the committed `CLAUDE.md` project guide.

### M1 — Accounts & profiles (PRs [#94](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/94)–[#101](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/101))
- **Real Supabase Auth** for parents; family bootstrap; kid profiles with PIN.
- Use-cases: `createFamily`, `addKid`, `listMembers`, `verifyKidPin`; active-profile switching.
- The `families` + `members` schema with per-family RLS; auth screens + profile switcher.

### M2 — Chores (PRs [#104](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/104)–[#110](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/110))
- Recurrence (none/daily/weekly) and **lazy, idempotent** instance generation in `getTodayBoard`.
- Use-cases: `createTemplate`, `createOneOff`, `getTodayBoard`; kid board + parent template UI.

### M3 — Submission & photos (PR [#111](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/111))
- **Real Supabase Storage**; the `submitPhoto` orchestration with its documented ordering contract.
- Mobile photo capture; the photo-storage contract suite.

### M4 — AI judge (PR [#114](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/114))
- **Anthropic + Gemini** vision adapters (Anthropic precedence) behind the judge seam; verdict
  persistence; the judge contract suite. Verdicts are advisory only.

### M5 — Review & points (PR [#116](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/116))
- Use-cases: `getReviewQueue`, `decide` (approve/reject), `pointsTotal`.
- The **append-only, idempotent points ledger**; parent review queue + kid points UI.

### M6 — Data → cloud (PR [#118](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/118))
- Supabase adapters for chores/submissions/points; per-family RLS on all tables.
- The repository **contract suites run against Supabase**; composition default flips to real.

### M7 — Polish & deploy (PR [#120](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/120))
- Responsive/PWA pass; `AppError`→UI mapping; deployment docs; the gated production deploy.

### Post-M7 hardening
- Vercel Web Analytics ([#121](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/121)); dependency bumps (#122–123).
- **Deploy pipeline rebuilt** to staging→gated-production with isolated Supabase projects and bounded
  runtime smoke checks ([#127](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/127)–[#130](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/130)); fixed the prod-500 root cause (Sensitive `NEXT_PUBLIC_*`).
- Consolidated M3–M7 review follow-ups ([#131](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/131)); local `.env` namespacing for both Supabase projects ([#132](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/132)).
- Documentation: [multi-platform demo report](docs/reports/2026-06-23-multi-platform-demo-report.md), [v1 retrospective](docs/reports/2026-06-23-retrospective-m0-m7.md), and the [developer + user wiki](docs/wiki/README.md).

### Known gaps (tracked for the next phase)
Seven tech-debt issues are filed and prioritized (#134–#140): infra-fault mapping across use-cases,
Supabase contract suites in CI, atomic `decide`, validated DB-read JSON, migration drift checks,
HTTP-edge tests, and a small `chores.ts` refactor. See the
[retrospective](docs/reports/2026-06-23-retrospective-m0-m7.md#7-code-health-today).

[0.1.0]: https://github.com/Indexed-Apogrypha/family-chore-tracker/commits/main
