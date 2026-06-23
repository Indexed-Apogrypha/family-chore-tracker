import type { SubmissionStatus } from "@/domain/shared/enums";
import type { FamilyId, SubmissionId } from "@/domain/shared/ids";
import type { Submission } from "@/domain/submission/types";
import type { Verdict } from "@/ports/judge";
import type { SubmissionRepository } from "@/ports/repositories";

/**
 * In-memory submissions store. An instance has many submissions over its life
 * (1:N); rejection is terminal on the submission while the instance recycles to
 * `todo` (design §7.1). Reads/writes are family-scoped (RLS mirror, §9).
 */
export function inMemorySubmissionRepository(): SubmissionRepository {
  const submissions = new Map<SubmissionId, Submission>();

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
