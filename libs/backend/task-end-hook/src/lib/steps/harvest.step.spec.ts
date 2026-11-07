import type {
  TaskEndHarvestOutcome,
  TaskEndRunRecord,
  TaskEndStepKind,
  TaskEndStepOutcome,
  TaskEndStepRecord,
} from '@ptah-extension/shared';
import type { ITaskEndStore } from '../persistence/task-end-store.interface';
import type {
  HarvestPort,
  TaskEndHarvestPortResult,
} from '../ports/harvest.port';
import { HarvestStep, mapHarvestResult } from './harvest.step';

/** Records the step-facing store calls (Decision D3: no real database). */
class RecordingStore
  implements Pick<ITaskEndStore, 'markStepRunning' | 'upsertStep'>
{
  readonly calls: string[] = [];
  readonly outcomes = new Map<string, TaskEndStepOutcome>();
  attempts = 0;

  markStepRunning(_runId: string, step: TaskEndStepKind, subject: string): number {
    this.calls.push(`running:${step}:${subject}`);
    this.attempts += 1;
    return this.attempts;
  }

  upsertStep<K extends TaskEndStepKind>(
    _runId: string,
    step: K,
    subject: string,
    outcome: Extract<TaskEndStepOutcome, { readonly step: K }>,
  ): void {
    this.calls.push(`upsert:${step}:${subject}`);
    this.outcomes.set(`${step}:${subject}`, outcome);
  }
}

function makeRun(harvest: TaskEndStepRecord['outcome'] = { state: 'pending' }): TaskEndRunRecord {
  return {
    runId: 'run-1',
    repoId: 'repo-1',
    taskId: 'TASK_2026_001_abcd',
    episode: 1,
    source: 'watcher',
    fromStatus: 'in_review',
    toStatus: 'done',
    seenRoot: '/repo/.claude-worktrees/wt',
    mainRoot: null,
    createdAt: 1,
    settleUntil: 2,
    startedAt: 3,
    endedAt: null,
    updatedAt: 3,
    state: 'running',
    reason: null,
    steps: (['close-curate', 'harvest', 'dispose', 'index'] as const).map(
      (step): TaskEndStepRecord =>
        ({
          step,
          subject: '',
          outcome: step === 'harvest' ? harvest : { state: 'pending' },
          message: '',
          updatedAt: 1,
          attempts: 0,
        }) as TaskEndStepRecord,
    ),
  };
}

function harness(harvestTask: HarvestPort['harvestTask']) {
  const store = new RecordingStore();
  const port = { harvestTask: jest.fn(harvestTask) };
  const logger = { debug: jest.fn() };
  const step = new HarvestStep(store as unknown as ITaskEndStore, port, logger);
  return { step, store, port, logger };
}

const result = (
  outcome: TaskEndHarvestPortResult['outcome'],
): TaskEndHarvestPortResult => ({ outcome, reconciled: 2 });

const TABLE: ReadonlyArray<
  readonly [TaskEndHarvestPortResult['outcome'], TaskEndHarvestOutcome | null]
> = [
  ['harvested', { step: 'harvest', state: 'succeeded', reason: 'harvested' }],
  [
    'already-harvested',
    { step: 'harvest', state: 'succeeded', reason: 'already-harvested' },
  ],
  ['no-carrier', { step: 'harvest', state: 'skipped', reason: 'no-carrier' }],
  ['harvest-failed', { step: 'harvest', state: 'failed', reason: 'harvest-failed' }],
  ['not-completed', null],
];

describe('mapHarvestResult', () => {
  it.each(TABLE)('%s', (outcome, expected) => {
    expect(mapHarvestResult(result(outcome))).toEqual(
      expected === null
        ? { kind: 'not-completed' }
        : { kind: 'recorded', outcome: expected },
    );
  });
});

describe('HarvestStep', () => {
  it.each(TABLE.filter((row) => row[1] !== null))(
    'records %s before returning, harvesting from the seen root',
    async (outcome, expected) => {
      const h = harness(async () => result(outcome));
      const returned = await h.step.run(makeRun());
      expect(h.port.harvestTask).toHaveBeenCalledWith(
        '/repo/.claude-worktrees/wt',
        'TASK_2026_001_abcd',
      );
      expect(h.store.calls).toEqual(['running:harvest:', 'upsert:harvest:']);
      expect(h.store.outcomes.get('harvest:')).toEqual(expected);
      expect(returned).toEqual({ kind: 'recorded', outcome: expected });
    },
  );

  it('never records not-completed: it is returned to the worker', async () => {
    const h = harness(async () => result('not-completed'));
    expect(await h.step.run(makeRun())).toEqual({ kind: 'not-completed' });
    expect(h.store.calls).toEqual(['running:harvest:']);
    expect(h.store.outcomes.size).toBe(0);
  });

  it.each([
    [
      'throws',
      (): Promise<TaskEndHarvestPortResult> => {
        throw new Error('token sk-test-123 at /home/secret');
      },
    ],
    [
      'rejects',
      (): Promise<TaskEndHarvestPortResult> =>
        Promise.reject(new Error('token sk-test-123 at /home/secret')),
    ],
  ])('a port that %s records harvest-failed with no error text', async (_n, port) => {
    const h = harness(port);
    const returned = await h.step.run(makeRun());
    expect(returned).toEqual({
      kind: 'recorded',
      outcome: { step: 'harvest', state: 'failed', reason: 'harvest-failed' },
    });
    const stored = JSON.stringify([...h.store.outcomes.values()]);
    expect(stored).not.toContain('sk-test-123');
    expect(stored).not.toContain('/home/secret');
  });

  it('returns an already recorded outcome without harvesting again', async () => {
    const done: TaskEndHarvestOutcome = {
      step: 'harvest',
      state: 'succeeded',
      reason: 'harvested',
    };
    const h = harness(async () => result('harvested'));
    expect(await h.step.run(makeRun(done))).toEqual({ kind: 'recorded', outcome: done });
    expect(h.port.harvestTask).not.toHaveBeenCalled();
    expect(h.store.calls).toEqual([]);
  });
});
