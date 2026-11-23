import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  parseArgs,
  readRunnerOutputs,
  runBenchmark,
  runShellStep,
  serializeRun,
} from './nav-benchmark';
import {
  buildTotals,
  countTaskTokens,
  renderTable,
  scoreStrategy,
} from './score';
import type { NavTask, StepResult, TaskResult } from './types';

const step = (
  output: string,
  status: StepResult['status'] = 'ok',
  tokens = 3,
): StepResult => ({ step: { shell: 'x' }, output, tokens, status });

const FIXTURE: readonly NavTask[] = [
  {
    id: 'echo-task',
    kind: 'read-range',
    question: 'What does echo print?',
    source: 'fixture',
    expect: ['hello nav'],
    strategies: {
      shell: [{ shell: 'echo hello nav' }],
      before: [{ tool: 'ptah_search_files', args: { pattern: '*.ts' } }],
      after: [{ shell: 'echo first' }, { shell: 'echo hello nav' }],
    },
  },
];

describe('scoreStrategy', () => {
  it('is correct when every expected string is present', () => {
    const r = scoreStrategy(
      [step('alpha beta'), step('gamma')],
      ['alpha', 'gamma'],
    );
    expect(r).toMatchObject({
      calls: 2,
      tokens: 6,
      correct: true,
      missing: [],
    });
  });

  it('lists the missing string', () => {
    const r = scoreStrategy([step('alpha')], ['alpha', 'delta']);
    expect(r.correct).toBe(false);
    expect(r.missing).toEqual(['delta']);
  });

  it('ignores the output of a non-ok step', () => {
    const r = scoreStrategy([step('alpha', 'unavailable')], ['alpha']);
    expect(r.correct).toBe(false);
    expect(r.calls).toBe(1);
  });
});

describe('totals and table', () => {
  const results: TaskResult[] = [
    {
      id: 't1',
      kind: 'outline',
      strategies: {
        shell: scoreStrategy([step('a', 'ok', 5)], ['a']),
        after: scoreStrategy([step('b', 'ok', 2)], ['z']),
      },
    },
    {
      id: 't2',
      kind: 'find-files',
      strategies: { shell: scoreStrategy([step('a', 'ok', 7)], ['a']) },
    },
  ];

  it('sums per strategy', () => {
    const totals = buildTotals(results);
    expect(totals.shell).toEqual({
      calls: 2,
      tokens: 12,
      correct: 2,
      tasks: 2,
    });
    expect(totals.after).toEqual({ calls: 1, tokens: 2, correct: 0, tasks: 1 });
    expect(totals.before).toBeUndefined();
  });

  it('renders every task id and the totals', () => {
    const table = renderTable(
      {
        gitSha: 'abc',
        date: 'd',
        rgVersion: 'rg',
        tokenizer: 'tok',
        taskCount: 2,
        results,
        totals: buildTotals(results),
      },
      ['shell', 'after'],
    );
    expect(table).toContain('| t1 | outline | 1 | 5 | yes | 1 | 2 | no |');
    expect(table).toContain('| t2 | find-files | 1 | 7 | yes | - | - | - |');
    expect(table).toContain('2 | 12 | 2/2');
  });
});

describe('countTaskTokens', () => {
  it('uses the real tokenizer', () => {
    expect(countTaskTokens('')).toBe(0);
    expect(countTaskTokens('hello world')).toBeGreaterThan(0);
    expect(countTaskTokens('a <|endoftext|> b')).toBeGreaterThan(3);
  });

  it('keeps the encode options of the reducers countTokens', () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        '../../libs/backend/tool-output-reducers/src/lib/token-measure.ts',
      ),
      'utf8',
    );
    expect(source).toContain(
      'const ENCODE_OPTIONS = { disallowedSpecial: new Set<string>() };',
    );
    expect(source).toContain('return encode(text, ENCODE_OPTIONS).length;');
  });
});

describe('runShellStep', () => {
  it('returns stdout of echo', () => {
    expect(runShellStep('echo hi', os.tmpdir())).toEqual({
      output: 'hi\n',
      status: 'ok',
    });
  });

  it('treats an rg no-match (exit 1) as ok with empty output', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-rg-'));
    fs.writeFileSync(path.join(dir, 'a.txt'), 'nothing here\n');
    expect(runShellStep('rg zzz_never_there .', dir)).toEqual({
      output: '',
      status: 'ok',
    });
  });

  it('marks exit > 1 as error and keeps stderr', () => {
    const r = runShellStep('echo boom >&2; exit 3', os.tmpdir());
    expect(r.status).toBe('error');
    expect(r.output).toBe('boom\n');
  });
});

describe('parseArgs', () => {
  it('parses every flag', () => {
    expect(
      parseArgs([
        '--strategies',
        'shell,after',
        '--out',
        'x.json',
        '--tasks',
        'a,b',
        '--skip-ptah',
      ]),
    ).toEqual({
      strategies: ['shell', 'after'],
      out: 'x.json',
      tasks: ['a', 'b'],
      skipPtah: true,
    });
  });

  it('rejects an unknown strategy and a missing --out', () => {
    expect(() => parseArgs(['--strategies', 'nope', '--out', 'x'])).toThrow(
      /unknown name/,
    );
    expect(() => parseArgs([])).toThrow(/--out/);
  });
});

describe('readRunnerOutputs', () => {
  it('marks every step error with the jest tail when the file is missing', () => {
    const m = readRunnerOutputs(
      ['a|b|0', 'a|b|1'],
      '/nonexistent/out.json',
      'TAIL',
    );
    expect([...m.values()].every((o) => o.status === 'error')).toBe(true);
    expect(m.get('a|b|0')?.error).toContain('TAIL');
  });

  it('maps valid entries and flags an invalid status', () => {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'nav-out-')),
      'out.json',
    );
    fs.writeFileSync(
      file,
      JSON.stringify([
        { key: 'k1', output: 'x', status: 'ok' },
        { key: 'k2', output: '', status: 'weird' },
      ]),
    );
    const m = readRunnerOutputs(['k1', 'k2', 'k3'], file, 'T');
    expect(m.get('k1')).toEqual({
      output: 'x',
      status: 'ok',
      error: undefined,
    });
    expect(m.get('k2')?.status).toBe('error');
    expect(m.get('k3')?.error).toContain('no result for k3');
  });
});

describe('runBenchmark', () => {
  it('scores a fixture without ptah and drops outputs from the JSON', () => {
    const run = runBenchmark(
      FIXTURE,
      {
        strategies: ['shell', 'before', 'after'],
        out: 'unused',
        skipPtah: true,
      },
      os.tmpdir(),
    );
    const s = run.results[0]?.strategies;
    expect(s?.shell?.correct).toBe(true);
    expect(s?.after?.correct).toBe(true);
    expect(s?.before?.correct).toBe(false);
    expect(run.totals.after).toMatchObject({ calls: 2, correct: 1, tasks: 1 });
    const json = serializeRun(run);
    expect(json).not.toContain('"output"');
    expect(json).toContain('"outputHead": "hello nav\\n"');
  });
});
