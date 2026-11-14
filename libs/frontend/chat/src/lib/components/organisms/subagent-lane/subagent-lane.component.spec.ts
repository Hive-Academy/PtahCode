import { ChatStore } from '../../../services/chat.store';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  AgentMonitorStore,
  SubagentExecutionStore,
  type SubagentExecutionEntry,
  type SubagentRecord,
} from '@ptah-extension/chat-streaming';
import {
  ClaudeRpcService,
  FILE_LINK_OPENER,
  ModelStateService,
  SURFACE_ACTIVE,
  VSCodeService,
  ClockService,
} from '@ptah-extension/core';
import { createMockRpcService } from '@ptah-extension/core/testing';
import { PTAH_CLOCK } from '@ptah-extension/ui';
import { provideMarkdown } from 'ngx-markdown';
import {
  createExecutionNode,
  getPricingMap,
  resetPricingMapForTesting,
  updatePricingMap,
} from '@ptah-extension/shared';
import type { TrayAgentContext } from '../../../services/session-agents/session-agent-tray';
import { SessionAgentTrayService } from '../../../services/session-agents/session-agent-tray.service';
import { ChatAgentFeedbackSender } from '../../../services/agent-feedback/chat-agent-feedback-sender.service';
import { TabManagerService } from '@ptah-extension/chat-state';
import { ArtifactStore } from '../../../services/artifact.store';
import { SubagentLaneComponent } from './subagent-lane.component';

