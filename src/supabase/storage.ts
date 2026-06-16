import { Buffer } from 'node:buffer';
import type { ImageInput } from '../judge/types';
import type { SupabaseContext } from './client';

/**
 * Storage helpers shared by the reference + submission adapters. Image bytes
 * live in a Supabase Storage bucket; the table rows carry only the object path
 * + mime type. These bridge that on-the-wire shape and the domain `ImageInput`
 * (base64, no `data:` prefix).
 *
 * NOTE (forced compromise): the frozen ports return `image: ImageInput` (bytes),
 * not a URL, so reads MUST materialize the bytes back — one Storage download per
 * row. Fine for the v1 single-chore tracer; a signed-URL optimization would
 * require changing the port shape (rippling into the judge core + the PWA's
 * PhotoThumb), so it is explicitly future work, not this slice.
 */

/** base64 ImageInput -> bytes -> upload to `path`. Throws on failure. */
export async function uploadImage(
  ctx: SupabaseContext,
  path: string,
  image: ImageInput,
): Promise<void> {
  const bytes = Buffer.from(image.data, 'base64');
  const { error } = await ctx.client.storage.from(ctx.bucket).upload(path, bytes, {
    contentType: image.mimeType,
    upsert: false,
  });
  if (error) {
    throw new Error(`Supabase Storage upload failed for "${path}": ${error.message}`);
  }
}

/** Download `path` and re-materialize it as a base64 `ImageInput`. Throws on failure. */
export async function downloadImage(
  ctx: SupabaseContext,
  path: string,
  mimeType: string,
): Promise<ImageInput> {
  const { data, error } = await ctx.client.storage.from(ctx.bucket).download(path);
  if (error || !data) {
    throw new Error(
      `Supabase Storage download failed for "${path}": ${error?.message ?? 'no data'}`,
    );
  }
  const arrayBuffer = await data.arrayBuffer();
  return { data: Buffer.from(arrayBuffer).toString('base64'), mimeType };
}
