<!--
  This PR will not merge until every required gate is green:
  lint · typecheck · test · build · secret-scan · pr-title · claude-review
  See CONTRIBUTING.md for the enforced workflow.
-->

## What & why

<!-- One or two sentences: what does this change and why. -->

Closes #<!-- issue number, or remove this line if there is no issue -->

## Type of change

<!-- Keep the one that applies; the PR title prefix must match (feat:, fix:, etc.). -->

- [ ] feat — new user-facing capability
- [ ] fix — bug fix
- [ ] chore / ci / build — tooling, deps, pipeline
- [ ] refactor — no behavior change
- [ ] docs — documentation only
- [ ] test — tests only

## How it was verified

<!-- Commands run, scenarios checked, screenshots. "CI is green" is not enough on its own. -->

## Checklist

- [ ] PR **title** follows Conventional Commits (`type(scope): summary`) — it becomes the squash commit message
- [ ] Branch name matches `type/short-description` (e.g. `feat/photo-upload`)
- [ ] Tests added or updated for the change (or N/A with a reason)
- [ ] No secrets, keys, or `.env` values committed
- [ ] Self-reviewed the diff before requesting the automated review
