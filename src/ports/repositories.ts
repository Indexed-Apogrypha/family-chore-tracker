import type { ChoreInstance, ChoreTemplate } from "@/domain/chore/types";
import type { Family, Member } from "@/domain/family/types";
import type { LedgerEntry } from "@/domain/points/types";
import type { InstanceStatus, SubmissionStatus } from "@/domain/shared/enums";
import type {
  FamilyId,
  InstanceId,
  MemberId,
  SubmissionId,
  TemplateId,
} from "@/domain/shared/ids";
import type { Submission } from "@/domain/submission/types";

import type { IsoDate, IsoInstant } from "./clock";
import type { Verdict } from "./judge";

/**
 * The persistence seams (design §5, §6). Each has an in-memory adapter (the
 * executable spec) and a Supabase adapter, proven interchangeable by the
 * contract tests. Every method is scoped by `familyId` so the in-memory side
 * mirrors Supabase RLS: cross-family ids resolve to `null` (→ `not_found`).
 *
 * These interfaces cover what M0 exercises; later milestones extend them with
 * their use-cases' queries.
 */
export interface MemberRepository {
  /** Bootstrap a family and its founding parent together (§4.2). */
  createFamily(input: {
    name: string;
    founderDisplayName: string;
    /** Founder's Supabase Auth user id in real mode; absent in keyless (§9). */
    authUserId?: string;
  }): Promise<{ family: Family; founder: Member }>;
  getFamily(id: FamilyId): Promise<Family | null>;
  /**
   * Add a kid profile under a family. The adapter hashes `pin` into the stored
   * `pin_hash` — the in-memory side fakes it, Supabase uses a real KDF (§3.1,
   * §9). The contract proves behavior, not hash format.
   */
  addKid(input: {
    familyId: FamilyId;
    displayName: string;
    pin: string;
  }): Promise<Member>;
  addMember(input: Omit<Member, "id">): Promise<Member>;
  /**
   * Verify a kid's PIN server-side and return the kid, or `null` for an
   * unknown/cross-family/non-kid member or a wrong PIN. The caller maps `null`
   * to `bad_pin` so existence never leaks (§3.1).
   */
  verifyKidPin(
    familyId: FamilyId,
    id: MemberId,
    pin: string,
  ): Promise<Member | null>;
  getMember(familyId: FamilyId, id: MemberId): Promise<Member | null>;
  listMembers(familyId: FamilyId): Promise<Member[]>;
  /**
   * Resolve the parent member backing a Supabase Auth user, or `null` if none
   * yet (the first-login bootstrap signal). Not family-scoped — `authUserId` is
   * the global key (unique). Used on the parent login path (§3.1, §8.3).
   */
  findByAuthUserId(authUserId: string): Promise<Member | null>;
}

export interface ChoreRepository {
  createTemplate(input: Omit<ChoreTemplate, "id">): Promise<ChoreTemplate>;
  listTemplates(familyId: FamilyId): Promise<ChoreTemplate[]>;
  /**
   * Flip a template's `active` flag (parent management). Returns the updated
   * template, or `null` for an unknown/cross-family id (mutating nothing).
   * Deactivating stops future lazy generation — `getTodayBoard` skips inactive
   * templates (§6, §7.3).
   */
  setTemplateActive(
    familyId: FamilyId,
    id: TemplateId,
    active: boolean,
  ): Promise<ChoreTemplate | null>;
  /**
   * Lazily materialize a template-generated instance. **Idempotent** on
   * `(templateId, assignedMemberId, dueDate)`: a repeated generation returns
   * the existing instance rather than duplicating it (§6, §7.3).
   */
  upsertGeneratedInstance(
    input: Omit<ChoreInstance, "id" | "status" | "templateId"> & {
      templateId: TemplateId;
    },
  ): Promise<ChoreInstance>;
  /** Create a one-off instance (`templateId` null); never lazily regenerated. */
  createOneOff(
    input: Omit<ChoreInstance, "id" | "status" | "templateId">,
  ): Promise<ChoreInstance>;
  getInstance(familyId: FamilyId, id: InstanceId): Promise<ChoreInstance | null>;
  listInstances(
    familyId: FamilyId,
    query: { assignedMemberId?: MemberId; dueDate?: IsoDate },
  ): Promise<ChoreInstance[]>;
  setInstanceStatus(
    familyId: FamilyId,
    id: InstanceId,
    status: InstanceStatus,
  ): Promise<void>;
}

