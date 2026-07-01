import type { Family, Member } from "@/domain/family/types";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";

import { persistOp } from "./infra";
import { requireName } from "./validation";

export interface CreateFamilyInput {
  name: string;
  founderDisplayName: string;
  /**
   * The founding parent's Supabase Auth user id, threaded through in real mode.
   * Absent in keyless mode (no accounts); the founder is then auth-less (§9).
   */
  authUserId?: string;
}

/**
 * Bootstrap use-case (design §4.2, §8.1): create a family and its founding
 * parent. The one verb with **no prior context** — an authenticated parent who
 * has no family yet. Other use-cases take `(ports, ctx, input)`; this takes
 * `(ports, input)`.
 *
 * Inputs are trimmed and required; blank or over-long names return a
 * `validation` error rather than persisting junk (§8.2).
 */
export async function createFamily(
  ports: Ports,
  input: CreateFamilyInput,
): Promise<Result<{ family: Family; founder: Member }>> {
  const name = requireName("name", input.name);
  if (!name.ok) return name;
  const founderDisplayName = requireName(
    "founderDisplayName",
    input.founderDisplayName,
  );
  if (!founderDisplayName.ok) return founderDisplayName;

  return persistOp(() =>
    ports.members.createFamily({
      name: name.value,
      founderDisplayName: founderDisplayName.value,
      authUserId: input.authUserId,
    }),
  );
}
