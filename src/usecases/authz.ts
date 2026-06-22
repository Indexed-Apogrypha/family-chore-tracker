import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { RequestContext } from "@/ports/context";

/**
 * Capability guards (design §8.3). Identity is proven at the edge; use-cases
 * enforce *what an actor may do* against `ctx.actor`. Expected refusals are
 * `forbidden` values, not exceptions, so the UI handles them exhaustively.
 *
 * Capability matrix (M1):
 * - **parent-only:** `addKid` (also future `createTemplate`, `createOneOff`,
 *   `getReviewQueue`, `decide`).
 * - **any family member:** `listMembers`, `verifyKidPin` (also `getTodayBoard`,
 *   `pointsTotal`).
 *
 * Family scoping is enforced separately: every use-case passes `ctx.familyId`
 * to the family-scoped repositories, so cross-family ids resolve to
 * `null`/`not_found` (mirrors Supabase RLS).
 */
export function requireParent(ctx: RequestContext): Result<void> {
  if (ctx.actor.kind !== "parent") {
    return err({ code: "forbidden", need: "parent" });
  }
  return ok(undefined);
}
