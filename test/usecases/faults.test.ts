import { describe, expect, it } from "vitest";

import { memberContext } from "@/app-session/context";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
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

/**
 * Infra-fault mapping across EVERY use-case (design §8.2, #134): adapters may
 * throw on true infra faults; each use-case must map the throw to the closed
 * `AppError` set (`persistence_unavailable` / `storage_unavailable`) — a value
 * the UI handles exhaustively, never an unhandled 500.
 *
 * The in-memory adapters never throw, so these tests inject **throwing**
 * adapters — the seam that keyless-green CI was missing.
 */

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

function expectError<T>(result: Result<T>, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

const boom = () => {
  throw new Error("infra fault");
};

/** Override selected methods of one port with throwing fakes. */
function faulty<K extends keyof Ports>(
  ports: Ports,
  seam: K,
  methods: Array<keyof Ports[K]>,
): Ports {
  const overrides = Object.fromEntries(methods.map((m) => [m, boom]));
  return { ...ports, [seam]: { ...ports[seam], ...overrides } };
}

/** Seed a family + kid + a pending_review submission on healthy ports. */
async function seed() {
  const ports = inMemoryPorts();
  const { founder } = unwrap(
    await createFamily(ports, { name: "Fam", founderDisplayName: "Parent" }),
  );
  const parentCtx = memberContext(founder);
  const kid = unwrap(
    await addKid(ports, parentCtx, { displayName: "Rae", pin: "1234" }),
  );
  const kidCtx = memberContext(kid);
  const instance = unwrap(
    await createOneOff(ports, parentCtx, {
      title: "Sweep",
      points: 5,
      assignedMemberId: kid.id,
      dueDate: "2026-06-21",
    }),
  );
  const submission = unwrap(
    await submitPhoto(ports, kidCtx, {
      instanceId: instance.id,
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/jpeg",
    }),
  );
  return { ports, parentCtx, kid, kidCtx, instance, submission };
}

describe("infra faults map to persistence_unavailable (§8.2, #134)", () => {
  it("createFamily: thrown createFamily", async () => {
    const ports = faulty(inMemoryPorts(), "members", ["createFamily"]);
    expectError(
      await createFamily(ports, { name: "F", founderDisplayName: "P" }),
      "persistence_unavailable",
    );
  });

  it("createTemplate: thrown member lookup and thrown insert", async () => {
    const { ports, parentCtx, kid } = await seed();
    const input = {
      title: "Dishes",
      points: 3,
      recurrence: { kind: "daily" } as const,
      assignedMemberId: kid.id,
    };
    expectError(
      await createTemplate(faulty(ports, "members", ["getMember"]), parentCtx, input),
      "persistence_unavailable",
    );
    expectError(
      await createTemplate(faulty(ports, "chores", ["createTemplate"]), parentCtx, input),
      "persistence_unavailable",
    );
  });

  it("createOneOff: thrown insert", async () => {
    const { ports, parentCtx, kid } = await seed();
    expectError(
      await createOneOff(faulty(ports, "chores", ["createOneOff"]), parentCtx, {
        title: "Bins",
        points: 2,
        assignedMemberId: kid.id,
        dueDate: "2026-06-21",
      }),
      "persistence_unavailable",
    );
  });

  it("getTodayBoard: thrown template listing and thrown instance listing", async () => {
    const { ports, kidCtx, kid } = await seed();
    const input = { memberId: kid.id };
    expectError(
      await getTodayBoard(faulty(ports, "chores", ["listTemplates"]), kidCtx, input),
      "persistence_unavailable",
    );
    expectError(
      await getTodayBoard(faulty(ports, "chores", ["listInstances"]), kidCtx, input),
      "persistence_unavailable",
    );
  });

  it("listTemplates / setTemplateActive: thrown reads and writes", async () => {
    const { ports, parentCtx } = await seed();
    expectError(
      await listTemplates(faulty(ports, "chores", ["listTemplates"]), parentCtx),
      "persistence_unavailable",
    );
    const template = unwrap(
      await createTemplate(ports, parentCtx, {
        title: "Laundry",
        points: 4,
        recurrence: { kind: "daily" },
        assignedMemberId: parentCtx.actor.memberId,
      }),
    );
    expectError(
      await setTemplateActive(
        faulty(ports, "chores", ["setTemplateActive"]),
        parentCtx,
        { templateId: template.id, active: false },
      ),
      "persistence_unavailable",
    );
  });

  it("addKid / listMembers / verifyKidPin: thrown member repo", async () => {
    const { ports, parentCtx, kid, kidCtx } = await seed();
    expectError(
      await addKid(faulty(ports, "members", ["addKid"]), parentCtx, {
        displayName: "Sib",
        pin: "9999",
      }),
      "persistence_unavailable",
    );
    expectError(
      await listMembers(faulty(ports, "members", ["listMembers"]), kidCtx),
      "persistence_unavailable",
    );
    expectError(
      await verifyKidPin(faulty(ports, "members", ["verifyKidPin"]), parentCtx, {
        memberId: kid.id,
        pin: "1234",
      }),
      "persistence_unavailable",
    );
  });

  it("switchProfile: thrown lookup and thrown PIN verify", async () => {
    const { ports, parentCtx, kid } = await seed();
    expectError(
      await switchProfile(faulty(ports, "members", ["getMember"]), parentCtx, {
        memberId: kid.id,
        pin: "1234",
      }),
      "persistence_unavailable",
    );
    expectError(
      await switchProfile(faulty(ports, "members", ["verifyKidPin"]), parentCtx, {
        memberId: kid.id,
        pin: "1234",
      }),
      "persistence_unavailable",
    );
  });

  it("pointsTotal: thrown ledger sum", async () => {
    const { ports, kidCtx, kid } = await seed();
    expectError(
      await pointsTotal(faulty(ports, "points", ["totalFor"]), kidCtx, {
        memberId: kid.id,
      }),
      "persistence_unavailable",
    );
  });

  it("findActingParent: thrown auth-user lookup", async () => {
    const ports = faulty(inMemoryPorts(), "members", ["findByAuthUserId"]);
    expectError(await findActingParent(ports, "auth-user"), "persistence_unavailable");
  });

  it("getReviewQueue: thrown listing → persistence; thrown signed URL → storage", async () => {
    const { ports, parentCtx } = await seed();
    expectError(
      await getReviewQueue(faulty(ports, "submissions", ["listByStatus"]), parentCtx),
      "persistence_unavailable",
    );
    expectError(
      await getReviewQueue(faulty(ports, "photos", ["signedUrl"]), parentCtx),
      "storage_unavailable",
    );
  });

  it("decide: thrown atomic settle — the parent sees a retryable value, not a 500", async () => {
    const { ports, parentCtx, submission } = await seed();
    expectError(
      await decide(
        faulty(ports, "submissions", ["recordDecisionAndSettle"]),
        parentCtx,
        { submissionId: submission.id, decision: "approve" },
      ),
      "persistence_unavailable",
    );
    // Nothing half-committed: the submission is still pending_review, so the
    // parent can simply retry the decision.
    const still = await ports.submissions.get(parentCtx.familyId, submission.id);
    expect(still?.status).toBe("pending_review");
  });
});
