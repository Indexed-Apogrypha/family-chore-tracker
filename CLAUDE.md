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
PRD domain modules**, with `choreService.getChore` **now wired into both
`setReference` and `submitChore`** as their chore-existence gate (no more
opaque-`choreId` treatment; both throw `ChoreNotFoundError` before any write) —
plus the **first Next.js PWA slice** (App Router + React
Server Components + Server Actions; a thin in-browser tracer over the domain core
with camera capture, the verdict view, a streak badge, and a parent history list
— see "The PWA" below). Also built: the **live Supabase adapters**
(`Supabase{Chore,Reference,Submission}Store`) behind the three persistence ports —
Postgres + Storage, env-gated, with a SQL migration — scaffolded behind the seam,
verified by `npm run typecheck` + the keyless `npm run build`, and **now also by a
live service-role round-trip + a live auth-mode RLS smoke** (`npm run smoke:supabase`
and `npm run smoke:supabase-auth` against a real project — see "The Supabase adapters"
+ "The live smokes" below; per-family/per-child/Storage RLS enforcement is verified
under real authenticated JWTs). Also built: the **accounts
data-model + RLS foundation** — the `families`/`users` tables, real `family_id`
foreign keys, family-aware adapters, and per-family **RLS policies** (migration
`0002_accounts.sql`). And now the **full accounts + Auth layer** (migration
`0003_auth.sql` + `lib/server/auth.ts`, `proxy.ts`, `app/auth/`, `app/login/`,
`app/parent/children/`): Supabase **Auth** (email/password parents;
parent-provisioned, username-based children), login/sign-up/sign-out + the
child-provisioning UI, PWA **role gating**, **per-child RLS scoping**, and the
**service-role→authenticated-client flip** that makes the RLS policies actually
enforce. **All env-gated** (see "The auth layer"): with no `SUPABASE_ANON_KEY` the
app falls back to the legacy single-implicit-family / role-by-URL / no-login mode —
the keyless default here + in CI. Verified by `npm run typecheck` + the keyless
`npm run build` + the unchanged 72 tests; and the **live auth flow is now
runtime-verified** through the Next app by the browser auth-flow smoke
(`npm run smoke:auth-flow` — sign-in, the `proxy.ts` cookie refresh, Server-Action
sign-out, parent-only provisioning, per-role gating; see "The live smokes"). And now
the **Storage object RLS** slice (migration
`0004_storage_rls.sql`): photo **bytes** are written under a family-prefixed object
path (`<family_id>/…`) and Storage I/O rides the authenticated client, so the
per-family RLS that already guards the DB rows now guards the bytes too (PRD User
Story 17) — scaffold-&-defer like the other migrations (SQL review-only, not
runtime-verified). Also built: the **offline service worker** (`public/sw.js` +
`ServiceWorkerRegistrar` + the `/offline` fallback) — app-shell offline support
(navigations fall back to a branded offline page; hashed static assets serve
cache-first), deliberately **not** an offline submission queue (judging needs the
network). Verified by the keyless `npm run build` + a `npm start` round-trip
(`/sw.js` served no-store with the right MIME; `/offline` renders). Also built: the
**`family_id` `NOT NULL` hardening** (migration `0006`) — the four data tables now
enforce per-row tenancy in the schema, with a conditional legacy backfill; applied
live + verified (the service-role smoke round-trips green against it). Not yet built
(see PRD): an offline **submission queue** (queue + replay photo bytes).

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
| `referenceService.ts` | `setReference(deps, choreId, image)` (deps `{ references, chores }`) / `getCurrentReference` / `listReferences` (these two still take the store first). The invariant lives in `setReference`: `getChore`-validate the chore, then demote the prior current and insert the new one as current. |
| `memoryStore.ts` | `InMemoryReferenceStore`, the fully-working fake (sibling of `FakeJudgeClient`) — insertion-ordered, with an injectable id/clock for deterministic tests. |
| `supabaseStore.ts` | `SupabaseReferenceStore`, the live adapter — bytes in Storage + a path on the row, atomic demote+insert via the `set_current_reference` RPC. **Not exported from `index.ts`** (like `gemini.ts`). |

