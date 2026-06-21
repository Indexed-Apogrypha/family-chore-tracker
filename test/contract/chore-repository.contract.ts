import { describe, expect, it } from "vitest";

import type { ChoreInstance } from "@/domain/chore/types";
import { familyId, memberId, templateId } from "@/domain/shared/ids";
import type { TemplateId } from "@/domain/shared/ids";
import type { ChoreRepository } from "@/ports/repositories";

type GenInput = Omit<ChoreInstance, "id" | "status" | "templateId"> & {
  templateId: TemplateId;
};

const genInput = (over: Partial<GenInput> = {}): GenInput => ({
  familyId: familyId("f1"),
  templateId: templateId("t1"),
  title: "Dishes",
  points: 5,
  assignedMemberId: memberId("m1"),
  dueDate: "2026-06-21",
  ...over,
});

/**
 * The ChoreRepository contract (design §5, §6, §10). Pins the idempotent lazy
 * upsert that makes the "today board" safe to call repeatedly.
 */
export function runChoreRepositoryContract(
  label: string,
  makeRepo: () => ChoreRepository,
): void {
  describe(`ChoreRepository contract — ${label}`, () => {
    it("creates a template and lists it by family", async () => {
      const repo = makeRepo();
      const template = await repo.createTemplate({
        familyId: familyId("f1"),
        title: "Dishes",
        description: "after dinner",
        points: 5,
        recurrence: { kind: "daily" },
        assignedMemberId: memberId("m1"),
        active: true,
      });
      expect(
        (await repo.listTemplates(familyId("f1"))).map((t) => t.id),
      ).toEqual([template.id]);
    });

    it("upsertGeneratedInstance is idempotent on (template, member, dueDate)", async () => {
      const repo = makeRepo();
      const first = await repo.upsertGeneratedInstance(genInput());
      const second = await repo.upsertGeneratedInstance(genInput());
      expect(second.id).toBe(first.id);
      expect(first.status).toBe("todo");
      expect(await repo.listInstances(familyId("f1"), {})).toHaveLength(1);
    });

    it("treats a different member, dueDate, or template as a distinct instance", async () => {
      const repo = makeRepo();
      const a = await repo.upsertGeneratedInstance(genInput());
      const b = await repo.upsertGeneratedInstance(
        genInput({ assignedMemberId: memberId("m2") }),
      );
      const c = await repo.upsertGeneratedInstance(
        genInput({ dueDate: "2026-06-22" }),
      );
      const d = await repo.upsertGeneratedInstance(
        genInput({ templateId: templateId("t2") }),
      );
      expect(new Set([a.id, b.id, c.id, d.id]).size).toBe(4);
    });

    it("createOneOff makes a templateId-null instance outside the idempotency key", async () => {
      const repo = makeRepo();
      const base = {
        familyId: familyId("f1"),
        title: "Wash the car",
        points: 10,
        assignedMemberId: memberId("m1"),
        dueDate: "2026-06-21",
      };
      const a = await repo.createOneOff(base);
      const b = await repo.createOneOff(base);
      expect(a.templateId).toBeNull();
      expect(b.id).not.toBe(a.id);
    });

    it("listInstances filters by member and dueDate; getInstance is family-scoped", async () => {
      const repo = makeRepo();
      const a = await repo.upsertGeneratedInstance(genInput());
      await repo.upsertGeneratedInstance(
        genInput({
          templateId: templateId("t2"),
          assignedMemberId: memberId("m2"),
        }),
      );
      const forM1 = await repo.listInstances(familyId("f1"), {
        assignedMemberId: memberId("m1"),
      });
      expect(forM1.map((i) => i.id)).toEqual([a.id]);
      expect(await repo.getInstance(familyId("other"), a.id)).toBeNull();
    });

    it("setInstanceStatus transitions an instance", async () => {
      const repo = makeRepo();
      const a = await repo.upsertGeneratedInstance(genInput());
      await repo.setInstanceStatus(familyId("f1"), a.id, "evaluating");
      expect((await repo.getInstance(familyId("f1"), a.id))?.status).toBe(
        "evaluating",
      );
    });
  });
}
