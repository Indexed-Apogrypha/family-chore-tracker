import type { ChoreInstance, ChoreTemplate } from "@/domain/chore/types";
import { instanceId, templateId } from "@/domain/shared/ids";
import type {
  FamilyId,
  InstanceId,
  MemberId,
  TemplateId,
} from "@/domain/shared/ids";
import type { IsoDate } from "@/ports/clock";
import type { ChoreRepository } from "@/ports/repositories";

import { type InMemoryStore, createInMemoryStore } from "./store";

/**
 * In-memory chore templates + instances. The headline contract is the
 * idempotent lazy upsert of template-generated instances keyed on
 * `(templateId, assignedMemberId, dueDate)` — mirrors the partial unique index
 * that makes `getTodayBoard` safe to call repeatedly (design §6, §7.3).
 * One-off instances sit deliberately outside that key and are never deduped.
 *
 * `instances` lives in the shared {@link InMemoryStore} so the submission repo
 * can advance an instance alongside its submission in one step (§7.2). Templates
 * + the generated-key index are chore-only and stay local.
 */
export function inMemoryChoreRepository(
  store: InMemoryStore = createInMemoryStore(),
): ChoreRepository {
  const templates = new Map<TemplateId, ChoreTemplate>();
  const instances = store.instances;
  const generatedIndex = new Map<string, InstanceId>();

  const generatedKey = (
    template: TemplateId,
    member: MemberId,
    dueDate: IsoDate,
  ): string => `${template} ${member} ${dueDate}`;

  return {
    async createTemplate(input) {
      const template: ChoreTemplate = {
        ...input,
        id: templateId(crypto.randomUUID()),
      };
      templates.set(template.id, template);
      return template;
    },

    async listTemplates(family) {
      return [...templates.values()].filter((t) => t.familyId === family);
    },

    async setTemplateActive(family, id, active) {
      const template = templates.get(id);
      if (!template || template.familyId !== family) {
        return null;
      }
      const updated = { ...template, active };
      templates.set(id, updated);
      return updated;
    },

    async upsertGeneratedInstance(input) {
      const key = generatedKey(
        input.templateId,
        input.assignedMemberId,
        input.dueDate,
      );
      const existingId = generatedIndex.get(key);
      if (existingId) {
        const existing = instances.get(existingId);
        if (existing) {
          return existing;
        }
      }
      const instance: ChoreInstance = {
        ...input,
        id: instanceId(crypto.randomUUID()),
        status: "todo",
      };
      instances.set(instance.id, instance);
      generatedIndex.set(key, instance.id);
      return instance;
    },

    async createOneOff(input) {
      const instance: ChoreInstance = {
        ...input,
        id: instanceId(crypto.randomUUID()),
        templateId: null,
        status: "todo",
      };
      instances.set(instance.id, instance);
      return instance;
    },

    async getInstance(family: FamilyId, id: InstanceId) {
      const instance = instances.get(id);
      return instance && instance.familyId === family ? instance : null;
    },

    async listInstances(family, query) {
      return [...instances.values()].filter(
        (instance) =>
          instance.familyId === family &&
          (query.assignedMemberId === undefined ||
            instance.assignedMemberId === query.assignedMemberId) &&
          (query.dueDate === undefined || instance.dueDate === query.dueDate),
      );
    },

    async setInstanceStatus(family, id, status) {
      const instance = instances.get(id);
      if (instance && instance.familyId === family) {
        instances.set(id, { ...instance, status });
      }
    },
  };
}
