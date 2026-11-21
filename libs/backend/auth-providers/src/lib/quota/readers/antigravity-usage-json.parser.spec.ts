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
      'other:cli-group_0-weekly', 'other:cli-group_1-weekly',
    ]);
  });
  it('keeps a collision key distinct from a real slug that ends in an index', () => {
    const row = { kind: 'weekly', remaining_fraction: 0.5 };
    const result = parseAntigravityUsageJson(output([
      group([row], 'Placeholder Group'), group([row], 'Placeholder-Group'),
      group([row], 'Placeholder Group 1'), group([row], 'Group 0'), group([row], '☀'),
    ]), 1);
    expect(result).toHaveLength(5);
    expect(new Set(result?.map((window) => window.key)).size).toBe(5);
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
  it('reads the current CLI shape without a type and with buckets', () => {
    const body = JSON.stringify({ command: { name: 'usage', data: { groups: [{
      name: 'Placeholder Group', buckets: [
        { window: 'weekly', remaining_fraction: 0.25 },
        { window: '5h', remaining_fraction: 0.75 },
      ],
    }] } } });
    const result = parseAntigravityUsageJson(body, 1);
    expect(result?.map((window) => [window.kind, window.used])).toEqual([
      ['weekly', { kind: 'percent', percent: 75 }],
      ['five_hour', { kind: 'percent', percent: 25 }],
    ]);
  });
  it('rejects a result type and a different command name', () => {
    const groups = [group([{ kind: 'weekly', remaining_fraction: 0.5 }])];
    expect(parseAntigravityUsageJson(JSON.stringify({ type: 'result', command: {
      name: 'usage', data: { groups } } }), 1)).toBeUndefined();
    expect(parseAntigravityUsageJson(JSON.stringify({ type: 'command', command: {
      name: 'help', data: { groups } } }), 1)).toBeUndefined();
  });
  it('rejects an envelope that reports a failure beside valid buckets', () => {
    const command = { name: 'usage', data: { groups: [group([{ kind: 'weekly', remaining_fraction: 0.5 }])] } };
    for (const envelope of [{ status: 'ERROR' }, { status: 'error' }, { status: 'failed' }, { is_error: true }]) {
      expect(parseAntigravityUsageJson(JSON.stringify({ ...envelope, command }), 1)).toBeUndefined();
    }
    expect(parseAntigravityUsageJson(JSON.stringify({ status: 'success', is_error: false, num_turns: 0, command }), 1))
      .toHaveLength(1);
  });
  it('rejects a turn count that is not a non-negative integer', () => {
    const command = { name: 'usage', data: { groups: [group([{ kind: 'weekly', remaining_fraction: 0.5 }])] } };
    for (const num_turns of [-1, 0.5, '0']) {
      expect(parseAntigravityUsageJson(JSON.stringify({ num_turns, command }), 1)).toBeUndefined();
    }
  });
  it('still reads the legacy command shape and the live num_turns shape', () => {
    const rows = [{ kind: 'weekly', remaining_fraction: 0.5 }];
    expect(parseAntigravityUsageJson(output([group(rows)]), 1)).toHaveLength(1);
    expect(parseAntigravityUsageJson(JSON.stringify({ num_turns: 0, command: { name: 'usage', data: { groups: [
      { name: 'Placeholder Group', buckets: [{ window: '5h', remaining_fraction: 0.9 }] },
    ] } } }), 1)).toHaveLength(1);
  });
});
