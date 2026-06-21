import { describe, expect, it } from "vitest";

import {
  familyId,
  type FamilyId,
  memberId,
  type MemberId,
} from "@/domain/shared/ids";

describe("branded ids", () => {
  it("smart constructors preserve the underlying string value", () => {
    expect(familyId("fam_1")).toBe("fam_1");
    expect(memberId("mem_1")).toBe("mem_1");
  });

  it("distinct brands are not interchangeable", () => {
    const family: FamilyId = familyId("fam_1");
    // @ts-expect-error a FamilyId must not be assignable to a MemberId
    const member: MemberId = family;
    void member;
  });
});
