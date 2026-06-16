import type { Chore, ChoreDraft, ChoreStore } from './types';
import type { SupabaseContext } from '../supabase/client';

/**
 * Live `ChoreStore` backed by Supabase Postgres (the `chores` table). The
 * sibling of `judge/gemini.ts`: it implements the same dumb-CRUD port as
 * `InMemoryChoreStore`, so `choreService` and every caller cannot tell them
 * apart. Intentionally NOT exported from `./index`, so the chore core never
 * pulls in the Supabase SDK.
 *
 * The DB assigns `id`/`created_at` (defaults); we map snake_case rows to the
 * camelCase domain `Chore`.
 */
interface ChoreRow {
  id: string;
  name: string;
  created_at: string;
}

function mapChore(row: ChoreRow): Chore {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export class SupabaseChoreStore implements ChoreStore {
  // `familyId` is bound at construction (the container supplies the seeded
  // family), like `ctx`. The store stamps it on every write and filters every
  // read by it, so the dumb-CRUD port stays unchanged and tenancy is enforced in
  // the adapter even under the service-role key (which bypasses RLS).
  constructor(
    private readonly ctx: SupabaseContext,
    private readonly familyId: string,
  ) {}

  async add(draft: ChoreDraft): Promise<Chore> {
    const { data, error } = await this.ctx.client
      .from('chores')
      .insert({ name: draft.name, family_id: this.familyId })
      .select()
      .single();
    if (error || !data) {
      throw new Error(`Failed to insert chore: ${error?.message ?? 'no row returned'}`);
    }
    return mapChore(data as unknown as ChoreRow);
  }

  async getById(id: string): Promise<Chore | null> {
    const { data, error } = await this.ctx.client
      .from('chores')
      .select('*')
      .eq('id', id)
      .eq('family_id', this.familyId)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to load chore "${id}": ${error.message}`);
    }
    return data ? mapChore(data as unknown as ChoreRow) : null;
  }

  async list(): Promise<Chore[]> {
    const { data, error } = await this.ctx.client
      .from('chores')
      .select('*')
      .eq('family_id', this.familyId)
      .order('created_at', { ascending: true });
    if (error) {
      throw new Error(`Failed to list chores: ${error.message}`);
    }
    return ((data ?? []) as unknown as ChoreRow[]).map(mapChore);
  }
}
