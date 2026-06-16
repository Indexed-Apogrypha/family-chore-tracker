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
persistence seam), and **`submissionService`** (orchestrates a child's submission
→ reference lookup → judge → persisted submission+verdict, over the same seam).
Not yet built (see PRD): `choreService`, the Next.js PWA, the live Supabase
(Postgres/Auth/Storage) adapters behind the persistence seams, camera capture,
streak/history *UI*, and accounts.

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
| `types.ts` | `ChoreReference`, `ReferenceDraft`, and the `ReferenceStore` port (the future-Supabase seam). Reuses the judge core's `ImageInput`. |
| `referenceService.ts` | `setReference` / `getCurrentReference` / `listReferences` — free functions taking the store first (like `runJudgment(client, input)`). The invariant lives in `setReference`: demote the prior current, then insert the new one as current. |
| `memoryStore.ts` | `InMemoryReferenceStore`, the fully-working fake (sibling of `FakeJudgeClient`) — insertion-ordered, with an injectable id/clock for deterministic tests. |

Every `setReference` is a new version even if the bytes match a prior one (no
dedup — a re-upload is a deliberate, history-worthy act). The live
`SupabaseReferenceStore` is **deferred** and, like `gemini.ts`, stays **out of
`index.ts`**: it will keep bytes in Supabase Storage + a path on the row, and
make demote+insert atomic with a transaction and a partial unique index
(`WHERE is_current`). `choreId` is an opaque key here — chore existence isn't
validated until `choreService` exists.

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

**Submission + verdict are two writes, and the submission is stored *before*
judging — by design.** A submission whose judging fails (model down, parse
error) stays persisted with no verdict, so the attempt and its EXIF remain
auditable for future anti-gaming (story 19), and `computeStreak` already treats
an unverdicted submission as a transparent non-event. `submitChore` is **not
transactional in this slice**; making the pair atomic is a deferred
`SupabaseSubmissionStore` concern, like `ReferenceStore`'s demote+insert. That
live adapter — bytes→Storage, EXIF→jsonb, `family_id` for RLS — stays **out of
`index.ts`** like `gemini.ts`/`SupabaseReferenceStore`. `childId`/`choreId` are
opaque keys until `choreService`/accounts exist.

## Commands

```bash
npm install
npm test          # vitest — unit tests for policy, parsing, and the pipeline
npm run typecheck  # tsc --noEmit
npm run demo      # runs the tracer bullet end-to-end with the fake judge
# Live path (needs a key): cp .env.example .env, set GEMINI_API_KEY, then:
GEMINI_API_KEY=... npm run demo -- ref.jpg sub.jpg "Tidy room"
```

## Conventions

- TypeScript, ESM (`"type": "module"`), strict mode incl.
  `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (use `import type` for
  type-only imports).
- The default vision model is **Gemini Flash-class** (`gemini-2.5-flash`),
  configurable via `GEMINI_MODEL`. Per the PRD it is deliberately swappable.

## Testing philosophy (from PRD)

Test external behavior (inputs→outputs), not internals, so tests survive
refactors. Unit-test the deterministic parts — `evaluateVerdict` (policy paths),
`computeStreak` (crafted event sequences: streaks, breaks, gaps),
`referenceService` (the `isCurrent` invariant, behaviorally, over
`InMemoryReferenceStore`), and `parseModelJudgment` (contract enforcement). The
model's actual visual judgment is non-deterministic and belongs in eval-style
testing, **not** unit tests; use `FakeJudgeClient` to exercise the pipeline
without a live model.

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
