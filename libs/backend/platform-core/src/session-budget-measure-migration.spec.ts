import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { migrateSessionBudgetMeasure } from './session-budget-measure-migration';

describe('migrateSessionBudgetMeasure', () => {
  let dir: string;
  let warnings: string[];
  const file = (): string => path.join(dir, 'settings.json');
  const read = (): Record<string, unknown> =>
    JSON.parse(fs.readFileSync(file(), 'utf8')) as Record<string, unknown>;
  const write = (value: unknown): void =>
    fs.writeFileSync(file(), JSON.stringify(value));
  const migrate = (): void =>
    migrateSessionBudgetMeasure(dir, {
      warn: (message) => warnings.push(message),
    });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-budget-measure-'));
    warnings = [];
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it.each([
    ['a nested token limit', { sessionBudget: { tokens: 30_000_000 } }],
    ['a nested unit', { sessionBudget: { unit: 'tokens' } }],
    ['a flat token limit', { 'sessionBudget.tokens': 30_000_000 }],
  ])('keeps the raw measure for a legacy budget with %s', (_name, legacy) => {
    write(legacy);
    migrate();
    expect(read()).toMatchObject({
      sessionBudget: { tokenMeasure: 'raw' },
      __migrations: { sessionBudgetMeasureV1: true },
    });
  });

  it('stamps a file with no stored budget and writes no measure', () => {
    write({ sessionBudget: { usd: 10 }, __migrations: { agentBudgetV1: true } });
    migrate();
    expect(read()).toEqual({
      sessionBudget: { usd: 10 },
      __migrations: { agentBudgetV1: true, sessionBudgetMeasureV1: true },
    });
  });

  it('creates a stamped file on a fresh install', () => {
    migrate();
    expect(read()).toEqual({ __migrations: { sessionBudgetMeasureV1: true } });
  });

  it('does not run again when a budget is saved after the stamp', () => {
    migrate();
    write({ ...read(), sessionBudget: { tokens: 20_000_000 } });
    const before = fs.readFileSync(file(), 'utf8');
    migrate();
    expect(fs.readFileSync(file(), 'utf8')).toBe(before);
  });

  it.each(['weighted', 'raw'])(
    'keeps an explicit %s measure',
    (tokenMeasure) => {
      write({ sessionBudget: { tokens: 30_000_000, tokenMeasure } });
      migrate();
      expect(read()).toMatchObject({ sessionBudget: { tokenMeasure } });
    },
  );

  it('leaves malformed JSON untouched without a stamp', () => {
    fs.writeFileSync(file(), '{ invalid');
    expect(migrate).not.toThrow();
    expect(fs.readFileSync(file(), 'utf8')).toBe('{ invalid');
    expect(warnings).toHaveLength(1);
  });

  it('leaves a non-object document untouched without a stamp', () => {
    write([1]);
    migrate();
    expect(fs.readFileSync(file(), 'utf8')).toBe('[1]');
    expect(warnings).toHaveLength(1);
  });
});
