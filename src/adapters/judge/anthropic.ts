import type Anthropic from "@anthropic-ai/sdk";

import type { ChoreContext, JudgePort, Verdict } from "@/ports/judge";
import type { PhotoRef } from "@/ports/photo-storage";

/** Resolve a stored photo to a URL the vision API can fetch (a short-lived signed URL). */
export type ResolveImageUrl = (photo: PhotoRef) => Promise<string>;

export interface AnthropicJudgeOptions {
  /** Official SDK client, constructed at the composition root with the API key. */
  client: Anthropic;
  /** From `CLAUDE_MODEL` (default `claude-sonnet-4-6`). */
  model: string;
  resolveImageUrl: ResolveImageUrl;
}

const SYSTEM_PROMPT =
  "You judge whether a child's chore looks complete from a photo. Your verdict " +
  "is advisory only — a parent makes the authoritative decision. Reply with a " +
  "single JSON object and nothing else: " +
  '{"pass": boolean, "confidence": number between 0 and 1, "reasoning": a short sentence}.';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Concatenate the text blocks of a (non-streaming) message response. */
function textOf(message: Anthropic.Message): string {
  let out = "";
  for (const block of message.content) {
    if (block.type === "text") out += block.text;
  }
  return out.trim();
}

/** Pull the JSON object out of the reply, tolerating prose / code fences around it. */
function parseVerdict(text: string): {
  pass?: unknown;
  confidence?: unknown;
  reasoning?: unknown;
} {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("judge response contained no JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * The Anthropic vision judge (design §5). **Advisory only** — only a parent's
 * decision advances a submission past `pending_review` (§3, §7.1). The client and
 * model are wired at the composition root (key `JUDGE_ANTHROPIC_API_KEY`, model
 * `CLAUDE_MODEL`); the photo is delivered as a short-lived signed URL. Any infra
 * or parse fault throws, which the `submitPhoto` use-case maps to
 * `judge_unavailable` so the submission stays retryable (§7.2).
 */
export function anthropicJudge(options: AnthropicJudgeOptions): JudgePort {
  const { client, model, resolveImageUrl } = options;

  return {
    async evaluate(photo: PhotoRef, chore: ChoreContext): Promise<Verdict> {
      const url = await resolveImageUrl(photo);
      const prompt = chore.description
        ? `Chore: "${chore.title}". Details: ${chore.description}. Is it done?`
        : `Chore: "${chore.title}". Is it done?`;

      const message = await client.messages.create({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url } },
              { type: "text", text: prompt },
            ],
          },
        ],
      });

      const parsed = parseVerdict(textOf(message));
      return {
        pass: Boolean(parsed.pass),
        confidence: clamp01(Number(parsed.confidence)),
        reasoning: String(parsed.reasoning ?? ""),
        model: message.model ?? model,
      };
    },
  };
}
