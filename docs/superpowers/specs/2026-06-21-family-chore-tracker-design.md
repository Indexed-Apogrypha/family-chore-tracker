# Family Chore Tracker — Architecture & Design

> **Status:** Proposed (awaiting approval). Supersedes nothing — this is the
> first application design after the repo reset. Governance/CI scaffolding is
> already in place; this document defines the application to be built on it.
>
> **Date:** 2026-06-21

## 1. Overview

A web app for **AI photo-based family chore verification**. A kid completes a
chore, snaps a photo, and submits it. A vision "judge" (Anthropic or Gemini)
returns an **advisory** verdict (pass / confidence / reasoning). The chore lands
in a **pending-review** state, and a **parent makes the authoritative decision**
to approve or reject. Approved chores credit the kid **points**.

The product runs in two interchangeable configurations, guaranteed equivalent by
contract tests:

- **Keyless (practice) mode** — fake judge, in-memory stores, system clock. No
  accounts, no network, no AI spend. The default for local dev and the test suite.
- **Real mode** — Supabase (Postgres/Auth/Storage) + a real vision provider,
  switched on by the presence of env keys.

## 2. Goals & non-goals (v1)

**Goals**

- The end-to-end core loop: family → chores → kid submits photo → AI judges →
  parent approves/rejects → points.
- Parent accounts + kid profiles, with per-family data isolation.
- Recurring chore templates **and** one-off chores.
- A points system (earned, never spent, in v1).
- The keyless practice mode as a first-class, always-available configuration.

**Non-goals (explicitly deferred)**

- Rewards **catalog / redemption** (spending points). The ledger leaves a clean
  seam for it; no catalog in v1.
- **Reminders / notifications** (these need a scheduled job — see §7.4).
- **Appeals** workflow (a kid contesting a rejection).
- Multi-judge ensembles, native/mobile apps, leaderboards, streaks.

## 3. Product decisions (locked)

| Area | Decision |
|------|----------|
| **Actors & auth** | Parents have real Supabase Auth accounts and own a **family**. Kids are **profiles** under the family (no email), selected by name + a short **PIN** on a shared device. |
| **Judge authority** | The AI judge is **advisory**. Its verdict is attached to the submission, which enters `pending_review`; a **parent's approve/reject is authoritative** and may override the AI. |
| **Rewards** | **Points per chore**, recorded in an **append-only ledger**. A kid's total is the sum of their ledger entries (no mutable balance). Redemption is deferred. |
| **Scheduling** | Chores come from **recurring templates** that materialize into dated **instances** via **lazy, idempotent generation on read**, plus **one-off** chores. No cron in v1. |

### 3.1 Auth & the PIN, precisely

- All database access happens under the **authenticated parent session**
  (Supabase anon key + JWT + RLS). Kids never hold an auth identity.
- A shared family device is logged in as a parent; the app holds an **app-level
  "active profile"** (a parent or a specific kid) selected via PIN. On a
  successful `verifyKidPin`, the client adopts that kid as the active profile and
  builds `ctx.actor = { kind: 'kid', memberId }` for later calls; the server
  mints no kid token (consistent with the PIN not being a security boundary).
- The **PIN is an app-level gate**, not a security boundary: it decides which
  kid is acting and restricts the UI to kid actions. Anyone with the unlocked
  device and the family session has the family's data. This is an accepted v1
  limitation, documented so it is a known trade-off, not a surprise.

## 4. Architecture: the hybrid

The application layer is organized as **Ports & Adapters (backbone)** with an
**ergonomic session edge**, a **closed error set**, and **no middleware/registry
machinery** (deferred until cross-cutting concerns actually exist). This blend
was chosen via a "design-it-twice" exploration of four alternatives; rationale
in §13.

### 4.1 Layers & the dependency rule

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

- **`domain/` and `usecases/` import only `ports/`** — never an adapter, never
  `process.env`.
- **`composition/` is the only place that imports adapters and reads env.** It is
  the single env→adapter switch and the only home of the keyless-vs-real decision.

