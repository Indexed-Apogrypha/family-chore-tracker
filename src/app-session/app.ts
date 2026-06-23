import type { ChoreInstance, ChoreTemplate } from "@/domain/chore/types";
import type { Family, Member } from "@/domain/family/types";
import type { Result } from "@/domain/shared/result";
import type { Submission } from "@/domain/submission/types";
import type { Ports } from "@/ports";
import type { RequestContext } from "@/ports/context";
import {
  type CreateOneOffInput,
  type CreateTemplateInput,
  type GetTodayBoardInput,
  type SetTemplateActiveInput,
  createOneOff,
  createTemplate,
  getTodayBoard,
  listTemplates,
  setTemplateActive,
} from "@/usecases/chores";
import { type CreateFamilyInput, createFamily } from "@/usecases/family";
import {
  type AddKidInput,
  type VerifyKidPinInput,
  addKid,
  listMembers,
  verifyKidPin,
} from "@/usecases/members";
import { type PointsTotalInput, pointsTotal } from "@/usecases/points";
import { type SwitchProfileInput, switchProfile } from "@/usecases/profile";
import {
  type DecideInput,
  type ReviewItem,
  decide,
  getReviewQueue,
} from "@/usecases/review";
import {
  type RetrySubmissionInput,
  type SubmitPhotoInput,
  retrySubmission,
  submitPhoto,
} from "@/usecases/submission";

/**
 * The session edge (design §4.2). `app.as(ctx)` binds the request context once;
 * everyday verbs (submit, approve, today's board) hang off the returned session
 * and read the acting member ambiently. Those verbs arrive with their
 * milestones (M1–M5); each delegates to a pure use-case `(ports, ctx, input)`.
 */
export interface Session {
  readonly ctx: RequestContext;
  /** Add a kid profile under the bound family — parent-only (§8.3). */
  addKid(input: AddKidInput): Promise<Result<Member>>;
  /** List the bound family's members — any family member (§8.3). */
  listMembers(): Promise<Result<Member[]>>;
  /** Verify a kid's PIN to switch the active profile — any family member (§3.1). */
  verifyKidPin(input: VerifyKidPinInput): Promise<Result<Member>>;
  /** Select the active profile: parent (no PIN) or a kid (PIN-gated) — §3.1. */
  switchProfile(input: SwitchProfileInput): Promise<Result<Member>>;
  /** Create a chore template under the bound family — parent-only (§8.1). */
  createTemplate(input: CreateTemplateInput): Promise<Result<ChoreTemplate>>;
  /** Create a one-off chore (templateId null) — parent-only (§6). */
  createOneOff(input: CreateOneOffInput): Promise<Result<ChoreInstance>>;
  /** List the bound family's chore templates — parent-only (§6, §8). */
  listTemplates(): Promise<Result<ChoreTemplate[]>>;
  /** Activate/deactivate a template — parent-only (§6, §7.3). */
  setTemplateActive(
    input: SetTemplateActiveInput,
  ): Promise<Result<ChoreTemplate>>;
  /** A member's chore board for the day, materializing due instances — any family member (§7.3). */
  getTodayBoard(input: GetTodayBoardInput): Promise<Result<ChoreInstance[]>>;
  /** Submit a chore photo — the acting kid must own the instance, or a parent (§7.2, §8.3). */
  submitPhoto(input: SubmitPhotoInput): Promise<Result<Submission>>;
  /** Re-run the judge on a submission stuck in `evaluating` — owner-or-parent (§7.2). */
  retrySubmission(input: RetrySubmissionInput): Promise<Result<Submission>>;
  /** The parent review queue: pending submissions + verdict + signed photo URL — parent-only (§8.1). */
  getReviewQueue(): Promise<Result<ReviewItem[]>>;
  /** Approve/reject a pending submission — parent-only, authoritative; approve credits points once (§7.1). */
  decide(input: DecideInput): Promise<Result<Submission>>;
  /** A member's running points total — any family member (§8.1). */
  pointsTotal(input: PointsTotalInput): Promise<Result<number>>;
}

export interface App {
  /** Bind a request context; everyday verbs hang off the returned session. */
  as(ctx: RequestContext): Session;
  /** Bootstrap: create a family + founding parent, no prior context (§4.2). */
  createFamily(
    input: CreateFamilyInput,
  ): Promise<Result<{ family: Family; founder: Member }>>;
}

/** Build the application once from an env-selected `Ports` bundle. */
export function makeApp(ports: Ports): App {
  return {
    as(ctx: RequestContext): Session {
      return {
        ctx,
        addKid: (input: AddKidInput) => addKid(ports, ctx, input),
        listMembers: () => listMembers(ports, ctx),
        verifyKidPin: (input: VerifyKidPinInput) =>
          verifyKidPin(ports, ctx, input),
        switchProfile: (input: SwitchProfileInput) =>
          switchProfile(ports, ctx, input),
        createTemplate: (input: CreateTemplateInput) =>
          createTemplate(ports, ctx, input),
        createOneOff: (input: CreateOneOffInput) =>
          createOneOff(ports, ctx, input),
        listTemplates: () => listTemplates(ports, ctx),
        setTemplateActive: (input: SetTemplateActiveInput) =>
          setTemplateActive(ports, ctx, input),
        getTodayBoard: (input: GetTodayBoardInput) =>
          getTodayBoard(ports, ctx, input),
        submitPhoto: (input: SubmitPhotoInput) =>
          submitPhoto(ports, ctx, input),
        retrySubmission: (input: RetrySubmissionInput) =>
          retrySubmission(ports, ctx, input),
        getReviewQueue: () => getReviewQueue(ports, ctx),
        decide: (input: DecideInput) => decide(ports, ctx, input),
        pointsTotal: (input: PointsTotalInput) => pointsTotal(ports, ctx, input),
      };
    },
    createFamily(input: CreateFamilyInput) {
      return createFamily(ports, input);
    },
  };
}
