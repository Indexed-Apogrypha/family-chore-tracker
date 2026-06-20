# Demo walkthrough — get it on your phones

A click-by-click guide to taking Family Chore Tracker from this repo to a working
demo on your family's real phones. This is the friendly, hand-held version of the
terse checklist in `DEPLOY.md` — follow whichever you prefer; they cover the same
path.

**What you'll have at the end:** an `https://…vercel.app` URL where you sign in as a
parent, set a reference photo, add a child, and the child submits a room photo from
their own phone and gets a real AI verdict.

**Time:** ~30–45 minutes the first time.

**The path:** Vercel (hosting) + Supabase (database, logins, photo storage) + a
vision API key (the AI judge). All three are required for a multi-phone demo with
real logins.

**You'll need accounts on:**
- [GitHub](https://github.com) — you already have this repo there.
- [Supabase](https://supabase.com) — free tier is fine.
- [Vercel](https://vercel.com) — free Hobby tier is fine; sign in with GitHub.
- [Anthropic](https://console.anthropic.com) (recommended) **or**
  [Google AI Studio](https://aistudio.google.com) for the vision key.

> Tip: keep a scratch note open. You'll collect 5 secret values along the way
> (3 from Supabase, 1 vision key, and the project URL) and paste them into Vercel
> at the end.

---

## Phase A — Supabase (database + logins + photo storage)

### A1. Create the project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and sign in.
2. Click **New project**.
3. Pick an organization, give it a **Name** (e.g. `chore-tracker-demo`), and set a
   strong **Database Password** (you won't need it for this demo, but save it).
4. Choose the **Region** closest to you. Click **Create new project**.
5. Wait ~2 minutes for it to finish provisioning before continuing.

### A2. Run the database migrations

These create the tables, security policies, and the private photo bucket.

1. In the left sidebar, click **SQL Editor**.
2. For **each** file below, in this exact order: open the file from this repo's
   `supabase/migrations/` folder, copy its entire contents, paste into a new query
   in the SQL Editor, and click **Run** (or ⌘/Ctrl + Enter). Confirm it says
   *Success* before moving to the next.

   1. `0001_init.sql`
   2. `0002_accounts.sql`
   3. `0003_auth.sql`
   4. `0004_storage_rls.sql`
   5. `0005_harden_function_search_path.sql`
   6. `0006_family_id_not_null.sql`
   7. `0007_storage_bucket.sql`  ← creates the private `chore-photos` bucket for you

   **Order matters** — each builds on the previous. If you run one out of order
   you'll get a "relation does not exist" type error; just run them top-to-bottom.

3. Quick check: in the sidebar open **Table Editor** — you should see tables
   `families`, `users`, `chores`, `chore_references`, `submissions`, `verdicts`.
   And under **Storage** you should see a **`chore-photos`** bucket marked private.

### A3. Copy your API keys and URL

1. In the sidebar, click **Project Settings** (the gear) → **API Keys**
   (older dashboards: **Settings → API**).
2. You need three values — paste each into your scratch note:
   - **Project URL** — looks like `https://abcdwxyz.supabase.co`
     (Settings → **General** or top of the API page).
   - **`anon` key** — the public key the browser uses.
   - **`service_role` key** — the secret server key. **Keep this private.**

   > Supabase has newer **publishable** (`sb_publishable_…`) / **secret**
   > (`sb_secret_…`) keys. This app's environment variables are named for the
   > **legacy** keys, so use the **`anon`** and **`service_role`** keys — look for a
   > **"Legacy API keys"** tab/section on that page if the new keys are shown first.

### A4. Turn OFF email confirmation

Parents need a session the instant they sign up, so email confirmation must be off
for the demo.

1. Sidebar → **Authentication** → **Sign In / Providers** (the **Providers** page).
2. Open the **Email** provider.
3. Turn **OFF** "Confirm email" (a.k.a. "Enable email confirmations").
4. **Save.**

✅ **Phase A checkpoint:** you have a Project URL, an `anon` key, and a
`service_role` key saved; six tables + the `chore-photos` bucket exist; email
confirmation is off.

---

## Phase B — A vision API key (the AI judge)

Without a key the app uses a "fake judge" that always passes — fine for a UI tour,
but it won't actually compare photos. Pick **one** vendor:

- **Anthropic / Claude (recommended for this app):** go to the
  [Anthropic Console](https://console.anthropic.com) → **API Keys** → **Create
  Key**. Copy it (starts with `sk-ant-…`). This is your `ANTHROPIC_API_KEY`.
- **Google / Gemini (alternative):** go to
  [Google AI Studio](https://aistudio.google.com/apikey) → **Create API key**.
  Copy it. This is your `GEMINI_API_KEY`.

> ⚠️ **Read before you key it.** The moment a vision key is set, real photos of a
> child's room are sent to the vendor. Per `docs/PRD.md` and `docs/compliance.md`, a real
> launch requires COPPA-grade parental consent and confirmation of the vendor's
> data-handling terms for children's images. For a private demo with your own kids
> this is your decision to make — just make it deliberately, not by accident.
> Claude is the compliance-preferred vendor here.

✅ **Phase B checkpoint:** one vision key saved in your scratch note.

---

## Phase C — Deploy to Vercel

### C1. Import the repo

1. Go to [vercel.com/new](https://vercel.com/new) and sign in **with GitHub**.
2. Find **family-chore-tracker** in the list and click **Import**.
   (If you don't see it, click **Adjust GitHub App Permissions** and grant Vercel
   access to the repo.)
3. Vercel auto-detects **Next.js**. Leave the build settings at their defaults —
   there is nothing to change and no `vercel.json` needed.

### C2. Add the environment variables

Before clicking Deploy, expand **Environment Variables** and add each row below
(paste from your scratch note). Add them to all environments (Production, Preview,
Development).

| Name | Value | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | your Project URL | from A3 |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key | secret — server only |
| `SUPABASE_ANON_KEY` | the `anon` key | this turns ON real logins |
| `SUPABASE_STORAGE_BUCKET` | `chore-photos` | literal text |
| `ANTHROPIC_API_KEY` | your Claude key | **omit if** using Gemini |
| `GEMINI_API_KEY` | your Gemini key | **omit if** using Claude |

Optional: `CLAUDE_MODEL` or `GEMINI_MODEL` to override the default model.

> These are all **server-side** secrets. None has a `NEXT_PUBLIC_` prefix, so none
> is exposed to the browser — that's intentional. Set only one of the two vision
> keys (Anthropic wins if both are set).

### C3. Deploy

1. Click **Deploy** and wait for the build (~1–2 min).
2. When it finishes, click **Visit** (or **Continue to Dashboard → Domains**) to get
   your URL: `https://<something>.vercel.app`.

> **Why a deployed URL and not your laptop?** The camera, "install to home screen,"
> and offline support all require **HTTPS**. The Vercel URL provides it; a phone
> pointed at your laptop's local IP would not get a secure context and the camera
> won't open.

✅ **Phase C checkpoint:** opening the Vercel URL shows a **Sign in** screen (not a
"pick parent/child" screen). The sign-in screen means Auth mode is on — i.e.
`SUPABASE_ANON_KEY` was read correctly.

---

## Phase D — Run the demo on your phones

### D1. Parent: create the family

1. On the **parent's phone**, open the Vercel URL.
2. Choose **Create family** → enter an email + password → submit.
3. You land on **`/parent`**. (No confirmation email needed — that's why you turned
   it off in A4.)

### D2. Parent: set the reference photo

1. On `/parent`, use **Reference photo** to snap the room in its tidy, "this is what
   done looks like" state.
2. The photo is downscaled in the browser before upload, so this is quick even on
   cellular. You'll see **"Reference saved."**

### D3. Parent: add a child

1. Go to **Manage children** (link on `/parent`).
2. Add a child with a **username** and **password**. Children have no email — they
   log in with just the username/password you set here. You'll see "Child added."

### D4. Child: submit a room photo

1. On the **child's phone**, open the same Vercel URL.
2. Choose **Child sign-in** → enter the username + password from D3 → you land on
   **`/child`**.
3. Tap **Photo of your room**, snap it, and **Submit photo**.
4. The AI verdict renders right there (pass / fail / needs-review with notes), and
   the streak badge updates.

### D5. Parent: see the history

- Back on the parent's phone, open **`/parent/history`** to see the child's
  submission, the verdict, and the photo thumbnail.

### D6. (Optional) Install it like an app

On each phone's browser menu choose **Add to Home Screen**. The app installs
full-screen with the house-and-checkmark icon and even opens (to a friendly offline
page) without a connection.

🎉 That's the full loop: reference → submission → AI verdict → history + streak,
across two real devices.

---

## Optional — verify the wiring from your laptop

If you cloned the repo locally, copy the same values into a `.env` file and run the
built-in smoke tests:

```bash
# .env contains SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY /
# SUPABASE_STORAGE_BUCKET (+ your vision key)
npm install
npm run smoke:supabase        # database + storage round-trip
npm run smoke:supabase-auth   # per-family / per-child / storage isolation (RLS)
BASE_URL=https://<your-app>.vercel.app npm run smoke:auth-flow   # login + page gating
```

All green means the database, security policies, and login flow are working.

---

## Resetting the demo between runs

To start fresh (clear all chores, submissions, verdicts, and photos):

1. Supabase → **SQL Editor**, run:
   ```sql
   truncate verdicts, submissions, chore_references, chores restart identity cascade;
   ```
2. Supabase → **Storage → `chore-photos`** → select the folders → **Delete**.

To also wipe accounts, delete the users under **Authentication → Users** and the
rows in the `families` / `users` tables — or just spin up a brand-new project.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Vercel URL shows "pick parent/child," no login | `SUPABASE_ANON_KEY` not set (or typo). Auth mode needs it. Re-check the env var, then **Redeploy**. |
| Sign-up seems to work but you're stuck / no session | "Confirm email" is still ON. Turn it OFF (A4) and try again. |
| "relation does not exist" running a migration | Migrations run out of order. Run `0001`→`0007` top to bottom. |
| Child submit says "Ask a parent to set the reference photo first" | No reference set yet — do D2 first. |
| Camera doesn't open on the phone | Not on HTTPS. Use the `https://…vercel.app` URL, not a local IP. |
| Verdict always "pass" regardless of photo | No vision key set, so the fake judge is running. Add `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` and redeploy. |
| Photo upload fails on a huge image | Should be rare (photos are downscaled client-side). Retry; if it persists the source image was unusually large. |
| Changed an env var but behavior didn't change | Env vars apply on build. **Redeploy** from the Vercel dashboard. |

---

## Appendix — environment variable reference

| Variable | Required? | What it does |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Your Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server key for provisioning/seeding (bypasses RLS). Secret. |
| `SUPABASE_ANON_KEY` | yes (for logins) | Enables real Auth + per-family isolation. Without it: no-login fallback. |
| `SUPABASE_STORAGE_BUCKET` | yes | Must be `chore-photos` (matches the migration). |
| `ANTHROPIC_API_KEY` | one vision key | Claude vision judge (preferred). |
| `GEMINI_API_KEY` | one vision key | Gemini vision judge (alternative). |
| `CLAUDE_MODEL` / `GEMINI_MODEL` | optional | Override the default model id. |

**Mode summary:** all of `SUPABASE_*` + `ANON_KEY` set → real logins + persistence
(this guide). Drop `ANON_KEY` → shared data but no login (role by URL). Drop all
`SUPABASE_*` → in-memory, single process, resets on restart (not for two phones).