### 4.2 The session edge

```ts
const app = makeApp(ports)             // built once from env-selected adapters
const session = app.as(ctx)            // ctx = { familyId, actor }
await session.submitPhoto(instanceId, bytes)   // hot-path verbs carry no ids
```

- `app.as(ctx)` binds the request context once. Everyday verbs (submit, approve,
  today's board) read as one obvious call; the acting member is ambient.
- Admin operations (add kid, create template) are allowed to be more verbose.
- `createFamily` is a bootstrap operation on `app` itself (no prior family/ctx).
- Underneath, every session method delegates to a **pure use-case function**
  `(ports, ctx, input) => Promise<Result<T>>`, so use-cases remain independently
  testable with explicit context.

## 5. The four seams

Each seam is a single interface with ≥2 adapters, selected at the composition
root. The in-memory/fake side is an **executable spec**; one **contract test**
suite per seam runs against both sides to prove them interchangeable.

```ts
// ports/judge.ts        — fake | anthropic | gemini   (Anthropic precedence)
interface JudgePort { evaluate(photo: PhotoRef, chore: ChoreContext): Promise<Verdict> }

// ports/photo-storage.ts — in-memory | supabase-storage
interface PhotoStorage { put(bytes: Uint8Array, meta: PhotoMeta): Promise<PhotoRef>
                         signedUrl(ref: PhotoRef): Promise<string> }

// ports/repositories.ts  — in-memory | supabase
interface ChoreRepository      { /* templates + instances; idempotent upsert */ }
interface SubmissionRepository { /* attempts + verdict */ }
interface MemberRepository     { /* family, parents, kids, pin_hash */ }
interface PointsLedger         { append(e: LedgerEntry): Promise<void>
                                 totalFor(familyId: FamilyId, memberId: MemberId): Promise<number> }

// ports/clock.ts         — system | fixed(test)
interface Clock { today(): IsoDate; now(): IsoInstant }
```

Key value shapes: `Verdict = { pass: boolean; confidence: number; reasoning: string; model: string }`
and `ChoreContext = { title: string; description?: string }` (what the judge is
told the chore is). The persisted `ai_verdict` (§6) is this `Verdict`.

**Env selection (composition root):**

- Judge: `JUDGE_ANTHROPIC_API_KEY` → Anthropic, else `JUDGE_GEMINI_API_KEY` →
  Gemini, else **fake**. Models come from `CLAUDE_MODEL` / `GEMINI_MODEL`.
- Persistence/Storage: `SUPABASE_URL` + key → Supabase, else **in-memory**.
- Clock: system (real); fixed only in tests.

This is exactly the degradation contract already described in `.env.example`.

## 6. Domain model & data

All tables carry `family_id` (the tenant key for RLS).

| Aggregate / table | Key fields |
|-------------------|-----------|
| `families` | `id`, `name`, `created_by` |
| `members` | `id`, `family_id`, `kind: parent\|kid`, `display_name`, `auth_user_id?` (parents), `pin_hash?` (kids) |
| `chore_templates` | `id`, `family_id`, `title`, `description`, `points`, `recurrence`, `assigned_member_id`, `active` |
| `chore_instances` | `id`, `family_id`, `template_id?` (null = one-off), `title`/`description?`/`points` (snapshot — `description` fed to the judge), `assigned_member_id`, `due_date`, `status` |
| `submissions` | `id`, `family_id`, `instance_id`, `submitted_by`, `photo_path`, `status`, `ai_verdict jsonb {pass,confidence,reasoning,model}`, `decided_by?`, `decided_at?` |
| `points_ledger` | `id`, `family_id`, `member_id`, `submission_id`, `delta`, `reason`, `created_at` (append-only) |

*v1 note:* `points_ledger.delta` is always positive and `reason` is
`'chore_approved'`; negative deltas / other reasons are the seam for future
redemption.

**Cardinality:** a `chore_instance` has **many** `submissions` over its life (1:N).

**Idempotency keys (the two that matter):**

- `chore_instances` — a **partial** unique index on
  `(template_id, assigned_member_id, due_date) WHERE template_id IS NOT NULL`
  makes **template-generated** instances safe to lazily upsert on every read.
  One-off instances (`template_id = null`) are created explicitly via
  `createOneOff` and are never lazily regenerated, so they sit intentionally
  outside this constraint.
- `points_ledger` unique on `submission_id` — makes the approve→credit operation
  idempotent (a replayed approve never double-credits), even across multiple
  submissions on one instance.

**Enums**

- `chore_instances.status`: `todo | evaluating | pending_review | approved`
- `submissions.status`: `evaluating | pending_review | approved | rejected`
- `recurrence`: `{ kind: 'none' }` (one-off) `| { kind: 'daily' }` `| { kind: 'weekly', days: number[] }`

## 7. Core workflow

### 7.1 Lifecycle (state machine)

```
 todo ──(kid submits photo)──▶ evaluating ──(AI verdict, advisory)──▶ pending_review
                                                                          │
                                              (parent approves) ──────────┤──▶ approved  → +points (once)
                                              (parent rejects)  ──────────┘──▶ todo      (redo)
```

The AI verdict is recorded but **never** advances past `pending_review`; only a
parent's decision is authoritative. Points are credited **only** on approve, and
**exactly once** (ledger uniqueness on `submission_id`).

A rejection makes that *submission* terminal (`rejected`) and recycles the
*instance* to `todo`, where a fresh photo creates a **new** submission against the
same instance. `chore_instances` has no `rejected` state — rejection lives on the
submission. The "+points once" guarantee survives multiple submissions on one
instance because each *approved* submission is credited once by `submission_id`.

### 7.2 `submitPhoto` orchestration (ordering is part of the contract)

1. `PhotoStorage.put(bytes)` → `PhotoRef`
2. create `Submission(status=evaluating)`; instance → `evaluating` (persist first)
3. `JudgePort.evaluate(ref, choreContext)` → `Verdict`
4. attach verdict; submission + instance → `pending_review`

If the judge fails (infrastructure error), the submission **stays `evaluating`**
with the photo already persisted and a `judge_unavailable` error surfaced. The
only exit from `evaluating` is a **retry** that re-runs step 3 (the judge); on
success it proceeds to `pending_review`. The photo is never lost. (Letting a
parent decide directly from `evaluating` is a possible future affordance, not a
v1 transition.)

### 7.3 Lazy instance generation

`getTodayBoard(memberId, date?)` (date defaults to `clock.today()`) materializes
any missing instances for active templates due on `date`, idempotently (the
`(template_id, member, due_date)` key), then returns the board. **No other
operation generates instances**, and there is **no cron job** in v1.

### 7.4 Where a scheduled job would later fit

The only thing that needs to happen when nobody opens the app is **proactive
reminders** ("you haven't done your chores"). That is the one future feature that
warrants a scheduled job (e.g. a Vercel Cron hitting a route). It is out of scope
for v1 and does not change the lazy-generation design.

## 8. Application interface

### 8.1 Use-cases (the ~11 operations)

`createFamily`, `addKid`, `verifyKidPin`, `listMembers`, `createTemplate`,
`createOneOff`, `getTodayBoard`, `submitPhoto`, `getReviewQueue`, `decide`,
`pointsTotal`. Each is a pure function `(ports, ctx, input) => Promise<Result<T>>`
and is also reachable via the session facade (§4.2).

`decide(submissionId, 'approve' | 'reject')` operates on a **specific submission**
and is valid only when that submission is in `pending_review` (else
`invalid_transition`).

### 8.2 Result & the closed error set

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: AppError }

