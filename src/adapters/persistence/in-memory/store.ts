import type { ChoreInstance } from "@/domain/chore/types";
import type { LedgerEntry } from "@/domain/points/types";
import type { InstanceId, SubmissionId } from "@/domain/shared/ids";
import type { Submission } from "@/domain/submission/types";

/**
 * The collections the chore, submission, and points repos **share** so a
 * cross-aggregate op can touch them in one synchronous step — mirroring the
 * single Supabase DB. `recordVerdictAndAdvance` (§7.2) flips a submission and its
 * instance together; `recordDecisionAndAdvance` (§7.1, #136) flips a submission,
 * its instance, AND the points ledger together. The real adapter does each in one
 * transaction (an RPC); the in-memory adapter does it here by writing the maps
 * without an interleaving await.
 *
 * The points ledger lives here (keyed by `submissionId`, the idempotency key) so
 * the parent's decision can credit points atomically with the status changes.
 * The member repo doesn't span aggregates and keeps its own state. Each repo
 * factory defaults to a fresh store, so a repo can still be built standalone (the
 * per-seam contracts); the composition root builds ONE store and hands it to all
 * three repos so they observe each other's writes.
 */
export interface InMemoryStore {
  instances: Map<InstanceId, ChoreInstance>;
  submissions: Map<SubmissionId, Submission>;
  ledger: Map<SubmissionId, LedgerEntry>;
}

export function createInMemoryStore(): InMemoryStore {
  return { instances: new Map(), submissions: new Map(), ledger: new Map() };
}
