import type { Family, Member } from "@/domain/family/types";
import { ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";

export interface CreateFamilyInput {
  name: string;
  founderDisplayName: string;
}

/**
 * Bootstrap use-case (design §4.2, §8.1): create a family and its founding
 * parent. The one verb with **no prior context** — an authenticated parent who
 * has no family yet. Other use-cases take `(ports, ctx, input)`; this takes
 * `(ports, input)`.
 */
export async function createFamily(
  ports: Ports,
  input: CreateFamilyInput,
): Promise<Result<{ family: Family; founder: Member }>> {
  const created = await ports.members.createFamily(input);
  return ok(created);
}
