import { describe, expect, it } from "vitest";

import { buildPorts } from "@/composition/container";
import type { EnvConfig } from "@/composition/env";

const keyless: EnvConfig = {
  judge: { provider: "fake" },
  persistence: { kind: "in-memory" },
};

describe("buildPorts", () => {
  it("wires the keyless stack (fake judge + in-memory + system clock) with no env", async () => {
    const ports = buildPorts(keyless);
    // Judge is the fake one (deterministic, no network).
    const verdict = await ports.judge.evaluate(
      { path: "f1/i1/s1.jpg" },
      { title: "Dishes" },
    );
    expect(verdict.model).toBe("fake");
    // Persistence round-trips through the in-memory member repo.
    const { family } = await ports.members.createFamily({
      name: "F",
      founderDisplayName: "P",
    });
    expect(await ports.members.getFamily(family.id)).not.toBeNull();
    // Clock returns a real ISO date.
    expect(ports.clock.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("wires a Supabase member repository when persistence is supabase (M1)", () => {
    // createClient is lazy (no network at construction), so a fake url/key is fine.
    const ports = buildPorts({
      judge: { provider: "fake" },
      persistence: {
        kind: "supabase",
        url: "https://x.supabase.co",
        serviceRoleKey: "k",
      },
    });
    expect(typeof ports.members.createFamily).toBe("function");
    // Chores/submissions/points/photos stay in-memory until M3/M6 — no throw.
    expect(ports.chores).toBeDefined();
    expect(ports.points).toBeDefined();
  });

  it("wires the real Anthropic judge over Supabase storage (M4, lazy — no network at build)", () => {
    // SDK clients construct lazily, so fake creds wire without a network call;
    // a real call (and any infra fault → judge_unavailable) happens only on evaluate.
    const ports = buildPorts({
      judge: { provider: "anthropic", apiKey: "a", model: "claude-sonnet-4-6" },
      persistence: { kind: "supabase", url: "https://x.supabase.co", serviceRoleKey: "k" },
    });
    expect(typeof ports.judge.evaluate).toBe("function");
  });

  it("wires the real Gemini judge over Supabase storage (M4, lazy — no network at build)", () => {
    const ports = buildPorts({
      judge: { provider: "gemini", apiKey: "g" },
      persistence: { kind: "supabase", url: "https://x.supabase.co", serviceRoleKey: "k" },
    });
    expect(typeof ports.judge.evaluate).toBe("function");
  });

  it("rejects a real judge over in-memory storage (memory:// URLs aren't fetchable)", () => {
    expect(() =>
      buildPorts({
        judge: { provider: "anthropic", apiKey: "a" },
        persistence: { kind: "in-memory" },
      }),
    ).toThrow(/requires Supabase storage/);
  });
});
