# Contributing

This repository enforces its software development lifecycle through GitHub's own
architecture. The rules below aren't etiquette — they are mechanically enforced
by branch rulesets, required status checks, and a protected deploy environment.
You (and any future collaborator) physically cannot merge to `main` without
passing every gate.

## The lifecycle

```
issue  →  feature branch  →  pull request  →  [ gates ]  →  squash-merge to main  →  gated deploy
                                                  │
              lint · typecheck · test · build · secret-scan · pr-title · claude-review
```

Direct pushes to `main` are blocked for everyone, including the repository owner.
The only way a change reaches `main` is a pull request with every required check green.

## 1. Start from an issue (recommended)

Open a Bug report or Feature request issue. It frames the work and gives the PR
something to close. Not strictly required, but it keeps history legible.

Application work is framed by the
[architecture &amp; design spec](../docs/superpowers/specs/2026-06-21-family-chore-tracker-design.md)
and its M0–M7 milestones — feature issues should trace back to it.

## 2. Branch

Cut a short-lived branch off `main`. The branch name **must** start with one of:

```
feat/   fix/   chore/   docs/   refactor/   test/   ci/   perf/   build/   revert/
```

Example: `feat/photo-downscaling`. The `branch-name` check enforces this on the PR.

## 3. Commit & push

Commit normally. Individual commit messages are not policed — we **squash-merge**,
so the **PR title** is what lands on `main`. Keep changes focused.

## 4. Open a pull request

The PR **title must follow [Conventional Commits](https://www.conventionalcommits.org/)**:

```
type(optional-scope): imperative summary
```

e.g. `feat(judge): add Gemini fallback when Anthropic is unset`. The `pr-title`
check enforces this, because the title becomes the squash commit message and
drives the project's clean, conventional history on `main`.

Fill in the PR template (what/why, verification, checklist).

## 5. Pass the gates

The PR cannot merge until all required checks succeed:

| Check          | What it guards |
| -------------- | -------------- |
| `lint`         | Lint passes (no-ops until a `lint` script exists) |
| `typecheck`    | `tsc` type checks |
| `test`         | Vitest suite |
| `build`        | `next build` succeeds |
| `secret-scan`  | gitleaks finds no committed secrets |
| `pr-title`     | PR title is a valid Conventional Commit |
| `claude-review`| Automated Claude review signs off on the diff |

Two checks run but are **advisory, not required**, so they never block a merge:
`branch-name` (nudges the branch-prefix convention) and `CodeQL` (static
analysis / code scanning — results appear under the repo's Security tab). CodeQL
can be promoted to a required check once the app has real code.

CI jobs **no-op-pass** while the application code does not yet exist, so the
pipeline is green from day one and the real checks switch on automatically as
the app lands.

Other ruleset rules: the branch must be **up to date** with `main` before merge,
history must stay **linear**, and **force-pushes and deletion of `main` are
blocked**.

## 6. Merge

Use **Squash and merge** (the only merge type enabled). The head branch is
deleted automatically.

## 7. Deploy

Merging to `main` triggers the deploy workflow, gated behind the protected
`production` environment. Until Vercel credentials are configured, the deploy
step skips cleanly rather than failing.

## Break-glass

There are no bypass actors on the ruleset — the rules apply to the owner too.
The owner can, in a genuine emergency, edit or disable the ruleset in repo
settings (Settings → Rules), make the change, and re-enable it. That edit is
itself logged. Prefer fixing the gate over bypassing it.
