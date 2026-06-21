# Security Policy

This project is pre-release (v0.1.0) and under active development, but security is
taken seriously from day one. This document explains what is supported, how to
report a vulnerability privately, and what is in and out of scope.

## Supported versions

There are no released or tagged versions yet. Security fixes are applied to the
`main` branch only; there are no backports.

| Version | Supported |
| ------- | --------- |
| `main`  | ✅ — security fixes land here |
| any other branch / tag | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.** Public issues are
visible to everyone before a fix exists.

Report privately through **GitHub Private Vulnerability Reporting**:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** (or open
   <https://github.com/Indexed-Apogrypha/family-chore-tracker/security/advisories/new>).
3. Fill in the advisory form.

Please include:

- The affected component (e.g. judge adapter, Supabase RLS, auth, CI/CD, deploy).
- Steps to reproduce or a proof of concept.
- The impact you believe it has.

**What to expect.** This is a small personal project, so responses are
best-effort: expect an acknowledgement within about 7 days. We prefer
**coordinated disclosure** — please give us a reasonable window to ship a fix
before any public write-up, and we will keep you updated on progress.

## Scope

**In scope**

- Application code in this repository.
- CI/CD workflows under `.github/`.
- Supabase Row-Level Security (RLS) and authentication configuration.
- Deployment configuration.
- **Cross-family data access** — any flaw that lets one family read or modify
  another family's data (e.g. an RLS bypass) is in scope and treated as
  **high severity**.

**Out of scope**

- The third-party platforms themselves (Supabase, Vercel, Anthropic, Google) —
  report those to the respective vendor.
- Denial-of-service / volumetric attacks.
- Social engineering and physical attacks.
- The documented v1 limitations below (these are accepted design trade-offs, not
  vulnerabilities).

## Known limitations & accepted trade-offs (v1)

The architecture spec (§3.1) documents these deliberate v1 decisions. They are
**not** vulnerabilities:

- The kid-profile **PIN is an app-level gate, not a security boundary.** It
  selects a profile on a shared device; it does not authenticate against the
  backend.
- A device that is **signed in as a parent** grants full access to that family's
  data. Parent sessions are the real authentication boundary (Supabase Auth +
  JWT, RLS scoped per `family_id`).

A bug that lets one *family* reach another *family's* data is **not** covered by
this trade-off and **is** a real, in-scope vulnerability.

## Secrets handling

- Never commit secrets. Committed history is scanned by **gitleaks** in CI
  (`secret-scan` is a required check).
- `SUPABASE_SERVICE_ROLE_KEY` is **server-only** — it must never be exposed to
  the browser.
- If a secret is exposed, **rotate it immediately** and report it through the
  private channel above.

## Safe harbor

We welcome good-faith security research. We will not pursue or support legal
action against anyone who, in good faith, tests within the scope above, avoids
privacy violations and service disruption, and gives us a reasonable chance to
remediate before disclosure.
