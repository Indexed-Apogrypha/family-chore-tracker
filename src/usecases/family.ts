import type { Family, Member } from "@/domain/family/types";
import { err, ok } from "@/domain/shared/result";
import type { Result } from "@/domain/shared/result";
import type { Ports } from "@/ports";

export interface CreateFamilyInput {
  name: string;
  founderDisplayName: string;
}

/** Max length for the free-text names a family bootstraps with. */
const MAX_NAME_LENGTH = 80;

/** Trim and bound a required free-text field, or return its validation error. */
function requireName(field: string, value: string): Result<string> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return err({ code: "validation", field, message: `${field} is required.` });
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return err({
      code: "validation",
      field,
      message: `${field} must be ${MAX_NAME_LENGTH} characters or fewer.`,
    });
  }
  return ok(trimmed);
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

  const created = await ports.members.createFamily({
    name: name.value,
    founderDisplayName: founderDisplayName.value,
  });
  return ok(created);
}
