import type { Chore, ChoreDraft, ChoreStore } from './types';

/** Construction knobs for deterministic tests; both default to real sources. */
export interface InMemoryChoreStoreOptions {
  /** Id source. Defaults to a per-instance monotonic `chore-1`, `chore-2`, … */
  idFactory?: () => string;
  /** ISO 8601 clock. Defaults to `new Date().toISOString()`. */
  clock?: () => string;
}

/**
 * A fully-working in-memory `ChoreStore` — the persistence-side analog of
 * `FakeJudgeClient`/`InMemoryReferenceStore`. A single insertion-ordered array,
 * so `list` yields oldest→newest without depending on clock resolution. Returns
 * shallow `{ ...row }` copies so callers can't mutate stored rows. The live
 * `SupabaseChoreStore` (rows scoped by `family_id` for RLS) is a deferred
 * concern, like `ReferenceStore`'s.
 */
export class InMemoryChoreStore implements ChoreStore {
  private readonly rows: Chore[] = [];
  private seq = 0;
  private readonly idFactory: () => string;
  private readonly clock: () => string;

  constructor(options: InMemoryChoreStoreOptions = {}) {
    this.idFactory = options.idFactory ?? (() => `chore-${(this.seq += 1)}`);
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  async add(draft: ChoreDraft): Promise<Chore> {
    const row: Chore = {
      id: this.idFactory(),
      name: draft.name,
      createdAt: this.clock(),
    };
    this.rows.push(row);
    return { ...row };
  }

  async getById(id: string): Promise<Chore | null> {
    // Copy on read so callers can't mutate what the store holds.
    const row = this.rows.find((candidate) => candidate.id === id);
    return row ? { ...row } : null;
  }

  async list(): Promise<Chore[]> {
    return this.rows.map((row) => ({ ...row }));
  }
}
