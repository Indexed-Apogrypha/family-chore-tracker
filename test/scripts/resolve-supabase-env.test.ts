import { describe, expect, it } from "vitest";

// Unit tests for the namespaced-env resolver (design
// docs/superpowers/specs/2026-06-23-supabase-env-namespacing-design.md). The
// resolver maps the SUPABASE_<TARGET>_* block onto the canonical names the app
// reads, defaulting to the safe `stage` target. It is pure — it takes an env
// object and returns a result — so these tests never touch process.env.
import {
  formatEnvLocal,
  resolveSupabaseEnv,
} from "../../scripts/resolve-supabase-env.mjs";

const stageBlock = {
  SUPABASE_STAGE_URL: "https://stage.supabase.co",
  SUPABASE_STAGE_SERVICE_ROLE_KEY: "stage-service-role",
  SUPABASE_STAGE_ANON_KEY: "stage-anon",
};

const prodBlock = {
  SUPABASE_PROD_URL: "https://prod.supabase.co",
  SUPABASE_PROD_SERVICE_ROLE_KEY: "prod-service-role",
  SUPABASE_PROD_ANON_KEY: "prod-anon",
};

describe("resolveSupabaseEnv", () => {
  it("defaults to the stage target when SUPABASE_TARGET is unset", () => {
    const { target, canonical } = resolveSupabaseEnv({ ...stageBlock });

    expect(target).toBe("stage");
    expect(canonical?.SUPABASE_URL).toBe("https://stage.supabase.co");
    expect(canonical?.SUPABASE_SERVICE_ROLE_KEY).toBe("stage-service-role");
    expect(canonical?.SUPABASE_ANON_KEY).toBe("stage-anon");
  });

  it("mirrors the target into the NEXT_PUBLIC_* names and defaults the bucket", () => {
    const { canonical } = resolveSupabaseEnv({ ...stageBlock });

    expect(canonical?.NEXT_PUBLIC_SUPABASE_URL).toBe("https://stage.supabase.co");
    expect(canonical?.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("stage-anon");
    expect(canonical?.SUPABASE_STORAGE_BUCKET).toBe("chore-photos");
  });

  it("honours an explicit SUPABASE_<TARGET>_STORAGE_BUCKET override", () => {
    const { canonical } = resolveSupabaseEnv({
      ...stageBlock,
      SUPABASE_STAGE_STORAGE_BUCKET: "custom-bucket",
    });

    expect(canonical?.SUPABASE_STORAGE_BUCKET).toBe("custom-bucket");
  });

  it("selects the prod block when SUPABASE_TARGET=prod", () => {
    const { target, canonical } = resolveSupabaseEnv({
      SUPABASE_TARGET: "prod",
      ...stageBlock,
      ...prodBlock,
    });

    expect(target).toBe("prod");
    expect(canonical?.SUPABASE_URL).toBe("https://prod.supabase.co");
    expect(canonical?.SUPABASE_SERVICE_ROLE_KEY).toBe("prod-service-role");
    expect(canonical?.NEXT_PUBLIC_SUPABASE_URL).toBe("https://prod.supabase.co");
  });

  it("accepts a case-insensitive SUPABASE_TARGET", () => {
    const { target, canonical } = resolveSupabaseEnv({
      SUPABASE_TARGET: "STAGE",
      ...stageBlock,
    });

    expect(target).toBe("stage");
    expect(canonical?.SUPABASE_URL).toBe("https://stage.supabase.co");
  });

  it("no-ops (canonical=null, no throw) when the target block is absent", () => {
    // Keyless / CI: no namespaced vars at all. Must not throw, so the CI
    // `npm run build` check stays green.
    const { target, canonical } = resolveSupabaseEnv({});

    expect(target).toBe("stage");
    expect(canonical).toBeNull();
  });

  it("throws, naming the missing key, when the URL is present but the service-role key is missing", () => {
    expect(() =>
      resolveSupabaseEnv({
        SUPABASE_STAGE_URL: "https://stage.supabase.co",
        SUPABASE_STAGE_ANON_KEY: "stage-anon",
      }),
    ).toThrow(/SUPABASE_STAGE_SERVICE_ROLE_KEY/);
  });

  it("throws, naming the missing key, when the URL is present but the anon key is missing", () => {
    expect(() =>
      resolveSupabaseEnv({
        SUPABASE_STAGE_URL: "https://stage.supabase.co",
        SUPABASE_STAGE_SERVICE_ROLE_KEY: "stage-service-role",
      }),
    ).toThrow(/SUPABASE_STAGE_ANON_KEY/);
  });

  it("throws on an invalid SUPABASE_TARGET", () => {
    expect(() =>
      resolveSupabaseEnv({ SUPABASE_TARGET: "production", ...prodBlock }),
    ).toThrow(/SUPABASE_TARGET/);
  });
});

describe("formatEnvLocal", () => {
  const canonical = {
    SUPABASE_URL: "https://stage.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "stage-service-role",
    SUPABASE_ANON_KEY: "stage-anon",
    SUPABASE_STORAGE_BUCKET: "chore-photos",
    NEXT_PUBLIC_SUPABASE_URL: "https://stage.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "stage-anon",
  };

  it("emits a do-not-edit banner naming the generator and the active target", () => {
    const body = formatEnvLocal("stage", canonical);

    expect(body).toMatch(/GENERATED/);
    expect(body).toMatch(/do not edit/i);
    expect(body).toMatch(/write-supabase-env-local\.mjs/);
    expect(body).toMatch(/STAGE/);
  });

  it("emits one KEY=VALUE line per canonical entry and ends with a newline", () => {
    const body = formatEnvLocal("stage", canonical);

    for (const [key, value] of Object.entries(canonical)) {
      expect(body).toContain(`${key}=${value}`);
    }
    expect(body.endsWith("\n")).toBe(true);
  });
});
