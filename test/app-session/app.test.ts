import { describe, expect, it } from "vitest";

import { makeApp } from "@/app-session/app";
import type { EnvConfig } from "@/composition/env";
import { buildPorts } from "@/composition/container";
import { familyId, memberId } from "@/domain/shared/ids";

const keyless: EnvConfig = {
  judge: { provider: "fake" },
  persistence: { kind: "in-memory" },
};
const app = () => makeApp(buildPorts(keyless));

describe("makeApp (keyless boot)", () => {
  it("bootstraps a family + founding parent via createFamily (no ctx, §4.2)", async () => {
    const result = await app().createFamily({
      name: "The Harpers",
      founderDisplayName: "Sam",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.family.name).toBe("The Harpers");
      expect(result.value.founder.kind).toBe("parent");
      expect(result.value.founder.familyId).toBe(result.value.family.id);
    }
  });

  it("as(ctx) binds a request context and returns a session", () => {
    const session = app().as({
      familyId: familyId("f1"),
      actor: { kind: "parent", memberId: memberId("m1") },
    });
    expect(session.ctx.actor.kind).toBe("parent");
    expect(session.ctx.familyId).toBe(familyId("f1"));
  });

  it("exposes switchProfile, delegating active-profile selection (§3.1)", async () => {
    const a = app();
    const created = await a.createFamily({
      name: "Fam",
      founderDisplayName: "Parent",
    });
    if (!created.ok) throw new Error("setup failed");
    const { family, founder } = created.value;
    const session = a.as({
      familyId: family.id,
      actor: { kind: "parent", memberId: founder.id },
    });
    const kid = await session.addKid({ displayName: "Rae", pin: "1234" });
    if (!kid.ok) throw new Error("addKid failed");

    const toKid = await session.switchProfile({
      memberId: kid.value.id,
      pin: "1234",
    });
    expect(toKid.ok).toBe(true);
    if (toKid.ok) expect(toKid.value.id).toBe(kid.value.id);

    const toParent = await session.switchProfile({ memberId: founder.id });
    expect(toParent.ok).toBe(true);
    if (toParent.ok) expect(toParent.value.kind).toBe("parent");
  });

  it("exposes createTemplate, delegating to the parent-only use-case (§8.1)", async () => {
    const a = app();
    const created = await a.createFamily({
      name: "Fam",
      founderDisplayName: "Parent",
    });
    if (!created.ok) throw new Error("setup failed");
    const { family, founder } = created.value;
    const session = a.as({
      familyId: family.id,
      actor: { kind: "parent", memberId: founder.id },
    });
    const kid = await session.addKid({ displayName: "Rae", pin: "1234" });
    if (!kid.ok) throw new Error("addKid failed");

    const template = await session.createTemplate({
      title: "Make the bed",
      points: 5,
      recurrence: { kind: "daily" },
      assignedMemberId: kid.value.id,
    });
    expect(template.ok).toBe(true);
    if (template.ok) {
      expect(template.value.active).toBe(true);
      expect(template.value.assignedMemberId).toBe(kid.value.id);
    }

    // A one-off due a chosen day; the daily template is due every day, so an
    // explicit board date keeps this deterministic under the system clock.
    const day = "2026-06-21";
    const oneOff = await session.createOneOff({
      title: "Wash the car",
      points: 10,
      assignedMemberId: kid.value.id,
      dueDate: day,
    });
    expect(oneOff.ok).toBe(true);
    if (oneOff.ok) expect(oneOff.value.templateId).toBeNull();

    // The daily template + the one-off materialize onto the board for that day.
    const board = await session.getTodayBoard({ memberId: kid.value.id, date: day });
    expect(board.ok).toBe(true);
    if (board.ok) {
      expect(board.value.map((i) => i.title).sort()).toEqual([
        "Make the bed",
        "Wash the car",
      ]);
    }
  });
});
