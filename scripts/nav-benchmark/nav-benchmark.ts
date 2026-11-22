/**
 * Offline navigation benchmark orchestrator (TASK_2026_2299_d6f5).
 *
 * Usage (from the repository root):
 *   npx ts-node --transpile-only --project scripts/tsconfig.json -O '{"rootDir":"."}' \
 *     scripts/nav-benchmark/nav-benchmark.ts \
 *     --strategies shell,before,after --out <file.json> [--tasks id1,id2] [--skip-ptah]
 *
 * Shell steps run here with bash at the repository root. Tool steps run in one
 * child jest process (`jest.bench.config.ts` + `ptah-runner.bench.ts`) that calls
 * the real MCP dispatcher. No model is called.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildTotals,
  countTaskTokens,
  renderTable,
  scoreStrategy,
  TOKENIZER_NAME,
} from './score';
import type {
  BenchmarkRun,
  NavStep,
  NavStrategyName,
  NavTask,
  ShellStep,
  StepResult,
  TaskResult,
  ToolStep,
} from './types';

const MAX_BUFFER = 64 * 1024 * 1024;
const OUTPUT_HEAD_CHARS = 300;
const FAILURE_TAIL_CHARS = 2000;
const STRATEGY_NAMES: readonly NavStrategyName[] = ['shell', 'before', 'after'];
const RUNNER_STATUSES: readonly StepResult['status'][] = [
  'ok',
  'unavailable',
  'unavailable-offline',
  'error',
];

export interface BenchArgs {
  readonly strategies: readonly NavStrategyName[];
  readonly out: string;
  readonly tasks?: readonly string[];
  readonly skipPtah: boolean;
}

export interface StepOutcome {
  readonly output: string;
  readonly status: StepResult['status'];
  readonly error?: string;
}

export interface ToolRequest {
  readonly key: string;
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

function isStrategyName(value: string): value is NavStrategyName {
  return (STRATEGY_NAMES as readonly string[]).includes(value);
}

export function isShellStep(step: NavStep): step is ShellStep {
  return 'shell' in step;
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function parseArgs(argv: readonly string[]): BenchArgs {
  let strategies: NavStrategyName[] = [...STRATEGY_NAMES];
  let out: string | undefined;
  let tasks: string[] | undefined;
  let skipPtah = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const takeValue = (): string => {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${flag} needs a value`);
      }
      return value;
    };
    switch (flag) {
      case '--strategies': {
        const names = splitList(takeValue());
        const bad = names.filter((n) => !isStrategyName(n));
        if (bad.length > 0 || names.length === 0) {
          throw new Error(
            `--strategies: unknown name(s) ${bad.join(', ')}; use ${STRATEGY_NAMES.join(',')}`,
          );
        }
        strategies = names.filter(isStrategyName);
        break;
      }
      case '--out':
        out = takeValue();
        break;
      case '--tasks':
        tasks = splitList(takeValue());
        break;
      case '--skip-ptah':
        skipPtah = true;
        break;
      default:
        throw new Error(`unknown argument: ${flag}`);
    }
  }
  if (!out) {
    throw new Error('--out <file.json> is required');
  }
  return { strategies, out, tasks, skipPtah };
}

/**
 * Runs one shell step with bash. Exit 0 and 1 are both `ok`: rg and grep exit 1
 * on "no match", which is a valid empty answer. stderr is kept only when the
 * command failed (exit > 1) and printed nothing on stdout.
 */
