import type { MemberId } from "@/domain/shared/ids";
import { ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { IsoInstant } from "@/ports/clock";
import type { Ports } from "@/ports";
import type { RequestContext } from "@/ports/context";

import { persistOp, requireFamilyMember } from "./infra";

export interface PointsTotalInput {
  memberId: MemberId;
}

/**
 * A member's running points total (design §8.1) — the sum of their approved-chore
 * ledger credits (there is no mutable balance, §6). Any family member may read it
 * (parent or kid); family-scoped, so an unknown or cross-family member resolves
 * to `not_found`, never leaking another family's total (§9).
 */
export async function pointsTotal(
  ports: Ports,
  ctx: RequestContext,
  input: PointsTotalInput,
): Promise<Result<number>> {
  const member = await requireFamilyMember(ports, ctx.familyId, input.memberId);
  if (!member.ok) return member;
  return persistOp(() => ports.points.totalFor(ctx.familyId, input.memberId));
}

export interface PointsHistoryInput {
  memberId: MemberId;
}

/** One earned credit, resolved for display (§6, §8.1). */
export interface PointsHistoryItem {
  /** The chore's title at submission time (snapshot on the instance). */
  choreTitle: string;
  delta: number;
  earnedAt: IsoInstant;
}

/**
 * A member's earning history (design §6, §8.1): the append-only ledger behind
 * `pointsTotal`, newest first, each credit resolved to the chore title it was
 * earned for. Any family member may read it; family-scoped, so an unknown or
 * cross-family member resolves to `not_found` (§9).
 */
export async function pointsHistory(
  ports: Ports,
  ctx: RequestContext,
  input: PointsHistoryInput,
): Promise<Result<PointsHistoryItem[]>> {
  const member = await requireFamilyMember(ports, ctx.familyId, input.memberId);
  if (!member.ok) return member;

  const entriesR = await persistOp(() =>
    ports.points.listFor(ctx.familyId, input.memberId),
  );
  if (!entriesR.ok) return entriesR;

  const items: PointsHistoryItem[] = [];
  for (const entry of entriesR.value) {
    // Resolve the credit's chore title via its submission → instance snapshot.
    // Display-only: a missing row (e.g. GC'd) falls back rather than failing.
    const resolvedR = await persistOp(async () => {
      const submission = await ports.submissions.get(
        ctx.familyId,
        entry.submissionId,
      );
      if (!submission) return undefined;
      const instance = await ports.chores.getInstance(
        ctx.familyId,
        submission.instanceId,
      );
      return instance?.title;
    });
    if (!resolvedR.ok) return resolvedR;
    items.push({
      choreTitle: resolvedR.value ?? "Chore",
      delta: entry.delta,
      earnedAt: entry.createdAt,
    });
  }
  return ok(items);
}
