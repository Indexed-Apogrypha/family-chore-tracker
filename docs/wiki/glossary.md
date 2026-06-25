# Glossary

The shared vocabulary of Family Chore Tracker. Terms are grouped; cross-links point to the page
where each concept is used in depth.

---

## Domain & product

**Advisory judge / verdict** — the AI vision model's opinion on whether a photographed chore looks
done. It is **advisory only**: it never decides anything. A `Verdict` is `{ pass, confidence,
reasoning, model }`. See [Architecture § The judge seam](architecture.md#the-four-seams).

**Authoritative decision** — the **parent's** approve/reject. This is the only ruling that changes
the outcome; it may override the AI verdict in either direction. See [Data model § State machine](data-model.md#3-state-machine).

**Template (chore template)** — a reusable chore definition with a **recurrence** (none/daily/weekly).
Templates *materialize* dated instances lazily. See [Data model § chore_templates](data-model.md#chore_templates).

**Instance (chore instance)** — a single dated occurrence of a chore for one member, the thing a kid
actually completes. Carries a snapshot of its template's title/points. A **one-off** is an instance
with no template. See [Data model § chore_instances](data-model.md#chore_instances).

**One-off** — a chore created directly as a single instance (`templateId: null`); it sits outside
lazy generation and is never regenerated.

**Lazy generation** — instances are not created by a cron; the **only** operation that materializes
them is `getTodayBoard`, idempotently keyed on `(template, member, dueDate)`. See [Data model § Recurrence](data-model.md#4-recurrence-model).

**Points ledger** — an **append-only** record of credits. There is no mutable balance; a member's
total is `sum(deltas)`. Idempotent on `submissionId` (one credit per approved submission). See
[Data model § Points ledger](data-model.md#5-points-ledger-model).

**PIN gate** — the 4-digit code that selects a **kid** profile on a shared device. It is an
**app-level gate, not a security boundary** (design §3.1) — identity is proven at the edge.

**Practice (keyless) mode** — the app running with fake/in-memory adapters: no accounts, no network,
no AI spend. The default for local dev, tests, and CI. See [Configuration § Run modes](configuration.md#run-modes).

**Real mode** — the app running against Supabase (Postgres/Auth/Storage) + a real vision provider,
switched on by the presence of env keys.

---

## Architecture

**Port (seam)** — an interface designed for ≥2 implementations. There are **four**: `judge`,
`repositories`, `photo-storage`, `clock`. See [Architecture § The four seams](architecture.md#the-four-seams).

**Adapter** — a concrete implementation of a port (a **factory function**), e.g. the in-memory vs
Supabase repository. The keyless/fake side is the *executable spec*; the real side joins later.

**Composition root** — `src/composition/`, the **only** place that reads `process.env` or imports an
adapter. The single keyless-vs-real switch. See [Architecture § Composition root](architecture.md#composition-root--the-only-switch).

**Dependency rule** — `domain/` and `usecases/` import **only** `ports/` — never an adapter, never
`process.env`. Enforced by a CI guard test. See [Architecture § The dependency rule](architecture.md#the-dependency-rule).

**Use-case** — a pure function `(ports, ctx, input) => Promise<Result<T>>`; one call hides many
seams. Also reachable via the session facade `app.as(ctx).<verb>()`.

**Session edge** — `makeApp(ports).as(ctx)`, which binds the family + acting member once so callers
read naturally and always get a `Result`.

**`Result<T>`** — `{ ok: true; value } | { ok: false; error: AppError }`. Expected failures are
**values**, not exceptions, for compiler-checked exhaustive handling. See [API reference § Errors](api-reference.md#error-code--http-status).

**`AppError`** — the **closed set** of expected failures: `not_found`, `forbidden`,
`invalid_transition`, `bad_pin`, `judge_unavailable`, `storage_unavailable`,
`persistence_unavailable`, `validation`.

**Contract test** — a per-seam suite run against **both** the in-memory and real adapters to prove
them interchangeable. The mechanism behind "keyless ≡ real." See [Testing guide § Contract suites](testing-guide.md#3-contract-suites-the-equivalence-proof).

**Branded id** — a `string` that is a distinct *nominal* type at compile time (`FamilyId`,
`MemberId`, …) so they can't be transposed. The backbone of family-scoping safety.

---

## Infrastructure

**RLS (Row-Level Security)** — Postgres per-row access policies. Every data table is family-scoped;
v1 uses a server-only service-role adapter that **also** scopes every query by `family_id`, with RLS
as defense-in-depth. See [Data model § RLS](data-model.md#2-rls-model).

**Service-role key** — the Supabase secret that **bypasses RLS**; server-only, never sent to the
browser. Keep it out of `NEXT_PUBLIC_*`.

**Signed URL** — a short-lived, pre-authorized link to a private photo in the `chore-photos` bucket;
how the review screen and the judge read a photo without a public link.

**Keyless ≡ real** — the guarantee that the two run modes behave identically, proven by the contract
suites.

**Staging → gated-prod rebuild** — the deploy model: every merge auto-deploys to staging; production
is a **manually-approved rebuild** of the same commit with prod env. See [Deployment](deployment.md).

**`SUPABASE_TARGET`** — the local switch (`stage`/`prod`, default `stage`) that picks which Supabase
project local `dev`/`test:supabase` use. See [Configuration § Local env namespacing](configuration.md#local-env-namespacing-stage-vs-prod).

**Gitleaks / secret-scan** — the CI check that scans committed history for secrets; a required gate.
