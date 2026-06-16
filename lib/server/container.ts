import 'server-only';

import { cache } from 'react';
import { InMemoryChoreStore, createChore, listChores } from '../../src/chore';
import { InMemoryReferenceStore } from '../../src/reference';
import { InMemorySubmissionStore } from '../../src/submission';
import { computeStreak, type StreakState } from '../../src/streak';
import { CLEAN_PASS } from '../../src/judge/fixtures';
import { authMode, getAdminContext, getAuthedClient, requireUser } from './auth';
import type { ChoreStore } from '../../src/chore';
import type { ReferenceStore } from '../../src/reference';
import type { SubmitChoreDeps, SubmissionStore } from '../../src/submission';
import type { JudgeClient } from '../../src/judge';

/**
 * Composition root for the PWA — the ONLY place wired to concrete persistence +
 * judge implementations. Every page and Server Action depends on the helpers
 * below, never on a concrete store, so backends swap here alone. There are three
 * env-gated modes, all behind the identical `ChoreStore`/`ReferenceStore`/
 * `SubmissionStore` ports:
 *
 *  1. IN-MEMORY (no SUPABASE_URL/key): in-memory fakes on `globalThis`, one
 *     implicit family, no login. The keyless default here + in CI.
 *  2. SERVICE-ROLE (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, no anon key): the
 *     live Supabase stores under the service-role key, one seeded family, no login.
 *     RLS is bypassed; the adapters' own family stamping/filtering is the guard.
 *  3. AUTH (also SUPABASE_ANON_KEY → `authMode()`): per-request stores bound to the
 *     SIGNED-IN user's family, with DB I/O on the AUTHENTICATED client so the
 *     per-family RLS policies enforce. Login required (page guards redirect).
 *
 * The store classes are identical across (2) and (3) — only the `ctx.client` they
 * receive differs (service-role vs the user's authenticated client) and the
 * family they're bound to (the seeded one vs the caller's). That's the whole
 * "flip": the frozen ports and the three adapters never change.
 *
 * Judge: the live `GeminiJudgeClient` when `GEMINI_API_KEY` is set, otherwise the
 * deterministic fake — so the app runs keyless here and in CI.
 *
 * `import 'server-only'` turns any accidental client import into a build error,
 * keeping the domain core (and, when keyed, the vendor SDKs) out of the browser.
 */

const SEEDED_CHORE_NAME = 'Tidy room';
const SEEDED_FAMILY_NAME = 'My Family';

interface Stores {
  chores: ChoreStore;
  references: ReferenceStore;
  submissions: SubmissionStore;
}

interface Container extends Stores {
  /** Resolves once the seed chore exists; caches its id + name. */
  ready: Promise<{ choreId: string; choreName: string }>;
}

// Stash on globalThis so Next dev's HMR module re-evaluation doesn't mint fresh
// empty stores on every edit. Caches the build PROMISE (store construction is
// async behind a dynamic import), which also memoizes an in-flight build. Used by
// modes (1) + (2) only — auth mode is per-user and must NOT be globally cached.
const globalForContainer = globalThis as unknown as { __choreContainer?: Promise<Container> };

// Modes (1)+(2): all-three Supabase service-role stores when configured, else
// all-three in-memory. They switch TOGETHER. Dynamic import keeps the Supabase SDK
// out of the runtime unless keyed.
async function buildStores(): Promise<Stores> {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createSupabaseContext } = await import('../../src/supabase/client');
    const { ensureSeededFamily } = await import('../../src/supabase/family');
    const { SupabaseChoreStore } = await import('../../src/chore/supabaseStore');
    const { SupabaseReferenceStore } = await import('../../src/reference/supabaseStore');
    const { SupabaseSubmissionStore } = await import('../../src/submission/supabaseStore');
    const ctx = createSupabaseContext(); // one shared service-role client + bucket
    // Single-family (no-auth) mode: find-or-create the one family and bind its id to
    // all three stores, which stamp it on writes + filter reads by it.
    const familyId = await ensureSeededFamily(ctx, SEEDED_FAMILY_NAME);
    return {
      chores: new SupabaseChoreStore(ctx, familyId),
      references: new SupabaseReferenceStore(ctx, familyId),
      submissions: new SupabaseSubmissionStore(ctx, familyId),
    };
  }
  return {
    chores: new InMemoryChoreStore(),
    references: new InMemoryReferenceStore(),
    submissions: new InMemorySubmissionStore(),
  };
}

