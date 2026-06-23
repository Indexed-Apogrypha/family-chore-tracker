import type Anthropic from "@anthropic-ai/sdk";
import type { GoogleGenAI } from "@google/genai";

import { anthropicJudge } from "@/adapters/judge/anthropic";
import { type FetchLike, geminiJudge } from "@/adapters/judge/gemini";

import { runJudgeContract } from "./judge.contract";

/**
 * Every real judge adapter must satisfy the shared JudgePort contract (design §5,
 * §10) — the same suite the fake judge passes in `in-memory.test.ts`. Exercised
 * here with injected fakes so it runs in CI with no network and no AI spend; the
 * Gemini path is additionally live-verified against its free tier out of band.
 */

const VERDICT_JSON = JSON.stringify({
  pass: true,
  confidence: 0.7,
  reasoning: "looks done",
});
const resolveImageUrl = async () => "https://signed.test/photo.jpg";

const anthropicClient = {
  messages: {
    create: async () => ({
      model: "claude-sonnet-4-6",
      content: [{ type: "text", text: VERDICT_JSON }],
    }),
  },
} as unknown as Anthropic;

const geminiClient = {
  models: {
    generateContent: async () => ({ text: VERDICT_JSON }),
  },
} as unknown as GoogleGenAI;

const fakeFetch: FetchLike = async () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer as ArrayBuffer,
  headers: { get: () => "image/jpeg" },
});

runJudgeContract("anthropicJudge", () =>
  anthropicJudge({
    client: anthropicClient,
    model: "claude-sonnet-4-6",
    resolveImageUrl,
  }),
);

runJudgeContract("geminiJudge", () =>
  geminiJudge({
    client: geminiClient,
    model: "gemini-2.5-flash",
    resolveImageUrl,
    fetchImpl: fakeFetch,
  }),
);
