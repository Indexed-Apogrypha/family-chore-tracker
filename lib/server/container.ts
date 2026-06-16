import 'server-only';

import { InMemoryChoreStore, createChore, listChores } from '../../src/chore';
import { InMemoryReferenceStore } from '../../src/reference';
import { InMemorySubmissionStore } from '../../src/submission';
import { computeStreak, type StreakState } from '../../src/streak';
import { CLEAN_PASS } from '../../src/judge/fixtures';
import type { ChoreStore } from '../../src/chore';
import type { ReferenceStore } from '../../src/reference';
import type { SubmitChoreDeps, SubmissionStore } from '../../src/submission';
import type { JudgeClient } from '../../src/judge';

/**
 * Composition root for the PWA.
 *
 * It owns one instance of each store and seeds the single v1 "Tidy room" chore.
 * This is the ONLY place wired to a concrete persistence implementation: the
 * three stores are env-gated behind the identical `ChoreStore`/`ReferenceStore`/
 * `SubmissionStore` ports, so every page and Server Action depends on the
 * helpers below, never on a concrete store — swapping backends changes only
 * this file.
 *
 *  - Persistence: the live `Supabase*Store` adapters when `SUPABASE_URL` +
 *    `SUPABASE_SERVICE_ROLE_KEY` are set (loaded via dynamic import so
 *    `@supabase/supabase-js` only enters the runtime when configured), otherwise
 *    the in-memory fakes (which reset on a full server restart — fine for dev).
 *  - Judge: the live `GeminiJudgeClient` when `GEMINI_API_KEY` is set, otherwise
 *    the deterministic fake. So the app runs keyless here and in CI.
 *
 * `import 'server-only'` turns any accidental client import of this module into a
 * build error, keeping the domain core (and, when keyed, the vendor SDKs) out of
 * the browser bundle.
 */

const SEEDED_CHORE_NAME = 'Tidy room';
const SEEDED_FAMILY_NAME = 'My Family';

interface Container {
  chores: ChoreStore;
  references: ReferenceStore;
  submissions: SubmissionStore;
  /** Resolves once the seed chore exists; caches its id + name. */
  ready: Promise<{ choreId: string; choreName: string }>;
}

// Stash on globalThis so Next dev's HMR module re-evaluation doesn't mint fresh
// empty stores (wiping the seeded chore + submissions) on every edit. We cache
// the build PROMISE (store construction is now async behind a dynamic import),
// which also memoizes an in-flight build. A full server restart still resets the
// in-memory data — acceptable for that bridge; Supabase persists across restarts.
const globalForContainer = globalThis as unknown as { __choreContainer?: Promise<Container> };

// Build all-three Supabase stores when configured, else all-three in-memory.
// They switch TOGETHER — a mixed set would split data across backends. Dynamic
// import keeps the Supabase SDK out of the runtime unless keyed.
async function buildStores(): Promise<Pick<Container, 'chores' | 'references' | 'submissions'>> {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createSupabaseContext } = await import('../../src/supabase/client');
    const { ensureSeededFamily } = await import('../../src/supabase/family');
    const { SupabaseChoreStore } = await import('../../src/chore/supabaseStore');
    const { SupabaseReferenceStore } = await import('../../src/reference/supabaseStore');
    const { SupabaseSubmissionStore } = await import('../../src/submission/supabaseStore');
    const ctx = createSupabaseContext(); // one shared client + bucket
    // v1 is single-family: find-or-create the one family and bind its id to all
    // three stores, which stamp it on writes + filter reads by it. The seam is the
    // container's alone — the stores stay behind the unchanged ports.
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

// Find-or-create so a persistent DB isn't seeded a duplicate "Tidy room" on
// every cold start. `createChore` stays dedup-free by design (a re-create is a
// deliberate act); the container owns this idempotency. Works for both backends.
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

/** The three stores, with the seed chore guaranteed to exist. */
export async function getStores(): Promise<{
  chores: ChoreStore;
  references: ReferenceStore;
  submissions: SubmissionStore;
}> {
  const container = await getContainer();
  await container.ready;
  return {
    chores: container.chores,
    references: container.references,
    submissions: container.submissions,
  };
}

/** The seeded v1 chore `{ choreId, choreName }` — the ids `submitChore` needs. */
export async function getSeededChore(): Promise<{ choreId: string; choreName: string }> {
  return (await getContainer()).ready;
}

/**
 * Builds the `submitChore` deps with an env-gated judge: the live Gemini adapter
 * when `GEMINI_API_KEY` is set, otherwise the deterministic fake — so the app
 * runs with no key here and in CI. The Gemini adapter is loaded via dynamic
 * import so `@google/genai` only enters the server runtime when a key is present
 * (mirrors `src/demo.ts`).
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

/** Current streak for the seeded chore, computed from the stored event stream. */
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
