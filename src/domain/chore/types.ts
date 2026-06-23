import type { InstanceStatus, Recurrence } from "@/domain/shared/enums";
import type {
  FamilyId,
  InstanceId,
  MemberId,
  TemplateId,
} from "@/domain/shared/ids";
import type { IsoDate } from "@/ports/clock";

/**
 * Chore templates and the dated instances they materialize (design §6, §7.3).
 * Instances snapshot the template's title/points so later edits don't rewrite
 * history.
 */
export interface ChoreTemplate {
  id: TemplateId;
  familyId: FamilyId;
  title: string;
  description?: string;
  points: number;
  recurrence: Recurrence;
  assignedMemberId: MemberId;
  active: boolean;
}

export interface ChoreInstance {
  id: InstanceId;
  familyId: FamilyId;
  /** Null for a one-off chore; set for a template-generated instance. */
  templateId: TemplateId | null;
  /** Snapshot of the template's title/description/points at generation time. */
  title: string;
  /** Snapshot of the template's description, when it had one — fed to the judge. */
  description?: string;
  points: number;
  assignedMemberId: MemberId;
  dueDate: IsoDate;
  status: InstanceStatus;
}
