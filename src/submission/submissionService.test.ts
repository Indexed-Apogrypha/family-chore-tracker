import { describe, it, expect } from 'vitest';
import { InMemorySubmissionStore } from './memoryStore';
import { getHistory, submitChore, type SubmitChoreDeps } from './submissionService';
import { NoCurrentReferenceError } from './errors';
import { InMemoryReferenceStore, setReference } from '../reference';
import {
  FakeJudgeClient,
  type ImageInput,
  type JudgeClient,
  type JudgeInput,
  type ModelJudgment,
} from '../judge';
import { BLURRY_UNCERTAIN, CLEAN_PASS, MESSY_FAIL } from '../judge/fixtures';
import { computeStreak } from '../streak';

/** A tiny labelled image so identity assertions read clearly. */
function img(tag: string): ImageInput {
  return { data: tag, mimeType: 'image/jpeg' };
}

/** Captures the JudgeInput it was called with, so we can assert what was judged. */
class SpyJudgeClient implements JudgeClient {
  readonly model = 'spy-judge';
  lastInput: JudgeInput | null = null;
  constructor(private readonly scripted: ModelJudgment) {}
  async judge(input: JudgeInput): Promise<ModelJudgment> {
    this.lastInput = input;
    return this.scripted;
  }
}

/** A judge that always fails, to exercise the store-first failure path. */
class ThrowingJudgeClient implements JudgeClient {
  readonly model = 'throwing-judge';
  async judge(_input: JudgeInput): Promise<ModelJudgment> {
    throw new Error('judge unavailable');
  }
}

/** Returns scripted ISO timestamps in order (last one repeats if exhausted). */
function scriptedClock(times: string[]): () => string {
  let i = 0;
  return () => times[i++] ?? times[times.length - 1] ?? '';
}

/** Wires the three seams; references use a fixed clock (their timestamps are irrelevant here). */
function setup(judge: JudgeClient) {
  const references = new InMemoryReferenceStore({
    clock: () => '2026-06-01T00:00:00.000Z',
  });
  const submissions = new InMemorySubmissionStore();
  const deps: SubmitChoreDeps = { judge, references, submissions };
  return { deps, references, submissions };
}

