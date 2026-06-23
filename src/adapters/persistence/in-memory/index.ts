// Keyless persistence adapters — the executable spec the Supabase adapters
// must match (design §5, §10). Wired at the composition root.
export { inMemoryChoreRepository } from "./chores";
export { inMemoryMemberRepository } from "./members";
export { inMemorySubmissionRepository } from "./submissions";
export { inMemoryPointsLedger } from "./points-ledger";
// Shared by the chore + submission repos so a cross-aggregate advance is atomic.
export { type InMemoryStore, createInMemoryStore } from "./store";
