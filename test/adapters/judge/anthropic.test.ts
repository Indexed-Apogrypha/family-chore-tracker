import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { anthropicJudge } from "@/adapters/judge/anthropic";
import type { PhotoRef } from "@/ports/photo-storage";

/**
 * The Anthropic judge is exercised with an injected fake client (the project's DI
 * style — no module mocking, no network), so these tests never make a real API
 * call and cost nothing. They pin the response→Verdict mapping and the request
 * shape; the live adapter is covered by the gated judge contract (#68).
 */

const PHOTO: PhotoRef = { path: "fam/inst/sub.jpg" };
const resolveImageUrl = async (photo: PhotoRef) => `https://signed.test/${photo.path}`;

/** A fake Anthropic client whose `messages.create` returns a canned message. */
function clientReturning(
  text: string,
  model: string | undefined = "claude-sonnet-4-6",
): { client: Anthropic; calls: unknown[] } {
  const calls: unknown[] = [];
  const client = {
    messages: {
      create: async (params: unknown) => {
        calls.push(params);
        return { model, content: [{ type: "text", text }] } as unknown as Anthropic.Message;
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

describe("anthropicJudge (advisory vision verdict, §5)", () => {
  it("maps a JSON verdict response to a Verdict", async () => {
    const { client } = clientReturning(
      JSON.stringify({ pass: true, confidence: 0.82, reasoning: "looks clean" }),
      "claude-sonnet-4-6-xyz",
    );
    const judge = anthropicJudge({ client, model: "claude-sonnet-4-6", resolveImageUrl });

    const verdict = await judge.evaluate(PHOTO, { title: "Sweep" });

    expect(verdict.pass).toBe(true);
    expect(verdict.confidence).toBeCloseTo(0.82);
    expect(verdict.reasoning).toBe("looks clean");
    expect(verdict.model).toBe("claude-sonnet-4-6-xyz");
  });

  it("clamps confidence into [0,1] and coerces a non-finite value to 0", async () => {
    const high = clientReturning(
      JSON.stringify({ pass: false, confidence: 1.7, reasoning: "x" }),
    );
    expect(
      (await anthropicJudge({ client: high.client, model: "m", resolveImageUrl }).evaluate(
        PHOTO,
        { title: "T" },
      )).confidence,
    ).toBe(1);

    const bad = clientReturning(
      JSON.stringify({ pass: false, confidence: "nope", reasoning: "x" }),
    );
    expect(
      (await anthropicJudge({ client: bad.client, model: "m", resolveImageUrl }).evaluate(
        PHOTO,
        { title: "T" },
      )).confidence,
    ).toBe(0);
  });

  it("tolerates prose / code fences around the JSON", async () => {
    const { client } = clientReturning(
      'Here is my verdict:\n```json\n{"pass": true, "confidence": 0.5, "reasoning": "ok"}\n```\n',
    );
    const judge = anthropicJudge({ client, model: "m", resolveImageUrl });
    expect((await judge.evaluate(PHOTO, { title: "T" })).pass).toBe(true);
  });

  it("sends the signed image URL and chore context to the model", async () => {
    const { client, calls } = clientReturning(
      JSON.stringify({ pass: true, confidence: 1, reasoning: "" }),
    );
    const judge = anthropicJudge({ client, model: "claude-sonnet-4-6", resolveImageUrl });

    await judge.evaluate({ path: "f/i/s.png" }, { title: "Make bed", description: "tuck corners" });

    const params = calls[0] as {
      model: string;
      messages: { content: { type: string; source?: { url: string }; text?: string }[] }[];
    };
    expect(params.model).toBe("claude-sonnet-4-6");
    const content = params.messages[0].content;
    expect(content.find((c) => c.type === "image")?.source?.url).toBe(
      "https://signed.test/f/i/s.png",
    );
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("Make bed");
    expect(text).toContain("tuck corners");
  });

  it("falls back to the configured model when the response omits one", async () => {
    const { client } = clientReturning(
      JSON.stringify({ pass: true, confidence: 1, reasoning: "" }),
      undefined,
    );
    const judge = anthropicJudge({ client, model: "claude-sonnet-4-6", resolveImageUrl });
    expect((await judge.evaluate(PHOTO, { title: "T" })).model).toBe("claude-sonnet-4-6");
  });

  it("propagates infra failures (the caller maps them to judge_unavailable)", async () => {
    const client = {
      messages: {
        create: async () => {
          throw new Error("api down");
        },
      },
    } as unknown as Anthropic;
    const judge = anthropicJudge({ client, model: "m", resolveImageUrl });
    await expect(judge.evaluate(PHOTO, { title: "T" })).rejects.toThrow();
  });
});
