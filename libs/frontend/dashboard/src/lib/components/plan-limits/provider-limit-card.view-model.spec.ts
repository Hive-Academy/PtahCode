import type {
  LocalTimeOptions,
  PlanLimitOwnerSnapshot,
  PlanLimitWindow,
} from '@ptah-extension/shared';
import {
  buildProviderLimitCard,
  buildProviderLimitChip,
  hasLimitReading,
  MAX_MINI_ROWS,
} from './provider-limit-card.view-model';

const NOW = Date.UTC(2026, 9, 3, 12, 0);
const MIN = 60_000;
const TIME: LocalTimeOptions = { timeZone: 'UTC', zoneNameLocale: 'en-GB' };
const ISO = /\d{4}-\d{2}-\d{2}T/;

function win(overrides: Partial<PlanLimitWindow> = {}): PlanLimitWindow {
  return {
    key: 'other:test',
    kind: 'other',
    label: 'Test',
    observedAt: NOW - 2 * MIN,
    lastResetAt: NOW - 2 * 60 * MIN,
    resetsAt: NOW + 3 * 60 * MIN,
    used: { kind: 'percent', percent: 40 },
    ...overrides,
  };
}

function owner(
  windows: readonly PlanLimitWindow[],
  overrides: Partial<PlanLimitOwnerSnapshot> = {},
): PlanLimitOwnerSnapshot {
  return {
    owner: {
      key: 'claude-cli#account:0123456789abcdef',
      providerId: 'claude-cli',
      identityKind: 'account',
      label: 'Claude account',
    },
    status: 'available',
    windowSetEstablished: true,
    windows,
    ownerEvidence: [],
    source: 'provider-api',
    readAt: NOW - MIN,
    ...overrides,
  };
}

