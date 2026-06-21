import type { Family, Member } from "@/domain/family/types";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";
import type { RequestContext } from "@/ports/context";
import { type CreateFamilyInput, createFamily } from "@/usecases/family";

/**
 * The session edge (design §4.2). `app.as(ctx)` binds the request context once;
 * everyday verbs (submit, approve, today's board) hang off the returned session
 * and read the acting member ambiently. Those verbs arrive with their
 * milestones (M1–M5); each delegates to a pure use-case `(ports, ctx, input)`.
 */
export interface Session {
  readonly ctx: RequestContext;
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
      return { ctx };
    },
    createFamily(input: CreateFamilyInput) {
      return createFamily(ports, input);
    },
  };
}