describe('SubagentLaneComponent', () => {
  const contexts = signal<ReadonlyMap<string, TrayAgentContext>>(new Map());
  const rpcError =
    signal<ReturnType<AgentMonitorStore['subagentRpcError']>>(null);
  const clockNow = signal(5_000);
  const steer = jest.fn<Promise<boolean>, [TrayAgentContext, string]>();
  const stop = jest.fn<Promise<void>, [string, string]>();
  const sendToBackground = jest.fn<Promise<boolean>, [string, string]>();
  const entries = signal<ReadonlyMap<string, SubagentExecutionEntry>>(
    new Map(),
  );
  const treeFor = jest.fn(() => []);
  const retain = jest.fn();
  const release = jest.fn();
  const syncRecord = jest.fn();
  const loadSubagentCacheInfo = jest
    .fn<Promise<void>, [string]>()
    .mockResolvedValue(undefined);
  const sendFeedback = jest.fn().mockResolvedValue({ sent: true });
  const ensureHistory = jest
    .fn<Promise<void>, [string]>()
    .mockResolvedValue(undefined);
  const refreshLiveHistory = jest
    .fn<Promise<void>, [string]>()
    .mockResolvedValue(undefined);
  function setEntry(changes: Partial<SubagentExecutionEntry> = {}): void {
    entries.set(
      new Map([
        [
          'tool-1',
          {
            state: null,
            finalized: [],
            sessionId: 'session-123456',
            live: true,
            truncated: false,
            spilled: false,
            clipped: 0,
            history: 'idle',
            generation: 0,
            lastEventAt: 0,
            refs: 0,
            idAlias: new Map(),
            revision: 0,
            ...changes,
          },
        ],
      ]),
    );
  }
  const base: SubagentRecord = {
    parentToolUseId: 'tool-1',
    parentSessionId: 'session-123456',
    teammateName: 'Explore',
    status: 'running',
    startedAt: 1000,
    description: 'Inspect files',
    toolUses: 4,
  };

  function context(
    flags: {
      canBackground?: boolean;
      stoppable?: boolean;
      steerable?: boolean;
    } = {},
  ): TrayAgentContext {
    return {
      entry: {
        id: 'tool-1',
        name: 'Explore',
        origin: 'foreground',
        status: 'running',
        canBackground: flags.canBackground ?? false,
        stoppable: flags.stoppable ?? false,
        steerable: flags.steerable ?? false,
      },
      taskId: 'task-1',
      sessionId: 'session-123456',
      model: null,
    };
  }

  function setup(
    record: SubagentRecord = base,
  ): ComponentFixture<SubagentLaneComponent> {
    const fixture = TestBed.createComponent(SubagentLaneComponent);
    fixture.componentRef.setInput('record', record);
    fixture.componentRef.setInput('sessionId', 'session-123456');
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    contexts.set(new Map());
    rpcError.set(null);
    clockNow.set(5_000);
    steer.mockReset();
    stop.mockClear();
    sendToBackground.mockClear();
    treeFor.mockClear();
    retain.mockClear();
    release.mockClear();
    syncRecord.mockClear();
    ensureHistory.mockClear();
    refreshLiveHistory.mockClear();
    loadSubagentCacheInfo.mockClear();
    sendFeedback.mockClear();
    setEntry();
    stop.mockResolvedValue(undefined);
    sendToBackground.mockResolvedValue(true);
    TestBed.configureTestingModule({
      imports: [SubagentLaneComponent],
      providers: [
        {
          provide: ChatStore,
          useValue: {
            getPermissionForTool: () => null,
            handlePermissionResponse: jest.fn(),
          },
        },
        { provide: VSCodeService, useValue: { isElectron: false } },
        {
          provide: ClockService,
          useValue: { now: clockNow, acquire: () => () => undefined },
        },
        {
          provide: PTAH_CLOCK,
          useValue: { now: clockNow, acquire: () => () => undefined },
        },
        { provide: SURFACE_ACTIVE, useValue: signal(true) },
        provideMarkdown(),
        {
          provide: AgentMonitorStore,
          useValue: {
            subagentRpcError: rpcError,
            stopAgent: stop,
            backgroundAgent: sendToBackground,
            loadSubagentCacheInfo,
          },
        },
        {
          provide: SubagentExecutionStore,
          useValue: {
            entries,
            entryFor: (key: string) => entries().get(key),
            revisionFor: () => entries(),
            treeFor,
            retain,
            release,
            syncRecord,
            ensureHistory,
            refreshLiveHistory,
          },
        },
        {
          provide: SessionAgentTrayService,
          useValue: { contextsFor: () => contexts(), steer },
        },
        {
          provide: ChatAgentFeedbackSender,
          useValue: { send: sendFeedback },
        },
        {
          provide: ModelStateService,
          useValue: { availableModels: signal([]) },
        },
        // A tool node renders a real tool row, which reads these two.
        {
          provide: ArtifactStore,
          useValue: { recordById: () => null },
        },
        { provide: TabManagerService, useValue: { activeTabId: signal(null) } },
        { provide: ClaudeRpcService, useValue: createMockRpcService() },
        { provide: FILE_LINK_OPENER, useValue: { open: jest.fn() } },
      ],
    });
  });

  it('uses the shared header and an always-visible stats bar', () => {
    const previousPricing = getPricingMap();
    // This tests stats presentation, not unavailable pricing.
    updatePricingMap({
      'claude-sonnet': { inputCostPerToken: 3e-6, outputCostPerToken: 15e-6 },
    });
    try {
      const fixture = setup({
        ...base,
        taskDescription: 'Map the repository',
        description: 'Reading files',
        totalTokens: 1200,
        usage: { input: 1000, output: 200, model: 'claude-sonnet' },
      });
      const root: HTMLElement = fixture.nativeElement;
      const meta = () =>
        root.querySelector('[data-test="execution-header-meta"]')?.textContent;
      // No tree yet, so no bubble: the control row keeps the record's count.
      expect(meta()).toContain('4 tools');
      // Tokens moved from the header meta into the stats bar.
      expect(meta()).not.toContain('tokens');
      // Stats chips sit in the control row, in the chat column.
      expect(
        root
          .querySelector('[data-test="execution-header-row"]')
          ?.contains(root.querySelector('ptah-agent-lane-stats')),
      ).toBe(true);
      expect(
        root.querySelector('ptah-execution-header')?.getAttribute('data-kind'),
      ).toBe('subagent');
      expect(root.textContent).toContain('Starting agent');
      expect(
        root.querySelector('[data-test="execution-header-details"]'),
      ).toBeNull();
      const stats = root.querySelector('ptah-agent-lane-stats');
      expect(
        stats?.querySelector('[data-testid="lane-stats-tokens"]')?.textContent,
      ).toContain('1.2k');
      expect(
        stats?.querySelector('[data-testid="lane-stats-model"]')?.textContent,
      ).toContain('claude-sonnet');
    } finally {
      resetPricingMapForTesting();
      updatePricingMap(previousPricing);
    }
  });

  // Positioned rows in a streaming bubble must be clipped by the lane
  // scroller, not by the canvas lane host (second scrollbar regression).
  it('makes the lane scroller the containing block of its rows', () => {
    const fixture = setup();
    const scroller = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="lane-scroll"]',
    );
    expect(scroller?.classList).toContain('relative');
    expect(scroller?.classList).toContain('overflow-y-auto');
  });

  it('lets flat lane rows flow through the host scroller', () => {
    const fixture = setup();
    fixture.componentRef.setInput('presentation', 'flat');
    fixture.detectChanges();
    const body = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="lane-scroll"]',
    );
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'ptah-execution-header',
      ),
    ).toBeNull();
    expect(body?.classList).not.toContain('overflow-y-auto');
    expect(body?.classList).toContain('flex-none');
    const composer = (fixture.nativeElement as HTMLElement).querySelector(
      'ptah-subagent-lane-composer',
    );
    expect(composer?.classList).toContain('sticky');
    expect(composer?.classList).toContain('mt-auto');
    expect(composer?.classList).toContain('bottom-0');
    expect(composer?.classList).toContain('bg-base-100');
  });

  // The control row (stats, meta, actions) renders inline in the
  // lane, above its transcript, in every host.
  it('renders its control row inside the lane', () => {
    const fixture = setup();
    const lane: HTMLElement = fixture.nativeElement;
    const header = lane.querySelector('ptah-execution-header');
    expect(header?.parentElement).toBe(lane);
    expect(lane.firstElementChild).toBe(header);
    const row = header!.querySelector('[data-test="execution-header-row"]');
    expect(row?.querySelector('ptah-agent-lane-stats')).not.toBeNull();
    expect(
      row?.querySelector('[data-test="execution-header-details"]'),
    ).toBeNull();
  });

  it('leaves the tool count to the transcript bubble once the tree has a tool', () => {
    const text = createExecutionNode({
      id: 'msg-1-text-0',
      type: 'text',
      status: 'complete',
      content: 'Reading files',
    });
    const tool = createExecutionNode({
      id: 'msg-1-tool-1',
      type: 'tool',
      status: 'complete',
      content: null,
      toolName: 'Read',
      toolInput: { file_path: 'C:\\ws\\a.ts' },
    });
    treeFor.mockImplementation(() => [text, tool] as never[]);
    try {
      const fixture = setup({ ...base, status: 'background' });
      const root: HTMLElement = fixture.nativeElement;
      const header = root.querySelector('ptah-execution-header')!;
      expect(header.querySelector('ptah-turn-disclosure-row')).toBeNull();
      // The header keeps its run mode under its own hook, never the bubble's.
      expect(
        header.querySelector('[data-test="execution-header-meta"]')
          ?.textContent,
      ).toBe('Background');
      expect(
        header.querySelector('[data-test="turn-disclosure-meta"]'),
      ).toBeNull();
    } finally {
      treeFor.mockImplementation(() => []);
    }
  });

  it('keeps the record tool count while the tree has text only', () => {
    const text = createExecutionNode({
      id: 'msg-1-text-0',
      type: 'text',
      status: 'complete',
      content: 'Reading files',
    });
    treeFor.mockImplementation(() => [text] as never[]);
    try {
      const fixture = setup({ ...base, status: 'background' });
      const root: HTMLElement = fixture.nativeElement;
      // No bubble shows a count for a text-only turn, so the header does,
      // exactly once.
      expect(
        root.querySelector('[data-test="execution-header-meta"]')?.textContent,
      ).toBe('4 tools · Background');
      expect(root.textContent?.match(/4 tools/g)).toHaveLength(1);
    } finally {
      treeFor.mockImplementation(() => []);
    }
  });

  it('loads the cache info once per agent key', () => {
    const fixture = setup();
    fixture.componentRef.setInput('record', { ...base, toolUses: 5 });
    fixture.detectChanges();
    expect(loadSubagentCacheInfo).toHaveBeenCalledTimes(1);
    expect(loadSubagentCacheInfo).toHaveBeenCalledWith('tool-1');
    fixture.componentRef.setInput('record', {
      ...base,
      parentToolUseId: 'tool-2',
    });
    fixture.detectChanges();
    expect(loadSubagentCacheInfo).toHaveBeenCalledTimes(2);
    expect(loadSubagentCacheInfo).toHaveBeenLastCalledWith('tool-2');
  });

  it.each(['running', 'completed'] as const)(
    'shows the composer for a %s agent',
    (status) => {
      // A live agent takes input only through a steerable tray context.
      if (status === 'running') {
        contexts.set(new Map([['tool-1', context({ steerable: true })]]));
      }
      const fixture = setup({ ...base, status });
      const composer = fixture.nativeElement.querySelector(
        'ptah-subagent-lane-composer',
      );
      expect(
        composer?.querySelector('ptah-agent-steer-input textarea'),
      ).not.toBeNull();
    },
  );

  it('offers only the actions allowed by the tray context', () => {
    const ctx = context({
      canBackground: true,
      stoppable: true,
      steerable: true,
    });
    contexts.set(new Map([['tool-1', ctx]]));
    const fixture = setup();
    const root: HTMLElement = fixture.nativeElement;
    root
      .querySelector<HTMLButtonElement>(
        '[aria-label="Send Explore to background"]',
      )!
      .click();
    root
      .querySelector<HTMLButtonElement>('[aria-label="Stop Explore"]')!
      .click();
    fixture.detectChanges();
    expect(sendToBackground).toHaveBeenCalledWith('session-123456', 'tool-1');
    expect(stop).toHaveBeenCalledWith('task-1', 'session-123456');
    expect(root.querySelector('[aria-label="Message Explore"]')).toBeNull();
    contexts.set(new Map([['tool-1', context({ steerable: true })]]));
    fixture.detectChanges();
    expect(root.querySelector('[aria-label="Stop Explore"]')).toBeNull();
    expect(
      root.querySelector('[aria-label="Send Explore to background"]'),
    ).toBeNull();
  });

  it('shows native path and status with disabled controls and structured failure', () => {
    contexts.set(new Map([['tool-1', context({ steerable: true, stoppable: true })]]));
    const fixture = setup({ ...base, agentType: 'codex', taskId: undefined,
      nativeCycleId: 'thread-1:1', nativeCycleOrdinal: 1,
      description: 'native_vortex', teammateName: undefined });
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="native-codex-lane-status"]')?.textContent).toContain('native_vortex');
    expect(root.querySelector('[data-testid="native-codex-lane-status"]')?.textContent).toContain('running');
    const buttons = root.querySelectorAll<HTMLButtonElement>('[data-testid="native-codex-controls"] button');
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => { expect(button.disabled).toBe(true); button.click(); });
    expect(root.textContent).toContain('Native Codex subagents do not support send or stop from Ptah yet.');
    expect(root.querySelector('ptah-agent-steer-input')).toBeNull();
    expect(steer).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    fixture.componentRef.setInput('record', { ...base, agentType: 'codex', taskId: undefined,
      nativeCycleId: 'thread-1:1', nativeCycleOrdinal: 1,
      description: 'native_vortex', teammateName: undefined, status: 'failed', errorMessage: 'child thread failed' });
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="native-codex-lane-status"]')?.textContent).toContain('child thread failed');
  });

  it('keeps v1 Codex send and stop controls enabled without a native reason', async () => {
    contexts.set(new Map([['tool-1', context({ steerable: true, stoppable: true })]]));
    const fixture = setup({ ...base, agentType: 'codex', taskId: undefined });
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="native-codex-controls"]')).toBeNull();
    expect(root.textContent).not.toContain('Native Codex subagents do not support send or stop from Ptah yet.');
    expect(root.querySelector('ptah-agent-steer-input textarea')).not.toBeNull();
    const stopButton = root.querySelector<HTMLButtonElement>('[aria-label="Stop Explore"]');
    expect(stopButton?.disabled).toBe(false);
    stopButton?.click();
    await Promise.resolve();
    expect(stop).toHaveBeenCalledWith('task-1', 'session-123456');
  });

  it('shows no actions without tray context and no output when finished', () => {
    const fixture = setup({ ...base, status: 'completed', totalTokens: 0 });
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[executionHeaderActions]')).toBeNull();
    expect(
      root.querySelector('[data-test="execution-header-row"]')?.textContent,
    ).not.toContain('tokens');
    expect(root.textContent).toContain('No output recorded');
  });

  it('shows the finished record summary when the parent tree is unavailable', async () => {
    const fixture = setup({
      ...base,
      status: 'completed',
      latestSummary: 'Investigation finished',
    });
    await fixture.whenStable();
    // ngx-markdown parsing is not tracked by zoneless stability.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.chat-msg-slot .cs-answer'),
    ).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'Investigation finished',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'No output recorded',
    );
  });

  it('retains the store tree once and releases it on destroy', () => {
    const fixture = setup();
    expect(treeFor).toHaveBeenCalledWith('tool-1');
    expect(retain).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith('tool-1');
  });

  it('does not release an active history load when the record object changes', () => {
    const fixture = setup();
    setEntry({ history: 'loading' });
    fixture.componentRef.setInput('record', { ...base, toolUses: 5 });
    fixture.detectChanges();
    expect(retain).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
  });

  it.each([
    ['loading', 'Loading saved output'],
    ['error', 'Could not load saved output'],
    ['not-found', 'No saved output for this agent'],
    ['unresolved', 'Saved output for this agent could not be linked'],
    ['loaded', 'No output recorded'],
  ] as const)('shows %s history state', (history, label) => {
    setEntry({ live: false, history });
    const fixture = setup({ ...base, status: 'completed' });
    expect(fixture.nativeElement.textContent).toContain(label);
    if (history === 'error' || history === 'unresolved') {
      (
        fixture.nativeElement.querySelector(
          'button.btn-link',
        ) as HTMLButtonElement
      ).click();
      expect(ensureHistory).toHaveBeenCalledWith('tool-1');
    }
  });

  it('loads idle saved output once and offers full output for trimmed trees', () => {
    setEntry({ live: false, history: 'idle', truncated: true, clipped: 1 });
    const fixture = setup({ ...base, status: 'completed' });
    expect(ensureHistory).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain(
      'Earlier output trimmed',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Some long outputs were shortened',
    );
    (
      fixture.nativeElement.querySelector(
        'button.btn-link',
      ) as HTMLButtonElement
    ).click();
    expect(ensureHistory).toHaveBeenCalledTimes(2);
  });

  it('backfills a live background agent from its transcript while shown', () => {
    const fixture = setup({ ...base, status: 'background' });
    // A live entry never takes the one-shot load: before this fix the lane
    // requested nothing and stayed on "Starting agent" for the whole run.
    expect(ensureHistory).not.toHaveBeenCalled();
    expect(refreshLiveHistory).toHaveBeenCalledTimes(1);
    expect(refreshLiveHistory).toHaveBeenCalledWith('tool-1');
    clockNow.set(9_000);
    fixture.detectChanges();
    expect(refreshLiveHistory).toHaveBeenCalledTimes(1);
    clockNow.set(10_000);
    fixture.detectChanges();
    expect(refreshLiveHistory).toHaveBeenCalledTimes(2);
    fixture.destroy();
    clockNow.set(30_000);
    TestBed.flushEffects();
    expect(refreshLiveHistory).toHaveBeenCalledTimes(2);
  });

  it('stops refreshing when the agent finishes', () => {
    const fixture = setup();
    expect(refreshLiveHistory).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('record', { ...base, status: 'completed' });
    fixture.detectChanges();
    clockNow.set(25_000);
    fixture.detectChanges();
    expect(refreshLiveHistory).toHaveBeenCalledTimes(1);
  });

  it('offers full output when the live tree was spilled', () => {
    setEntry({ live: false, history: 'idle', spilled: true });
    const fixture = setup({ ...base, status: 'completed' });
    expect(fixture.nativeElement.textContent).toContain(
      'Earlier output trimmed',
    );
    (
      fixture.nativeElement.querySelector(
        'button.btn-link',
      ) as HTMLButtonElement
    ).click();
    expect(ensureHistory).toHaveBeenCalledTimes(2);
  });

  it('disables Stop and Background during their requests and ignores repeated clicks', async () => {
    let finishStop!: () => void;
    let finishBackground!: (value: boolean) => void;
    stop.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishStop = resolve;
        }),
    );
    sendToBackground.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finishBackground = resolve;
        }),
    );
    contexts.set(
      new Map([['tool-1', context({ stoppable: true, canBackground: true })]]),
    );
    const fixture = setup();
    const root: HTMLElement = fixture.nativeElement;
    const stopButton = root.querySelector<HTMLButtonElement>(
      '[aria-label="Stop Explore"]',
    )!;
    const backgroundButton = root.querySelector<HTMLButtonElement>(
      '[aria-label="Send Explore to background"]',
    )!;
    stopButton.click();
    backgroundButton.click();
    fixture.detectChanges();
    expect(stopButton.disabled).toBe(true);
    expect(backgroundButton.disabled).toBe(true);
    stopButton.click();
    backgroundButton.click();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(sendToBackground).toHaveBeenCalledTimes(1);
    finishStop();
    finishBackground(true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(stopButton.disabled).toBe(false);
    expect(backgroundButton.disabled).toBe(false);
  });

  it('shows background state and the latest progress in a live row', () => {
    const fixture = setup({
      ...base,
      status: 'background',
      latestSummary: 'Reviewing tests',
    });
    const root = fixture.nativeElement as HTMLElement;
    expect(
      root.querySelector('[data-test="execution-header-meta"]')?.textContent,
    ).toContain('Background');
    expect(
      root.querySelector('[data-test="execution-header-peek"]')?.textContent,
    ).toBe('Reviewing tests');
  });

  it('keeps the draft after a failed steer and clears it after success', async () => {
    contexts.set(new Map([['tool-1', context({ steerable: true })]]));
    steer.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const fixture = setup();
    const root: HTMLElement = fixture.nativeElement;
    const field = root.querySelector<HTMLTextAreaElement>(
      'ptah-agent-steer-input textarea',
    )!;
    field.value = 'Check tests';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    root
      .querySelector<HTMLButtonElement>('[aria-label="Send steer message"]')!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(steer).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1' }),
      'Check tests',
    );
    expect(root.textContent).toContain('Could not send your message');
    expect(
      root.querySelector<HTMLTextAreaElement>('ptah-agent-steer-input textarea')
        ?.value,
    ).toBe('Check tests');
    root
      .querySelector<HTMLButtonElement>('[aria-label="Send steer message"]')!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      root.querySelector<HTMLTextAreaElement>('ptah-agent-steer-input textarea')
        ?.value,
    ).toBe('');
    expect(root.textContent).not.toContain('Could not send your message');
  });

  it('shows only this agent’s RPC error', () => {
    const fixture = setup();
    rpcError.set({
      parentToolUseId: 'other',
      method: 'subagent:stop',
      message: 'Other failed',
      timestamp: 1,
    });
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="subagent-command-error"]',
      ),
    ).toBeNull();
    rpcError.set({
      parentToolUseId: 'tool-1',
      method: 'subagent:stop',
      message: 'Stop failed',
      timestamp: 2,
    });
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="subagent-command-error"]',
      )?.textContent,
    ).toContain('Stop failed');
  });
  it('hides passive stats while keeping Stop, Background', () => {
    contexts.set(
      new Map([['tool-1', context({ canBackground: true, stoppable: true })]]),
    );
    const fixture = setup();
    fixture.componentRef.setInput('showStats', false);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('ptah-agent-lane-stats')).toBeNull();
    expect(root.querySelector('[aria-label="Stop Explore"]')).not.toBeNull();
    expect(
      root.querySelector('[aria-label="Send Explore to background"]'),
    ).not.toBeNull();
    expect(
      root.querySelector('[data-test="execution-header-details"]'),
    ).toBeNull();
  });
});
