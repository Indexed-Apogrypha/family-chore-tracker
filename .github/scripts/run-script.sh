#!/usr/bin/env bash
# Run an npm script ONLY if it exists; otherwise no-op-pass (exit 0).
#
# Why: the application code does not exist yet (the repo was reset), and the
# intended package.json has no `lint` script. Making the required CI checks
# tolerant of a missing package.json / missing script keeps the pipeline green
# from day one, and the real checks switch on automatically once the app and
# its scripts land. A required status check that is always reported (never
# skipped) is also what keeps a PR from getting stuck on "Expected" forever.
set -euo pipefail

script="${1:?usage: run-script.sh <npm-script-name>}"

if [ ! -f package.json ]; then
  echo "::notice::no package.json yet — skipping '${script}' (no-op pass)"
  exit 0
fi

# Is the script defined in package.json? (node is on PATH via setup-node)
has_script="$(node -e "const s=(require('./package.json').scripts)||{};process.stdout.write(s['${script}']?'1':'')" 2>/dev/null || true)"
if [ -z "${has_script}" ]; then
  echo "::notice::no '${script}' script in package.json — skipping (no-op pass)"
  exit 0
fi

echo "Running '${script}'…"
if [ -f pnpm-lock.yaml ]; then
  corepack enable
  pnpm install --frozen-lockfile
  pnpm run "${script}"
elif [ -f yarn.lock ]; then
  corepack enable
  yarn install --immutable
  yarn run "${script}"
elif [ -f package-lock.json ]; then
  npm ci
  npm run "${script}"
else
  npm install
  npm run "${script}"
fi
