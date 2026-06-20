# GitHub SDLC enforcement — design

- **Date:** 2026-06-20
- **Repo:** `Indexed-Apogrypha/family-chore-tracker` (**public**, personal account — see "Went public" below)
- **Status:** Implemented — 6 of 7 gates live and enforced; `claude-review` pending the Claude GitHub App install

## Goal

Make the software development lifecycle **enforced by GitHub's architecture**, not
by convention. Every lifecycle stage maps to a native GitHub primitive so that
skipping it is *physically impossible* — including for the repository owner.

```
issue → feature branch → pull request → [ gates ] → squash-merge to main → gated deploy
              (no direct pushes to main — ever, for anyone)
                                  │
   lint · typecheck · test · build · secret-scan · pr-title · claude-review
```

## Decisions (settled with the owner)

1. **Review gate:** solo developer + an **automated reviewer** (Claude). Review is
   made structural via a **required status check** named `claude-review`, not via
   required human approvals.
2. **Branch & deploy model:** **trunk-based** — short-lived feature branches → PR →
   protected `main`; merging to `main` triggers a gated deploy.

## Hard constraints discovered (these shaped the design)

These were verified against current GitHub / action docs before implementation.

- **Self-approval is forbidden by GitHub.** On a solo repo, a naive "require 1
  approval" rule would block *all* merges. Therefore the ruleset uses
  `required_approving_review_count: 0` (a PR is still mandatory — direct pushes are
  blocked — but no human approval is required), with `require_last_push_approval:
  false` and `require_code_owner_review: false`. Either of those set true would
  demand a second human and re-introduce the lockout.
- **The Claude review action is fail-OPEN by default.** `anthropics/claude-code-action`
  posts comments but exits 0 even on critical findings. Gating merge on the
  action's own exit code would be a *fake gate*. We make it **fail-CLOSED**: Claude
  emits a structured `{approved, blocking_issues}` verdict and an explicit step
  exits non-zero on a blocking verdict — or on any missing/failed verdict.
- **A required check that never reports blocks the PR forever** ("Expected"). So
  every required CI job must always run and conclude (no job-level skips on
  required jobs), and the check names must exactly match the ruleset contexts.
- **Status checks can be spoofed if unpinned.** Each required check pins
  `integration_id: 15368` (the GitHub Actions app) so only Actions can satisfy it.
- **Private repos on a free personal plan don't get GitHub Advanced Security.** No
  native secret scanning / CodeQL. We use **gitleaks** (free for personal accounts,
  run via its official image) and **Dependabot** (free on all repos) instead.
