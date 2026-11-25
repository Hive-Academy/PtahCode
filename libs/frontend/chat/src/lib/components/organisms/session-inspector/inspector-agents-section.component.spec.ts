import { Component, computed, input, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { AgentDeliveryStore, AgentMonitorStore, PermissionHandlerService, type MonitoredAgent } from '@ptah-extension/chat-streaming';
import { TabManagerService } from '@ptah-extension/chat-state';
import type { SessionStatsEntry } from '@ptah-extension/shared';
import { PTAH_CLOCK } from '@ptah-extension/ui';
import { ModelStateService, WallClockService } from '@ptah-extension/core';
import {
  SessionInspectorStore,
  type InspectorAgentsData,
  type InspectorRequest,
  type SectionState,
  type OrchestratorCardModel,
} from '../../../services/session-inspector';
import { AgentPermissionResponder } from '../../../services/agent-permission-responder';
import { SessionAgentTrayService } from '../../../services/session-agents/session-agent-tray.service';
import { SessionAgentRosterService } from '../../../services/session-agents/session-agent-roster.service';
import type { SessionAgent } from '../../../services/session-agents/session-agent-roster';
import { InspectorAgentsSectionComponent } from './inspector-agents-section.component';
import { LaneComposerComponent } from '../../molecules/lane-composer/lane-composer.component';
import type { InspectorLaneRunDetail } from '@ptah-extension/chat-ui';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function agent(
  overrides: Partial<SessionAgent> = {},
  usageTotals?: SessionAgent['usageTotals'],
): SessionAgent {
  return {
    key: 'cli:lane-1',
    kind: 'cli',
    name: 'Codex',
    cliId: 'codex',
    agentType: null,
    status: 'done',
    startedAt: 1000,
    endedAt: 6000,
    activity: 'Usage: 2284653 input, 19323 output tokens',
    openRequestIds: [],
    usageTotals,
    ...overrides,
  };
}

const ORCHESTRATOR: SessionAgent = agent({
  key: 'orchestrator',
  kind: 'orchestrator',
  name: 'Orchestrator',
  cliId: null,
  status: 'done',
  startedAt: null,
  endedAt: null,
  activity: null,
});

const CARD: OrchestratorCardModel = {
  model: 'claude-opus-5-5',
  state: { kind: 'idle' },
  contextPercent: 42,
  contextWindow: 200_000,
  tokens: 1_100_000,
  cost: 0.8,
  turns: 14,
  requests: [],
};

/** Stands in for the lane composer; its behaviour is pinned by lane-composer.component.spec.ts. */
@Component({ selector: 'ptah-lane-composer', standalone: true, template: '' })
class LaneComposerStubComponent {
  readonly agentId = input.required<string>();
  readonly laneLabel = input('lane');
  readonly cli = input('CLI');
  readonly stopped = input(false);
}

describe('InspectorAgentsSectionComponent', () => {
  const detail: InspectorLaneRunDetail = {
    runId: 'lane-1', cliLabel: 'Codex', role: 'backend-developer',
    row: { runId: 'lane-1', index: 1, model: 'gpt-5', tokensText: '100', costText: '$0.01',
      status: { tone: 'success', text: 'Completed' }, started: { short: '1 Jan', full: '1 Jan 2026' } },
    ownerText: 'Unknown owner', notes: ['Limits not tracked'], evidenceLines: [], windows: [],
  };
  const fixedNow = signal(10_000);
  const rosterState = signal<SectionState<InspectorAgentsData>>({ status: 'loading', data: null });
  const orchestrator = signal<OrchestratorCardModel | null>(CARD);
  const defaultSnapshot = {
    sessionId: 'owner',
    status: 'ok',
    tokenCount: 1_098_000,
    totalCost: 0.8,
    tokens: { input: 1_050_000, output: 48_000, cacheRead: 0, cacheCreation: 0 },
  } satisfies Partial<SessionStatsEntry>;
  const snapshot = signal<Partial<SessionStatsEntry> | null>(defaultSnapshot);
  const monitored = signal<readonly MonitoredAgent[]>([]);

  beforeEach(() => {
    fixedNow.set(10_000);
    rosterState.set({ status: 'loading', data: null });
    orchestrator.set(CARD);
    snapshot.set(defaultSnapshot);
    monitored.set([]);
    TestBed.configureTestingModule({
      imports: [InspectorAgentsSectionComponent],
      providers: [
        { provide: AgentDeliveryStore, useValue: { receipts: signal(new Map()), recovered: signal(new Map()), takeRecoveredMessage: () => null,
          composerState: () => ({ queue: { mode: 'queue-next-turn' }, now: { mode: 'steer' } }), previewMessage: jest.fn().mockResolvedValue(undefined),
          receiptLabel: () => 'Queued', receiptStatus: () => ({ label: 'Queued' }), newIdempotencyKey: () => 'key' } },
        {
          provide: AgentMonitorStore,
          useValue: {
            agentsOwnedBySession: monitored, subagents: signal(new Map()), agents: monitored,
            agentsById: computed(() => new Map(monitored().map(lane => [lane.agentId, lane]))),
          },
        },
        {
          provide: SessionInspectorStore,
          useValue: {
            answerMissed: () => false, clearAnswerMiss: jest.fn(),
            modelFor: () => () => ({ agents: rosterState(), orchestrator: orchestrator(), needsYouCount: 999 }),
          },
        },
        {
          provide: SessionAgentTrayService,
          useValue: {
            contextsFor: () => new Map(),
            extrasFor: () => new Map(),
            focus: jest.fn(),
          },
        },
        {
          provide: SessionAgentRosterService,
          useValue: { roster: () => [ORCHESTRATOR] },
        },
        {
          provide: ModelStateService,
          useValue: {
            availableModels: signal([
              { id: 'claude-opus-5-5', name: 'Opus 5.5' },
            ]),
          },
        },
        {
          provide: TabManagerService,
          useValue: {
            backgroundTabsRevision: signal(0),
            findTabByIdAcrossWorkspaces: () => ({ tab: { sessionStats: snapshot() } }),
          },
        },
        { provide: AgentPermissionResponder, useValue: {} },
        { provide: PermissionHandlerService, useValue: {} },
        { provide: PTAH_CLOCK, useValue: { now: fixedNow, acquire: () => () => undefined } },
        {
          provide: WallClockService,
          useValue: { now: () => fixedNow, acquire: () => () => undefined },
        },
      ],
    });
    TestBed.overrideComponent(InspectorAgentsSectionComponent, {
      remove: { imports: [LaneComposerComponent] },
      add: { imports: [LaneComposerStubComponent] },
    });
  });

  function mount(
    rows: readonly SessionAgent[],
    options: {
      selected?: string | null;
      requests?: Record<string, InspectorRequest[]>;
      laneSurface?: boolean;
    } = {},
  ): ComponentFixture<InspectorAgentsSectionComponent> {
    const fixture = TestBed.createComponent(InspectorAgentsSectionComponent);
    fixture.componentRef.setInput('tabId', 'tab-1');
    fixture.componentRef.setInput('orchestrator', orchestrator());
    fixture.componentRef.setInput('sessionId', 'owner');
    fixture.componentRef.setInput(
      'hasLaneSurface',
      options.laneSurface ?? false,
    );
    if (options.selected !== undefined) {
      fixture.componentRef.setInput('selectedAgentKey', options.selected);
    }
    const state: SectionState<InspectorAgentsData> = {
      status: 'ready',
      data: {
        rows: rows.map((row) => ({
          agent: row,
          requests: options.requests?.[row.key] ?? [],
        })),
        active: 0,
        finished: 0,
      },
    };
    rosterState.set(state);
    fixture.componentRef.setInput('agents', state);
    fixture.detectChanges();
    return fixture;
  }

  function element<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
    const match = root.querySelector<T>(selector);
    if (!match) throw new Error(`Expected element matching ${selector}`);
    return match;
  }

  const keys = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('[data-agent-key]')).map((row) =>
      row.getAttribute('data-agent-key'),
    );

  it.each(['sub:tool-1', 'bg:tool-1'])('keeps the tray steer input for %s', (key) => {
    const context = { agentId: 'sdk-1', model: null, sessionId: 'owner', entry: {
      id: 'tool-1', name: 'Explore', origin: key.startsWith('bg:') ? 'background' as const : 'foreground' as const,
      status: 'running' as const, steerable: true, stoppable: true, canBackground: false,
    } };
    TestBed.overrideProvider(SessionAgentTrayService, { useValue: {
      contextsFor: () => new Map(),
      extrasFor: () => new Map([[key, { tray: context, model: null, tokens: null }]]),
      focus: jest.fn(), steer: jest.fn().mockResolvedValue(true),
    } });
    const fixture = mount([agent({ key, kind: key.startsWith('bg:') ? 'background' : 'subagent', status: 'running', endedAt: null })]);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[aria-label="Actions for Codex"]')?.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent?.trim() === 'Steer')?.click();
    fixture.detectChanges();
    expect(root.querySelector('ptah-agent-steer-input')).not.toBeNull();
    expect(root.querySelector('ptah-lane-composer')).toBeNull();
  });

  it('mounts the lane composer for a monitored CLI row', () => {
    const key = 'cli:lane-1';
    const context = { agentId: 'lane-1', model: null, sessionId: 'owner', entry: {
      id: 'lane-1', name: 'Codex', origin: 'background' as const,
      status: 'running' as const, steerable: true, stoppable: true, canBackground: false,
    } };
    TestBed.overrideProvider(AgentMonitorStore, { useValue: {
      agents: signal([{ agentId: 'lane-1', segments: [] }]), agentsById: signal(new Map([['lane-1', { status: 'running', segments: [] }]])),
      agentsOwnedBySession: monitored, subagents: signal(new Map()), receipts: signal(new Map()),
      composerState: () => ({ queue: { supported: true }, now: { supported: true } }),
      previewMessage: jest.fn().mockResolvedValue(undefined), receiptLabel: () => 'Queued',
    } });
    TestBed.overrideProvider(SessionAgentTrayService, { useValue: {
      contextsFor: () => new Map(), extrasFor: () => new Map([[key, { tray: context, model: null, tokens: null }]]),
      focus: jest.fn(), steer: jest.fn().mockResolvedValue(true),
    } });
    const fixture = mount([agent({ status: 'running', endedAt: null })]);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[aria-label="Actions for Codex"]')?.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent?.trim() === 'Steer')?.click();
    fixture.detectChanges();
    expect(root.querySelector('ptah-lane-composer')).not.toBeNull();
    expect(root.querySelector('ptah-agent-steer-input')).toBeNull();
  });

  it('shows the CLI lane summary without a details disclosure', () => {
    const fixture = mount([agent()]);
    fixture.componentRef.setInput('laneRuns', [detail]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('· backend-developer');
    expect(root.querySelector('[data-testid="agent-run-detail"]')).toBeNull();
    expect(root.querySelector('[data-agent-key="cli:lane-1"]')?.getAttribute('aria-expanded')).toBe('false');
    expect(root.textContent).not.toContain('Details');
    expect(root.querySelector('[data-testid="agent-row-time"]')?.textContent).toBeTruthy();
  });

  it.each([
    { startedAt: 0, expected: true },
    { startedAt: 1000, expected: true },
    { startedAt: null, expected: false },
    { startedAt: NaN, expected: false },
    { startedAt: Infinity, expected: false },
  ])('exposes a valid start time accessibly for $startedAt', ({ startedAt, expected }) => {
    const root = mount([agent({ startedAt })]).nativeElement as HTMLElement;
    const row = root.querySelector('[data-agent-key="cli:lane-1"]') as HTMLButtonElement;
    expect(row.hasAttribute('title')).toBe(expected);
    expect(row.getAttribute('aria-label')?.includes('Started:')).toBe(expected);
    if (expected) {
      expect(row.getAttribute('aria-label')).toContain(row.getAttribute('title'));
      expect(row.getAttribute('title')).not.toContain('Invalid Date');
    }
  });

  it('keeps the whole-session total out of the roster even after revealing hidden rows', () => {
    const lanes = Array.from({ length: 7 }, (_, index) =>
      agent({ key: `cli:lane-${index}` }, { inputTokens: 100, outputTokens: 0, costUsd: 0.1 }),
    );
    const fixture = mount(lanes);
    const root = fixture.nativeElement as HTMLElement;
    element<HTMLButtonElement>(root, '[data-testid="agents-show-more"]').click();
    fixture.detectChanges();
    expect(keys(root)).toHaveLength(8);
    expect(root.querySelector('[data-testid="agents-total"]')).toBeNull();
  });

  it('orders the Orchestrator first and counts only roster entries', () => {
    const root: HTMLElement = mount([
      agent({ key: 'cli:done', status: 'done' }),
      agent({ key: 'cli:run', status: 'running', endedAt: null }),
      agent({ key: 'bg:waiting', kind: 'background', status: 'waiting' }),
      agent({ key: 'sub:done', kind: 'subagent', status: 'done' }),
    ]).nativeElement;
    expect(keys(root)).toEqual(['orchestrator', 'bg:waiting', 'cli:run', 'cli:done', 'sub:done']);
    expect(root.querySelector('h3')?.textContent?.trim()).toBe('AGENTS');
    expect(root.querySelector('[data-testid="agents-count"]')?.textContent?.trim())
      .toBe('1 running · 1 asking · 2 sub · 2 CLI');
    const columns = root.querySelector('section div.grid[aria-hidden="true"]');
    expect(Array.from(columns?.children ?? [], cell => cell.textContent)).toEqual(['Agent', 'Tokens', 'Cost', 'Time']);
    expect(root.textContent).not.toContain('Usage: 2284653');
  });

  it('drops the Cost column at 340px while keeping the amount available in the row and detail', () => {
    const columnsSource = readFileSync(join(__dirname, 'inspector-agents-section.component.ts'), 'utf8');
    const rowSource = readFileSync(join(__dirname, 'inspector-agent-row.component.ts'), 'utf8');
    expect(columnsSource).toMatch(/@container \(max-width: 340px\)\s*\{[^]*?\.agent-column-cost \{ display: none; \}/);
    expect(rowSource).toMatch(/@container \(max-width: 340px\)\s*\{[^]*?\.agent-row-cost, \.agent-row-wide \{ display: none; \}/);
    const fixture = mount([agent()]);
    const root = fixture.nativeElement as HTMLElement;
    const row = element<HTMLButtonElement>(root, '[data-agent-key="orchestrator"]');
    const summaryCost = element(row, '.agent-row-cost').textContent?.trim();
    const description = element(root, `[id="${row.getAttribute('aria-describedby')}"]`);
    expect(description.textContent).toContain('Cost');
    row.click();
    fixture.detectChanges();
    const region = element(root, `[id="${row.getAttribute('aria-controls')}"]`);
    const cost = Array.from(region.querySelectorAll('dl > div')).find(pair => pair.querySelector('dt')?.textContent === 'Cost');
    expect(cost?.querySelector('dd')?.textContent).toBe(summaryCost);
  });

  it('keeps a starting lane active and labels it distinctly', () => {
    const el: HTMLElement = mount([
      agent({ key: 'cli:starting', status: 'starting', endedAt: null }),
      agent({ key: 'cli:done', status: 'done' }),
    ]).nativeElement;
    expect(keys(el).slice(0, 2)).toEqual(['orchestrator', 'cli:starting']);
    expect(el.querySelector('[data-testid="agents-count"]')?.textContent).toContain('1 running');
    expect(el.querySelector('[data-agent-key="cli:starting"]')?.getAttribute('aria-label')).toContain('starting');
  });

  it('shows provider avatar, type line, status ink and compact tokens and cost', () => {
    const el: HTMLElement = mount([
      agent(
        {},
        { inputTokens: 2_284_653, outputTokens: 19_323, costUsd: 0.25 },
      ),
    ]).nativeElement;
    const row = el.querySelector(
      '[data-agent-key="cli:lane-1"]',
    ) as HTMLElement;
    expect(row.querySelector('ptah-agent-avatar')).not.toBeNull();
    expect(row.textContent).toContain('CLI lane');
    const status = Array.from(row.querySelectorAll('span')).find(
      (span) => span.textContent?.trim() === 'done',
    );
    expect(status?.classList.contains('text-state-done')).toBe(true);
    expect(
      row
        .querySelector('[data-testid="agent-row-tokens"]')
        ?.textContent?.trim(),
    ).toBe('2.3M');
    expect(
      row.querySelector('[data-testid="agent-row-cost"]')?.textContent?.trim(),
    ).toBe('~$0.25');
    const orchestrator = el.querySelector(
      '[data-agent-key="orchestrator"]',
    ) as HTMLElement;
    expect(orchestrator.textContent).toContain('Opus 5.5');
    expect(
      orchestrator
        .querySelector('[data-testid="agent-row-cost"]')
        ?.textContent?.trim(),
    ).toBe('$0.80');
  });

  it('renders an unknown figure as a quiet dash with a not-reported tooltip', () => {
    const el: HTMLElement = mount([agent()]).nativeElement;
    const tokens = el.querySelector(
      '[data-agent-key="cli:lane-1"] [data-testid="agent-row-tokens"]',
    ) as HTMLElement;
    expect(tokens.textContent?.trim()).toBe('—');
    expect(tokens.getAttribute('title')).toBe('not reported');
    expect(tokens.classList.contains('text-base-content-muted')).toBe(true);
  });

  it('keeps unknown Orchestrator token data as a dash', () => {
    const fixture = mount([]);
    snapshot.set(null);
    fixture.detectChanges();
    const tokens = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-agent-key="orchestrator"] [data-testid="agent-row-tokens"]',
    );
    expect(tokens?.textContent?.trim()).toBe('—');
    expect(tokens?.getAttribute('title')).toBe('not reported');
  });

  it('shows the session duration as the Orchestrator time (Codex main agent)', () => {
    const fixture = mount([]);
    const card = { ...CARD, model: 'gpt-5.5', durationMs: 12_500 };
    orchestrator.set(card);
    fixture.componentRef.setInput('orchestrator', card);
    fixture.detectChanges();
    const time = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-agent-key="orchestrator"] [data-testid="agent-row-time"]',
    );
    expect(time?.textContent?.trim()).toBe('0:12');
  });

  it.each([undefined, null])(
    'shows a muted and accessible unknown Orchestrator duration (%p)',
    (durationMs) => {
      const fixture = mount([]);
      const card = { ...CARD, durationMs };
      orchestrator.set(card);
      fixture.componentRef.setInput('orchestrator', card);
      fixture.detectChanges();
      const time = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-agent-key="orchestrator"] [data-testid="agent-row-time"]',
      );
      expect(time?.textContent?.trim()).toBe('--:--');
      expect(time?.classList.contains('text-base-content-muted')).toBe(true);
      expect(time?.querySelector('[aria-label="Duration not available"]')).not.toBeNull();
    },
  );

  it('acquires the shared clock only while an agent runs and advances elapsed time', () => {
    jest.useFakeTimers({
      doNotFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    }).setSystemTime(10_000);
    try {
      TestBed.overrideProvider(WallClockService, {
        useFactory: () => new WallClockService(),
        deps: [],
      });
      const clock = TestBed.inject(WallClockService);
      const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
      const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');
      const realAcquire = clock.acquire.bind(clock);
      let clockInterval: ReturnType<typeof setInterval> | undefined;
      let release: jest.Mock | undefined;
      const acquire = jest.spyOn(clock, 'acquire').mockImplementation((cadence) => {
        const previous = setIntervalSpy.mock.results.length;
        release = jest.fn(realAcquire(cadence));
        const created = setIntervalSpy.mock.results.slice(previous);
        expect(created).toHaveLength(1);
        clockInterval = created[0].value;
        return release;
      });

      const fixture = mount([]);
      TestBed.tick();
      expect(acquire).not.toHaveBeenCalled();

      const running = agent({ status: 'running', startedAt: 1_000, endedAt: null });
      rosterState.set({
        status: 'ready',
        data: { rows: [{ agent: running, requests: [] }], active: 1, finished: 0 },
      });
      fixture.detectChanges();
      TestBed.tick();
      expect(acquire).toHaveBeenCalledWith('second');
      const row = () => (fixture.nativeElement as HTMLElement).querySelector(
        '[data-agent-key="cli:lane-1"]',
      );
      expect(row()?.getAttribute('aria-label')).toContain('running 9s');
      expect(row()?.querySelector('ptah-timer time')?.textContent).toBe('0:09');

      jest.advanceTimersByTime(1_000);
      TestBed.tick();
      fixture.detectChanges();
      expect(row()?.getAttribute('aria-label')).toContain('running 10s');
      expect(row()?.querySelector('ptah-timer time')?.textContent).toBe('0:10');

      rosterState.set({
        status: 'ready',
        data: {
          rows: [{ agent: { ...running, status: 'done', endedAt: 11_000 }, requests: [] }],
          active: 0,
          finished: 1,
        },
      });
      fixture.detectChanges();
      TestBed.tick();
      expect(release).toHaveBeenCalledTimes(1);
      expect(clearIntervalSpy).toHaveBeenCalledWith(clockInterval);
      fixture.destroy();
    } finally {
      jest.restoreAllMocks();
      jest.useRealTimers();
    }
  });

  it('marks partial usage from retained segments as a lower bound', () => {
    const el: HTMLElement = mount([
      agent({
        usageTotals: null,
        segments: [
          {
            type: 'info',
            content: '',
            usage: { inputTokens: 11_900, outputTokens: 100, costUsd: 0.1 },
          },
        ],
      }),
    ]).nativeElement;
    const row = el.querySelector(
      '[data-agent-key="cli:lane-1"]',
    ) as HTMLElement;
    expect(
      row
        .querySelector('[data-testid="agent-row-tokens"]')
        ?.textContent?.trim(),
    ).toBe('≥ 12.0k');
    expect(
      row.querySelector('[data-testid="agent-row-cost"]')?.textContent?.trim(),
    ).toBe('≥ ~$0.10');
  });

  it('marks the Orchestrator row as selected by default with its in / out tooltip', () => {
    const el: HTMLElement = mount([agent()]).nativeElement;
    const button = el.querySelector(
      '[data-agent-key="orchestrator"]',
    ) as HTMLElement;
    expect(button.closest('li')?.getAttribute('aria-current')).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(
      button
        .querySelector('[data-testid="agent-row-tokens"]')
        ?.getAttribute('title'),
    ).toBe('In 1.1M · Out 48.0k');
    expect(el.textContent).not.toContain('Open thread');
  });

  it('selects one row at a time and opens its thread on click', () => {
    const fixture = mount(
      [agent({}, { inputTokens: 1200, outputTokens: 300 })],
      {
        laneSurface: true,
      },
    );
    const selected = jest.fn();
    const lane = jest.fn();
    fixture.componentInstance.agentSelected.subscribe(selected);
    fixture.componentInstance.laneRequested.subscribe(lane);
    const el: HTMLElement = fixture.nativeElement;
    const row = el.querySelector<HTMLButtonElement>(
      '[data-agent-key="cli:lane-1"]',
    )!;
    row.click();
    fixture.detectChanges();
    expect(selected).toHaveBeenCalledWith('cli:lane-1');
    expect(lane).toHaveBeenCalledWith('cli:lane-1');
    expect(row.closest('li')?.getAttribute('aria-current')).toBe('true');
    expect(
      el
        .querySelector('[data-agent-key="orchestrator"]')
        ?.closest('li')
        ?.getAttribute('aria-current'),
    ).toBeNull();
    expect(
      row
        .querySelector('[data-testid="agent-row-tokens"]')
        ?.getAttribute('title'),
    ).toBe('In 1.2k · Out 300');
    row.click();
    expect(selected).toHaveBeenCalledTimes(1);
    expect(lane).toHaveBeenCalledTimes(2);
  });

  it('selects the Orchestrator without a thread request when no lane surface exists', () => {
    const fixture = mount([agent()], { selected: 'cli:lane-1' });
    const lane = jest.fn();
    fixture.componentInstance.laneRequested.subscribe(lane);
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-agent-key="orchestrator"]')!
      .click();
    expect(lane).not.toHaveBeenCalled();
  });

  it('follows the host selection and reports a key that left the roster', () => {
    const fixture = mount(
      [agent({ key: 'bg:tool-1', kind: 'background', cliId: null })],
      {
        selected: 'sub:tool-1',
      },
    );
    const selected = jest.fn();
    fixture.componentInstance.agentSelected.subscribe(selected);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(
      el
        .querySelector('[data-agent-key="bg:tool-1"]')
        ?.closest('li')
        ?.getAttribute('aria-current'),
    ).toBe('true');
    fixture.componentRef.setInput('selectedAgentKey', 'cli:gone');
    fixture.detectChanges();
    expect(selected).toHaveBeenCalledWith('orchestrator');
  });

  it('shows six rows, then expands in place with "Show N more"', () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      agent({ key: `cli:l${i}`, name: `Lane ${i}` }),
    );
    const fixture = mount(rows);
    const el: HTMLElement = fixture.nativeElement;
    expect(keys(el)).toHaveLength(6);
    const toggle = el.querySelector<HTMLButtonElement>(
      '[data-testid="agents-show-more"]',
    )!;
    expect(toggle.textContent?.trim()).toBe('Show 4 more');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(keys(el)).toHaveLength(10);
    expect(toggle.textContent?.trim()).toBe('Show fewer');
  });

  it('keeps a selected row below the fold visible', () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      agent({ key: `cli:l${i}`, name: `Lane ${i}` }),
    );
    const el: HTMLElement = mount(rows, { selected: 'cli:l8' }).nativeElement;
    expect(keys(el)).toContain('cli:l8');
    expect(
      el.querySelector('[data-testid="agents-show-more"]')?.textContent?.trim(),
    ).toBe('Show 3 more');
  });

  it('keeps a finished agent with a pending question on its row and forwards the answer', () => {
    const request: InspectorRequest = {
      requestId: 'question-1',
      kind: 'question',
      source: 'lane',
      ownerKey: 'cli:lane-1',
      ownerName: 'Codex',
      agentId: 'lane-1',
      toolName: null,
      command: 'Choose a file',
      questionPreview: 'Choose a file',
      timestamp: 1000,
    };
    const fixture = mount([agent()], { requests: { 'cli:lane-1': [request] } });
    const answered = jest.fn();
    fixture.componentInstance.answerRequested.subscribe(answered);
    const el: HTMLElement = fixture.nativeElement;
    expect(keys(el).slice(0, 2)).toEqual(['orchestrator', 'cli:lane-1']);
    el.querySelector<HTMLButtonElement>('[data-request-button]')?.click();
    expect(answered).toHaveBeenCalledWith('question-1');
  });

  it('reuses sub-agent lane usage for tokens, the in / out tooltip and the model', () => {
    TestBed.overrideProvider(AgentMonitorStore, {
      useValue: {
        agents: signal([]),
        agentsOwnedBySession: monitored, subagents: signal(
          new Map([
            [
              'tool-1',
              {
                parentToolUseId: 'tool-1',
                status: 'completed',
                startedAt: 1000,
                completedAt: 6000,
                totalTokens: 2400,
                usage: { input: 1200, output: 300, model: 'test-model' },
              },
            ],
          ]),
        ),
      },
    });
    const el: HTMLElement = mount(
      [
        agent({
          key: 'sub:tool-1',
          kind: 'subagent',
          cliId: null,
          name: 'Explore',
        }),
      ],
      { selected: 'sub:tool-1' },
    ).nativeElement;
    const row = el.querySelector(
      '[data-agent-key="sub:tool-1"]',
    ) as HTMLElement;
    expect(
      row
        .querySelector('[data-testid="agent-row-tokens"]')
        ?.textContent?.trim(),
    ).toBe('2.4k');
    expect(
      row.querySelector('[data-testid="agent-row-model"]')?.textContent?.trim(),
    ).toBe('test-model');
    expect(
      row
        .querySelector('[data-testid="agent-row-model"]')
        ?.getAttribute('title'),
    ).toBe('Sub-agent · test-model');
    expect(row.getAttribute('aria-label')).toContain('Model test-model.');
    expect(row.getAttribute('aria-label')).toContain('2.4k tokens (In 1.2k · Out 300)');
    expect(
      row
        .querySelector('[data-testid="agent-row-tokens"]')
        ?.getAttribute('title'),
    ).toBe('In 1.2k · Out 300');
  });

  it('keeps sub-agent usage after the sub-agent moves to the background', () => {
    TestBed.overrideProvider(AgentMonitorStore, {
      useValue: {
        agents: signal([]),
        agentsOwnedBySession: monitored, subagents: signal(
          new Map([
            [
              'tool-1',
              {
                parentToolUseId: 'tool-1',
                status: 'background',
                startedAt: 1000,
                totalTokens: 2400,
                usage: { input: 1200, output: 300, model: 'test-model' },
              },
            ],
          ]),
        ),
      },
    });
    const el: HTMLElement = mount(
      [
        agent({
          key: 'bg:tool-1',
          kind: 'background',
          cliId: null,
          name: 'Explore',
          status: 'running',
          endedAt: null,
        }),
      ],
      { selected: 'bg:tool-1' },
    ).nativeElement;
    const row = el.querySelector('[data-agent-key="bg:tool-1"]') as HTMLElement;
    expect(
      row
        .querySelector('[data-testid="agent-row-tokens"]')
        ?.textContent?.trim(),
    ).toBe('2.4k');
    expect(
      row
        .querySelector('[data-testid="agent-row-tokens"]')
        ?.getAttribute('title'),
    ).toBe('In 1.2k · Out 300');
  });

  it('shows no "Show more" when the selected seventh row makes every row visible', () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      agent({ key: `cli:l${i}`, name: `Lane ${i}` }),
    );
    const el: HTMLElement = mount(rows, { selected: 'cli:l5' }).nativeElement;
    expect(keys(el)).toHaveLength(7);
    expect(el.querySelector('[data-testid="agents-show-more"]')).toBeNull();
  });
  function cliMonitor(usageTotals: MonitoredAgent['usageTotals']): MonitoredAgent {
    return {
      agentId: 'lane-1', cli: 'codex', task: 'Implement', status: 'completed',
      startedAt: 1_000, stdout: '', stderr: '', expanded: false,
      segments: [], streamEvents: [], streamRevision: 0, permissionQueue: [], usageTotals,
    };
  }

  function shareWidths(root: HTMLElement): number[] {
    return Array.from(root.querySelectorAll<HTMLElement>('ptah-meter[data-testid="agent-share"] [style]'),
      fill => Number.parseFloat(fill.style.width));
  }

  it('shares ordinary-split CLI and SDK tokens without counting the SDK subagent twice', () => {
    snapshot.set({ ...defaultSnapshot, tokenCount: 3000 });
    monitored.set([cliMonitor({ inputTokens: 700, outputTokens: 300, costUsd: 0.25 })]);
    TestBed.overrideProvider(SessionAgentTrayService, { useValue: {
      extrasFor: () => new Map([['sub:tool-1', { tray: null, model: null, tokens: 1000 }]]),
    } });
    const sub = agent({ key: 'sub:tool-1', kind: 'subagent' }, { inputTokens: 800, outputTokens: 200, costUsd: 0.1 });
    const root: HTMLElement = mount([sub, agent()]).nativeElement;
    expect(shareWidths(root)).toEqual([50, 25, 25]);
    const fills = Array.from(root.querySelectorAll('ptah-meter[data-testid="agent-share"] [style]'));
    expect(fills.every(fill => !fill.className.includes('transition'))).toBe(true);
    expect(shareWidths(root).reduce((sum, width) => sum + width, 0)).toBeCloseTo(100);
    const orchestratorRow = element(root, '[data-agent-key="orchestrator"]');
    expect(orchestratorRow.querySelector('[data-testid="agent-row-tokens"]')?.textContent).toBe('~2.0k');
    expect(orchestratorRow.querySelector('[data-testid="agent-row-cost"]')?.textContent?.trim()).toBe('~$0.70');
    expect(orchestratorRow.querySelector('[role="meter"]')?.getAttribute('aria-label')).toBe('About 50% of session tokens');
  });

  it.each([
    { usageTotals: { totalTokens: 1000 }, comparable: false },
    { usageTotals: { inputTokens: 1000 }, comparable: true },
  ])(
    'uses the reported token subtotal and excludes incompatible CLI figures (%p)',
    ({ usageTotals, comparable }) => {
      monitored.set([cliMonitor({ ...usageTotals, costUsd: 0.25 })]);
      const root: HTMLElement = mount([agent()]).nativeElement;
      const widths = shareWidths(root);
      expect(widths).toHaveLength(comparable ? 2 : 1);
      expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100);
      const spaces = Array.from(root.querySelectorAll('[data-testid="agent-share-space"]'));
      expect(spaces).toHaveLength(comparable ? 0 : 1);
      expect(spaces.every(space => space.classList.contains('h-0.5'))).toBe(true);
      expect(root.querySelector('[data-agent-key="cli:lane-1"] [data-testid="agent-row-tokens"]')?.textContent).toMatch(/^≥/);
    },
  );

  it('gives the Orchestrator a full reported-token bar when CLI usage is missing', () => {
    monitored.set([cliMonitor({ costUsd: 0.25 })]);
    const root: HTMLElement = mount([agent()]).nativeElement;
    const orchestratorRow = element(root, '[data-agent-key="orchestrator"]');
    const cliRow = element(root, '[data-agent-key="cli:lane-1"]');
    expect(shareWidths(root)).toEqual([100]);
    expect(element(orchestratorRow, 'ptah-meter').getAttribute('title'))
      .toMatch(/100% of reported session tokens$/);
    const description = element(root, `[id="${orchestratorRow.getAttribute('aria-describedby')}"]`);
    expect(description.textContent).toContain('100% of reported session tokens');
    expect(element(cliRow, '[data-testid="agent-row-tokens"]').textContent).toBe('—');
    expect(cliRow.querySelector('ptah-meter')).toBeNull();
  });

  it('keeps the share and displayed usage when a CLI lane leaves the monitor with retained usage', () => {
    snapshot.set({ ...defaultSnapshot, tokenCount: 3000 });
    monitored.set([cliMonitor({ inputTokens: 700, outputTokens: 300, costUsd: 0.25 })]);
    const fixture = mount([agent()]);
    const root = fixture.nativeElement as HTMLElement;
    expect(shareWidths(root)).toEqual([75, 25]);
    monitored.set([]);
    fixture.detectChanges();
    expect(shareWidths(root)).toEqual([75, 25]);
    expect(root.querySelector('[data-agent-key="cli:lane-1"] [data-testid="agent-row-tokens"]')?.textContent).toBe('1.0k');
  });

  it('keeps estimated-total shares and gives a true zero lane an empty track', () => {
    snapshot.set({ ...defaultSnapshot, tokenCount: 3000, provisional: true });
    monitored.set([cliMonitor({ inputTokens: 0, outputTokens: 0, costUsd: 0 })]);
    const root: HTMLElement = mount([agent()]).nativeElement;
    expect(shareWidths(root)).toEqual([100, 0]);
    const lane = element(root, '[data-agent-key="cli:lane-1"]');
    expect(lane.querySelector('[role="meter"]')?.getAttribute('aria-label')).toBe('About 0% of session tokens');
    expect(lane.querySelector('[data-testid="agent-row-tokens"]')?.textContent).toBe('0');
  });

  it('leaves missing SDK lane and Orchestrator figures muted with no token fill', () => {
    const root: HTMLElement = mount([agent({ key: 'sub:missing', kind: 'subagent' })]).nativeElement;
    expect(shareWidths(root)).toEqual([]);
    const row = element(root, '[data-agent-key="orchestrator"]');
    expect(element(row, '[data-testid="agent-row-tokens"]').textContent).toBe('—');
    const description = element(root, `[id="${row.getAttribute('aria-describedby')}"]`);
    expect(description.textContent).toContain('A subagent reported no usage');
  });

  it('reserves the share space for zero and unknown denominators', () => {
    snapshot.set({ ...defaultSnapshot, tokenCount: 0 });
    const fixture = mount([]);
    const root = fixture.nativeElement as HTMLElement;
    expect(shareWidths(root)).toEqual([]);
    expect(root.querySelector('[data-testid="agent-share-space"]')).not.toBeNull();
    snapshot.set(null);
    fixture.detectChanges();
    expect(shareWidths(root)).toEqual([]);
    expect(root.querySelector('[data-testid="agent-share-space"]')).not.toBeNull();
  });

  it('shows a loading caption with motion-safe skeletons followed by the empty roster copy', () => {
    const fixture = mount([]);
    const root = fixture.nativeElement as HTMLElement;
    rosterState.set({ status: 'loading', data: null });
    fixture.detectChanges();
    expect(root.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('[role="status"]')?.textContent).toBe('Loading agents');
    expect(root.querySelector('[data-testid="agents-count"]')).toBeNull();
    const skeletons = Array.from(root.querySelectorAll('.animate-pulse'));
    expect(skeletons.length).toBeGreaterThan(0);
    expect(skeletons.every(node => node.classList.contains('motion-reduce:animate-none'))).toBe(true);
    rosterState.set({ status: 'ready', data: { rows: [], active: 0, finished: 0 } });
    fixture.detectChanges();
    expect(root.textContent).toContain('No subagents or CLI lanes yet');
  });

  it('renders shared cache detail and keyboard-accessible exact metric descriptions', () => {
    orchestrator.set({ ...CARD, durationMs: 5_165_000, contextPercent: 86 });
    const fixture = mount([]);
    fixture.componentRef.setInput('cache', { ttl: '5m', lastRequestAt: 5_000, expiresAt: 305_000 });
    fixture.componentRef.setInput('contextUsed', 172_000);
    fixture.componentRef.setInput('compactionCount', 3);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const row = element<HTMLButtonElement>(root, '[data-agent-key="orchestrator"]');
    expect(row.type).toBe('button');
    expect(row.tabIndex).toBe(0);
    expect(row.querySelector('ptah-ring')).not.toBeNull();
    const timer = element(row, 'ptah-timer');
    expect(timer.textContent?.trim()).toBe('1h 26m');
    expect(timer.querySelector('time')?.getAttribute('title')).toBe('Duration 1:26:05');
    const description = root.querySelector(`[id="${row.getAttribute('aria-describedby')}"]`);
    expect(description?.textContent).toContain('1,098,000 tokens');
    expect(description?.textContent).toContain('Duration 1:26:05');
    expect(description?.textContent).toContain('Near context limit');
    const region = element<HTMLElement>(root, `[id="${row.getAttribute('aria-controls')}"]`);
    expect(region.hidden).toBe(true);
    row.click();
    fixture.detectChanges();
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(region.hidden).toBe(false);
    expect(region.textContent).toContain('In 1.1M · Out 48.0k');
    expect(region.textContent).toContain('Compactions3');
    expect(region.querySelector('ptah-inspector-cache-tile')?.textContent).toContain('The server can evict cached content early.');
    const focus = jest.spyOn(row, 'focus');
    region.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(region.hidden).toBe(true);
  });

  it('groups detail labels with their values and marks unavailable metrics as muted dashes', () => {
    const fixture = mount([]);
    const root = fixture.nativeElement as HTMLElement;
    const row = element<HTMLButtonElement>(root, '[data-agent-key="orchestrator"]');
    row.click();
    fixture.detectChanges();
    const region = element(root, `[id="${row.getAttribute('aria-controls')}"]`);
    const fields = Array.from(region.querySelectorAll('.agent-detail-grid > div'));
    expect(fields.filter(field => !field.classList.contains('col-span-full'))
      .map(field => field.querySelector('dt')?.textContent)).toEqual([
      'Tokens', 'Cost', 'Time', 'Status', 'Context', 'Compactions',
    ]);
    expect(element(fields[3], 'dd').textContent).toBe('done');
    const compactions = element(fields[5], 'dd');
    expect(compactions.textContent).toBe('—');
    expect(compactions.classList).toContain('text-base-content-muted');
    expect(compactions.classList).toContain('font-mono');
  });

  it('keeps the composer for a running monitored CLI lane with no tray menu', () => {
    monitored.set([cliMonitor({ inputTokens: 0, outputTokens: 0 })]);
    const fixture = mount([agent({ status: 'running', endedAt: null })]);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[aria-label="Actions for Codex"]')).toBeNull();
    element<HTMLButtonElement>(root, '[data-agent-key="cli:lane-1"]').click();
    fixture.detectChanges();
    element(root, 'ptah-lane-composer');
    const composer = fixture.debugElement.query((node) => node.componentInstance instanceof LaneComposerStubComponent)
      .componentInstance as LaneComposerStubComponent;
    expect(composer.agentId()).toBe('lane-1');
    expect(composer.laneLabel()).toBe('Codex');
    expect(composer.stopped()).toBe(false);
    expect(root.querySelector('ptah-agent-steer-input')).toBeNull();
  });

  it('shows only eligible CLI menu actions and returns keyboard focus on Escape', () => {
    const key = 'cli:lane-1';
    const context = { agentId: 'lane-1', model: null, sessionId: 'owner', entry: {
      id: 'lane-1', name: 'Codex', origin: 'background', status: 'running',
      steerable: false, stoppable: true, canBackground: false,
    } };
    TestBed.overrideProvider(SessionAgentTrayService, { useValue: {
      extrasFor: () => new Map([[key, { tray: context, model: null, tokens: null }]]),
    } });
    const fixture = mount([agent({ status: 'running', endedAt: null })]);
    const root = fixture.nativeElement as HTMLElement;
    const trigger = element<HTMLButtonElement>(root, '[aria-label="Actions for Codex"]');
    const focus = jest.spyOn(trigger, 'focus');
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    const items = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items.map(item => item.textContent?.trim())).toEqual(['Stop']);
    items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('[role="menu"]')).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  // Regression (NG0103): the parent hands a new but equal cache object on each
  // clock tick; the gate must not release and re-acquire the clock for it.
  it('does not re-acquire the clock for a new but equal cache or on a tick', () => {
    const release = jest.fn();
    const acquire = jest.fn(() => release);
    TestBed.overrideProvider(WallClockService, { useValue: { now: () => fixedNow, acquire } });
    const fixture = mount([]);
    const line = () => (fixture.componentInstance as unknown as {
      cacheLine: () => { time: string } | null;
    }).cacheLine()?.time ?? null;
    const cache = { ttl: '5m' as const, lastRequestAt: 10_000, expiresAt: 310_000 };
    fixture.componentRef.setInput('cache', cache);
    fixture.detectChanges();
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire).toHaveBeenCalledWith('second');
    expect(line()).toBe('5:00');

    fixture.componentRef.setInput('cache', { ...cache });
    fixture.detectChanges();
    fixedNow.set(11_000);
    fixture.componentRef.setInput('cache', { ...cache });
    fixture.detectChanges();
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    expect(line()).toBe('4:59');

    fixedNow.set(310_000);
    fixture.detectChanges();
    expect(release).toHaveBeenCalledTimes(1);
    expect(line()).toBe('Expired');
  });

  it('warns of cache expiry at 20% of the TTL left, like the cache tile', () => {
    const fixture = mount([]);
    const line = () => (fixture.componentInstance as unknown as {
      cacheLine: () => { warning: string | null } | null;
    }).cacheLine()?.warning ?? null;
    // fixedNow is 10_000; 10 min of a 1h TTL left is under 20%.
    fixture.componentRef.setInput('cache', { ttl: '1h', lastRequestAt: 0, expiresAt: 610_000 });
    expect(line()).toBe('Cache expires soon');
    fixture.componentRef.setInput('cache', { ttl: '1h', lastRequestAt: 0, expiresAt: 1_010_000 });
    expect(line()).toBeNull();
    fixture.componentRef.setInput('cache', { ttl: '5m', lastRequestAt: 0, expiresAt: 80_000 });
    expect(line()).toBeNull();
    fixture.componentRef.setInput('cache', { ttl: '5m', lastRequestAt: 0, expiresAt: 60_000 });
    expect(line()).toBe('Cache expires soon');
    fixture.componentRef.setInput('cache', { ttl: '5m', lastRequestAt: 0, expiresAt: 10_000 });
    expect(line()).toBe('Cache expired');
  });

  it('keeps a later steer pending when an earlier steer for another row settles', async () => {
    const entry = (id: string, name: string) => ({ agentId: `sdk-${id}`, model: null, sessionId: 'owner', entry: {
      id, name, origin: 'foreground', status: 'running', steerable: true, stoppable: true, canBackground: true,
    } });
    const contexts = new Map([
      ['sub:tool-1', { tray: entry('tool-1', 'Explore'), model: null, tokens: null }],
      ['sub:tool-2', { tray: entry('tool-2', 'Plan'), model: null, tokens: null }],
    ]);
    const settle: ((sent: boolean) => void)[] = [];
    const steer = jest.fn(() => new Promise<boolean>(resolve => settle.push(resolve)));
    TestBed.overrideProvider(SessionAgentTrayService, { useValue: { extrasFor: () => contexts, steer } });
    const fixture = mount([
      agent({ key: 'sub:tool-1', name: 'Explore', kind: 'subagent', status: 'running', endedAt: null }),
      agent({ key: 'sub:tool-2', name: 'Plan', kind: 'subagent', status: 'running', endedAt: null }),
    ]);
    const section = fixture.componentInstance as unknown as {
      onSteer: (key: string, text: string) => Promise<void>;
      pendingSteerId: () => string | null;
    };
    const first = section.onSteer('sub:tool-1', 'A');
    const second = section.onSteer('sub:tool-2', 'B');
    expect(section.pendingSteerId()).toBe('sub:tool-2');
    settle[0](true);
    await first;
    expect(section.pendingSteerId()).toBe('sub:tool-2');
    settle[1](true);
    await second;
    expect(section.pendingSteerId()).toBeNull();
  });

  it('keeps the steer draft available for retry after a failed send', async () => {
    const key = 'sub:tool-1';
    const context = { agentId: 'sdk-1', model: null, sessionId: 'owner', entry: {
      id: 'tool-1', name: 'Explore', origin: 'foreground', status: 'running',
      steerable: true, stoppable: true, canBackground: true,
    } };
    const steer = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    TestBed.overrideProvider(SessionAgentTrayService, { useValue: {
      extrasFor: () => new Map([[key, { tray: context, model: null, tokens: null }]]), steer,
    } });
    const fixture = mount([agent({ key, name: 'Explore', kind: 'subagent', status: 'running', endedAt: null })]);
    const root = fixture.nativeElement as HTMLElement;
    element<HTMLButtonElement>(root, '[aria-label="Actions for Explore"]').click();
    fixture.detectChanges();
    const items = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items.map(item => item.textContent?.trim())).toEqual(['Steer', 'Send to background', 'Stop']);
    items[0].click();
    fixture.detectChanges();
    const input = element<HTMLInputElement>(root, 'ptah-agent-steer-input [aria-label="Steer Explore..."]');
    input.value = 'Continue';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Could not send your message');
    expect(input.value).toBe('Continue');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(steer.mock.calls).toEqual([[context, 'Continue'], [context, 'Continue']]);
    expect(root.querySelector('ptah-agent-steer-input')).toBeNull();
  });

  it('returns permission focus to the row after its request leaves the roster', () => {
    const request: InspectorRequest = {
      requestId: 'permission-1', kind: 'permission', source: 'lane', ownerKey: 'cli:lane-1',
      ownerName: 'Codex', agentId: 'lane-1', toolName: 'Shell', command: 'npm test',
      questionPreview: null, timestamp: 1000,
    };
    const lane = agent();
    const fixture = mount([lane], { requests: { 'cli:lane-1': [request] } });
    const root = fixture.nativeElement as HTMLElement;
    const row = element<HTMLButtonElement>(root, '[data-agent-key="cli:lane-1"]');
    const trigger = element<HTMLButtonElement>(root, '[data-request-button]');
    expect(trigger.getAttribute('aria-label')).toContain('Review permission request from Codex');
    trigger.click();
    fixture.detectChanges();
    rosterState.set({ status: 'ready', data: { rows: [{ agent: lane, requests: [] }], active: 0, finished: 1 } });
    fixture.detectChanges();
    const panel = element(root, 'ptah-inspector-request-panel [role="region"]');
    expect(panel.textContent).toContain('no longer pending');
    const focus = jest.spyOn(row, 'focus');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    TestBed.tick();
    expect(root.querySelector('ptah-inspector-request-panel')).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
