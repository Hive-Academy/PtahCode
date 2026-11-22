import { parseAntigravityUsageGroups, parseAntigravityUsageTsv } from './antigravity-usage.parser';
import { ANTIGRAVITY_USAGE_FIXTURE, antigravityUsageJsonFixture } from './antigravity-usage.fixture';

const OBSERVED = Date.parse('2030-01-01T00:00:00Z');
const probeData = () => (antigravityUsageJsonFixture()['command'] as { data: unknown }).data;
const groups = (...list: unknown[]) => ({ groups: list });
const pool = (name: string, buckets: unknown[]) => ({ name, buckets });

describe('parseAntigravityUsageGroups', () => {
  it('maps the probe groups to a 5 h and a weekly window per pool', () => {
    const windows = parseAntigravityUsageGroups(probeData(), OBSERVED);
    expect(windows?.map(({ key, kind, label, durationMins, used }) => ({ key, kind, label, durationMins, used })))
      .toEqual([
        { key: 'other:cli-gemini-models-five_hour', kind: 'five_hour', label: 'Gemini Models · 5 Hour',
          durationMins: 300, used: { kind: 'percent', percent: 30 } },
        { key: 'other:cli-gemini-models-weekly', kind: 'weekly', label: 'Gemini Models · Weekly',
          durationMins: 10_080, used: { kind: 'percent', percent: 20 } },
        { key: 'other:cli-claude-and-gpt-models-five_hour', kind: 'five_hour',
          label: 'Claude and GPT models · 5 Hour', durationMins: 300, used: { kind: 'percent', percent: 0 } },
        { key: 'other:cli-claude-and-gpt-models-weekly', kind: 'weekly',
          label: 'Claude and GPT models · Weekly', durationMins: 10_080, used: { kind: 'percent', percent: 75 } },
      ]);
    expect(windows?.every((window) => window.usedSource === 'provider-unofficial' &&
      window.observedAt === OBSERVED)).toBe(true);
  });

  it('treats the 1970 reset of an unused pool as no known reset', () => {
    const windows = parseAntigravityUsageGroups(probeData(), OBSERVED) ?? [];
    const unused = windows.find((window) => window.key === 'other:cli-claude-and-gpt-models-five_hour');
    expect(unused?.resetsAt).toBeUndefined();
    expect(unused?.resetSource).toBeUndefined();
    expect(windows[0]).toMatchObject({ resetsAt: Date.parse('2030-01-01T05:00:00Z'),
      resetSource: 'provider-unofficial' });
  });

  it.each([[0.004, 99.6], [0.995, 0.5], [0, 100]])('maps remaining fraction %s to %s percent used', (remaining, used) => {
    const windows = parseAntigravityUsageGroups(groups(pool('Gemini Models', [
      { window: 'weekly', remaining_fraction: remaining },
    ])), OBSERVED);
    expect(windows?.[0].used).toEqual({ kind: 'percent', percent: used });
  });

  it('skips an unreadable bucket without zeroing it and rejects data with none readable', () => {
    expect(parseAntigravityUsageGroups(groups(pool('Gemini Models', [
      { window: 'weekly', remaining_fraction: 0.5 },
      { window: '5h', remaining_fraction: '0.5' },
      { window: '5h', remaining_fraction: 1.5 },
    ])), OBSERVED)).toHaveLength(1);
    expect(parseAntigravityUsageGroups(groups(pool('Gemini Models', [{ window: '5h' }])), OBSERVED))
      .toBeUndefined();
    expect(parseAntigravityUsageGroups({ groups: 'bad' }, OBSERVED)).toBeUndefined();
    expect(parseAntigravityUsageGroups(undefined, OBSERVED)).toBeUndefined();
  });

  it('drops a reset older than a day without dropping the window', () => {
    const windows = parseAntigravityUsageGroups(groups(pool('Gemini Models', [
      { window: 'weekly', remaining_fraction: 0, reset_time: '2029-12-30T00:00:00Z' },
    ])), OBSERVED);
    expect(windows).toHaveLength(1);
    expect(windows?.[0].resetsAt).toBeUndefined();
  });

  it('keeps distinct keys for pools whose names share a slug, and index keys for empty slugs', () => {
    const row = { window: 'weekly', remaining_fraction: 0.5 };
    expect(parseAntigravityUsageGroups(groups(pool('☀', [row]), pool('☂', [row])), OBSERVED)
      ?.map((window) => window.key)).toEqual(['other:cli-group_0-weekly', 'other:cli-group_1-weekly']);
    const collided = parseAntigravityUsageGroups(groups(pool('Gemini Models', [row]),
      pool('Gemini-Models', [row])), OBSERVED);
    expect(new Set(collided?.map((window) => window.key)).size).toBe(2);
  });
});

describe('parseAntigravityUsageTsv', () => {
  it('reads the tab-separated response as remaining percentages', () => {
    const windows = parseAntigravityUsageTsv(ANTIGRAVITY_USAGE_FIXTURE, OBSERVED);
    expect(windows?.map(({ key, used }) => [key, used])).toEqual([
      ['other:cli-gemini-models-weekly', { kind: 'percent', percent: 20 }],
      ['other:cli-gemini-models-five_hour', { kind: 'percent', percent: 30 }],
      ['other:cli-claude-and-gpt-models-weekly', { kind: 'percent', percent: 40 }],
      ['other:cli-claude-and-gpt-models-five_hour', { kind: 'percent', percent: 50 }],
    ]);
  });

  it('keeps an epoch reset as unknown and rejects any malformed or duplicate line', () => {
    expect(parseAntigravityUsageTsv('Gemini Models\tWeekly Limit Remaining\t100%\t1970-01-01T00:00:00Z',
      OBSERVED)?.[0].resetsAt).toBeUndefined();
    expect(parseAntigravityUsageTsv(`${ANTIGRAVITY_USAGE_FIXTURE}\nnot a usage line`, OBSERVED)).toBeUndefined();
    expect(parseAntigravityUsageTsv(`${ANTIGRAVITY_USAGE_FIXTURE}\n${ANTIGRAVITY_USAGE_FIXTURE}`, OBSERVED))
      .toBeUndefined();
    expect(parseAntigravityUsageTsv('', OBSERVED)).toBeUndefined();
  });
});
