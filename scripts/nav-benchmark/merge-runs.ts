/**
 * Merge the BEFORE run (recorded on `main`, strategies `shell,before`) and the
 * AFTER run (recorded on the change, strategies `shell,after`) into one table.
 * The `before` strategy comes from the baseline file, `after` from the new
 * file, and `shell` from the new file (the same commands, rerun).
 *
 * Usage (repository root):
 *   npx ts-node --transpile-only --project scripts/tsconfig.json -O '{"rootDir":"."}' \
 *     scripts/nav-benchmark/merge-runs.ts --before <before.json> --after <after.json>
 */
import * as fs from 'fs';
import { buildTotals, renderTable } from './score';
import type { BenchmarkRun, TaskResult } from './types';

/** One run whose `shell` and `after` come from `after`, `before` from `before`. */
export function mergeRuns(
  before: BenchmarkRun,
  after: BenchmarkRun,
): BenchmarkRun {
  const beforeById = new Map(before.results.map((task) => [task.id, task]));
  const results: TaskResult[] = after.results.map((task) => {
    const old = beforeById.get(task.id);
    return {
      id: task.id,
      kind: task.kind,
      strategies: {
        ...(task.strategies.shell ? { shell: task.strategies.shell } : {}),
        ...(old?.strategies.before ? { before: old.strategies.before } : {}),
        ...(task.strategies.after ? { after: task.strategies.after } : {}),
      },
    };
  });
  return {
    ...after,
    taskCount: results.length,
    results,
    totals: buildTotals(results),
  };
}

function readRun(file: string): BenchmarkRun {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as BenchmarkRun;
}

function main(): void {
  const argv = process.argv.slice(2);
  const value = (flag: string): string => {
    const found = argv[argv.indexOf(flag) + 1];
    if (argv.indexOf(flag) < 0 || found === undefined) {
      throw new Error(`${flag} <file.json> is required`);
    }
    return found;
  };
  const merged = mergeRuns(
    readRun(value('--before')),
    readRun(value('--after')),
  );
  process.stdout.write(
    `${renderTable(merged, ['shell', 'before', 'after'])}\n`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(
      `merge-runs: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  }
}
