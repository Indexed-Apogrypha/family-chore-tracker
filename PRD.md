# PRD: Family Chore Tracker (v1)

## Problem Statement

Parents want a low-effort, objective way to confirm their child has tidied their room or completed a chore, without standing over them or relitigating "is this actually clean." Today this is a subjective, friction-filled negotiation. Children, meanwhile, get no positive feedback loop for doing the work.

## Solution

A mobile-first PWA where a parent sets up a chore once by photographing the room in its desired "clean" state. The child later photographs the room; an AI compares the submission against the parent's reference and returns a structured pass/fail verdict with explanations. Parents see a history dashboard; children see streaks and completion tracking that make the routine feel rewarding.

## User Stories

1. As a parent, I want to create a family account, so that my household has a private space for our chores.
2. As a parent, I want to create accounts for my children tied to my account, so that they can participate under my supervision.
3. As a parent, I want to create a chore (e.g. "Tidy room"), so that there is a defined task to check against.
4. As a parent, I want to photograph the room in its clean state as a reference, so that the AI has a concrete standard to judge against.
5. As a parent, I want to update the reference photo later without losing the old one, so that I can adapt to room changes while keeping history.
6. As a child, I want to log into my own account, so that I can see my own chores and progress.
7. As a child, I want to take and submit a photo of my room from my phone, so that I can mark a chore as attempted.
8. As a child, I want the app to use my phone camera directly, so that submitting is quick and easy.
9. As a child, I want to see an immediate verdict on my submission, so that I know whether I passed.
10. As a child, I want minor messiness not to fail me, so that the standard feels fair.
11. As a child, I want to see my current streak, so that I stay motivated to keep the room tidy.
12. As a child, I want completion tracking over time, so that I can see my progress.
13. As a parent, I want to see a history of my child's submissions and verdicts, so that I can monitor without micromanaging.
14. As a parent, I want each verdict to include a human-readable explanation, so that a result isn't an unexplained black box.
15. As a parent, I want low-confidence or ambiguous AI results flagged for my review, so that an uncertain machine call doesn't unfairly pass or fail my child.
16. As a parent, I want to view the submitted photo, so that I can make my own judgment when needed.
17. As a parent, I want my family's data isolated from other families, so that our photos and information stay private.
18. As a product owner, I want the AI vendor to be swappable, so that I can move to a cheaper or better model without rewriting the app.
19. As a product owner, I want submission metadata (e.g. EXIF) captured even if unused, so that anti-gaming features can be added later without data loss.

## Implementation Decisions

**Scope (v1):** Single family, one chore type ("Tidy room"), reference-photo comparison only, structured JSON verdict, basic streak, simple parent history view.

**Stack:** Next.js PWA (using `<input capture>` for native camera); Supabase for Postgres, Auth, and Storage; a Gemini Flash-class vision model for v1. Native Expo client deferred to v2, reusing the same API and data layer.

**Data model (six tables):** `families`; `users` (with `role` parent/child and `family_id`); `chores` (`type`, `criteria` for future rubric mode); `chore_references` (`is_current` flag for versioned references); `submissions` (with `exif` jsonb, `family_id` denormalized); `verdicts` (`result`, `status`, `confidence`, `deviations`, `model`). Streaks are computed over the event stream, not stored.

**Accounts:** Children have their own logins, parent-provisioned (no child self-registration), tied to the parent via shared `family_id`. Row-level security scopes parents to their `family_id` and children to their own records. *Status: the `families`/`users` tables, the `family_id` foreign keys on every data table, and the per-family RLS policies are built (family-level isolation — User Story 17). Supabase Auth, the login/provisioning UI, and child-record-level scoping (a child seeing only their own submissions) are staged for the auth slice; the policies are present but dormant while the server uses the service-role key, which bypasses RLS — per-family scoping is enforced in the adapters meanwhile, so the app still runs as a single seeded family.*

**Modules:**

- `choreService` — create/manage chores (parent setup). Thin, but the entry point for the multi-chore future.
- `referenceService` — upload and version the clean-room reference; maintains the invariant of exactly one current reference per chore while retaining prior ones. `setReference(choreId, image)` / `getCurrentReference(choreId)`.
- `judgeImage(reference, submission, choreName) -> Verdict` — encapsulates all vision-vendor integration, prompting, and JSON parsing behind a stable interface (the vendor-swap seam).
- `evaluateVerdict(modelOutput) -> {result, status}` — applies v1 policy: fail only on high-severity deviations; uncertain/low-confidence routes to a neutral "needs parent look" outcome.
- `computeStreak(submissions, verdicts) -> StreakState` — pure function over the event stream; the gamification seam.
- `submissionService` — orchestrates child upload -> storage -> EXIF capture -> record.

**AI contract:** `judgeImage` returns strict JSON with fields: `matches_reference` (bool), `verdict` (`pass`/`fail`), `confidence` (number), `deviations[]` (each with `item`, `issue`, `severity`), `uncertain` (bool), `notes` (string). The system (not the model) sets `verdicts.status`. Fail threshold: high-severity deviations only; medium/low pass but are recorded. The model used is recorded per verdict (`verdicts.model`) for titration auditing.

Example output:

```json
{
  "matches_reference": false,
  "verdict": "fail",
  "confidence": 0.88,
  "deviations": [
    { "item": "floor", "issue": "clothing on floor not in reference", "severity": "high" },
    { "item": "desk", "issue": "minor clutter", "severity": "low" }
  ],
  "uncertain": false,
  "notes": "Bed matches reference; floor is the main difference."
}
```

## Testing Decisions

Good tests verify external behavior (inputs -> outputs), not internal implementation, so they survive refactoring.

- `evaluateVerdict` — unit tests across sample model outputs covering pass, fail-on-high, and uncertain paths.
- `computeStreak` — unit tests over crafted submission/verdict event sequences (consecutive passes, breaks, gaps).
- `referenceService` — behavioral test of the `is_current` invariant (setting a new reference demotes the prior; exactly one current per chore).
- `judgeImage` — contract/parsing tests only (rejects malformed JSON, enforces schema). The model's actual visual judgment is non-deterministic and belongs in eval-style testing, not unit tests.
- `submissionService` — light integration test of the orchestration path rather than unit tests.

## Out of Scope

Multiple chore types; multiple children or families beyond the single-family MVP; full gamification (badges, points, rewards); anti-gaming defenses (though EXIF is captured); notifications; dispute/review resolution (though a verdict `status` seam exists); rubric-based judgment without a reference (though the `chores.type`/`criteria` seam exists); native mobile app (v2).

Verifiable parental consent and vendor data-retention/training terms must be validated before onboarding real minors — flagged, not built, in v1.

## Further Notes

The architecture is deliberately built so the deferred features slot in without rework: rich event storage feeds future gamification, `family_id` on every row is now a real per-family foreign key behind dormant RLS policies (multi-tenancy ready the moment auth flips the runtime to an authenticated client), the `judgeImage` abstraction enables model titration, and status/criteria/exif seams support disputes, rubrics, and anti-gaming respectively.

Two compliance items are pre-conditions for a real launch, not the MVP: COPPA-grade parental consent (the parent-provisioned account flow is a structural head start) and confirmation of the chosen vision vendor's data-handling terms for children's images.
