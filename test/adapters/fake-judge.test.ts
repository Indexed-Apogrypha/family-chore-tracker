import { describe, expect, it } from "vitest";

import { fakeJudge } from "@/adapters/judge/fake";
import type { PhotoRef } from "@/ports/photo-storage";

const photo: PhotoRef = { path: "f1/i1/s1.jpg" };

describe("fakeJudge", () => {
  it("returns a Verdict tagged 'fake' with a confidence in [0,1]", async () => {
    const verdict = await fakeJudge().evaluate(photo, { title: "Dishes" });
    expect(verdict.model).toBe("fake");
    expect(typeof verdict.pass).toBe("boolean");
    expect(verdict.confidence).toBeGreaterThanOrEqual(0);
    expect(verdict.confidence).toBeLessThanOrEqual(1);
    expect(verdict.reasoning).toContain("Dishes");
  });

  it("is deterministic: the same chore yields the same verdict", async () => {
    const judge = fakeJudge();
    const a = await judge.evaluate(photo, { title: "Make the bed" });
    const b = await judge.evaluate(photo, { title: "Make the bed" });
    expect(a).toEqual(b);
  });

  it("discriminates across different chores (seeded by title)", async () => {
    const judge = fakeJudge();
    const titles = ["Dishes", "Make the bed", "Take out trash", "Vacuum", "Laundry"];
    const verdicts = await Promise.all(
      titles.map((title) => judge.evaluate(photo, { title })),
    );
    const distinct = new Set(verdicts.map((v) => `${v.pass}:${v.confidence}`));
    expect(distinct.size).toBeGreaterThan(1);
  });
});
