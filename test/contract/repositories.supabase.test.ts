import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { supabaseChoreRepository } from "@/adapters/persistence/supabase/chores";
import { supabaseMemberRepository } from "@/adapters/persistence/supabase/members";
import { supabasePointsLedger } from "@/adapters/persistence/supabase/points-ledger";
import { supabaseSubmissionRepository } from "@/adapters/persistence/supabase/submissions";
import { createServiceRoleClient } from "@/composition/supabase";
import { familyId, submissionId } from "@/domain/shared/ids";
import type { FamilyId, MemberId } from "@/domain/shared/ids";

/**
 * Live integration proof for the M6 Supabase repository adapters (design §5, §10):
 * they behave like the in-memory executable spec against the real schema + FKs.
 * Gated (`*.supabase.test.ts`, excluded from CI; run via `npm run test:supabase`).
 *
 * Unlike the in-memory contract suites (which use synthetic ids), this seeds a
 * real family + members via the member adapter so every foreign key is valid —
 * the structural reason the count-based shared contracts can't run verbatim here
 * (tracked as a follow-up). ⚠️ Wipes accounts + chore tables — dev project only.
 */
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env) to run the Supabase contract.",
  );
}

const client = createServiceRoleClient(url, serviceRoleKey);
const members = supabaseMemberRepository(client);
const chores = supabaseChoreRepository(client);
const submissions = supabaseSubmissionRepository(client);
const points = supabasePointsLedger(client);

const NO_ID = "00000000-0000-0000-0000-000000000000";
async function wipe(): Promise<void> {
  // Children first; families/members would cascade, but be explicit + ordered.
  await client.from("points_ledger").delete().neq("id", NO_ID);
  await client.from("submissions").delete().neq("id", NO_ID);
  await client.from("chore_instances").delete().neq("id", NO_ID);
  await client.from("chore_templates").delete().neq("id", NO_ID);
  await client.from("members").delete().neq("id", NO_ID);
  await client.from("families").delete().neq("id", NO_ID);
}

let family: FamilyId;
let parent: MemberId;
let kid: MemberId;

beforeEach(async () => {
  await wipe();
  const created = await members.createFamily({
    name: "Fam",
    founderDisplayName: "Parent",
  });
  family = created.family.id;
  parent = created.founder.id;
  kid = (await members.addKid({ familyId: family, displayName: "Rae", pin: "1234" }))
    .id;
});
afterAll(wipe);

