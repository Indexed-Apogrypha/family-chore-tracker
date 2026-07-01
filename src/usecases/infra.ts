import type { Member } from "@/domain/family/types";
import type { FamilyId, MemberId } from "@/domain/shared/ids";
import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";

/**
 * Shared infra-fault mapping for every use-case (design §8.2, #134). Adapters
 * may throw on true infra faults; use-cases wrap each port call so a thrown
 * fault becomes a value from the closed `AppError` set — compiler-checked,
 * exhaustively handled by the UI — never an unhandled 500.
 *
 * In keyless mode the in-memory adapters never throw, so these are inert; on
 * the Supabase adapters they are the §8.2 guarantee.
 */

/**
 * Run a persistence op, mapping a thrown infra fault to `persistence_unavailable`
 * (§8.2). Reads and writes alike — a DB fault becomes a value the UI can handle,
 * not a 500.
 */
export async function persistOp<T>(op: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await op());
  } catch {
    return err({ code: "persistence_unavailable" });
  }
}

/**
 * Run a photo-storage op, mapping a thrown infra fault to the closed
 * `storage_unavailable` value (§8.2) — the photo isn't durable, so the caller
 * can retry rather than seeing a 500.
 */
export async function storeOp<T>(op: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await op());
  } catch {
    return err({ code: "storage_unavailable" });
  }
}

/**
 * Resolve a member of the acting family, or the expected failures: an unknown /
 * cross-family id is `not_found` (mirroring RLS, §8.3) and a thrown infra fault
 * is `persistence_unavailable`. The one place use-cases validate-and-resolve a
 * family member (#140).
 */
export async function requireFamilyMember(
  ports: Ports,
  familyId: FamilyId,
  id: MemberId,
): Promise<Result<Member>> {
  const memberR = await persistOp(() => ports.members.getMember(familyId, id));
  if (!memberR.ok) return memberR;
  if (!memberR.value) {
    return err({ code: "not_found", entity: "member", id });
  }
  return ok(memberR.value);
}
