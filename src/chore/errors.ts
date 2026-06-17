/**
 * Raised by `getChore` when no chore exists for the given id — the public
 * "assert this chore exists" failure, a precondition error and the sibling of
 * `NoCurrentReferenceError` in the submission module. This is the validation
 * hook `setReference` and `submitChore` now call before treating a `choreId` as
 * real, so neither versions a reference nor records a submission under a chore
 * that doesn't exist.
 */
export class ChoreNotFoundError extends Error {
  constructor(
    /** The chore id that did not resolve. */
    readonly choreId: string,
  ) {
    super(`No chore found for id "${choreId}".`);
    this.name = 'ChoreNotFoundError';
  }
}
