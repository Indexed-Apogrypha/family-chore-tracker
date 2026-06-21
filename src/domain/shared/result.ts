import type { AppError } from "./errors";

/**
 * The result of a use-case: either a success value or an expected {@link AppError}
 * (design §8.2). Use-cases return `Result<T>` rather than throwing, so callers
 * handle the failure modes exhaustively.
 */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };

/** Wrap a success value. */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/**
 * Wrap an expected failure. Returns `Result<never>`, which is assignable to
 * `Result<T>` for any `T`, so a use-case of any return type can `return err(...)`.
 */
export function err(error: AppError): Result<never> {
  return { ok: false, error };
}
