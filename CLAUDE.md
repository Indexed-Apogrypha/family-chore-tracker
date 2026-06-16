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

Early. The first slice built is the **reference→verdict tracer bullet**: the
core judging pipeline, end-to-end, behind clean seams. Not yet built (see PRD):
the Next.js PWA, Supabase (Postgres/Auth/Storage), camera capture, streaks,
parent history, and accounts.

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
refactors. Unit-test the deterministic parts — `evaluateVerdict` (policy paths)
and `parseModelJudgment` (contract enforcement). The model's actual visual
judgment is non-deterministic and belongs in eval-style testing, **not** unit
tests; use `FakeJudgeClient` to exercise the pipeline without a live model.

## Handling children's images

This app judges photos of minors' rooms. Two compliance items are pre-conditions
for a real launch (not the MVP, but never silently cross them): COPPA-grade
parental consent, and confirmation of the vision vendor's data-handling/training
terms for children's images. Capture EXIF but don't build anti-gaming yet.
