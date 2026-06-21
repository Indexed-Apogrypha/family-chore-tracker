import { describe, expect, it } from "vitest";

import type { JudgePort } from "@/ports/judge";
import type { PhotoRef } from "@/ports/photo-storage";

const photo: PhotoRef = { path: "f1/i1/s1.jpg" };

/**
 * The JudgePort contract (design §5): every judge — fake, Anthropic, Gemini —
 * must return a well-formed advisory {@link import("@/ports/judge").Verdict}.
 * Determinism is fake-specific and lives with the fake adapter's own tests.
 */
export function runJudgeContract(label: string, makeJudge: () => JudgePort): void {
  describe(`JudgePort contract — ${label}`, () => {
    it("returns a well-formed Verdict", async () => {
      const verdict = await makeJudge().evaluate(photo, { title: "Dishes" });
      expect(typeof verdict.pass).toBe("boolean");
      expect(verdict.confidence).toBeGreaterThanOrEqual(0);
      expect(verdict.confidence).toBeLessThanOrEqual(1);
      expect(verdict.reasoning.length).toBeGreaterThan(0);
      expect(verdict.model.length).toBeGreaterThan(0);
    });
  });
}
