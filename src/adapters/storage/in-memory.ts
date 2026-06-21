import type { PhotoMeta, PhotoRef, PhotoStorage } from "@/ports/photo-storage";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

function extensionFor(contentType: string): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType] ?? "bin";
}

/** The photo path scheme is part of the storage contract (design §9). */
function pathFor(meta: PhotoMeta): string {
  return `${meta.familyId}/${meta.instanceId}/${meta.submissionId}.${extensionFor(
    meta.contentType,
  )}`;
}

/**
 * Keyless photo storage: bytes in a map, a `memory://` stand-in for a signed
 * URL. The executable spec the Supabase Storage adapter must match.
 */
export function inMemoryPhotoStorage(): PhotoStorage {
  const blobs = new Map<string, Uint8Array>();

  return {
    async put(bytes: Uint8Array, meta: PhotoMeta): Promise<PhotoRef> {
      const path = pathFor(meta);
      blobs.set(path, bytes);
      return { path };
    },
    async signedUrl(ref: PhotoRef): Promise<string> {
      return `memory://photos/${ref.path}`;
    },
  };
}
