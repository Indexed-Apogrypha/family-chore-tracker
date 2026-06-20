# GitHub SDLC enforcement — design

- **Date:** 2026-06-20
- **Repo:** `Indexed-Apogrypha/family-chore-tracker` (private, personal account)
- **Status:** Approved, implementing

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
- **Environment protection rules aren't enforced on a free personal private repo.**
  So the deploy gate's authoritative enforcement is the workflow condition
  `if: github.ref == 'refs/heads/main'`; the `production` environment is layered on
  and becomes a real reviewer gate only on GitHub Pro/Team/Enterprise.

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
  require conversation resolution; no code-owner / last-push approval (solo-safe).
- `required_status_checks` (strict / up-to-date), pinned to GitHub Actions:
  `lint`, `typecheck`, `test`, `build`, `secret-scan`, `pr-title`, `claude-review`.

**Deliberately omitted:** `required_signatures` (would force commit signing for the
owner and all bots → lockout until signing is configured), `update`, `creation`.

## Repo settings (via `apply-governance.sh`)

Squash-only (`allow_merge_commit:false`, `allow_rebase_merge:false`),
`delete_branch_on_merge:true`, `allow_auto_merge:true`,
`squash_merge_commit_title:PR_TITLE` + `squash_merge_commit_message:PR_BODY`.

## Rollout (dogfooded; sequenced to avoid self-lockout)

1. Land all files on branch `ci/github-sdlc`; open a PR to `main`.
2. Apply repo settings + `production` environment.
3. Apply the ruleset **without** `claude-review` required; confirm the 6 CI checks
   gate the PR and go green.
4. Merge the bootstrapping PR through the gate (squash). `main` now has the workflows.
5. Set `ANTHROPIC_API_KEY` (or `CLAUDE_CODE_OAUTH_TOKEN`); confirm `claude-review`
   goes green once.
6. Add `claude-review` to the required checks → architecture fully sealed.

`claude-review` is wired last on purpose: requiring a check that can't yet pass
(no secret) would block every merge, including the fix.

## Break-glass

No bypass actors — rules apply to the owner. In a genuine emergency the owner can
set the ruleset `enforcement: disabled` (or delete it) via API/UI, make the change,
and re-enable. That administrative action is itself logged. Prefer fixing the gate.

## Follow-ups (out of scope now)

- Wire `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` (env-scoped) when the
  app exists; disable Vercel native Git auto-deploy so the GitHub gate stays authoritative.
- Consider SHA-pinning the security-relevant actions (Dependabot keeps them fresh).
- Consider `required_signatures` once commit signing is configured locally + for bots.
- Add a real `lint` script (e.g. ESLint) — the `lint` gate no-ops until then.