export interface SubmissionRepository {
  /**
   * Insert a submission in the `evaluating` state. The caller mints `id` so the
   * photo can be stored at its final `family/instance/submission.<ext>` path
   * before the row exists (§7.2, §9) — id and `photoPath` share one source.
   */
  create(input: {
    id: SubmissionId;
    familyId: FamilyId;
    instanceId: InstanceId;
    submittedBy: MemberId;
    photoPath: string;
  }): Promise<Submission>;
  get(familyId: FamilyId, id: SubmissionId): Promise<Submission | null>;
  recordVerdict(
    familyId: FamilyId,
    id: SubmissionId,
    verdict: Verdict,
  ): Promise<void>;
  setStatus(
    familyId: FamilyId,
    id: SubmissionId,
    status: SubmissionStatus,
  ): Promise<void>;
  /**
   * Atomically attach the verdict and advance both the submission and its
   * instance to `pending_review` (§7.2). One transaction on the Supabase adapter
   * (an RPC) so an infra fault can't half-commit — leaving a verdict without an
   * advanced status, or the submission advanced while its instance lags. The
   * in-memory adapter writes both maps in one synchronous step.
   */
  recordVerdictAndAdvance(
    familyId: FamilyId,
    id: SubmissionId,
    instanceId: InstanceId,
    verdict: Verdict,
  ): Promise<void>;
  /**
   * Record a parent's **authoritative** decision (§7.1): set the terminal status
   * together with who decided and when. Approve/reject only — the points credit
   * is the caller's separate, idempotent step. A primitive kept for the contract;
   * the use-case path uses {@link recordDecisionAndAdvance}.
   */
  recordDecision(
    familyId: FamilyId,
    id: SubmissionId,
    decision: {
      status: "approved" | "rejected";
      decidedBy: MemberId;
      decidedAt: IsoInstant;
    },
  ): Promise<void>;
  /**
   * Apply a parent's decision **atomically** across all three writes of the
   * authoritative path (§7.1, #136): set the submission's terminal status +
   * `decidedBy`/`decidedAt`, advance the instance (`approved`, or `todo` to
   * recycle on reject), and — on approve — credit the instance's snapshotted
   * points to its assignee. One transaction on the Supabase adapter (an RPC) so
   * an infra fault can't half-commit (e.g. approve a submission while crediting
   * no points). The credit is idempotent on `submissionId`, so a replay never
   * double-credits. The in-memory adapter writes all maps in one synchronous step.
   */
  recordDecisionAndAdvance(
    familyId: FamilyId,
    input: {
      submissionId: SubmissionId;
      instanceId: InstanceId;
      status: "approved" | "rejected";
      decidedBy: MemberId;
      decidedAt: IsoInstant;
    },
  ): Promise<void>;
  listByStatus(
    familyId: FamilyId,
    status: SubmissionStatus,
  ): Promise<Submission[]>;
}

export interface PointsLedger {
  /**
   * Append a credit. **Idempotent** on `submissionId` — a replayed approve
   * never double-credits (§6, §7.1).
   */
  append(entry: LedgerEntry): Promise<void>;
  /**
   * Sum a member's credits, scoped by `familyId` so the in-memory side mirrors
   * Supabase RLS — entries from another family never count (§9).
   */
  totalFor(familyId: FamilyId, memberId: MemberId): Promise<number>;
}
