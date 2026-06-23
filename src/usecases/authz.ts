import type { ChoreInstance } from "@/domain/chore/types";
import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { RequestContext } from "@/ports/context";

/**
 * Capability guards (design §8.3). Identity is proven at the edge; use-cases
 * enforce *what an actor may do* against `ctx.actor`. Expected refusals are
 * `forbidden` values, not exceptions, so the UI handles them exhaustively.
 *
 * Capability matrix:
 * - **parent-only:** `addKid`, `createTemplate`, `createOneOff`, `setTemplateActive`
 *   (also future `getReviewQueue`, `decide`).
 * - **owner-or-parent:** `submitPhoto`, `retrySubmission` — the acting kid must
 *   own the instance, or be a parent acting on their behalf (§7.2, §8.3).
 * - **any family member:** `listMembers`, `verifyKidPin`, `getTodayBoard`
 *   (also `pointsTotal`).
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

/**
 * Guard a submission action on a chore instance: a parent always passes; a kid
 * passes only when they own the instance (`assignedMemberId`). Otherwise refuse
 * with `forbidden('family_member')` — the instance is loaded family-scoped first,
 * so this is purely the *who-may-act* check, never an existence leak (§7.2, §8.3).
 */
export function requireOwnerOrParent(
  ctx: RequestContext,
  instance: ChoreInstance,
): Result<void> {
  if (ctx.actor.kind === "parent") return ok(undefined);
  if (instance.assignedMemberId === ctx.actor.memberId) return ok(undefined);
  return err({ code: "forbidden", need: "family_member" });
}
