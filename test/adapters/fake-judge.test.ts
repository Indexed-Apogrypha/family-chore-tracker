import { describe, expect, it } from "vitest";

import { fakeJudge } from "@/adapters/judge/fake";
import type { PhotoRef } from "@/ports/photo-storage";

const photo: PhotoRef = { path: "f1/i1/s1.jpg" };

// The Verdict *shape* contract lives in test/contract/judge.contract.ts. These
// cover the fake judge's defining property: determinism (a real judge is not).
describe("fakeJudge (determinism)", () => {
  it("references the chore and is tagged model 'fake'", async () => {
    const verdict = await fakeJudge().evaluate(photo, { title: "Dishes" });
    expect(verdict.model).toBe("fake");
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
    expect(new Set(verdicts.map((v) => `${v.pass}:${v.confidence}`)).size).toBeGreaterThan(
      1,
    );
  });
});
