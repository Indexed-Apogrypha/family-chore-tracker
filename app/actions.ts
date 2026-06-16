'use server';

import { revalidatePath } from 'next/cache';
import { setReference } from '../src/reference';
import { submitChore, NoCurrentReferenceError } from '../src/submission';
import type { ImageInput, Verdict } from '../src/judge';
import { getStores, getSeededChore, buildSubmitDeps } from '../lib/server/container';
import { authMode, requireChild, requireParent } from '../lib/server/auth';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type SetReferenceResult = { status: 'ok' } | { status: 'error'; message: string };

export type SubmitChoreResult =
  | { status: 'ok'; verdict: Verdict }
  | { status: 'no_reference' }
  | { status: 'error'; message: string };

/**
 * Reads the uploaded `<input type="file" capture>` photo and converts it to the
 * core's `ImageInput` (base64 with NO `data:` prefix + the IANA mime type) — the
 * same shape `src/demo.ts` builds from a file on disk. Returns `{ error }` on a
 * validation failure so the caller can surface it.
 */
async function fileToImageInput(formData: FormData): Promise<ImageInput | { error: string }> {
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Please choose a photo first.' };
  }
  if (!file.type.startsWith('image/')) {
    return { error: 'That file is not an image.' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: 'That photo is too large (max 8MB).' };
  }
  const data = Buffer.from(await file.arrayBuffer()).toString('base64');
  return { data, mimeType: file.type || 'image/jpeg' };
}

function isError(value: ImageInput | { error: string }): value is { error: string } {
  return 'error' in value;
}

/** Parent sets/replaces the current reference photo for the seeded chore. */
export async function setReferenceAction(
  _prev: SetReferenceResult | null,
  formData: FormData,
): Promise<SetReferenceResult> {
  const image = await fileToImageInput(formData);
  if (isError(image)) return { status: 'error', message: image.error };

  // Only a signed-in parent may set the reference (authMode); a no-op otherwise.
  if (authMode()) await requireParent();

  const { references } = await getStores();
  const { choreId } = await getSeededChore();
  await setReference(references, choreId, image);

  revalidatePath('/parent');
  return { status: 'ok' };
}

/** Child submits a room photo; returns the verdict or a friendly no-reference signal. */
export async function submitChoreAction(
  _prev: SubmitChoreResult | null,
  formData: FormData,
): Promise<SubmitChoreResult> {
  const image = await fileToImageInput(formData);
  if (isError(image)) return { status: 'error', message: image.error };

  // In authMode only a signed-in child submits; attribute the submission to them
  // (the store stamps child_id, and the child-scoped RLS policy requires it).
  const childId = authMode() ? (await requireChild()).userId : undefined;

  const deps = await buildSubmitDeps();
  const { choreId, choreName } = await getSeededChore();

  try {
    // EXIF is captured-but-unused per the PRD (story 19). A browser `<input
    // capture>` upload doesn't surface EXIF without a parser, so we record null
    // for now; a later slice can parse it server-side from the buffer without
    // changing the submitChore contract.
    const { verdict } = await submitChore(deps, { choreId, choreName, image, exif: null, childId });
    revalidatePath('/child');
    revalidatePath('/parent/history');
    revalidatePath('/');
    return { status: 'ok', verdict };
  } catch (err) {
    if (err instanceof NoCurrentReferenceError) return { status: 'no_reference' };
    return { status: 'error', message: 'Something went wrong checking your photo. Please try again.' };
  }
}
