# Testing guide

The test suite is the project's load-bearing safety net: **203 tests across 31 files** run in
~1 second, keyless and deterministic, gating every merge. This page explains the layers and how to
add a test at each.

---

## Commands

```bash
npm run test           # vitest run — the keyless CI suite (default)
npm run test:supabase  # gated live tests against a Supabase dev DB (needs .env; wipes dev data)
npm run typecheck      # next typegen && tsc --noEmit — enforces type-level assertions
```

`npm run test` runs the **node** environment with no network and no secrets. It is what CI gates on.
Type-level assertions (`@ts-expect-error`, `expectTypeOf`) are **not** checked by vitest (it strips
types) — they are enforced by `typecheck`. See [Configuration](configuration.md) for env.

> The default vitest config ([`vitest.config.ts`](../../vitest.config.ts)) **excludes**
> `**/*.supabase.test.ts` and forces keyless env, so the suite can never touch a live backend.

---

## The layers

| Layer | Location | What it proves | Runs in CI |
|---|---|---|---|
| **Domain units** | [`test/domain/`](../../test/domain/) | pure logic: recurrence, Result, errors, branded ids, enums | ✅ |
| **Use-cases** | [`test/usecases/`](../../test/usecases/) | every capability check, error path, and transition, through the session facade | ✅ |
| **Contract suites** | [`test/contract/`](../../test/contract/) | the in-memory and Supabase adapters are **interchangeable** | ✅ in-memory · ⚠️ Supabase gated |
| **Adapters** | [`test/adapters/`](../../test/adapters/) | clock, fake judge, Anthropic/Gemini judge mapping | ✅ |
| **Composition** | [`test/composition/`](../../test/composition/) | the keyless-vs-real switch wires the right adapters (no network) | ✅ |
| **Architecture guard** | [`test/architecture/dependency-rule.test.ts`](../../test/architecture/dependency-rule.test.ts) | nothing outside `composition/` reads env or imports an adapter | ✅ |

---

## 1. Domain tests — pure units

Call the function, assert the value. No ports, no mocks. Example: `recurrence.test.ts` drives
`isDue` across `none`/`daily`/`weekly` and the weekday math. Add one when you add pure logic to
`src/domain/`.

## 2. Use-case tests — the behavior spec

The richest layer. Use [`test/usecases/harness.ts`](../../test/usecases/harness.ts) `makeTestApp()`,
which assembles **in-memory ports + a fixed clock + the fake judge** behind the session edge, so you
write `app.as(ctx).<verb>(input)` and assert the `Result`. These tests cover the *what* — every
`forbidden`, every cross-family `not_found`, every `invalid_transition`, and the §7.2 ordering.

To add one: pick the use-case, build a `ctx` (parent or kid), call the verb, assert `ok`/`error`.
The fixed clock makes dated behavior (lazy generation, ledger timestamps) deterministic.

> **Coverage note:** the in-memory adapters never throw, so the **infra-fault** path (a DB/storage
> error mapped to `persistence_unavailable`/`storage_unavailable`) is only exercised where a test
> injects a *throwing* port — today only `submission.test.ts` does. When you add fault-mapping to a
> use-case (issue #134), add a throwing-adapter test with it.

## 3. Contract suites — the equivalence proof

This is what makes "keyless ≡ real" true rather than aspirational. A suite like
`runChoreRepositoryContract(label, makeAdapter)` is written **once** and run against **both** sides:

- **in-memory**, in CI, via [`test/contract/in-memory.test.ts`](../../test/contract/in-memory.test.ts) — the *executable spec*;
- **Supabase**, on demand, via `test/contract/*.supabase.test.ts` and `npm run test:supabase`.

Each repository (`member`, `chore`, `submission`, `points-ledger`) plus `judge` and `photo-storage`
has a suite. When you add a method to a port, **add it to the contract suite first** — both adapters
must satisfy it.

> **Known gap (tracked):** the Supabase side is **excluded from CI** (issue #135), so the real
> adapters aren't gated automatically — run `npm run test:supabase` before changing them. Wiring an
> ephemeral Supabase into CI is the keystone fix that makes the real-mode gaps testable.

## 4. Adapter tests

Unit-test a single adapter's mapping logic — e.g. the Anthropic/Gemini judge adapters parsing a
model reply into a `Verdict` (`parseVerdict` clamps confidence, coerces `pass`, defaults reasoning).
No live API calls; the vision client is faked.

## 5. Composition tests

Prove the composition root *selects* correctly without a network: e.g. a real judge over in-memory
storage throws at use-time (because `memory://` isn't fetchable), and a real adapter set is built
lazily.

## 6. The architecture guard

A 51-line test that scans `src/` and fails if anything outside `composition/` reads `process.env` or
imports an adapter. It's the ratchet behind the [dependency rule](architecture.md#the-dependency-rule).
You rarely touch it — but if it fails, you've leaked infra into the core.

---

## What's *not* tested (yet)

The **HTTP edge** (`src/app/api/**/route.ts`) and **client components** have no tests — only
`test/app/error-copy.test.ts` exists (issue #139). Route handlers parse untrusted input and wire
auth, so they're the highest-value net-new coverage; start there (a request→response harness needs
no DOM). See the [retrospective](../reports/2026-06-23-retrospective-m0-m7.md#7-code-health-today).

---

## Related
- [Architecture](architecture.md) — the seams the contract suites cover.
- [Configuration](configuration.md) — keyless vs real env and `test:supabase`.
- [Deployment](deployment.md) — how migrations relate to the gated Supabase tests.
