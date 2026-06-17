# family-chore-tracker

An app parents can use to check whether chores have been completed: a parent
photographs a room in its tidy "done" state, a child later submits a photo, and
the app compares the two and returns a structured pass/fail verdict. Parents get a
history view; children get a streak. See `PRD.md` for the product spec and
`CLAUDE.md` for the architecture.

## Develop

```bash
npm install
npm run dev    # the Next.js PWA at http://localhost:3000
npm test       # unit tests for the domain core
npm run build  # production build (also the server/client boundary check)
```

With no `GEMINI_API_KEY` set, the app uses a built-in **fake judge** (a scripted
pass), so the whole flow runs locally with no key or network. Set `GEMINI_API_KEY`
(see `.env.example`) to use the live Gemini vision model.

Persistence works the same way: with no `SUPABASE_*` variables set, the app uses
**in-memory stores** (which reset when the server restarts) and the legacy
single-family, role-by-URL mode with **no login**. To use the live Supabase
backend, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
`SUPABASE_STORAGE_BUCKET` (see `.env.example`), run the migrations in order
(`0001_init.sql`, `0002_accounts.sql`, `0003_auth.sql`, `0004_storage_rls.sql`), and
create a **private** Storage bucket of that name. The two backends sit behind
identical ports, so only the composition root (`lib/server/container.ts`) is aware of
which one is active.

**Accounts & Auth.** Set `SUPABASE_ANON_KEY` as well to turn on real Supabase Auth
+ per-family row-level security. Login becomes required: a parent signs up (which
creates their family), then provisions child accounts (children sign in with a
username — no self-registration), and the until-now dormant RLS policies enforce
because user-facing queries run through an authenticated (anon-key + user-JWT)
client instead of the service role. Manual prerequisite: in the Supabase Auth
settings, turn **off "Confirm email"** for v1. With `SUPABASE_ANON_KEY` unset, the
app stays single-family under the service-role key with no login. The live auth
flow needs a real Supabase project and isn't exercised by the keyless build/tests.
Photo bytes are family-scoped too: objects are written under a `<family_id>/…` path
and `0004_storage_rls.sql` adds matching `storage.objects` policies — its bucket
literal must equal `SUPABASE_STORAGE_BUCKET`.
