import type { ChoreInstance } from "@/domain/chore/types";
import type { InstanceId, SubmissionId } from "@/domain/shared/ids";
import type { Submission } from "@/domain/submission/types";

/**
 * The collections the chore and submission repos **share** so a cross-aggregate
 * op can touch both in one synchronous step — mirroring the single Supabase DB.
 * `recordVerdictAndAdvance` (§7.2) flips a submission and its instance together,
 * which the real adapter does in one transaction (RPC) and the in-memory adapter
 * does here by writing both maps without an interleaving await.
 *
 * Repos that don't span aggregates (members, points) keep their own state and
 * don't take a store. Each repo factory defaults to a fresh store, so a repo can
 * still be built standalone (the per-seam contracts); the composition root builds
 * ONE store and hands it to both repos so they observe each other's writes.
 */
export interface InMemoryStore {
  instances: Map<InstanceId, ChoreInstance>;
  submissions: Map<SubmissionId, Submission>;
}

export function createInMemoryStore(): InMemoryStore {
  return { instances: new Map(), submissions: new Map() };
}
