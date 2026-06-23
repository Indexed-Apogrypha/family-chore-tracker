import type { GoogleGenAI } from "@google/genai";
import { describe, expect, it } from "vitest";

import { type FetchLike, geminiJudge } from "@/adapters/judge/gemini";
import type { PhotoRef } from "@/ports/photo-storage";

/**
 * Gemini judge exercised with an injected fake client + fake fetch (the project's
 * DI style — no network). Gemini's free tier is the only path used for any live
 * smoke; these unit tests cost nothing.
 */

const PHOTO: PhotoRef = { path: "fam/inst/sub.jpg" };
const resolveImageUrl = async (p: PhotoRef) => `https://signed.test/${p.path}`;

/** A fake fetch returning the given bytes + content-type. */
function fakeFetch(
  bytes = new Uint8Array([1, 2, 3]),
  contentType: string | null = "image/png",
  ok = true,
): FetchLike {
  return async () => ({
    ok,
    status: ok ? 200 : 500,
    arrayBuffer: async () => bytes.buffer as ArrayBuffer,
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? contentType : null) },
  });
}

/** A fake GenAI client whose `models.generateContent` returns canned text. */
function clientReturning(text: string): { client: GoogleGenAI; calls: unknown[] } {
  const calls: unknown[] = [];
  const client = {
    models: {
      generateContent: async (params: unknown) => {
        calls.push(params);
        return { text } as { text: string };
      },
    },
  } as unknown as GoogleGenAI;
  return { client, calls };
}

describe("geminiJudge (advisory vision verdict, §5)", () => {
  it("maps a JSON verdict response to a Verdict tagged with the model", async () => {
    const { client } = clientReturning(
      JSON.stringify({ pass: false, confidence: 0.4, reasoning: "still messy" }),
    );
    const judge = geminiJudge({
      client,
      model: "gemini-2.5-flash",
      resolveImageUrl,
      fetchImpl: fakeFetch(),
    });

    const verdict = await judge.evaluate(PHOTO, { title: "Tidy room" });

    expect(verdict.pass).toBe(false);
    expect(verdict.confidence).toBeCloseTo(0.4);
    expect(verdict.reasoning).toBe("still messy");
    expect(verdict.model).toBe("gemini-2.5-flash");
  });

  it("fetches the photo and sends inline base64 + the chore prompt + system instruction", async () => {
    const { client, calls } = clientReturning(
      JSON.stringify({ pass: true, confidence: 1, reasoning: "" }),
    );
    const judge = geminiJudge({
      client,
      model: "gemini-2.5-flash",
      resolveImageUrl,
      fetchImpl: fakeFetch(new Uint8Array([1, 2, 3]), "image/png"),
    });

    await judge.evaluate({ path: "f/i/s.png" }, { title: "Make bed" });

    const params = calls[0] as {
      model: string;
      contents: { parts: { inlineData?: { data: string; mimeType: string }; text?: string }[] }[];
      config: { systemInstruction: string };
    };
    const parts = params.contents[0].parts;
    expect(parts[0].inlineData?.data).toBe(Buffer.from([1, 2, 3]).toString("base64"));
    expect(parts[0].inlineData?.mimeType).toBe("image/png");
    expect(parts[1].text).toContain("Make bed");
    expect(params.config.systemInstruction).toContain("advisory");
  });

  it("throws when the photo fetch fails (caller maps to judge_unavailable)", async () => {
    const { client } = clientReturning(JSON.stringify({ pass: true, confidence: 1, reasoning: "" }));
    const judge = geminiJudge({
      client,
      model: "m",
      resolveImageUrl,
      fetchImpl: fakeFetch(new Uint8Array([1]), null, false),
    });
    await expect(judge.evaluate(PHOTO, { title: "T" })).rejects.toThrow();
  });

  it("propagates model failures", async () => {
    const client = {
      models: {
        generateContent: async () => {
          throw new Error("genai down");
        },
      },
    } as unknown as GoogleGenAI;
    const judge = geminiJudge({ client, model: "m", resolveImageUrl, fetchImpl: fakeFetch() });
    await expect(judge.evaluate(PHOTO, { title: "T" })).rejects.toThrow();
  });
});
