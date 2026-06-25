import { beforeEach, describe, expect, it, vi } from "vitest";

import { CookieJar } from "./route-harness";

/**
 * Integration tests for the HTTP edge — the API route handlers under
 * `src/app/api/**\/route.ts` (#139). They drive the *real* handlers with a
 * constructed `Request` and assert the `Response` status + JSON body, covering
 * the two things the edge owns:
 *   1. auth/ctx wiring — cookies → `deriveContext` → `ctx.actor`/`ctx.familyId`;
 *   2. the closed `AppError` → HTTP-status mapping each route declares.
 *
 * Everything runs in keyless practice mode (fake judge + in-memory stores), the
 * executable spec the suite already pins. The handlers read auth from cookies
 * via the server-only `next/headers`, which can't load in the node test env, so
 * we mock it with an in-memory {@link CookieJar} the harness reads/writes — no
 * production test-only seam needed.
 */

// `vi.hoisted` so the single shared jar exists before the hoisted `vi.mock`
// factory (which closes over it) runs.
const { jar } = vi.hoisted(() => {
  // Inlined to avoid importing app code inside the hoisted block; the exported
  // CookieJar (used for the type) has the identical shape.
  class Jar {
    private store = new Map<string, string>();
    get(name: string) {
      const value = this.store.get(name);
      return value === undefined ? undefined : { name, value };
    }
    getAll() {
      return [...this.store.entries()].map(([name, value]) => ({ name, value }));
    }
    set(name: string, value: string) {
      this.store.set(name, value);
    }
    delete(name: string) {
      this.store.delete(name);
    }
    clear() {
      this.store.clear();
    }
  }
  return { jar: new Jar() as unknown as CookieJar };
});

vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

// Imported after the mock is registered so the handlers' `next/headers` is faked.
import { resetServerPorts, seedAuthenticatedSession } from "./route-harness";
import { PRACTICE_KID_PIN } from "@/composition/session";

import { POST as practicePost } from "@/app/api/auth/practice/route";
import { POST as membersPost } from "@/app/api/members/route";
import { POST as templatesPost } from "@/app/api/templates/route";
import { POST as templatesActivePost } from "@/app/api/templates/active/route";
import { POST as decidePost } from "@/app/api/review/decide/route";
import { POST as switchPost } from "@/app/api/profile/switch/route";
import { POST as submissionsPost } from "@/app/api/submissions/route";

