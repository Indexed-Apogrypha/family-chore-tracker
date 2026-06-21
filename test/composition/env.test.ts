import { describe, expect, it } from "vitest";

import { readEnv } from "@/composition/env";

// readEnv takes the environment as an argument (default process.env), so these
// tests inject a literal env and never touch the real process environment.
describe("readEnv", () => {
  it("defaults to the fake judge + in-memory persistence with an empty env", () => {
    const config = readEnv({});
    expect(config.judge.provider).toBe("fake");
    expect(config.persistence.kind).toBe("in-memory");
  });

  it("prefers Anthropic over Gemini when both keys are present (§5)", () => {
    const config = readEnv({
      JUDGE_ANTHROPIC_API_KEY: "a",
      JUDGE_GEMINI_API_KEY: "g",
      CLAUDE_MODEL: "claude-sonnet-4-6",
    });
    expect(config.judge.provider).toBe("anthropic");
    if (config.judge.provider === "anthropic") {
      expect(config.judge.model).toBe("claude-sonnet-4-6");
    }
  });

  it("falls back to Gemini when only its key is present", () => {
    const config = readEnv({ JUDGE_GEMINI_API_KEY: "g" });
    expect(config.judge.provider).toBe("gemini");
  });

  it("selects Supabase only when url + service-role key are both present", () => {
    expect(
      readEnv({ SUPABASE_URL: "https://x.supabase.co" }).persistence.kind,
    ).toBe("in-memory");
    expect(
      readEnv({
        SUPABASE_URL: "https://x.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "k",
      }).persistence.kind,
    ).toBe("supabase");
  });
});
