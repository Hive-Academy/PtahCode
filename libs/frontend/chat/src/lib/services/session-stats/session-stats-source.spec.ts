import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { buildStatsLimitViewModel, type LiveModelStats } from '@ptah-extension/chat-ui';
import { AgentMonitorStore, type MonitoredAgent } from '@ptah-extension/chat-streaming';
import type { TabState } from '@ptah-extension/chat-types';
import { AuthStateService, PlanLimitsStore } from '@ptah-extension/core';
import type {
  PlanLimitOwnerSnapshot,
  PlanLimitsSnapshot,
  SessionStatsEntry,
} from '@ptah-extension/shared';
import { ChatStore } from '../chat.store';
import {
  injectSessionStatsSource,
  toStatsLimitLaneRun,
  unresolvedSessionOwnerKey,
} from './session-stats-source';

/** A loaded auth state whose main provider is `providerId`. */
function authState(providerId: () => string | null) {
  return { isLoaded: signal(true), isLoading: signal(false), activeProviderId: providerId };
}

describe('injectSessionStatsSource cache projection', () => {
  const cache = { ttl: '1h' as const, lastRequestAt: 1_000, expiresAt: 3_601_000 };
  const tab = signal<TabState | null>(null);
  const sessionId = signal<string | null>('main');
  const available = signal(true);
  const mainSnapshot = signal<SessionStatsEntry | null>(null);

  beforeEach(() => {
    tab.set(null);
    sessionId.set('main');
    available.set(true);
    mainSnapshot.set(null);
    TestBed.configureTestingModule({ providers: [
      { provide: ChatStore, useValue: { sessionStats: mainSnapshot, liveModelStats: signal(null), compactionCount: signal(0) } },
      { provide: PlanLimitsStore, useValue: { snapshot: signal(null) } },
      { provide: AgentMonitorStore, useValue: { agentsOwnedBySession: () => [] } },
      { provide: AuthStateService, useValue: authState(signal<string | null>('anthropic')) },
    ] });
  });

  function source() {
    return TestBed.runInInjectionContext(() => injectSessionStatsSource({
      tab, sessionId, available, budget: () => null,
    }));
  }

  const liveContext = {
    model: 'claude-sonnet-4',
    contextUsed: 130_000,
    contextWindow: 200_000,
    contextPercent: 65,
    contextCapacity: {
      tokens: 200_000,
      source: 'sdk-native',
      providerId: null,
      model: 'claude-sonnet-4',
    },
  } satisfies LiveModelStats;

  it('projects 65% for 130,000 tokens in a trusted 200,000-token window (F2)', () => {
    const stats = source();
    tab.set({ liveModelStats: liveContext } as TabState);
    expect(stats.inputs()?.context).toMatchObject({
      known: true, percent: 65, label: '65%', usedTokens: 130_000,
    });
  });

  it('projects 13% for the sdk-native million-token window (F3)', () => {
    const stats = source();
    tab.set({ liveModelStats: {
      ...liveContext,
      contextWindow: 1_000_000,
      contextPercent: 13,
      contextCapacity: { ...liveContext.contextCapacity, tokens: 1_000_000 },
    } } as TabState);
    expect(stats.inputs()?.context).toMatchObject({
      known: true, percent: 13, label: '13%', usedTokens: 130_000,
    });
  });

  it('keeps 105% unclamped for 210,000 tokens in a 200,000-token window (F5)', () => {
    const stats = source();
    tab.set({ liveModelStats: {
      ...liveContext, contextUsed: 210_000, contextPercent: 105,
    } } as TabState);
    expect(stats.inputs()?.context).toMatchObject({
      known: true, percent: 105, label: '105%', usedTokens: 210_000,
    });
  });

  it.each([
    ['unknown capacity', { ...liveContext, contextWindow: 0, contextPercent: 0,
      contextCapacity: { ...liveContext.contextCapacity, tokens: null, source: 'unknown' as const } }],
    ['provider catalog without provider id', { ...liveContext,
      contextCapacity: { ...liveContext.contextCapacity, source: 'provider-catalog' as const } }],
    ['capacity for a different model', { ...liveContext,
      contextCapacity: { ...liveContext.contextCapacity, model: 'other-model' } }],
  ])('shows unavailable context for %s (F6)', (_case, live) => {
    const stats = source();
    tab.set({ liveModelStats: live } as TabState);
    expect(stats.inputs()?.context).toMatchObject({
      known: false, percent: null, label: '—', usedTokens: null,
    });
  });

  it('keeps a live owner cache on its selected tab and isolates a tab switch', () => {
    const stats = source();
    tab.set({ sessionStats: { cache } as SessionStatsEntry } as TabState);
    sessionId.set('selected');
    expect(stats.inputs()?.cache).toEqual(cache);
    expect(stats.inputs()?.sessionId).toBe('selected');
    tab.set({ sessionStats: null } as TabState);
    sessionId.set('other');
    expect(stats.inputs()?.cache).toBeNull();
    expect(stats.inputs()?.sessionId).toBe('other');
  });

  it('hides transcript-only or invalid cache while retaining the snapshot', () => {
    const stats = source();
    mainSnapshot.set({ tokenCount: 42 } as SessionStatsEntry);
    expect(stats.inputs()?.cache).toBeNull();
    mainSnapshot.set({ tokenCount: 42, cache: { ...cache, expiresAt: 'bad' } } as SessionStatsEntry);
    expect(stats.inputs()?.cache).toBeNull();
    expect(stats.inputs()?.snapshot?.tokenCount).toBe(42);
    available.set(false);
    expect(stats.inputs()).toBeNull();
  });
});

