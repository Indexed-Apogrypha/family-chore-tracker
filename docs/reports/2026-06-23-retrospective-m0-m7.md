# v1 Retrospective — Family Chore Tracker (M0→M7 + hardening)

**Date:** 2026-06-23 · **Operator:** Matthew Harper · **Driver:** Claude Code
**Window:** 2026-06-20 (empty-repo reset, `860b552`) → 2026-06-23 (v1 feature-complete)
**Verified against:** `npm run test` (203 passing), `git`/`gh` history, the design spec, and a
four-agent deep architecture review run for this report.

---

## 1. Context

The project has reached its last planned milestone. **v1 is feature-complete (M0–M7)**, the
staging→gated-production pipeline is live, and the core loop — *signup → family → chore → photo →
AI verdict → parent approval → points* — works end-to-end on real infrastructure (proven in the
[demo report](2026-06-23-multi-platform-demo-report.md)).

This is a deliberate reflective checkpoint **before moving forward**: what we built, what worked,
what hurt, and what to carry into the next phase. It is grounded in a fresh deep read of the code
(not memory) and reconciled against the seven tech-debt issues filed earlier today
([#134](https://github.com/Indexed-Apogrypha/family-chore-tracker/issues/134)–[#140](https://github.com/Indexed-Apogrypha/family-chore-tracker/issues/140)).

---

## 2. Executive summary

In roughly **three days** the project went from a deliberately-emptied repository to a
production-deployed v1, delivered as **eight milestones** (M0–M7) plus a post-M7 infrastructure
hardening phase. The throughline is **architectural discipline**: a ports & adapters core with a
CI-enforced dependency rule and per-seam contract tests, which let the app swap from keyless/in-memory
to real Supabase + vision adapters one seam at a time without ever breaking the suite. The design
spec is realized in code with **100% fidelity** — every architectural promise was built, and the
code cites the spec's §-sections inline.

The deep review confirms the codebase is **mature and honest about its own gaps**: all seven filed
tech-debt issues were independently validated with precise evidence, and no *untracked major* gap was
found. The real weaknesses are concentrated at the **real-mode boundary** (where the in-memory test
adapters can't expose them) and the **HTTP/UI edge** (which has essentially no tests) — both already
captured in the backlog, plus a handful of new findings noted in §7.

**One-line verdict:** a small, exceptionally well-architected v1 whose discipline is its main asset;
the next phase is about making the real-mode path as trustworthy as the keyless one.

---

## 3. What we built — the milestone arc

Each milestone added one feature or connected one seam. Verified PR/issue mapping:

| Milestone | Dates | PRs | Issues | Seam connected | Delivered |
|---|---|---|---|---|---|
| **M0** Scaffold & seams | 06-21→22 | [#83](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/83)–[#91](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/91), [#93](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/93) | #42–48 | clock (system+fixed); fake judge; in-memory repos & storage | Next 16 + TS + Vitest; `Result`/`AppError`; 4 ports; in-memory adapters; composition root; **dependency-rule guard**; contract harness; security policy; `CLAUDE.md` |
| **M1** Accounts & profiles | 06-22 | [#94](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/94)–[#101](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/101) | #49–54 | **repositories → Supabase** (Auth + members) | `createFamily`/`addKid`/`listMembers`/`verifyKidPin`; active-profile; auth screens + profile switcher; **real Supabase Auth** |
| **M2** Chores | 06-22→23 | [#104](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/104)–[#110](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/110) | #55–60 | _(in-memory persistence)_ | recurrence (none/daily/weekly); `createTemplate`/`createOneOff`; **lazy idempotent** `getTodayBoard`; kid board + parent template UI |
| **M3** Submission & photos | 06-23 | [#111](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/111) | #61–64 | **photo-storage → Supabase Storage** | `submitPhoto` orchestration (ordering contract §7.2); mobile capture; storage contract test |
| **M4** AI judge | 06-23 | [#114](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/114) | #65–68 | **judge → Anthropic + Gemini** | real vision adapters (Anthropic precedence); verdict persistence; judge contract suite |
| **M5** Review & points | 06-23 | [#116](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/116) | #69–73 | _(in-memory persistence)_ | `getReviewQueue`/`decide`/`pointsTotal`; **append-only idempotent ledger**; review + points UI |
| **M6** Data → cloud | 06-23 | [#118](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/118) | #74–78 | **repositories → Supabase** (chores/submissions/points) | Supabase adapters; per-family RLS; **contract-suite swap**; composition default flip |
| **M7** Polish & deploy | 06-23 | [#120](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/120) | #79, #80, #82 | _(deploy)_ | responsive/PWA; `AppError`→UI mapping; docs; prod deploy gate |

> **M7 footnote:** issue #81 ("wire Vercel deploy secrets + first gated prod deploy") was **not**
> closed by #120 — it was superseded by the post-M7 pipeline rebuild ([#127](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/127)).

**Post-M7 infrastructure phase (06-23):** Vercel Web Analytics ([#121](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/121)); dependency
bumps (#122–123); the deploy-pipeline rebuild ([#127](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/127)–[#130](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/130)); consolidated M3–M7 review
follow-ups ([#131](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/131), closing #102/#103/#112/#113/#115/#117/#119); local `.env` namespacing ([#132](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/132)); the
demo processing report ([#133](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/133)).

**Process shift mid-build.** M0–M1 ran one-PR-per-issue (TDD red→green, squash-merge). From M2 on,
the user set a **milestone workflow protocol**: per-issue commit + GH-issue update; per-milestone a
single PR → `/code-review` → report findings → fix serious issues → Obsidian note → squash-merge,
with a **hard gate** that a milestone's review fixes land on `main` before the next milestone starts.
This is why M3–M7 are each one PR closing several issues.

---

## 4. The architecture that carried it

The spec's ports & adapters design is realized faithfully, and it is the reason the seam-by-seam
delivery was low-risk.

- **Four seams, two sides each.** `judge` · `repositories` · `photo-storage` · `clock`
  (`src/ports/*`). Each is one interface with a fake/in-memory side (the executable spec) and a real
  side wired in only when its milestone arrived.
- **The composition root is the only switch.** Only `src/composition/` reads `process.env` or imports
  an adapter; use-cases are pure `(ports, ctx, input) => Promise<Result<T>>`. A **51-line guard test**
  (`test/architecture/dependency-rule.test.ts`) fails CI if anything outside `composition/` violates
  this — an architectural ratchet that prevents silent erosion.
- **Contract tests are the load-bearing safety valve.** `runChoreRepositoryContract` /
  `runSubmissionRepositoryContract` / `runPointsLedgerContract` (and the judge/storage suites) are
  written **once** and run against *both* backends — in-memory in CI, Supabase on demand. This is what
  made M1/M3/M6 "swap the adapter" changes provably safe rather than leaps of faith.
- **The session edge is ergonomic.** `makeApp(ports).as(ctx)` (`src/app-session/app.ts`) binds the
  family + actor once; callers read naturally and always get a `Result<T>`.
- **Type design does real work.** Branded phantom IDs (`src/domain/shared/ids.ts`) make transposing a
  `MemberId` for an `InstanceId` a compile error — the backbone of family-scoping safety. The closed
  `AppError` union (`src/domain/shared/errors.ts`) makes the UI and HTTP layers fan out *exhaustively*:
  add a tenth error and every `switch` fails to compile until handled.

The deep review rated branded IDs, the `Result`/`AppError` union, and the `Ports`/`Actor` shapes as
genuinely strong (8–9/10 across encapsulation, expression, usefulness, enforcement).

---

## 5. What worked

1. **The reset-to-clean-foundation bet.** Wiping a feature-complete-but-never-stable pre-reset app
   and rebuilding on ports & adapters traded sunk history for a *provably correct* foundation. It paid
   off: zero dependency-rule violations, and every seam swap landed green.
2. **Contract-test-gated seam swaps.** The single highest-leverage decision. "Proven equivalent by
   contract tests" was not a slogan — it is the mechanism that de-risked M1/M3/M6.
3. **Keyless-by-default.** The fake judge + in-memory stores + fixed clock give a fast (~1s),
   deterministic, network-free, zero-cost test suite that gates every merge — essential given the
   unfunded API posture.
4. **Quality gates at milestone boundaries.** The milestone workflow protocol forced a code-review +
   fix + documentation pass at every boundary, with fixes landed before moving on. The follow-up
   issues it generated (#102/#103/#112–119) were all resolved in [#131](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/131) before infra work began.
5. **Gated, never-automatic deploys.** The `production` GitHub environment's required-reviewers rule
   means merges *queue* a deploy that waits for manual approval — merging stays safe.
6. **Spec as living source of truth.** The design spec is cited by §-number throughout the code, and
   the spec-vs-delivered audit (§10) found **no divergence**.
7. **Governance from day one.** Branch ruleset (`protect-main`, 6 required checks), gitleaks
   secret-scan, `SECURITY.md` (PVR-only), advisory CodeQL, and Dependabot — all live since M0.
8. **Disciplined, behavior-focused tests.** 203 tests emphasize *contracts and negative/authz cases*
   (every capability-gated use-case tests its `forbidden` and cross-family `not_found` paths), not
   implementation detail.

---

## 6. What hurt (root cause → resolution)

| # | What hurt | Root cause | Resolution / status |
|---|---|---|---|
| a | **History break + the PR #38 mis-land** | After the reset, [#38](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/38) re-landed the *abandoned* pre-reset app onto fresh `main` and deployed it | **Fully reverted** (force-dropped to `2cf774e`, deploy torn down). Old code survives only on `ABANDONED/*`. **Lesson:** the leftover worktree was abandoned code, never a base to build on |
| b | **Prod 500s (twice)** | Sensitive `NEXT_PUBLIC_*` vars built **empty** in CI — Vercel hides Sensitive vars from `vercel pull`, so the client bundle inlined empty Supabase config → site-wide 500 | The **staging→gated-prod-REBUILD** pipeline ([#127](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/127)): prod rebuilds the validated commit with prod env (non-sensitive `NEXT_PUBLIC_*`). Both envs verified 200 |
| c | **Deploy pipeline hangs / wrong-team promote** | `vercel` CLI is async-by-default; `promote`/`inspect` don't inherit `VERCEL_ORG_ID` | `--no-wait` + bounded `inspect --wait`; explicit `--scope`; runtime smoke checks ([#128](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/128)–[#130](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/130)) |
| d | **`claude-review` burned API credits** | The 7th CI gate called the Anthropic API on every PR; account is unfunded | Hard-disabled ([#40](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/40)); kept as a wired-but-off check. **Lesson:** money-spending gates need explicit budget |
| e | **Gated Supabase tests left orphan rows** | No coordinated teardown in the live-DB suite | Centralized reset harness (`test/contract/supabase-reset.ts`); fixed in [#131](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/131) (#103) |
| f | **A deploy watcher went silently blind** | Piped `gh` output to an **external `jq`** that doesn't exist in this Git-Bash env (exit 127); stderr was swallowed | Use `gh --jq`/built-in filtering, never `… \| jq`. Recorded as a standing gotcha |
| g | **`gh project create` broken** | CLI limitation in this account setup | Use raw GraphQL for board ops (and `gh project item-add`, which works) |
| h | **`secret-scan` false positives** | Early scans flagged placeholder/doc strings | Fix the content, don't allowlist; `.env` gitignored, history scanned clean before going public |

---

## 7. Code health today

The four-agent deep review (general code review · type design · silent-failure hunt · test coverage)
**independently confirmed all seven filed issues** with precise file:line evidence and accurate
scoping. Summary of the tracked backlog, with the tech-debt audit's priority scores:

| # | Issue | Category | Priority |
|---|---|---|:--:|
| [#134](https://github.com/Indexed-Apogrypha/family-chore-tracker/issues/134) | Map infra faults to `AppError` in every use-case (only `submission.ts` does today) | Architecture | **21** |
| [#135](https://github.com/Indexed-Apogrypha/family-chore-tracker/issues/135) | Run the Supabase contract suites in CI (currently excluded) | Test | **21** |
| [#136](https://github.com/Indexed-Apogrypha/family-chore-tracker/issues/136) | Make the parent decision (`decide`) atomic on the real adapter | Architecture | **18** |
| [#137](https://github.com/Indexed-Apogrypha/family-chore-tracker/issues/137) | Validate JSON columns read back from Supabase (`ai_verdict`, `recurrence`) | Code | **16** |
| [#138](https://github.com/Indexed-Apogrypha/family-chore-tracker/issues/138) | Apply migrations / check schema drift in the deploy pipeline | Infra | **15** |
| [#139](https://github.com/Indexed-Apogrypha/family-chore-tracker/issues/139) | Test the HTTP edge (API routes) + client components | Test | **12** |
| [#140](https://github.com/Indexed-Apogrypha/family-chore-tracker/issues/140) | Extract the duplicated validate-and-resolve-member block in `chores.ts` | Code | **10** |

**The structural insight the review sharpened:** the in-memory adapters *never throw* (pure `Map`
operations), so the entire infra-fault path is invisible to keyless CI. That single fact is why
#134/#136/#137 stay green today — and why **#135 is the keystone**: wiring the existing Supabase
contract suites into CI is what makes the other three *testable at all*.

### New findings (not in #134–140)

The review surfaced a few items worth recording. None are emergencies; the first two are the ones
worth filing.

- **N1 — Silent empty/zero render states (HIGH).** Server components do `result.ok ? value : []` /
  `?? 0` (`src/app/{review,board,templates}/page.tsx`, `src/app/page.tsx`), discarding the error.
  Today these never even produce an error (the adapter throws first → 500). **But fixing #134 in
  isolation converts those 500s into a *confident wrong empty state*** — "nothing to review 🎉" during
  a DB outage. **#134 and N1 are one change:** map the fault to a value *and* render that value
  (`src/app/error-copy.ts` already has the copy; no server component consults it). Recommend filing as
  a sibling to #134.
- **N2 — #134 extends to the identity/auth edge.** The unguarded-throw gap also lives in
  `src/composition/request.ts` and `src/composition/session.ts` (every authenticated request derives
  context first) and in `src/app/api/auth/signup/route.ts`, which calls ports **directly** — a DB
  fault mid-signup throws *after* the Supabase Auth user was created (orphaned auth user). Worth
  folding into #134's scope.
- **N3 — Inconsistent body parsing (folds under #139).** Seven route handlers `await request.json()`
  with no `.catch` → 500 on a malformed body; two routes (`review/decide`, `submissions/retry`)
  already guard with `.catch(() => ({}))`. The first thing the #139 route-handler tests should assert.
- **N4 — State-machine transitions are unencoded (type design).** `invalid_transition` is checked by
  scattered inline `if`s (`submission.ts`, `review.ts`); there is no `domain/submission/transitions.ts`
  table the way `recurrence.ts` centralizes recurrence rules. A clean future refactor.
- **N5 (low)** — the `content-length` pre-check in `submissions/route.ts` is bypassable (client can
  omit the header); the real guard is the post-buffer size check. **N6 (low)** — the
  `upsertGeneratedInstance` 23505-fallback `SELECT` omits `.eq("family_id", …)` (structurally against
  the family-scoping invariant, though unreachable with UUID keys). **N7** — extend #137 to the
  `as SubmissionStatus`/`as InstanceStatus` read casts (same class of unchecked cast).

### Confirmed-clean (do **not** "fix" these)

The review explicitly flagged correct-by-design patterns so future work doesn't regress them: the
`runJudge` broad catch (maps any judge/parse fault to a retryable `judge_unavailable`); the
`getReviewQueue` display-only `?? "Chore"`/`?? 0` fallbacks (the authoritative credit re-reads the
instance in `decide`); `parseVerdict`'s fail-loud coercion; the points-ledger `submission_id`
idempotency; and the cookie-tamper-safe context fallback in `session.ts`.

---

## 8. Lessons to carry forward

**Principles proven here, worth keeping as the project grows:**

1. **Contract tests before every seam swap** — the de-risking mechanism; don't add a seam without one.
2. **Composition-root-only env/adapters, enforced by the guard test** — keep the ratchet; it's cheap
   and prevents silent architectural decay.
3. **Quality + documentation gates at milestone boundaries** — the milestone protocol caught real
   bugs and kept docs current; keep landing review fixes before the next chunk.
4. **Gated deploys + rebuild-don't-byte-promote** — the prod-500 root cause was environmental, not
   logical; the pipeline now defends against it.
5. **Verify before asserting, especially in ops** — the silent-`jq` and the Sensitive-var traps both
   came from invisible failures; prefer built-in filtering and runtime smoke checks.

**The bridge — immediate next work.** The deep review's strongest conclusion is that the backlog is
*correctly prioritized but coupled*. Suggested sequence (from the tech-debt audit's phased plan,
adjusted for the new findings):

- **Phase 1 — real-mode correctness (code-only):** **#134 + N1 together** (map faults to values *and*
  render them) + #137 (validate DB reads) + #140 (extract the helper). Include N2/N3 in scope.
- **Phase 2 — atomicity:** #136 (transactional `decide`, mirroring `recordVerdictAndAdvance`).
- **Phase 3 — CI confidence (shared setup):** **#135 (keystone)** + #138 — both need an ephemeral
  Supabase in CI; build that runner once. This is what makes Phases 1–2 *stay* fixed.
- **Phase 4 — edge coverage:** #139, incrementally, starting with the API route handlers (no DOM,
  highest risk).

---

## 9. Metrics & artifacts

| Metric | Value |
|---|---|
| Window (reset → v1) | 2026-06-20 → 2026-06-23 (~3 days) |
| Commits on `main` (since `860b552`) | **55** |
| Merged PRs (post-reset, #27→#133) | ~50 of 77 total in history |
| Issues (open + closed) | **58** |
| Milestones delivered | **M0–M7** + post-M7 infra |
| Seams (each ≥2 adapters) | **4** (judge · repositories · photo-storage · clock) |
| Tests (keyless CI, `npm run test`) | **203 passing / 31 files** (~1s) |
| Contract suites (run in-memory *and* against Supabase) | chore · submission · points · member · judge · photo-storage |
| Dependency-rule violations | **0** (CI-enforced) |
| Open tech-debt issues | **7** (#134–140), all on Project board #4 |

**Artifacts:** the design spec
(`docs/superpowers/specs/2026-06-21-family-chore-tracker-design.md`), `README.md`, `CLAUDE.md`,
`SECURITY.md`, the env-namespacing & SDLC-enforcement designs, the GC runbook
(`docs/ops/chore-photos-gc.md`), and the [demo report](2026-06-23-multi-platform-demo-report.md).

---

## 10. Appendix

### Spec intent vs delivered reality

The docs/infra audit found **100% architectural fidelity** — no spec promise diverges from shipped
code. Spot-checked spec sections, all realized:

| Spec promise | § | Delivered |
|---|---|---|
| Ports & adapters + session edge | §4 | ✅ `src/ports/*`, `src/app-session/app.ts` |
| Four swappable seams | §5 | ✅ all with ≥2 adapters |
| Keyless ≡ real (contract-proven) | §4, §10 | ✅ shared contract suites |
| State machine (`todo→evaluating→pending_review→approved`) | §7.1 | ✅ domain + use-cases |
| `submitPhoto` ordering contract | §7.2 | ✅ enforced + tested |
| Lazy idempotent instance generation | §7.3 | ✅ `getTodayBoard` |
| Append-only idempotent points ledger | §6 | ✅ unique on `submission_id` |
| Per-family RLS tenancy | §9 | ✅ migrations 0004/0006; in-memory mirrors it |
| `Result` + closed `AppError` | §8.2 | ✅ (enforcement uneven — see #134) |
| Dependency rule | §4.1 | ✅ CI-enforced |
| PIN as app-level gate (not auth boundary) | §3.1 | ✅ acknowledged trade-off |

### Documentation-currency follow-ups (logged, not applied here)

Two small stale spots the audit found — worth a quick doc PR:

- **`CLAUDE.md` Status line is stale** — still reads *"M0 complete; M1 in-progress"*; should read
  **v1 feature-complete (M0–M7)**.
- **`.env.example` header** — predates the #132 namespacing; add one line noting that the resolver
  generates `.env.local` from the selected `SUPABASE_TARGET` block, and that `.env.local` is not
  hand-edited.

---

*Prepared as a v1 retrospective checkpoint. Findings reconciled against issues #134–140; new findings
(N1–N7) recorded above for triage, not yet filed.*