Every `setReference` is a new version even if the bytes match a prior one (no
dedup — a re-upload is a deliberate, history-worthy act). The live
`SupabaseReferenceStore` (`./supabaseStore`) is **built** and, like `gemini.ts`,
stays **out of `index.ts`**: it keeps bytes in Supabase Storage + a path on the
row, and makes demote+insert atomic via the `set_current_reference` transaction
function backed by a partial unique index (`WHERE is_current`) — see "The Supabase
adapters". `choreId` is **no longer an opaque key**: `setReference` takes a
`{ references, chores }` deps object (the sibling of `submitChore`'s
`SubmitChoreDeps`) and calls `getChore` first, so it throws `ChoreNotFoundError`
before versioning a reference under a chore that doesn't exist. Reads
(`getCurrentReference`/`listReferences`) stay validation-free.

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
| `submissionService.ts` | `submitChore(deps, input)` / `getHistory(store, choreId?)` — free functions over a `{ judge, chores, references, submissions }` deps object. `submitChore` validates the chore via `getChore` before any write. |
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
**now validated**: `SubmitChoreDeps` carries a `chores` store and `submitChore`
calls `getChore` first — ahead of the reference check — so a missing chore throws
`ChoreNotFoundError` before any write. (Verified live: the smoke's child
submissions run that `getChore` SELECT under each child's authenticated client, so
the per-child RLS still admits a child reading the family's chore row.) `childId`
is now the child's **auth-user id** in auth mode (the per-child RLS policy keys on
it), or omitted in the legacy single-family mode.

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
| `choreService.ts` | `createChore` / `getChore` / `listChores` — free functions taking the store first (like `getCurrentReference`). `createChore` trims and rejects an empty name; **no uniqueness/dedup** (mirroring `referenceService`). |
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
public "assert a chore exists" API, and it is **now wired into both
`setReference` and `submitChore`** to replace their opaque-`choreId` treatment:
each validates the chore exists (throwing `ChoreNotFoundError`) before any write.
This changed their signatures — `setReference` now takes a `{ references, chores }`
deps object and `SubmitChoreDeps` gained a `chores` store — so the chore seam is no
longer an isolated island; it's the validation gate the two write paths call.

## The Supabase adapters (`src/supabase/`, `supabase/`)

The live persistence layer behind the three ports — the persistence-side analog
of `judge/gemini.ts`. Each adapter implements its frozen port verbatim and stays
**out of its module's `index.ts`**, so importing a core never pulls in
`@supabase/supabase-js`; the SDK is confined to `src/supabase/` + the three
`supabaseStore.ts` files. Verified by `npm run typecheck` + the keyless
`npm run build` (and the unchanged in-memory tests) and now also by **two live
smokes** against a real project (see "The live smokes" below): a **service-role
round-trip** (the adapters drive Postgres + Storage end-to-end; every invariant —
family-stamping, the `isCurrent` demote+insert, family-prefixed object paths —
cross-checks) and an **auth-mode RLS smoke** (the same adapters under real
authenticated JWTs, proving the per-family/per-child/Storage policies actually
enforce). There are no adapter *unit* tests (the in-memory fakes stay the tested
path); the two smokes are the env-gated integration checks.

