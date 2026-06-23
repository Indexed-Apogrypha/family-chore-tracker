import type { PhotoMeta } from "@/ports/photo-storage";

/**
 * The photo path scheme — part of the storage contract (design §9), shared by
 * every {@link PhotoStorage} adapter so the in-memory executable spec and the
 * Supabase adapter derive byte-identical paths.
 */

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** File extension for a content type; `bin` for anything unrecognized. */
export function extensionFor(contentType: string): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType] ?? "bin";
}

/** `family_id/instance_id/submission_id.<ext>` — keyed on the submission id (§9). */
export function photoPath(meta: PhotoMeta): string {
  return `${meta.familyId}/${meta.instanceId}/${meta.submissionId}.${extensionFor(
    meta.contentType,
  )}`;
}
