import {
  PTAH_CLOCK,
  PtahBadgeDirective,
  PtahIconButtonDirective,
  PtahSkeletonComponent,
  PtahStatusComponent,
} from '@ptah-extension/ui';
import { NgTemplateOutlet } from '@angular/common';
import { encapsulateStyle } from '@angular/compiler';
import { Component, NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgentMonitorStore, type MonitoredAgent } from '@ptah-extension/chat-streaming';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  InspectorLinkedSessionsComponent,
  InspectorSessionStatsComponent,
  InspectorLimitsLanesComponent,
  type SessionStatsInputs,
} from '@ptah-extension/chat-ui';
import { ClaudeRpcService, ModelStateService, RpcResult, WallClockService } from '@ptah-extension/core';
import type { SessionHandoffChainResult, SessionStatsEntry } from '@ptah-extension/shared';
import {
  HandoffChainClient,
  SessionInspectorStore,
  type InspectorRequest,
  type SessionInspectorModel,
} from '../../../services/session-inspector';
import { SessionRowActionsService } from '../../../services/session-list/session-row-actions.service';
import { By } from '@angular/platform-browser';
import { buildSessionAgentRoster } from '../../../services/session-agents/session-agent-roster';
import { SessionAgentRosterService } from '../../../services/session-agents/session-agent-roster.service';
import { SessionAgentTrayService } from '../../../services/session-agents/session-agent-tray.service';
import { InspectorAgentsSectionComponent } from './inspector-agents-section.component';
import { InspectorRequestLinesComponent } from './inspector-request-panel.component';
import { SessionInspectorComponent } from './session-inspector.component';

const emptyStats: SessionStatsInputs = {
  sessionId: null,
  snapshot: null,
  liveModelStats: null,
  compactionCount: 0,
  limits: null,
  budget: null,
  context: {
    hasLive: false,
    known: false,
    percent: null,
    label: '—',
    usedTokens: null,
  },
  limitSummary: {
    state: 'none',
    text: null,
    extra: 0,
    source: null,
    fullText: null,
  },
};
const emptyModel: SessionInspectorModel = {
  tabId: 'one',
  sessionId: null,
  orchestrator: {
    model: null,
    state: { kind: 'idle' },
    contextPercent: null,
    contextWindow: null,
    tokens: null,
    cost: null,
    turns: null,
    requests: [],
  },
  agents: { status: 'unknown', data: null },
  requests: [],
  needsYouCount: 0,
};

@Component({
  standalone: true,
  imports: [SessionInspectorComponent],
  template: `<ptah-session-inspector
    tabId="one"
    presentation="embedded"
    [sessionTitle]="title"
    sessionStatus="running"
  />`,
})
class ControlsHost {
  title = '';
}

