# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**Family Chore Tracker** — a mobile-first app that uses AI photo comparison to
verify a child has tidied their room. A parent photographs the room in its
accepted "clean" state (the **reference**); the child later photographs the room
(the **submission**); the system compares the two and returns a structured
pass/fail **verdict** with explanations. Parents get a history dashboard;
children get streaks.

**`PRD.md` is the source of truth** for product scope, the data model, and the
module breakdown. Read it before making product decisions. When you change
behavior that contradicts the PRD, update the PRD in the same change.

## Status

Early. Built so far: the **reference→verdict tracer bullet** (the core judging
pipeline, end-to-end, behind clean seams), **`computeStreak`** (the pure v1
streak policy), **`referenceService`** (versioned references behind an in-memory
persistence seam), **`submissionService`** (orchestrates a child's submission
→ reference lookup → judge → persisted submission+verdict, over the same seam),
and **`choreService`** (parent-side chore creation behind the same in-memory
persistence seam; the thin entry point for the multi-chore future) — **all six
PRD domain modules** — plus the **first Next.js PWA slice** (App Router + React
Server Components + Server Actions; a thin in-browser tracer over the domain core
with camera capture, the verdict view, a streak badge, and a parent history list
— see "The PWA" below). Also built: the **live Supabase adapters**
(`Supabase{Chore,Reference,Submission}Store`) behind the three persistence ports —
Postgres + Storage, env-gated, with a SQL migration — scaffolded behind the seam
and verified by `npm run typecheck` + the keyless `npm run build`, not yet against
a live project (see "The Supabase adapters" below). Also built: the **accounts
data-model + RLS foundation** — the `families`/`users` tables, real `family_id`
foreign keys, family-aware adapters, and per-family **RLS policies** (migration
`0002_accounts.sql`), scaffolded the same way. The policies are **dormant** under
the service-role key (which bypasses RLS); per-family scoping is enforced in the
adapters meanwhile, so the app runs as a single **seeded** family. Not yet built
(see PRD): Supabase **Auth** + the login/provisioning UI, the
service-role→authenticated-client **flip** that activates the RLS policies,
child-record-level scoping, and an offline service worker.

## Architecture: the judging core (`src/judge/`)

The spine is `reference + submission → judge (vendor seam) → evaluateVerdict
(policy) → Verdict`.

| File | Responsibility |
| --- | --- |
| `types.ts` | Domain types + the Zod `ModelJudgmentSchema` (the AI contract). |
| `client.ts` | `JudgeClient` — the vendor-swap seam — plus `FakeJudgeClient`. |
| `gemini.ts` | `GeminiJudgeClient`, the live adapter. **Not exported from `index.ts`** so the core never pulls in the vendor SDK. |
| `prompt.ts` | The judge prompt + severity rubric. |
| `parse.ts` | `parseModelJudgment` — strict JSON + schema validation; throws `JudgmentParseError`. |
| `evaluateVerdict.ts` | The v1 verdict policy (pure function). |
| `pipeline.ts` | `runJudgment(client, input)` — wires the seam to the policy. |
| `fixtures.ts` | Sample judgments (pass / fail / uncertain) for tests + demo. |

### Two seams that must stay clean

1. **Vendor swap — `JudgeClient` (`client.ts`).** All vision-vendor code lives
   behind `judge(input) → ModelJudgment`. The pipeline, app, and tests depend
   only on this interface. Adding a model = one new implementation, zero changes
   to callers. Never import a vendor SDK outside its adapter file, and keep
   `gemini.ts` out of `index.ts`.
2. **Policy — `evaluateVerdict` (`evaluateVerdict.ts`).** The *system*, not the
   model, decides the outcome. Keep it a pure function so it stays unit-testable.

### The v1 verdict policy (don't drift from this without updating PRD + tests)

