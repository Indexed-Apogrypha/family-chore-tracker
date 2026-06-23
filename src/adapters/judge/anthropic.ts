import type Anthropic from "@anthropic-ai/sdk";

import type { ChoreContext, JudgePort, Verdict } from "@/ports/judge";
import type { PhotoRef } from "@/ports/photo-storage";

import {
  JUDGE_SYSTEM_PROMPT,
  type ResolveImageUrl,
  chorePrompt,
  parseVerdict,
} from "./verdict";

export interface AnthropicJudgeOptions {
  /** Official SDK client, constructed at the composition root with the API key. */
  client: Anthropic;
  /** From `CLAUDE_MODEL` (default `claude-sonnet-4-6`). */
  model: string;
  resolveImageUrl: ResolveImageUrl;
}

/** Concatenate the text blocks of a (non-streaming) message response. */
function textOf(message: Anthropic.Message): string {
  let out = "";
  for (const block of message.content) {
    if (block.type === "text") out += block.text;
  }
  return out.trim();
}

/**
 * The Anthropic vision judge (design §5). **Advisory only** — only a parent's
 * decision advances a submission past `pending_review` (§3, §7.1). The client and
 * model are wired at the composition root (key `JUDGE_ANTHROPIC_API_KEY`, model
 * `CLAUDE_MODEL`); the photo is delivered as a short-lived signed URL (Anthropic
 * fetches it server-side). Any infra or parse fault throws, which the
 * `submitPhoto` use-case maps to `judge_unavailable` so the submission stays
 * retryable (§7.2).
 */
export function anthropicJudge(options: AnthropicJudgeOptions): JudgePort {
  const { client, model, resolveImageUrl } = options;

  return {
    async evaluate(photo: PhotoRef, chore: ChoreContext): Promise<Verdict> {
      const url = await resolveImageUrl(photo);
      const message = await client.messages.create({
        model,
        max_tokens: 1024,
        system: JUDGE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url } },
              { type: "text", text: chorePrompt(chore) },
            ],
          },
        ],
      });

      return parseVerdict(textOf(message), message.model ?? model);
    },
  };
}
