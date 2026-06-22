import type { ChoreInstance, ChoreTemplate } from "@/domain/chore/types";
import type { Family, Member } from "@/domain/family/types";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import type { RequestContext } from "@/ports/context";
import {
  type CreateTemplateInput,
  type GetTodayBoardInput,
  createTemplate,
  getTodayBoard,
} from "@/usecases/chores";
import { type CreateFamilyInput, createFamily } from "@/usecases/family";
import {
  type AddKidInput,
  type VerifyKidPinInput,
  addKid,
  listMembers,
  verifyKidPin,
} from "@/usecases/members";
import { type SwitchProfileInput, switchProfile } from "@/usecases/profile";

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
  /** A member's chore board for the day, materializing due instances — any family member (§7.3). */
  getTodayBoard(input: GetTodayBoardInput): Promise<Result<ChoreInstance[]>>;
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
        getTodayBoard: (input: GetTodayBoardInput) =>
          getTodayBoard(ports, ctx, input),
      };
    },
    createFamily(input: CreateFamilyInput) {
      return createFamily(ports, input);
    },
  };
}
