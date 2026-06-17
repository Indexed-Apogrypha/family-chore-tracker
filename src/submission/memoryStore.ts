import type {
  SubmissionDraft,
  SubmissionRecord,
  SubmissionStore,
  VerdictDraft,
  VerdictRecord,
} from './types';

/** Construction knobs for deterministic tests; all default to real sources. */
export interface InMemorySubmissionStoreOptions {
  /** Submission id source. Defaults to a per-instance monotonic `sub-1`, `sub-2`, … */
  submissionIdFactory?: () => string;
  /** Verdict id source. Defaults to a per-instance monotonic `ver-1`, `ver-2`, … */
  verdictIdFactory?: () => string;
  /** ISO 8601 clock. Defaults to `new Date().toISOString()`. */
  clock?: () => string;
}

/**
 * A fully-working in-memory `SubmissionStore` — the persistence-side analog of
 * `FakeJudgeClient`/`InMemoryReferenceStore`. Two insertion-ordered arrays so
 * `listSubmissions`/`listVerdicts` yield oldest→newest without depending on
 * clock resolution. Returns shallow `{ ...row }` copies so callers can't mutate
 * stored rows — note the `image`/`exif` objects are shared by reference (same as
 * `InMemoryReferenceStore`), not deep-cloned.
 *
 * The bytes→Supabase-Storage+path mapping and transactional submission+verdict
 * writes are deferred `SupabaseSubmissionStore` concerns.
 */
export class InMemorySubmissionStore implements SubmissionStore {
  private readonly submissionRows: SubmissionRecord[] = [];
  private readonly verdictRows: VerdictRecord[] = [];
  private subSeq = 0;
  private verSeq = 0;
  private readonly submissionIdFactory: () => string;
  private readonly verdictIdFactory: () => string;
  private readonly clock: () => string;

  constructor(options: InMemorySubmissionStoreOptions = {}) {
    this.submissionIdFactory =
      options.submissionIdFactory ?? (() => `sub-${(this.subSeq += 1)}`);
    this.verdictIdFactory =
      options.verdictIdFactory ?? (() => `ver-${(this.verSeq += 1)}`);
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  async addSubmission(draft: SubmissionDraft): Promise<SubmissionRecord> {
    const row: SubmissionRecord = {
      id: this.submissionIdFactory(),
      choreId: draft.choreId,
      childId: draft.childId,
      image: draft.image,
      exif: draft.exif,
      createdAt: this.clock(),
    };
    this.submissionRows.push(row);
    return { ...row };
  }

  async addVerdict(draft: VerdictDraft): Promise<VerdictRecord> {
    const row: VerdictRecord = {
      ...draft,
      id: this.verdictIdFactory(),
      createdAt: this.clock(),
    };
    this.verdictRows.push(row);
    return { ...row };
  }

  async listSubmissions(choreId?: string): Promise<SubmissionRecord[]> {
    return this.submissionRows
      .filter((row) => choreId === undefined || row.choreId === choreId)
      .map((row) => ({ ...row }));
  }

  async listVerdicts(choreId?: string): Promise<VerdictRecord[]> {
    if (choreId === undefined) return this.verdictRows.map((row) => ({ ...row }));
    // Join through submissions — no denormalized choreId on the verdict.
    const submissionIds = new Set(
      this.submissionRows.filter((s) => s.choreId === choreId).map((s) => s.id),
    );
    return this.verdictRows
      .filter((row) => submissionIds.has(row.submissionId))
      .map((row) => ({ ...row }));
  }
}