describe('provider-limit-card.view-model', () => {
  it('shows an available ring with the used percent', () => {
    const card = buildProviderLimitCard(owner([win()]), false, NOW, TIME);
    expect(card.state).toBe('available');
    expect(card.ring?.value).toBe(40);
    expect(card.ring?.centerText).toBe('40%');
    expect(card.resetLine).toBeNull();
    expect(card.primaryValueText).toBeNull();
  });

  it('splits a short title from the account line and badges the state with a glyph', () => {
    const card = buildProviderLimitCard(owner([win()]), false, NOW, TIME);
    expect(card.titleText.length).toBeGreaterThan(0);
    expect(card.label).toContain(card.titleText);
    expect(card.accountLine).not.toBeNull();
    expect(card.statusTone).toBe('ok');
    expect(card.statusGlyph).toBe('✓');
    expect(card.details[0]).toEqual({ key: 'account', term: 'Account', value: card.label });
  });

  it('maps limit and near-limit states to err/warn badges with distinct glyphs', () => {
    const reached = buildProviderLimitCard(
      owner([win({ used: { kind: 'percent', percent: 100 }, usedSource: 'provider-api' })]),
      false,
      NOW,
      TIME,
    );
    const near = buildProviderLimitCard(
      owner([win({ used: { kind: 'percent', percent: 95 } })]),
      false,
      NOW,
      TIME,
    );
    expect([reached.statusTone, reached.statusGlyph]).toEqual(['err', '⚠']);
    expect([near.statusTone, near.statusGlyph]).toEqual(['warn', '▲']);
  });

  it('uses the warn tone near the limit', () => {
    const card = buildProviderLimitCard(
      owner([win({ used: { kind: 'percent', percent: 95 } })]),
      false,
      NOW,
      TIME,
    );
    expect(card.state).toBe('near-limit');
    expect(card.ring?.tone).toBe('warn');
  });

  it('shows a short relative reset only when the limit is reached', () => {
    const card = buildProviderLimitCard(
      owner([
        win({ used: { kind: 'percent', percent: 100 }, usedSource: 'provider-api' }),
      ]),
      false,
      NOW,
      TIME,
    );
    expect(card.state).toBe('limit-reached');
    expect(card.ring?.value).toBe(100);
    expect(card.resetLine).toMatch(/^Resets /);
    expect(card.resetLine).not.toMatch(ISO);
    expect(card.details.some((item) => item.key.endsWith(':reset'))).toBe(true);
  });

  it('keeps a finite amount visible when the denominator is unusable', () => {
    const card = buildProviderLimitCard(
      owner([win({ used: { kind: 'amount', amount: 1200, limit: 0, unit: 'requests' } })]),
      false,
      NOW,
      TIME,
    );
    expect(card.ring).toBeNull();
    expect(card.primaryValueText).toBeTruthy();
  });

  it('limits mini rows and counts the hidden ones', () => {
    const windows = [0, 1, 2, 3].map((i) =>
      win({ key: `other:w${i}`, label: `W${i}`, used: { kind: 'percent', percent: 10 + i } }),
    );
    const card = buildProviderLimitCard(owner(windows), false, NOW, TIME);
    expect(card.miniRows.length).toBe(MAX_MINI_ROWS);
    expect(card.hiddenRowCount).toBe(windows.length - 1 - MAX_MINI_ROWS);
  });

  it('writes one source line with a relative age and no raw ISO', () => {
    const card = buildProviderLimitCard(owner([win()]), true, NOW, TIME);
    expect(card.selected).toBe(true);
    expect(card.sourceLine).toContain('observed 1m ago');
    expect(card.sourceLine).not.toMatch(ISO);
    for (const item of card.details) expect(item.value).not.toMatch(ISO);
  });

  it('builds a chip for an owner without a reading', () => {
    const empty = owner([]);
    expect(hasLimitReading(empty)).toBe(false);
    const chip = buildProviderLimitChip(empty, NOW, TIME);
    expect(chip.providerId).toBe('claude-cli');
    expect(chip.reason).toBe(chip.reason.toLowerCase());
    expect(chip.reason.length).toBeGreaterThan(0);
  });
  it.each([
    { lastResetAt: undefined, usedSource: 'stream-event' as const, status: 'Not confirmed' },
    { usedSource: 'estimated' as const, status: 'Estimate only' },
  ])('qualifies fallback readings as $status', ({ status, ...overrides }) => {
    const card = buildProviderLimitCard(owner([win({ ...overrides, used: { kind: 'percent', percent: status === 'Estimate only' ? 100 : 40 } })]), false, NOW, TIME);
    expect(card.statusText).toBe(status);
    expect(card.ring?.tone).toBe('neutral');
    if (overrides.usedSource === 'estimated') expect(card.ring?.centerText).toBe('~100%');
  });

  it('retains every window, accounting item, model and scoped owner evidence in Details', () => {
    const card = buildProviderLimitCard(owner(
      [0, 1, 2, 3].map((i) => win({ key: `other:${i}`, label: `Window ${i}` })),
      {
        localUsage: { kind: 'local-usage', label: 'Local usage', tokens: 1234, estimatedCostUsd: 5, observedAt: NOW, source: 'local-cli', models: [{ model: 'model-a', requests: 3 }, { model: 'model-b', requests: 4 }] },
        ownerEvidence: [0, 1, 2, 3].map((i) => ({ observedAt: NOW - MIN, source: 'stream-event', modelScope: `scope-${i}` })),
      },
    ), false, NOW, TIME);
    expect(card.hiddenRowCount).toBe(1);
    for (const label of ['Window 0', 'Window 1', 'Window 2', 'Window 3', 'model-a', 'model-b']) {
      expect(card.details.some((item) => item.term === label)).toBe(true);
    }
    const values = card.details.map((item) => item.value).join(' ');
    expect(values).toContain('1,234 tokens');
    expect(values).toContain('$5.00 USD');
    for (const i of [0, 1, 2, 3]) expect(values).toContain(`scope-${i}`);
  });

  it('keeps owner-only active evidence visible without a percentage', () => {
    const card = buildProviderLimitCard(owner([], { ownerEvidence: [{ source: 'stream-event', observedAt: NOW, modelScope: 'sonnet' }] }), false, NOW, TIME);
    expect(card.notice).toContain('Limit hit (sonnet)');
    expect(card.ring).toBeNull();
    expect(card.details.some((item) => String(item.value).includes('sonnet'))).toBe(true);
  });

  it('shows relative cooldown and stale notices, reserving absolute times for Details', () => {
    const card = buildProviderLimitCard(owner([win()], {
      status: 'stale', staleSince: NOW - MIN,
      cooldown: { until: NOW + 5 * MIN, observedAt: NOW },
    }), false, NOW, TIME);
    expect(card.notice).toContain('in 5m');
    expect(card.notice).toContain('1m ago');
    expect(card.notice).not.toMatch(/12:|11:|UTC|2026/);
    expect(card.details.find((item) => item.key === 'cooldown')?.value).toContain('12:05');
    expect(card.details.find((item) => item.key === 'notice')?.value).toContain('11:59');
  });

});
