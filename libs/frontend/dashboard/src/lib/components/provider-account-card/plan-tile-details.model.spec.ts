import {
  planLimitReasonLabel,
  type LocalTimeOptions,
  type PlanLimitOwnerSnapshot,
  type PlanLimitStatusReason,
  type PlanLimitWindow,
  type ProviderAccountUsageStatus,
} from '@ptah-extension/shared';
import {
  buildPlanTile,
  compactCount,
  compactTokens,
  tileTitleLines,
} from './plan-tile-view.model';

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

describe('plan-tile details', () => {
  describe('compactCount / compactTokens', () => {
    it('keeps exact separators below 10,000 and compacts above', () => {
      expect(compactCount(2588)).toBe('2,588');
      expect(compactCount(9999)).toBe('9,999');
      expect(compactCount(10000)).toBe('10K');
      expect(compactCount(12345678)).toBe('12.3M');
    });

    it('compacts a large integer string through BigInt without unsafe coercion', () => {
      expect(compactTokens(1234)).toBe('1,234');
      expect(compactTokens('7337444803')).toBe('7.3B');
      // Beyond the safe integer range: no Number coercion. ICU keeps its own
      // compact mantissa here; the point is the exact BigInt formatting path.
      expect(compactTokens('9007199254740993')).toBe('9007.2T');
    });

    it('refuses a decimal string that cannot be represented safely', () => {
      expect(compactTokens('9007199254740993.5')).toBe('unknown');
      expect(compactTokens('10.5')).toBe('10.5');
      expect(compactTokens('n/a')).toBe('unknown');
    });
  });

  describe('planLimitReasonLabel', () => {
    it('maps the unavailable reason and the typed status reasons from the shared DTO', () => {
      expect(planLimitReasonLabel('no-open-session', 'anthropic')).toBe(
        'No open session to read this account’s usage from.',
      );
      expect(planLimitReasonLabel('api-key-no-subscription-quota', 'grok')).toBe(
        'No subscription quota for API-key login; local usage only',
      );
      expect(planLimitReasonLabel('cli-parse-failed', 'antigravity')).toBe(
        'Antigravity CLI usage output not recognized',
      );
      expect(planLimitReasonLabel('balance-unavailable', 'ollama-cloud')).toBe(
        'Plan limits unavailable right now; showing request counts',
      );
      expect(planLimitReasonLabel('prepaid-balance-unavailable', 'ollama-cloud')).toBe(
        'Prepaid balance unavailable right now',
      );
      expect(planLimitReasonLabel('balance-auth-rejected', 'ollama-cloud')).toBe(
        'API key cannot read plan limits; showing request counts',
      );
    });

    it('names the provider CLI only for the provider that owns it', () => {
      // Defect: every provider got the Antigravity sign-in text, so the
      // Grok chip told the user to run agy.
      expect(planLimitReasonLabel('cli-not-signed-in', 'antigravity')).toBe(
        'Sign in to the Antigravity CLI (run agy once)',
      );
      expect(planLimitReasonLabel('cli-not-signed-in', 'grok')).toBe(
        'Sign in to the Grok CLI (run grok login)',
      );
      expect(planLimitReasonLabel('cli-not-signed-in', 'kimi-code')).toBe(
        'Sign in to the provider CLI',
      );
    });

    it('never names Antigravity for a shared reason of another provider', () => {
      const shared: PlanLimitStatusReason[] = [
        'no-oauth',
        'no-local-server',
        'cli-unavailable',
        'cli-not-found',
        'cli-timeout',
        'cli-not-signed-in',
        'cli-exit-error',
        'cli-parse-failed',
        'cli-backoff',
        'account-unverified',
      ];
      for (const reason of shared) {
        for (const providerId of ['grok', 'anthropic', 'codex', 'unknown']) {
          const label = planLimitReasonLabel(reason, providerId);
          expect(label).not.toBeNull();
          expect(label).not.toMatch(/antigravity|agy/i);
        }
        expect(planLimitReasonLabel(reason, 'antigravity')).toMatch(
          /Antigravity/,
        );
      }
      expect(planLimitReasonLabel('cli-parse-failed', 'grok')).toBe(
        'Grok CLI usage output not recognized',
      );
      expect(planLimitReasonLabel('no-oauth', 'anthropic')).toBe(
        'Not signed in (OAuth)',
      );
    });

    it('shows the Grok sign-in text in a Grok tile pill', () => {
      const view = buildPlanTile(
        owner([], {
          owner: {
            key: 'grok#cli-store:0123456789abcdef',
            providerId: 'grok',
            identityKind: 'cli-store',
            label: 'Grok account',
          },
          status: 'service-unavailable',
          statusReason: 'cli-not-signed-in',
        }),
        NOW,
        TIME,
      );
      expect(view.statusPill?.text).toBe(
        'Sign in to the Grok CLI (run grok login)',
      );
    });

    it('returns null for an unknown or absent reason', () => {
      // The compiled union is exhaustive; a runtime value a newer backend
      // sends must still fall back to null, never to a fabricated sentence.
      const unknown = 'some-new-reason' as PlanLimitStatusReason;
      expect(planLimitReasonLabel(unknown, 'antigravity')).toBeNull();
      expect(planLimitReasonLabel(undefined, 'antigravity')).toBeNull();
    });

    it('prefers the typed reason over the generic status sentence in the pill', () => {
      // Grok audit defect: an API-key login with no subscription quota used
      // to read as the generic "No plan limits (API key)" sentence.
      const view = buildPlanTile(
        owner([], {
          owner: {
            key: 'grok#credential:0123456789abcdef',
            providerId: 'grok',
            identityKind: 'credential',
            label: 'Grok API key',
          },
          status: 'unsupported-auth',
          statusReason: 'api-key-no-subscription-quota',
          localUsage: {
            kind: 'local-usage',
            label: 'Grok usage',
            tokens: 0,
            estimatedCostUsd: 0,
            observedAt: NOW - MIN,
            source: 'provider-api',
            requests: 12,
          },
        }),
        NOW,
        TIME,
      );
      expect(view.statusPill?.text).toBe(
        'No subscription quota for API-key login; local usage only',
      );
    });
  });

  describe('buildPlanTile typed statusReason priority (review defect 3)', () => {
    const antigravity = (overrides: Partial<PlanLimitOwnerSnapshot>) =>
      owner([], {
        ...overrides,
        owner: {
          key: 'antigravity#account:0123456789abcdef',
          providerId: 'antigravity',
          identityKind: 'account',
          label: 'Antigravity account',
        },
      });

    it('lets the typed reason win over the generic Antigravity app message', () => {
      const view = buildPlanTile(
        antigravity({
          status: 'service-unavailable',
          statusReason: 'cli-parse-failed',
        }),
        NOW,
        TIME,
      );
      expect(view.statusNotice).toBeNull();
      expect(view.statusPill?.text).toBe(
        'Antigravity CLI usage output not recognized',
      );
    });

    it('keeps the generic app message only as the fallback without a typed reason', () => {
      const view = buildPlanTile(
        antigravity({ status: 'service-unavailable' }),
        NOW,
        TIME,
      );
      expect(view.statusNotice).toBeNull();
      expect(view.statusPill?.text).toBe(
        'Open Antigravity to read local quota',
      );
    });

    it('tells a rejected Antigravity sign-in apart from a closed app', () => {
      const view = buildPlanTile(
        antigravity({ status: 'unsupported-auth' }),
        NOW,
        TIME,
      );
      expect(view.statusPill?.text).toBe(
        'Antigravity sign-in rejected — sign in to Antigravity again',
      );
      expect(view.statusPill?.text).not.toContain('Open Antigravity');
    });

    it('distinguishes an Ollama Cloud key failure, a missing key and no usage source', () => {
      const pill = (status: ProviderAccountUsageStatus) =>
        buildPlanTile(
          owner([], {
            owner: {
              key: 'ollama-cloud#credential:0123456789abcdef',
              providerId: 'ollama-cloud',
              identityKind: 'credential',
              label: 'Ollama Cloud API key',
            },
            status,
          }),
          NOW,
          TIME,
        ).statusPill?.text;
      expect(pill('unsupported-auth')).toBe('API key rejected — check the key');
      expect(pill('unsupported-config')).toBe('No API key configured');
      expect(pill('no-usage-source')).toBe('No usage source available');
    });

    it('says plan limits are unavailable for a partial Ollama read, keeping the request counts', () => {
      const partial = (statusReason: PlanLimitStatusReason) =>
        buildPlanTile(
          owner([], {
            owner: {
              key: 'ollama-cloud#credential:0123456789abcdef',
              providerId: 'ollama-cloud',
              identityKind: 'credential',
              label: 'Ollama Cloud API key',
            },
            // The reader keeps status "available" for a usage-only read;
            // only the typed reason tells the balance endpoint failed.
            statusReason,
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
      const unavailable = partial('balance-unavailable');
      expect(unavailable.primaryWindow).toBeNull();
      expect(unavailable.statusPill?.text).toBe(
        'Plan limits unavailable right now; showing request counts',
      );
      expect(unavailable.accounting[0]?.valueText).toBe('2,588 requests');
      const rejected = partial('balance-auth-rejected');
      expect(rejected.statusPill?.text).toBe(
        'API key cannot read plan limits; showing request counts',
      );
      expect(rejected.statusPill?.text).not.toBe('No plan limits reported');
    });
  });

  describe('buildPlanTile window facts (restored coverage)', () => {
    it('reports a passed reset and the next reset as separate facts, usage unknown', () => {
      const view = buildPlanTile(
        owner([
          // The reset passed after the last observation: the used value is
          // void and the next reset is unknown (window-state case a).
          win({
            key: 'five_hour',
            kind: 'five_hour',
            label: '5-hour',
            used: { kind: 'percent', percent: 96 },
            resetsAt: NOW - 40 * MIN,
            resetSource: 'provider-api',
            observedAt: NOW - 68 * MIN,
          }),
          // Observed before a known reset that is still ahead: the used
          // value is void, but the next reset survives (case b).
          win({
            key: 'weekly',
            kind: 'weekly',
            label: 'Weekly',
            used: { kind: 'percent', percent: 80 },
            resetsAt: NOW + 5 * 60 * MIN,
            resetSource: 'provider-api',
            lastResetAt: NOW - 40 * MIN,
            observedAt: NOW - 68 * MIN,
          }),
        ]),
        NOW,
        TIME,
      );
      expect(view.primaryWindow).toBeNull();
      const fiveHour = view.secondaryWindows.find((chip) => chip.label === '5-hour');
      expect(fiveHour?.valueText).toBe('Usage unknown');
      expect(fiveHour?.qualifier).toContain('usage unknown');
      expect(fiveHour?.resetText).toContain('came after the last observation');
      expect(fiveHour?.resetText).toContain('Next reset unknown');
      const weekly = view.secondaryWindows.find((chip) => chip.label === 'Weekly');
      expect(weekly?.resetText).toContain('came after the last observation');
      expect(weekly?.resetText).toContain('Next reset');
      expect(weekly?.resetText).toContain('in 5h 0m');
    });

    it('colours the primary bar by state: ok, near-limit and limit-reached', () => {
      const tone = (window: PlanLimitWindow) =>
        buildPlanTile(owner([window]), NOW, TIME).primaryWindow?.tone;
      expect(tone(win({ used: { kind: 'percent', percent: 3 } }))).toBe(
        'success',
      );
      expect(tone(win({ used: { kind: 'percent', percent: 94 } }))).toBe(
        'warning',
      );
      expect(
        tone(
          win({
            used: { kind: 'percent', percent: 100 },
            exhaustion: {
              observedAt: NOW - 10 * MIN,
              source: 'error-derived',
              resetsAt: NOW + 60 * MIN,
            },
          }),
        ),
      ).toBe('error');
    });

    it('keeps a neutral bar for aged, estimate-only and not-confirmed windows', () => {
      const aged = buildPlanTile(
        owner([
          win({
            key: 'five_hour',
            kind: 'five_hour',
            label: '5-hour session',
            used: { kind: 'percent', percent: 97 },
            observedAt: NOW - 22 * MIN,
          }),
        ]),
        NOW,
        TIME,
      );
      expect(aged.primaryWindow?.tone).toBe('neutral');
      expect(aged.primaryWindow?.qualifier).toBe('Aged');
      expect(aged.primaryWindow?.provenance.join(' ')).toContain('observed 22m ago');

      const estimateOnly = buildPlanTile(
        owner([
          win({
            key: 'monthly',
            kind: 'monthly',
            label: 'Monthly',
            used: { kind: 'percent', percent: 40 },
            usedSource: 'estimated',
            resetsAt: NOW + 10 * 24 * 60 * MIN,
            resetSource: 'estimated',
          }),
        ]),
        NOW,
        TIME,
      );
      expect(estimateOnly.primaryWindow?.tone).toBe('neutral');
      expect(estimateOnly.primaryWindow?.qualifier).toBe('Estimated');

      const notConfirmed = buildPlanTile(
        owner([
          win({
            key: 'five_hour',
            kind: 'five_hour',
            label: '5-hour session',
            used: { kind: 'percent', percent: 57 },
            usedSource: 'provider-unofficial',
            resetsAt: NOW + 5 * 60 * MIN,
            resetSource: 'estimated',
            lastResetAt: undefined,
          }),
        ]),
        NOW,
        TIME,
      );
      expect(notConfirmed.primaryWindow?.tone).toBe('neutral');
      expect(notConfirmed.primaryWindow?.qualifier).toBe('Not confirmed');
    });

    it('separates active, expired and estimated owner evidence', () => {
      const view = buildPlanTile(
        owner(
          [
            win({
              key: 'monthly',
              kind: 'monthly',
              label: 'Monthly',
              used: { kind: 'percent', percent: 40 },
              usedSource: 'estimated',
              resetsAt: NOW + 24 * 60 * MIN,
              resetSource: 'estimated',
              exhaustion: {
                observedAt: NOW - 5 * MIN,
                source: 'estimated',
                resetsAt: NOW + 60 * MIN,
              },
            }),
          ],
          {
            ownerEvidence: [
              {
                observedAt: NOW - 2 * MIN,
                source: 'error-derived',
                resetsAt: NOW + 60 * MIN,
              },
              {
                observedAt: NOW - 3 * 60 * MIN,
                source: 'error-derived',
                resetsAt: NOW - 10 * MIN,
              },
              {
                observedAt: NOW - 5 * MIN,
                source: 'estimated',
                resetsAt: NOW + 60 * MIN,
              },
            ],
          },
        ),
        NOW,
        TIME,
      );
      const active = view.evidence.find(
        (entry) =>
          !entry.text.includes('Estimated') && !entry.text.includes('expired'),
      );
      expect(active?.tone).toBe('warning');
      expect(active?.text).toContain('Limit hit');
      const expired = view.evidence.find((entry) =>
        entry.text.includes('expired'),
      );
      expect(expired?.tone).toBe('neutral');
      expect(view.evidence[2]?.text).toBe('+1 more');
      expect(view.evidence[2]?.title).toContain('Estimated limit hit');
      expect(view.evidence[2]?.title).toContain('(unconfirmed, informational)');
      expect(view.primaryWindow?.provenance.join(' ')).toContain('Estimated limit hit');
    });
  });

  describe('tileTitleLines', () => {
    it('keeps a plain label on one line', () => {
      expect(tileTitleLines('Claude account · cdef')).toEqual({
        name: 'Claude account · cdef',
        qualifier: null,
      });
    });

    it('moves parenthesized qualifiers to the muted second line', () => {
      expect(
        tileTitleLines('Claude (owner unknown) (key unavailable) · 81da'),
      ).toEqual({
        name: 'Claude · 81da',
        qualifier: '(owner unknown) (key unavailable)',
      });
    });

    it('feeds the two header lines from the owner label', () => {
      const view = buildPlanTile(
        owner([], {
          status: 'unsupported-auth',
          owner: {
            key: 'claude-cli#credential:0123456789abcdef',
            providerId: 'claude-cli',
            identityKind: 'credential',
            label: 'Claude (owner unknown) (key unavailable)',
          },
        }),
        NOW,
        TIME,
      );
      expect(view.titleName).toBe('Claude · cdef');
      expect(view.titleQualifier).toBe('(owner unknown) (key unavailable)');
      // The full label stays for aria-labels and the header tooltip.
      expect(view.label).toBe(
        'Claude (owner unknown) (key unavailable) · cdef',
      );
    });
  });

  describe('buildPlanTile footer status chip', () => {
    it('drops the footer chip that would repeat the API-key pill (Claude)', () => {
      const view = buildPlanTile(
        owner([], {
          status: 'unsupported-auth',
          owner: {
            key: 'claude-cli#credential:0123456789abcdef',
            providerId: 'claude-cli',
            identityKind: 'credential',
            label: 'Claude API key',
          },
        }),
        NOW,
        TIME,
      );
      expect(view.statusPill?.text).toBe('No plan limits (API key)');
      expect(view.statusNotice).toBeNull();
    });

    it('drops the footer chip for a provider-CLI API key', () => {
      const view = buildPlanTile(
        owner([], {
          status: 'unsupported-auth',
          owner: {
            key: 'provider-cli#credential:0123456789abcdef',
            providerId: 'provider-cli',
            identityKind: 'credential',
            label: 'Provider CLI login',
          },
        }),
        NOW,
        TIME,
      );
      expect(view.statusPill?.text).toBe('No plan limits (API key)');
    });

    it('keeps only the Add key action for a missing Ollama key', () => {
      const view = buildPlanTile(
        owner([], {
          status: 'unsupported-config',
          owner: {
            key: 'ollama-cloud#credential:0123456789abcdef',
            providerId: 'ollama-cloud',
            identityKind: 'credential',
            label: 'Ollama Cloud (owner unknown)',
          },
        }),
        NOW,
        TIME,
      );
      expect(view.statusPill?.text).toBe('No API key configured');
      expect(view.statusNotice).toBeNull();
      expect(view.action).toEqual({
        kind: 'add-key',
        label: 'Add key',
        providerId: 'ollama-cloud',
      });
    });

    it('drops the Usage unavailable chip next to the Antigravity pill', () => {
      const view = buildPlanTile(
        owner([], {
          status: 'service-unavailable',
          owner: {
            key: 'antigravity#account:0123456789abcdef',
            providerId: 'antigravity',
            identityKind: 'account',
            label: 'Antigravity account',
          },
        }),
        NOW,
        TIME,
      );
      expect(view.statusPill?.text).toBe(
        'Open Antigravity to read local quota',
      );
    });

    it('shows one stale message for a windowed owner and retains cooldown', () => {
      const view = buildPlanTile(
        owner([win({ observedAt: NOW - 2 * 60 * MIN })], {
          status: 'stale',
          staleSince: NOW - 60 * MIN,
          cooldown: { observedAt: NOW, until: NOW + 5 * MIN },
        }),
        NOW,
        TIME,
      );
      expect(view.primaryWindow).not.toBeNull();
      expect(view.statusNotice).toContain(
        'Showing cached account data; refresh failed',
      );
      expect(view.cooldown).toContain('a retry delay, not a plan reset');
    });

    it('keeps Codex weekly quota and its 5-hour chip', () => {
      const view = buildPlanTile(
        owner(
          [
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
          ],
          {
            owner: {
              key: 'codex#account:0123456789abcdef',
              providerId: 'codex',
              identityKind: 'account',
              label: 'Codex account',
            },
          },
        ),
        NOW,
        TIME,
      );
      expect(view.primaryWindow?.label).toBe('Weekly');
      expect(view.secondaryWindows.map((chip) => chip.label)).toEqual(['5-hour']);
      expect(view.statusNotice).toBeNull();
    });

    it('keeps OpenCode Go monthly, 5-hour and weekly facts without a duplicate status', () => {
      const view = buildPlanTile(
        owner(
          [
            win({
              key: 'monthly',
              kind: 'monthly',
              label: 'Go monthly',
              used: { kind: 'percent', percent: 95 },
            }),
            win({
              key: 'five_hour',
              kind: 'five_hour',
              label: '5-hour',
              used: { kind: 'percent', percent: 42 },
            }),
            win({
              key: 'weekly',
              kind: 'weekly',
              label: 'Weekly',
              used: { kind: 'percent', percent: 38 },
            }),
          ],
          {
            owner: {
              key: 'opencode#account:0123456789abcdef',
              providerId: 'opencode',
              identityKind: 'account',
              label: 'OpenCode Go',
            },
          },
        ),
        NOW,
        TIME,
      );
      expect(view.primaryWindow?.label).toBe('Go monthly');
      expect(view.secondaryWindows.map((chip) => chip.label)).toEqual([
        '5-hour',
        'Weekly',
      ]);
      expect(view.statusNotice).toBeNull();
    });

    it('keeps every supporting window for disclosure', () => {
      const windows = [
        win({
          key: 'other:primary',
          label: 'Primary',
          used: { kind: 'percent', percent: 99 },
        }),
        ...Array.from({ length: 5 }, (_, index) =>
          win({
            key: `other:extra-${index}`,
            label: `Extra ${index}`,
            used: { kind: 'percent', percent: 20 + index },
          }),
        ),
      ];
      const view = buildPlanTile(owner(windows), NOW, TIME);
      expect(view.secondaryWindows).toHaveLength(5);
      expect(view.secondaryWindows.map((window) => window.label)).toContain('Extra 4');
    });

    it('caps evidence at two plus a titled overflow notice', () => {
      const view = buildPlanTile(
        owner([], {
          ownerEvidence: Array.from({ length: 4 }, (_, index) => ({
            observedAt: NOW - (index + 1) * MIN,
            source: 'error-derived' as const,
            modelScope: `Model ${index}`,
            resetsAt: NOW + 60 * MIN,
          })),
        }),
        NOW,
        TIME,
      );
      expect(view.evidence).toHaveLength(3);
      expect(view.evidence[2]?.text).toBe('+2 more');
      expect(view.evidence[2]?.title).toContain('Model 2');
      expect(view.evidence[2]?.title).toContain('Model 3');
    });
  });
});
