import { describe, expect, it } from "vitest";

import { errorBody, errorStatus, readJson } from "@/app/api/http";
import type { AppError } from "@/domain/shared/errors";
import { submissionId } from "@/domain/shared/ids";

/**
 * The shared HTTP edge (#139, first slice): one mapping from the closed
 * `AppError` set to status + body, exercised over every variant so a new
 * variant can't silently fall through to a wrong status.
 */

describe("errorStatus — the closed AppError set maps exhaustively", () => {
  const cases: Array<[AppError, number]> = [
    [{ code: "validation", field: "title", message: "title is required." }, 400],
    [{ code: "bad_pin" }, 401],
    [{ code: "forbidden", need: "parent" }, 403],
    [{ code: "not_found", entity: "member", id: "m1" }, 404],
    [{ code: "invalid_transition", from: "approved", to: "rejected" }, 409],
    [{ code: "judge_unavailable" }, 503],
    [{ code: "storage_unavailable" }, 503],
    [{ code: "persistence_unavailable" }, 503],
  ];
  it.each(cases)("%o → %d", (error, status) => {
    expect(errorStatus(error)).toBe(status);
  });
});

describe("errorBody — variant details survive to the client", () => {
  it("validation carries field + message so forms can say why", () => {
    expect(
      errorBody({ code: "validation", field: "title", message: "too long" }),
    ).toEqual({ error: "validation", field: "title", message: "too long" });
  });

  it("judge_unavailable carries the submissionId to retry against (§7.2)", () => {
    const id = submissionId("sub-1");
    expect(errorBody({ code: "judge_unavailable", submissionId: id })).toEqual({
      error: "judge_unavailable",
      submissionId: id,
    });
  });

  it("everything else is just the code", () => {
    expect(errorBody({ code: "bad_pin" })).toEqual({ error: "bad_pin" });
  });
});

describe("readJson — defensive body parsing", () => {
  const jsonRequest = (body: string, headers: Record<string, string> = {}) =>
    new Request("http://test.local/api", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });

  it("parses a well-formed body", async () => {
    expect(await readJson(jsonRequest('{"a":1}'))).toEqual({ a: 1 });
  });

  it("maps a malformed body to null instead of throwing a 500", async () => {
    expect(await readJson(jsonRequest("{nope"))).toBeNull();
  });

  it("rejects a body whose declared size exceeds the bound", async () => {
    const oversized = jsonRequest('{"a":1}', {
      "content-length": String(10 * 1024 * 1024),
    });
    expect(await readJson(oversized)).toBeNull();
  });
});
