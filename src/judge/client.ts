import type { JudgeInput, ModelJudgment } from './types';

/**
 * The vendor-swap seam (the `judgeImage` abstraction from PRD.md). Every vision
 * vendor is wrapped behind this interface so the pipeline, the app, and the
 * tests depend only on it — never on a specific SDK. Swapping models means
 * adding one implementation, not rewriting callers.
 */
export interface JudgeClient {
  /** Model identifier, recorded on each verdict for titration auditing. */
  readonly model: string;
  /** Compare reference vs submission and return the validated model judgment. */
  judge(input: JudgeInput): Promise<ModelJudgment>;
}

/**
 * Deterministic JudgeClient for tests and for running the reference→verdict
 * pipeline end-to-end with no network or API key. Returns whatever judgment it
 * was constructed with.
 */
export class FakeJudgeClient implements JudgeClient {
  readonly model: string;

  constructor(
    private readonly scripted: ModelJudgment,
    model = 'fake-judge-v1',
  ) {
    this.model = model;
  }

  async judge(_input: JudgeInput): Promise<ModelJudgment> {
    return this.scripted;
  }
}