/** A JSON `Request` for a handler that reads `request.json()`. */
function jsonRequest(body: unknown): Request {
  return new Request("http://test.local/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Read a handler `Response` as `{ status, body }`. */
async function read(
  res: Response,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  jar.clear();
  resetServerPorts();
});

describe("POST /api/auth/practice (keyless bootstrap)", () => {
  it("seeds a family and anchors the practice + active-member cookies", async () => {
    const { status, body } = await read(await practicePost());

    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
    // The session is now drivable: a follow-up authenticated route works.
    expect(jar.get("practice_family")).toBeDefined();
    expect(jar.get("active_member")).toBeDefined();
  });
});

describe("auth wiring: unauthenticated → 401", () => {
  it("rejects /api/members with no session cookie", async () => {
    const { status, body } = await read(
      await membersPost(jsonRequest({ displayName: "Bo", pin: "4321" })),
    );

    expect(status).toBe(401);
    expect(body).toEqual({ error: "unauthenticated" });
  });

  it("rejects /api/templates with no session cookie", async () => {
    const { status, body } = await read(
      await templatesPost(jsonRequest({ title: "Dishes", points: 5 })),
    );

    expect(status).toBe(401);
    expect(body).toEqual({ error: "unauthenticated" });
  });
});

describe("POST /api/members (add kid)", () => {
  it("success path: a parent adds a kid (ctx defaults to parent)", async () => {
    await seedAuthenticatedSession(jar);

    const { status, body } = await read(
      await membersPost(jsonRequest({ displayName: "Bo", pin: "4321" })),
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.member).toMatchObject({ displayName: "Bo", kind: "kid" });
    // The PIN hash never leaves the server.
    expect(body.member).not.toHaveProperty("pin_hash");
  });

  it("validation → 400: blank pin", async () => {
    await seedAuthenticatedSession(jar);

    const { status, body } = await read(
      await membersPost(jsonRequest({ displayName: "Bo", pin: "" })),
    );

    expect(status).toBe(400);
    expect(body).toEqual({ error: "validation" });
  });

  it("forbidden → 403: a kid actor cannot add a kid", async () => {
    const seeded = await seedAuthenticatedSession(jar);
    // Drive ctx to the kid actor by pointing the active-member cookie at the kid.
    jar.set("active_member", seeded.kid.id);

    const { status, body } = await read(
      await membersPost(jsonRequest({ displayName: "Bo", pin: "4321" })),
    );

    expect(status).toBe(403);
    expect(body).toEqual({ error: "forbidden" });
  });
});

describe("POST /api/templates (create template)", () => {
  it("not_found → 404: unknown assignee", async () => {
    await seedAuthenticatedSession(jar);

    const { status, body } = await read(
      await templatesPost(
        jsonRequest({
          title: "Dishes",
          points: 5,
          recurrence: { kind: "none" },
          assignedMemberId: "member_does_not_exist",
        }),
      ),
    );

    expect(status).toBe(404);
    expect(body).toEqual({ error: "not_found" });
  });

  it("validation → 400: blank title", async () => {
    const seeded = await seedAuthenticatedSession(jar);

    const { status, body } = await read(
      await templatesPost(
        jsonRequest({
          title: "",
          points: 5,
          recurrence: { kind: "none" },
          assignedMemberId: seeded.kid.id,
        }),
      ),
    );

    expect(status).toBe(400);
    expect(body).toEqual({ error: "validation" });
  });

  it("success path: a parent creates a template for the kid", async () => {
    const seeded = await seedAuthenticatedSession(jar);

    const { status, body } = await read(
      await templatesPost(
        jsonRequest({
          title: "Make bed",
          points: 3,
          recurrence: { kind: "daily" },
          assignedMemberId: seeded.kid.id,
        }),
      ),
    );

    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});

describe("POST /api/templates/active (activate/deactivate)", () => {
  it("missing_template → 400 before auth runs", async () => {
    await seedAuthenticatedSession(jar);

    const { status, body } = await read(
      await templatesActivePost(jsonRequest({ active: true })),
    );

    expect(status).toBe(400);
    expect(body).toEqual({ error: "missing_template" });
  });

  it("not_found → 404: unknown template", async () => {
    await seedAuthenticatedSession(jar);

    const { status, body } = await read(
      await templatesActivePost(
        jsonRequest({ templateId: "template_nope", active: false }),
      ),
    );

    expect(status).toBe(404);
    expect(body).toEqual({ error: "not_found" });
  });
});

describe("POST /api/review/decide (parent approve/reject)", () => {
  it("validation → 400: bad decision value", async () => {
    await seedAuthenticatedSession(jar);

    const { status, body } = await read(
      await decidePost(jsonRequest({ submissionId: "s1", decision: "maybe" })),
    );

    expect(status).toBe(400);
    expect(body).toEqual({ error: "validation" });
  });

  it("not_found → 404: unknown submission", async () => {
    await seedAuthenticatedSession(jar);

    const { status, body } = await read(
      await decidePost(
        jsonRequest({ submissionId: "submission_nope", decision: "approve" }),
      ),
    );

    expect(status).toBe(404);
    expect(body).toEqual({ error: "not_found" });
  });

  it("forbidden → 403: a kid actor cannot decide", async () => {
    const seeded = await seedAuthenticatedSession(jar);
    jar.set("active_member", seeded.kid.id);

    const { status, body } = await read(
      await decidePost(
        jsonRequest({ submissionId: "submission_any", decision: "approve" }),
      ),
    );

    expect(status).toBe(403);
    expect(body).toEqual({ error: "forbidden" });
  });
});

describe("POST /api/profile/switch (shared-device profile switch)", () => {
  it("missing_member → 400", async () => {
    await seedAuthenticatedSession(jar);

    const { status, body } = await read(await switchPost(jsonRequest({})));

    expect(status).toBe(400);
    expect(body).toEqual({ error: "missing_member" });
  });

  it("bad_pin → 401: wrong kid PIN", async () => {
    const seeded = await seedAuthenticatedSession(jar);

    const { status, body } = await read(
      await switchPost(
        jsonRequest({ memberId: seeded.kid.id, pin: "0000" }),
      ),
    );

    expect(status).toBe(401);
    expect(body).toEqual({ error: "bad_pin" });
  });

  it("not_found → 404: unknown member", async () => {
    await seedAuthenticatedSession(jar);

    const { status, body } = await read(
      await switchPost(jsonRequest({ memberId: "member_nope", pin: "x" })),
    );

    expect(status).toBe(404);
    expect(body).toEqual({ error: "not_found" });
  });

  it("success path: switch to the kid with the right PIN sets active_member", async () => {
    const seeded = await seedAuthenticatedSession(jar);

    const { status, body } = await read(
      await switchPost(
        jsonRequest({ memberId: seeded.kid.id, pin: PRACTICE_KID_PIN }),
      ),
    );

    expect(status).toBe(200);
    expect(body.member).toMatchObject({ id: seeded.kid.id, kind: "kid" });
    expect(jar.get("active_member")?.value).toBe(seeded.kid.id);
  });
});

describe("POST /api/submissions (multipart photo upload)", () => {
  it("validation → 400: no photo file", async () => {
    await seedAuthenticatedSession(jar);

    const form = new FormData();
    form.set("instanceId", "instance_1");
    const req = new Request("http://test.local/api/submissions", {
      method: "POST",
      body: form,
    });

    const { status, body } = await read(await submissionsPost(req));

    expect(status).toBe(400);
    expect(body).toEqual({ error: "validation" });
  });

  it("too_large → 413: oversized declared content-length", async () => {
    await seedAuthenticatedSession(jar);

    const req = new Request("http://test.local/api/submissions", {
      method: "POST",
      headers: { "content-length": String(11 * 1024 * 1024) },
      body: new FormData(),
    });

    const { status, body } = await read(await submissionsPost(req));

    expect(status).toBe(413);
    expect(body).toEqual({ error: "too_large" });
  });

  it("validation → 400: disallowed MIME type", async () => {
    await seedAuthenticatedSession(jar);

    const form = new FormData();
    form.set("instanceId", "instance_1");
    form.set(
      "photo",
      new File(["not-an-image"], "x.txt", { type: "text/plain" }),
    );
    const req = new Request("http://test.local/api/submissions", {
      method: "POST",
      body: form,
    });

    const { status, body } = await read(await submissionsPost(req));

    expect(status).toBe(400);
    expect(body).toEqual({ error: "validation" });
  });
});
