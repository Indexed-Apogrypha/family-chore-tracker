# Deployment & operations

How the app ships, how to set it up, and how to recover. The pipeline is one GitHub Actions workflow
([`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)) driving two Vercel
environments. **Merging is always safe — nothing reaches production until a human approves.**

---

## The model: staging auto, production gated

```
merge to main
   │
   ├─▶ staging job (no gate)
   │     vercel pull (preview) → build → deploy --prebuilt → smoke 200
   │     → alias to family-chore-tracker-staging.vercel.app
   │
   └─▶ production job   [waits at the `production` environment's required-reviewers gate]
         vercel pull (production) → build --prod → deploy --prebuilt --no-wait
         → inspect --wait (bounded) → smoke 200 → promote → smoke 200 (prod domain)
```

- **Staging** — every merge to `main` auto-builds and deploys to an **isolated** staging environment
  (its own Supabase project, Vercel *Preview* scope). Validate here freely.
- **Production** — graduating is a **gated rebuild of the same commit** with production env. The
  `production` job waits at that environment's `required_reviewers` rule; one approval ships it.

> **Why rebuild, not byte-promote?** The staging build inlines staging's `NEXT_PUBLIC_*` values, so
> the production artifact must be **rebuilt** with production env — promoting the staging bytes would
> ship staging's database config to prod. (This, plus the gotcha below, is the prod-500 lesson.)

Vercel's native Git auto-deploy is **disabled** via [`vercel.json`](../../vercel.json)
(`git.deploymentEnabled`) so the GitHub gate stays authoritative; CLI `--prebuilt` deploys and PR
previews are unaffected.

---

## Approving a production deploy

A merge **queues** the production job; it does not ship. Approve it in the GitHub **Actions UI** →
the waiting run → review the `production` environment gate. **Never self-approve** without intending
to ship — this is the human checkpoint. Once approved, the job rebuilds, runs pre- and post-promote
smoke checks (HTTP 200), and flips the production domain.

---

## The `NEXT_PUBLIC` gotcha (the prod-500 root cause)

`NEXT_PUBLIC_*` vars are **inlined into the browser bundle at build time**. Vercel **hides
*Sensitive* variables from `vercel pull`**, so if `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are marked Sensitive, the CI build inlines **empty** values → the
client can't construct a Supabase client → **site-wide 500**.

**Rule:** keep `NEXT_PUBLIC_*` **non-sensitive** in every Vercel scope. (They're public by
definition — the anon key is meant for the browser.) Secrets like `SUPABASE_SERVICE_ROLE_KEY` stay
Sensitive and server-only. This single misconfiguration caused every prod-500 incident; both
environments verified 200 after the fix.

---

## First-time Vercel setup

For each real scope (Preview = staging, Production = prod), set in the Vercel project:

**Secrets (GitHub Actions):** `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

**Per-scope env vars (Vercel):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` *(Sensitive)*, `SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` *(**non-sensitive** — see gotcha above)*
- `JUDGE_GEMINI_API_KEY` if using a real judge (the judge is optional; the fake judge needs no key)

**Identical names, different values** across Development (keyless) / Preview (staging Supabase) /
Production (prod Supabase). The staging preview is SSO-protected; smoke checks reach it via the
`x-vercel-protection-bypass` secret.

The two Supabase projects: **staging** `mbzuvvtqtyhdiohiukgo` (Preview), **production**
`ayuhskelywuvdcggomre`. Keys are secret — fetch them from each project's dashboard, never commit them.

---

## Migrations across two databases

Schema lives in [`supabase/migrations/`](../../supabase/migrations/) (`0001`–`0007`). They now touch
**two** databases:

1. Apply to **staging** → validate (run the flow / `npm run test:supabase` against stage).
2. Apply to **production** → graduate the deploy.
3. Keep migrations **backward-compatible** (additive) so a rebuilt prod image works against the
   newly-migrated schema.

Regenerate `src/composition/database.types.ts` after a migration (command in that file's header).

> **Known gap (tracked):** migrations are applied **manually**; there's no CI drift check between the
> committed SQL and the live schemas (issue #138). Apply carefully and in order.

---

## Rollback & recovery

- **Roll back a bad production deploy:** `vercel rollback <previous-deployment>` (flips the domain
  back to a known-good deployment). The deploy summary records the previous deployment id.
- **Orphaned photo blobs** (a stored photo with no submission row, e.g. an infra fault mid-submit):
  reclaim per the runbook [`docs/ops/chore-photos-gc.md`](../ops/chore-photos-gc.md) — manual/ad-hoc,
  no cron in v1.
- **A 500 right after deploy:** check the `NEXT_PUBLIC` gotcha first (it's the usual suspect), then
  the build logs for empty-inlined env.

---

## CI gates (separate from deploy)

Every PR must pass six required checks before merge — `lint`, `typecheck`, `test`, `build`,
`secret-scan` (gitleaks), `pr-title` (Conventional Commits) — enforced by the `protect-main` ruleset.
Direct pushes to `main` are blocked. See [CONTRIBUTING](../../.github/CONTRIBUTING.md).

---

## Related
- [Configuration](configuration.md) — the variables supplied here.
- [Testing guide](testing-guide.md) — validating a build before graduating it.
- [v1 retrospective § What hurt](../reports/2026-06-23-retrospective-m0-m7.md#6-what-hurt-root-cause--resolution) — the full prod-500 / pipeline story.
