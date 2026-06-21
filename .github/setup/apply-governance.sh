#!/usr/bin/env bash
# Governance-as-code: apply the repository settings, the protected `production`
# environment, the `protect-main` branch ruleset, and the native security
# features (Dependabot alerts + security updates, private vulnerability
# reporting). Idempotent — safe to re-run; it UPDATES the existing ruleset
# rather than creating duplicates.
#
# Requires: gh CLI authenticated with admin on the repo.
# Usage:    bash .github/setup/apply-governance.sh [owner/repo]
#
# The committed ruleset (.github/rulesets/protect-main.json) is the source of
# truth for branch protection. NOTE: `claude-review` has been REMOVED from the
# required checks for now — it calls the Anthropic API (pay-as-you-go) and the
# ANTHROPIC_API_KEY account is unfunded, so it fail-closed and blocked every
# merge. The workflow is also disabled (`gh workflow disable claude-review.yml`).
# To re-enable: fund the API account, `gh workflow enable claude-review.yml`,
# re-add the `claude-review` check below, and re-run this script.
# See .github/CONTRIBUTING.md (break-glass) and docs/superpowers/specs for rationale.
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RULESET_FILE="$ROOT/.github/rulesets/protect-main.json"

echo "==> Repo: $REPO"

echo "==> Repo merge settings (squash-only, auto-delete branches, auto-merge)"
gh api --method PATCH "repos/$REPO" \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true \
  -F allow_auto_merge=true \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY >/dev/null
echo "    done."

echo "==> Protected 'production' environment (main-only; reviewer enforced on Pro+)"
OWNER_ID="$(gh api user --jq .id 2>/dev/null || true)"
if [ -z "${OWNER_ID:-}" ]; then
  echo "    could not resolve owner id — skipping environment setup (workflow 'if: main' gate still applies)"
else
  gh api --method PUT "repos/$REPO/environments/production" \
    -F wait_timer=0 \
    -f "reviewers[][type]=User" \
    -F "reviewers[][id]=$OWNER_ID" \
    -F "deployment_branch_policy[protected_branches]=false" \
    -F "deployment_branch_policy[custom_branch_policies]=true" >/dev/null 2>&1 \
    && gh api --method POST "repos/$REPO/environments/production/deployment-branch-policies" \
         -f name=main >/dev/null 2>&1 \
    && echo "    environment configured." \
    || echo "    (environment rules not enforced on this plan — relying on workflow 'if: main' gate)"
fi

echo "==> Branch ruleset 'protect-main' (create or update)"
RID="$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name=="protect-main") | .id' 2>/dev/null | head -n1)"
if [ -n "${RID:-}" ]; then
  echo "    updating existing ruleset id=$RID"
  gh api --method PUT "repos/$REPO/rulesets/$RID" --input "$RULESET_FILE" >/dev/null
else
  echo "    creating ruleset"
  gh api --method POST "repos/$REPO/rulesets" --input "$RULESET_FILE" >/dev/null
fi
echo "    done."

# Native security features. These are repo SETTINGS (not committable config like
# .github/dependabot.yml), so they can only be toggled via the API. All three are
# free on public repos. Each is a 204-on-success PUT; the fallbacks keep the
# script green if the plan/permissions don't allow a given toggle.
# SECURITY.md (the disclosure policy) is committed at .github/SECURITY.md;
# enabling private vulnerability reporting wires up its "Report a vulnerability" button.
echo "==> Security features (Dependabot alerts + security updates, private vulnerability reporting)"
gh api --method PUT "repos/$REPO/vulnerability-alerts" >/dev/null 2>&1 \
  && echo "    Dependabot alerts: on" || echo "    (could not enable Dependabot alerts)"
gh api --method PUT "repos/$REPO/automated-security-fixes" >/dev/null 2>&1 \
  && echo "    Dependabot security updates: on" || echo "    (could not enable security updates)"
gh api --method PUT "repos/$REPO/private-vulnerability-reporting" >/dev/null 2>&1 \
  && echo "    private vulnerability reporting: on" || echo "    (could not enable PVR)"

echo "==> Governance applied."
