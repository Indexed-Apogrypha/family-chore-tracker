import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";

/**
 * Map a thrown **infrastructure** fault from a port call onto the closed
 * `AppError` set (design §8.2), so an expected failure stays a *value* the UI
 * handles exhaustively instead of escaping as an unhandled 500.
 *
 * Adapters may throw on true infra faults (a DB/storage outage); use-cases wrap
 * every port call in one of these so the throw becomes `persistence_unavailable`
 * / `storage_unavailable`. In keyless mode the in-memory adapters never throw, so
 * these are inert there — the seam exists for real mode, where Supabase is live.
 */

/** Run a persistence (repository) op; a thrown fault → `persistence_unavailable`. */
export async function persistOp<T>(op: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await op());
  } catch {
    return err({ code: "persistence_unavailable" });
  }
}

/** Run a photo-storage op; a thrown fault → `storage_unavailable`. */
export async function storeOp<T>(op: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await op());
  } catch {
    return err({ code: "storage_unavailable" });
  }
}
