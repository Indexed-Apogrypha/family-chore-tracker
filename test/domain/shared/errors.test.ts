import { describe, expect, it } from "vitest";

import type { AppError } from "@/domain/shared/errors";

// An exhaustive matcher over AppError. The `never` default is the compile-time
// guarantee from design §8.2: if a new variant is added to the closed set
// without a case here, `tsc` (the typecheck gate) fails. This test therefore
// asserts both the runtime payloads and the exhaustiveness of the union.
function describeError(error: AppError): string {
  switch (error.code) {
    case "not_found":
      return `not_found:${error.entity}:${error.id}`;
    case "forbidden":
      return `forbidden:${error.need}`;
    case "invalid_transition":
      return `invalid_transition:${error.from}->${error.to}`;
    case "bad_pin":
      return "bad_pin";
    case "judge_unavailable":
      return "judge_unavailable";
    case "storage_unavailable":
      return "storage_unavailable";
    case "persistence_unavailable":
      return "persistence_unavailable";
    case "validation":
      return `validation:${error.field}:${error.message}`;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

describe("AppError", () => {
  it("carries each variant's payload and is exhaustively switchable", () => {
    expect(describeError({ code: "not_found", entity: "family", id: "f1" })).toBe(
      "not_found:family:f1",
    );
    expect(describeError({ code: "forbidden", need: "parent" })).toBe(
      "forbidden:parent",
    );
    expect(
      describeError({ code: "invalid_transition", from: "todo", to: "approved" }),
    ).toBe("invalid_transition:todo->approved");
    expect(describeError({ code: "bad_pin" })).toBe("bad_pin");
    expect(describeError({ code: "judge_unavailable" })).toBe("judge_unavailable");
    expect(describeError({ code: "storage_unavailable" })).toBe(
      "storage_unavailable",
    );
    expect(describeError({ code: "persistence_unavailable" })).toBe(
      "persistence_unavailable",
    );
    expect(
      describeError({ code: "validation", field: "pin", message: "too short" }),
    ).toBe("validation:pin:too short");
  });
});
