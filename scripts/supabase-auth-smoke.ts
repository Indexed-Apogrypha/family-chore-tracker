/**
 * Live Supabase AUTH-mode RLS smoke — proves per-family + per-child RLS
 * ENFORCEMENT, the one thing the service-role smoke (`supabase-smoke.ts`) cannot:
 * the service role BYPASSES RLS, so it only ever verifies the adapters' own
 * family-stamping/filtering. This script instead drives everything through real
 * AUTHENTICATED clients (anon key + a signed-in user's JWT) — the same client the
 * app uses in `authMode()` — so the 0002 (per-family), 0003 (per-child), and 0004
 * (Storage object) policies actually bite.
 *
 *   npm run smoke:supabase-auth
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY +
 * SUPABASE_STORAGE_BUCKET (auto-loaded from .env). The service-role key is used
 * ONLY for privileged provisioning + cleanup (creating families/users/auth users,
 * discovering object paths) — never for the assertions, which all run as
 * authenticated end users. Always uses the deterministic FakeJudgeClient (no
 * photo bytes leave the box).
 *
 * Shape: two families (A: parent + two children; B: parent + one child). Each
 * family's parent creates a chore + reference and each child submits — through the
 * adapters under that user's authed client, proving the real write path is ALLOWED
 * for the owner under RLS. Then raw authed-client queries prove ISOLATION:
 *   • family A's parent cannot see/insert/read-bytes for family B (and vice-versa)
 *   • a child sees only their OWN submissions/verdicts; the parent sees the family's
 *   • a child cannot insert a submission as a sibling or into another family
 * Runs are self-contained and CLEANED UP at the end (pass `--keep` to retain rows).
 *
 * Like `gemini.ts`/the adapters, this is scaffold-grade ops tooling, not unit-tested.
 */
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseContext } from '../src/supabase/client';
import { SupabaseChoreStore } from '../src/chore/supabaseStore';
import { SupabaseReferenceStore } from '../src/reference/supabaseStore';
import { SupabaseSubmissionStore } from '../src/submission/supabaseStore';
import { createChore } from '../src/chore';
import { setReference } from '../src/reference';
import { submitChore, type SubmitChoreDeps } from '../src/submission';
import { FakeJudgeClient } from '../src/judge';
import { CLEAN_PASS } from '../src/judge/fixtures';
import { loadEnv, solidPng, assert } from './smoke-shared';

const RUN = Date.now().toString(36);
const PASSWORD = `Smoke!pw-${RUN}`;
const CHILD_EMAIL_DOMAIN = 'children.chore.local';

interface ProvisionedUser {
  userId: string;
  email: string;
  client: SupabaseClient; // signed-in (authenticated) client
}
interface ProvisionedFamily {
  familyId: string;
  parent: ProvisionedUser;
  children: ProvisionedUser[];
}

// --- assertion collector (run ALL checks, report a full audit) ---------------
const failures: string[] = [];
function check(name: string, ok: boolean): void {
  console.log(`    ${ok ? '✓' : '✗ FAIL'} ${name}`);
  if (!ok) failures.push(name);
}
function section(title: string): void {
  console.log(`\n• ${title}`);
}

// --- track everything we create, for cleanup ---------------------------------
const createdFamilyIds: string[] = [];
const createdUserIds: string[] = [];

function makeCtx(client: SupabaseClient, bucket: string): SupabaseContext {
  return { client, bucket };
}

