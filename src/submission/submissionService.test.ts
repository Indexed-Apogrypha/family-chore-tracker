import { describe, it, expect } from 'vitest';
import { InMemorySubmissionStore } from './memoryStore';
import { getHistory, submitChore, type SubmitChoreDeps } from './submissionService';
import { NoCurrentReferenceError } from './errors';
import { InMemoryReferenceStore, setReference, type ReferenceStore } from '../reference';
import { InMemoryChoreStore, createChore, ChoreNotFoundError } from '../chore';
import type { Chore, ChoreDraft, ChoreStore } from '../chore';
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

/**
 * A ChoreStore that treats every id as a real chore. The orchestration tests
 * below are about composing the seams, NOT chore validation (covered by
 * choreService's own tests + the "chore validation" block at the bottom), so they
 * bind this permissive double and keep their literal chore ids — including the
 * `NoCurrentReferenceError` case, where the chore must pass validation so the
 * MISSING-reference path is the one under test.
 */
class AnyChoreStore implements ChoreStore {
  async add({ name }: ChoreDraft): Promise<Chore> {
    return { id: `chore-${name}`, name, createdAt: '2026-06-01T00:00:00.000Z' };
  }
  async getById(id: string): Promise<Chore> {
    return { id, name: 'Tidy room', createdAt: '2026-06-01T00:00:00.000Z' };
  }
  async list(): Promise<Chore[]> {
    return [];
  }
}
const anyChores = new AnyChoreStore();

/** `setReference` bound to the permissive chore store — these tests seed
 *  references for orchestration, not to exercise `getChore` validation. */
function setRef(references: ReferenceStore, choreId: string, image: ImageInput) {
  return setReference({ references, chores: anyChores }, choreId, image);
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
  const deps: SubmitChoreDeps = { judge, chores: anyChores, references, submissions };
  return { deps, references, submissions };
}

describe('submitChore', () => {
  it('records a submission and a confirmed pass on the happy path', async () => {
    const { deps, references, submissions } = setup(new FakeJudgeClient(CLEAN_PASS));
    await setRef(references, 'c1', img('ref'));

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
    await setRef(references, 'c1', img('ref'));

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
    await setRef(references, 'c1', img('ref'));

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
    await setRef(references, 'c1', img('old'));
    await setRef(references, 'c1', img('new'));

    await submitChore(deps, { choreId: 'c1', choreName: 'Tidy room', image: img('sub') });

    expect(spy.lastInput?.referenceImage).toEqual(img('new'));
    expect(spy.lastInput?.submissionImage).toEqual(img('sub'));
    expect(spy.lastInput?.choreName).toBe('Tidy room');
  });

  it('persists EXIF when supplied and defaults it to null when omitted', async () => {
    const { deps, references, submissions } = setup(new FakeJudgeClient(CLEAN_PASS));
    await setRef(references, 'c1', img('ref'));

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
    await setRef(references, 'c1', img('ref'));

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
    await setRef(references, 'c1', img('ref'));

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
    await setRef(references, 'c1', img('ref'));

    const submit = (judgment: ModelJudgment) =>
      submitChore(
        { judge: new FakeJudgeClient(judgment), references, submissions, chores: anyChores },
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
    await setRef(references, 'c1', img('ref'));

    await submitChore(
      { judge: new FakeJudgeClient(CLEAN_PASS), references, submissions, chores: anyChores },
      { choreId: 'c1', choreName: 'Tidy room', image: img('a') },
    );
    await submitChore(
      { judge: new FakeJudgeClient(MESSY_FAIL), references, submissions, chores: anyChores },
      { choreId: 'c1', choreName: 'Tidy room', image: img('b') },
    );
    await submitChore(
      { judge: new ThrowingJudgeClient(), references, submissions, chores: anyChores },
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
    await setRef(references, 'c1', img('r1'));
    await setRef(references, 'c2', img('r2'));

    await submitChore(
      { judge: new FakeJudgeClient(CLEAN_PASS), references, submissions, chores: anyChores },
      { choreId: 'c1', choreName: 'Tidy room', image: img('a') },
    );
    await submitChore(
      { judge: new FakeJudgeClient(MESSY_FAIL), references, submissions, chores: anyChores },
      { choreId: 'c2', choreName: 'Make bed', image: img('b') },
    );

    expect(await submissions.listSubmissions('c1')).toHaveLength(1);
    expect((await submissions.listVerdicts('c1'))[0]?.result).toBe('pass');
    expect((await submissions.listVerdicts('c2'))[0]?.result).toBe('fail');
    expect(await getHistory(submissions, 'c2')).toHaveLength(1);
  });
});

describe('submitChore chore validation', () => {
  it('throws ChoreNotFoundError for an unknown chore, persisting nothing', async () => {
    const references = new InMemoryReferenceStore({ clock: () => '2026-06-01T00:00:00.000Z' });
    const submissions = new InMemorySubmissionStore();
    const chores = new InMemoryChoreStore(); // empty — the chore doesn't exist
    const deps: SubmitChoreDeps = {
      judge: new FakeJudgeClient(CLEAN_PASS),
      chores,
      references,
      submissions,
    };

    await expect(
      submitChore(deps, { choreId: 'ghost', choreName: 'Tidy room', image: img('sub') }),
    ).rejects.toBeInstanceOf(ChoreNotFoundError);

    // Validation precedes any write — neither the submission nor a verdict lands.
    expect(await submissions.listSubmissions()).toHaveLength(0);
    expect(await submissions.listVerdicts()).toHaveLength(0);
  });

  it('composes over a real seeded chore: createChore → setReference → submitChore', async () => {
    const chores = new InMemoryChoreStore();
    const references = new InMemoryReferenceStore({ clock: () => '2026-06-01T00:00:00.000Z' });
    const submissions = new InMemorySubmissionStore();
    const chore = await createChore(chores, 'Tidy room');
    await setReference({ references, chores }, chore.id, img('ref'));

    const { submission, verdict } = await submitChore(
      { judge: new FakeJudgeClient(CLEAN_PASS), chores, references, submissions },
      { choreId: chore.id, choreName: chore.name, image: img('sub') },
    );

    expect(submission.choreId).toBe(chore.id);
    expect(verdict.result).toBe('pass');
    expect(verdict.submissionId).toBe(submission.id);
  });
});
