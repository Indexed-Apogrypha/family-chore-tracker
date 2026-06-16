// Public API of the reference module — upload and version the clean-room
// reference photo (PRD `referenceService`). `referenceService` owns the
// `chore_references.isCurrent` invariant over the dumb `ReferenceStore` seam;
// `InMemoryReferenceStore` is the fully-working fake the rest of the app and the
// tests run against.
//
// Note: the live Supabase adapter (a future `./supabaseStore`,
// `SupabaseReferenceStore`) is intentionally NOT re-exported here, so importing
// the reference core never pulls in the Supabase SDK — the same discipline that
// keeps `./judge/gemini` out of the judging core's public API.
export * from './types';
export * from './referenceService';
export * from './memoryStore';