describe('SessionInspectorComponent motion styles', () => {
  const source = readFileSync(join(__dirname, 'session-inspector.component.ts'), 'utf8');
  const css = source.match(/styles: `([\s\S]*?)`,\r?\n\}\)/)?.[1] ?? '';

  it('uses shared preset keyframes for the stats switch', () => {
    expect(css).toContain('animation: ptahMotionEnter var(--ptah-motion-switch)');
    expect(css).toContain('animation: ptahMotionLeave var(--ptah-motion-out)');
    expect(css).not.toMatch(/inspectorStats(Rise|Leave|FadeIn|FadeOut)/);
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('scopes transform-only glass entrance and cut exit to the root ancestor', () => {
    const compiled = encapsulateStyle(css, 'test');
    expect(compiled).toMatch(/\[data-glass='on'\]\s+\[_nghost-test\]\s+\.inspector-stats-enter/);
    expect(compiled).toMatch(/\[data-glass='on'\]\s+\[_nghost-test\]\s+\.inspector-stats-leave/);
    expect(compiled).toMatch(/\[data-glass='on'\]\[data-motion-style='fade'\]\s+\[_nghost-test\]\s+\.inspector-stats-enter/);
    expect(compiled).toMatch(/\[data-glass='on'\]\[data-motion-style='scale'\]\s+\[_nghost-test\]\s+\.inspector-stats-enter/);
    expect(css).toContain('animation-name: ptahMotionEnterGlass');
    expect(css).toMatch(/\.inspector-stats-leave\s*\{\s*animation: none;\s*display: none;/);
  });
});

const emptyRoster = buildSessionAgentRoster({
  sessionId: 'one',
  tabStatus: 'idle',
  cliAgents: [],
  subagents: [],
  backgroundAgents: [],
  permissions: [],
  questions: [],
});
const readyAgents: SessionInspectorModel['agents'] = {
  status: 'ready',
  data: { rows: [], active: 0, finished: 0 },
};

function projectionProviders(cli = signal<readonly MonitoredAgent[]>([])) {
  return [
    { provide: AgentMonitorStore, useValue: {
      agents: cli,
      agentsOwnedBySession: (id: string) => cli().filter((lane) => lane.parentSessionId === id),
      subagents: () => new Map(),
    } },
    { provide: SessionAgentRosterService, useValue: { roster: () => emptyRoster } },
    { provide: SessionAgentTrayService, useValue: { extrasFor: () => new Map() } },
    { provide: ModelStateService, useValue: { availableModels: () => [] } },
    { provide: WallClockService, useValue: { now: () => signal(0), acquire: () => () => undefined } },
    { provide: PTAH_CLOCK, useValue: { now: signal(0), acquire: () => () => undefined } },
  ];
}

describe('SessionInspectorComponent presentation', () => {
  const model = signal(emptyModel);
  const cli = signal<readonly MonitoredAgent[]>([]);
  const tabSnapshot = signal<SessionStatsEntry | null>(null);
  beforeEach(() => {
    model.set(emptyModel);
    cli.set([]);
    tabSnapshot.set(null);
    TestBed.configureTestingModule({
      imports: [SessionInspectorComponent],
      providers: [
        { provide: SessionInspectorStore, useValue: {
          modelFor: () => model,
          answerMissed: () => false,
          clearAnswerMiss: jest.fn(),
        } },
        ...projectionProviders(cli),
        {
          provide: TabManagerService,
          useValue: {
            backgroundTabsRevision: () => 0,
            findTabByIdAcrossWorkspaces: () => ({ tab: { sessionStats: tabSnapshot() } }),
          },
        },
        { provide: ClaudeRpcService, useValue: { call: jest.fn() } },
        { provide: SessionRowActionsService, useValue: { openSession: jest.fn() } },
      ],
    }).overrideComponent(SessionInspectorComponent, {
      set: {
        imports: [
          NgTemplateOutlet, PtahIconButtonDirective, InspectorSessionStatsComponent,
          InspectorAgentsSectionComponent, InspectorRequestLinesComponent, InspectorLimitsLanesComponent,
          PtahBadgeDirective, PtahSkeletonComponent, PtahStatusComponent,
        ],
        schemas: [NO_ERRORS_SCHEMA],
      },
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  function create(stats: SessionStatsInputs | null = emptyStats) {
    tabSnapshot.set(stats?.snapshot ?? null);
    const fixture = TestBed.createComponent(SessionInspectorComponent);
    fixture.componentRef.setInput('tabId', 'one');
    fixture.componentRef.setInput('presentation', 'rail');
    fixture.componentRef.setInput('stats', stats);
    fixture.detectChanges();
    return fixture;
  }

  it('uses the shared skeleton in the rail while session stats are unavailable', () => {
    const root = create(null).nativeElement as HTMLElement;
    const skeleton = root.querySelector('aside ptah-skeleton');
    expect(skeleton?.querySelector('[aria-hidden="true"]')?.children).toHaveLength(2);
  });

  it('passes uncached input tokens to the Orchestrator and preserves missing data', () => {
    TestBed.overrideComponent(SessionInspectorComponent, {
      set: { template: '<span data-testid="input">{{ sessionTokens()?.input ?? "—" }}</span>' },
    });
    const snapshot: NonNullable<SessionStatsInputs['snapshot']> = {
      sessionId: 'one',
      model: 'test-model',
      totalCost: 0,
      knownCost: 0,
      tokenCount: 650,
      tokens: { input: 100, output: 50, cacheRead: 200, cacheCreation: 300 },
      messageCount: 0,
      agentSessionCount: 0,
      status: 'ok',
      pricingCoverage: 'full',
      scope: 'session',
      revision: 1,
    };
    const fixture = create({ ...emptyStats, sessionId: 'one', snapshot });
    const input = () => (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="input"]',
    )?.textContent?.trim();
    expect(input()).toBe('100');
    // A snapshot of the previous session must not supply the split after a session switch.
    fixture.componentRef.setInput('stats', { ...emptyStats, sessionId: 'two', snapshot });
    fixture.detectChanges();
    expect(input()).toBe('—');
    fixture.componentRef.setInput('stats', emptyStats);
    fixture.detectChanges();
    expect(input()).toBe('—');
  });

  it('hides Orchestrator cache, context and compactions of another session after a switch', () => {
    TestBed.overrideComponent(SessionInspectorComponent, {
      set: { template: '<span data-testid="orch">{{ rosterStats()?.compactionCount ?? "—" }}'
        + '|{{ rosterStats()?.cache?.ttl ?? "—" }}|{{ rosterStats()?.context?.usedTokens ?? "—" }}</span>' },
    });
    model.set({ ...emptyModel, sessionId: 'one' });
    const stats: SessionStatsInputs = {
      ...emptyStats, sessionId: 'one', compactionCount: 2,
      cache: { ttl: '5m', lastRequestAt: 0, expiresAt: 300_000 },
      context: { usedTokens: 1_000 } as SessionStatsInputs['context'],
    };
    const fixture = create(stats);
    const text = () => (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="orch"]')?.textContent?.trim();
    expect(text()).toBe('2|5m|1000');
    fixture.componentRef.setInput('stats', { ...stats, sessionId: 'two' });
    fixture.detectChanges();
    expect(text()).toBe('—|—|—');
  });

  it('renders only expand when no session stats are available', () => {
    model.set({ ...emptyModel, needsYouCount: 2 });
    const fixture = create(null);
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll('button')).toHaveLength(1);
    expect(element.querySelector('[data-inspector-expand]')).not.toBeNull();
    expect(element.textContent).not.toContain('Run');
    expect(element.textContent).not.toContain('Ctx');
  });

  it.each(['near', 'at'] as const)(
    'shows the %s limit warning on expand and context with the full accessible description',
    (state) => {
      const fixture = create();
      const fullText = 'Codex plan limit warning (+2 more)';
      fixture.componentRef.setInput('limitSummary', {
        state,
        text: 'Codex plan limit warning',
        extra: 2,
        source: 'lane',
        fullText,
      });
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      const buttons = element.querySelectorAll('button');
      for (const button of [buttons[0], buttons[1]]) {
        expect(button.getAttribute('aria-label')).toContain(fullText);
        expect(button.getAttribute('title')).toContain(fullText);
        const warning = button.querySelector('[aria-hidden="true"]');
        expect(warning?.textContent?.trim()).toBe('!');
        expect(
          warning?.classList.contains(
            state === 'at' ? 'text-state-err' : 'text-state-need',
          ),
        ).toBe(true);
      }
      expect(buttons[2].getAttribute('aria-label')).not.toContain(fullText);
      fixture.componentRef.setInput('limitSummary', emptyStats.limitSummary);
      fixture.detectChanges();
      expect(element.querySelector('[aria-hidden="true"]')).toBeNull();
      expect(buttons[0].getAttribute('aria-label')).toBe(
        'Expand session details',
      );
      expect(buttons[1].getAttribute('aria-label')).toBe('Context unavailable');
    },
  );

  it('uses the stats limit summary when the host supplies no separate summary', () => {
    const fixture = create({
      ...emptyStats,
      limitSummary: {
        state: 'at',
        text: 'At limit',
        extra: 0,
        source: 'session',
        fullText: 'At limit',
      },
    });
    const element: HTMLElement = fixture.nativeElement;
    expect(
      element
        .querySelector('[data-inspector-expand]')
        ?.getAttribute('aria-label'),
    ).toBe('Expand session details; At limit');
    expect(element.querySelectorAll('.text-state-err')).toHaveLength(2);
  });

  it('renders unknown usage and context as labelled muted dashes and unknown Time as --:--', () => {
    const fixture = create();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('aside')?.classList.contains('w-14')).toBe(true);
    const context = root.querySelector('[data-rail-control="context"]');
    expect(context?.getAttribute('aria-label')).toBe('Context unavailable');
    expect(context?.querySelector('.text-base-content-muted:last-child')?.textContent?.trim()).toBe('—');

    fixture.componentRef.setInput('presentation', 'docked');
    fixture.detectChanges();
    for (const field of ['Tokens', 'Cost']) {
      const tile = root.querySelector(`[data-testid="session-${field.toLowerCase()}"]`);
      expect(tile?.getAttribute('aria-label')).toContain(`${field} unavailable`);
      expect(tile?.querySelector('.tabular-nums.text-base-content-muted')?.textContent).toContain('—');
    }
    const time = root.querySelector('[data-testid="session-time"]');
    expect(time?.getAttribute('aria-label')).toContain('Duration not recorded');
    expect(time?.querySelector('time.text-base-content-muted')?.textContent).toContain('--:--');
    expect(root.textContent).not.toContain('Todo');
  });

  it('emits expansion targets and exposes the ready attention count', () => {
    model.set({ ...emptyModel, needsYouCount: 2, agents: readyAgents });
    const fixture = create();
    const requests: (string | undefined)[] = [];
    fixture.componentInstance.expandRequested.subscribe((value) => requests.push(value));
    const root: HTMLElement = fixture.nativeElement;
    root.querySelector<HTMLButtonElement>('[data-inspector-expand]')?.click();
    for (const key of ['tokens', 'cost', 'time', 'context', 'attention']) {
      root.querySelector<HTMLButtonElement>(`[data-rail-control="${key}"]`)?.click();
    }
    expect(requests).toEqual([undefined, 'session', 'session', 'session', 'orchestrator', 'attention']);
    const attention = root.querySelector('[data-rail-control="attention"]');
    expect(attention?.getAttribute('aria-label')).toBe('Running agents: 0; 2 need you');
    expect(attention?.textContent).toContain('2!');
  });

  const sdkSnapshot: SessionStatsEntry = {
    sessionId: 'session-a',
    model: null,
    status: 'ok',
    totalCost: 0.1,
    tokens: { input: 80, output: 20, cacheRead: 0, cacheCreation: 0 },
    tokenCount: 100,
    messageCount: 1,
  };
  const lane: MonitoredAgent = {
    agentId: 'lane',
    parentSessionId: 'session-a',
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

  it.each(['sdk', 'cli'] as const)('shares measured whole-session totals across rail and SESSION when %s arrives first', (first) => {
    const stats = { ...emptyStats, sessionId: 'session-a', snapshot: sdkSnapshot };
    if (first === 'cli') cli.set([lane]);
    const fixture = create(first === 'cli' ? { ...stats, snapshot: null } : stats);
    const root: HTMLElement = fixture.nativeElement;
    const railFigure = (key: string) =>
      root.querySelector(`[data-rail-control="${key}"] span:last-child`)?.textContent?.trim();
    expect(railFigure('tokens')).toBe(first === 'sdk' ? '100' : '—');
    cli.set([lane]);
    tabSnapshot.set(sdkSnapshot);
    fixture.componentRef.setInput('stats', stats);
    fixture.detectChanges();
    expect(railFigure('tokens')).toBe('150');
    expect(railFigure('cost')).toBe('$0.30');

    fixture.componentRef.setInput('presentation', 'sheet');
    fixture.detectChanges();
    const dialog = root.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog?.querySelector('[data-testid="session-tokens"]')?.getAttribute('aria-label')).toContain('150 tokens');
    expect(dialog?.querySelector('[data-testid="session-cost"]')?.getAttribute('aria-label')).toContain('$0.3');
  });

  it('waits for matching SDK usage after a session switch in the same tab', () => {
    const stale = { ...sdkSnapshot, tokenCount: 120_000 };
    const first = { ...emptyStats, sessionId: 'session-a', snapshot: stale };
    const second = { ...first, sessionId: 'session-b' };
    const fixture = create(first);
    const root: HTMLElement = fixture.nativeElement;
    const tokenControl = () => root.querySelector('[data-rail-control="tokens"]');
    const tokens = () => tokenControl()?.querySelector('span:last-child')?.textContent?.trim();
    expect(tokens()).toBe('120.0k');

    cli.set([{
      ...lane,
      parentSessionId: 'session-b',
      usageTotals: { inputTokens: 4_000, outputTokens: 1_000, costUsd: 0.2 },
    }]);
    fixture.componentRef.setInput('stats', second);
    fixture.detectChanges();
    expect(tokens()).toBe('—');
    expect(tokenControl()?.getAttribute('aria-label')).toContain('SDK usage not loaded yet');

    const current = { ...sdkSnapshot, sessionId: 'session-b', tokenCount: 7_000 };
    tabSnapshot.set(current);
    fixture.componentRef.setInput('stats', { ...second, snapshot: current });
    fixture.detectChanges();
    expect(tokens()).toBe('12.0k');
  });

  it('marks a detected CLI cost gap while leaving reported tokens exact', () => {
    cli.set([{ ...lane, restored: true, usageTotals: { inputTokens: 30, outputTokens: 20 } }]);
    const fixture = create({ ...emptyStats, sessionId: 'session-a', snapshot: sdkSnapshot });
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[data-rail-control="tokens"] span:last-child')?.textContent?.trim()).toBe('150');
    expect(root.querySelector('[data-rail-control="cost"] span:last-child')?.textContent?.trim()).toBe('≥$0.10');
  });

  it('focuses only the active SESSION heading during a switch and freezes totals in both directions', async () => {
    const first = { ...emptyStats, sessionId: 'session-a', snapshot: sdkSnapshot };
    const second = {
      ...emptyStats, sessionId: 'session-b',
      snapshot: { ...sdkSnapshot, sessionId: 'session-b', tokenCount: 200 },
    };
    const fixture = create(first);
    const root: HTMLElement = fixture.nativeElement;
    document.body.appendChild(root);
    try {
      cli.set([lane]);
      fixture.componentRef.setInput('presentation', 'sheet');
      fixture.detectChanges();
      tabSnapshot.set(second.snapshot);
      fixture.componentRef.setInput('stats', second);
      fixture.componentRef.setInput('focusSection', 'session');
      fixture.detectChanges();
      const leavingFigure = () => root.querySelector('.inspector-stats-leave [data-testid="session-tokens"]')?.getAttribute('aria-label');
      expect(leavingFigure()).toContain('150 tokens');
      expect(root.querySelector('.inspector-stats-leave')?.hasAttribute('inert')).toBe(true);
      const activeHeading = root.querySelector('[data-active-session-stats] h3');
      expect(document.activeElement).toBe(activeHeading);
      root.querySelector<HTMLElement>('[data-inspector-close]')?.focus();
      await Promise.resolve();
      expect(document.activeElement).toBe(activeHeading);
      tabSnapshot.set(first.snapshot);
      fixture.componentRef.setInput('stats', first);
      fixture.detectChanges();
      expect(leavingFigure()).toContain('200 tokens');
      expect(root.querySelector('p[aria-live="polite"]')?.textContent?.trim()).toBe('Session changed.');
    } finally {
      root.remove();
    }
  });

  it('routes the plan-limit cue to the PLAN LIMITS heading and keeps section order', () => {
    const fixture = create({
      ...emptyStats,
      limits: {
        planTiles: [], laneTiles: [], inspectorRuns: [], providerLimits: [],
        lanesCount: 0, refreshNotice: 'Showing last observed limits',
      },
      limitSummary: { state: 'near', source: 'session', text: 'Near limit', extra: 0, fullText: 'Near plan limit' },
    });
    const root: HTMLElement = fixture.nativeElement;
    document.body.appendChild(root);
    try {
      const expand = jest.fn();
      fixture.componentInstance.expandRequested.subscribe(expand);
      root.querySelector<HTMLButtonElement>('[data-rail-control="limits"]')?.click();
      expect(expand).toHaveBeenCalledWith('limits');
      fixture.componentRef.setInput('focusSection', 'limits');
      fixture.componentRef.setInput('presentation', 'sheet');
      fixture.detectChanges();
      const sections = Array.from(root.querySelectorAll('h3')).map((heading) => heading.textContent?.trim());
      expect(sections).toEqual(['Session', 'AGENTS', 'PLAN LIMITS']);
      expect(document.activeElement).toBe(root.querySelector('[data-inspector-section="limits"] h3'));
    } finally {
      root.remove();
    }
  });

  it('preserves the Answer emit and selects and focuses the asking row request', async () => {
    const question: InspectorRequest = {
      requestId: 'question-1',
      kind: 'question',
      source: 'session',
      ownerKey: 'orchestrator',
      ownerName: 'Orchestrator',
      agentId: null,
      toolName: null,
      command: 'Which branch?',
      questionPreview: 'Which branch?',
      timestamp: 1,
    };
    model.set({
      ...emptyModel,
      sessionId: 'one',
      agents: readyAgents,
      requests: [question],
      needsYouCount: 1,
      orchestrator: { ...emptyModel.orchestrator, requests: [question] },
    });
    const fixture = create();
    const root: HTMLElement = fixture.nativeElement;
    document.body.appendChild(root);
    try {
      fixture.componentRef.setInput('presentation', 'docked');
      fixture.componentRef.setInput('selectedAgentKey', null);
      fixture.componentRef.setInput('focusSection', 'attention');
      const answered = jest.fn();
      const selected = jest.fn();
      fixture.componentInstance.answerRequested.subscribe(answered);
      fixture.componentInstance.agentSelected.subscribe(selected);
      fixture.detectChanges();
      expect(document.activeElement).toBe(root.querySelector('[data-agent-key="orchestrator"]'));
      const headerLines = fixture.debugElement.query(By.directive(InspectorRequestLinesComponent));
      const headerAnswer = (headerLines.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-request-button]');
      expect(headerAnswer?.textContent?.trim()).toBe('Answer');
      headerAnswer?.click();
      fixture.detectChanges();
      await fixture.whenStable();

      const row = root.querySelector('[data-agent-key="orchestrator"]')?.closest('li');
      expect(row?.getAttribute('aria-current')).toBe('true');
      expect(document.activeElement).toBe(row?.querySelector('[data-request-button]'));
      expect(answered).toHaveBeenCalledTimes(1);
      expect(answered).toHaveBeenCalledWith('question-1');
      expect(selected).toHaveBeenCalledWith('orchestrator');
      headerLines.injector.get(InspectorRequestLinesComponent).focusReleased.emit();
      expect(document.activeElement).toBe(root.querySelector('[data-inspector-close]'));
    } finally {
      root.remove();
    }
  });

  it('focuses the requested section on expansion and the expand control on collapse', () => {
    const fixture = create();
    const element: HTMLElement = fixture.nativeElement;
    document.body.appendChild(element);
    fixture.componentRef.setInput('stats', emptyStats);
    fixture.componentRef.setInput('focusSection', 'agents');
    fixture.componentRef.setInput('presentation', 'docked');
    fixture.detectChanges();
    expect(document.activeElement).toBe(element.querySelector('[data-inspector-section="agents"] h3'));
    fixture.componentRef.setInput('presentation', 'rail');
    fixture.detectChanges();
    expect(document.activeElement).toBe(
      element.querySelector('[data-inspector-expand]'),
    );
    element.remove();
  });

  it('renders supplied identity as shared chips and preserves every expanded section', () => {
    const fixture = create();
    fixture.componentRef.setInput('presentation', 'docked');
    fixture.componentRef.setInput('sessionTitle', 'Full session title');
    fixture.componentRef.setInput('sessionStatus', 'done');
    fixture.componentRef.setInput('workflow', 'orchestrate');
    fixture.componentRef.setInput('branch', 'feature/a-branch-long-enough-to-truncate');
    fixture.componentRef.setInput('stats', emptyStats);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('h2')?.textContent?.trim()).toBe(
      'Full session title',
    );
    const status = element.querySelector('header ptah-status');
    expect(status?.textContent?.trim()).toBe('Done');
    expect(status?.getAttribute('data-ink')).toBe('done');
    expect(status?.querySelector('.ptah-status-glyph')?.getAttribute('aria-hidden')).toBe('true');
    const chips = Array.from(element.querySelectorAll('header [data-ptah-badge]'));
    expect(chips.map(chip => chip.querySelector('.ptah-badge-text')?.textContent)).toEqual([
      'orchestrate', 'feature/a-branch-long-enough-to-truncate',
    ]);
    expect(chips.map(chip => chip.getAttribute('title'))).toEqual([
      'Workflow: orchestrate', 'Branch: feature/a-branch-long-enough-to-truncate',
    ]);
    for (const section of [
      'session-stats',
      'agents-section',
      'task-section',
      'git-section',
    ]) {
      expect(element.querySelector(`ptah-inspector-${section}`)).not.toBeNull();
    }
    const close = jest.fn();
    fixture.componentInstance.closeRequested.subscribe(close);
    element.querySelector<HTMLButtonElement>('[data-inspector-close]')?.click();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('places session actions before the panel toggle in expanded and sheet headers', () => {
    for (const presentation of ['docked', 'sheet'] as const) {
      const fixture = create();
      fixture.componentRef.setInput('presentation', presentation);
      fixture.componentRef.setInput('running', true);
      fixture.detectChanges();
      const header = (fixture.nativeElement as HTMLElement).querySelector('header');
      expect(header?.querySelector('ptah-inspector-session-actions')).not.toBeNull();
      expect(header?.querySelector('[data-inspector-close]')).not.toBeNull();
      expect(header?.querySelector('ptah-inspector-session-actions')?.nextElementSibling)
        .toBe(header?.querySelector('[data-inspector-close]'));
      expect(fixture.componentInstance.running()).toBe(true);
    }
  });

  it('crossfades stats only when the session changes', () => {
    jest.useFakeTimers();
    try {
      const first = { ...emptyStats, sessionId: 'session-a' };
      const fixture = create(first);
      fixture.componentRef.setInput('presentation', 'docked');
      fixture.detectChanges();
      const stats = () => fixture.nativeElement.querySelectorAll('ptah-inspector-session-stats');
      expect(stats()).toHaveLength(1);
      expect(stats()[0].classList.contains('inspector-stats-enter')).toBe(false);

      fixture.componentRef.setInput('stats', { ...first, compactionCount: 1 });
      fixture.detectChanges();
      expect(stats()).toHaveLength(1);
      expect(stats()[0].classList.contains('inspector-stats-enter')).toBe(false);

      fixture.componentRef.setInput('tabId', 'another-tab');
      fixture.detectChanges();
      expect(stats()).toHaveLength(1);
      expect(stats()[0].classList.contains('inspector-stats-enter')).toBe(false);

      fixture.componentRef.setInput('stats', { ...first, sessionId: 'session-b' });
      fixture.detectChanges();
      expect(stats()).toHaveLength(2);
      expect(stats()[0].classList.contains('inspector-stats-leave')).toBe(true);
      expect(stats()[0].getAttribute('aria-hidden')).toBe('true');
      expect(stats()[1].classList.contains('inspector-stats-enter')).toBe(true);

      jest.advanceTimersByTime(420);
      fixture.detectChanges();
      expect(stats()).toHaveLength(1);
      expect(stats()[0].classList.contains('inspector-stats-enter')).toBe(false);
      fixture.componentRef.setInput('stats', { ...first, sessionId: 'session-b', compactionCount: 2 });
      fixture.detectChanges();
      expect(stats()).toHaveLength(1);
      expect(stats()[0].classList.contains('inspector-stats-enter')).toBe(false);
      fixture.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not animate when the same session returns after null stats', () => {
    jest.useFakeTimers();
    try {
      const first = { ...emptyStats, sessionId: 'session-a' };
      const fixture = create(first);
      fixture.componentRef.setInput('presentation', 'docked');
      fixture.detectChanges();
      fixture.componentRef.setInput('stats', null);
      fixture.detectChanges();
      fixture.componentRef.setInput('stats', first);
      fixture.detectChanges();
      const stats = fixture.nativeElement.querySelectorAll('ptah-inspector-session-stats');
      expect(stats).toHaveLength(1);
      expect(stats[0].classList.contains('inspector-stats-enter')).toBe(false);
      fixture.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('animates A to null to B and reads the current switch token', () => {
    jest.useFakeTimers();
    try {
      const first = { ...emptyStats, sessionId: 'session-a' };
      const fixture = create(first);
      fixture.componentRef.setInput('presentation', 'docked');
      fixture.detectChanges();
      const stats = () => fixture.nativeElement.querySelectorAll('ptah-inspector-session-stats');

      fixture.componentRef.setInput('stats', null);
      fixture.detectChanges();
      expect(stats()).toHaveLength(0);

      fixture.componentRef.setInput('stats', { ...first, sessionId: 'session-b' });
      fixture.detectChanges();
      expect(stats()).toHaveLength(2);
      expect(stats()[0].classList.contains('inspector-stats-leave')).toBe(true);
      expect(stats()[1].classList.contains('inspector-stats-enter')).toBe(true);

      fixture.nativeElement.style.setProperty('--ptah-motion-switch', '0.7s');
      fixture.componentRef.setInput('stats', { ...first, sessionId: 'session-c' });
      fixture.detectChanges();
      expect(stats()).toHaveLength(2);
      jest.advanceTimersByTime(739);
      fixture.detectChanges();
      expect(stats()).toHaveLength(2);
      jest.advanceTimersByTime(1);
      fixture.detectChanges();
      expect(stats()).toHaveLength(1);
      fixture.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps only the collapse control at the right of the title row, with no separate bar, and the status under the title', () => {
    const fixture = TestBed.createComponent(ControlsHost);
    fixture.componentInstance.title = 'A very long session title';
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const headers = element.querySelectorAll('header');
    expect(headers).toHaveLength(1);
    const [identity, controls] = Array.from(headers[0].children);
    expect(identity.classList).toContain('min-w-0');
    expect(identity.classList).toContain('flex-1');
    expect(identity.querySelector('h2')?.textContent?.trim()).toBe('A very long session title');
    expect(identity.querySelector('ptah-status')?.textContent?.trim()).toBe('Running');
    expect(identity.querySelector('[data-ptah-badge]')).toBeNull();
    expect(controls.classList).toContain('shrink-0');
    const labels = Array.from(controls.querySelectorAll('button')).map(
      (b) => b.getAttribute('aria-label') ?? b.textContent?.trim(),
    );
    // Session actions live in the session card menu: the title row has only the collapse.
    expect(labels).toEqual(['Compact session details']);
    expect(controls.lastElementChild?.hasAttribute('data-inspector-close')).toBe(true);
  });

  it('names the collapse by presentation and never shows a close-session X in the sheet', () => {
    const fixture = create();
    fixture.componentRef.setInput('presentation', 'sheet');
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('h2')).toBeNull();
    expect(element.querySelector('header :is(ptah-status, [data-ptah-badge])')).toBeNull();
    expect(
      element.querySelector('[data-inspector-close]')?.getAttribute('aria-label'),
    ).toBe('Close session details');
    // The sheet's collapse uses the same panel icon as the dock, not an X that reads as Close session.
    expect(element.querySelector('[data-inspector-close] lucide-angular')).not.toBeNull();
    expect('XIcon' in fixture.componentInstance).toBe(false);
    const host = TestBed.createComponent(ControlsHost);
    host.detectChanges();
    expect(host.nativeElement.querySelector('h2')).toBeNull();
  });
});

describe('SessionInspectorComponent linked sessions (TASK_2026_876)', () => {
  const A = 'aaaaaaaa-1111-4111-8111-111111111111';
  const B = 'bbbbbbbb-2222-4222-8222-222222222222';
  const C = 'cccccccc-3333-4333-8333-333333333333';
  const model = signal<SessionInspectorModel>({ ...emptyModel, sessionId: B });
  let chain: SessionHandoffChainResult;
  let rpcCall: jest.Mock;
  let openSession: jest.Mock;

  beforeEach(() => {
    model.set({ ...emptyModel, sessionId: B });
    chain = {
      sessions: [
        { sessionId: A, label: 'Plan the refactor' },
        { sessionId: B, label: 'Implement batch 2' },
        { sessionId: C, label: null },
      ],
    };
    rpcCall = jest.fn(async () => new RpcResult(true, chain));
    openSession = jest.fn(async () => 'opened');
    TestBed.configureTestingModule({
      imports: [SessionInspectorComponent],
      providers: [
        { provide: SessionInspectorStore, useValue: { modelFor: () => model } },
        ...projectionProviders(),
        {
          provide: TabManagerService,
          useValue: { backgroundTabsRevision: () => 0, findTabByIdAcrossWorkspaces: () => null },
        },
        { provide: ClaudeRpcService, useValue: { call: rpcCall } },
        { provide: SessionRowActionsService, useValue: { openSession } },
      ],
    }).overrideComponent(SessionInspectorComponent, {
      set: {
        imports: [NgTemplateOutlet, InspectorLinkedSessionsComponent],
        schemas: [NO_ERRORS_SCHEMA],
      },
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  async function create(
    presentation: 'docked' | 'sheet' | 'embedded' | 'rail',
    stats: SessionStatsInputs | null = emptyStats,
  ) {
    const fixture = TestBed.createComponent(SessionInspectorComponent);
    fixture.componentRef.setInput('tabId', 'one');
    fixture.componentRef.setInput('presentation', presentation);
    fixture.componentRef.setInput('stats', stats);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  const section = (root: HTMLElement) =>
    root.querySelector('ptah-inspector-linked-sessions');

  it.each(['docked', 'sheet', 'embedded'] as const)(
    'renders the chain after git in the %s body',
    async (presentation) => {
      const { root } = await create(presentation);
      expect(rpcCall).toHaveBeenCalledWith('session:handoffChain', {
        sessionId: B,
      });
      const host = section(root);
      expect(host).not.toBeNull();
      const order = Array.from(
        root.querySelectorAll(
          'ptah-inspector-session-stats[data-active-session-stats], ptah-inspector-agents-section, ptah-inspector-git-section, ptah-inspector-linked-sessions',
        ),
        (el) => el.tagName.toLowerCase(),
      );
      expect(order).toEqual([
        'ptah-inspector-session-stats',
        'ptah-inspector-agents-section',
        'ptah-inspector-git-section',
        'ptah-inspector-linked-sessions',
      ]);
      const relations = Array.from(
        root.querySelectorAll(
          '[data-testid="inspector-linked-session-relation"]',
        ),
        (el) => el.textContent?.trim(),
      );
      expect(relations).toEqual([
        'Continued from',
        'This session',
        'Continued in',
      ]);
    },
  );

  it('does not render the section or load the chain on the w-14 rail', async () => {
    const { root } = await create('rail');
    expect(section(root)).toBeNull();
    expect(rpcCall).not.toHaveBeenCalled();
  });

  it('still shows the chain when the metrics snapshot is missing', async () => {
    const { root } = await create('docked', null);
    expect(root.querySelector('ptah-inspector-session-stats')).toBeNull();
    expect(section(root)).not.toBeNull();
  });

  it('omits the section when the session has no chain', async () => {
    chain = { sessions: [] };
    const { root } = await create('docked');
    expect(section(root)).toBeNull();
  });

  it('omits the section when the chain result is malformed', async () => {
    rpcCall.mockResolvedValue(
      new RpcResult(true, { sessions: [{ sessionId: 42, label: null }] }),
    );
    const { root } = await create('docked');
    expect(section(root)).toBeNull();
  });

  it('opens another session through SessionRowActionsService and not the current one', async () => {
    const { root } = await create('docked');
    const buttons = root.querySelectorAll<HTMLButtonElement>(
      '[data-testid="inspector-linked-session"]',
    );
    buttons[1].click();
    expect(openSession).not.toHaveBeenCalled();
    buttons[0].click();
    expect(openSession).toHaveBeenCalledWith({
      id: A,
      name: 'Plan the refactor',
    });
    buttons[2].click();
    expect(openSession).toHaveBeenLastCalledWith({ id: C, name: '' });
  });

  it('releases the chain when the body collapses to the rail', async () => {
    const { fixture } = await create('docked');
    const client = TestBed.inject(HandoffChainClient);
    expect(client.entriesFor(B)()).toHaveLength(3);
    fixture.componentRef.setInput('presentation', 'rail');
    fixture.detectChanges();
    expect(client.entriesFor(B)()).toEqual([]);
  });
});
