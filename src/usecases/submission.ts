import type { ChoreInstance } from "@/domain/chore/types";
import { submissionId } from "@/domain/shared/ids";
import type { InstanceId, SubmissionId } from "@/domain/shared/ids";
import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { Submission } from "@/domain/submission/types";
import type { Ports } from "@/ports";
import type { RequestContext } from "@/ports/context";
import type { Verdict } from "@/ports/judge";

import { requireOwnerOrParent } from "./authz";

export interface SubmitPhotoInput {
  instanceId: InstanceId;
  /** Raw photo bytes — the HTTP layer reads these from the upload. */
  bytes: Uint8Array;
  /** MIME type the storage adapter uses to pick the file extension. */
  contentType: string;
}

export interface RetrySubmissionInput {
  submissionId: SubmissionId;
}

/**
 * A kid submits a chore photo (design §7.2 — **ordering is part of the contract**):
 *
 * 1. `PhotoStorage.put(bytes)` → `PhotoRef`
 * 2. create `Submission(evaluating)`; instance → `evaluating` (persist first)
 * 3. `JudgePort.evaluate` → `Verdict`
 * 4. attach verdict; submission + instance → `pending_review`
 *
 * Owner-or-parent: the acting kid must own the instance, or be a parent (§8.3).
 * If the judge faults the submission **stays `evaluating`** with the photo kept
 * and `judge_unavailable` surfaced — the only exit is {@link retrySubmission}.
 */
export async function submitPhoto(
  ports: Ports,
  ctx: RequestContext,
  input: SubmitPhotoInput,
): Promise<Result<Submission>> {
  const instanceR = await persistOp(() =>
    ports.chores.getInstance(ctx.familyId, input.instanceId),
  );
  if (!instanceR.ok) return instanceR;
  const instance = instanceR.value;
  if (!instance) {
    return err({ code: "not_found", entity: "instance", id: input.instanceId });
  }

  const gate = requireOwnerOrParent(ctx, instance);
  if (!gate.ok) return gate;

  if (input.contentType.trim().length === 0) {
    return err({
      code: "validation",
      field: "contentType",
      message: "contentType is required.",
    });
  }

  // Mint the id up front: the photo path is keyed on it (§9) and the spec orders
  // `put` before `create` (§7.2), so both calls share this single source of truth.
  const id = submissionId(crypto.randomUUID());
  const refR = await storeOp(() =>
    ports.photos.put(input.bytes, {
      familyId: ctx.familyId,
      instanceId: input.instanceId,
      submissionId: id,
      contentType: input.contentType,
    }),
  );
  if (!refR.ok) return refR; // photo never stored; nothing to clean up
  const ref = refR.value;

  // Persist first — the photo is durable and the state recorded before the
  // fallible judge runs. A fault here leaves a stored blob with no row; that
  // orphan is reclaimable by the documented GC (§9), not a correctness bug.
  const persisted = await persistOp(async () => {
    await ports.submissions.create({
      id,
      familyId: ctx.familyId,
      instanceId: input.instanceId,
      submittedBy: ctx.actor.memberId,
      photoPath: ref.path,
    });
    await ports.chores.setInstanceStatus(
      ctx.familyId,
      input.instanceId,
      "evaluating",
    );
  });
  if (!persisted.ok) return persisted;

  const verdict = await runJudge(ports, ref.path, instance, id);
  if (!verdict.ok) return verdict; // stays evaluating; photo kept; retry via `id`

  return advanceToPendingReview(ports, ctx, id, input.instanceId, verdict.value);
}

/**
 * Re-run the judge on a submission stuck in `evaluating` (the only exit from that
 * state, §7.2). The photo is reused — never re-stored. Owner-or-parent. A retry
 * on any other status is an `invalid_transition`.
 */
export async function retrySubmission(
  ports: Ports,
  ctx: RequestContext,
  input: RetrySubmissionInput,
): Promise<Result<Submission>> {
  const submissionR = await persistOp(() =>
    ports.submissions.get(ctx.familyId, input.submissionId),
  );
  if (!submissionR.ok) return submissionR;
  const submission = submissionR.value;
  if (!submission) {
    return err({
      code: "not_found",
      entity: "submission",
      id: input.submissionId,
    });
  }

  const instanceR = await persistOp(() =>
    ports.chores.getInstance(ctx.familyId, submission.instanceId),
  );
  if (!instanceR.ok) return instanceR;
  const instance = instanceR.value;
  if (!instance) {
    return err({
      code: "not_found",
      entity: "instance",
      id: submission.instanceId,
    });
  }

  const gate = requireOwnerOrParent(ctx, instance);
  if (!gate.ok) return gate;

  if (submission.status !== "evaluating") {
    return err({
      code: "invalid_transition",
      from: submission.status,
      to: "pending_review",
    });
  }

  const verdict = await runJudge(ports, submission.photoPath, instance, submission.id);
  if (!verdict.ok) return verdict; // still evaluating; try again later

  return advanceToPendingReview(
    ports,
    ctx,
    submission.id,
    submission.instanceId,
    verdict.value,
  );
}

/**
 * Step 3 of the contract: ask the advisory judge for a verdict. A thrown infra
 * fault becomes the expected `judge_unavailable` value (§8.2), carrying the
 * `submissionId` so the caller can retry that exact submission — the photo is
 * never lost and the submission stays `evaluating`.
 */
async function runJudge(
  ports: Ports,
  photoPath: string,
  instance: ChoreInstance,
  submissionId: SubmissionId,
): Promise<Result<Verdict>> {
  try {
    const verdict = await ports.judge.evaluate(
      { path: photoPath },
      {
        title: instance.title,
        // pass the snapshotted description through when present (#115)
        ...(instance.description !== undefined
          ? { description: instance.description }
          : {}),
      },
    );
    return ok(verdict);
  } catch {
    return err({ code: "judge_unavailable", submissionId });
  }
}

/** Step 4: attach the verdict and move submission + instance to `pending_review`. */
async function advanceToPendingReview(
  ports: Ports,
  ctx: RequestContext,
  id: SubmissionId,
  instanceId: InstanceId,
  verdict: Verdict,
): Promise<Result<Submission>> {
  // One atomic op (a transaction on the real adapter) so the verdict + both
  // statuses can't half-commit if persistence faults mid-advance (§7.2, M2).
  const advanced = await persistOp(() =>
    ports.submissions.recordVerdictAndAdvance(ctx.familyId, id, instanceId, verdict),
  );
  if (!advanced.ok) return advanced;

  const submissionR = await persistOp(() =>
    ports.submissions.get(ctx.familyId, id),
  );
  if (!submissionR.ok) return submissionR;
  if (!submissionR.value) {
    return err({ code: "not_found", entity: "submission", id });
  }
  return ok(submissionR.value);
}

/**
 * Run a photo-storage op, mapping a thrown infra fault to the closed
 * `storage_unavailable` value (§8.2) — the photo isn't durable, so the caller
 * can retry rather than seeing a 500.
 */
async function storeOp<T>(op: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await op());
  } catch {
    return err({ code: "storage_unavailable" });
  }
}

/**
 * Run a persistence op, mapping a thrown infra fault to `persistence_unavailable`
 * (§8.2). Reads and writes alike — a DB fault becomes a value the UI can handle,
 * not a 500.
 */
async function persistOp<T>(op: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await op());
  } catch {
    return err({ code: "persistence_unavailable" });
  }
}
