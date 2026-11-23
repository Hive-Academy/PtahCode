import { Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  AgentMonitorStore,
  type BackgroundAgentEntry,
  type MonitoredAgent,
  type SubagentRecord,
} from '@ptah-extension/chat-streaming';
import type { SessionStatus } from '@ptah-extension/chat-types';
import { ModelStateService, WallClockService } from '@ptah-extension/core';
import type { SessionStatsEntry } from '@ptah-extension/shared';
import { buildSessionAgentRoster } from '../../../services/session-agents/session-agent-roster';
import { SessionAgentRosterService } from '../../../services/session-agents/session-agent-roster.service';
import { SessionAgentTrayService } from '../../../services/session-agents/session-agent-tray.service';
import { SessionInspectorStore } from '../../../services/session-inspector';
import { normalizeAgentKey } from './inspector-agent-list';
import { injectInspectorAgentRows } from './inspector-agent-rows';

const SDK: SessionStatsEntry = {
  sessionId: 'sdk',
  model: null,
  status: 'ok',
  totalCost: 0.1,
  tokens: { input: 80, output: 20, cacheRead: 0, cacheCreation: 0 },
  tokenCount: 100,
  messageCount: 1,
};

const CLI: MonitoredAgent = {
  agentId: 'lane',
  parentSessionId: 'sdk',
  cli: 'copilot',
  task: 'Inspect files',
  status: 'completed',
  startedAt: 100,
  completedAt: 200,
  stdout: '',
  stderr: '',
  expanded: false,
  segments: [],
  streamEvents: [],
  streamRevision: 0,
  permissionQueue: [],
  usageTotals: { inputTokens: 30, outputTokens: 20, costUsd: 0.2 },
};

@Component({ template: '' })
class RowsHost {
  readonly sessionId = signal<string | null>('sdk');
  readonly projection = injectInspectorAgentRows(signal('tab'), this.sessionId, signal([]));
}

