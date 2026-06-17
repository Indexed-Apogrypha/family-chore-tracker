import Anthropic from '@anthropic-ai/sdk';
import { JudgmentParseError, parseModelJudgment } from './parse';
import { buildJudgePrompt } from './prompt';
import type { JudgeClient } from './client';
import type { ImageInput, JudgeInput, ModelJudgment } from './types';

/**
 * Default Claude model — a Gemini Flash-class alternative for the vision judge
 * (overridable via opts or CLAUDE_MODEL). Sonnet-class balances visual-judgment
 * quality against cost; swap to `claude-haiku-4-5` for lower cost or
 * `claude-opus-4-8` for higher fidelity, all behind the same seam.
 */
const DEFAULT_MODEL = 'claude-sonnet-4-6';

/** Output token ceiling: the verdict JSON is small. */
const MAX_TOKENS = 1024;

/** The base64 image media types the Claude API accepts. */
type ClaudeMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface AnthropicJudgeOptions {
  /** API key. Defaults to JUDGE_ANTHROPIC_API_KEY, then ANTHROPIC_API_KEY. */
  apiKey?: string;
  /** Model id. Defaults to process.env.CLAUDE_MODEL or "claude-sonnet-4-6". */
  model?: string;
}

/** A label + the image as a Claude base64 content block (parent of `judge`). */
function labelledImage(label: string, image: ImageInput) {
  return [
    { type: 'text' as const, text: label },
    {
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        // ImageInput.mimeType is a free string; the SDK wants the base64
        // media-type union. We pass the value through and assert the type — an
        // unexpected mime is a caller contract violation, not ours to mask.
        media_type: image.mimeType as ClaudeMediaType,
        data: image.data,
      },
    },
  ];
}

/**
 * Live vision judge backed by the Anthropic Claude API. The sibling of
 * GeminiJudgeClient: it implements the same JudgeClient seam, so the pipeline,
 * the app, and the tests cannot tell the vendors apart. Like gemini.ts it is
 * intentionally NOT exported from index.ts, so importing the judging core never
 * pulls in @anthropic-ai/sdk.
 *
 * We ask for raw JSON in the prompt and validate it ourselves with
 * parseModelJudgment (Zod) — never trusting model output blindly, the same
 * belt-and-suspenders posture as the Gemini adapter. No sampling/thinking config
 * is set, so the adapter stays model-agnostic across the Claude family (some
 * models reject `temperature`/`thinking` overrides).
 */
export class AnthropicJudgeClient implements JudgeClient {
  readonly model: string;
  private readonly client: Anthropic;

  constructor(opts: AnthropicJudgeOptions = {}) {
    // JUDGE_ANTHROPIC_API_KEY first: Claude Code on the web reserves the plain
    // ANTHROPIC_API_KEY name for its own account auth, so a value set under that
    // name isn't reliably passed through to this process. The JUDGE_-prefixed
    // name is not reserved and passes straight through; plain ANTHROPIC_API_KEY
    // stays as a fallback for local/CI use.
    const apiKey =
      opts.apiKey ??
      process.env.JUDGE_ANTHROPIC_API_KEY ??
      process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'No Anthropic key set (JUDGE_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY); cannot construct AnthropicJudgeClient.',
      );
    }
    this.model = opts.model ?? process.env.CLAUDE_MODEL ?? DEFAULT_MODEL;
    this.client = new Anthropic({ apiKey });
  }

  async judge(input: JudgeInput): Promise<ModelJudgment> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildJudgePrompt(input.choreName) },
            ...labelledImage(
              'REFERENCE image (the accepted "done" state):',
              input.referenceImage,
            ),
            ...labelledImage(
              'SUBMISSION image (judge this one):',
              input.submissionImage,
            ),
          ],
        },
      ],
    });

    // First text block is the JSON we asked for. No text block means an empty
    // response or a safety refusal (stop_reason "refusal") — either way there is
    // nothing to validate, so surface it as a parse failure like the Gemini adapter.
    let text: string | undefined;
    for (const block of message.content) {
      if (block.type === 'text') {
        text = block.text;
        break;
      }
    }
    if (!text) {
      throw new JudgmentParseError(
        `Model returned no text content (stop_reason: ${message.stop_reason ?? 'unknown'}).`,
        '',
      );
    }
    return parseModelJudgment(text);
  }
}