describe('submitChore', () => {
  it('records a submission and a confirmed pass on the happy path', async () => {
    const { deps, references, submissions } = setup(new FakeJudgeClient(CLEAN_PASS));
    await setReference(references, 'c1', img('ref'));

    const { submission, verdict } = await submitChore(deps, {
      choreId: 'c1',
      choreName: 'Tidy room',
      image: img('sub'),
    });

    expect(verdict.result).toBe('pass');
    expect(verdict.status).toBe('confirmed');
    expect(verdict.submissionId).toBe(submission.id);
    expect(submission.id).toMatch(/^sub-/);
    expect(verdict.id).toMatch(/^ver-/);
    expect(await submissions.listSubmissions()).toHaveLength(1);
    expect(await submissions.listVerdicts()).toHaveLength(1);
  });

  it('records a confirmed fail with its deviations', async () => {
    const { deps, references } = setup(new FakeJudgeClient(MESSY_FAIL));
    await setReference(references, 'c1', img('ref'));

    const { verdict } = await submitChore(deps, {
      choreId: 'c1',
      choreName: 'Tidy room',
      image: img('sub'),
    });

    expect(verdict.result).toBe('fail');
    expect(verdict.status).toBe('confirmed');
    expect(verdict.deviations).toHaveLength(2);
  });

  it('persists a needs_review verdict for an uncertain judgment', async () => {
    const { deps, references, submissions } = setup(new FakeJudgeClient(BLURRY_UNCERTAIN));
    await setReference(references, 'c1', img('ref'));

    await submitChore(deps, { choreId: 'c1', choreName: 'Tidy room', image: img('sub') });

    const [stored] = await submissions.listVerdicts();
    expect(stored?.status).toBe('needs_review');
  });

  it('throws NoCurrentReferenceError when the chore has no reference, persisting nothing', async () => {
    const { deps, submissions } = setup(new FakeJudgeClient(CLEAN_PASS));

    let caught: unknown;
    try {
      await submitChore(deps, { choreId: 'c1', choreName: 'Tidy room', image: img('sub') });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(NoCurrentReferenceError);
    expect((caught as NoCurrentReferenceError).choreId).toBe('c1');
    expect(await submissions.listSubmissions()).toHaveLength(0);
    expect(await submissions.listVerdicts()).toHaveLength(0);
  });

  it('judges against the current reference and the submitted image', async () => {
    const spy = new SpyJudgeClient(CLEAN_PASS);
    const { deps, references } = setup(spy);
    await setReference(references, 'c1', img('old'));
    await setReference(references, 'c1', img('new'));

    await submitChore(deps, { choreId: 'c1', choreName: 'Tidy room', image: img('sub') });

    expect(spy.lastInput?.referenceImage).toEqual(img('new'));
    expect(spy.lastInput?.submissionImage).toEqual(img('sub'));
    expect(spy.lastInput?.choreName).toBe('Tidy room');
  });

  it('persists EXIF when supplied and defaults it to null when omitted', async () => {
    const { deps, references, submissions } = setup(new FakeJudgeClient(CLEAN_PASS));
    await setReference(references, 'c1', img('ref'));

    await submitChore(deps, {
      choreId: 'c1',
      choreName: 'Tidy room',
      image: img('a'),
      exif: { Make: 'Apple', orientation: 6 },
    });
    await submitChore(deps, { choreId: 'c1', choreName: 'Tidy room', image: img('b') });

    const [first, second] = await submissions.listSubmissions();
    expect(first?.exif).toEqual({ Make: 'Apple', orientation: 6 });
    expect(second?.exif).toBeNull();
  });

  it('threads an opaque childId through, leaving it undefined when omitted', async () => {
    const { deps, references, submissions } = setup(new FakeJudgeClient(CLEAN_PASS));
    await setReference(references, 'c1', img('ref'));

    await submitChore(deps, {
      choreId: 'c1',
      choreName: 'Tidy room',
      childId: 'child-1',
      image: img('a'),
    });
    await submitChore(deps, { choreId: 'c1', choreName: 'Tidy room', image: img('b') });

    const [first, second] = await submissions.listSubmissions();
    expect(first?.childId).toBe('child-1');
    expect(second?.childId).toBeUndefined();
  });

  it('keeps an auditable submission when judging fails, with no verdict', async () => {
    const { deps, references, submissions } = setup(new ThrowingJudgeClient());
    await setReference(references, 'c1', img('ref'));

    await expect(
      submitChore(deps, { choreId: 'c1', choreName: 'Tidy room', image: img('sub') }),
    ).rejects.toThrow();

    expect(await submissions.listSubmissions()).toHaveLength(1);
    expect(await submissions.listVerdicts()).toHaveLength(0);
    // The unverdicted submission is transparent to the streak.
    expect(
      computeStreak(await submissions.listSubmissions(), await submissions.listVerdicts()),
    ).toEqual({ current: 0, longest: 0, lastPassDate: null });
  });

  it('produces records that feed computeStreak with no field mapping', async () => {
    const references = new InMemoryReferenceStore({
      clock: () => '2026-06-01T00:00:00.000Z',
    });
    const days = ['2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13'];
    // submitChore calls the clock twice per submit (submission then verdict).
    const submissions = new InMemorySubmissionStore({
      clock: scriptedClock(days.flatMap((d) => [`${d}T12:00:00.000Z`, `${d}T12:00:00.000Z`])),
    });
    await setReference(references, 'c1', img('ref'));

    const submit = (judgment: ModelJudgment) =>
      submitChore(
        { judge: new FakeJudgeClient(judgment), references, submissions },
        { choreId: 'c1', choreName: 'Tidy room', image: img('s') },
      );

    await submit(CLEAN_PASS); // day 10 → passed
    await submit(CLEAN_PASS); // day 11 → passed
    await submit(BLURRY_UNCERTAIN); // day 12 → needs_review (transparent)
    await submit(MESSY_FAIL); // day 13 → failed

    const streak = computeStreak(
      await submissions.listSubmissions(),
      await submissions.listVerdicts(),
    );
    expect(streak).toEqual({ current: 0, longest: 2, lastPassDate: '2026-06-11' });
  });
});

describe('getHistory', () => {
  it('joins submissions to their verdicts, with null for an unjudged submission', async () => {
    const references = new InMemoryReferenceStore({
      clock: () => '2026-06-01T00:00:00.000Z',
    });
    const submissions = new InMemorySubmissionStore();
    await setReference(references, 'c1', img('ref'));

    await submitChore(
      { judge: new FakeJudgeClient(CLEAN_PASS), references, submissions },
      { choreId: 'c1', choreName: 'Tidy room', image: img('a') },
    );
    await submitChore(
      { judge: new FakeJudgeClient(MESSY_FAIL), references, submissions },
      { choreId: 'c1', choreName: 'Tidy room', image: img('b') },
    );
    await submitChore(
      { judge: new ThrowingJudgeClient(), references, submissions },
      { choreId: 'c1', choreName: 'Tidy room', image: img('c') },
    ).catch(() => undefined);

    const history = await getHistory(submissions, 'c1');
    expect(history).toHaveLength(3);
    expect(history[0]?.verdict?.result).toBe('pass');
    expect(history[1]?.verdict?.result).toBe('fail');
    expect(history[2]?.verdict).toBeNull();
  });

  it('scopes listings and history by chore', async () => {
    const references = new InMemoryReferenceStore({
      clock: () => '2026-06-01T00:00:00.000Z',
    });
    const submissions = new InMemorySubmissionStore();
    await setReference(references, 'c1', img('r1'));
    await setReference(references, 'c2', img('r2'));

    await submitChore(
      { judge: new FakeJudgeClient(CLEAN_PASS), references, submissions },
      { choreId: 'c1', choreName: 'Tidy room', image: img('a') },
    );
    await submitChore(
      { judge: new FakeJudgeClient(MESSY_FAIL), references, submissions },
      { choreId: 'c2', choreName: 'Make bed', image: img('b') },
    );

    expect(await submissions.listSubmissions('c1')).toHaveLength(1);
    expect((await submissions.listVerdicts('c1'))[0]?.result).toBe('pass');
    expect((await submissions.listVerdicts('c2'))[0]?.result).toBe('fail');
    expect(await getHistory(submissions, 'c2')).toHaveLength(1);
  });
});
