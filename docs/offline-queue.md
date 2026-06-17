# Offline submission queue — design

Status: **Phase 1** in progress. Phase 2 items are called out as seams below.

## Goal

Let a child capture and "submit" a room photo while offline. The photo is queued
on-device and replayed through the **existing** judging pipeline when connectivity
returns; the verdict then lands in history/streak exactly as an online submission.

## Guiding principle — offline lives at the PWA edge

The domain core (`submitChore`, the stores, the judge seam) and the existing
`submitChoreAction` are **unchanged**. The queue is a client-side transport concern
that, on replay, calls the *same* `submitChoreAction` — which already resolves the
chore (`getSeededChore`), the child (`requireChild`), the deps, and persists +
judges. So the server has one submission path; "offline" is just a deferred call to
it. This mirrors the env-gated bridges (persistence/judge/auth): a thin edge, no core
change.

## Architecture

A small port + adapter + orchestration, in the repo's own style (like the
persistence seams):

| Module (`app/lib/offline/`) | Role |
| --- | --- |
| `types.ts` | `QueuedSubmission`, the `QueueStore` port, `SubmitFn`, `DrainResult`. |
| `memoryQueueStore.ts` | In-memory fake — the tested path (sibling of the `InMemory*Store`s). |
| `indexedDbQueueStore.ts` | The browser adapter (IndexedDB; photos are multi-MB Blobs). **Untested edge**, like `gemini.ts` / the Supabase adapters. |
| `drain.ts` | `drainQueue(store, submit)` — pure orchestration: list → submit each → remove on confirmed delivery → leave on network failure. Unit-tested over the in-memory store + a fake `submit`. |

`QueuedSubmission` (the **Phase 2 seams** are recorded now, fully used later):

```
clientId   : string   // idempotency seam — Phase 2 sends it to the server for dedup
blob       : Blob     // the photo bytes
mimeType   : string
capturedAt : string   // ISO — Phase 2 seam: fair streak bucketing by capture day
status     : 'pending' // Phase 2 seam: 'syncing' | 'failed' for retry/backoff
```

The queued item is **chore- and child-agnostic** — `submitChoreAction` resolves both
server-side at sync, so the offline surface needs no authenticated server data.

## Flow

```
offline capture → enqueue {blob, capturedAt, clientId} in IndexedDB → "Saved — we'll check it when you're back online"
reconnect/open  → QueueSync drains FIFO → submitChoreAction(formData{photo}) → verdict persisted → remove item → revalidate history/streak
```

Two capture entry points, so offline capture never depends on caching authenticated
HTML:

1. **In-app (already loaded):** `SubmitForm` on `/child` detects `navigator.onLine === false` on submit, enqueues instead of calling the action, and shows a pending state. Covers "was using the app, lost connection" (the common case).
2. **Cold-open offline:** the precached `/offline` page hosts a small client `OfflineCapture` that enqueues. Covers "opened the installed app with no network." Auth-free and data-light (single-chore v1), so no cross-user HTML is cached.

`QueueSync` (client) drains on `online` + on load; serial, one at a time. **Dequeue
on confirmed delivery:** remove an item only when `submitChoreAction` *returns* (the
server processed it — even a `no_reference`/`error` verdict means it was delivered);
retain only when the call *throws* (couldn't reach the server). Draining is gated to
the child surface.

## Key decisions

- **Foreground flush, not Background Sync.** Background Sync is Chromium-only; this is
  a mobile PWA where iOS/Safari matters, so v1 drains in the foreground (app open),
  cross-platform, with the verdict in the foreground where the UI shows it. *(Phase 2:
  Background Sync as a Chromium progressive enhancement, replaying a `Route Handler` —
  added then because the SW can't drive a Server Action's RSC protocol.)*
- **Reuse `submitChoreAction`, no new endpoint.** Smallest surface; the drain calls
  the action with a `FormData{photo}`. *(Phase 2 adds a `Route Handler` for the
  Background-Sync replay path.)*
- **Capture UI offline = the two entry points above**, not cached authed HTML — keeps
  the SW's "never cache authenticated/cross-user responses" property (PR #16) intact.

## Phase 2 seams (recorded now)

- `capturedAt` → bucket the streak by capture day, not sync day (fairness). Touches the
  submission model, so deferred.
- `clientId` → server-side idempotency for safe retries. v1 relies on dequeue-on-confirm
  + `computeStreak`'s best-of-day (same-day dupes are low-harm).
- `status` → retry/backoff + surfacing a stuck item.
- `Route Handler` + Background Sync → wake-and-replay on Chromium.
- Queue isolation across users on a shared device (clear on sign-in-as-different-user).

## Compliance posture (unchanged)

Queued photos sit on-device until online, then go to Gemini/Supabase exactly as the
online path — gated by the same `GEMINI_API_KEY` / `SUPABASE_*` keys. No new egress.

## Verification

- **Here (headless):** typecheck, build, and **unit tests on `drainQueue` + the
  in-memory store** (ordering, dequeue-on-confirm, retain-on-throw); the online path
  stays green.
- **Needs a device/browser:** the real offline capture → reconnect → drain (Chrome
  DevTools "Offline" / a phone). Same posture as the service worker — structure + build
  verified here, runtime offline on a client. Manual steps documented in the PR.
