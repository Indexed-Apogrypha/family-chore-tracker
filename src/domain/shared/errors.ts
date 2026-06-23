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
  | { code: "validation"; field: string; message: string };
