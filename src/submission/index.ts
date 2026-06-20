// Public API of the submission module — orchestrates a child's chore submission:
// fetch the chore's current reference, judge the submission against it (the
// vendor seam), and persist the submission + verdict (PRD `submissionService`).
// `submitChore`/`getHistory` are free functions over the dumb `SubmissionStore`
// seam; `InMemorySubmissionStore` is the fully-working fake the rest of the app
// and the tests run against.
//
// Note: the live Supabase adapter (a future `./supabaseStore`,
// `SubmissionStore`-implementing `SupabaseSubmissionStore`) is intentionally NOT
// re-exported here, so importing the submission core never pulls in the Supabase
// SDK — the same discipline that keeps `./judge/gemini` and `SupabaseReferenceStore`
// out of their cores' public APIs.
export * from './types';
export * from './errors';
export * from './submissionService';
export * from './memoryStore';
