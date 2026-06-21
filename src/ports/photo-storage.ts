import type { FamilyId, InstanceId, SubmissionId } from "@/domain/shared/ids";

/**
 * The photo-storage seam (design §5, §9). `in-memory` keeps bytes in a map and
 * mints a fake signed URL; `supabase-storage` writes to a per-family bucket and
 * returns a short-lived signed URL.
 */

/** A reference to a stored photo — the storage path. */
export interface PhotoRef {
  path: string;
}

/** Everything the adapter needs to place a photo deterministically (§9). */
export interface PhotoMeta {
  familyId: FamilyId;
  instanceId: InstanceId;
  submissionId: SubmissionId;
  /** MIME type, used by the adapter to choose the file extension. */
  contentType: string;
}

export interface PhotoStorage {
  put(bytes: Uint8Array, meta: PhotoMeta): Promise<PhotoRef>;
  signedUrl(ref: PhotoRef): Promise<string>;
}
