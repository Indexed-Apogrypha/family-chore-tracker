import { randomUUID } from 'node:crypto';
import type { ChoreReference, ReferenceDraft, ReferenceStore } from './types';
import type { ImageInput } from '../judge/types';
import type { SupabaseContext } from '../supabase/client';
import { downloadImage, uploadImage } from '../supabase/storage';

/**
 * Live `ReferenceStore` backed by Supabase Postgres (`chore_references`) +
 * Storage. Implements the same dumb-CRUD port as `InMemoryReferenceStore`, so
 * `referenceService` (which owns the `isCurrent` invariant) is unchanged.
 * Intentionally NOT exported from `./index`.
 *
 * Bytes live in Storage; the row carries `storage_path` + `mime_type`, so reads
 * materialize the `ImageInput` back (see `downloadImage`). `add()` routes the
 * insert through the `set_current_reference` RPC so demote+insert is atomic (one
 * transaction), backed by the partial unique index `WHERE is_current`.
 */
interface ReferenceRow {
  id: string;
  chore_id: string;
  storage_path: string;
  mime_type: string;
  is_current: boolean;
  created_at: string;
}

function referencePath(choreId: string, id: string): string {
  return `references/${choreId}/${id}`;
}

function mapReference(row: ReferenceRow, image: ImageInput): ChoreReference {
  return {
    id: row.id,
    choreId: row.chore_id,
    image,
    isCurrent: row.is_current,
    createdAt: row.created_at,
  };
}

export class SupabaseReferenceStore implements ReferenceStore {
  constructor(private readonly ctx: SupabaseContext) {}

  async listByChore(choreId: string): Promise<ChoreReference[]> {
    const { data, error } = await this.ctx.client
      .from('chore_references')
      .select('*')
      .eq('chore_id', choreId)
      .order('created_at', { ascending: true });
    if (error) {
      throw new Error(`Failed to list references for chore "${choreId}": ${error.message}`);
    }
    const rows = (data ?? []) as unknown as ReferenceRow[];
    // Materialize bytes for each row (one Storage download apiece).
    return Promise.all(
      rows.map(async (row) =>
        mapReference(row, await downloadImage(this.ctx, row.storage_path, row.mime_type)),
      ),
    );
  }

  async add(draft: ReferenceDraft): Promise<ChoreReference> {
    // Pre-generate the id so the Storage object path matches the row id.
    const id = randomUUID();
    const path = referencePath(draft.choreId, id);
    await uploadImage(this.ctx, path, draft.image);
    const { data, error } = await this.ctx.client.rpc('set_current_reference', {
      p_id: id,
      p_chore_id: draft.choreId,
      p_storage_path: path,
      p_mime_type: draft.image.mimeType,
    });
    // A composite-returning function yields a single object, but tolerate a
    // single-element array shape too.
    const row = (Array.isArray(data) ? data[0] : data) as unknown as ReferenceRow | undefined;
    if (error || !row) {
      throw new Error(
        `Failed to set current reference for chore "${draft.choreId}": ${error?.message ?? 'no row returned'}`,
      );
    }
    // Reuse the just-uploaded bytes — no need to download what we just wrote.
    return mapReference(row, draft.image);
  }

  async setCurrent(id: string, isCurrent: boolean): Promise<void> {
    const { error } = await this.ctx.client
      .from('chore_references')
      .update({ is_current: isCurrent })
      .eq('id', id);
    if (error) {
      throw new Error(`Failed to set is_current on reference "${id}": ${error.message}`);
    }
  }
}
