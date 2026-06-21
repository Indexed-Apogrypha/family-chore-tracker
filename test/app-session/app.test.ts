import { describe, expect, it } from "vitest";

import { makeApp } from "@/app-session/app";
import type { EnvConfig } from "@/composition/env";
import { buildPorts } from "@/composition/container";
import { familyId, memberId } from "@/domain/shared/ids";

const keyless: EnvConfig = {
  judge: { provider: "fake" },
  persistence: { kind: "in-memory" },
};
const app = () => makeApp(buildPorts(keyless));

describe("makeApp (keyless boot)", () => {
  it("bootstraps a family + founding parent via createFamily (no ctx, §4.2)", async () => {
    const result = await app().createFamily({
      name: "The Harpers",
      founderDisplayName: "Sam",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.family.name).toBe("The Harpers");
      expect(result.value.founder.kind).toBe("parent");
      expect(result.value.founder.familyId).toBe(result.value.family.id);
    }
  });

  it("as(ctx) binds a request context and returns a session", () => {
    const session = app().as({
      familyId: familyId("f1"),
      actor: { kind: "parent", memberId: memberId("m1") },
    });
    expect(session.ctx.actor.kind).toBe("parent");
    expect(session.ctx.familyId).toBe(familyId("f1"));
  });
});
