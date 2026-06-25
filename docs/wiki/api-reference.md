# API reference

The HTTP surface is **12 App Router route handlers** under
[`src/app/api/`](../../src/app/api/). They are thin: each derives the request context, parses input,
calls one use-case, and maps the `Result` to a response. There is no Next.js middleware gating them —
**each handler checks auth itself**.

All routes are `POST` and accept/return JSON unless noted (`/api/submissions` is multipart). Success
is `{ ok: true, ... }`; failure is `{ error: "<code>" }`.

---

## Authentication & context

Every protected route calls `deriveContext()` ([`composition/request.ts`](../../src/composition/request.ts)),
which resolves a `RequestContext` = `{ familyId, actor: { kind, memberId } }`:

- **Real mode** — the parent is authenticated via **Supabase Auth** (cookies managed by
  `@supabase/ssr`); their member row is resolved from `auth_user_id`.
- **Practice mode** — a `practice_family` cookie anchors the device to an in-memory family.
- **Active profile** — the `active_member` cookie selects who is acting (set on login / signup /
  profile switch). A stale or cross-family value safely falls back to the parent.

If `deriveContext()` returns `null`, the handler responds `401 { error: "unauthenticated" }`.

### Cookies

| Cookie | Purpose | Set by | Cleared by |
|---|---|---|---|
| `active_member` | which member is acting (`ctx.actor`) | login, signup, profile/switch | logout |
| `practice_family` | anchors the device to a keyless practice family | auth/practice | logout |
| `sb-*` (Supabase) | parent auth session | the proxy / Supabase | logout (real mode) |

Cookies are `httpOnly`, `sameSite: lax`, `path: /`.

---

## Error code → HTTP status

Expected failures are the closed `AppError` set ([`domain/shared/errors.ts`](../../src/domain/shared/errors.ts)),
plus a few HTTP-layer codes the handlers add. The submission routes use the shared
[`respond.ts`](../../src/app/api/submissions/respond.ts) mapping; the others map the same codes with
the same intent:

| Code | Status | Meaning |
|---|---|---|
| `forbidden` | **403** | capability check failed (e.g. a kid tried a parent action) |
| `not_found` | **404** | entity missing or cross-family |
| `invalid_transition` | **409** | already decided / not in the required state |
| `validation` | **400** | input failed validation |
| `bad_pin` | **401** | wrong/missing PIN on profile switch |
| `judge_unavailable` · `storage_unavailable` · `persistence_unavailable` | **503** | transient infra fault; `judge_unavailable` includes `submissionId` to retry |
| `unauthenticated` | **401** | no/invalid session (HTTP-layer) |
| `too_large` | **413** | photo over 10 MB (HTTP-layer) |
| `missing_fields` · `missing_member` · `missing_template` · `not_in_practice_mode` | **400** | required field absent / route disabled (HTTP-layer) |
| `invalid_credentials` | **401** | bad email/password (HTTP-layer) |
| `no_family` | **409** | authenticated user has no family yet (HTTP-layer) |

User-facing copy for each code lives in [`src/app/error-copy.ts`](../../src/app/error-copy.ts).

---

## Routes

### Auth

#### `POST /api/auth/signup` — public
Register a parent and bootstrap their family on first signup.
- **Body:** `{ email, password, familyName, displayName }`
- **200:** `{ ok: true, session: boolean }` — `session:false` means email confirmation is pending (no cookie set yet).
- **Errors:** `missing_fields` (400); Supabase auth message (400) for weak password / existing email / invalid email.

#### `POST /api/auth/login` — public
Authenticate a parent and set the active profile.
- **Body:** `{ email, password }`
- **200:** `{ ok: true, ctx }` and sets `active_member` to the parent.
- **Errors:** `missing_fields` (400), `invalid_credentials` (401), `no_family` (409 — account exists but never bootstrapped a family).

#### `POST /api/auth/logout` — public, idempotent
Sign out and clear app cookies (`active_member`, `practice_family`; Supabase sign-out in real mode).
- **Body:** none · **200:** `{ ok: true }` (always succeeds).

#### `POST /api/auth/practice` — public, **keyless only**
Seed an in-memory practice family (parent + demo kid `Kiddo`, PIN `1234`) and anchor the device.
- **Body:** none · **200:** `{ ok: true }` (sets `practice_family` + `active_member`).
- **Errors:** `not_in_practice_mode` (400) when the app is in real mode.

### Members & profiles