describe("Supabase repositories — live integration (M6)", () => {
  it("chores: create/list templates (description round-trip), active toggle scoping", async () => {
    const template = await chores.createTemplate({
      familyId: family,
      title: "Dishes",
      description: "after dinner",
      points: 5,
      recurrence: { kind: "weekly", days: [1, 3, 5] },
      assignedMemberId: kid,
      active: true,
    });
    const listed = await chores.listTemplates(family);
    expect(listed.map((t) => t.id)).toEqual([template.id]);
    expect(listed[0].description).toBe("after dinner"); // text round-trip
    expect(listed[0].recurrence).toEqual({ kind: "weekly", days: [1, 3, 5] }); // jsonb round-trip

    const off = await chores.setTemplateActive(family, template.id, false);
    expect(off?.active).toBe(false);
    // Cross-family write resolves to null and mutates nothing (mirrors RLS).
    expect(await chores.setTemplateActive(familyId("nope"), template.id, true)).toBeNull();
    expect((await chores.listTemplates(family))[0].active).toBe(false);
  });

  it("chores: idempotent generated upsert; distinct member/dueDate/template; one-off; scoping; status", async () => {
    const sibling = (
      await members.addKid({ familyId: family, displayName: "Sib", pin: "9999" })
    ).id;
    const t1 = await chores.createTemplate({
      familyId: family,
      title: "Dishes",
      points: 5,
      recurrence: { kind: "daily" },
      assignedMemberId: kid,
      active: true,
    });
    const t2 = await chores.createTemplate({
      familyId: family,
      title: "Beds",
      points: 5,
      recurrence: { kind: "daily" },
      assignedMemberId: kid,
      active: true,
    });

    const gen = {
      familyId: family,
      templateId: t1.id,
      title: "Dishes",
      points: 5,
      assignedMemberId: kid,
      dueDate: "2026-06-21",
    };
    const first = await chores.upsertGeneratedInstance(gen);
    const second = await chores.upsertGeneratedInstance(gen);
    expect(second.id).toBe(first.id); // idempotent on (template, member, due_date)
    expect(first.status).toBe("todo");

    // A different member, due_date, or template is a distinct instance.
    const byMember = await chores.upsertGeneratedInstance({ ...gen, assignedMemberId: sibling });
    const byDate = await chores.upsertGeneratedInstance({ ...gen, dueDate: "2026-06-22" });
    const byTemplate = await chores.upsertGeneratedInstance({ ...gen, templateId: t2.id });
    expect(new Set([first.id, byMember.id, byDate.id, byTemplate.id]).size).toBe(4);

    const oneOff = {
      familyId: family,
      title: "Wash the car",
      points: 10,
      assignedMemberId: kid,
      dueDate: "2026-06-21",
    };
    const a = await chores.createOneOff(oneOff);
    const b = await chores.createOneOff(oneOff);
    expect(a.templateId).toBeNull();
    expect(b.id).not.toBe(a.id); // one-offs sit outside the idempotency key

    // listInstances filters by member; getInstance is family-scoped.
    expect((await chores.listInstances(family, { assignedMemberId: sibling })).map((i) => i.id)).toEqual([
      byMember.id,
    ]);
    expect(await chores.getInstance(familyId("does-not-exist"), first.id)).toBeNull();
    await chores.setInstanceStatus(family, first.id, "evaluating");
    expect((await chores.getInstance(family, first.id))?.status).toBe("evaluating");
  });

  it("submissions: create/get, verdict, status, parent decision, listByStatus", async () => {
    const instance = await chores.createOneOff({
      familyId: family,
      title: "Sweep",
      points: 7,
      assignedMemberId: kid,
      dueDate: "2026-06-21",
    });
    const id = submissionId(crypto.randomUUID());
    const created = await submissions.create({
      id,
      familyId: family,
      instanceId: instance.id,
      submittedBy: kid,
      photoPath: `${family}/${instance.id}/${id}.jpg`,
    });
    expect(created.status).toBe("evaluating");
    expect((await submissions.get(family, id))?.id).toBe(id);

    await submissions.recordVerdict(family, id, {
      pass: true,
      confidence: 0.8,
      reasoning: "looks clean",
      model: "fake",
    });
    await submissions.setStatus(family, id, "pending_review");
    expect(
      (await submissions.listByStatus(family, "pending_review")).map((s) => s.id),
    ).toEqual([id]);

    await submissions.recordDecision(family, id, {
      status: "approved",
      decidedBy: parent,
      decidedAt: "2026-06-21T10:00:00.000Z",
    });
    const decided = await submissions.get(family, id);
    expect(decided?.status).toBe("approved");
    expect(decided?.decidedBy).toBe(parent);
    expect(decided?.aiVerdict?.pass).toBe(true);
    // listByStatus excludes other statuses (it's now approved, not pending_review).
    expect(await submissions.listByStatus(family, "pending_review")).toHaveLength(0);
  });

  it("points: totalFor sums, idempotent on submission_id, family-scoped", async () => {
    const instance = await chores.createOneOff({
      familyId: family,
      title: "Tidy",
      points: 4,
      assignedMemberId: kid,
      dueDate: "2026-06-21",
    });
    const sid = submissionId(crypto.randomUUID());
    await submissions.create({
      id: sid,
      familyId: family,
      instanceId: instance.id,
      submittedBy: kid,
      photoPath: "p",
    });

    const entry = {
      familyId: family,
      memberId: kid,
      submissionId: sid,
      delta: 4,
      reason: "chore_approved" as const,
      createdAt: "2026-06-21T10:00:00.000Z",
    };
    await points.append(entry);
    await points.append(entry); // replay → no-op (unique on submission_id)
    expect(await points.totalFor(family, kid)).toBe(4);
    expect(await points.totalFor(familyId("does-not-exist"), kid)).toBe(0);
  });
});
