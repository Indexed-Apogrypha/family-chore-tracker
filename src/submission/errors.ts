/**
 * Raised by `submitChore` when a chore has no current reference, so there is no
 * standard to judge a submission against (the parent hasn't set one — PRD
 * story 4). A precondition failure, not a verdict-able outcome — the sibling of
 * `JudgmentParseError` in the judge core. Thrown before anything is persisted.
 */
export class NoCurrentReferenceError extends Error {
  constructor(
    /** The chore that has no current reference. */
    readonly choreId: string,
  ) {
    super(`No current reference for chore "${choreId}"; set one before submitting.`);
    this.name = 'NoCurrentReferenceError';
  }
}