type AppError =
  | { code: 'not_found'; entity: string; id: string }
  | { code: 'forbidden'; need: 'parent' | 'kid' | 'family_member' }   // wrong-actor
  | { code: 'invalid_transition'; from: string; to: string }
  | { code: 'bad_pin' }
  | { code: 'judge_unavailable' }
  | { code: 'storage_unavailable' }        // photo-storage infra fault (→ 503)
  | { code: 'persistence_unavailable' }     // DB/persistence infra fault (→ 503)
  | { code: 'validation'; field: string; message: string }
```

Expected failures are **values**, not exceptions, so the UI can handle them with
compiler-checked exhaustiveness. Adapters may throw on true infrastructure faults;
use-cases catch and map those — `judge_unavailable` for the vision judge, and
`storage_unavailable` / `persistence_unavailable` for the photo-storage and
persistence seams (so `submitPhoto`/`retrySubmission` never escape as 500s, §7.2).

### 8.3 Request context & authorization

```ts
interface RequestContext { familyId: FamilyId; actor: Actor }
type Actor = { kind: 'parent'; memberId: MemberId } | { kind: 'kid'; memberId: MemberId }
```

- Identity is proven at the edge (Supabase session → parent; PIN check → active
  kid); **capability is enforced inside each use-case** against `ctx.actor`.
- Parent-only: `addKid`, `createTemplate`, `createOneOff`, `getReviewQueue`,
  `decide`. `submitPhoto` requires the acting kid to own the instance (or a parent).
- Any family member (parent or kid): `getTodayBoard`, `pointsTotal`,
  `listMembers`, `verifyKidPin`. `createFamily` is the bootstrap exception — an
  authenticated parent who has no family yet (see §4.2).
- Every use-case re-checks `ctx.familyId` against loaded entities; cross-family
  ids resolve to `not_found` (mirrors RLS so in-memory behaves like Supabase).

## 9. Security & privacy

- **Tenancy is enforced in two layers.** (1) *Application layer (always on):*
  every use-case scopes by `ctx.familyId` and resolves cross-family ids to
  `not_found` — identical in-memory and on Supabase, and the primary guard. (2)
  *Database (Supabase path):* **per-family RLS** on every table, keyed on
  `family_id`, via the parent's JWT (anon key) — defense-in-depth.
- The **service-role key is server-only**, never exposed to the browser, and used
  *sparingly* for the few operations that must bypass RLS (e.g. bootstrapping a
  new family at signup, storage signing) — never for general per-request reads.
- **PIN** stored hashed; compared server-side in `verifyKidPin` against
  `pin_hash` (KDF chosen at implementation). App-level gate only (see §3.1).
- **Photos** stored at `family_id/instance_id/submission_id.<ext>` with a
  per-family storage policy; viewed via short-lived **signed URLs**. The bucket
  has per-path RLS keyed on the leading `family_id` segment (mirroring the table
  RLS) so a parent JWT can only ever touch its own family's objects.
- **Orphaned blobs:** `submitPhoto` stores the photo *before* the row exists
  (§7.2 ordering), so a persistence fault can leave a blob with no `submissions`
  row. This is a reclaimable orphan, not a correctness bug — a documented GC
  ([`docs/ops/chore-photos-gc.md`](../../ops/chore-photos-gc.md)) deletes
  `chore-photos` objects whose path `submission_id` has no row. Not wired as a
  live cron (the app's scale doesn't warrant it); it's a runnable reclaim.
- **Secrets** live only in env (`.env` gitignored); CI runs gitleaks.

## 10. Testing strategy

- **Domain** — pure unit tests (state transitions, recurrence, points math).
- **Use-cases** — through their interface via `makeApp(inMemoryPorts).as(ctx)`
  with fake judge + fixed clock: full coverage, no network, no server.
- **Contract** — one suite per seam, run against the in-memory adapter (always)
  and the Supabase adapter (gated on a test database). The in-memory adapter is
  the executable spec the real one must match.
- **e2e** — deferred (Playwright) for the photo-capture path.
- Must satisfy the existing required CI checks: `lint`, `typecheck`, `test`,
  `build`, `secret-scan`, `pr-title`.

## 11. Folder structure

```
src/
  domain/{chore,submission,points,family}/   # pure logic + types
  ports/{judge,repositories,photo-storage,clock,context}.ts
  usecases/{family,chores,submission,review,points}.ts
  app-session/app.ts                         # makeApp(ports).as(ctx) → Session
  adapters/
    judge/{fake,anthropic,gemini}.ts
    persistence/{in-memory,supabase}/
    storage/{in-memory,supabase}.ts
    clock/{system,fixed}.ts
  composition/{env.ts,container.ts,server.ts,session.ts}   # the only env/adapter seam
  app/                                        # Next.js App Router (thin)
