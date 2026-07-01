import type { Member } from "@/domain/family/types";
import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";

import { persistOp } from "./infra";

/**
 * Resolve the parent member backing an authenticated Supabase user (design §3.1,
 * §8.3). `not_found` means the auth user has no family yet — the first-login
 * bootstrap signal (signup creates the family). The login edge turns the returned
 * member into a `RequestContext` via `memberContext`.
 */
export async function findActingParent(
  ports: Ports,
  authUserId: string,
): Promise<Result<Member>> {
  const memberR = await persistOp(() =>
    ports.members.findByAuthUserId(authUserId),
  );
  if (!memberR.ok) return memberR;
  if (!memberR.value) {
    return err({ code: "not_found", entity: "member", id: authUserId });
  }
  return ok(memberR.value);
}
