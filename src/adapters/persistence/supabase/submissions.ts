import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/composition/database.types";
import type { SubmissionStatus } from "@/domain/shared/enums";
import {
  familyId,
  instanceId,
  memberId,
  submissionId,
} from "@/domain/shared/ids";
import type { Submission } from "@/domain/submission/types";
import type { SubmissionRepository } from "@/ports/repositories";

import { storedVerdict } from "./parse";

type SubmissionRow = Database["public"]["Tables"]["submissions"]["Row"];

function toSubmission(row: SubmissionRow): Submission {
  return {
    id: submissionId(row.id),
    familyId: familyId(row.family_id),
    instanceId: instanceId(row.instance_id),
    submittedBy: memberId(row.submitted_by),
    photoPath: row.photo_path,
    status: row.status as SubmissionStatus,
    // Validated at the read boundary (#137): a malformed stored verdict fails
    // loud (→ persistence_unavailable) instead of leaking into domain logic.
    ...(row.ai_verdict !== null ? { aiVerdict: storedVerdict(row.ai_verdict) } : {}),
    ...(row.decided_by !== null ? { decidedBy: memberId(row.decided_by) } : {}),
    // Postgres `timestamptz` reads back as e.g. `…+00:00`; canonicalize to the
    // app's ISO instant (`…Z`) so the value matches the in-memory adapter and
    // the clock's `now()` (the shared contract asserts this round-trip, #117).
    ...(row.decided_at !== null
      ? { decidedAt: new Date(row.decided_at).toISOString() }
      : {}),
  };
}

/**
 * Supabase-backed `SubmissionRepository` (design §5, §6, §9). Mirrors the
 * in-memory adapter; family-scoped. The caller mints `id` (the photo path is
 * keyed on it, §7.2); the DB defaults the `evaluating` status on insert.
 */
export function supabaseSubmissionRepository(
  client: SupabaseClient<Database>,
): SubmissionRepository {
  return {
    async create({ id, familyId: family, instanceId: instance, submittedBy, photoPath }) {
      const { data, error } = await client
        .from("submissions")
        .insert({
          id,
          family_id: family,
          instance_id: instance,
          submitted_by: submittedBy,
          photo_path: photoPath,
        })
        .select("*")
        .single();
      if (error) throw error;
      return toSubmission(data);
    },

    async get(family, id) {
      const { data, error } = await client
        .from("submissions")
        .select("*")
        .eq("id", id)
        .eq("family_id", family)
        .maybeSingle();
      if (error) throw error;
      return data ? toSubmission(data) : null;
    },

    async recordVerdict(family, id, verdict) {
      const { error } = await client
        .from("submissions")
        .update({ ai_verdict: verdict as unknown as Json })
        .eq("id", id)
        .eq("family_id", family);
      if (error) throw error;
    },

    async setStatus(family, id, status) {
      const { error } = await client
        .from("submissions")
        .update({ status })
        .eq("id", id)
        .eq("family_id", family);
      if (error) throw error;
    },

    async recordVerdictAndAdvance(family, id, instance, verdict) {
      // One transaction (the SECURITY DEFINER RPC) updates the submission's
      // verdict + status AND the instance's status together, so an infra fault
      // can't half-commit (§7.2).
      const { error } = await client.rpc("record_verdict_and_advance", {
        p_family_id: family,
        p_submission_id: id,
        p_instance_id: instance,
        p_verdict: verdict as unknown as Json,
      });
      if (error) throw error;
    },

    async recordDecisionAndSettle(family, id, instance, decision, credit) {
      // One transaction (the SECURITY DEFINER RPC, #136): the decision, the
      // instance move, and the idempotent points credit commit together, so an
      // infra fault can't approve a submission without crediting its points.
      const { error } = await client.rpc("record_decision_and_settle", {
        p_family_id: family,
        p_submission_id: id,
        p_instance_id: instance,
        p_status: decision.status,
        p_decided_by: decision.decidedBy,
        p_decided_at: decision.decidedAt,
        ...(credit
          ? { p_credit_member_id: credit.memberId, p_credit_delta: credit.delta }
          : {}),
      });
      if (error) throw error;
    },

    async recordDecision(family, id, decision) {
      const { error } = await client
        .from("submissions")
        .update({
          status: decision.status,
          decided_by: decision.decidedBy,
          decided_at: decision.decidedAt,
        })
        .eq("id", id)
        .eq("family_id", family);
      if (error) throw error;
    },

    async listByStatus(family, status) {
      const { data, error } = await client
        .from("submissions")
        .select("*")
        .eq("family_id", family)
        .eq("status", status);
      if (error) throw error;
      return data.map(toSubmission);
    },
  };
}
