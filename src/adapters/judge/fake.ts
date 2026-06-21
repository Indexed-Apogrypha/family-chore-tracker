import type { JudgePort, Verdict } from "@/ports/judge";

/** FNV-1a (32-bit) — a small, stable string hash for deterministic verdicts. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The keyless judge (design §1, §5). Returns a deterministic, advisory
 * {@link Verdict} seeded from the chore title — no network, no AI spend — so the
 * practice mode and the test suite behave identically every run. Swappable with
 * the real Anthropic/Gemini adapters at the composition root.
 */
export function fakeJudge(): JudgePort {
  return {
    async evaluate(_photo, chore): Promise<Verdict> {
      const seed = hash(chore.title);
      const pass = seed % 2 === 0;
      const confidence = Number((0.6 + (seed % 40) / 100).toFixed(2));
      return {
        pass,
        confidence,
        reasoning: pass
          ? `Looks done — '${chore.title}' appears complete.`
          : `Not convinced '${chore.title}' is finished; a parent should take a look.`,
        model: "fake",
      };
    },
  };
}
