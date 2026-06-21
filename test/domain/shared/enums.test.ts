import { describe, expect, it } from "vitest";

import type {
  InstanceStatus,
  Recurrence,
  SubmissionStatus,
} from "@/domain/shared/enums";

describe("status enums and recurrence", () => {
  it("instance status admits exactly the four lifecycle states", () => {
    const states: InstanceStatus[] = [
      "todo",
      "evaluating",
      "pending_review",
      "approved",
    ];
    expect(states).toHaveLength(4);
    // @ts-expect-error 'rejected' lives on the submission, not the instance (§7.1)
    const bad: InstanceStatus = "rejected";
    void bad;
  });

  it("submission status includes the terminal rejected state", () => {
    const states: SubmissionStatus[] = [
      "evaluating",
      "pending_review",
      "approved",
      "rejected",
    ];
    expect(states).toContain("rejected");
  });

  it("recurrence is a discriminated union over none/daily/weekly", () => {
    const weekly: Recurrence = { kind: "weekly", days: [1, 3, 5] };
    expect(weekly).toEqual({ kind: "weekly", days: [1, 3, 5] });
  });
});
