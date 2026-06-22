import type { ChoreTemplate } from "@/domain/chore/types";
import type { Recurrence } from "@/domain/shared/enums";
import type { MemberId } from "@/domain/shared/ids";
import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import type { RequestContext } from "@/ports/context";

import { requireParent } from "./authz";
import {
  optionalDescription,
  requireName,
  requirePoints,
  requireRecurrence,
} from "./validation";

export interface CreateTemplateInput {
  title: string;
  description?: string;
  points: number;
  recurrence: Recurrence;
  assignedMemberId: MemberId;
}

/**
 * Create a recurring (or one-off-style) chore template under the acting family
 * (design §6, §8.1). Parent-only. The template is stored `active: true`; it
 * materializes dated instances lazily on read via `getTodayBoard` (§7.3).
 *
 * The assignee must be a member of the acting family — a cross-family or unknown
 * id resolves to `not_found`, mirroring RLS (§8.3).
 */
export async function createTemplate(
  ports: Ports,
  ctx: RequestContext,
  input: CreateTemplateInput,
): Promise<Result<ChoreTemplate>> {
  const gate = requireParent(ctx);
  if (!gate.ok) return gate;

  const title = requireName("title", input.title);
  if (!title.ok) return title;
  const description = optionalDescription(input.description);
  if (!description.ok) return description;
  const points = requirePoints(input.points);
  if (!points.ok) return points;
  const recurrence = requireRecurrence(input.recurrence);
  if (!recurrence.ok) return recurrence;

  const assignee = await ports.members.getMember(
    ctx.familyId,
    input.assignedMemberId,
  );
  if (!assignee) {
    return err({
      code: "not_found",
      entity: "member",
      id: input.assignedMemberId,
    });
  }

  const template = await ports.chores.createTemplate({
    familyId: ctx.familyId,
    title: title.value,
    description: description.value,
    points: points.value,
    recurrence: recurrence.value,
    assignedMemberId: input.assignedMemberId,
    active: true,
  });
  return ok(template);
}