- **Branch rulesets, branch protection, and environment protection rules require a
  PUBLIC repo or a paid plan (Pro/Team/Enterprise).** On a free *private* personal
  repo, `POST /repos/.../rulesets` returns 403 ("Upgrade to GitHub Pro or make this
  repository public"). This is the load-bearing constraint — the entire enforcement
  layer was unbuildable on the repo's original free-private status. Resolved by
  making the repo public (see "Went public" below), which unlocks rulesets and the
  protected `production` environment at no cost. The deploy gate's authoritative
  enforcement remains the workflow condition `if: github.ref == 'refs/heads/main'`.
- **The Claude review action needs the Claude GitHub App installed**, even when the
  model authenticates via `ANTHROPIC_API_KEY`. The action's GitHub-side operations
  authenticate through an OIDC token exchanged for a Claude App installation token,
  so the workflow needs `id-token: write` AND the app installed on the repo. (An
  earlier research pass wrongly concluded no app was needed; live testing corrected
  it.)

## Components (file inventory)

| File | Role |
| ---- | ---- |
| `.github/rulesets/protect-main.json` | Branch ruleset (source of truth for protection) |
| `.github/setup/apply-governance.sh` | Idempotent governance-as-code applier (settings + env + ruleset) |
| `.github/workflows/ci.yml` | CI gates: lint, typecheck, test, build, secret-scan, pr-title, branch-name |
| `.github/scripts/run-script.sh` | No-op-pass runner (green until the app/scripts exist) |
| `.github/workflows/claude-review.yml` | Fail-closed automated review gate (`claude-review` check) |
| `.github/workflows/deploy.yml` | Deploy-on-merge to Vercel, gated + self-skipping |
| `.github/dependabot.yml` | Weekly npm (grouped) + github-actions updates |
| `.github/pull_request_template.md` | Linked-issue + type + verification + checklist |
| `.github/ISSUE_TEMPLATE/*` | Bug / feature issue forms; blank issues disabled |
| `.github/CODEOWNERS` | Ownership (informational; not a required gate) |
| `.gitattributes` | Force LF so shell scripts don't break on Linux runners |
| `.github/CONTRIBUTING.md` | The enforced workflow + break-glass procedure |

## The ruleset (`protect-main`)

Targets `~DEFAULT_BRANCH`, `enforcement: active`, `bypass_actors: []` (applies to
the owner too). Rules:

- `deletion` + `non_fast_forward` — `main` can't be deleted or force-pushed.
- `required_linear_history` + `allowed_merge_methods: ["squash"]` — clean, linear,
  squash-only history; the PR title becomes the commit message.
- `pull_request` — PR mandatory; 0 approvals; dismiss stale reviews on push;
  no code-owner / last-push approval (solo-safe).
- `required_status_checks` (strict / up-to-date), pinned to GitHub Actions:
  `lint`, `typecheck`, `test`, `build`, `secret-scan`, `pr-title`, `claude-review`.

**Deliberately omitted:** `required_signatures` (would force commit signing for the
owner and all bots → lockout until signing is configured), `update`, `creation`.

## Repo settings (via `apply-governance.sh`)

Squash-only (`allow_merge_commit:false`, `allow_rebase_merge:false`),
`delete_branch_on_merge:true`, `allow_auto_merge:true`,
`squash_merge_commit_title:PR_TITLE` + `squash_merge_commit_message:PR_BODY`.

## Went public (2026-06-20)

Branch rulesets are unavailable on free private repos, so enforcement required
either GitHub Pro or making the repo public. The repo was **made public**. Before
flipping, the full history — 68 commits across every branch, including `ABANDONED/*`
— was scanned for committed secrets (key formats, JWTs, connection strings,
suspicious filenames) and came back **clean**; the live Anthropic/Gemini/Supabase
keys live only in the gitignored `.env` and were never committed. The `ABANDONED/*`
branches (old app code, no secrets) are public too and were left in place.

## Rollout (dogfooded; sequenced to avoid self-lockout)

1. Land all files on branch `ci/github-sdlc`; open a PR to `main`.
2. Apply repo settings + `production` environment.
3. Apply the ruleset **without** `claude-review` required; confirm the 6 CI checks
   gate the PR and go green.
4. Merge the bootstrapping PR through the gate (squash). `main` now has the workflows.
5. Wire `claude-review`: set `ANTHROPIC_API_KEY` (or `CLAUDE_CODE_OAUTH_TOKEN`) AND
   install the Claude GitHub App on the repo. The action authenticates its GitHub
   operations through OIDC + the app even when the model uses an API key, so the
   workflow sets `id-token: write` and the app install is required. Confirm
   `claude-review` goes green once.
6. Add `claude-review` to the required checks → architecture fully sealed.

`claude-review` is wired last on purpose: requiring a check that can't yet pass
(no secret) would block every merge, including the fix.

**Status (2026-06-20):** steps 1–4 done — the 6-check ruleset is active and a
direct push to `main` is rejected (`GH013: Changes must be made through a pull
request`); the bootstrap PR (#28) was merged through the gate. Steps 5–6 pending
the Claude GitHub App install, after which `claude-review` becomes the 7th
required check via `.github/setup/apply-governance.sh`.

## Break-glass

No bypass actors — rules apply to the owner. In a genuine emergency the owner can
set the ruleset `enforcement: disabled` (or delete it) via API/UI, make the change,
and re-enable. That administrative action is itself logged. Prefer fixing the gate.

## Follow-ups (out of scope now)

- Wire `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` (env-scoped) when the
  app exists; disable Vercel native Git auto-deploy so the GitHub gate stays authoritative.
- SHA-pinned the gate actions (`claude-code-action`, `gitleaks`); consider pinning
  the remaining first-party actions too (Dependabot keeps them fresh).
- Consider `required_signatures` once commit signing is configured locally + for bots.
- Add a real `lint` script (e.g. ESLint) — the `lint` gate no-ops until then.
