import { randomUUID } from 'node:crypto';
import type {
  SubmissionDraft,
  SubmissionRecord,
  SubmissionStore,
  VerdictDraft,
  VerdictRecord,
} from './types';
import type { ImageInput, Verdict } from '../judge';
import type { SupabaseContext } from '../supabase/client';
import { downloadImage, uploadImage } from '../supabase/storage';

/**
 * Live `SubmissionStore` backed by Supabase Postgres (`submissions` +
 * `verdicts`) + Storage. Implements the same dumb-CRUD port as
 * `InMemorySubmissionStore`, so `submissionService` (submission-before-judging,
 * the read-side join) is unchanged. Intentionally NOT exported from `./index`.
 *
 * Bytes live in Storage; rows carry `storage_path` + `mime_type`, so reads
 * materialize the `ImageInput` back. The two writes stay separate (a submission
 * with no verdict is a valid, auditable state by design).
 */
interface SubmissionRow {
  id: string;
  chore_id: string;
  child_id: string | null;
  storage_path: string;
  mime_type: string;
  exif: Record<string, unknown> | null;
  created_at: string;
}

interface VerdictRow {
  id: string;
  submission_id: string;
  result: Verdict['result'];
  status: Verdict['status'];
  confidence: number;
  matches_reference: boolean;
  deviations: Verdict['deviations'];
  notes: string;
  model: string;
  judgment: Verdict['judgment'];
  created_at: string;
}

function submissionPath(choreId: string, id: string): string {
  return `submissions/${choreId}/${id}`;
}

function mapSubmission(row: SubmissionRow, image: ImageInput): SubmissionRecord {
  return {
    id: row.id,
    choreId: row.chore_id,
    childId: row.child_id ?? undefined,
    image,
    exif: row.exif,
    createdAt: row.created_at,
  };
}

function mapVerdict(row: VerdictRow): VerdictRecord {
  return {
    id: row.id,
    submissionId: row.submission_id,
    result: row.result,
    status: row.status,
    confidence: row.confidence,
    matchesReference: row.matches_reference,
    deviations: row.deviations,
    notes: row.notes,
    model: row.model,
    judgment: row.judgment,
    createdAt: row.created_at,
  };
}

export class SupabaseSubmissionStore implements SubmissionStore {
  // `familyId` is bound at construction (like `ctx`); stamped on both writes and
  // used to filter every read, so the port stays unchanged and tenancy holds under
  // the service-role key (which bypasses RLS). See `SupabaseChoreStore`.
  constructor(
    private readonly ctx: SupabaseContext,
    private readonly familyId: string,
  ) {}

  async addSubmission(draft: SubmissionDraft): Promise<SubmissionRecord> {
    // Pre-generate the id so the Storage object path matches the row id.
    const id = randomUUID();
    const path = submissionPath(draft.choreId, id);
    await uploadImage(this.ctx, path, draft.image);
    const { data, error } = await this.ctx.client
      .from('submissions')
      .insert({
        id,
        chore_id: draft.choreId,
        child_id: draft.childId ?? null,
        storage_path: path,
        mime_type: draft.image.mimeType,
        exif: draft.exif,
        family_id: this.familyId,
      })
      .select()
      .single();
    if (error || !data) {
      throw new Error(`Failed to insert submission: ${error?.message ?? 'no row returned'}`);
    }
    // Reuse the just-uploaded bytes — no need to download what we just wrote.
    return mapSubmission(data as unknown as SubmissionRow, draft.image);
  }

  async addVerdict(draft: VerdictDraft): Promise<VerdictRecord> {
    const { data, error } = await this.ctx.client
      .from('verdicts')
      .insert({
        submission_id: draft.submissionId,
        result: draft.result,
        status: draft.status,
        confidence: draft.confidence,
        matches_reference: draft.matchesReference,
        deviations: draft.deviations,
        notes: draft.notes,
        model: draft.model,
        judgment: draft.judgment,
        family_id: this.familyId,
      })
      .select()
      .single();
    if (error || !data) {
      throw new Error(`Failed to insert verdict: ${error?.message ?? 'no row returned'}`);
    }
    return mapVerdict(data as unknown as VerdictRow);
  }

  async listSubmissions(choreId?: string): Promise<SubmissionRecord[]> {
    const base = this.ctx.client.from('submissions').select('*').eq('family_id', this.familyId);
    const filtered = choreId === undefined ? base : base.eq('chore_id', choreId);
    const { data, error } = await filtered.order('created_at', { ascending: true });
    if (error) {
      throw new Error(`Failed to list submissions: ${error.message}`);
    }
    const rows = (data ?? []) as unknown as SubmissionRow[];
    return Promise.all(
      rows.map(async (row) =>
        mapSubmission(row, await downloadImage(this.ctx, row.storage_path, row.mime_type)),
      ),
    );
  }

  async listVerdicts(choreId?: string): Promise<VerdictRecord[]> {
    if (choreId === undefined) {
      const { data, error } = await this.ctx.client
        .from('verdicts')
        .select('*')
        .eq('family_id', this.familyId)
        .order('created_at', { ascending: true });
      if (error) {
        throw new Error(`Failed to list verdicts: ${error.message}`);
      }
      return ((data ?? []) as unknown as VerdictRow[]).map(mapVerdict);
    }
    // No denormalized chore_id on verdicts — filter by JOINing through
    // submissions (an inner join, mirroring the in-memory join-through-subs).
    const { data, error } = await this.ctx.client
      .from('verdicts')
      .select('*, submissions!inner(chore_id)')
      .eq('submissions.chore_id', choreId)
      .eq('family_id', this.familyId)
      .order('created_at', { ascending: true });
    if (error) {
      throw new Error(`Failed to list verdicts for chore "${choreId}": ${error.message}`);
    }
    // The embedded `submissions` field on each row is ignored by mapVerdict.
    return ((data ?? []) as unknown as VerdictRow[]).map(mapVerdict);
  }
}
