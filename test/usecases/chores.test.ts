import { describe, expect, it } from "vitest";

import { memberContext } from "@/app-session/context";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import { createTemplate } from "@/usecases/chores";
import { addKid } from "@/usecases/members";
import { createFamily } from "@/usecases/family";

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
