// Keyless persistence adapters — the executable spec the Supabase adapters
// must match (design §5, §10). Wired at the composition root.
export { inMemoryChoreRepository } from "./chores";
export { inMemoryMemberRepository } from "./members";
export { inMemorySubmissionRepository } from "./submissions";
export { inMemoryPointsLedger } from "./points-ledger";
