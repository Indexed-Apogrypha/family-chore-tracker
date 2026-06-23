import type { PhotoMeta, PhotoRef, PhotoStorage } from "@/ports/photo-storage";

import { photoPath } from "./path";

/**
 * Keyless photo storage: bytes in a map, a `memory://` stand-in for a signed
 * URL. The executable spec the Supabase Storage adapter must match.
 */
export function inMemoryPhotoStorage(): PhotoStorage {
  const blobs = new Map<string, Uint8Array>();

  return {
    async put(bytes: Uint8Array, meta: PhotoMeta): Promise<PhotoRef> {
      const path = photoPath(meta);
      blobs.set(path, bytes);
      return { path };
    },
    async signedUrl(ref: PhotoRef): Promise<string> {
      return `memory://photos/${ref.path}`;
    },
  };
}