| File | Responsibility |
| --- | --- |
| `src/supabase/client.ts` | `createSupabaseContext(opts?)` → `{ client, bucket }` (env: `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET`; throws if missing). The only SDK value-import site (mirrors `GeminiJudgeOptions`). **Not** `server-only` — the core stays framework-portable; the server-only boundary is `container.ts`. |
| `src/supabase/storage.ts` | `uploadImage` / `downloadImage` — bytes live in Storage; reads **materialize** `ImageInput` (base64) back from the object path. I/O rides `ctx.client` (the authenticated client in auth mode), and objects are written under a **family-prefixed** path, so the `0004` Storage RLS enforces per-family on the bytes. |
| `src/supabase/family.ts` | `ensureSeededFamily(ctx, name)` — find-or-create the single v1 family (the families analog of `ensureSeededChore`). The **only** `families` access; there is intentionally no families port/service yet, so it sits in the SDK-confinement zone rather than leaking `.from('families')` into `container.ts`. |
| `src/{chore,reference,submission}/supabaseStore.ts` | `Supabase{Chore,Reference,Submission}Store` — implement the ports; snake_case row ↔ camelCase domain mapping; oldest→newest by `created_at`. Each takes `(ctx, familyId)`: it **stamps `family_id` on every write and filters every read by it** (the constructor binding keeps the ports/services/fakes/tests frozen). |
| `supabase/migrations/0001_init.sql` | The four data tables (`chores`, `chore_references`, `submissions`, `verdicts`), the partial unique index `WHERE is_current`, the atomic `set_current_reference` RPC, and **RLS enabled with no policies**. |
| `supabase/migrations/0002_accounts.sql` | The accounts foundation: the `families`/`users` tables, real `family_id` FKs on the four data tables, the `private.auth_family_id()` `SECURITY DEFINER` helper (the RLS-recursion breaker), the `set_current_reference` re-create with `p_family_id`, and the per-family **RLS policies**. |
| `supabase/migrations/0003_auth.sql` | The auth activations: `users.username` (a child's login handle), the `private.auth_role()` helper, and **child-record-level RLS** — submissions/verdicts tighten so a child sees/inserts only their own rows while a parent sees the whole family. |
| `supabase/migrations/0004_storage_rls.sql` | **Storage object RLS:** per-family `select`/`insert` policies on `storage.objects`, keyed on the family-prefixed object path (`(storage.foldername(name))[1]` = `private.auth_family_id()`), so the photo **bytes** get the per-family isolation the rows already have (US17). |
| `supabase/migrations/0005_harden_function_search_path.sql` | Hardening from the live smoke's security advisor: re-creates `set_current_reference` with a pinned `set search_path = ''` + schema-qualified names (lint `0011_function_search_path_mutable`), and drops the orphaned pre-`family_id` 4-arg overload. Behavior unchanged. |
| `supabase/migrations/0006_family_id_not_null.sql` | `family_id` `NOT NULL` on the four data tables (`chores`/`chore_references`/`submissions`/`verdicts`), pinning per-row tenancy in the schema (it was nullable since the non-breaking `0002` add). A **conditional, defensive backfill** adopts any orphan rows into the seeded "My Family" (find-or-create) before the `SET NOT NULL`; a no-op on a clean/tenanted DB. `users.family_id` was already `NOT NULL`. Applied live + verified. |

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
and tenancy breaks silently under the service role). The policies stop being dormant
in **auth mode** (`SUPABASE_ANON_KEY` set): user-facing queries run through the
authenticated client, so the RLS policies enforce and the adapter filtering becomes
defense-in-depth — see "The auth layer". **Storage object RLS (the `0004` slice):**
photo bytes are now written under a **family-prefixed** object path and Storage I/O
rides the authenticated client, so the per-family RLS guards the bytes too, not just
the rows (US17) — `SupabaseContext` no longer carries the service-role `storageClient`
escape hatch. RLS *enforcement* under real authenticated JWTs is **now live-verified** by
the auth-mode smoke (see "The live smokes"). The full browser login/session flow
(middleware cookie refresh + Server-Action sign-in/out) — which the RLS smoke does not
exercise — is now covered by the **browser auth-flow smoke** (`npm run smoke:auth-flow`).
`family_id` is **now `NOT NULL`** on the four data tables (migration `0006`, applied
live). **Still deferred:** the Storage bucket itself (a manual prerequisite the
migrations do not create).

## The live smokes (`scripts/supabase-smoke.ts`, `supabase-auth-smoke.ts`, `auth-flow-smoke.ts`)

