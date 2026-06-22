# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## What this is

**Family Chore Tracker** — a web app for **AI photo-based family chore
verification**. A kid completes a chore, photographs it, and submits; a vision
**judge** (Anthropic or Gemini) returns an *advisory* verdict; the submission
enters `pending_review`; a **parent's approve/reject is authoritative**.
Approved chores credit **points** (append-only ledger; redemption deferred).

The app runs in two configurations, **proven equivalent by contract tests**:

- **Keyless (practice) mode** — fake judge, in-memory stores, system clock. No
  accounts, no network, no AI spend. The default for local dev and the test suite.
- **Real mode** — Supabase (Postgres/Auth/Storage) + a real vision provider,
  switched on by the presence of env keys.

**Status:** rebuilt from scratch after a repo reset. **M0 (scaffold & seams) is
complete**; the in-progress milestone is **M1 — Accounts & profiles**.

> **Source of truth:** the architecture & design spec at
> [`docs/superpowers/specs/2026-06-21-family-chore-tracker-design.md`](docs/superpowers/specs/2026-06-21-family-chore-tracker-design.md).
> When code and spec disagree, the spec wins — update it in the same PR if intent changed.

> **Do not build on `ABANDONED/*`.** A pre-reset codebase survives only on those
> branches. It is dead; never merge from or copy it. Current `main` is the only line.

## Architecture: Ports & Adapters + an ergonomic session edge

```
Screens (Next.js App Router, thin)        — call a use-case, then render
        │  (depends downward only)
Session edge      makeApp(ports).as(ctx)   — binds family + acting member once
        │
Use-cases (pure orchestration)             — one call hides many seams; returns Result
        │
Domain core (pure)                         — state machine · points · recurrence · verdict
        ▼
Ports (the 4 seams)  ◄── Adapters          — wired only at the composition root
```

**The dependency rule (enforced by CI):**
- `domain/` and `usecases/` import **only** `ports/` — never an adapter, never `process.env`.
- `composition/` is the **only** place that imports adapters or reads env — the single
  keyless-vs-real switch.
- A guard test, [`test/architecture/dependency-rule.test.ts`](test/architecture/dependency-rule.test.ts),
  fails CI if anything outside `composition/` reads `process.env` or imports an adapter.

**Layout** (see spec §11 for the full target):
```
src/
  domain/{chore,submission,points,family}/   pure logic + types  (kernel = domain/shared/)
  ports/{judge,repositories,photo-storage,clock,context}.ts   Ports aggregate from ports/index.ts
  usecases/{family,chores,submission,review,points}.ts
  app-session/app.ts                         makeApp(ports).as(ctx) → Session
  adapters/{judge,persistence/{in-memory,supabase},storage,clock}/
  composition/{env.ts,container.ts}          the only env/adapter seam
  app/                                       Next.js App Router (thin)
test/{contract,usecases,architecture,domain,adapters,composition}/
```

## The four seams

`judge` · `repositories` · `photo-storage` · `clock`. Each is one interface with
≥2 adapters selected at the composition root. The in-memory/fake side is the
**executable spec**; one **contract suite per seam** runs both sides to prove them
interchangeable. Supabase adapters (M3/M6) run through the *same* suites.

- Adapters are **factory functions**.
- In-memory repos are **family-scoped**: every method takes `familyId`, and
  cross-family reads resolve to `null`/`not_found` — mirroring Supabase RLS so
  in-memory behaves like the real DB.
- `IsoDate`/`IsoInstant`/`Verdict` live in `ports/`; domain imports them (the
  spec §4.1-permitted domain→ports edge).

## Application interface

- Every use-case is a pure function `(ports, ctx, input) => Promise<Result<T>>`,
  also reachable via the session facade `app.as(ctx).<verb>(…)`.
- **`Result<T>`** + a **closed `AppError` set** (spec §8.2): expected failures are
  *values*, not exceptions, for compiler-checked exhaustive UI handling. Adapters
  may throw on true infra faults; use-cases catch and map (e.g. `judge_unavailable`).
- **Capability is enforced inside each use-case** against `ctx.actor`
  (`{ kind: 'parent' | 'kid', memberId }`). Identity is proven at the edge; the
  PIN is an app-level gate, not a security boundary (spec §3.1).
- Every use-case re-checks `ctx.familyId` against loaded entities.

## Commands

```bash
npm run dev        # next dev
npm run build      # next build
npm run lint       # eslint (flat config)
npm run typecheck  # next typegen && tsc --noEmit
npm run test       # vitest run
```

## Toolchain gotchas

- `typecheck` is `next typegen && tsc --noEmit` — `next typegen` **must** run first
  so generated route types + `next-env.d.ts` exist (CI's standalone job needs them).
- **Pin `eslint` to `^9` and `typescript` to `^5`.** `eslint-config-next@16` bundles
  `typescript-eslint@8`, which does **not** support ESLint 10 / TS 6 (both now
  "latest" on npm and will break `lint`).
- Next 16 ESLint = native **flat config** (`eslint-config-next/core-web-vitals` +
  `/typescript`); no `FlatCompat`.
- `turbopack.root` is pinned in `next.config.ts` (a stray parent-dir lockfile);
  `next-env.d.ts` is gitignored.
- Vitest runs the **node** env and strips types — type-level assertions
  (`@ts-expect-error`, `expectTypeOf`) are enforced by the **`typecheck`** gate, not
  `vitest run`.

## Working conventions

- **One issue at a time, TDD (red → green).** One branch + one PR per issue
  (`feat/…`, `fix/…`). Commit only on green. Squash-merge. Branch the next issue off
  the freshly merged `main`.
- **Test layers:** domain (pure units) · use-cases through
  [`test/usecases/harness.ts`](test/usecases/harness.ts) `makeTestApp()` (in-memory +
  fixed clock + fake judge) · contract suites
  `test/contract/<seam>.contract.ts` exporting `run<Seam>Contract(label, makeAdapter)`,
  wired for in-memory by [`test/contract/in-memory.test.ts`](test/contract/in-memory.test.ts).
- **Required CI checks (must stay green):** `lint`, `typecheck`, `test`, `build`,
  `secret-scan`, `pr-title` (Conventional Commits). PR titles must be conventional.
- **Deploys are gated, never automatic.** The `production` GitHub environment has a
  manual-approval (`required_reviewers`) rule, so each merge to `main` *queues* a
  Deploy-to-Vercel run that waits for approval in the Actions UI. Merging is safe;
  nothing ships until approved.
- **Secrets** live only in env (`.env` is gitignored). Never commit keys.

## Where Supabase connects

The two things that can't be meaningfully faked connect when their feature is built:
**login → M1**, **photo storage → M3**. Chore/points **data** stays on the in-memory
adapter until **M6**, where the contract test makes the swap low-risk.
