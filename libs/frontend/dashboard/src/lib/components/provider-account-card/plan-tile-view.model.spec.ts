import type {
  LocalTimeOptions,
  PlanLimitOwnerSnapshot,
  PlanLimitWindow,
  UsageSourceLabel,
} from '@ptah-extension/shared';
import { buildPlanTile } from './plan-tile-view.model';

const NOW = Date.UTC(2026, 9, 3, 12, 0);
const MIN = 60_000;
/** Fixed zone so absolute reset text is stable on every machine. */
const TIME: LocalTimeOptions = { timeZone: 'UTC', zoneNameLocale: 'en-GB' };

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
    ...overrides,
  };
}

describe('plan-tile-view.model', () => {
  it.each<[UsageSourceLabel, string]>([
    ['provider-api', 'provider API'], ['cli-command', 'CLI command'],
    ['local-state', 'local state'], ['session-sdk', 'session SDK'], ['local-rpc', 'local RPC'],
  ])('shows %s provenance and observation time', (source, label) => {
    const view = buildPlanTile(owner([win()], { source, readAt: NOW - MIN }), NOW, TIME);
    expect(view.provenance[0]).toBe(label);
    expect(view.provenance[1]).toContain('1m ago');
  });
  it('labels missing provenance explicitly', () => {
    expect(buildPlanTile(owner([win()]), NOW, TIME).provenance).toEqual([
      'Source unknown', 'Observation time unknown',
    ]);
  });

  it.each(['copilot', 'cursor', 'pi'])(
    'shows no usage source for %s',
    (providerId) => {
      const reading = owner([], {
        owner: {
          key: `${providerId}#account:synthetic`,
          providerId,
          identityKind: 'account',
          label: 'Account',
        },
        status: 'no-usage-source',
        windowSetEstablished: false,
      });
      const view = buildPlanTile(reading, NOW, TIME);
      expect(view.statusPill?.text?.toLowerCase()).toContain('no usage source');
      expect(view.statusPill?.text?.toLowerCase()).not.toContain('unknown');
    },
  );

  describe('buildPlanTile primary selection', () => {
    it('shows the reset for a fresh full provider reading', () => {
      const view = buildPlanTile(
        owner([
          win({
            used: { kind: 'percent', percent: 100 },
            usedSource: 'provider-api',
            resetSource: 'provider-api',
            exhaustion: undefined,
          }),
        ]),
        NOW,
        TIME,
      );
      expect(view.primaryWindow?.resetText).toContain('Limit reached');
      expect(view.primaryWindow?.resetText).toContain('resets');
      expect(view.primaryWindow?.resetText).not.toContain('reset unknown');
    });
    it('shows the window with the highest finite used percentage', () => {
      const view = buildPlanTile(
        owner([
          win({
            key: 'five_hour',
            kind: 'five_hour',
            label: '5-hour',
            used: { kind: 'percent', percent: 41 },
          }),
          win({
            key: 'weekly',
            kind: 'weekly',
            label: 'Weekly',
            used: { kind: 'percent', percent: 94 },
          }),
        ]),
        NOW,
        TIME,
      );
      expect(view.primaryWindow?.label).toBe('Weekly');
      expect(view.primaryWindow?.percent).toBe(94);
      // 94% is at or above the near-limit percent, so the fill warns.
      expect(view.primaryWindow?.tone).toBe('warning');
      expect(view.primaryWindow?.valueText).toBe('94% used');
      expect(view.primaryWindow?.resetText).toContain('3h 0m');
      expect(view.secondaryWindows.map((chip) => chip.label)).toContain('5-hour');
    });

    it('uses the shared reset text when only exhaustion records the reset', () => {
      const view = buildPlanTile(
        owner([
          win({
            resetsAt: undefined,
            used: { kind: 'percent', percent: 100 },
            exhaustion: {
              observedAt: NOW - MIN,
              source: 'error-derived',
              resetsAt: NOW + 4 * 60 * MIN,
            },
          }),
        ]),
        NOW,
        TIME,
      );
      // No window reset, so the window is not eligible as the hero reading
      // (no first-window fallback). Its row still shows the exhaustion reset.
      expect(view.primaryWindow).toBeNull();
      const reached = view.secondaryWindows[0];
      expect(reached?.resetText).toMatch(/^Limit reached — resets .*4h 0m/);
      expect(reached?.resetText).not.toContain('unknown');
    });

    it('retains every window beyond the third', () => {
      const view = buildPlanTile(
        owner(
          Array.from({ length: 5 }, (_, index) =>
            win({
              key: `other:${index}`,
              label: `Window ${index}`,
              used: { kind: 'percent', percent: 20 + index },
            }),
          ),
        ),
        NOW,
        TIME,
      );
      expect(view.secondaryWindows).toHaveLength(4);
      expect(view.primaryWindow?.label).toBe('Window 4');
      expect(view.primaryWindow?.valueText).toBe('24% used');
    });

    it('breaks an equal percentage tie by the nearest reset', () => {
      const view = buildPlanTile(
        owner([
          win({
            key: 'weekly',
            kind: 'weekly',
            label: 'Weekly',
            resetsAt: NOW + 10 * 60 * MIN,
          }),
          win({
            key: 'monthly',
            kind: 'monthly',
            label: 'Monthly',
            resetsAt: NOW + 2 * 60 * MIN,
          }),
        ]),
        NOW,
        TIME,
      );
      expect(view.primaryWindow?.label).toBe('Monthly');
    });

    it('breaks an equal percentage and reset tie by the stable window key', () => {
      const view = buildPlanTile(
        owner([
          win({
            key: 'monthly',
            kind: 'monthly',
            label: 'Monthly',
            resetsAt: NOW + 60 * MIN,
          }),
          win({
            key: 'weekly',
            kind: 'weekly',
            label: 'Weekly',
            resetsAt: NOW + 60 * MIN,
          }),
        ]),
        NOW,
        TIME,
      );
      expect(view.primaryWindow?.label).toBe('Monthly');
    });

    it('never promotes a window without a finite percentage or a future reset', () => {
      const view = buildPlanTile(
        owner([
          win({
            key: 'weekly',
            kind: 'weekly',
            label: 'Weekly',
            used: undefined,
          }),
          win({
            key: 'five_hour',
            kind: 'five_hour',
            label: '5-hour',
            resetsAt: NOW - 5 * MIN,
            observedAt: NOW - 6 * MIN,
            lastResetAt: undefined,
          }),
        ]),
        NOW,
        TIME,
      );
      expect(view.primaryWindow).toBeNull();
      // Windows exist, so the pill names the precise cause.
      expect(view.statusPill?.text).toBe(
        'No plan window reports a known usage with a future reset',
      );
    });

    it('excludes a reset-usage-unknown window even when its reset is still ahead', () => {
      const view = buildPlanTile(
        owner([
          // A reset after the last observation invalidated the used value;
          // the reported next reset is still future (window-state case b).
          win({
            key: 'weekly',
            kind: 'weekly',
            label: 'Weekly',
            observedAt: NOW - 20 * MIN,
            lastResetAt: NOW - 5 * MIN,
            resetsAt: NOW + 30 * MIN,
            used: { kind: 'percent', percent: 80 },
          }),
        ]),
        NOW,
        TIME,
      );
      expect(view.primaryWindow).toBeNull();
      expect(view.statusPill?.text).toBe(
        'No plan window reports a known usage with a future reset',
      );
    });
  });

  describe('buildPlanTile Claude duplicate rule', () => {
    it('keeps invalidated generic weekly facts alongside the model reading', () => {
      const view = buildPlanTile(
        owner([
          win({
            key: 'weekly',
            kind: 'weekly',
            label: 'Weekly',
            observedAt: NOW - 20 * MIN,
            resetsAt: NOW - 5 * MIN,
            used: { kind: 'percent', percent: 73 },
          }),
          win({
            key: 'weekly_model:opus-4.1',
            kind: 'weekly_model',
            label: 'Weekly Opus 4.1',
            used: { kind: 'percent', percent: 30 },
          }),
        ]),
        NOW,
        TIME,
      );
      expect(view.secondaryWindows[0]?.label).toBe('Weekly');
      expect(view.secondaryWindows[0]?.valueText).toBe('Usage unknown');
      expect(view.secondaryWindows[0]?.resetText).toContain('current usage unknown');
    });

    it('keeps both weekly windows when the generic one is valid', () => {
      const view = buildPlanTile(
        owner([
          win({
            key: 'weekly',
            kind: 'weekly',
            label: 'Weekly',
            used: { kind: 'percent', percent: 50 },
          }),
          win({
            key: 'weekly_model:opus-4.1',
            kind: 'weekly_model',
            label: 'Weekly Opus 4.1',
            used: { kind: 'percent', percent: 30 },
          }),
        ]),
        NOW,
        TIME,
      );
      expect(view.primaryWindow?.label).toBe('Weekly');
      expect(view.secondaryWindows.map((chip) => chip.label)).toContain('Weekly Opus 4.1');
    });
  });

  describe('buildPlanTile status pill and supporting windows', () => {
    it('names the status cause for an owner without any window', () => {
      const view = buildPlanTile(
        owner([], { status: 'unsupported-auth' }),
        NOW,
        TIME,
      );
      expect(view.primaryWindow).toBeNull();
      expect(view.statusPill?.text).toBe('No plan limits (API key)');
    });

    it('warns on a chip at 90 percent and stays neutral below it', () => {
      const at90 = buildPlanTile(
        owner([
          win({
            key: 'weekly',
            kind: 'weekly',
            label: 'Weekly',
            used: { kind: 'percent', percent: 90 },
          }),
          win({
            key: 'monthly',
            kind: 'monthly',
            label: 'Monthly',
            used: { kind: 'percent', percent: 95 },
          }),
        ]),
        NOW,
        TIME,
      );
      expect(at90.primaryWindow?.label).toBe('Monthly');
      expect(at90.secondaryWindows[0]?.tone).toBe('warning');
      const at89 = buildPlanTile(
        owner([
          win({
            key: 'weekly',
            kind: 'weekly',
            label: 'Weekly',
            used: { kind: 'percent', percent: 89 },
          }),
          win({
            key: 'monthly',
            kind: 'monthly',
            label: 'Monthly',
            used: { kind: 'percent', percent: 95 },
          }),
        ]),
        NOW,
        TIME,
      );
      expect(at89.secondaryWindows[0]?.tone).toBe('success');
    });

    it('carries visible reset and source facts', () => {
      const view = buildPlanTile(
        owner([
          win({
            key: 'five_hour',
            kind: 'five_hour',
            label: '5-hour',
            resetsAt: NOW + 5 * 60 * MIN,
            used: { kind: 'percent', percent: 20 },
            usedSource: 'stream-event',
            resetSource: 'provider-api',
          }),
          win({ used: { kind: 'percent', percent: 60 } }),
        ]),
        NOW,
        TIME,
      );
      const chip = view.secondaryWindows.find((c) => c.label === '5-hour');
      expect(chip?.resetText).toContain('5h 0m');
      expect(chip?.provenance.join(' ' )).toContain('Live event');
      expect(chip?.provenance.join(' ' )).toContain('Provider API');
    });
  });

  describe('buildPlanTile accounting', () => {
    it('shows request counts for a requests-metering source', () => {
      const view = buildPlanTile(
        owner([], {
          status: 'no-usage-source',
          localUsage: {
            kind: 'local-usage',
            label: 'Ollama Cloud usage',
            tokens: 0,
            estimatedCostUsd: 0,
            observedAt: NOW - MIN,
            source: 'provider-api',
            requests: 2588,
          },
        }),
        NOW,
        TIME,
      );
      expect(view.accounting.find((item) => item.kind === 'requests')?.valueText).toBe('2,588 requests');
      expect(view.statusPill?.text).toBe('Local usage only');
    });

    it('shows tokens and cost for a local CLI, plus compacted lifetime tokens', () => {
      const view = buildPlanTile(
        owner([], {
          localUsage: {
            kind: 'local-usage',
            label: 'OpenCode CLI usage',
            tokens: 1234,
            estimatedCostUsd: 5.67,
            observedAt: NOW - MIN,
            source: 'local-cli',
            range: '2026-09-03T00:00:00Z – 2026-10-03T00:00:00Z',
          },
          activity: { lifetimeTokens: '7337444803', dailyUsage: [] },
        }),
        NOW,
        TIME,
      );
      expect(view.accounting.map((item) => item.valueText)).toEqual([
        '1,234 tokens', '$5.67 USD', '7.3B',
      ]);
      expect(view.accounting[0]?.provenance.join(' ')).toContain('2026-09-03T00:00:00Z');
      expect(view.accounting[0]?.provenance.join(' ')).toContain('2026-10-03T00:00:00Z');
    });

    it('falls back to the raw string for a backwards or unparseable range', () => {
      const withRange = (range: string) =>
        buildPlanTile(
          owner([], {
            localUsage: {
              kind: 'local-usage',
              label: 'Local usage',
              tokens: 10,
              estimatedCostUsd: 0.1,
              observedAt: NOW,
              source: 'local-cli',
              range,
            },
          }),
          NOW,
          TIME,
        );
      expect(
        withRange('2026-01-30T22:00:00.000Z - 2025-12-31T22:00:00.000Z')
          .accounting[0]?.provenance.join(' '),
      ).toContain('2026-01-30T22:00:00.000Z - 2025-12-31T22:00:00.000Z');
      expect(withRange('since install').accounting[0]?.provenance.join(' ')).toContain(
        'since install',
      );
    });

    it('retains all per-model request counts for disclosure', () => {
      const withUsage = (models: { model: string; requests: number }[]) =>
        buildPlanTile(
          owner([], {
            status: 'no-usage-source',
            localUsage: {
              kind: 'local-usage',
              label: 'Ollama Cloud usage',
              tokens: 0,
              estimatedCostUsd: 0,
              observedAt: NOW - MIN,
              source: 'provider-api',
              requests: 273,
              models,
            },
          }),
          NOW,
          TIME,
        );
      const single = withUsage([{ model: 'glm-5.3', requests: 1 }]);
      expect(single.modelUsage).toEqual([{ model: 'glm-5.3', requests: 1 }]);

      const capped = withUsage([
        { model: 'llama3.1', requests: 42 },
        { model: 'gpt-oss', requests: 1 },
        { model: 'glm-5.3', requests: 185 },
        { model: 'mistral', requests: 1 },
        { model: 'qwen3', requests: 20 },
        { model: 'phi4', requests: 3 },
        { model: 'deepseek-r1', requests: 2 },
      ]);
      expect(capped.modelUsage).toHaveLength(7);
      expect(capped.modelUsage).toContainEqual({ model: 'glm-5.3', requests: 185 });
      expect(capped.accounting[0]?.valueText).toBe('273 requests');
    });
  });

  describe('buildPlanTile owner notices', () => {
    it('keeps the stale notice when the provider refresh failed', () => {
      const view = buildPlanTile(
        owner([win({ observedAt: NOW - 2 * 60 * MIN })], {
          status: 'stale',
          staleSince: NOW - 60 * MIN,
        }),
        NOW,
        TIME,
      );
      expect(view.statusNotice).toContain('Showing cached account data');
      expect(view.statusNotice).toContain('refresh failed');
    });

    it('maps an evidence notice with its source label', () => {
      const view = buildPlanTile(
        owner([], {
          status: 'service-unavailable',
          ownerEvidence: [
            {
              observedAt: NOW - 2 * MIN,
              source: 'error-derived',
              resetsAt: NOW + 60 * MIN,
              modelScope: 'opus-4.1',
            },
          ],
        }),
        NOW,
        TIME,
      );
      expect(view.evidence.length).toBe(1);
      expect(view.evidence[0]?.text).toContain('Limit hit (opus-4.1)');
      expect(view.evidence[0]?.title).toContain('From error');
    });
  });
});
