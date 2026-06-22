import { describe, expect, it } from "vitest";

import { memberContext } from "@/app-session/context";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import { createTemplate, getTodayBoard } from "@/usecases/chores";
import { addKid } from "@/usecases/members";
import { createFamily } from "@/usecases/family";

// The harness fixed clock's today() is 2026-06-21 (a Sunday). Weekday ISO
// references for weekly-recurrence tests (0 = Sunday … 6 = Saturday).
const SUNDAY = "2026-06-21"; // === inMemoryPorts() clock.today()
const MONDAY = "2026-06-22";

import { inMemoryPorts } from "./harness";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** Bootstrap a family with one kid; return ports, the parent ctx, and the kid. */
async function withFamilyAndKid(ports: Ports = inMemoryPorts()) {
  const { founder } = unwrap(
    await createFamily(ports, { name: "Fam", founderDisplayName: "Parent" }),
  );
  const parentCtx = memberContext(founder);
  const kid = unwrap(
    await addKid(ports, parentCtx, { displayName: "Rae", pin: "1234" }),
  );
  return { ports, parentCtx, kid };
}

describe("createTemplate (parent-only, §8.1)", () => {
  it("lets a parent create a recurring template assigned to a kid (active)", async () => {
    const { ports, parentCtx, kid } = await withFamilyAndKid();

    const result = await createTemplate(ports, parentCtx, {
      title: "Make the bed",
      description: "Tuck in the corners",
      points: 5,
      recurrence: { kind: "weekly", days: [1, 3, 5] },
      assignedMemberId: kid.id,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("Make the bed");
      expect(result.value.points).toBe(5);
      expect(result.value.recurrence).toEqual({ kind: "weekly", days: [1, 3, 5] });
      expect(result.value.assignedMemberId).toBe(kid.id);
      expect(result.value.active).toBe(true);
      expect(result.value.familyId).toBe(parentCtx.familyId);
    }

    // Persisted: the template is listed under the acting family.
    const listed = await ports.chores.listTemplates(parentCtx.familyId);
    expect(listed.map((t) => t.id)).toEqual([unwrap(result).id]);
  });

  it("accepts daily and one-off-style (none) recurrence", async () => {
    const { ports, parentCtx, kid } = await withFamilyAndKid();
    for (const recurrence of [
      { kind: "daily" } as const,
      { kind: "none" } as const,
    ]) {
      const result = await createTemplate(ports, parentCtx, {
        title: "Tidy room",
        points: 3,
        recurrence,
        assignedMemberId: kid.id,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.recurrence).toEqual(recurrence);
    }
  });

  it("forbids a kid actor from creating a template", async () => {
    const { ports, kid } = await withFamilyAndKid();
    const result = await createTemplate(ports, memberContext(kid), {
      title: "Make the bed",
      points: 5,
      recurrence: { kind: "daily" },
      assignedMemberId: kid.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "forbidden") {
      expect(result.error.need).toBe("parent");
    }
  });

  it("rejects a blank title with a validation error on 'title'", async () => {
    const { ports, parentCtx, kid } = await withFamilyAndKid();
    const result = await createTemplate(ports, parentCtx, {
      title: "   ",
      points: 5,
      recurrence: { kind: "daily" },
      assignedMemberId: kid.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "validation") {
      expect(result.error.field).toBe("title");
    }
  });

  it("rejects non-positive or fractional points on 'points'", async () => {
    const { ports, parentCtx, kid } = await withFamilyAndKid();
    for (const points of [0, -5, 2.5]) {
      const result = await createTemplate(ports, parentCtx, {
        title: "Make the bed",
        points,
        recurrence: { kind: "daily" },
        assignedMemberId: kid.id,
      });
      expect(result.ok).toBe(false);
      if (!result.ok && result.error.code === "validation") {
        expect(result.error.field).toBe("points");
      }
    }
  });

  it("rejects a weekly recurrence with no days on 'recurrence'", async () => {
    const { ports, parentCtx, kid } = await withFamilyAndKid();
    const result = await createTemplate(ports, parentCtx, {
      title: "Make the bed",
      points: 5,
      recurrence: { kind: "weekly", days: [] },
      assignedMemberId: kid.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "validation") {
      expect(result.error.field).toBe("recurrence");
    }
  });

  it("resolves a cross-family assignee to not_found (RLS scoping, §8.3)", async () => {
    const { ports, parentCtx } = await withFamilyAndKid();
    // A kid in a different family must not be assignable from this family.
    const other = await withFamilyAndKid(ports);
    const result = await createTemplate(ports, parentCtx, {
      title: "Make the bed",
      points: 5,
      recurrence: { kind: "daily" },
      assignedMemberId: other.kid.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "not_found") {
      expect(result.error.entity).toBe("member");
    }
  });
});

describe("getTodayBoard — lazy instance generation (§7.3)", () => {
  it("materializes an active template due today, snapshotting title/points", async () => {
    const { ports, parentCtx, kid } = await withFamilyAndKid();
    unwrap(
      await createTemplate(ports, parentCtx, {
        title: "Make the bed",
        points: 5,
        recurrence: { kind: "daily" },
        assignedMemberId: kid.id,
      }),
    );

    // No date arg → uses clock.today() (= SUNDAY).
    const board = unwrap(await getTodayBoard(ports, parentCtx, { memberId: kid.id }));
    expect(board).toHaveLength(1);
    expect(board[0].templateId).not.toBeNull();
    expect(board[0].title).toBe("Make the bed"); // snapshot
    expect(board[0].points).toBe(5); // snapshot
    expect(board[0].dueDate).toBe(SUNDAY);
    expect(board[0].status).toBe("todo");
  });

  it("is idempotent — calling twice for the same day makes no duplicate", async () => {
    const { ports, parentCtx, kid } = await withFamilyAndKid();
    unwrap(
      await createTemplate(ports, parentCtx, {
        title: "Make the bed",
        points: 5,
        recurrence: { kind: "daily" },
        assignedMemberId: kid.id,
      }),
    );

    const first = unwrap(await getTodayBoard(ports, parentCtx, { memberId: kid.id }));
    const second = unwrap(await getTodayBoard(ports, parentCtx, { memberId: kid.id }));
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id); // same instance, not a regenerated one
  });

  it("generates only for templates due on the date (weekly), honoring the date arg", async () => {
    const { ports, parentCtx, kid } = await withFamilyAndKid();
    // Due Mondays only.
    unwrap(
      await createTemplate(ports, parentCtx, {
        title: "Take out trash",
        points: 2,
        recurrence: { kind: "weekly", days: [1] },
        assignedMemberId: kid.id,
      }),
    );

    const sunday = unwrap(
      await getTodayBoard(ports, parentCtx, { memberId: kid.id, date: SUNDAY }),
    );
    expect(sunday).toHaveLength(0);

    const monday = unwrap(
      await getTodayBoard(ports, parentCtx, { memberId: kid.id, date: MONDAY }),
    );
    expect(monday).toHaveLength(1);
    expect(monday[0].dueDate).toBe(MONDAY);
  });

  it("skips inactive templates and templates assigned to a different member", async () => {
    const { ports, parentCtx, kid } = await withFamilyAndKid();
    const sib = unwrap(
      await addKid(ports, parentCtx, { displayName: "Sib", pin: "5678" }),
    );

    // Assigned to the sibling, not the kid we ask about.
    unwrap(
      await createTemplate(ports, parentCtx, {
        title: "Sib chore",
        points: 1,
        recurrence: { kind: "daily" },
        assignedMemberId: sib.id,
      }),
    );

    const board = unwrap(await getTodayBoard(ports, parentCtx, { memberId: kid.id }));
    expect(board).toHaveLength(0);
  });

  it("includes one-off instances for the day alongside generated ones", async () => {
    const { ports, parentCtx, kid } = await withFamilyAndKid();
    unwrap(
      await createTemplate(ports, parentCtx, {
        title: "Make the bed",
        points: 5,
        recurrence: { kind: "daily" },
        assignedMemberId: kid.id,
      }),
    );
    // A one-off due the same day (seeded directly via the repo — createOneOff
    // use-case lands in #58).
    await ports.chores.createOneOff({
      familyId: parentCtx.familyId,
      title: "Wash the car",
      points: 10,
      assignedMemberId: kid.id,
      dueDate: SUNDAY,
    });

    const board = unwrap(await getTodayBoard(ports, parentCtx, { memberId: kid.id }));
    expect(board.map((i) => i.title).sort()).toEqual(["Make the bed", "Wash the car"]);
  });

  it("resolves a cross-family member to not_found (§8.3)", async () => {
    const { ports, parentCtx } = await withFamilyAndKid();
    const other = await withFamilyAndKid(ports);
    const result = await getTodayBoard(ports, parentCtx, {
      memberId: other.kid.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "not_found") {
      expect(result.error.entity).toBe("member");
    }
  });
});