// Find-or-create so a persistent DB isn't seeded a duplicate "Tidy room" on every
// cold start. `createChore` stays dedup-free by design; the container owns this
// idempotency. Reused by every mode (the store it's given is already family-scoped).
async function ensureSeededChore(chores: ChoreStore): Promise<{ choreId: string; choreName: string }> {
  const existing = (await listChores(chores)).find((c) => c.name === SEEDED_CHORE_NAME);
  const chore = existing ?? (await createChore(chores, SEEDED_CHORE_NAME));
  return { choreId: chore.id, choreName: chore.name };
}

async function buildContainer(): Promise<Container> {
  const stores = await buildStores();
  return { ...stores, ready: ensureSeededChore(stores.chores) };
}

function getContainer(): Promise<Container> {
  return (globalForContainer.__choreContainer ??= buildContainer());
}

// Mode (3): AUTHENTICATED, family-scoped, per-request stores. DB I/O uses the
// signed-in user's authenticated client (so RLS enforces); Storage stays on the
// service-role admin client (`storageClient`). Bound to the caller's OWN family,
// so what the adapters stamp/filter is exactly what the policies also allow. NOT
// globally cached (per-user) — `cache()` memoizes within a single request only.
const getAuthedStores = cache(async (): Promise<Stores> => {
  const identity = await requireUser();
  const [{ SupabaseChoreStore }, { SupabaseReferenceStore }, { SupabaseSubmissionStore }, admin, client] =
    await Promise.all([
      import('../../src/chore/supabaseStore'),
      import('../../src/reference/supabaseStore'),
      import('../../src/submission/supabaseStore'),
      getAdminContext(),
      getAuthedClient(),
    ]);
  const ctx = { client, bucket: admin.bucket, storageClient: admin.client };
  return {
    chores: new SupabaseChoreStore(ctx, identity.familyId),
    references: new SupabaseReferenceStore(ctx, identity.familyId),
    submissions: new SupabaseSubmissionStore(ctx, identity.familyId),
  };
});

const getAuthedSeededChore = cache(async (): Promise<{ choreId: string; choreName: string }> => {
  const { chores } = await getAuthedStores();
  return ensureSeededChore(chores);
});

/** The three stores, with the seed chore guaranteed to exist (mode-appropriate). */
export async function getStores(): Promise<Stores> {
  if (authMode()) return getAuthedStores();
  const container = await getContainer();
  await container.ready;
  return {
    chores: container.chores,
    references: container.references,
    submissions: container.submissions,
  };
}

/** The seeded "Tidy room" chore `{ choreId, choreName }` — the ids submitChore needs. */
export async function getSeededChore(): Promise<{ choreId: string; choreName: string }> {
  if (authMode()) return getAuthedSeededChore();
  return (await getContainer()).ready;
}

/**
 * Builds the `submitChore` deps with an env-gated judge: the live Gemini adapter
 * when `GEMINI_API_KEY` is set, otherwise the deterministic fake — so the app
 * runs with no key here and in CI. The Gemini adapter is loaded via dynamic
 * import so `@google/genai` only enters the server runtime when a key is present.
 */
export async function buildSubmitDeps(): Promise<SubmitChoreDeps> {
  const { references, submissions } = await getStores();
  return { judge: await getJudge(), references, submissions };
}

async function getJudge(): Promise<JudgeClient> {
  if (process.env.GEMINI_API_KEY) {
    const { GeminiJudgeClient } = await import('../../src/judge/gemini');
    return new GeminiJudgeClient();
  }
  // CLEAN_PASS → a confirmed pass with one trivial low-severity deviation
  // (~0.94 confidence): a believable demo verdict that still exercises the
  // deviations list and lets the streak increment.
  const { FakeJudgeClient } = await import('../../src/judge/client');
  return new FakeJudgeClient(CLEAN_PASS);
}

/**
 * Current streak for the seeded chore, computed from the stored event stream. In
 * auth mode the stores are RLS-scoped, so a child sees their own streak and a
 * parent sees the family's aggregate — both correct readings of the same policy.
 */
export async function getStreakState(): Promise<StreakState> {
  const { submissions } = await getStores();
  const { choreId } = await getSeededChore();
  const [subs, verdicts] = await Promise.all([
    submissions.listSubmissions(choreId),
    submissions.listVerdicts(choreId),
  ]);
  // SubmissionRecord/VerdictRecord are structurally StreakSubmission/StreakVerdict,
  // so they feed computeStreak with no mapping.
  return computeStreak(subs, verdicts);
}
