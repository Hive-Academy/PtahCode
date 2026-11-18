import { groupProviderAccounts } from './provider-account-grouping.model';
import { buildPlanTile } from './plan-tile-view.model';
import {
  ownerFixture,
  windowFixture,
  NOW,
  TIME,
} from './provider-account-test.fixtures';
describe('provider hierarchy', () => {
  it('keeps selected unavailable owners featured, retaining snapshot order', () => {
    const a = ownerFixture({
      owner: {
        key: 'a',
        providerId: 'selected',
        identityKind: 'unknown',
        label: 'Unknown',
      },
      status: 'service-unavailable',
      windows: [],
    });
    const b = ownerFixture({ owner: { ...a.owner, key: 'b' } });
    const groups = groupProviderAccounts(
      [b, a, ownerFixture()],
      'selected',
      NOW,
      TIME,
    );
    expect(groups.selected.map((record) => record.owner.owner.key)).toEqual([
      'b',
      'a',
    ]);
    expect(groups.selected[1]?.view.identity).toContain('unavailable');
    expect(groups.other).toHaveLength(1);
    expect(groups.withoutReadings).toHaveLength(0);
  });
  it('does not fabricate an owner for an unmatched selection', () => {
    expect(
      groupProviderAccounts([ownerFixture()], 'missing', NOW, TIME).selected,
    ).toEqual([]);
  });
  it('keeps accounting and active evidence without windows visible', () => {
    const activity = ownerFixture({
      windows: [],
      localUsage: {
        kind: 'local-usage',
        label: 'Activity',
        tokens: 40,
        estimatedCostUsd: 2,
        source: 'local-cli',
        observedAt: NOW,
      },
    });
    const hit = ownerFixture({
      owner: { ...activity.owner, key: 'hit' },
      windows: [],
      ownerEvidence: [
        { observedAt: NOW, source: 'error-derived', resetsAt: NOW + 60000 },
      ],
    });
    const groups = groupProviderAccounts([activity, hit], 'missing', NOW, TIME);
    expect(groups.other).toHaveLength(2);
    expect(groups.other[0]?.view.accounting.map((item) => item.kind)).toEqual([
      'tokens',
      'cost',
    ]);
  });
  it('keeps daily activity with no lifetime figure visible', () => {
    const reading = ownerFixture({
      windows: [],
      activity: { dailyUsage: [{ startDate: '2026-11-18', tokens: '1200' }] },
    });
    const groups = groupProviderAccounts([reading], 'missing', NOW, TIME);
    expect(groups.other[0]?.view.accounting[0]?.kind).toBe('activity');
  });
  it('retains missing source and observation age explicitly and partial data', () => {
    const view = buildPlanTile(
      ownerFixture({
        status: 'service-unavailable',
        statusReason: 'cli-backoff',
      }),
      NOW,
      TIME,
    );
    expect(view.provenance).toEqual([
      'Source unknown',
      'Observation time unknown',
    ]);
    expect(view.primaryWindow).not.toBeNull();
    expect(view.statusNotice).toContain('paused');
  });
  it('never falls back to a window without a comparable future reset', () => {
    const view = buildPlanTile(
      ownerFixture({ windows: [windowFixture({ resetsAt: undefined })] }),
      NOW,
      TIME,
    );
    expect(view.primaryWindow).toBeNull();
    expect(view.primaryWindow).toBeNull();
    expect(view.secondaryWindows).toHaveLength(1);
  });
  it('selects by normalized allowance saturation, then reset, then stable key', () => {
    const windows = [
      windowFixture({
        key: 'other:z',
        label: 'Amount',
        used: { kind: 'amount', amount: 120, limit: 500, unit: 'requests' },
      }),
      windowFixture({ key: 'other:b', used: { kind: 'percent', percent: 24 } }),
      windowFixture({ key: 'other:a', used: { kind: 'percent', percent: 24 } }),
    ];
    const view = buildPlanTile(ownerFixture({ windows }), NOW, TIME);
    expect(view.primaryWindow?.key).toBe('other:a');
    expect(
      view.secondaryWindows.find((window) => window.key === 'other:z')
        ?.valueText,
    ).toContain('120 of 500 requests');
  });
  it('keeps balance units separate from timed windows and activity', () => {
    const view = buildPlanTile(
      ownerFixture({
        credits: { hasCredits: true, unlimited: false, balance: '12 widgets' },
        localUsage: {
          kind: 'local-usage',
          label: 'Requests',
          tokens: 0,
          estimatedCostUsd: 0,
          requests: 185,
          source: 'provider-api',
          observedAt: NOW,
          range: 'reported week',
        },
      }),
      NOW,
      TIME,
    );
    expect(view.accounting[0]?.valueText).toBe('12 widgets');
    expect(view.accounting.map((item) => item.kind)).toEqual([
      'balance',
      'requests',
    ]);
    expect(view.accounting[1]?.provenance).toContain('reported week');
  });
  it('keeps all per-model request counts for the detail disclosure', () => {
    const models = Array.from({ length: 8 }, (_, index) => ({
      model: `model-${index}`,
      requests: index + 1,
    }));
    const view = buildPlanTile(
      ownerFixture({
        localUsage: {
          kind: 'local-usage',
          label: 'Requests',
          source: 'provider-api',
          requests: 36,
          tokens: 0,
          estimatedCostUsd: 0,
          observedAt: NOW,
          models,
        },
      }),
      NOW,
      TIME,
    );
    expect(view.modelUsage).toEqual(models);
  });
  it('preserves expired reset unknown state and over-100 source readings', () => {
    const expired = buildPlanTile(
      ownerFixture({
        windows: [
          windowFixture({ resetsAt: NOW - 1000, observedAt: NOW - 60000 }),
        ],
      }),
      NOW,
      TIME,
    );
    expect(expired.primaryWindow).toBeNull();
    expect(expired.secondaryWindows[0]?.percent).toBeNull();
    expect(expired.secondaryWindows[0]?.valueText).toBe('Usage unknown');
    const exceeded = buildPlanTile(
      ownerFixture({
        windows: [windowFixture({ used: { kind: 'percent', percent: 120 } })],
      }),
      NOW,
      TIME,
    );
    expect(exceeded.primaryWindow?.percent).toBe(120);
    expect(exceeded.primaryWindow?.valueText).toContain('120%');
  });
});

it.each([0, -1, Number.NaN])('retains finite source amounts with denominator %s in other accounts', (limit) => {
  const owner = ownerFixture({ windows: [windowFixture({ used: { kind: 'amount', amount: 120, limit, unit: 'requests' } })] });
  const view = buildPlanTile(owner, NOW, TIME);
  expect(view.primaryWindow).toBeNull();
  expect(view.secondaryWindows[0]).toMatchObject({ valueText: '120 requests used', allowanceText: 'Allowance unknown', percent: null });
  const groups = groupProviderAccounts([owner], 'unmatched', NOW, TIME);
  expect(groups.other).toHaveLength(1);
  const reset = buildPlanTile({ ...owner, windows: [windowFixture({ used: { kind: 'amount', amount: 120, limit, unit: 'requests' }, resetsAt: NOW - 1000, observedAt: NOW - 60000 })] }, NOW, TIME);
  expect(reset.secondaryWindows[0]).toMatchObject({ valueText: 'Usage unknown', allowanceText: null, percent: null });
});
