# Architecture

How the code is shaped and **where to start reading**. The authoritative, exhaustive version is the
[design spec](../superpowers/specs/2026-06-21-family-chore-tracker-design.md) (§-numbers below refer
to it); this page is the navigable map.

---

## The shape: Ports & Adapters + a session edge

```
Screens (Next.js App Router, thin)        — call a use-case, then render
        │  (depends downward only)
Session edge      makeApp(ports).as(ctx)   — binds family + acting member once
        │
Use-cases (pure orchestration)             — one call hides many seams; returns Result<T>
        │
Domain core (pure)                         — state machine · points · recurrence · verdict
        ▼
Ports (the 4 seams)  ◄── Adapters          — wired only at the composition root
```

Everything points **downward**. A screen depends on a use-case; a use-case depends on `ports/`; an
adapter implements a port. Nothing in the core depends on Next.js, Supabase, or `process.env`.

---

## The dependency rule

> `domain/` and `usecases/` import **only** `ports/` — never an adapter, never `process.env`.
> `composition/` is the **only** place that imports adapters or reads env.

This is not a convention you have to remember — it is **mechanically enforced**. The guard test
[`test/architecture/dependency-rule.test.ts`](../../test/architecture/dependency-rule.test.ts) scans
the whole `src/` tree and **fails CI** if anything outside `composition/` reads `process.env` or
imports an adapter. It is the architectural ratchet that keeps the boundary from eroding silently.

---

## The four seams

Each seam is one interface (`src/ports/*`) designed for ≥2 adapters, selected at the composition
root. The keyless/fake side is the **executable spec**; the real side joins at its milestone.

| Seam | Port | Keyless/in-memory side | Real side | Landed |
|---|---|---|---|---|
| **judge** | [`ports/judge.ts`](../../src/ports/judge.ts) | `fake` (deterministic) | Anthropic → Gemini | M4 |
| **repositories** | [`ports/repositories.ts`](../../src/ports/repositories.ts) | in-memory, family-scoped | Supabase Postgres + RLS | M1 (auth/members) · M6 (chores/submissions/points) |
| **photo-storage** | [`ports/photo-storage.ts`](../../src/ports/photo-storage.ts) | `memory://` | Supabase Storage (signed URLs) | M3 |
| **clock** | [`ports/clock.ts`](../../src/ports/clock.ts) | `fixed` | `system` | M0 |

The `repositories` seam is an aggregate of four interfaces — `MemberRepository`, `ChoreRepository`,
`SubmissionRepository`, `PointsLedger` — each with its own contract suite. `IsoDate`/`IsoInstant`/
`Verdict` live in `ports/` and the domain imports them (the spec §4.1-permitted domain→ports edge).

**Degradation contract** (`src/composition/env.ts`): judge precedence is Anthropic → Gemini → fake;
persistence/storage is Supabase when its keys are present, else in-memory. A real judge requires
Supabase storage (it reads the photo via a signed URL).

---

## Composition root — the only switch

[`src/composition/`](../../src/composition/) binds everything together and is the **sole** reader of
the environment:

- [`env.ts`](../../src/composition/env.ts) — reads `process.env`, decides keyless vs real, picks the judge.
- [`container.ts`](../../src/composition/container.ts) — `buildPorts()` constructs the adapter set (lazily — no network at construction).
- [`request.ts`](../../src/composition/request.ts) / [`session.ts`](../../src/composition/session.ts) — derive the `RequestContext` from cookies/Supabase Auth (`deriveContext()`), and the practice-mode seed.
- [`server.ts`](../../src/composition/server.ts) — `serverPorts()`, the per-request port bundle the route handlers use.

If you need to know "what gets wired in real mode vs keyless," this folder is the single answer.

---

## The session edge

A use-case is a pure function `(ports, ctx, input) => Promise<Result<T>>`. To avoid threading
`ports` and `ctx` everywhere, [`src/app-session/app.ts`](../../src/app-session/app.ts) provides
`makeApp(ports).as(ctx)` — bind the family + acting member once, then call verbs that return a
`Result`. The `RequestContext` ([`ports/context.ts`](../../src/ports/context.ts)) is
`{ familyId, actor: { kind: 'parent' | 'kid', memberId } }`.

**Capability is enforced inside each use-case** against `ctx.actor` via the guards in
[`usecases/authz.ts`](../../src/usecases/authz.ts) (`requireParent`, `requireOwnerOrParent`). Each
ctx-bound use-case also re-checks `ctx.familyId` against loaded entities, so a cross-family id
resolves to `not_found` — mirroring RLS.

---

## Errors as values

Expected failures are returned, not thrown. `Result<T>` is `{ ok: true; value } | { ok: false;
error: AppError }`, and `AppError` is a **closed union** of 8 codes
([`domain/shared/errors.ts`](../../src/domain/shared/errors.ts)). Because the set is closed, the UI
and HTTP layers fan out over it exhaustively — add a 9th code and every `switch` fails to compile
until handled. Adapters may throw on true infra faults; use-cases catch and map them onto the closed
set. See the [API reference](api-reference.md#error-code--http-status) for the code→status mapping.

> **Known gap (tracked):** today only `usecases/submission.ts` wraps its port calls to map infra
> faults to values; the other use-cases call ports directly (issue #134). In keyless mode the
> in-memory adapters never throw, so this is invisible to the test suite. See the
> [retrospective](../reports/2026-06-23-retrospective-m0-m7.md#7-code-health-today).

---

## Where to start reading

A suggested path for a new contributor:

1. **[`src/ports/`](../../src/ports/)** — the four seams + `Result`/`context`. The whole contract on two screens.
2. **[`src/domain/`](../../src/domain/)** — pure logic: `shared/` (Result, AppError, branded ids, enums), then `submission/`, `chore/recurrence.ts`, `points/`.
3. **[`src/usecases/`](../../src/usecases/)** — orchestration. Start with [`submission.ts`](../../src/usecases/submission.ts) (the richest; documents the §7.2 ordering contract), then `review.ts`, `chores.ts`.
4. **[`src/composition/`](../../src/composition/)** — how keyless vs real is chosen.
5. **[`src/app/`](../../src/app/)** — the thin App Router screens + `api/**/route.ts` handlers.
6. **[`test/`](../../test/)** — read [`test/usecases/harness.ts`](../../test/usecases/harness.ts) and [`test/contract/in-memory.test.ts`](../../test/contract/in-memory.test.ts) to see the executable spec in action.

Layout (spec §11):

```
src/
  domain/{chore,submission,points,family}/   pure logic + types  (kernel = domain/shared/)
  ports/{judge,repositories,photo-storage,clock,context}.ts
  usecases/{family,chores,submission,review,points,...}.ts
  app-session/app.ts                         makeApp(ports).as(ctx) → Session
  adapters/{judge,persistence/{in-memory,supabase},storage,clock}/
  composition/{env,container,request,session,server}.ts   the only env/adapter seam
  app/                                       Next.js App Router (thin) + api/**/route.ts
test/{contract,usecases,architecture,domain,adapters,composition}/
```

---

## Related

- [Data model & state machine](data-model.md) — what the domain operates on.
- [API reference](api-reference.md) — how the App Router exposes the use-cases.
- [Testing guide](testing-guide.md) — the contract suites that make the seams swappable.
- [Glossary](glossary.md) — any unfamiliar term above.
