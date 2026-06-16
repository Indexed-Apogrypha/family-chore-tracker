// Public API of the chore module — create and manage chores (PRD `choreService`;
// User Story 3). The thin entry point for the multi-chore future.
// `createChore`/`getChore`/`listChores` are free functions over the dumb
// `ChoreStore` seam; `InMemoryChoreStore` is the fully-working fake the rest of
// the app and the tests run against. `getChore` is the "assert a choreId is real"
// hook that reference/submission will wire in to replace their opaque-key
// treatment.
//
// Note: the live Supabase adapter (a future `./supabaseStore`,
// `SupabaseChoreStore`) is intentionally NOT re-exported here, so importing the
// chore core never pulls in the Supabase SDK — the same discipline that keeps
// `./judge/gemini`, `SupabaseReferenceStore`, and `SupabaseSubmissionStore` out
// of their cores' public APIs.
export * from './types';
export * from './errors';
export * from './choreService';
export * from './memoryStore';
