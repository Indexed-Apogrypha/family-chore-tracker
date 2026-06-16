import 'server-only';

import { InMemoryChoreStore, createChore } from '../../src/chore';
import { InMemoryReferenceStore } from '../../src/reference';
import { InMemorySubmissionStore } from '../../src/submission';
import { computeStreak, type StreakState } from '../../src/streak';
import { CLEAN_PASS } from '../../src/judge/fixtures';
import type { SubmitChoreDeps } from '../../src/submission';
import type { JudgeClient } from '../../src/judge';

/**
 * Temporary in-memory composition root for the PWA tracer.
 *
 * It owns one instance of each in-memory store and seeds the single v1 "Tidy
 * room" chore. This is the ONLY place wired to a concrete persistence
 * implementation: when the deferred Supabase adapters land, they slot in behind
 * the identical `ChoreStore`/`ReferenceStore`/`SubmissionStore` ports and only
 * this file changes — every page and Server Action depends on the helpers below,
 * never on the stores directly.
 *
 * `import 'server-only'` turns any accidental client import of this module into a
 * build error, keeping the domain core (and, when keyed, the Gemini SDK) out of
 * the browser bundle.
 */

const SEEDED_CHORE_NAME = 'Tidy room';

interface Container {
  chores: InMemoryChoreStore;
  references: InMemoryReferenceStore;
  submissions: InMemorySubmissionStore;
  /** Resolves once the seed chore exists; caches its id + name. */
  ready: Promise<{ choreId: string; choreName: string }>;
}

// Stash on globalThis so Next dev's HMR module re-evaluation doesn't mint fresh
// empty stores (wiping the seeded chore + submissions) on every edit. A full
// server restart still resets the data — acceptable for this in-memory bridge.
const globalForContainer = globalThis as unknown as { __choreContainer?: Container };

function buildContainer(): Container {
  const chores = new InMemoryChoreStore();
  const references = new InMemoryReferenceStore();
  const submissions = new InMemorySubmissionStore();
  const ready = createChore(chores, SEEDED_CHORE_NAME).then((chore) => ({
    choreId: chore.id,
    choreName: chore.name,
  }));
  return { chores, references, submissions, ready };
}

function getContainer(): Container {
  return (globalForContainer.__choreContainer ??= buildContainer());
}

/** The three in-memory stores, with the seed chore guaranteed to exist. */
export async function getStores(): Promise<{
  chores: InMemoryChoreStore;
  references: InMemoryReferenceStore;
  submissions: InMemorySubmissionStore;
}> {
  const container = getContainer();
  await container.ready;
  return {
    chores: container.chores,
    references: container.references,
    submissions: container.submissions,
  };
}

/** The seeded v1 chore `{ choreId, choreName }` — the ids `submitChore` needs. */
export async function getSeededChore(): Promise<{ choreId: string; choreName: string }> {
  return getContainer().ready;
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