describe('injectSessionStatsSource plan limits across a session switch', () => {
  const sessionId = signal<string | null>('s1');
  const ownerA = {
    owner: { key: 'a', providerId: 'anthropic', identityKind: 'account', label: 'Claude account' },
    status: 'available', windowSetEstablished: true, ownerEvidence: [],
    windows: [{
      key: 'five_hour', kind: 'five_hour', label: '5-hour', observedAt: 1_000,
      used: { kind: 'percent', percent: 40 }, usedSource: 'provider-api',
      resetsAt: 9_000_000, resetSource: 'provider-api',
    }],
  } as PlanLimitOwnerSnapshot;
  const limitsSnapshot = signal<PlanLimitsSnapshot | null>(null);
  const owners = signal<Record<string, string | null>>({});
  const mainProvider = signal<string | null>('anthropic');
  const ownerCodex = {
    owner: { key: 'c', providerId: 'openai-codex', identityKind: 'account', label: 'Codex account' },
    status: 'available', windowSetEstablished: true, ownerEvidence: [],
    windows: [{
      key: 'weekly', kind: 'weekly', label: 'Weekly', observedAt: 1_000,
      used: { kind: 'percent', percent: 12 }, usedSource: 'provider-api',
      resetsAt: 9_000_000, resetSource: 'provider-api',
    }],
  } as PlanLimitOwnerSnapshot;

  beforeEach(() => {
    mainProvider.set('anthropic');
    sessionId.set('s1');
    limitsSnapshot.set({ generatedAt: 1_000, owners: [ownerA], sessionOwners: {} });
    owners.set({ s1: 'a' });
    TestBed.configureTestingModule({ providers: [
      { provide: ChatStore, useValue: { sessionStats: signal(null), liveModelStats: signal(null), compactionCount: signal(0) } },
      { provide: PlanLimitsStore, useValue: {
        snapshot: limitsSnapshot, now: signal(2_000), loadError: signal(false),
        sessionOwner: (id: string) => {
          const ownerKey = owners()[id];
          return ownerKey === undefined ? null : { ownerKey, modelScope: null };
        },
      } },
      { provide: AgentMonitorStore, useValue: { agentsOwnedBySession: () => [] } },
      { provide: AuthStateService, useValue: authState(mainProvider) },
    ] });
  });

  function planTileIds(stats: ReturnType<typeof injectSessionStatsSource>): string[] {
    return stats.inputs()?.limits?.planTiles.map((tile) => tile.id) ?? [];
  }

  it('keeps showing the account limits when the new session is not resolved yet', () => {
    const stats = TestBed.runInInjectionContext(() => injectSessionStatsSource({
      tab: () => null, sessionId, available: () => true, budget: () => null,
    }));
    expect(planTileIds(stats)).toEqual(['plan:a:five_hour']);

    sessionId.set('s2');
    owners.set({ s1: 'a', s2: null });
    expect(planTileIds(stats)).toEqual(['plan:a:five_hour']);

    // Once the host resolves s2 to another owner, that owner is shown.
    owners.set({ s1: 'a', s2: 'b' });
    expect(planTileIds(stats)).toEqual(['plan-status:b']);
  });

  it('does not borrow an owner the snapshot no longer lists', () => {
    const stats = TestBed.runInInjectionContext(() => injectSessionStatsSource({
      tab: () => null, sessionId, available: () => true, budget: () => null,
    }));
    expect(planTileIds(stats)).toEqual(['plan:a:five_hour']);
    sessionId.set('s2');
    limitsSnapshot.set({ generatedAt: 3_000, owners: [], sessionOwners: {} });
    expect(planTileIds(stats)).toEqual(['plan-status:none']);
  });

  // Regression: with Codex as the main provider, a view that last showed a
  // Claude session kept the Claude limits for the next (Codex) session.
  it('shows the main provider account, not the last shown Claude account, for an unresolved session', () => {
    mainProvider.set('openai-codex');
    limitsSnapshot.set({ generatedAt: 1_000, owners: [ownerA, ownerCodex], sessionOwners: {} });
    const stats = TestBed.runInInjectionContext(() => injectSessionStatsSource({
      tab: () => null, sessionId, available: () => true, budget: () => null,
    }));
    expect(planTileIds(stats)).toEqual(['plan:a:five_hour']);

    sessionId.set('s2');
    owners.set({ s1: 'a', s2: null });
    expect(planTileIds(stats)).toEqual(['plan:c:weekly']);
    expect(stats.inputs()?.limits?.sessionProviderLabel).toBe('Codex');
  });

  it('shows no account for an unresolved session when the main provider has no listed owner', () => {
    mainProvider.set('openai-codex');
    const stats = TestBed.runInInjectionContext(() => injectSessionStatsSource({
      tab: () => null, sessionId, available: () => true, budget: () => null,
    }));
    sessionId.set('s2');
    owners.set({ s1: 'a', s2: null });
    expect(planTileIds(stats)).toEqual(['plan-status:none']);
  });
});

