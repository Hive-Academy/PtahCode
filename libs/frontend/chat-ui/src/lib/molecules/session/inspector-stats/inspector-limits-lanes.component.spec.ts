import type { PlanLimitOwnerSnapshot, PlanLimitWindow } from '@ptah-extension/shared';
import { TestBed } from '@angular/core/testing';
import { InspectorLimitsLanesComponent } from './inspector-limits-lanes.component';
import { buildStatsLimitViewModel } from '../plan-limits/stats-limit-view-model';
import type { PlanLimitTileModel, StatsLimitLaneRun } from '../plan-limits/stats-limit-view-model.types';

const now = Date.UTC(2026, 9, 26, 23, 30);
const run = (runId: string, role: string): StatsLimitLaneRun => ({
  runId, cli: 'codex', cliLabel: 'Codex', role, status: 'completed',
  restored: false, startedAt: now - 1000, usageTotals: null,
});

describe('InspectorLimitsLanesComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows one provider for three runs across roles, with unknown usage', () => {
    TestBed.configureTestingModule({ imports: [InspectorLimitsLanesComponent] });
    const fixture = TestBed.createComponent(InspectorLimitsLanesComponent);
    fixture.componentRef.setInput('limits', buildStatsLimitViewModel({
      sessionId: 's', sessionOwnerKey: null, sessionModelScope: null,
      owners: [], laneRuns: [run('a', 'frontend'), run('b', 'backend'), run('c', 'frontend')],
      now, time: { timeZone: 'UTC', zoneNameLocale: 'en-GB' },
    }));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="providers-count"]')?.textContent?.trim()).toBe('2 providers');
    expect(root.querySelectorAll('ptah-provider-lane-limit-tile')).toHaveLength(2);
    expect(root.querySelectorAll('section')).toHaveLength(1);
    expect(root.querySelector('select, button')).toBeNull();
    expect(root.textContent).toContain('Usage not tracked');
    expect(root.querySelector('ptah-lane-usage-tile')).toBeNull();
  });

  it('keeps Claude first in one section and aligns provider source lines', () => {
    const tile = (id: string, caption: string): PlanLimitTileModel => ({
      id, kind: 'window', label: 'Weekly', captionLead: caption, caption,
      value: '63% used', resetLine: 'resets in 1d', tone: 'neutral',
      sourceChips: ['Provider API'], detailLines: [], window: {
        windowKey: 'weekly', label: 'Weekly', state: 'ok', usedText: '63% used',
        percent: 63, resetFacts: [], sourceChips: ['Provider API'],
      },
    });
    const base = buildStatsLimitViewModel({
      sessionId: 's', sessionOwnerKey: null, sessionModelScope: null,
      owners: [], laneRuns: [], now, time: { timeZone: 'UTC', zoneNameLocale: 'en-GB' },
    });
    TestBed.configureTestingModule({ imports: [InspectorLimitsLanesComponent] });
    const fixture = TestBed.createComponent(InspectorLimitsLanesComponent);
    fixture.componentRef.setInput('limits', { ...base,
      sessionProviderLabel: 'Claude',
      planTiles: [tile('claude', 'Claude account · 227d')],
      providerLimits: [{ id: 'provider:codex', label: 'Codex CLI', ownerState: 'single',
        windows: [tile('codex', 'Codex account · 58b5')], message: '', ownerDetails: [] }],
    });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('section')).toHaveLength(1);
    expect(root.querySelector('[data-testid="providers-count"]')?.textContent).toContain('2 providers');
    const providers = [...root.querySelectorAll('ptah-provider-lane-limit-tile')];
    expect(providers).toHaveLength(2);
    expect(providers[0].textContent).toContain('Claude');
    expect(providers[1].textContent).toContain('Codex');
    expect(providers.map(row => row.querySelector('[data-ptah-badge]')?.textContent?.trim()))
      .toEqual(['Provider API', 'Provider API']);
  });

  // Regression: the session row was always labelled "Claude", also when the
  // session's owner was the Codex account of a Codex main provider.
  it('labels the session row with the provider of the session owner', () => {
    const render = (sessionOwnerKey: string | null) => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [InspectorLimitsLanesComponent] });
      const fixture = TestBed.createComponent(InspectorLimitsLanesComponent);
      fixture.componentRef.setInput('limits', buildStatsLimitViewModel({
        sessionId: 's', sessionOwnerKey, sessionModelScope: null,
        owners: [{
          owner: { key: 'codex-owner', providerId: 'openai-codex', identityKind: 'account', label: 'Codex account' },
          status: 'available', windowSetEstablished: true, ownerEvidence: [],
          windows: [{
            key: 'weekly', kind: 'weekly', label: 'Weekly', observedAt: now - 1000,
            used: { kind: 'percent', percent: 12 }, usedSource: 'provider-api',
            resetsAt: now + 86_400_000, resetSource: 'provider-api',
          }],
        }],
        laneRuns: [], now, time: { timeZone: 'UTC', zoneNameLocale: 'en-GB' },
      }));
      fixture.detectChanges();
      const row = (fixture.nativeElement as HTMLElement).querySelector('ptah-provider-lane-limit-tile');
      return row?.textContent ?? '';
    };
    const codex = render('codex-owner');
    expect(codex).toContain('Codex');
    expect(codex).toContain('12%');
    expect(codex).not.toContain('Claude');
    // An unresolved session names no provider.
    const unresolved = render(null);
    expect(unresolved).toContain('Session');
    expect(unresolved).not.toContain('Claude');
  });
});

