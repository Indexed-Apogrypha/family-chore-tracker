import { describe, expect, it } from "vitest";

import type { ChoreTemplate } from "@/domain/chore/types";
import { familyId } from "@/domain/shared/ids";
import type { FamilyId, MemberId } from "@/domain/shared/ids";

import { type RepoHarness, seedFamilyAndKid } from "./harness";

const DUE = "2026-06-21";

/**
 * The ChoreRepository contract (design §5, §6, §10). Pins the idempotent lazy
 * upsert that makes the "today board" safe to call repeatedly.
 *
 * FK-valid: every test seeds a real family + member and uses repo-created
 * template ids, so the same suite runs verbatim against both the in-memory
 * adapter and the Supabase adapter (#117) — no synthetic, FK-violating ids.
 */
export function runChoreRepositoryContract(
  label: string,
  makeHarness: () => RepoHarness,
): void {
  describe(`ChoreRepository contract — ${label}`, () => {
    const makeTemplate = (
      h: RepoHarness,
      family: FamilyId,
      assignedMemberId: MemberId,
      over: Partial<Omit<ChoreTemplate, "id">> = {},
    ) =>
      h.chores.createTemplate({
        familyId: family,
        title: "Dishes",
        points: 5,
        recurrence: { kind: "daily" },
        assignedMemberId,
        active: true,
        ...over,
      });

    const gen = (family: FamilyId, templateId: string, assignedMemberId: MemberId) => ({
      familyId: family,
      templateId: templateId as ChoreTemplate["id"],
      title: "Dishes",
      points: 5,
      assignedMemberId,
      dueDate: DUE,
    });

    it("creates a template and lists it by family", async () => {
      const h = makeHarness();
      const { family, kid } = await seedFamilyAndKid(h);
      const template = await makeTemplate(h, family, kid, {
        description: "after dinner",
      });
      expect((await h.chores.listTemplates(family)).map((t) => t.id)).toEqual([
        template.id,
      ]);
    });

    it("round-trips an optional description snapshot on a generated instance (#115)", async () => {
      const h = makeHarness();
      const { family, kid } = await seedFamilyAndKid(h);
      const t1 = await makeTemplate(h, family, kid, { description: "after dinner" });
      const withDesc = await h.chores.upsertGeneratedInstance({
        ...gen(family, t1.id, kid),
        description: "after dinner",
      });
      expect(withDesc.description).toBe("after dinner");
      // A distinct template (different key) with no description → none snapshotted.
      const t2 = await makeTemplate(h, family, kid, { title: "Beds" });
      const plain = await h.chores.upsertGeneratedInstance(gen(family, t2.id, kid));
      expect(plain.description).toBeUndefined();
    });

    it("upsertGeneratedInstance is idempotent on (template, member, dueDate)", async () => {
      const h = makeHarness();
      const { family, kid } = await seedFamilyAndKid(h);
      const t = await makeTemplate(h, family, kid);
      const first = await h.chores.upsertGeneratedInstance(gen(family, t.id, kid));
      const second = await h.chores.upsertGeneratedInstance(gen(family, t.id, kid));
      expect(second.id).toBe(first.id);
      expect(first.status).toBe("todo");
      expect(await h.chores.listInstances(family, {})).toHaveLength(1);
    });

    it("treats a different member, dueDate, or template as a distinct instance", async () => {
      const h = makeHarness();
      const { family, kid } = await seedFamilyAndKid(h);
      const sib = (
        await h.members.addKid({ familyId: family, displayName: "Sib", pin: "9999" })
      ).id;
      const t1 = await makeTemplate(h, family, kid);
      const t2 = await makeTemplate(h, family, kid, { title: "Beds" });
      const a = await h.chores.upsertGeneratedInstance(gen(family, t1.id, kid));
      const b = await h.chores.upsertGeneratedInstance({
        ...gen(family, t1.id, kid),
        assignedMemberId: sib,
      });
      const c = await h.chores.upsertGeneratedInstance({
        ...gen(family, t1.id, kid),
        dueDate: "2026-06-22",
      });
      const d = await h.chores.upsertGeneratedInstance(gen(family, t2.id, kid));
      expect(new Set([a.id, b.id, c.id, d.id]).size).toBe(4);
    });

    it("createOneOff makes a templateId-null instance outside the idempotency key", async () => {
      const h = makeHarness();
      const { family, kid } = await seedFamilyAndKid(h);
      const base = {
        familyId: family,
        title: "Wash the car",
        points: 10,
        assignedMemberId: kid,
        dueDate: DUE,
      };
      const a = await h.chores.createOneOff(base);
      const b = await h.chores.createOneOff(base);
      expect(a.templateId).toBeNull();
      expect(b.id).not.toBe(a.id);
    });

    it("listInstances filters by member and dueDate; getInstance is family-scoped", async () => {
      const h = makeHarness();
      const { family, kid } = await seedFamilyAndKid(h);
      const sib = (
        await h.members.addKid({ familyId: family, displayName: "Sib", pin: "9999" })
      ).id;
      const t1 = await makeTemplate(h, family, kid);
      const t2 = await makeTemplate(h, family, kid, { title: "Beds" });
      const a = await h.chores.upsertGeneratedInstance(gen(family, t1.id, kid));
      await h.chores.upsertGeneratedInstance({
        ...gen(family, t2.id, kid),
        assignedMemberId: sib,
      });
      const forKid = await h.chores.listInstances(family, { assignedMemberId: kid });
      expect(forKid.map((i) => i.id)).toEqual([a.id]);
      expect(await h.chores.getInstance(familyId("other-family"), a.id)).toBeNull();
    });

    it("setTemplateActive flips the active flag and is family-scoped", async () => {
      const h = makeHarness();
      const { family, kid } = await seedFamilyAndKid(h);
      const template = await makeTemplate(h, family, kid);
      const deactivated = await h.chores.setTemplateActive(family, template.id, false);
      expect(deactivated?.active).toBe(false);
      expect((await h.chores.listTemplates(family))[0].active).toBe(false);
      // Cross-family writes resolve to null and mutate nothing (mirrors RLS).
      expect(
        await h.chores.setTemplateActive(familyId("other-family"), template.id, true),
      ).toBeNull();
      expect((await h.chores.listTemplates(family))[0].active).toBe(false);
    });

    it("setInstanceStatus transitions an instance", async () => {
      const h = makeHarness();
      const { family, kid } = await seedFamilyAndKid(h);
      const t = await makeTemplate(h, family, kid);
      const a = await h.chores.upsertGeneratedInstance(gen(family, t.id, kid));
      await h.chores.setInstanceStatus(family, a.id, "evaluating");
      expect((await h.chores.getInstance(family, a.id))?.status).toBe("evaluating");
    });
  });
}