function setup() {
  const sdk = signal<SessionStatsEntry | null>(SDK);
  const tabStatus = signal<SessionStatus>('resuming');
  const cli = signal<MonitoredAgent[]>([]);
  const subagents = signal<SubagentRecord[]>([]);
  const background = signal<BackgroundAgentEntry[]>([]);
  const roster = computed(() => buildSessionAgentRoster({
    sessionId: sdk()?.sessionId ?? null,
    tabStatus: tabStatus(),
    cliAgents: cli(),
    subagents: subagents(),
    backgroundAgents: background(),
    permissions: [],
    questions: [],
  }));
  const ready = signal(true);
  const model = computed(() => ({
    agents: {
      data: ready()
        ? { rows: roster().slice(1).map((agent) => ({ agent, requests: [] })) }
        : null,
    },
    orchestrator: { model: null, durationMs: null },
    needsYouCount: 0,
  }));
  TestBed.configureTestingModule({
    imports: [RowsHost],
    providers: [
      { provide: AgentMonitorStore, useValue: {
        agents: cli,
        agentsOwnedBySession: (id: string) => cli().filter((lane) => lane.parentSessionId === id),
        subagents: () => new Map(subagents().map((lane) => [lane.parentToolUseId, lane])),
      } },
      { provide: TabManagerService, useValue: {
        backgroundTabsRevision: () => 0,
        findTabByIdAcrossWorkspaces: () => ({
          tab: { status: tabStatus(), hasLiveSession: false, sessionStats: sdk() },
        }),
      } },
      { provide: SessionInspectorStore, useValue: { modelFor: () => model } },
      { provide: SessionAgentRosterService, useValue: { roster } },
      { provide: SessionAgentTrayService, useValue: { extrasFor: () => new Map() } },
      { provide: ModelStateService, useValue: { availableModels: () => [] } },
      { provide: WallClockService, useValue: { now: () => signal(500), acquire: () => () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(RowsHost);
  const host = fixture.componentInstance;
  return { host, fixture, sdk, tabStatus, cli, subagents, background, ready, ...host.projection };
}

describe('inspector agent rows', () => {
  it('leaves history with a bound SDK session and no CLI lanes unmarked', () => {
    const { totals, cliCoverage } = setup();
    expect(cliCoverage()).toEqual({
      tokens: { complete: true, causes: [] },
      cost: { complete: true, causes: [] },
    });
    expect(totals().tokens).toMatchObject({ value: 100, state: 'exact' });
    expect(totals().cost).toMatchObject({ value: 0.1, state: 'exact' });
  });

  it('leaves a restored lane with an ordinary split and reported cost exact', () => {
    const { cli, totals, rows, cliCoverage } = setup();
    cli.set([{
      ...CLI,
      restored: true,
      usageTotals: null,
      segments: [{
        type: 'info',
        content: 'Usage',
        usage: { inputTokens: 30, outputTokens: 20, costUsd: 0.2 },
      }],
    }]);
    expect(totals().tokens).toMatchObject({ value: 150, state: 'exact' });
    expect(totals().cost).toMatchObject({ value: 0.3, state: 'exact' });
    expect(rows()?.[1]).toMatchObject({ tokens: '50', cost: '$0.20' });
    expect(cliCoverage().cost.complete).toBe(true);
  });

  it.each([
    ['tokens', { costUsd: 0.2 }, 'cost'],
    ['cost', { inputTokens: 30, outputTokens: 20 }, 'tokens'],
  ] as const)('clears the %s gap as soon as the restored lane reports usable data', (metric, usageTotals, other) => {
    const { cli, totals, cliCoverage } = setup();
    cli.set([{ ...CLI, restored: true, usageTotals }]);
    expect(totals()[metric].state).toBe('lower-bound');
    expect(totals()[other].state).toBe('exact');
    expect(cliCoverage()[metric].causes.join()).toContain('restored lane is missing');
    expect(cliCoverage()[other].complete).toBe(true);

    cli.set([{ ...CLI, restored: true }]);
    expect(totals()[metric].state).toBe('exact');
    expect(cliCoverage()[metric]).toEqual({ complete: true, causes: [] });
  });

  it('leaves a fresh tab unmarked and excludes unowned and other-session lanes', () => {
    const { cli, sdk, tabStatus, host, totals, cliCoverage, rows } = setup();
    sdk.set(null);
    tabStatus.set('loaded');
    host.sessionId.set(null);
    cli.set([
      { ...CLI, parentSessionId: undefined },
      { ...CLI, agentId: 'another', parentSessionId: 'other' },
    ]);

    expect(totals().tokens.state).toBe('unknown');
    expect(totals().cost.state).toBe('unknown');
    expect(cliCoverage().tokens.complete).toBe(true);
    expect(cliCoverage().cost.complete).toBe(true);
    expect(rows()?.map(({ key }) => key)).toEqual(['orchestrator']);

    sdk.set(SDK);
    host.sessionId.set('sdk');
    expect(totals().tokens).toMatchObject({ value: 100, state: 'exact' });
    expect(totals().cost).toMatchObject({ value: 0.1, state: 'exact' });
  });

  const keeper = { ...CLI, agentId: 'keeper', status: 'running' } as const;
  it.each([
    ['eviction', [keeper]],
    ['removeAgent', [keeper]],
    ['clearCompleted', [keeper]],
    ['force clear', []],
  ] as const)('retains exact usage after the monitor loses the lane through %s', (_action, remaining) => {
    const { cli, totals, contributions, fixture } = setup();
    cli.set([CLI, keeper]);
    fixture.detectChanges();
    cli.set([...remaining]);
    expect(totals().tokens).toMatchObject({ value: 200, state: 'exact' });
    expect(totals().cost).toMatchObject({ value: 0.5, state: 'exact' });
    expect(contributions().filter(({ source }) => source === 'cli')).toHaveLength(2);
  });

  it('keeps a reported lower bound when the lane disappears', () => {
    const { cli, totals } = setup();
    cli.set([{ ...CLI, usageTotals: { inputTokens: 30, costUsd: 0.2 } }]);
    const before = totals();
    expect(before.tokens).toMatchObject({ value: 130, state: 'lower-bound' });
    cli.set([]);
    expect(totals()).toEqual(before);
  });

  it.each([
    [{ inputTokens: 30, outputTokens: 20 }, 'exact', 150],
    [null, 'lower-bound', 100],
  ] as const)('marks each removed lane metric without a retained value (%p)', (usageTotals, state, value) => {
    const { cli, totals, cliCoverage } = setup();
    cli.set([{ ...CLI, usageTotals }]);
    totals();
    cli.set([]);

    expect(totals().tokens).toMatchObject({ value, state });
    expect(totals().cost).toMatchObject({ value: 0.1, state: 'lower-bound' });
    expect(cliCoverage().cost.causes.join()).toContain('removed lane has no retained cost');
  });

  it('drops a lane still present under a different parent', () => {
    const { cli, totals, contributions } = setup();
    cli.set([CLI]);
    expect(totals().tokens.value).toBe(150);
    cli.set([{ ...CLI, parentSessionId: 'other' }]);
    expect(totals().tokens).toMatchObject({ value: 100, state: 'exact' });
    expect(contributions()).toHaveLength(1);
  });

  it('resets retention across a session change and a same-session remount', () => {
    const { sdk, cli, host, fixture, totals } = setup();
    cli.set([CLI]);
    expect(totals().tokens.value).toBe(150);
    cli.set([]);
    expect(totals().tokens.value).toBe(150);
    sdk.set({ ...SDK, sessionId: 'other' });
    host.sessionId.set('other');
    expect(totals().tokens.value).toBe(100);
    sdk.set(SDK);
    host.sessionId.set('sdk');
    expect(totals().tokens.value).toBe(100);

    cli.set([CLI]);
    expect(totals().tokens.value).toBe(150);
    cli.set([]);
    expect(totals().tokens.value).toBe(150);
    fixture.destroy();

    const remount = TestBed.createComponent(RowsHost).componentInstance;
    expect(remount.projection.totals().tokens).toMatchObject({ value: 100, state: 'exact' });
  });

  it('deduplicates a background alias in the roster and subtracts the SDK lane once', () => {
    const { subagents, background, cli, rows, orchestratorUsage, totals } = setup();
    const child: SubagentRecord = {
      parentToolUseId: 'tool',
      parentSessionId: 'sdk',
      status: 'completed',
      totalTokens: 30,
    };
    subagents.set([child]);
    background.set([{
      toolCallId: 'tool',
      agentId: 'tool' as BackgroundAgentEntry['agentId'],
      hasRealAgentId: false,
      agentType: 'reviewer',
      sessionId: 'sdk' as BackgroundAgentEntry['sessionId'],
      startedAt: 200,
      status: 'completed',
    }]);
    cli.set([CLI]);
    const keys = rows()?.map(({ key }) => key) ?? [];
    expect(keys).toEqual(['orchestrator', 'sub:tool', 'cli:lane']);
    expect(normalizeAgentKey('bg:tool', keys)).toBe('sub:tool');
    expect(orchestratorUsage().tokens).toMatchObject({ value: 70, estimated: true, lowerBound: false });
    expect(rows()?.[0]).toMatchObject({ tokens: '~70', cost: '—', time: '--:--' });
    expect(totals().tokens.value).toBe(150);

    subagents.set([{ ...child, status: 'background' }]);
    expect(rows()?.map(({ key }) => key)).toEqual(['orchestrator', 'bg:tool', 'cli:lane']);
    expect(orchestratorUsage().tokens.value).toBe(70);
  });

  it('mutes an excessive residual and an absent or errored SDK snapshot', () => {
    const { sdk, subagents, rows } = setup();
    subagents.set([{
      parentToolUseId: 'overflow',
      parentSessionId: 'sdk',
      status: 'completed',
      totalTokens: 101,
    }]);
    expect(rows()?.[0].tokens).toBe('—');
    sdk.set({ ...SDK, status: 'error' });
    expect(rows()?.[0]).toMatchObject({ tokens: '—', cost: '—' });
    sdk.set(null);
    expect(rows()?.[0]).toMatchObject({ tokens: '—', cost: '—' });
  });

  it('reports loading while the agent roster has no data', () => {
    const { ready, rows, captionCounts } = setup();
    ready.set(false);
    expect(rows()).toBeNull();
    expect(captionCounts().running).toBeNull();
  });
});