export function runShellStep(command: string, cwd: string): StepOutcome {
  const res = spawnSync('bash', ['-c', command], {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  });
  if (res.error) {
    return { output: '', status: 'error', error: res.error.message };
  }
  const stdout = res.stdout ?? '';
  const code = res.status ?? -1;
  if (code === 0 || code === 1) {
    return { output: stdout, status: 'ok' };
  }
  const stderr = res.stderr ?? '';
  return {
    output: stdout.length === 0 ? stderr : stdout,
    status: 'error',
    error: `exit ${code}${res.signal ? ` (${res.signal})` : ''}: ${stderr.slice(-FAILURE_TAIL_CHARS)}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads the runner's output file and maps every requested key to an outcome.
 * A missing or malformed file, or a missing key, becomes an `error` outcome
 * carrying the jest failure tail, so one broken runner never aborts the run.
 */
export function readRunnerOutputs(
  keys: readonly string[],
  outFile: string,
  failureTail: string,
): Map<string, StepOutcome> {
  const byKey = new Map<string, StepOutcome>();
  let parsed: unknown;
  let readError: string | undefined;
  try {
    parsed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  } catch (err) {
    readError = `ptah runner wrote no readable output (${err instanceof Error ? err.message : String(err)}). jest tail: ${failureTail}`;
  }
  if (readError === undefined && !Array.isArray(parsed)) {
    readError = `ptah runner output is not an array. jest tail: ${failureTail}`;
  }
  if (readError === undefined && Array.isArray(parsed)) {
    for (const entry of parsed) {
      if (!isRecord(entry) || typeof entry['key'] !== 'string') {
        continue;
      }
      const status = entry['status'];
      const valid =
        typeof status === 'string' &&
        (RUNNER_STATUSES as readonly string[]).includes(status);
      const output = typeof entry['output'] === 'string' ? entry['output'] : '';
      const error =
        typeof entry['error'] === 'string' ? entry['error'] : undefined;
      byKey.set(entry['key'], {
        output,
        status: valid ? (status as StepResult['status']) : 'error',
        error: valid ? error : `invalid runner status: ${String(status)}`,
      });
    }
  }
  const result = new Map<string, StepOutcome>();
  for (const key of keys) {
    result.set(
      key,
      byKey.get(key) ?? {
        output: '',
        status: 'error',
        error:
          readError ??
          `ptah runner returned no result for ${key}. jest tail: ${failureTail}`,
      },
    );
  }
  return result;
}

/** Runs every tool step in one child jest process. */
function runPtahSteps(
  requests: readonly ToolRequest[],
  repoRoot: string,
): Map<string, StepOutcome> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-bench-'));
  const stepsIn = path.join(dir, 'steps.json');
  const outFile = path.join(dir, 'out.json');
  fs.writeFileSync(stepsIn, JSON.stringify(requests));
  const res = spawnSync(
    'npx',
    [
      'jest',
      '--config',
      'scripts/nav-benchmark/jest.bench.config.ts',
      '--runInBand',
      '--coverage=false',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      env: {
        ...process.env,
        NAV_BENCH_STEPS_IN: stepsIn,
        NAV_BENCH_OUT: outFile,
      },
    },
  );
  const log = `${res.stdout ?? ''}${res.stderr ?? ''}${res.error ? res.error.message : ''}`;
  return readRunnerOutputs(
    requests.map((r) => r.key),
    outFile,
    log.slice(-FAILURE_TAIL_CHARS),
  );
}

function firstLine(
  command: string,
  args: readonly string[],
  cwd: string,
): string | undefined {
  const res = spawnSync(command, [...args], { cwd, encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    return undefined;
  }
  return (res.stdout ?? '').split('\n')[0]?.trim();
}

function loadTasks(): readonly NavTask[] {
  // Loaded lazily so the unit spec does not depend on the task list.
  const mod: { NAV_TASKS?: readonly NavTask[] } = require('./tasks');
  if (!Array.isArray(mod.NAV_TASKS)) {
    throw new Error('scripts/nav-benchmark/tasks.ts does not export NAV_TASKS');
  }
  return mod.NAV_TASKS;
}

function stepKey(
  taskId: string,
  strategy: NavStrategyName,
  index: number,
): string {
  return `${taskId}|${strategy}|${index}`;
}

function toStepResult(step: NavStep, outcome: StepOutcome): StepResult {
  return {
    step,
    output: outcome.output,
    tokens: countTaskTokens(outcome.output),
    status: outcome.status,
    ...(outcome.error !== undefined ? { error: outcome.error } : {}),
    outputHead: outcome.output.slice(0, OUTPUT_HEAD_CHARS),
  };
}

/** Runs and scores the chosen tasks and strategies. */
export function runBenchmark(
  tasks: readonly NavTask[],
  args: BenchArgs,
  repoRoot: string,
): BenchmarkRun {
  const chosen = args.tasks
    ? tasks.filter((t) => args.tasks?.includes(t.id))
    : tasks;
  if (args.tasks) {
    const unknown = args.tasks.filter((id) => !tasks.some((t) => t.id === id));
    if (unknown.length > 0) {
      throw new Error(`--tasks: unknown task id(s) ${unknown.join(', ')}`);
    }
  }

  const usesRg = chosen.some((t) =>
    args.strategies.some((s) =>
      t.strategies[s].some(
        (step) => isShellStep(step) && /(^|[\s|;&(])rg\s/.test(step.shell),
      ),
    ),
  );
  const rgVersion = firstLine('rg', ['--version'], repoRoot);
  if (usesRg && rgVersion === undefined) {
    throw new Error(
      'ripgrep (rg) is not on PATH but the chosen shell steps use it. ' +
        'Install it (e.g. `sudo apt install ripgrep` or `brew install ripgrep`) and rerun.',
    );
  }

  const requests: ToolRequest[] = [];
  for (const task of chosen) {
    for (const s of args.strategies) {
      task.strategies[s].forEach((step, i) => {
        if (!isShellStep(step)) {
          const tool: ToolStep = step;
          requests.push({
            key: stepKey(task.id, s, i),
            tool: tool.tool,
            args: tool.args,
          });
        }
      });
    }
  }
  const toolOutcomes =
    args.skipPtah || requests.length === 0
      ? new Map<string, StepOutcome>()
      : runPtahSteps(requests, repoRoot);

  const results: TaskResult[] = chosen.map((task) => {
    const strategies: TaskResult['strategies'] = {};
    for (const s of args.strategies) {
      const steps = task.strategies[s].map((step, i) => {
        if (isShellStep(step)) {
          return toStepResult(step, runShellStep(step.shell, repoRoot));
        }
        const outcome = toolOutcomes.get(stepKey(task.id, s, i)) ?? {
          output: '',
          status: 'error' as const,
          error: 'skipped: --skip-ptah',
        };
        return toStepResult(step, outcome);
      });
      strategies[s] = scoreStrategy(steps, task.expect);
    }
    return { id: task.id, kind: task.kind, strategies };
  });

  return {
    gitSha: firstLine('git', ['rev-parse', 'HEAD'], repoRoot) ?? 'unknown',
    date: new Date().toISOString(),
    rgVersion: rgVersion ?? 'not installed',
    tokenizer: TOKENIZER_NAME,
    taskCount: results.length,
    results,
    totals: buildTotals(results),
  };
}

/** JSON report: drops full step outputs, keeps tokens, status and outputHead. */
export function serializeRun(run: BenchmarkRun): string {
  return JSON.stringify(
    run,
    (key, value: unknown) => (key === 'output' ? undefined : value),
    2,
  );
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '..', '..');
  const run = runBenchmark(loadTasks(), args, repoRoot);
  const outPath = path.resolve(process.cwd(), args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${serializeRun(run)}\n`);
  process.stdout.write(
    `${renderTable(run, args.strategies)}\n\nJSON: ${outPath}\n`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(
      `nav-benchmark: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  }
}
