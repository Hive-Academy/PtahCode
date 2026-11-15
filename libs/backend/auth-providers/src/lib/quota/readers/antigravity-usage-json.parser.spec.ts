import { parseAntigravityUsageJson } from './antigravity-usage-json.parser';

const output = (groups: unknown[]) => JSON.stringify({ type: 'command', command: {
  name: 'usage', data: { groups },
} });
const group = (windows: unknown[], name = 'Placeholder Group') => ({ name, windows });

describe('parseAntigravityUsageJson', () => {
  it.each([[0.004, 99.6], [0.995, 0.5], [0, 100]])(
    'maps remaining fraction %s to %s used', (remaining, used) => {
      const result = parseAntigravityUsageJson(output([group([
        { kind: 'weekly', remaining_fraction: remaining },
      ])]), 1);
      expect(result?.[0].used).toEqual({ kind: 'percent', percent: used });
    });

  it('keeps a valid row beside an invalid row', () => {
    const result = parseAntigravityUsageJson(output([group([
      { kind: 'weekly', remaining_fraction: 0.5 },
      { kind: '5h', remaining_fraction: '0.5' },
    ])]), 1);
    expect(result).toHaveLength(1);
  });

  it('drops a stale reset without dropping the window', () => {
    const observedAt = Date.parse('2030-01-03T00:00:00Z');
    const result = parseAntigravityUsageJson(output([group([
      { kind: 'weekly', remaining_fraction: 0, reset_time: '2030-01-01T00:00:00Z' },
    ])]), observedAt);
    expect(result).toHaveLength(1);
    expect(result?.[0].resetsAt).toBeUndefined();
  });

  it('uses group indexes when slugs are empty', () => {
    const row = { kind: 'weekly', remaining_fraction: 0.5 };
    const result = parseAntigravityUsageJson(output([group([row], '☀'), group([row], '☂')]), 1);
    expect(result?.map((window) => window.key)).toEqual([
      'other:cli-group-0-weekly', 'other:cli-group-1-weekly',
    ]);
  });
  it('keeps both groups when their names have the same slug', () => {
    const row = { kind: 'weekly', remaining_fraction: 0.5 };
    const result = parseAntigravityUsageJson(output([
      group([row], 'Placeholder Group'), group([row], 'Placeholder-Group'),
    ]), 1);
    expect(result).toHaveLength(2);
    expect(new Set(result?.map((window) => window.key)).size).toBe(2);
  });
  it('keeps a unique group key when groups reorder or an invalid group is skipped', () => {
    const row = { kind: 'weekly', remaining_fraction: 0.5 };
    const first = parseAntigravityUsageJson(output([
      group([row], 'Placeholder One'), group([row], 'Placeholder Two'),
    ]), 1);
    const second = parseAntigravityUsageJson(output([
      { name: 'Invalid', windows: 'bad' },
      group([row], 'Placeholder Two'), group([row], 'Placeholder One'),
    ]), 1);
    expect(first?.map((window) => window.key).sort()).toEqual(second?.map((window) => window.key).sort());
    expect(first?.[0].key).toBe('other:cli-placeholder-one-weekly');
  });
});
