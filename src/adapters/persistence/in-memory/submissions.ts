import type { SubmissionStatus } from "@/domain/shared/enums";
import type { FamilyId, InstanceId, SubmissionId } from "@/domain/shared/ids";
import type { Submission } from "@/domain/submission/types";
import type { Verdict } from "@/ports/judge";
import type { SubmissionRepository } from "@/ports/repositories";

import { type InMemoryStore, createInMemoryStore } from "./store";

/**
 * In-memory submissions store. An instance has many submissions over its life
 * (1:N); rejection is terminal on the submission while the instance recycles to
 * `todo` (design §7.1). Reads/writes are family-scoped (RLS mirror, §9).
 *
 * Shares the {@link InMemoryStore} with the chore repo so `recordVerdictAndAdvance`
 * can flip the submission and its instance together (§7.2) — the in-memory mirror
 * of the Supabase adapter's single transactional RPC.
 */
export function inMemorySubmissionRepository(
  store: InMemoryStore = createInMemoryStore(),
): SubmissionRepository {
  const submissions = store.submissions;
  const instances = store.instances;

  const scoped = (family: FamilyId, id: SubmissionId): Submission | null => {
    const submission = submissions.get(id);
    return submission && submission.familyId === family ? submission : null;
  };

  return {
    async create({ id, familyId, instanceId, submittedBy, photoPath }) {
      const submission: Submission = {
        id,
        familyId,
        instanceId,
        submittedBy,
        photoPath,
        status: "evaluating",
      };
      submissions.set(submission.id, submission);
      return submission;
    },

    async get(family, id) {
      return scoped(family, id);
    },

    async recordVerdict(family: FamilyId, id: SubmissionId, verdict: Verdict) {
      const submission = scoped(family, id);
      if (submission) {
        submissions.set(id, { ...submission, aiVerdict: verdict });
      }
    },

    async setStatus(family: FamilyId, id: SubmissionId, status: SubmissionStatus) {
      const submission = scoped(family, id);
      if (submission) {
        submissions.set(id, { ...submission, status });
      }
    },

    async recordVerdictAndAdvance(
      family: FamilyId,
      id: SubmissionId,
      instanceId: InstanceId,
      verdict: Verdict,
    ) {
      // Both writes happen synchronously (no interleaving await), so the
      // submission and its instance can never observe a half-committed advance —
      // the in-memory mirror of the Supabase RPC's single transaction (§7.2).
      const submission = scoped(family, id);
      if (submission) {
        submissions.set(id, {
          ...submission,
          aiVerdict: verdict,
          status: "pending_review",
        });
      }
      const instance = instances.get(instanceId);
      if (instance && instance.familyId === family) {
        instances.set(instanceId, { ...instance, status: "pending_review" });
      }
    },

    async recordDecision(family, id, decision) {
      const submission = scoped(family, id);
      if (submission) {
        submissions.set(id, {
          ...submission,
          status: decision.status,
          decidedBy: decision.decidedBy,
          decidedAt: decision.decidedAt,
        });
      }
    },

    async listByStatus(family: FamilyId, status: SubmissionStatus) {
      return [...submissions.values()].filter(
        (s) => s.familyId === family && s.status === status,
      );
    },
  };
}