#### `POST /api/members` — session, **parent-only**
Add a kid profile to the family.
- **Body:** `{ displayName, pin }`
- **200:** `{ ok: true, member: { id, displayName, kind: "kid" } }` (the `pin_hash` is never returned).
- **Errors:** `unauthenticated` (401), `forbidden` (403 — actor is a kid), `validation` (400).

#### `POST /api/profile/switch` — session
Switch the active profile on a shared device. The parent needs no PIN; a kid requires the correct PIN.
- **Body:** `{ memberId, pin? }`
- **200:** `{ ok: true, member: { id, displayName, kind } }` (sets `active_member`).
- **Errors:** `missing_member` (400), `unauthenticated` (401), `not_found` (404), `bad_pin` (401).

### Chores

#### `POST /api/templates` — session, **parent-only**
Create a recurring chore template.
- **Body:** `{ title, description?, points, recurrence, assignedMemberId }` where `recurrence` is
  `{ kind: "none" } | { kind: "daily" } | { kind: "weekly"; days: number[] }` (0=Sun … 6=Sat).
- **200:** `{ ok: true }`
- **Errors:** `unauthenticated` (401), `forbidden` (403), `not_found` (404 — assignee not in family), `validation` (400).

#### `POST /api/templates/active` — session, **parent-only**
Activate/deactivate a template (deactivating stops future lazy generation).
- **Body:** `{ templateId, active }`
- **200:** `{ ok: true, active }`
- **Errors:** `missing_template` (400), `unauthenticated` (401), `forbidden` (403), `not_found` (404).

#### `POST /api/oneoffs` — session, **parent-only**
Create a one-off chore instance (no template).
- **Body:** `{ title, points, assignedMemberId, dueDate }` (`dueDate` = ISO `YYYY-MM-DD`)
- **200:** `{ ok: true }`
- **Errors:** `unauthenticated` (401), `forbidden` (403), `not_found` (404 — assignee), `validation` (400).

### Submission & review

#### `POST /api/submissions` — session, **owner-or-parent** · `multipart/form-data`
A kid submits a photo for an instance. Runs `submitPhoto` (store → `evaluating` → judge →
`pending_review`).
- **Form fields:** `photo` (a `File`; MIME must be `image/jpeg|png|webp|heic`), `instanceId` (string).
- **Limits:** 10 MB — rejected early via `Content-Length`, then re-checked after buffering.
- **200:** `{ ok: true, status }` (the new submission status; normally `pending_review`).
- **Errors:** `unauthenticated` (401), `too_large` (413), `validation` (400 — missing/!File/bad MIME),
  `forbidden` (403), `not_found` (404), `invalid_transition` (409),
  `judge_unavailable`/`storage_unavailable`/`persistence_unavailable` (503 — `judge_unavailable`
  carries `submissionId` to retry).

#### `POST /api/submissions/retry` — session, **owner-or-parent**
Re-run the judge on a submission stuck in `evaluating` (after a judge outage). Reuses the stored
photo; never re-uploads.
- **Body:** `{ submissionId }`
- **200:** `{ ok: true, status }`
- **Errors:** `validation` (400), `unauthenticated` (401), `forbidden` (403), `not_found` (404),
  `invalid_transition` (409 — not in `evaluating`), `*_unavailable` (503).

#### `POST /api/review/decide` — session, **parent-only**
The parent's **authoritative** decision. Approve credits points once (idempotent on `submissionId`);
reject recycles the instance to `todo`.
- **Body:** `{ submissionId, decision: "approve" | "reject" }`
- **200:** `{ ok: true, status: "approved" | "rejected" }`
- **Errors:** `validation` (400), `unauthenticated` (401), `forbidden` (403 — actor is a kid),
  `not_found` (404), `invalid_transition` (409 — not `pending_review`).

---

## A typical real-mode flow

```
POST /api/auth/signup   { email, password, familyName, displayName }   → bootstrap
POST /api/auth/login    { email, password }                            → session + active_member=parent
POST /api/members       { displayName, pin }                           → add a kid
POST /api/profile/switch{ memberId: <kid>, pin: "…" }                  → act as the kid
POST /api/submissions   (multipart: photo, instanceId)                 → evaluating → pending_review
POST /api/profile/switch{ memberId: <parent> }                         → back to parent
POST /api/review/decide { submissionId, decision: "approve" }          → approved + points credited
```

In **practice mode**, replace the first three with a single `POST /api/auth/practice`.

---

## Related
- [Data model & state machine](data-model.md) — what these routes transition.
- [Architecture § Errors as values](architecture.md#errors-as-values) — why failures are a closed set.
- [Configuration](configuration.md) — how real vs practice mode is selected.
