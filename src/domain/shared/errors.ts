import type { SubmissionId } from "./ids";

/**
 * The closed set of expected failures (design §8.2).
 *
 * Expected failures are returned as values inside {@link Result}, never thrown,
 * so the UI can handle them with compiler-checked exhaustiveness. Adapters may
 * throw on true infrastructure faults; use-cases catch and map those onto this
 * set (e.g. to `judge_unavailable`).
 */
export type AppError =
  | { code: "not_found"; entity: string; id: string }
  | { code: "forbidden"; need: "parent" | "kid" | "family_member" }
  | { code: "invalid_transition"; from: string; to: string }
  | { code: "bad_pin" }
  // The photo is stored and the submission left `evaluating`; `submissionId`
  // (when present) is the handle the caller retries against (§7.2).
  | { code: "judge_unavailable"; submissionId?: SubmissionId }
  // Infra faults from the photo-storage / persistence seams, caught in the
  // use-case and mapped onto values (§7.2, §8.2) instead of escaping as 500s.
  // Both mean "we couldn't durably save your work just now — try again."
  | { code: "storage_unavailable" }
  | { code: "persistence_unavailable" }
  | { code: "validation"; field: string; message: string };
