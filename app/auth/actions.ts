'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { authMode, getAdminContext, getAuthedClient, requireParent } from '../../lib/server/auth';

/**
 * Auth Server Actions (authMode only). Parents self-register + sign in by email;
 * children are PARENT-PROVISIONED (PRD:40 — no self-registration) and sign in with
 * a username that maps to a synthetic auth email. `families`/`users` rows are
 * written with the service-role ADMIN client (the RLS policies intentionally have
 * no authenticated INSERT path for these tables — provisioning is privileged);
 * sessions are established on the AUTHENTICATED client so its cookies carry the JWT.
 */

export type AuthResult = { status: 'ok' } | { status: 'error'; message: string };

const CHILD_EMAIL_DOMAIN = 'children.chore.local';

/** Normalize a child handle to a slug; the synthetic auth email is derived from it. */
function childSlug(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function childEmail(slug: string): string {
  return `${slug}@${CHILD_EMAIL_DOMAIN}`;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function signInParentAction(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  if (!authMode()) return { status: 'error', message: 'Accounts are not enabled.' };
  const email = field(formData, 'email');
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { status: 'error', message: 'Enter your email and password.' };
  const client = await getAuthedClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { status: 'error', message: 'That email or password is incorrect.' };
  redirect('/parent');
}

export async function signUpParentAction(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  if (!authMode()) return { status: 'error', message: 'Accounts are not enabled.' };
  const email = field(formData, 'email');
  const password = String(formData.get('password') ?? '');
  const familyName = field(formData, 'familyName') || 'My Family';
  if (!email || password.length < 6) {
    return { status: 'error', message: 'Enter an email and a password of at least 6 characters.' };
  }
  const client = await getAuthedClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) return { status: 'error', message: error.message };
  const userId = data.user?.id;
  if (!userId) {
    return {
      status: 'error',
      message: 'Could not start a session. Confirm "Confirm email" is OFF in Supabase Auth for v1.',
    };
  }
  // Provision the family + the parent's users row with the service role.
  const admin = await getAdminContext();
  const fam = await admin.client.from('families').insert({ name: familyName }).select('id').single();
  if (fam.error || !fam.data) {
    return { status: 'error', message: `Could not create your family: ${fam.error?.message ?? 'unknown error'}` };
  }
  const familyId = (fam.data as { id: string }).id;
  const userRow = await admin.client
    .from('users')
    .insert({ id: userId, family_id: familyId, role: 'parent' });
  if (userRow.error) return { status: 'error', message: `Could not finish setup: ${userRow.error.message}` };
  redirect('/parent');
}

export async function signInChildAction(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  if (!authMode()) return { status: 'error', message: 'Accounts are not enabled.' };
  const slug = childSlug(field(formData, 'username'));
  const password = String(formData.get('password') ?? '');
  if (!slug || !password) return { status: 'error', message: 'Enter your username and password.' };
  const client = await getAuthedClient();
  const { error } = await client.auth.signInWithPassword({ email: childEmail(slug), password });
  if (error) return { status: 'error', message: 'That username or password is incorrect.' };
  redirect('/child');
}

export async function signOutAction(): Promise<void> {
  if (authMode()) {
    const client = await getAuthedClient();
    await client.auth.signOut();
  }
  redirect('/login');
}

export async function provisionChildAction(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  if (!authMode()) return { status: 'error', message: 'Accounts are not enabled.' };
  const parent = await requireParent();
  const slug = childSlug(field(formData, 'username'));
  const password = String(formData.get('password') ?? '');
  if (!slug) return { status: 'error', message: 'Enter a username for your child.' };
  if (password.length < 6) return { status: 'error', message: 'Choose a password of at least 6 characters.' };

  const admin = await getAdminContext();
  // Mint a confirmed auth user (no email delivery) for the child.
  const created = await admin.client.auth.admin.createUser({
    email: childEmail(slug),
    password,
    email_confirm: true,
    user_metadata: { role: 'child', username: slug },
  });
  if (created.error || !created.data.user) {
    const taken = created.error?.message?.toLowerCase().includes('already');
    return {
      status: 'error',
      message: taken
        ? `The username "${slug}" is already taken.`
        : created.error?.message ?? 'Could not create the child account.',
    };
  }
  const userRow = await admin.client
    .from('users')
    .insert({ id: created.data.user.id, family_id: parent.familyId, role: 'child', username: slug });
  if (userRow.error) return { status: 'error', message: `Could not finish setup: ${userRow.error.message}` };

  revalidatePath('/parent/children');
  return { status: 'ok' };
}
