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
**in-memory stores** (which reset when the server restarts). To use the live
Supabase backend, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
`SUPABASE_STORAGE_BUCKET` (see `.env.example`), run the migrations in order
(`supabase/migrations/0001_init.sql` then `0002_accounts.sql`), and create a
**private** Storage bucket of that name. The two backends sit behind identical
ports, so only the composition root (`lib/server/container.ts`) is aware of which
one is active.

The schema includes the accounts tables (`families`/`users`) and per-family
row-level security, but the app still runs as a single seeded family under the
service-role key — **no login is required**. Supabase Auth and the login flow are
a later slice; until then the RLS policies are dormant (the service-role key
bypasses RLS) and per-family scoping is enforced by the adapters.