describe('unresolvedSessionOwnerKey', () => {
  const owner = (key: string, providerId: string) =>
    ({ owner: { key, providerId, identityKind: 'account', label: providerId } }) as PlanLimitOwnerSnapshot;
  const listed = [owner('a', 'anthropic'), owner('c1', 'openai-codex'), owner('c2', 'openai-codex')];

  it('keeps the last shown owner only when it belongs to the main provider', () => {
    expect(unresolvedSessionOwnerKey('c2', listed, 'openai-codex')).toBe('c2');
    expect(unresolvedSessionOwnerKey('a', listed, 'openai-codex')).toBe('c1');
    expect(unresolvedSessionOwnerKey(null, listed, 'anthropic')).toBe('a');
    expect(unresolvedSessionOwnerKey('a', listed, 'kimi-code')).toBeNull();
  });

  it('keeps the last listed owner while the main provider is unknown', () => {
    expect(unresolvedSessionOwnerKey('a', listed, undefined)).toBe('a');
    expect(unresolvedSessionOwnerKey('a', listed, null)).toBe('a');
    expect(unresolvedSessionOwnerKey('gone', listed, null)).toBeNull();
    expect(unresolvedSessionOwnerKey(null, listed, undefined)).toBeNull();
  });
});

describe('lane usage mapping', () => {
  const agent = {
    agentId: 'restored', cli: 'codex', status: 'completed', restored: true,
    startedAt: 100, segments: [
      { type: 'info', content: '', usage: { inputTokens: 20, outputTokens: 7921, costUsd: 1.1586 } },
    ],
  } as MonitoredAgent;

  it('uses the lane card segment fallback, marks it partial, and leaves session totals separate', () => {
    const run = toStatsLimitLaneRun(agent);
    expect(run.usageTotals).toMatchObject({ inputTokens: 20, outputTokens: 7921, costUsd: 1.1586, partial: true });
    const model = buildStatsLimitViewModel({
      sessionId: 'owner', sessionOwnerKey: null, sessionModelScope: null,
      owners: [], laneRuns: [run], now: 200,
      time: { timeZone: 'UTC', zoneNameLocale: 'en' },
    });
    expect(model.subtotal?.tokensText).toContain('≥7.9k');
    expect(model.subtotal?.summary).toContain('≥$1.16');
  });

  it('prefers structured totals and never invents usage for an empty run', () => {
    const usageTotals = { inputTokens: 3, outputTokens: 5, costUsd: 0 };
    expect(toStatsLimitLaneRun({ ...agent, usageTotals }).usageTotals).toBe(usageTotals);
    expect(toStatsLimitLaneRun({ ...agent, segments: [] }).usageTotals).toBeNull();
  });

  it('carries the Ptah CLI agent id and name, and falls back only without a name (TASK_2026_905)', () => {
    const glm = { ...agent, cli: 'ptah-cli', ptahCliId: 'glm-id', displayName: 'Glm' } as MonitoredAgent;
    expect(toStatsLimitLaneRun(glm)).toMatchObject({ ptahCliId: 'glm-id', cliLabel: 'Glm' });
    expect(toStatsLimitLaneRun(glm)).not.toHaveProperty('cliLabelSource');
    expect(toStatsLimitLaneRun({ ...glm, displayName: undefined })).toMatchObject({
      cliLabel: 'Ptah CLI',
      cliLabelSource: 'product',
    });
    expect(toStatsLimitLaneRun({ ...agent, cli: 'codex', ptahCliId: 'x' } as MonitoredAgent)).not.toHaveProperty('ptahCliId');
  });
});