- **result** = `fail` iff there is ≥1 **high**-severity deviation. Medium/low
  deviations are recorded but never fail a child alone ("minor messiness
  shouldn't fail me"). Derived from severity, **not** the model's own `verdict`
  field, so the rule is auditable.
- **status** = `needs_review` when the model is `uncertain` or `confidence <
  CONFIDENCE_THRESHOLD` (0.7); otherwise `confirmed`. This is the "needs a parent
  look" safety valve so an unsure machine call never silently passes/fails.

### AI contract

The model must return strict JSON: `matches_reference`, `verdict`, `confidence`
(0..1), `deviations[]` (`item`, `issue`, `severity` ∈ high|medium|low),
`uncertain`, `notes`. Enforced by `ModelJudgmentSchema`. Always validate model
output — never trust it raw.

## The gamification seam (`src/streak/`)

`computeStreak(submissions, verdicts, options?) → StreakState` is a pure policy
function over the submission/verdict event stream — the sibling of
`evaluateVerdict`. The *system* owns the streak definition; streaks are
**computed, never stored** (PRD). Keep it pure and unit-tested.

| File | Responsibility |
| --- | --- |
| `types.ts` | `StreakSubmission`, `StreakVerdict` (reuses the judge's `VerdictResult`/`VerdictStatus`), `StreakOptions`, `StreakState`. |
| `computeStreak.ts` | `DEFAULT_TIME_ZONE` + the pure v1 streak policy. |

### The v1 streak policy (don't drift from this without updating PRD + tests)

Verdicts are bucketed to calendar days (in `timeZone`, default UTC; best-of-day,
so a fail-then-fix on the same day still counts as passed). Then **a passed day
extends the streak, a confirmed `failed` day breaks it, and everything else
(`needs_review` and missed days) is transparent** — it neither extends nor
breaks. The fairness rationale mirrors the verdict policy: an uncertain call must
not unfairly pass *or* fail the child, and "hasn't tidied yet today" is not a
failure. `current` = passed days since the last confirmed fail; `longest` = best
fail-free run; `lastPassDate` = the latest passed day. Anchored to the latest day
in the data (never `Date.now()`), so it stays deterministic. A stricter
"missed-day-breaks" variant is a documented future knob (`gapBreaks`/`asOf`).

## The reference seam (`src/reference/`)

`referenceService` owns the **`chore_references.isCurrent` invariant** — exactly
one current reference per chore, with prior versions retained, never deleted
(PRD User Story 5) — over a dumb `ReferenceStore` port. It is the
persistence-side analog of the `JudgeClient` vendor seam: the *system* owns the
invariant, not the storage layer, the same way it owns the verdict and streak
policies.

| File | Responsibility |
| --- | --- |
| `types.ts` | `ChoreReference`, `ReferenceDraft`, and the `ReferenceStore` port (the seam the Supabase adapter sits behind). Reuses the judge core's `ImageInput`. |
| `referenceService.ts` | `setReference` / `getCurrentReference` / `listReferences` — free functions taking the store first (like `runJudgment(client, input)`). The invariant lives in `setReference`: demote the prior current, then insert the new one as current. |
| `memoryStore.ts` | `InMemoryReferenceStore`, the fully-working fake (sibling of `FakeJudgeClient`) — insertion-ordered, with an injectable id/clock for deterministic tests. |
| `supabaseStore.ts` | `SupabaseReferenceStore`, the live adapter — bytes in Storage + a path on the row, atomic demote+insert via the `set_current_reference` RPC. **Not exported from `index.ts`** (like `gemini.ts`). |

Every `setReference` is a new version even if the bytes match a prior one (no
dedup — a re-upload is a deliberate, history-worthy act). The live
`SupabaseReferenceStore` (`./supabaseStore`) is **built** and, like `gemini.ts`,
stays **out of `index.ts`**: it keeps bytes in Supabase Storage + a path on the
row, and makes demote+insert atomic via the `set_current_reference` transaction
function backed by a partial unique index (`WHERE is_current`) — see "The Supabase
adapters". `choreId` is an opaque key here; `getChore` (the chore seam) provides
existence validation, and wiring it into `setReference` is the next integration
step.

## The submission seam (`src/submission/`)

`submissionService` orchestrates a child's chore submission (PRD stories 7–9,
15, 19): it **composes** the existing seams — `getCurrentReference` (reference) →
`runJudgment` (the vendor seam) → persist — over a dumb `SubmissionStore` port
(the future-Supabase boundary, sibling of `ReferenceStore`). It reuses the
judging and reference logic; it never re-implements the verdict policy or the
`isCurrent` invariant. `SubmissionRecord`/`VerdictRecord` reuse the judge's
`ImageInput`/`Verdict` and are structurally `StreakSubmission`/`StreakVerdict`,
so records feed `computeStreak` with no field mapping.

| File | Responsibility |
| --- | --- |
| `types.ts` | `SubmissionRecord`, `VerdictRecord` (the judge `Verdict` + a persistence envelope), the drafts, and the `SubmissionStore` port. Reuses `ImageInput`/`Verdict`. |
| `errors.ts` | `NoCurrentReferenceError` — thrown when a chore has no reference to judge against (sibling of `JudgmentParseError`). |
| `submissionService.ts` | `submitChore(deps, input)` / `getHistory(store, choreId?)` — free functions over a `{ judge, references, submissions }` deps object. |
| `memoryStore.ts` | `InMemorySubmissionStore`, the fully-working fake (sibling of `FakeJudgeClient`/`InMemoryReferenceStore`) — two insertion-ordered arrays, injectable ids/clock. |
| `supabaseStore.ts` | `SupabaseSubmissionStore`, the live adapter — bytes in Storage, `exif` in a jsonb column, `listVerdicts(choreId)` joins through `submissions`. **Not exported from `index.ts`**. |

**Submission + verdict are two writes, and the submission is stored *before*
judging — by design.** A submission whose judging fails (model down, parse
error) stays persisted with no verdict, so the attempt and its EXIF remain
auditable for future anti-gaming (story 19), and `computeStreak` already treats
an unverdicted submission as a transparent non-event. So the pair is
**deliberately not one transaction** — the submission must survive a judge
failure. The live `SupabaseSubmissionStore` (`./supabaseStore`) is **built** —
bytes→Storage, EXIF→jsonb, `family_id` now a real per-family FK the adapter stamps
on both writes (submission + verdict) and filters reads by — and stays **out of
`index.ts`** like `gemini.ts`/`SupabaseReferenceStore`. `choreId` existence is
checkable via `getChore` (the chore seam; wiring it in is the next step), while
`childId` stays opaque until accounts exist.

## The chore seam (`src/chore/`)

`choreService` owns parent-side **chore creation/management** (PRD User Story 3;
lines 45–46) over a dumb `ChoreStore` port — the sibling of `ReferenceStore`/
`SubmissionStore`. It is deliberately **thin** (v1 has a single chore, "Tidy
room") but is the entry point for the multi-chore future. The *system* owns the
only policy — name normalization — not the store, the same way `referenceService`
owns the `isCurrent` invariant.

| File | Responsibility |
| --- | --- |
| `types.ts` | `Chore`, `ChoreDraft`, and the `ChoreStore` port (the seam the Supabase adapter sits behind). |
| `errors.ts` | `ChoreNotFoundError` — thrown by `getChore` when a `choreId` doesn't resolve (sibling of `NoCurrentReferenceError`). |
| `choreService.ts` | `createChore` / `getChore` / `listChores` — free functions taking the store first (like `setReference`). `createChore` trims and rejects an empty name; **no uniqueness/dedup** (mirroring `referenceService`). |
| `memoryStore.ts` | `InMemoryChoreStore`, the fully-working fake (sibling of `InMemoryReferenceStore`) — one insertion-ordered array, injectable id/clock, copy-on-read. |
| `supabaseStore.ts` | `SupabaseChoreStore`, the live adapter over the `chores` table. **Not exported from `index.ts`**. |

A chore's `name` is the source of the `choreName` string that `submitChore`
threads into `runJudgment`'s prompt, so it is normalized once here at the write
boundary. `chores.type`/`criteria` (a future rubric mode) remain a **deferred
schema seam**: like reference/submission, the in-memory `Chore` models only what
v1 reads. `family_id`, by contrast, is **no longer inert** — it's a real per-family
FK the adapter stamps on write and filters reads by (still absent from the domain
`Chore` + the in-memory fake, by design — it's an adapter-construction detail). The
live `SupabaseChoreStore` (`./supabaseStore`) is **built** and stays **out of
`index.ts`**, like
`gemini.ts`/`SupabaseReferenceStore`/`SupabaseSubmissionStore`. `getChore` is the
public "assert a chore exists" API; **wiring it into reference/submission to
replace their opaque-`choreId` treatment is the natural next integration** (not
done in this slice — it would change `setReference`/`submitChore` signatures).

## The Supabase adapters (`src/supabase/`, `supabase/`)

The live persistence layer behind the three ports — the persistence-side analog
of `judge/gemini.ts`. Each adapter implements its frozen port verbatim and stays
**out of its module's `index.ts`**, so importing a core never pulls in
`@supabase/supabase-js`; the SDK is confined to `src/supabase/` + the three
`supabaseStore.ts` files. **Scaffold & defer:** verified by `npm run typecheck` +
the keyless `npm run build` (and the unchanged in-memory tests), **not** yet
against a live project — the same posture as `gemini.ts` (keyless in CI). There
are no adapter unit tests (the in-memory fakes stay the tested path); a live,
env-gated integration test is the follow-up once credentials exist.

| File | Responsibility |
| --- | --- |
| `src/supabase/client.ts` | `createSupabaseContext(opts?)` → `{ client, bucket }` (env: `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET`; throws if missing). The only SDK value-import site (mirrors `GeminiJudgeOptions`). **Not** `server-only` — the core stays framework-portable; the server-only boundary is `container.ts`. |
| `src/supabase/storage.ts` | `uploadImage` / `downloadImage` — bytes live in Storage; reads **materialize** `ImageInput` (base64) back from the object path. |
| `src/supabase/family.ts` | `ensureSeededFamily(ctx, name)` — find-or-create the single v1 family (the families analog of `ensureSeededChore`). The **only** `families` access; there is intentionally no families port/service yet, so it sits in the SDK-confinement zone rather than leaking `.from('families')` into `container.ts`. |
| `src/{chore,reference,submission}/supabaseStore.ts` | `Supabase{Chore,Reference,Submission}Store` — implement the ports; snake_case row ↔ camelCase domain mapping; oldest→newest by `created_at`. Each takes `(ctx, familyId)`: it **stamps `family_id` on every write and filters every read by it** (the constructor binding keeps the ports/services/fakes/tests frozen). |
| `supabase/migrations/0001_init.sql` | The four data tables (`chores`, `chore_references`, `submissions`, `verdicts`), the partial unique index `WHERE is_current`, the atomic `set_current_reference` RPC, and **RLS enabled with no policies**. |
| `supabase/migrations/0002_accounts.sql` | The accounts foundation: the `families`/`users` tables, real `family_id` FKs on the four data tables, the `private.auth_family_id()` `SECURITY DEFINER` helper (the RLS-recursion breaker), the `set_current_reference` re-create with `p_family_id`, and the per-family **RLS policies**. |

**Env-gated in `container.ts`:** all three stores switch **together** to Supabase
when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set (dynamic import keeps the
SDK out of the runtime otherwise), else the in-memory fakes. **Image bytes** live
in a private Storage bucket (path + mime on the row); honoring the frozen
`image: ImageInput` return means reads materialize bytes — fine for v1, but a
signed-URL optimization would need a **port change**, so it's future work.
**Atomicity:** the reference demote+insert is one transaction via the
`set_current_reference` RPC backed by the partial unique index; the
submission+verdict pair stays **two writes by design** (the submission persists
before judging). **Accounts (the `0002` foundation):** the `families`/`users`
tables + per-family **RLS policies** are built, and `family_id` is now a real FK
the adapters stamp + filter on. **Belt-and-suspenders:** the server uses the
service-role key (which BYPASSES RLS), so per-family correctness *today* comes from
the adapters' own stamping/filtering; the RLS policies are the **dormant-but-ready**
layer that activates only at the future authenticated-client flip — both are
intentional, neither redundant (delete the adapter filtering "because RLS exists"
and tenancy breaks silently under the service role). **Still deferred:** Supabase
**Auth** + the login/provisioning UI, the authenticated-client flip,
child-record-level scoping, populating `users` (empty until Auth — so the seeded
family is "ownerless", fine because the service role bypasses the users-reading
policies), `family_id` NOT NULL + backfill, and the Storage bucket (a manual
prerequisite the migration does not create).

## The PWA (`app/`, `lib/server/`)

The first product surface: a mobile-first Next.js **App Router** PWA that drives
the finished domain core through a real browser (PRD: "Next.js PWA … `<input
capture>`"). A thin **tracer bullet** — a parent sets/replaces the reference
photo, a child captures + submits, the AI verdict renders, and a streak badge +
parent history list read back. The domain core and the Gemini SDK stay
**server-only**: every domain call runs in a Server Component or a Server Action,
and `lib/server/container.ts` opens with `import 'server-only'` so an accidental
client import is a build error. Client components import the core's **types only**.

| File | Responsibility |
| --- | --- |
| `lib/server/container.ts` | The composition root — **env-gates** the three stores (Supabase when keyed, else in-memory on `globalThis` to survive dev HMR), seeds the single "Tidy room" chore (find-or-create) — and, in Supabase mode, find-or-creates the one family and binds its id to the three stores `(ctx, familyId)` — and exposes `getStores` / `getSeededChore` / `buildSubmitDeps` / `getStreakState`. **The only place wired to a concrete persistence + judge implementation.** |
| `app/actions.ts` | `setReferenceAction` / `submitChoreAction` (`'use server'`) — read the `<input capture>` file from FormData, convert to the core's `ImageInput` (base64, no `data:` prefix), and call `setReference` / `submitChore`. Map `NoCurrentReferenceError` to a friendly signal; return only serializable data. |
| `app/{page,parent/page,child/page,parent/history/page}.tsx` | Server Components reading the container directly. Marked `dynamic = 'force-dynamic'` (live per-request state, not a build-time snapshot). |
| `app/components/*` | `ReferenceForm` / `SubmitForm` (`'use client'`, the camera `<input>` + `useActionState`), and presentational `VerdictCard` / `StreakBadge` / `PhotoThumb` / `Nav`. |
| `app/manifest.ts` | The web app manifest (installable PWA); no service worker yet. |

**Two deliberate bridges, each swapped behind an existing seam later with no
caller changes:**

1. **Persistence is env-gated** — the live `Supabase*Store` adapters when
   `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set (loaded via dynamic
   import), else `InMemory*Store` singletons on `globalThis`, seeded once (the
   in-memory default resets on a full server restart — acceptable for the tracer).
   Both sit behind the identical `ChoreStore` / `ReferenceStore` /
   `SubmissionStore` ports; **only `container.ts` changes.** See "The Supabase
   adapters".
2. **The judge is env-gated** in `container.ts`: the live `GeminiJudgeClient`
   (dynamic `import`, so `@google/genai` only loads when keyed) when
   `GEMINI_API_KEY` is set, otherwise `FakeJudgeClient(CLEAN_PASS)` — so the app
   runs with no key here and in CI.

Accounts: the data-model + RLS **foundation** is built (`families`/`users` + dormant
per-family policies; see "The Supabase adapters"), but **live Auth/login stays
deferred** — the app runs as a single **seeded** family and `childId` is omitted. The
large-photo body cap (`serverActions.bodySizeLimit` in `next.config.mjs`) is a
stopgap until direct-to-Storage upload removes large bodies from the action path.

## Commands

```bash
npm install
npm run dev       # the Next.js PWA at http://localhost:3000 (fake judge unless keyed)
npm run build     # next build — also the server/client boundary check (CI runs it)
npm start         # serve the production build
npm test          # vitest — unit tests for policy, parsing, and the pipeline
npm run typecheck # tsc for the core (tsconfig.core.json) AND the app (tsconfig.json)
npm run demo      # runs the tracer bullet end-to-end with the fake judge
# Live path (needs a key): cp .env.example .env, set GEMINI_API_KEY, then:
GEMINI_API_KEY=... npm run demo -- ref.jpg sub.jpg "Tidy room"
# Live Supabase persistence (optional): set SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
# SUPABASE_STORAGE_BUCKET, run the migrations in order (supabase/migrations/0001_init.sql
# then 0002_accounts.sql), create a private Storage bucket. Unset → in-memory (the default).
```

## Conventions

- TypeScript, ESM (`"type": "module"`), strict mode incl.
  `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (use `import type` for
  type-only imports).
- Two TS projects: **`tsconfig.core.json`** owns the DOM-free `src/` core (with
  `verbatimModuleSyntax`); **`tsconfig.json`** owns the app (`app/` + `lib/`, with
  DOM/JSX/`isolatedModules`, and `src` excluded, so it relaxes
  `verbatimModuleSyntax`). `npm run typecheck` runs both — keeping DOM out of the
  core build is a real guarantee, so don't merge them into one config.
- The default vision model is **Gemini Flash-class** (`gemini-2.5-flash`),
  configurable via `GEMINI_MODEL`. Per the PRD it is deliberately swappable.

## Testing philosophy (from PRD)

Test external behavior (inputs→outputs), not internals, so tests survive
refactors. Unit-test the deterministic parts — `evaluateVerdict` (policy paths),
`computeStreak` (crafted event sequences: streaks, breaks, gaps),
`referenceService` (the `isCurrent` invariant, behaviorally, over
`InMemoryReferenceStore`), `choreService` (name policy + the `getChore`
existence assertion + copy-on-read, over `InMemoryChoreStore`), and
`parseModelJudgment` (contract enforcement). The
model's actual visual judgment is non-deterministic and belongs in eval-style
testing, **not** unit tests; use `FakeJudgeClient` to exercise the pipeline
without a live model. The live `Supabase*Store` adapters likewise have **no unit
tests** — like `gemini.ts`, they're exercised by an env-gated live integration
test (deferred until credentials exist; it should also assert per-family stamping +
filtering and, once auth lands, RLS isolation), and the in-memory fakes stay the
tested persistence path.

`submissionService` gets a **light integration test** (PRD): compose
`submitChore` with `FakeJudgeClient` + `InMemoryReferenceStore` (seeded via
`setReference`) + `InMemorySubmissionStore`, asserting the composed behavior
(records persisted, the current reference used, EXIF/childId threaded, a failed
judge still records the submission) and that the stored records feed
`computeStreak` with no mapping — deterministic via injected ids/clock, never
`Date.now()`.

## Handling children's images

This app judges photos of minors' rooms. Two compliance items are pre-conditions
for a real launch (not the MVP, but never silently cross them): COPPA-grade
parental consent, and confirmation of the vision vendor's data-handling/training
terms for children's images. Capture EXIF but don't build anti-gaming yet.

The PWA keeps this posture: keyless (the default here and in CI), the fake judge
ignores the photo bytes, so nothing leaves the box; the moment `GEMINI_API_KEY` is
set, real photos go to Gemini, so both pre-conditions gate any keyed deployment.
The submission path records EXIF as `null` for now (a browser `<input capture>`
upload needs a parser to surface it); anti-gaming stays unbuilt. The same gate
applies to persistence: with no `SUPABASE_*` vars the photos stay in-process; the
moment they're set, real photos (and any EXIF) are written to Supabase Storage, so
that path carries the same pre-launch obligations.
