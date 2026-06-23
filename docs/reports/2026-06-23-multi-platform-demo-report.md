# Multi-platform processing report — live demo of the core loop

**Date:** 2026-06-23 · **Operator:** Matthew Harper · **Driver:** Claude Code
**Trigger:** post-merge of [#132](https://github.com/Indexed-Apogrypha/family-chore-tracker/pull/132)
(`feat: namespace local .env for both Supabase projects`), commit `11697f8`.

## Scope

A fresh-user walk of the full product loop — **signup → family → kid → chore →
photo submission → AI verdict → parent approval → points** — driven through a real
browser against the **staging deployment**, while capturing the signals each
platform emitted. Production was deliberately untouched.

**Environments**
- **Staging** (demo target): Vercel deployment `dpl_8jfqKcYxPhchJ58c7t1t2XTPMY91`
  (Preview env, commit `11697f8`) → Supabase `mbzuvvtqtyhdiohiukgo`. Preview is
  SSO-protected; accessed via the `x-vercel-protection-bypass` cookie.
- **Production** (untouched): deployment `dpl_Bu9YNTwdVhPnSgHuF1Ppp6aPQdtq` →
  Supabase `ayuhskelywuvdcggomre`. Public domain `family-chore-tracker.vercel.app` (200).

**Demo identity:** `chore.demo.170039@gmail.com` · family "Maple Street Crew" ·
parent **Riley** · kid **Sam** (PIN 1234) · one-off chore "Tidy the bedroom and
make the bed" (10 pts).

## Outcome (behavioral)

| Step | Result |
|---|---|
| Parent signup | Account + family bootstrapped; **`session:false`** — staging Auth requires email confirmation |
| Email confirm | Done via service role (`auth.users.email_confirmed_at`) — the planned fallback |
| Login | Session established; landed in parent hub |
| Add kid (Sam) | Kid member created with PIN |
| Create chore | One-off, 10 pts, due today, assigned to Sam — `POST /api/oneoffs 200` |
| Switch to kid | **PIN gate** enforced; unlocked with 1234 |
| Submit photo | 964-byte PNG → Storage; `POST /api/submissions 200` → `pending_review` |
| AI verdict | `{"pass": false, "model": "fake", "confidence": 0.87}` — advisory only |
| Parent approve | `POST /api/review/decide 200`; submission + instance → `approved` |
| Points | Append-only ledger **+10 (`chore_approved`)**; **Sam balance = 10 pts** |

End-to-end loop succeeded. **Production stayed at 0 families / 0 auth users** before
and after.

---

## Per-platform signals

### Vercel (staging deployment `dpl_8jfq`, Preview env)
- **Full request trace, all healthy.** Server renders: `GET /signup, /login, /,
  /board, /templates, /review` → 200; statics (`/icon.svg`, `/manifest.webmanifest`)
  → 304 `cache=HIT`. API routes: `POST /api/oneoffs`, `/api/profile/switch`,
  `/api/submissions`, `/api/review/decide` → **all 200**.
- **Sources:** `serverless` + `serverless-middleware` — the App Router **proxy
  middleware runs on every request** (auth/session bridge). Dynamic routes
  `cache=MISS` (expected for authed SSR).
- **One anomaly:** `OPTIONS / → 400` (×4). This is a **preview-only Vercel Live
  toolbar** preflight, **not an app error** — it does not exist on the public
  production domain.
- **Web Analytics** active: `POST /_vercel/insights/view → 200`.
- **Deployment Protection:** preview returns `302` to SSO; bypassed via cookie.
  Protection JWE probes `GET /.well-known/vercel/jwe → 204`.
- **Production runtime:** **no error/fatal logs in 24h**; untouched by the demo.

### Supabase — staging (`mbzuvvtqtyhdiohiukgo`)
- **Auth (GoTrue):**
  - Email validation **rejected `@example.com`** ("Email address … is invalid") —
    retried with a `@gmail.com` address.
  - Signup created an **unconfirmed** user → **email confirmation is required on
    staging** (the app correctly surfaced "Check your email to confirm").
  - After confirm + login, a steady stream of `GET /user → 200` — the `@supabase/ssr`
    server client **re-validates the session on every server render**. Durations
    mostly ~2–5 ms (a few cold outliers 21–88 ms).
- **Postgres:** every write landed correctly and was verified by SQL — `families`,
  `members` (text-id schema, `kind` = parent/kid, founder carries `auth_user_id`),
  `chore_instances`, `submissions` (verdict in `ai_verdict` jsonb), `points_ledger`
  (append-only).
- **Storage:** the **964-byte `image/png`** uploaded to bucket `chore-photos` at
  `‹family›/‹instance›/‹submission›.png`, and was rendered back on the review screen
  via a signed URL.
- **Advisors:** security **clean**; performance = 6× *unindexed foreign key* + 1×
  *unused index*, all **INFO**.

### Supabase — production (`ayuhskelywuvdcggomre`)
- **Untouched** by the demo (0 families / 0 auth users throughout).
- Security advisor: 1 WARN — *Leaked Password Protection disabled*
  ([remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).
  Performance advisors identical to staging (schema parity).

### GitHub Actions
- Merge commit `11697f8`: **CI** green (36s) and the **Deploy (staging → production)**
  pipeline green (4m34s) — *Deploy to staging* ✅ and *Graduate to production* ✅
  (run `28057527745`). No GitHub activity *during* the demo itself.

### Dependabot / code scanning
- **1 open Dependabot alert:** `postcss < 8.5.10` — **medium**, build-time XSS via
  unescaped `</style>` in CSS stringify; fixed in **8.5.10**; transitive in
  `package-lock.json`.
- **CodeQL:** 0 open alerts.

### Next.js (App Router)
- Build: **21 routes** (static + dynamic + a middleware **proxy**), Turbopack bundler.
- Runtime during demo: server-rendered routes returned 200; the **proxy middleware
  executed on every request** (the `serverless-middleware` log source); auth via the
  `@supabase/ssr` cookie bridge. No runtime errors surfaced in console or logs (the
  only console error was the preview-toolbar `OPTIONS /` 400).

### Claude / Anthropic API
- **Zero calls.** The staging deployment resolved to the **fake judge**
  (`"model": "fake"`), i.e. **no `JUDGE_ANTHROPIC_API_KEY` configured in the Preview
  env** → no Anthropic request, **no spend** (account is unfunded — by design).

### Gemini API
- **Zero calls.** Same reason — **no `JUDGE_GEMINI_API_KEY` in the Preview env**, so
  the seam fell back to the fake judge. The advisory-verdict pipeline still ran
  end-to-end (verdict produced, parent decision authoritative).

---

## Notable findings & suggested follow-ups

1. **Deployed staging never exercises a real vision judge** — the Preview env has no
   judge key, so submissions always get the *fake* verdict. If you want staging to
   exercise the free **Gemini** path, set `JUDGE_GEMINI_API_KEY` in the Vercel
   **Preview** environment (leave Anthropic unset to avoid spend).
2. **Staging Auth requires email confirmation** — fresh signups can't reach the hub
   without confirming. Fine for real users; for automated/demo flows it needs a
   service-role confirm (as done here) or auto-confirm enabled on staging.
3. **`postcss` medium advisory** — bump to ≥ 8.5.10 (Dependabot PR likely already open).
4. **Supabase perf advisors (INFO)** — covering indexes on the flagged FKs
   (`chore_instances`, `chore_templates`, `points_ledger`, `submissions`) are worth
   adding before chore/submission volume grows.
5. **Prod auth advisory** — *Leaked Password Protection* is off in production; enabling
   it is a low-effort hardening.
6. **`OPTIONS / → 400`** is a benign preview-toolbar artifact; no action.

## Demo residue (staging only)

Left in place on staging (sandbox): 1 auth user, 1 family ("Maple Street Crew"),
2 members (Riley/Sam), 1 chore instance, 1 submission, 1 storage object, 1 ledger
entry (+10). Can be purged on request. **Production has no demo residue.**
