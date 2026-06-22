import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { memberContext } from "@/app-session/context";
import { buildPorts } from "@/composition/container";
import { createServiceRoleClient } from "@/composition/supabase";
import { findActingParent } from "@/usecases/auth";

/**
 * Proves #49's acceptance — "a parent can sign up and log in against Supabase
 * Auth" — end-to-end against the live project, plus the signup bootstrap and
 * login ctx-derivation against the real DB. Gated (`npm run test:supabase`).
 *
 * ⚠️ Creates/deletes a real auth user and wipes accounts tables — dev project only.
 */
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!url || !serviceRoleKey || !anonKey) {
  throw new Error(
    "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY must be set (see .env).",
  );
}

const admin = createServiceRoleClient(url, serviceRoleKey);
const ports = buildPorts(); // env-selected: Supabase members (+ lazy judge)
const email = `m1-auth+${crypto.randomUUID()}@example.com`;
const password = "Test-Password-123!";
const NO_ID = "00000000-0000-0000-0000-000000000000";
let userId = "";

afterAll(async () => {
  await admin.from("members").delete().neq("id", NO_ID);
  await admin.from("families").delete().neq("id", NO_ID);
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("parent auth + ctx derivation (live Supabase, §3.1)", () => {
  it("authenticates a parent, bootstraps a family, and derives a context", async () => {
    // A confirmed account (created server-side, so independent of the project's
    // "Confirm email" setting).
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    userId = created.data.user?.id ?? "";
    expect(userId).not.toBe("");

    // Log in via the anon client → real session + identity.
    const anon = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const login = await anon.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    expect((await anon.auth.getUser()).data.user?.email).toBe(email);

    // Signup bootstrap + login ctx derivation against the real DB.
    expect(await ports.members.findByAuthUserId(userId)).toBeNull();
    const { founder } = await ports.members.createFamily({
      name: "Auth Fam",
      founderDisplayName: "Parent",
      authUserId: userId,
    });
    const parent = await findActingParent(ports, userId);
    expect(parent.ok).toBe(true);
    if (parent.ok) {
      expect(parent.value.id).toBe(founder.id);
      expect(memberContext(parent.value).actor).toEqual({
        kind: "parent",
        memberId: founder.id,
      });
    }
  });
});
