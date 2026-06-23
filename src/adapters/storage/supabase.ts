import type { SupabaseClient } from "@supabase/supabase-js";

import type { PhotoMeta, PhotoRef, PhotoStorage } from "@/ports/photo-storage";

import { photoPath } from "./path";

/** Short-lived signed-URL lifetime for viewing a photo, in seconds (§9). */
const SIGNED_URL_TTL_SECONDS = 5 * 60;

/**
 * Supabase Storage photo adapter (design §5, §9). Uploads to the **private**
 * `chore-photos` bucket under the shared `family/instance/submission.<ext>` path
 * and mints **short-lived signed URLs** for viewing (never public links).
 *
 * Constructed with the server-only service-role client at the composition root,
 * so uploads bypass storage RLS; infra faults throw and the caller maps them.
 * Proven interchangeable with the in-memory adapter by the `PhotoStorage`
 * contract suite (gated on a test bucket).
 */
export function supabasePhotoStorage(
  client: SupabaseClient,
  bucket: string,
): PhotoStorage {
  const store = client.storage.from(bucket);

  return {
    async put(bytes: Uint8Array, meta: PhotoMeta): Promise<PhotoRef> {
      const path = photoPath(meta);
      const { error } = await store.upload(path, bytes, {
        contentType: meta.contentType,
        upsert: true,
      });
      if (error) throw error;
      return { path };
    },

    async signedUrl(ref: PhotoRef): Promise<string> {
      const { data, error } = await store.createSignedUrl(
        ref.path,
        SIGNED_URL_TTL_SECONDS,
      );
      if (error) throw error;
      return data.signedUrl;
    },
  };
}
