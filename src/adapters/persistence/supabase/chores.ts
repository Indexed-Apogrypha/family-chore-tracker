import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/composition/database.types";
import type { ChoreInstance, ChoreTemplate } from "@/domain/chore/types";
import type { InstanceStatus, Recurrence } from "@/domain/shared/enums";
import { familyId, instanceId, memberId, templateId } from "@/domain/shared/ids";
import type { ChoreRepository } from "@/ports/repositories";

type TemplateRow = Database["public"]["Tables"]["chore_templates"]["Row"];
type InstanceRow = Database["public"]["Tables"]["chore_instances"]["Row"];

/** Postgres unique-violation — the partial index firing means "already generated". */
const UNIQUE_VIOLATION = "23505";

function toTemplate(row: TemplateRow): ChoreTemplate {
  return {
    id: templateId(row.id),
    familyId: familyId(row.family_id),
    title: row.title,
    ...(row.description !== null ? { description: row.description } : {}),
    points: row.points,
    recurrence: row.recurrence as unknown as Recurrence,
    assignedMemberId: memberId(row.assigned_member_id),
    active: row.active,
  };
}

function toInstance(row: InstanceRow): ChoreInstance {
  return {
    id: instanceId(row.id),
    familyId: familyId(row.family_id),
    templateId: row.template_id !== null ? templateId(row.template_id) : null,
    title: row.title,
    points: row.points,
    assignedMemberId: memberId(row.assigned_member_id),
    dueDate: row.due_date,
    status: row.status as InstanceStatus,
  };
}

/**
 * Supabase-backed `ChoreRepository` (design §5, §6, §9). Mirrors the in-memory
 * adapter — the shared contract proves them interchangeable. Every query is
 * scoped by `familyId`; the idempotent lazy upsert relies on the partial unique
 * index `chore_instances_generated_key` (a duplicate insert raises 23505, which
 * we resolve to the existing row — race-safe, unlike a read-then-insert).
 */
export function supabaseChoreRepository(
  client: SupabaseClient<Database>,
): ChoreRepository {
  return {
    async createTemplate(input) {
      const { data, error } = await client
        .from("chore_templates")
        .insert({
          family_id: input.familyId,
          title: input.title,
          description: input.description ?? null,
          points: input.points,
          recurrence: input.recurrence as unknown as Json,
          assigned_member_id: input.assignedMemberId,
          active: input.active,
        })
        .select("*")
        .single();
      if (error) throw error;
      return toTemplate(data);
    },

    async listTemplates(family) {
      const { data, error } = await client
        .from("chore_templates")
        .select("*")
        .eq("family_id", family);
      if (error) throw error;
      return data.map(toTemplate);
    },

    async setTemplateActive(family, id, active) {
      const { data, error } = await client
        .from("chore_templates")
        .update({ active })
        .eq("id", id)
        .eq("family_id", family)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data ? toTemplate(data) : null;
    },

    async upsertGeneratedInstance(input) {
      const row = {
        family_id: input.familyId,
        template_id: input.templateId,
        title: input.title,
        points: input.points,
        assigned_member_id: input.assignedMemberId,
        due_date: input.dueDate,
        status: "todo",
      };
      const { data, error } = await client
        .from("chore_instances")
        .insert(row)
        .select("*")
        .single();
      if (!error) return toInstance(data);
      if (error.code !== UNIQUE_VIOLATION) throw error;

      // The generated key already exists — return the existing instance (§7.3).
      const existing = await client
        .from("chore_instances")
        .select("*")
        .eq("family_id", input.familyId)
        .eq("template_id", input.templateId)
        .eq("assigned_member_id", input.assignedMemberId)
        .eq("due_date", input.dueDate)
        .single();
      if (existing.error) throw existing.error;
      return toInstance(existing.data);
    },

    async createOneOff(input) {
      const { data, error } = await client
        .from("chore_instances")
        .insert({
          family_id: input.familyId,
          template_id: null,
          title: input.title,
          points: input.points,
          assigned_member_id: input.assignedMemberId,
          due_date: input.dueDate,
          status: "todo",
        })
        .select("*")
        .single();
      if (error) throw error;
      return toInstance(data);
    },

    async getInstance(family, id) {
      const { data, error } = await client
        .from("chore_instances")
        .select("*")
        .eq("id", id)
        .eq("family_id", family)
        .maybeSingle();
      if (error) throw error;
      return data ? toInstance(data) : null;
    },

    async listInstances(family, query) {
      let q = client.from("chore_instances").select("*").eq("family_id", family);
      if (query.assignedMemberId !== undefined) {
        q = q.eq("assigned_member_id", query.assignedMemberId);
      }
      if (query.dueDate !== undefined) {
        q = q.eq("due_date", query.dueDate);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data.map(toInstance);
    },

    async setInstanceStatus(family, id, status) {
      const { error } = await client
        .from("chore_instances")
        .update({ status })
        .eq("id", id)
        .eq("family_id", family);
      if (error) throw error;
    },
  };
}
