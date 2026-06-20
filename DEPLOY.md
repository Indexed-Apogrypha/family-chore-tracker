# Demo deployment runbook

How to get the Family Chore Tracker onto your phones for a real demo:
**Vercel hosting + Supabase Auth (real parent/child logins) + a live vision judge.**

The app code is ready; this is the ops checklist. Steps that need your accounts and
secrets are marked **[you]**. Do them in order.

> Prefer a friendlier, click-by-click version with checkpoints and
> troubleshooting? See **[WALKTHROUGH.md](./WALKTHROUGH.md)** — same path, more
> hand-holding.

## 0. Prerequisites

- A GitHub account with this repo (you have it).
- A [Vercel](https://vercel.com) account (free Hobby tier is fine).
- A [Supabase](https://supabase.com) project (free tier is fine).
- An **Anthropic** API key (preferred for children's images — see the compliance
  note below) or a **Gemini** API key.

## 1. Stand up Supabase **[you]**

1. Create a new Supabase project. Note the **Project URL** and, under
   *Project Settings → API*, the **`service_role`** key and the **`anon`** key.
2. **Run the migrations in order** (SQL Editor → paste each file → run), from
   `supabase/migrations/`:
   `0001_init.sql` → `0002_accounts.sql` → `0003_auth.sql` → `0004_storage_rls.sql`
   → `0005_harden_function_search_path.sql` → `0006_family_id_not_null.sql`
   → `0007_storage_bucket.sql`.
   - `0007` creates the private `chore-photos` Storage bucket, so you do **not**
     need to create a bucket by hand.
3. **Turn OFF "Confirm email"** under *Authentication → Sign In / Providers →
   Email*. v1 needs parents to get a session immediately on sign-up; with confirm
   ON, sign-up can't complete the demo flow.

## 2. Get a vision API key **[you]**

- Anthropic (recommended): create a key at the Anthropic Console.
- Or Gemini: create a key at Google AI Studio.

> ⚠️ **Compliance gate.** The moment a key is set, real photos of a child's room
> are sent to the vendor. Per `docs/PRD.md` / `docs/compliance.md`, a real launch needs
> COPPA-grade parental consent and confirmation of the vendor's data-handling terms
> for minors' images. For a private demo with your own family that's your call —
> just don't cross it silently. Anthropic is the compliance-preferred vendor here.

## 3. Deploy to Vercel **[you]**

1. In Vercel: **Add New → Project**, import this GitHub repo.
2. Framework preset auto-detects **Next.js**. No build settings to change
   (`next build` / output handled automatically). No `vercel.json` needed.
3. Add **Environment Variables** (Production + Preview), then deploy:

   | Variable | Value | Required |
   | --- | --- | --- |
   | `SUPABASE_URL` | your project URL | ✅ |
   | `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key | ✅ |
   | `SUPABASE_ANON_KEY` | the `anon` key (turns ON Auth mode) | ✅ |
   | `SUPABASE_STORAGE_BUCKET` | `chore-photos` | ✅ |
   | `ANTHROPIC_API_KEY` | your Claude key | one of these |
   | `GEMINI_API_KEY` | your Gemini key | one of these |
   | `CLAUDE_MODEL` / `GEMINI_MODEL` | optional model override | — |

   Mark the service-role and API keys as **Sensitive**. They are server-only —
   never exposed to the browser (no `NEXT_PUBLIC_` prefix anywhere).
4. Vercel gives you an `https://…vercel.app` URL. **HTTPS is required** — the
   camera (`<input capture>`), PWA install, and the service worker only work in a
   secure context, so the Vercel URL works but a raw LAN IP would not.

## 4. Demo on your phones

1. **Parent phone:** open the Vercel URL → *Create family* → sign up (email +
   password). You land on `/parent`.
2. On `/parent`, **set the reference photo** — snap the room in its tidy "done"
   state. (Photos are downscaled in-browser before upload, so this is fast even on
   cellular.)
3. Still on the parent: **Manage children** → add a child (username + password).
   Children have no email; they log in with the username you set.
4. **Child phone:** open the URL → *Child sign-in* → the username/password from
   step 3 → `/child`. Snap the room and **Submit** → the AI verdict renders.
5. Verdict + streak show on `/child`; the parent sees the run on
   **`/parent/history`**.
6. **Install as an app (optional):** use the browser's "Add to Home Screen" on
   each phone for a full-screen, branded icon.

## 5. Verify the live wiring (optional, from your laptop)

With the same env vars in a local `.env`:

```bash
npm run smoke:supabase        # service-role adapter round-trip
npm run smoke:supabase-auth   # per-family / per-child / Storage RLS isolation
BASE_URL=https://your-app.vercel.app npm run smoke:auth-flow   # browser login/gating
```

## Notes & known constraints for the demo

- **Image size:** photos are downscaled client-side to ≤1600px JPEG
  (`lib/client/downscaleImage.ts`), kept under the 8 MB Server Action body cap.
  Direct-to-Storage upload (removing large bodies from the action path) is future
  work.
- **EXIF:** captured-but-unused (recorded as `null`); anti-gaming is deliberately
  unbuilt for v1.
- **Reset the demo data:** truncate the `chores/chore_references/submissions/
  verdicts` tables (and clear the `chore-photos` bucket) in Supabase, or just spin
  up a fresh project.
- **Legacy fallback:** unset `SUPABASE_ANON_KEY` for a no-login, role-by-URL mode;
  unset all `SUPABASE_*` for in-memory (resets on restart, single process — not
  suitable for two phones). The full path above avoids both.
