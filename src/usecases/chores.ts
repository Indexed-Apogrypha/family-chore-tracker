import { isDue } from "@/domain/chore/recurrence";
import type { ChoreInstance, ChoreTemplate } from "@/domain/chore/types";
import type { Recurrence } from "@/domain/shared/enums";
import type { MemberId, TemplateId } from "@/domain/shared/ids";
import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import type { IsoDate } from "@/ports/clock";
import type { RequestContext } from "@/ports/context";

import { requireParent } from "./authz";
import {
  optionalDescription,
  requireDate,
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

export interface CreateOneOffInput {
  title: string;
  points: number;
  assignedMemberId: MemberId;
  dueDate: IsoDate;
}

/**
 * Create a one-off chore instance under the acting family (design §6). Parent-only.
 * The instance carries `templateId: null` and sits **outside** the lazy-generation
 * idempotency key, so `getTodayBoard` never duplicates or regenerates it.
 *
 * The assignee must be a member of the acting family — a cross-family or unknown
 * id resolves to `not_found`, mirroring RLS (§8.3).
 */
export async function createOneOff(
  ports: Ports,
  ctx: RequestContext,
  input: CreateOneOffInput,
): Promise<Result<ChoreInstance>> {
  const gate = requireParent(ctx);
  if (!gate.ok) return gate;

  const title = requireName("title", input.title);
  if (!title.ok) return title;
  const points = requirePoints(input.points);
  if (!points.ok) return points;
  const dueDate = requireDate("dueDate", input.dueDate);
  if (!dueDate.ok) return dueDate;

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

  const instance = await ports.chores.createOneOff({
    familyId: ctx.familyId,
    title: title.value,
    points: points.value,
    assignedMemberId: input.assignedMemberId,
    dueDate: dueDate.value,
  });
  return ok(instance);
}

export interface GetTodayBoardInput {
  /** Whose board to show — the active profile usually passes its own id. */
  memberId: MemberId;
  /** Defaults to `clock.today()`. */
  date?: IsoDate;
}

/**
 * The member's chore board for a day (design §7.3, §8.1). Materializes any
 * missing instances for that member's **active** templates **due** on `date`
 * — idempotently, via the `(template, member, dueDate)` upsert key — snapshotting
 * each template's title/points onto the instance. **This is the only operation
 * that generates instances**, and there is no cron in v1.
 *
 * Returns the day's instances (freshly generated templated ones plus any
 * one-offs), each carrying its lifecycle status. Any family member may call it;
 * a cross-family/unknown `memberId` resolves to `not_found` (§8.3).
 */
export async function getTodayBoard(
  ports: Ports,
  ctx: RequestContext,
  input: GetTodayBoardInput,
): Promise<Result<ChoreInstance[]>> {
  const member = await ports.members.getMember(ctx.familyId, input.memberId);
  if (!member) {
    return err({ code: "not_found", entity: "member", id: input.memberId });
  }

  const date = input.date ?? ports.clock.today();

  const templates = await ports.chores.listTemplates(ctx.familyId);
  for (const template of templates) {
    if (
      template.active &&
      template.assignedMemberId === input.memberId &&
      isDue(template, date)
    ) {
      await ports.chores.upsertGeneratedInstance({
        familyId: ctx.familyId,
        templateId: template.id,
        title: template.title, // snapshot at materialization
        points: template.points, // snapshot at materialization
        assignedMemberId: input.memberId,
        dueDate: date,
      });
    }
  }

  const board = await ports.chores.listInstances(ctx.familyId, {
    assignedMemberId: input.memberId,
    dueDate: date,
  });
  return ok(board);
}

/**
 * List the acting family's chore templates for parent management (design §6, §8).
 * Parent-only; scoped to `ctx.familyId`.
 */
export async function listTemplates(
  ports: Ports,
  ctx: RequestContext,
): Promise<Result<ChoreTemplate[]>> {
  const gate = requireParent(ctx);
  if (!gate.ok) return gate;

  const templates = await ports.chores.listTemplates(ctx.familyId);
  return ok(templates);
}

export interface SetTemplateActiveInput {
  templateId: TemplateId;
  active: boolean;
}

/**
 * Activate or deactivate a template (design §6, §7.3). Parent-only.
 * Deactivating stops future lazy generation — `getTodayBoard` skips inactive
 * templates. An unknown/cross-family template resolves to `not_found` (§8.3).
 */
export async function setTemplateActive(
  ports: Ports,
  ctx: RequestContext,
  input: SetTemplateActiveInput,
): Promise<Result<ChoreTemplate>> {
  const gate = requireParent(ctx);
  if (!gate.ok) return gate;

  const updated = await ports.chores.setTemplateActive(
    ctx.familyId,
    input.templateId,
    input.active,
  );
  if (!updated) {
    return err({ code: "not_found", entity: "template", id: input.templateId });
  }
  return ok(updated);
}
