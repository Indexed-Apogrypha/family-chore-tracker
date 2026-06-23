import type { GoogleGenAI } from "@google/genai";

import type { ChoreContext, JudgePort, Verdict } from "@/ports/judge";
import type { PhotoRef } from "@/ports/photo-storage";

import {
  JUDGE_SYSTEM_PROMPT,
  type ResolveImageUrl,
  chorePrompt,
  parseVerdict,
} from "./verdict";

/** The slice of `fetch` the adapter uses — narrowed so tests need no globals. */
export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  headers: { get(name: string): string | null };
}>;

export interface GeminiJudgeOptions {
  /** Official `@google/genai` client, constructed at the composition root. */
  client: GoogleGenAI;
  /** From `GEMINI_MODEL` (default `gemini-2.5-flash`). */
  model: string;
  resolveImageUrl: ResolveImageUrl;
  /** Fetches the signed URL's bytes (Gemini needs inline image data). Defaults to `fetch`. */
  fetchImpl?: FetchLike;
}

/**
 * The Gemini vision judge (design §5). **Advisory only** (§3, §7.1). Unlike
 * Anthropic, Gemini needs the image **inline**, so the adapter fetches the photo
 * via its signed URL and base64-encodes the bytes. Client + model are wired at
 * the composition root (key `JUDGE_GEMINI_API_KEY`, model `GEMINI_MODEL`). Any
 * infra or parse fault throws → the `submitPhoto` use-case maps it to
 * `judge_unavailable` (retryable, §7.2). Interchangeable with the Anthropic and
 * fake judges per the judge contract.
 */
export function geminiJudge(options: GeminiJudgeOptions): JudgePort {
  const { client, model, resolveImageUrl } = options;
  // Safe cast: the adapter only uses `ok`/`status`/`arrayBuffer()`/`headers.get()`,
  // all of which the global `fetch`'s `Response` provides.
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);

  return {
    async evaluate(photo: PhotoRef, chore: ChoreContext): Promise<Verdict> {
      const url = await resolveImageUrl(photo);
      const res = await fetchImpl(url);
      if (!res.ok) {
        throw new Error(`failed to fetch chore photo: ${res.status}`);
      }
      const declared = res.headers.get("content-type");
      const mimeType = declared?.startsWith("image/") ? declared : "image/jpeg";
      const data = Buffer.from(await res.arrayBuffer()).toString("base64");

      const response = await client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { data, mimeType } }, { text: chorePrompt(chore) }],
          },
        ],
        config: { systemInstruction: JUDGE_SYSTEM_PROMPT },
      });

      return parseVerdict(response.text ?? "", model);
    },
  };
}
