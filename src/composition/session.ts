import { memberContext } from "@/app-session/context";
import type { Family, Member } from "@/domain/family/types";
import type { FamilyId, MemberId } from "@/domain/shared/ids";
import type { Ports } from "@/ports";
import type { Actor, RequestContext } from "@/ports/context";
import { createFamily } from "@/usecases/family";
import { addKid } from "@/usecases/members";

/**
 * The proven identity for a request: the family and its founding/authenticated
 * parent. In real mode it comes from the Supabase session; in keyless practice
 * mode from the practice cookie. The active profile is layered on top.
 */
export interface Identity {
  familyId: FamilyId;
  parent: Member;
}

/**
 * Resolve the request context from a proven {@link Identity} plus the app-level
 * active-profile selection (design §3.1). The family is anchored to the parent's
 * identity; the active member only chooses the *actor*. A missing, unknown, or
 * cross-family `activeMemberId` safely falls back to the parent — a stale or
 * tampered cookie can never adopt another family's member or a non-member.
 */
export async function resolveContext(
  ports: Ports,
  identity: Identity,
  activeMemberId: MemberId | null,
): Promise<RequestContext> {
  const parentActor: Actor = { kind: "parent", memberId: identity.parent.id };
  if (!activeMemberId) {
    return { familyId: identity.familyId, actor: parentActor };
  }
  const member = await ports.members.getMember(identity.familyId, activeMemberId);
  if (!member) {
    return { familyId: identity.familyId, actor: parentActor };
  }
  return {
    familyId: identity.familyId,
    actor: { kind: member.kind, memberId: member.id },
  };
}

/** The demo kid's PIN in keyless practice mode — convenience, not a secret. */
export const PRACTICE_KID_PIN = "1234";

/**
 * Bootstrap a keyless **practice** family: a parent founder plus one demo kid,
 * so the shared-device switcher demonstrates the parent↔kid flow out of the box
 * without any Supabase account. Only ever used on the in-memory stack; the route
 * handler decides when to seed (and anchors it to a practice cookie).
 */
export async function seedPracticeFamily(
  ports: Ports,
): Promise<{ family: Family; founder: Member; kid: Member }> {
  const created = await createFamily(ports, {
    name: "Practice Family",
    founderDisplayName: "Parent",
  });
  if (!created.ok) {
    throw new Error(`practice bootstrap failed: ${created.error.code}`);
  }
  const { family, founder } = created.value;

  const kidResult = await addKid(ports, memberContext(founder), {
    displayName: "Kiddo",
    pin: PRACTICE_KID_PIN,
  });
  if (!kidResult.ok) {
    throw new Error(`practice kid seed failed: ${kidResult.error.code}`);
  }
  return { family, founder, kid: kidResult.value };
}
