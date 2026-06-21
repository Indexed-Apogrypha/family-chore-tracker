/**
 * Lifecycle states and recurrence shapes (design §6, §7.1).
 *
 * A `chore_instance` has no `rejected` state — rejection is terminal on the
 * *submission* and recycles the instance to `todo` for a fresh attempt.
 */
export type InstanceStatus = "todo" | "evaluating" | "pending_review" | "approved";

export type SubmissionStatus =
  | "evaluating"
  | "pending_review"
  | "approved"
  | "rejected";

/** One-off (`none`) or a repeating schedule that materializes dated instances. */
export type Recurrence =
  | { kind: "none" }
  | { kind: "daily" }
  | { kind: "weekly"; days: number[] };