Three env-gated live integration checks, **all run green** against the live
`family-chore-tracker` project. They share helpers via `scripts/smoke-shared.ts`
(`loadEnv` / `solidPng` / `assert`). The service-role smoke proves the adapter
round-trip; the auth-mode smoke proves RLS *enforcement* (the one thing the service
role can't, since it bypasses RLS); the **browser auth-flow smoke** proves the Next
**app's** login/session/gating layer, the one thing the other two can't, since they
talk to Supabase directly, not through the app.

### Service-role round-trip — `npm run smoke:supabase`

`npm run smoke:supabase` wires the three live
adapters the way `container.buildStores()` does in service-role mode (the container
is `import 'server-only'` and can't be imported from a plain `tsx` script) and drives
the full loop: seed family → seed chore → `setReference` → `submitChore` (env-gated
judge) → `getHistory` → `computeStreak`, reading every step back through Storage +
Postgres. Guarded on `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (+
`SUPABASE_STORAGE_BUCKET`), auto-loads `.env`, and uses the live Gemini judge when
`GEMINI_API_KEY` is set, else the deterministic fake — the same rule `container.ts`
uses. Runs are **additive** (no dedup) — each adds a reference version + a
submission, by design, which is exactly what makes re-runs exercise the
`set_current_reference` demote+insert.

**Verified live (service-role mode, fake judge):** the adapter round-trip succeeds and
an independent MCP cross-check confirms every invariant — `family_id` stamped on every
row, family-prefixed Storage object paths (`<family_id>/{references,submissions}/…`),
EXIF→jsonb, the submission→verdict FK join, and the `isCurrent` invariant (exactly one
current reference after repeated `setReference`s). The smoke's security advisor flagged
one item (`set_current_reference`'s mutable `search_path`), fixed in `0005` and re-run
clean.

### Auth-mode RLS enforcement — `npm run smoke:supabase-auth`

`npm run smoke:supabase-auth` proves the per-family/per-child RLS policies actually
enforce — what the service-role smoke can't, because the service role BYPASSES RLS.
It additionally needs `SUPABASE_ANON_KEY` (the key the authenticated clients use). It
provisions **two families** (A: a parent + two children; B: a parent + one child) via
the admin/service-role client (the only privileged use — provisioning + cleanup), then
drives every assertion through real **authenticated** clients (anon key + a signed-in
user's JWT), the same client the app uses in `authMode()`. Owner writes go through the
adapters under each user's JWT (proving the real write path is *allowed* under RLS);
then raw authed-client queries prove *isolation*. Runs are self-contained and **cleaned
up** at the end (`--keep` to retain).

**Verified live (33 checks, all green):** **0002** per-family — parent A cannot
see/insert/probe family B's rows (and vice-versa); **0003** per-child — a child sees
only their own submissions/verdicts while the parent sees the whole family, and a child
can't insert as a sibling or into another family; **0004** Storage — a parent can read
their own family's photo bytes but cannot download or upload under family B's path
prefix. So RLS isolates rather than blanket-denies, under real JWTs.

### Browser auth flow — `npm run smoke:auth-flow`

`npm run smoke:auth-flow` proves the **Next app's** login/session/gating layer — what
the other two smokes can't, since they hit Supabase directly. It drives a running
authMode server (`npm run build && (set -a; . ./.env; set +a; npm start)`; target
`BASE_URL`, default `http://localhost:3000`) through the Server Action **no-JavaScript
form path**: GET a page, parse the form's `$ACTION_*` hidden fields, POST them back
(multipart, with an `Origin` header for the Server Action CSRF check) plus the user's
inputs, and follow redirects by hand while carrying cookies — exactly what a JS-off
browser does. The service-role key is used only to clean up (and to admin-provision a
confirmed parent as a fallback if sign-up can't run); a parent + child + family are
created and removed at the end (`--keep` to retain). This is why the `/login` page
honors `?tab=` (each form is server-rendered + reachable without JS). The parent's
test email uses a normal domain (`SMOKE_EMAIL_DOMAIN`, default `choretracker.app`) —
Supabase's public signUp rejects RFC-reserved domains like `example.com`.

**Verified live (13 checks green):** browser **create-family sign-up** → `/parent`
(needs "Confirm email" OFF — now set on the project); parent **sign-in** → `/parent`;
`proxy.ts`-refreshed **session cookie** carried across requests; **role gating** both
ways (a parent is bounced from `/child`, a child from `/parent`; an already-signed-in
user off `/login`); **parent-only child provisioning** ("Child added"); **sign-out**
clears the cookie (`/parent` → `/login` after); **child sign-in** → `/child`. If a
project has "Confirm email" ON, the smoke detects it, skips just the sign-up step, and
admin-provisions the parent instead. **Not covered:** the live Gemini judge (keyless)
— unrelated to auth.

## The auth layer (`lib/server/auth.ts`, `proxy.ts`, `app/auth/`, `app/login/`)

Real Supabase Auth + per-family RLS, **env-gated like persistence and the judge**:
`authMode()` is true only when `SUPABASE_ANON_KEY` is set alongside the persistence
keys. Three runtime modes, all behind the identical ports:

1. **In-memory** (no Supabase): one implicit family, no login. The keyless default + CI.
2. **Service-role** (URL + service-role key, no anon): the live stores under the
   service-role key, one seeded family, no login, RLS bypassed.
3. **Auth** (also the anon key → `authMode()`): login required; per-request stores
   bound to the **signed-in user's** family, with DB I/O on an **authenticated**
   (anon-key + user-JWT) client so the per-family + per-child RLS policies enforce.

**The flip is the whole point, and it touches only the wiring.** The `Supabase*Store`
adapters and the ports are unchanged — a store just receives a different `ctx.client`
(the user's authenticated client vs the service-role one) and a different bound
`familyId` (the caller's vs the seeded one). Storage I/O rides that **same** client,
and objects are written under a family-prefixed path, so the `0004` Storage policies
isolate the photo bytes per family just as the row policies isolate the rows; the
service role is now kept only for privileged provisioning + seeding, never for
user-facing bytes.

| File | Responsibility |
| --- | --- |
| `lib/server/auth.ts` | `authMode()`; `getAuthedClient()` (per-request `@supabase/ssr` server client, cookies via `next/headers`, `cache()`d); `getAdminContext()` (the service-role context, for provisioning + Storage); `getIdentity()` (`{ userId, familyId, role, username }` from the user's own `users` row via RLS `users_select_self`); `requireUser`/`requireParent`/`requireChild` (redirect guards). `import 'server-only'`. |
| `proxy.ts` | The Next 16 `proxy` (the renamed `middleware`): refreshes the session cookie each request; a **no-op** when auth is unconfigured. |
| `app/auth/actions.ts` | `signUpParentAction` (creates the family + parent `users` row), `signInParentAction`, `signInChildAction` (username→synthetic email), `signOutAction`, `provisionChildAction` (parent-only; mints a confirmed child auth user via the admin API + inserts its `users` row). |
| `app/login/` | The login UI — parent sign-in / create-family / child sign-in tabs. `?tab=` selects which form is **server-rendered**, so each is deep-linkable + works without JS (the client tabs still toggle instantly); this also lets the browser auth-flow smoke reach every form. |
| `app/parent/children/` | Parent-only: provision + list the family's children. |

**Children have no email** (PRD: parent-provisioned, no self-registration): a child's
username is slugified and a **synthetic auth email** (`<slug>@children.chore.local`)
is derived deterministically, so login needs only the username + password — no email
delivery. **The container owns the flip** (`getStores`/`getSeededChore` branch on
`authMode()`); pages call `requireParent`/`requireChild`, and Server Actions thread
`childId` = the session user id. **Manual prerequisite:** turn OFF "Confirm email" in
Supabase Auth for v1 (parents need an immediate session). **Runtime-verified:** the
auth-mode RLS smoke (`npm run smoke:supabase-auth`) proves the per-family/per-child/
Storage policies enforce under real authenticated JWTs (provisioning + the
authenticated-client adapter path included), and the **browser auth-flow smoke**
(`npm run smoke:auth-flow`, sibling of `smoke:supabase-auth`) drives the Next app
itself — **create-family sign-up**, sign-in, the `proxy.ts` cookie refresh,
Server-Action sign-out, parent-only child provisioning, and per-role page gating —
through the no-JS Server Action form path (see "The live smokes"), **13/13 green**
with "Confirm email" turned OFF on the project. (With it ON, the smoke skips just the
sign-up step and admin-provisions the parent instead.)

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
| `lib/server/container.ts` | The composition root — **env-gates** persistence across three modes (in-memory; service-role single-family; per-request **authenticated** family-scoped stores in `authMode()` — see "The auth layer"), seeds the "Tidy room" chore (find-or-create), and exposes `getStores` / `getSeededChore` / `buildSubmitDeps` / `getStreakState`. **The only place wired to a concrete persistence + judge implementation.** |
| `app/actions.ts` | `setReferenceAction` / `submitChoreAction` (`'use server'`) — read the `<input capture>` file from FormData, convert to the core's `ImageInput` (base64, no `data:` prefix), and call `setReference` / `submitChore`. Map `NoCurrentReferenceError` to a friendly signal; return only serializable data. |
| `app/{page,parent/page,child/page,parent/history/page,login/page,parent/children/page}.tsx` | Server Components reading the container directly, `dynamic = 'force-dynamic'`. In `authMode()` each guards with `requireParent`/`requireChild`/`getIdentity`; in legacy mode the guards are transparent. |
| `app/components/*` + form clients | `ReferenceForm` / `SubmitForm` / `login/LoginForms` / `parent/children/ProvisionChildForm` (`'use client'`, `useActionState`); presentational `VerdictCard` / `StreakBadge` / `PhotoThumb`; `Nav` is now an async Server Component, role-aware in auth mode (+ a sign-out form). |
| `app/manifest.ts` | The web app manifest (installable PWA), now paired with the offline service worker below. |
| `public/sw.js` | The **offline service worker** (hand-written, dependency-free). GET + same-origin only: navigations are network-first with a fallback to the cached `/offline`; `/_next/static/*` is cache-first; a small shell allowlist is stale-while-revalidate; **everything else (Server Action POSTs, RSC/dynamic GETs) is never cached**, so no stale or cross-user authenticated response is served. Versioned cache (`chore-shell-v1`) with old-cache cleanup on activate. |
| `app/components/ServiceWorkerRegistrar.tsx` | `'use client'`; registers `/sw.js` (`scope:'/'`, `updateViaCache:'none'`) on load, **production only** (a dev SW fights HMR). Mounted in `layout.tsx`. Renders nothing. |
| `app/offline/page.tsx` | The branded offline fallback the SW serves for navigations — static, auth-free, no domain data (judging needs the network). `next.config.mjs` adds the `/sw.js` response headers (no-store + correct MIME + `Service-Worker-Allowed`). |

**Three deliberate bridges, each swapped behind its env with no caller changes:**

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
3. **Auth is env-gated** — real Supabase Auth + per-family RLS when
   `SUPABASE_ANON_KEY` is set (`authMode()`), else the legacy no-login mode. See
   "The auth layer".

Accounts + Auth are **built and env-gated** (see "The auth layer" and bridge 3
above): in `authMode()` login is required and the stores are authenticated +
family-scoped; unconfigured, the app runs as a single implicit family with no login
and `childId` omitted. The large-photo body cap (`serverActions.bodySizeLimit` in
`next.config.mjs`) is a stopgap until direct-to-Storage upload removes large bodies
from the action path.

## Commands

```bash
npm install
npm run dev       # the Next.js PWA at http://localhost:3000 (fake judge unless keyed)
npm run build     # next build — also the server/client boundary check (CI runs it)
npm start         # serve the production build
npm test          # vitest — unit tests for policy, parsing, and the pipeline
npm run typecheck # tsc for the core (tsconfig.core.json) AND the app (tsconfig.json)
npm run demo      # runs the tracer bullet end-to-end with the fake judge
npm run smoke:supabase       # live service-role round-trip of the 3 adapters (needs SUPABASE_* in .env)
npm run smoke:supabase-auth  # live per-family/per-child/Storage RLS enforcement (also needs SUPABASE_ANON_KEY)
npm run smoke:auth-flow      # browser login/session/gating via the Next app (needs a running authMode server)
# Live path (needs a key): cp .env.example .env, set GEMINI_API_KEY, then:
GEMINI_API_KEY=... npm run demo -- ref.jpg sub.jpg "Tidy room"
# Live Supabase persistence (optional): set SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
# SUPABASE_STORAGE_BUCKET, run the migrations in order (0001_init.sql, 0002_accounts.sql,
# 0003_auth.sql, 0004_storage_rls.sql, 0005_harden_function_search_path.sql,
# 0006_family_id_not_null.sql), create a
# private Storage bucket, then `npm run smoke:supabase` to verify the round-trip. Unset → in-memory.
# Live Auth (optional): also set SUPABASE_ANON_KEY and turn OFF "Confirm email" in the
# Supabase Auth settings → login + per-family RLS turn on. Unset → single-family, no login.
# Then `npm run smoke:supabase-auth` proves RLS isolation under real authenticated JWTs,
# and (with a built server running in authMode) `npm run smoke:auth-flow` drives the
# browser login/session/gating through the Next app itself.
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
`InMemoryReferenceStore`, **plus the `getChore` gate** — `ChoreNotFoundError` for
an unreal chore, success for a seeded one; the invariant tests bind a permissive
chore double so they stay focused on versioning), `choreService` (name policy +
the `getChore` existence assertion + copy-on-read, over `InMemoryChoreStore`), and
`parseModelJudgment` (contract enforcement). The
model's actual visual judgment is non-deterministic and belongs in eval-style
testing, **not** unit tests; use `FakeJudgeClient` to exercise the pipeline
without a live model. The live `Supabase*Store` adapters likewise have **no unit
tests** — like `gemini.ts`, they're exercised by the two env-gated live smokes,
both **green** against a real project: `npm run smoke:supabase` (service-role round-trip;
per-family stamping/filtering + the `isCurrent` invariant) and `npm run smoke:supabase-auth`
(per-family/per-child/Storage RLS isolation under real authenticated JWTs). The in-memory
fakes stay the tested persistence path.

`submissionService` gets a **light integration test** (PRD): compose
`submitChore` with `FakeJudgeClient` + `InMemoryReferenceStore` (seeded via
`setReference`) + `InMemorySubmissionStore`, asserting the composed behavior
(records persisted, the current reference used, EXIF/childId threaded, a failed
judge still records the submission, **the `getChore` gate throws
`ChoreNotFoundError` before any write for an unreal chore**, and a full
`createChore → setReference → submitChore` pass over a real `InMemoryChoreStore`)
and that the stored records feed `computeStreak` with no mapping — deterministic
via injected ids/clock, never `Date.now()`.

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
