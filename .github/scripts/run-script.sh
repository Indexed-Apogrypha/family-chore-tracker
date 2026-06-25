#!/usr/bin/env bash
# Run a required npm script, FAIL-CLOSED if it is missing.
#
# History: when the repo was reset this shim no-op-passed a missing
# package.json / script so the required checks stayed green before the app
# existed. The app now exists (package.json + lockfile are committed with real
# lint/typecheck/test/build scripts), so that tolerance has become a liability:
# a PR that deletes package.json or renames one of these scripts would make the
# required check report GREEN while running nothing — silently disabling the
# gate. We therefore fail closed: a missing package.json or a missing script is
# an ERROR, not a pass.
set -euo pipefail

script="${1:?usage: run-script.sh <npm-script-name>}"

if [ ! -f package.json ]; then
  echo "::error::package.json not found — required check '${script}' cannot run (fail-closed)."
  exit 1
fi

# Is the script defined in package.json? (node is on PATH via setup-node)
has_script="$(node -e "const s=(require('./package.json').scripts)||{};process.stdout.write(s['${script}']?'1':'')" 2>/dev/null || true)"
if [ -z "${has_script}" ]; then
  echo "::error::no '${script}' script in package.json — a required CI check must not be silently disabled (fail-closed)."
  exit 1
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
