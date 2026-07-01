import type { ChoreInstance } from "@/domain/chore/types";
import type { LedgerEntry } from "@/domain/points/types";
import type { InstanceId, SubmissionId } from "@/domain/shared/ids";
import type { Submission } from "@/domain/submission/types";

/**
 * The collections the chore, submission, and points repos **share** so a
 * cross-aggregate op can touch them in one synchronous step — mirroring the
 * single Supabase DB. `recordVerdictAndAdvance` (§7.2) flips a submission and
 * its instance together; `recordDecisionAndSettle` (§7.1, #136) additionally
 * appends the points credit. The real adapter does each in one transaction
 * (an RPC); the in-memory adapter writes the maps without an interleaving await.
 *
 * The ledger is keyed by `submissionId` — the idempotency guarantee behind
 * "+points exactly once" (§6, §7.1), mirroring the Supabase unique constraint.
 *
 * Repos that don't span aggregates (members) keep their own state and don't
 * take a store. Each repo factory defaults to a fresh store, so a repo can
 * still be built standalone (the per-seam contracts); the composition root builds
 * ONE store and hands it to the chore + submission + points repos so they observe
 * each other's writes.
 */
export interface InMemoryStore {
  instances: Map<InstanceId, ChoreInstance>;
  submissions: Map<SubmissionId, Submission>;
  ledger: Map<SubmissionId, LedgerEntry>;
}

export function createInMemoryStore(): InMemoryStore {
  return { instances: new Map(), submissions: new Map(), ledger: new Map() };
}
