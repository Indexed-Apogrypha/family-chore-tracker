import type { SubmissionStatus } from "@/domain/shared/enums";
import type {
  FamilyId,
  InstanceId,
  MemberId,
  SubmissionId,
} from "@/domain/shared/ids";
import type { IsoInstant } from "@/ports/clock";
import type { Verdict } from "@/ports/judge";

/**
 * A submission: one photo attempt against a chore instance (design §6, §7).
 * An instance has many submissions over its life (1:N); each approved
 * submission credits points exactly once.
 */
export interface Submission {
  id: SubmissionId;
  familyId: FamilyId;
  instanceId: InstanceId;
  submittedBy: MemberId;
  photoPath: string;
  status: SubmissionStatus;
  /** The advisory AI verdict, attached after evaluation (§7.2). */
  aiVerdict?: Verdict;
  /** The parent who approved/rejected, set once decided (§7.1). */
  decidedBy?: MemberId;
  decidedAt?: IsoInstant;
}
