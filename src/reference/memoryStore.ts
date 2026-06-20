import type { ChoreReference, ReferenceDraft, ReferenceStore } from './types';

/** Construction knobs for deterministic tests; both default to real sources. */
export interface InMemoryReferenceStoreOptions {
  /** Id source. Defaults to a per-instance monotonic `ref-1`, `ref-2`, … */
  idFactory?: () => string;
  /** ISO 8601 clock. Defaults to `new Date().toISOString()`. */
  clock?: () => string;
}

/**
 * A fully-working in-memory `ReferenceStore` — the persistence-side analog of
 * `FakeJudgeClient`. It backs the behavioral tests (and any demo) with no
 * Supabase. Rows are kept in a single insertion-ordered array, so `listByChore`
 * yields oldest→newest without depending on clock resolution (several inserts
 * within the same millisecond still order correctly).
 */
export class InMemoryReferenceStore implements ReferenceStore {
  private readonly rows: ChoreReference[] = [];
  private seq = 0;
  private readonly idFactory: () => string;
  private readonly clock: () => string;

  constructor(options: InMemoryReferenceStoreOptions = {}) {
    this.idFactory = options.idFactory ?? (() => `ref-${(this.seq += 1)}`);
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  async listByChore(choreId: string): Promise<ChoreReference[]> {
    // Copy each row so callers can't mutate what the store holds.
    return this.rows
      .filter((row) => row.choreId === choreId)
      .map((row) => ({ ...row }));
  }

  async add(draft: ReferenceDraft): Promise<ChoreReference> {
    const row: ChoreReference = {
      id: this.idFactory(),
      choreId: draft.choreId,
      image: draft.image,
      isCurrent: true,
      createdAt: this.clock(),
    };
    this.rows.push(row);
    return { ...row };
  }

  async setCurrent(id: string, isCurrent: boolean): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (row) row.isCurrent = isCurrent;
    // An unknown id is a no-op; setReference never passes a stale id.
  }
}
