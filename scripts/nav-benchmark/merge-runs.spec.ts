import { mergeRuns } from './merge-runs';
import type { BenchmarkRun, StrategyResult } from './types';

const strategy = (
  calls: number,
  tokens: number,
  correct = true,
): StrategyResult => ({
  calls,
  tokens,
  correct,
  missing: [],
  steps: [],
});

function run(strategies: Record<string, StrategyResult>): BenchmarkRun {
  return {
    gitSha: 'x',
    date: 'd',
    rgVersion: 'rg',
    tokenizer: 't',
    taskCount: 1,
    results: [{ id: 'a', kind: 'read-symbol', strategies }],
    totals: {},
  };
}

describe('mergeRuns', () => {
  it('takes before from the baseline and shell/after from the new run', () => {
    const merged = mergeRuns(
      run({ shell: strategy(1, 100), before: strategy(2, 900) }),
      run({ shell: strategy(1, 101), after: strategy(1, 150) }),
    );
    const task = merged.results[0]?.strategies ?? {};
    expect(task.before?.tokens).toBe(900);
    expect(task.shell?.tokens).toBe(101);
    expect(task.after?.tokens).toBe(150);
    expect(merged.totals.after).toEqual({
      calls: 1,
      tokens: 150,
      correct: 1,
      tasks: 1,
    });
    expect(merged.totals.before?.tokens).toBe(900);
  });

  it('leaves out before when the baseline has no such task', () => {
    const baseline = run({ before: strategy(2, 900) });
    const merged = mergeRuns(
      {
        ...baseline,
        results: [{ id: 'other', kind: 'outline', strategies: {} }],
      },
      run({ after: strategy(1, 150) }),
    );
    expect(merged.results[0]?.strategies?.before).toBeUndefined();
  });
});
