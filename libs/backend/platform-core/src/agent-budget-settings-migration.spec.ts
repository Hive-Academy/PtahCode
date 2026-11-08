import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { migrateAgentBudgetSettings } from './agent-budget-settings-migration';

describe('migrateAgentBudgetSettings', () => {
  let dir: string;
  let warnings: string[];
  const read = (): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')) as Record<string, unknown>;
  const write = (value: unknown): void => fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(value));
  const migrate = (): void => migrateAgentBudgetSettings(dir, { warn: (message) => warnings.push(message) });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-agent-budget-'));
    warnings = [];
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('migrates both keys independently and stamps the file once', () => {
    write({ compaction: { subagentHandoffTokens: 42_000, subagentStopWeightedTokens: 4_000_000 } });
    migrate();
    expect(read()).toMatchObject({ agentBudget: { handoffContextTokens: 42_000, stopWeightedTokens: 4_000_000 }, __migrations: { agentBudgetV1: true } });
    const first = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8');
    migrate();
    expect(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).toBe(first);
  });

  it('preserves explicit new values and migrates the other old key', () => {
    write({ 'agentBudget.handoffContextTokens': 23_000, 'compaction.subagentHandoffTokens': 42_000, compaction: { subagentStopWeightedTokens: 4_000_000 } });
    migrate();
    expect(read()).toMatchObject({ 'agentBudget.handoffContextTokens': 23_000, agentBudget: { stopWeightedTokens: 4_000_000 } });
  });

  it('retains invalid source values, uses defaults, and warns once per key', () => {
    write({ compaction: { subagentHandoffTokens: -1, subagentStopWeightedTokens: 'bad' } });
    migrate();
    expect(read()).toMatchObject({ compaction: { subagentHandoffTokens: -1, subagentStopWeightedTokens: 'bad' }, agentBudget: { handoffContextTokens: 150_000, stopWeightedTokens: 3_000_000 } });
    expect(warnings).toHaveLength(2);
    migrate();
    expect(warnings).toHaveLength(2);
  });

  it('leaves malformed JSON untouched without stamping migration', () => {
    const file = path.join(dir, 'settings.json');
    fs.writeFileSync(file, '{ invalid');
    expect(migrate).not.toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe('{ invalid');
    expect(warnings).toEqual(['Invalid settings.json: agent budget migration skipped; the file was left unchanged']);
  });
});
