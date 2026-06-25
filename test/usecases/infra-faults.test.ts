import { describe, expect, it } from "vitest";

import { memberContext } from "@/app-session/context";
import { familyId, memberId, submissionId, templateId } from "@/domain/shared/ids";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import type { RequestContext } from "@/ports/context";
import type { PhotoStorage } from "@/ports/photo-storage";
import type {
  ChoreRepository,
  MemberRepository,
  PointsLedger,
  SubmissionRepository,
} from "@/ports/repositories";
import { findActingParent } from "@/usecases/auth";
import {
  createOneOff,
  createTemplate,
  getTodayBoard,
  listTemplates,
  setTemplateActive,
} from "@/usecases/chores";
import { createFamily } from "@/usecases/family";
import { addKid, listMembers, verifyKidPin } from "@/usecases/members";
import { pointsTotal } from "@/usecases/points";
import { switchProfile } from "@/usecases/profile";
import { decide, getReviewQueue } from "@/usecases/review";
import { submitPhoto } from "@/usecases/submission";

import { inMemoryPorts } from "./harness";

const PHOTO = new Uint8Array([1, 2, 3]);

/**
 * Infra-fault mapping (#134, spec §8.2). In keyless mode the in-memory adapters
 * never throw, so every use-case's fault-mapping is invisible to the rest of the
 * suite — this is the missing test seam. We inject adapters whose every method
 * throws (the real-mode failure: a transient Supabase/storage fault) and assert
 * the use-case returns the mapped AppError value, not a raw 500.
 */
function throwing<T extends object>(): T {
  return new Proxy({} as T, {
    get: () => async () => {
      throw new Error("infra down");
    },
  });
}

/** Real clock/judge, but every persistence + storage seam faults. */
function allDown(): Ports {
  return {
    ...inMemoryPorts(),
    members: throwing<MemberRepository>(),
    chores: throwing<ChoreRepository>(),
    submissions: throwing<SubmissionRepository>(),
    points: throwing<PointsLedger>(),
    photos: throwing<PhotoStorage>(),
  };
}

function expectError<T>(result: Result<T>) {
  if (result.ok) {
    throw new Error(`expected an error, got ${JSON.stringify(result.value)}`);
  }
  return result.error;
}

const parentCtx: RequestContext = {
  familyId: familyId("fam"),
  actor: { kind: "parent", memberId: memberId("parent") },
};

describe("use-cases map a thrown persistence fault to persistence_unavailable (#134)", () => {
  it("createFamily", async () => {
    const error = expectError(
      await createFamily(allDown(), { name: "Fam", founderDisplayName: "P" }),
    );
    expect(error.code).toBe("persistence_unavailable");
  });

  it("findActingParent", async () => {
    expect(expectError(await findActingParent(allDown(), "auth-1")).code).toBe(
      "persistence_unavailable",
    );
  });

  it("addKid", async () => {
    const error = expectError(
      await addKid(allDown(), parentCtx, { displayName: "Rae", pin: "1234" }),
    );
    expect(error.code).toBe("persistence_unavailable");
  });

  it("listMembers", async () => {
    expect(expectError(await listMembers(allDown(), parentCtx)).code).toBe(
      "persistence_unavailable",
    );
  });

  it("verifyKidPin", async () => {
    const error = expectError(
      await verifyKidPin(allDown(), parentCtx, {
        memberId: memberId("kid"),
        pin: "1234",
      }),
    );
    expect(error.code).toBe("persistence_unavailable");
  });

  it("switchProfile", async () => {
    const error = expectError(
      await switchProfile(allDown(), parentCtx, { memberId: memberId("kid") }),
    );
    expect(error.code).toBe("persistence_unavailable");
  });

  it("createTemplate (resolving the assignee)", async () => {
    const error = expectError(
      await createTemplate(allDown(), parentCtx, {
        title: "Dishes",
        points: 5,
        recurrence: { kind: "none" },
        assignedMemberId: memberId("kid"),
      }),
    );
    expect(error.code).toBe("persistence_unavailable");
  });

  it("createOneOff (resolving the assignee)", async () => {
    const error = expectError(
      await createOneOff(allDown(), parentCtx, {
        title: "Dishes",
        points: 5,
        assignedMemberId: memberId("kid"),
        dueDate: "2026-06-21",
      }),
    );
    expect(error.code).toBe("persistence_unavailable");
  });

  it("listTemplates", async () => {
    expect(expectError(await listTemplates(allDown(), parentCtx)).code).toBe(
      "persistence_unavailable",
    );
  });

  it("setTemplateActive", async () => {
    const error = expectError(
      await setTemplateActive(allDown(), parentCtx, {
        templateId: templateId("t1"),
        active: false,
      }),
    );
    expect(error.code).toBe("persistence_unavailable");
  });

  it("getTodayBoard", async () => {
    const error = expectError(
      await getTodayBoard(allDown(), parentCtx, { memberId: memberId("parent") }),
    );
    expect(error.code).toBe("persistence_unavailable");
  });

  it("pointsTotal", async () => {
    const error = expectError(
      await pointsTotal(allDown(), parentCtx, { memberId: memberId("parent") }),
    );
    expect(error.code).toBe("persistence_unavailable");
  });

  it("getReviewQueue", async () => {
    expect(expectError(await getReviewQueue(allDown(), parentCtx)).code).toBe(
      "persistence_unavailable",
    );
  });

  it("decide", async () => {
    const error = expectError(
      await decide(allDown(), parentCtx, {
        submissionId: submissionId("s1"),
        decision: "approve",
      }),
    );
    expect(error.code).toBe("persistence_unavailable");
  });
});

describe("use-cases map a thrown storage fault to storage_unavailable (#134)", () => {
  it("submitPhoto when photos.put faults", async () => {
    const ports = inMemoryPorts();
    const { founder } = unwrap(
      await createFamily(ports, { name: "Fam", founderDisplayName: "Parent" }),
    );
    const parent = memberContext(founder);
    const instance = unwrap(
      await createOneOff(ports, parent, {
        title: "Sweep",
        points: 5,
        assignedMemberId: founder.id,
        dueDate: "2026-06-21",
      }),
    );

    const storageDown: Ports = { ...ports, photos: throwing<PhotoStorage>() };
    const error = expectError(
      await submitPhoto(storageDown, parent, {
        instanceId: instance.id,
        bytes: PHOTO,
        contentType: "image/jpeg",
      }),
    );
    expect(error.code).toBe("storage_unavailable");
  });

  it("getReviewQueue when photos.signedUrl faults", async () => {
    const ports = inMemoryPorts();
    const { founder } = unwrap(
      await createFamily(ports, { name: "Fam", founderDisplayName: "Parent" }),
    );
    const parent = memberContext(founder);
    const instance = unwrap(
      await createOneOff(ports, parent, {
        title: "Sweep",
        points: 5,
        assignedMemberId: founder.id,
        dueDate: "2026-06-21",
      }),
    );
    unwrap(
      await submitPhoto(ports, parent, {
        instanceId: instance.id,
        bytes: PHOTO,
        contentType: "image/jpeg",
      }),
    );

    const storageDown: Ports = { ...ports, photos: throwing<PhotoStorage>() };
    expect(expectError(await getReviewQueue(storageDown, parent)).code).toBe(
      "storage_unavailable",
    );
  });
});

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}