describe('Plan Limits provider states', () => {
  const grok = { key: 'grok#account:abcd1234', providerId: 'grok', identityKind: 'account', label: 'Grok account' } as const;
  const kimi = { key: 'kimi-code#account:abcd2b78', providerId: 'kimi-code', identityKind: 'account', label: 'Kimi account' } as const;
  const agy = { key: 'antigravity#account:abcdc41e', providerId: 'antigravity', identityKind: 'account', label: 'Antigravity account' } as const;
  const hourly: PlanLimitWindow = {
    key: 'five_hour', kind: 'five_hour', label: '5-hour', observedAt: now - 1000,
    used: { kind: 'percent', percent: 0 }, usedSource: 'provider-api',
  };

  function render(snapshot: PlanLimitOwnerSnapshot, laneOwner: typeof snapshot.owner | null = snapshot.owner) {
    TestBed.configureTestingModule({ imports: [InspectorLimitsLanesComponent] });
    const fixture = TestBed.createComponent(InspectorLimitsLanesComponent);
    fixture.componentRef.setInput('limits', buildStatsLimitViewModel({
      sessionId: 's', sessionOwnerKey: snapshot.owner.key, sessionModelScope: null,
      owners: [snapshot], laneRuns: [{
        ...run('a', 'frontend'), cli: snapshot.owner.providerId,
        cliLabel: snapshot.owner.label, quotaOwner: laneOwner,
      }],
      now, time: { timeZone: 'UTC', zoneNameLocale: 'en-GB' }, refreshFailed: true,
    }));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('shows Kimi limit reached with exact 100% and a zero-width 0% track', () => {
    const root = render({
      owner: kimi, status: 'available', windowSetEstablished: true, source: 'provider-api',
      ownerEvidence: [], windows: [hourly, {
        ...hourly, key: 'monthly', kind: 'monthly', label: 'Monthly allowance', used: { kind: 'percent', percent: 100 },
        resetsAt: now + 600_000, resetSource: 'provider-api',
      }],
    });
    for (const provider of root.querySelectorAll('ptah-provider-lane-limit-tile')) {
      expect(provider.textContent).toContain('Limit reached');
      expect(provider.textContent).toContain('2b78');
      expect(provider.querySelector('[data-ptah-badge] [aria-hidden]')?.textContent).toBe('API');
      const meters = [...provider.querySelectorAll<HTMLElement>('[role="meter"]')];
      expect(meters.map(meter => meter.getAttribute('aria-valuenow'))).toEqual(['100', '0']);
      expect(meters[0].getAttribute('aria-valuetext')).toMatch(/100% used.*Limit reached.*2026-10-26 23:40 UTC/);
      expect(meters[1].querySelector<HTMLElement>('div')?.style.width).toBe('0%');
      expect(provider.querySelectorAll('[data-testid="plan-window-reset"]')[1].textContent).toBe('—');
    }
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Refresh failed');
  });

  it('shows the signed-out reason for owned Grok and no meter or invented percent', () => {
    const root = render({ owner: grok, status: 'no-usage-source', statusReason: 'cli-not-signed-in',
      windowSetEstablished: false, ownerEvidence: [], windows: [] });
    for (const provider of root.querySelectorAll('ptah-provider-lane-limit-tile')) {
      expect(provider.querySelector('[data-testid="provider-limit-message"]')?.textContent?.trim())
        .toBe('Sign in to the Grok CLI (run grok login)');
      expect(provider.textContent).not.toMatch(/No usage source|[0-9]+%/i);
      expect(provider.querySelector('ptah-meter')).toBeNull();
    }
  });

  it('keeps the generic no-source wording for an owned Grok without a reason and untracked for an unowned lane', () => {
    const root = render({ owner: grok, status: 'no-usage-source',
      windowSetEstablished: false, ownerEvidence: [], windows: [] }, null);
    const [session, lane] = root.querySelectorAll('ptah-provider-lane-limit-tile');
    expect(session.textContent).toContain('No usage source');
    expect(lane.textContent).toContain('Usage not tracked');
    expect(lane.textContent).not.toContain('No usage source');
    expect(root.querySelector('ptah-meter')).toBeNull();
  });

  it('keeps the reader-failure reason in a keyboard-reachable tooltip and shows no meter', () => {
    const root = render({ owner: grok, status: 'cli-unavailable', statusReason: 'cli-timeout', source: 'cli-command',
      windowSetEstablished: false, ownerEvidence: [], windows: [] });
    for (const provider of root.querySelectorAll('ptah-provider-lane-limit-tile')) {
      const notice = provider.querySelector<HTMLElement>('[data-testid="provider-limit-message"]');
      expect(notice?.textContent?.trim()).toBe('Grok CLI did not respond in time');
      expect(notice?.tabIndex).toBe(0);
      expect(provider.querySelector('[data-testid="plan-extra-tile"]')).toBeNull();
      notice?.focus();
      expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain('Grok CLI did not respond in time');
      notice?.blur();
      expect(provider.querySelector('ptah-meter')).toBeNull();
    }
  });

  it('keeps a reported group beside legacy windows and displays each full window label', () => {
    const legacy: PlanLimitWindow = { ...hourly, key: 'other:legacy', kind: 'other', label: 'Gemini models · 5-hour' };
    const gemini: PlanLimitWindow & { readonly group: string } = {
      ...hourly, key: 'other:gemini-5h', kind: 'other', label: '5h', group: ' Gemini models ',
    };
    const geminiWeekly = { ...gemini, key: 'other:gemini-weekly', label: 'Week' } as const;
    const others = { ...gemini, key: 'other:claude-5h', group: 'Claude and GPT models' } as const;
    const blank = { ...gemini, group: ' ' };
    const malformed = { ...gemini };
    Reflect.set(malformed, 'group', 42);
    const base = { owner: agy, status: 'available', windowSetEstablished: true, ownerEvidence: [], source: 'cli-command' } as const;
    for (const [windows, captions, stacked] of [
      [[gemini, geminiWeekly, others], ['Gemini models', 'Claude and GPT models'], false],
      [[legacy, hourly], [], true],
      [[legacy, others], ['Claude and GPT models'], true],
      [[blank, others], ['Claude and GPT models'], false],
      [[malformed, others], ['Claude and GPT models'], false],
    ] as const) {
      const session = render({ ...base, windows }).querySelector('ptah-provider-lane-limit-tile');
      expect([...session?.querySelectorAll('[data-testid="plan-window-group"]') ?? []].map(node => node.textContent)).toEqual(captions);
      const rows = [...session?.querySelectorAll('[data-testid="plan-window-row"]') ?? []];
      expect(rows).toHaveLength(windows.length);
      expect(rows.every(row => row.classList.contains('stacked-label') === stacked)).toBe(true);
      for (const window of windows) {
        const row = rows.find(node => node.getAttribute('data-tile-id')?.endsWith(`:${window.key}`));
        expect(row?.firstElementChild?.textContent).toBe(window.label);
        expect(row?.firstElementChild?.getAttribute('title')).toBe(window.label);
        expect(row?.getAttribute('aria-label')).toContain(window.label);
      }
      TestBed.resetTestingModule();
    }
  });

  it('gives the single unconfirmed-reading mark a hover and keyboard explanation', () => {
    const root = render({ owner: agy, status: 'available', windowSetEstablished: true, ownerEvidence: [],
      windows: [{ ...hourly, used: { kind: 'percent', percent: 3.4 } }] });
    const row = root.querySelector<HTMLElement>('[data-testid="plan-window-row"]');
    expect(row?.textContent?.match(/\?/g)).toHaveLength(1);
    expect(row?.querySelector('[title^="Not confirmed"]')?.textContent).toBe('?');
    expect(row?.getAttribute('aria-label')).toMatch(/Not confirmed.*freshness cannot be confirmed/);
    row?.focus();
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain('last reset unknown');
    row?.blur();
  });

  it('shows only the specific reason when there is no open session', () => {
    const root = render({ owner: kimi, status: 'service-unavailable', unavailableReason: 'no-open-session',
      windowSetEstablished: false, ownerEvidence: [], windows: [] });
    for (const provider of root.querySelectorAll('ptah-provider-lane-limit-tile')) {
      const notices = provider.querySelectorAll('[data-testid="provider-limit-message"]');
      expect(notices).toHaveLength(1);
      expect(notices[0].textContent?.trim()).toBe('no open session');
      expect(provider.textContent).not.toMatch(/Limits not tracked|Unavailable|Plan usage could not be read/);
      expect(provider.querySelector('ptah-meter')).toBeNull();
    }
  });

  it('shows an amount window on its reported scale in the dock', () => {
    const root = render({ owner: kimi, status: 'available', windowSetEstablished: true, ownerEvidence: [],
      windows: [{ ...hourly, used: { kind: 'amount', amount: 12, limit: 40, unit: 'requests' } }],
    });
    const row = root.querySelector('[data-testid="plan-window-row"]');
    const meter = row?.querySelector('[role="meter"]');
    expect(row?.textContent).toContain('12 of 40 requests');
    expect(meter?.getAttribute('aria-valuenow')).toBe('12');
    expect(meter?.getAttribute('aria-valuemax')).toBe('40');
    expect(meter?.getAttribute('aria-valuetext')).toContain('12 of 40 requests');
  });

  it('speaks the reason for a missing reset and shows a muted dash for unknown usage', () => {
    const root = render({ owner: kimi, status: 'available', windowSetEstablished: true, ownerEvidence: [],
      windows: [{ ...hourly, used: undefined }],
    });
    const row = root.querySelector('[data-testid="plan-window-row"]');
    expect(row?.querySelector('[data-testid="plan-window-reset"]')?.textContent).toBe('—');
    expect(row?.textContent?.match(/—/g)).toHaveLength(2);
    expect(row?.getAttribute('aria-label')).toMatch(/5-hour.*Usage unknown.*reset unknown/i);
    expect(row?.querySelector('ptah-meter')).toBeNull();
  });
});
