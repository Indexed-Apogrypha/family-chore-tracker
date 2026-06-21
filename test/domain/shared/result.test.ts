import { describe, expect, expectTypeOf, it } from "vitest";

import { err, ok, type Result } from "@/domain/shared/result";

describe("Result", () => {
  it("ok wraps a success value and narrows on the discriminant", () => {
    const result = ok(42);
    expect(result).toEqual({ ok: true, value: 42 });
    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<number>();
    }
  });

  it("err wraps an AppError and is assignable to any Result<T>", () => {
    const result: Result<string> = err({ code: "bad_pin" });
    expect(result).toEqual({ ok: false, error: { code: "bad_pin" } });
    if (!result.ok) {
      expect(result.error.code).toBe("bad_pin");
    }
  });
});