test/
  contract/                                   # per-seam suites (in-memory + supabase)
  usecases/                                   # in-memory wiring
```

## 12. Delivery plan (milestones)

Each milestone is a set of small, PR-sized issues (fits the branch → PR →
squash-merge governance). "Real cloud connects" marks where Supabase is wired in.

| Milestone | Goal | Cloud |
|-----------|------|-------|
| **M0 — Scaffold & seams** | Next.js app, ports/adapters skeleton, in-memory + fake judge, CI scripts green | — |
| **M1 — Accounts & profiles** | Parent signup, family, kid profiles + PIN, profile switcher | **real login** |
| **M2 — Chores** | Templates, recurrence, **lazy generation**, one-off, assignment, kid "today" board | — |
| **M3 — Submission & photos** | Mobile camera capture, photo upload | **real storage** |
| **M4 — AI judge** | Judge adapters (fake/anthropic/gemini), verdict, `pending_review` | — |
| **M5 — Review & points** | Parent review queue, approve/reject + override, points ledger, totals | — |
| **M6 — Data → cloud** | Swap chore/points persistence in-memory → Supabase + RLS | **real DB** |
| **M7 — Polish & deploy** | Responsive/PWA pass, production deploy | — |

**Sequencing notes:** the two pieces that cannot be meaningfully faked — real
**login** (M1) and **photo storage** (M3) — connect to Supabase when their
feature is built; the chore/points **data** stays on the in-memory adapter (cheap
to reshape while the model churns) until **M6**, where the contract test makes the
swap low-risk.

## 13. Why this architecture (design-it-twice summary)

Four application-layer shapes were designed in parallel — **minimal** (one
`handle(request)` verb), **flexible** (handler registry + middleware pipeline),
**ergonomic** (bound session), and **ports & adapters** (uniform pure functions +
contract tests). The chosen hybrid:

- **Backbone = ports & adapters** — its organizing principle *is* the product's
  defining promise (keyless ≡ keyed, proven by contract tests).
- **Edge = ergonomic session** — fixes the backbone's only real weakness (threading
  ports/ctx/input through every screen).
- **Closed error set** from the minimal design — for exhaustive UI handling.
- **Deferred: the middleware/registry** from the flexible design — genuine
  engineering, but speculative for an ~11-operation family app; the pure use-cases
  can be wrapped later without changing call sites if appeals/notifications/audit
  arrive.

## 14. Open questions / future work

- Reminders via a scheduled job (the trigger for adding cron).
- Rewards catalog & redemption (spending points).
- Appeals workflow (kid contests a rejection).
- Notifications (in-app / push), leaderboards, streaks.
- Native/PWA depth and offline behavior.

## 15. Stack & references

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Supabase** — Postgres, Auth, Storage (per-family RLS)
- **Vision judge** — Anthropic (`CLAUDE_MODEL`, default `claude-sonnet-4-6`) /
  Gemini (`GEMINI_MODEL`, default `gemini-2.5-flash`) behind `JudgePort`
- **Vitest** for tests; **Vercel** for deploy (pipeline already wired)
- See [`.env.example`](../../../.env.example) and
  [`.github/CONTRIBUTING.md`](../../../.github/CONTRIBUTING.md) for the
  configuration contract and the SDLC workflow every PR must pass.
- The SDLC governance this app is built on is designed in
  [`2026-06-20-github-sdlc-enforcement-design.md`](2026-06-20-github-sdlc-enforcement-design.md).