/** A fresh anon-key client signed in as `email` — the authenticated client. */
async function signIn(
  url: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

async function provisionFamily(
  admin: SupabaseClient,
  url: string,
  anonKey: string,
  label: string,
  childLabels: string[],
): Promise<ProvisionedFamily> {
  // 1) family row (privileged: no authenticated INSERT path for families).
  const fam = await admin.from('families').insert({ name: `Smoke ${label}` }).select('id').single();
  if (fam.error || !fam.data) throw new Error(`create family failed: ${fam.error?.message}`);
  const familyId = (fam.data as { id: string }).id;
  createdFamilyIds.push(familyId);

  // 2) parent: a confirmed auth user (email_confirm bypasses the project's confirm
  //    setting) + a users row. Mirrors signUpParentAction, minus email delivery.
  const parentEmail = `smoke-parent-${label.toLowerCase()}.${RUN}@example.com`;
  const parent = await provisionUser(admin, url, anonKey, familyId, 'parent', parentEmail, null);

  // 3) children: parent-provisioned (PRD:40), username -> synthetic auth email.
  const children: ProvisionedUser[] = [];
  for (const cl of childLabels) {
    const username = `smoke-${label}-${cl}-${RUN}`.toLowerCase();
    const childEmail = `${username}@${CHILD_EMAIL_DOMAIN}`;
    children.push(await provisionUser(admin, url, anonKey, familyId, 'child', childEmail, username));
  }
  return { familyId, parent, children };
}

async function provisionUser(
  admin: SupabaseClient,
  url: string,
  anonKey: string,
  familyId: string,
  role: 'parent' | 'child',
  email: string,
  username: string | null,
): Promise<ProvisionedUser> {
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: username ? { role, username } : { role },
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser failed for ${email}: ${created.error?.message}`);
  }
  const userId = created.data.user.id;
  createdUserIds.push(userId);
  const row = await admin
    .from('users')
    .insert({ id: userId, family_id: familyId, role, username });
  if (row.error) throw new Error(`users insert failed for ${email}: ${row.error.message}`);
  const client = await signIn(url, anonKey, email, PASSWORD);
  return { userId, email, client };
}

async function main(): Promise<void> {
  loadEnv();
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!url || !serviceRoleKey || !anonKey || !bucket) {
    console.error(
      'Auth-mode RLS smoke needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ' +
        'SUPABASE_ANON_KEY + SUPABASE_STORAGE_BUCKET.\nSet them in .env (the anon key ' +
        'is what turns RLS enforcement on), then re-run `npm run smoke:supabase-auth`.',
    );
    process.exitCode = 1;
    return;
  }
  const keep = process.argv.includes('--keep');

  // The service-role admin client: ONLY for provisioning + path discovery + cleanup.
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    section('Provisioning two families through the admin (service-role) client');
    const famA = await provisionFamily(admin, url, anonKey, 'A', ['kid1', 'kid2']);
    const famB = await provisionFamily(admin, url, anonKey, 'B', ['kid1']);
    const [childA1, childA2] = famA.children;
    const [childB1] = famB.children;
    assert(childA1 && childA2 && childB1, 'expected 2 children in A and 1 in B');
    console.log(`    family A ${famA.familyId} (parent + 2 kids); family B ${famB.familyId} (parent + 1 kid)`);

    // --- Legit writes through the adapters under each user's AUTHED client. ---
    // These prove the real app path is ALLOWED for the owner under RLS (chore +
    // reference inserts for the parent; child-scoped submission+verdict inserts).
    section('Owner writes via adapters under authenticated clients (allowed by RLS)');
    const choreA = await createChore(
      new SupabaseChoreStore(makeCtx(famA.parent.client, bucket), famA.familyId),
      'Tidy room',
    );
    await setReference(
      {
        references: new SupabaseReferenceStore(makeCtx(famA.parent.client, bucket), famA.familyId),
        chores: new SupabaseChoreStore(makeCtx(famA.parent.client, bucket), famA.familyId),
      },
      choreA.id,
      solidPng(16, [80, 160, 90]),
    );
    const choreB = await createChore(
      new SupabaseChoreStore(makeCtx(famB.parent.client, bucket), famB.familyId),
      'Tidy room',
    );
    await setReference(
      {
        references: new SupabaseReferenceStore(makeCtx(famB.parent.client, bucket), famB.familyId),
        chores: new SupabaseChoreStore(makeCtx(famB.parent.client, bucket), famB.familyId),
      },
      choreB.id,
      solidPng(16, [160, 90, 80]),
    );
    check('parent A created a chore + reference under their JWT', Boolean(choreA.id));
    check('parent B created a chore + reference under their JWT', Boolean(choreB.id));

    const submitAs = (u: ProvisionedUser, familyId: string, choreId: string, choreName: string) => {
      const ctx = makeCtx(u.client, bucket);
      const deps: SubmitChoreDeps = {
        judge: new FakeJudgeClient(CLEAN_PASS),
        chores: new SupabaseChoreStore(ctx, familyId),
        references: new SupabaseReferenceStore(ctx, familyId),
        submissions: new SupabaseSubmissionStore(ctx, familyId),
      };
      return submitChore(deps, {
        choreId,
        choreName,
        image: solidPng(16, [80, 160, 90]),
        childId: u.userId,
        exif: { smoke: 'auth-rls', run: RUN },
      });
    };
    const subA1 = await submitAs(childA1, famA.familyId, choreA.id, choreA.name);
    const subA2 = await submitAs(childA2, famA.familyId, choreA.id, choreA.name);
    const subB1 = await submitAs(childB1, famB.familyId, choreB.id, choreB.name);
    check('child A1 submitted (own child_id) under their JWT', Boolean(subA1.submission.id));
    check('child A2 submitted under their JWT', Boolean(subA2.submission.id));
    check('child B1 submitted under their JWT', Boolean(subB1.submission.id));

    // --- 0002: per-FAMILY isolation (parent A vs family B). -------------------
    section('0002 per-family isolation — parent A cannot see family B');
    for (const table of ['chores', 'chore_references', 'submissions', 'verdicts']) {
      const all = await famA.parent.client.from(table).select('id, family_id');
      check(`parentA ${table}: query ok`, !all.error);
      const rows = (all.data ?? []) as Array<{ family_id: string }>;
      check(`parentA ${table}: every visible row is family A`, rows.every((r) => r.family_id === famA.familyId));
      const probe = await famA.parent.client.from(table).select('id').eq('family_id', famB.familyId);
      check(`parentA ${table}: explicit family-B probe is empty`, (probe.data ?? []).length === 0);
    }
    // Symmetry spot-check: parent B sees only family B.
    const bChores = await famB.parent.client.from('chores').select('id, family_id');
    check('parentB chores: every visible row is family B', ((bChores.data ?? []) as Array<{ family_id: string }>).every((r) => r.family_id === famB.familyId));
    check('parentB does NOT see family A chore', !((bChores.data ?? []) as Array<{ id: string }>).some((r) => r.id === choreA.id));

    // --- 0002: per-family INSERT denial. -------------------------------------
    section('0002 per-family insert denial — parent A cannot write into family B');
    const crossInsert = await famA.parent.client
      .from('chores')
      .insert({ name: 'rls-probe-should-fail', family_id: famB.familyId })
      .select();
    check('parentA insert of a chore into family B is REJECTED', Boolean(crossInsert.error));

    // --- 0003: per-CHILD isolation. ------------------------------------------
    section('0003 per-child isolation — a child sees only their own; the parent sees all');
    const a1Subs = (await childA1.client.from('submissions').select('id, child_id')).data ?? [];
    check('childA1 sees only own submissions', (a1Subs as Array<{ child_id: string }>).every((r) => r.child_id === childA1.userId));
    check('childA1 sees own submission', (a1Subs as Array<{ id: string }>).some((r) => r.id === subA1.submission.id));
    check('childA1 does NOT see sibling A2 submission', !(a1Subs as Array<{ id: string }>).some((r) => r.id === subA2.submission.id));

    const a2Subs = (await childA2.client.from('submissions').select('id, child_id')).data ?? [];
    check('childA2 sees only own submissions', (a2Subs as Array<{ child_id: string }>).every((r) => r.child_id === childA2.userId));
    check('childA2 does NOT see sibling A1 submission', !(a2Subs as Array<{ id: string }>).some((r) => r.id === subA1.submission.id));

    const pSubs = (await famA.parent.client.from('submissions').select('id').eq('chore_id', choreA.id)).data ?? [];
    check('parentA sees BOTH children submissions', (pSubs as Array<{ id: string }>).some((r) => r.id === subA1.submission.id) && (pSubs as Array<{ id: string }>).some((r) => r.id === subA2.submission.id));

    // verdicts: child sees only verdicts for their own submission; parent sees all.
    const a1Verdicts = (await childA1.client.from('verdicts').select('id, submission_id')).data ?? [];
    check('childA1 sees only verdicts for own submission', (a1Verdicts as Array<{ submission_id: string }>).every((r) => r.submission_id === subA1.submission.id));
    check('childA1 does NOT see sibling A2 verdict', !(a1Verdicts as Array<{ id: string }>).some((r) => r.id === subA2.verdict.id));
    const pVerdicts = (await famA.parent.client.from('verdicts').select('id')).data ?? [];
    check('parentA sees BOTH children verdicts', (pVerdicts as Array<{ id: string }>).some((r) => r.id === subA1.verdict.id) && (pVerdicts as Array<{ id: string }>).some((r) => r.id === subA2.verdict.id));

    // --- 0003: per-child INSERT denial. --------------------------------------
    section('0003 per-child insert denial — a child cannot write as a sibling / cross-family');
    const asSibling = await childA1.client.from('submissions').insert({
      chore_id: choreA.id,
      child_id: childA2.userId, // impersonation attempt
      storage_path: `${famA.familyId}/submissions/${choreA.id}/rls-probe`,
      mime_type: 'image/png',
      family_id: famA.familyId,
      exif: null,
    }).select();
    check('childA1 insert AS sibling A2 is REJECTED', Boolean(asSibling.error));
    const crossFamilySub = await childA1.client.from('submissions').insert({
      chore_id: choreA.id,
      child_id: childA1.userId,
      storage_path: `${famB.familyId}/submissions/${choreA.id}/rls-probe`,
      mime_type: 'image/png',
      family_id: famB.familyId, // wrong family
      exif: null,
    }).select();
    check('childA1 insert into family B is REJECTED', Boolean(crossFamilySub.error));

    // --- 0004: Storage object (photo BYTES) isolation. -----------------------
    section('0004 Storage byte isolation — bytes obey the same per-family RLS');
    const refAPath = (await admin.from('chore_references').select('storage_path').eq('family_id', famA.familyId).limit(1).single()).data as { storage_path: string } | null;
    const refBPath = (await admin.from('chore_references').select('storage_path').eq('family_id', famB.familyId).limit(1).single()).data as { storage_path: string } | null;
    assert(refAPath && refBPath, 'expected reference object paths for both families');
    const ownDl = await famA.parent.client.storage.from(bucket).download(refAPath.storage_path);
    check('parentA CAN download own family photo bytes', !ownDl.error && Boolean(ownDl.data));
    const foreignDl = await famA.parent.client.storage.from(bucket).download(refBPath.storage_path);
    check('parentA CANNOT download family B photo bytes', Boolean(foreignDl.error) || !foreignDl.data);
    const foreignUp = await famA.parent.client.storage
      .from(bucket)
      .upload(`${famB.familyId}/references/rls-probe/${randomUUID()}`, Buffer.from('x'), {
        contentType: 'text/plain',
        upsert: false,
      });
    check('parentA CANNOT upload into family B path prefix', Boolean(foreignUp.error));

    // --- report --------------------------------------------------------------
    console.log('');
    if (failures.length === 0) {
      console.log('✅ auth-mode RLS enforcement verified — per-family (0002), per-child (0003), and Storage (0004) isolation all hold under real authenticated JWTs.');
    } else {
      console.log(`❌ ${failures.length} RLS check(s) FAILED:`);
      for (const f of failures) console.log(`   - ${f}`);
      process.exitCode = 1;
    }
  } finally {
    if (keep) {
      console.log('\n(--keep) leaving smoke rows + auth users in place.');
    } else {
      await cleanup(admin, bucket);
    }
  }
}

/** Best-effort teardown: storage objects, then rows (FK order), then auth users. */
async function cleanup(admin: SupabaseClient, bucket: string): Promise<void> {
  section('Cleanup');
  const fams = createdFamilyIds;
  if (fams.length === 0) {
    console.log('    nothing to clean up.');
    return;
  }
  try {
    const refPaths = ((await admin.from('chore_references').select('storage_path').in('family_id', fams)).data ?? []) as Array<{ storage_path: string }>;
    const subPaths = ((await admin.from('submissions').select('storage_path').in('family_id', fams)).data ?? []) as Array<{ storage_path: string }>;
    const paths = [...refPaths, ...subPaths].map((r) => r.storage_path).filter(Boolean);
    if (paths.length > 0) await admin.storage.from(bucket).remove(paths);
  } catch (e) {
    console.warn(`    storage cleanup warning: ${(e as Error).message}`);
  }
  // Rows in FK-safe order, then families.
  for (const table of ['verdicts', 'submissions', 'chore_references', 'chores', 'users']) {
    const { error } = await admin.from(table).delete().in('family_id', fams);
    if (error) console.warn(`    ${table} cleanup warning: ${error.message}`);
  }
  const famDel = await admin.from('families').delete().in('id', fams);
  if (famDel.error) console.warn(`    families cleanup warning: ${famDel.error.message}`);
  // Auth users last (their users rows already gone above).
  for (const userId of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.warn(`    auth user ${userId} cleanup warning: ${error.message}`);
  }
  console.log(`    removed ${createdUserIds.length} auth user(s) + ${fams.length} famil(y/ies) and their rows/objects.`);
}

main().catch((err) => {
  console.error('\n❌ auth smoke crashed:', err);
  process.exitCode = 1;
});
