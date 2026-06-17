import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { JudgmentParseError, parseModelJudgment } from './parse';
import { buildJudgePrompt } from './prompt';
import type { JudgeClient } from './client';
import type { JudgeInput, ModelJudgment } from './types';

/** Default Gemini Flash-class model (overridable via opts or GEMINI_MODEL). */
const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * Server-side schema we ask Gemini to conform to (responseSchema). This is
 * belt-and-suspenders alongside the prompt and our own Zod validation in
 * parseModelJudgment — the model can still drift, so we never trust it blindly.
 */
const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    matches_reference: { type: Type.BOOLEAN },
    verdict: { type: Type.STRING, enum: ['pass', 'fail'] },
    confidence: { type: Type.NUMBER },
    deviations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          item: { type: Type.STRING },
          issue: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
        },
        required: ['item', 'issue', 'severity'],
      },
    },
    uncertain: { type: Type.BOOLEAN },
    notes: { type: Type.STRING },
  },
  required: [
    'matches_reference',
    'verdict',
    'confidence',
    'deviations',
    'uncertain',
    'notes',
  ],
};

export interface GeminiJudgeOptions {
  /** API key. Defaults to JUDGE_GEMINI_API_KEY, then GEMINI_API_KEY. */
  apiKey?: string;
  /** Model id. Defaults to process.env.GEMINI_MODEL or "gemini-2.5-flash". */
  model?: string;
}

/**
 * Live vision judge backed by the Gemini Developer API. Implements the same
 * JudgeClient seam as FakeJudgeClient, so the pipeline cannot tell them apart.
 */
export class GeminiJudgeClient implements JudgeClient {
  readonly model: string;
  private readonly ai: GoogleGenAI;

  constructor(opts: GeminiJudgeOptions = {}) {
    // JUDGE_GEMINI_API_KEY first, for naming parity with the Claude adapter;
    // GEMINI_API_KEY stays the fallback. Unlike ANTHROPIC_API_KEY, the plain name
    // isn't reserved by Claude Code — the alias here is purely for consistency.
    const apiKey =
      opts.apiKey ??
      process.env.JUDGE_GEMINI_API_KEY ??
      process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'No Gemini key set (JUDGE_GEMINI_API_KEY or GEMINI_API_KEY); cannot construct GeminiJudgeClient.',
      );
    }
    this.model = opts.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
    this.ai = new GoogleGenAI({ apiKey });
  }

  async judge(input: JudgeInput): Promise<ModelJudgment> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [
        { text: buildJudgePrompt(input.choreName) },
        { text: 'REFERENCE image (the accepted "done" state):' },
        {
          inlineData: {
            mimeType: input.referenceImage.mimeType,
            data: input.referenceImage.data,
          },
        },
        { text: 'SUBMISSION image (judge this one):' },
        {
          inlineData: {
            mimeType: input.submissionImage.mimeType,
            data: input.submissionImage.data,
          },
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        // Deterministic judging: we want the same photos to yield the same call.
        temperature: 0,
      },
    });

    const text = response.text;
    if (!text) {
      throw new JudgmentParseError('Model returned an empty response.', '');
    }
    return parseModelJudgment(text);
  }
}
