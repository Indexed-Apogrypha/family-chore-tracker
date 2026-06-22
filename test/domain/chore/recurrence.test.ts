import { describe, expect, it } from "vitest";

import { isDue, weekday } from "@/domain/chore/recurrence";
import type { ChoreTemplate } from "@/domain/chore/types";
import type { Recurrence } from "@/domain/shared/enums";
import { familyId, memberId, templateId } from "@/domain/shared/ids";
import type { IsoDate } from "@/ports/clock";

/**
 * A template carrying only the fields `isDue` reads (recurrence); the rest are
 * filled with plausible values so the test reads as a real template (§6, §7.3).
 */
function template(recurrence: Recurrence): ChoreTemplate {
  return {
    id: templateId("tmpl_1"),
    familyId: familyId("fam_1"),
    title: "Make the bed",
    points: 5,
    recurrence,
    assignedMemberId: memberId("mem_1"),
    active: true,
  };
}

// A reference week of ISO dates by weekday (0 = Sunday … 6 = Saturday).
// 2026-06-21 is a Sunday.
const SUNDAY: IsoDate = "2026-06-21";
const MONDAY: IsoDate = "2026-06-22";
const WEDNESDAY: IsoDate = "2026-06-24";
const FRIDAY: IsoDate = "2026-06-26";
const SATURDAY: IsoDate = "2026-06-27";

describe("isDue — daily recurrence", () => {
  it("is due on every date", () => {
    const daily = template({ kind: "daily" });
    for (const date of [SUNDAY, MONDAY, WEDNESDAY, FRIDAY, SATURDAY]) {
      expect(isDue(daily, date)).toBe(true);
    }
  });
});

describe("isDue — weekly recurrence", () => {
  it("is due only on listed weekdays (0 = Sunday … 6 = Saturday)", () => {
    // Mon / Wed / Fri.
    const mwf = template({ kind: "weekly", days: [1, 3, 5] });
    expect(isDue(mwf, MONDAY)).toBe(true);
    expect(isDue(mwf, WEDNESDAY)).toBe(true);
    expect(isDue(mwf, FRIDAY)).toBe(true);

    expect(isDue(mwf, SUNDAY)).toBe(false);
    expect(isDue(mwf, SATURDAY)).toBe(false);
  });

  it("with no listed days is never due", () => {
    const never = template({ kind: "weekly", days: [] });
    for (const date of [SUNDAY, MONDAY, WEDNESDAY, FRIDAY, SATURDAY]) {
      expect(isDue(never, date)).toBe(false);
    }
  });
});

describe("isDue — one-off (none)", () => {
  it("is never due by recurrence (one-offs are created explicitly)", () => {
    const oneOff = template({ kind: "none" });
    for (const date of [SUNDAY, MONDAY, WEDNESDAY, FRIDAY, SATURDAY]) {
      expect(isDue(oneOff, date)).toBe(false);
    }
  });
});

describe("weekday", () => {
  it("maps ISO dates to 0=Sunday … 6=Saturday, timezone-independent", () => {
    expect(weekday(SUNDAY)).toBe(0);
    expect(weekday(MONDAY)).toBe(1);
    expect(weekday(WEDNESDAY)).toBe(3);
    expect(weekday(FRIDAY)).toBe(5);
    expect(weekday(SATURDAY)).toBe(6);
  });
});
