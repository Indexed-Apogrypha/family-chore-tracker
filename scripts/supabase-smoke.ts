/**
 * Live Supabase smoke test — the long-deferred, env-gated integration check.
 *
 *   npm run smoke:supabase
 *       Drives the THREE live Supabase adapters end-to-end against a real project:
 *       seed family -> seed chore -> setReference -> submitChore (judge) ->
 *       getHistory -> computeStreak, reading every step back through Storage +
 *       Postgres. Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY +
 *       SUPABASE_STORAGE_BUCKET (auto-loaded from .env if present). Uses the live
 *       Gemini judge when GEMINI_API_KEY is set, otherwise the deterministic fake
 *       — exactly the rule lib/server/container.ts uses.
 *
 *   npm run smoke:supabase -- ref.png sub.png
 *       Use two real (non-minor) images instead of generated placeholders — handy
 *       for a meaningful live Gemini verdict.
 *
 * This wires the stores directly the same way container.buildStores() does in
 * service-role mode; the container itself can't be imported here because it is
 * `import 'server-only'`. Runs are additive (no dedup) — each adds a reference
 * version + a submission, by design.
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { loadEnv, solidPng, assert } from './smoke-shared';
import { createSupabaseContext } from '../src/supabase/client';
import { ensureSeededFamily } from '../src/supabase/family';
import { SupabaseChoreStore } from '../src/chore/supabaseStore';
import { SupabaseReferenceStore } from '../src/reference/supabaseStore';
import { SupabaseSubmissionStore } from '../src/submission/supabaseStore';
import { createChore, listChores } from '../src/chore';
import { setReference, getCurrentReference } from '../src/reference';
import { submitChore, getHistory, type SubmitChoreDeps } from '../src/submission';
import { computeStreak } from '../src/streak';
import { FakeJudgeClient, type ImageInput, type JudgeClient } from '../src/judge';
import { CLEAN_PASS } from '../src/judge/fixtures';

const SEEDED_FAMILY_NAME = 'My Family';
const SEEDED_CHORE_NAME = 'Tidy room';

function mimeFromPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.heic':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}
function imageFrom(path: string | undefined, fallback: () => ImageInput): ImageInput {
  if (!path) return fallback();
  return { data: readFileSync(path).toString('base64'), mimeType: mimeFromPath(path) };
}

async function getJudge(): Promise<{ judge: JudgeClient; name: string }> {
  if (process.env.GEMINI_API_KEY) {
    const { GeminiJudgeClient } = await import('../src/judge/gemini');
    return { judge: new GeminiJudgeClient(), name: 'GeminiJudgeClient (live)' };
  }
  return { judge: new FakeJudgeClient(CLEAN_PASS), name: 'FakeJudgeClient (CLEAN_PASS)' };
}

async function main(): Promise<void> {
  loadEnv();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      'Live Supabase smoke needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (and ' +
        'SUPABASE_STORAGE_BUCKET).\nSet them in .env or the environment, then re-run ' +
        '`npm run smoke:supabase`.',
    );
    process.exitCode = 1;
    return;
  }

  const [refPath, subPath] = process.argv.slice(2);
  const ctx = createSupabaseContext();
  console.log(`• bucket:  ${ctx.bucket}`);

  const familyId = await ensureSeededFamily(ctx, SEEDED_FAMILY_NAME);
  console.log(`• family:  ${familyId}`);

  const chores = new SupabaseChoreStore(ctx, familyId);
  const references = new SupabaseReferenceStore(ctx, familyId);
  const submissions = new SupabaseSubmissionStore(ctx, familyId);

  const existing = (await listChores(chores)).find((c) => c.name === SEEDED_CHORE_NAME);
  const chore = existing ?? (await createChore(chores, SEEDED_CHORE_NAME));
  console.log(`• chore:   ${chore.id} ("${chore.name}")`);

  // 1) Reference round-trip: bytes -> Storage (family-prefixed path), path -> row,
  //    atomic demote+insert via the set_current_reference RPC, materialise on read.
  const refImage = imageFrom(refPath, () => solidPng(16, [80, 160, 90]));
  const reference = await setReference({ references, chores }, chore.id, refImage);
  const current = await getCurrentReference(references, chore.id);
  assert(current && current.id === reference.id && current.isCurrent, 'current reference round-trips');
  assert(current.image.data.length > 0, 'reference bytes materialise back from Storage');
  console.log(`• reference set + read back as current: ${reference.id}`);

  // 2) Submission + judge + verdict. The submission persists BEFORE judging, so a
  //    judge failure still leaves an auditable row (we report, don't hard-fail).
  const { judge, name: judgeName } = await getJudge();
  console.log(`• judge:   ${judgeName}`);
  const subImage = imageFrom(subPath, () => solidPng(16, [80, 160, 90]));
  const deps: SubmitChoreDeps = { judge, chores, references, submissions };
  try {
    const { submission, verdict } = await submitChore(deps, {
      choreId: chore.id,
      choreName: chore.name,
      image: subImage,
      exif: { smoke: true, ts: new Date().toISOString() },
    });
    console.log(
      `• submission ${submission.id} -> verdict ${verdict.result}/${verdict.status} ` +
        `(confidence ${verdict.confidence}, model ${verdict.model})`,
    );
  } catch (err) {
    console.warn(
      `• judge step failed (submission still persisted by design): ${(err as Error).message}`,
    );
  }

  // 3) History + streak read back through the same live store.
  const history = await getHistory(submissions, chore.id);
  assert(history.length >= 1, 'history has at least one submission');
  const streak = computeStreak(
    await submissions.listSubmissions(chore.id),
    await submissions.listVerdicts(chore.id),
  );
  console.log(
    `• history: ${history.length} submission(s); streak current=${streak.current} ` +
      `longest=${streak.longest} lastPass=${streak.lastPassDate ?? 'none'}`,
  );

  console.log(
    '\n✅ live Supabase round-trip OK (Postgres + Storage). ' +
      'Cross-check rows/objects via the Supabase MCP tools.',
  );
}

main().catch((err) => {
  console.error('\n❌ smoke failed:', err);
  process.exitCode = 1;
});
