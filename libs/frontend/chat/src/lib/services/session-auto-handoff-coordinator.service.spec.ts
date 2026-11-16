import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import { QueuedFollowUpStore, TabManagerService, TabWorkspacePartitionService } from '@ptah-extension/chat-state';
import type { TabState } from '@ptah-extension/chat-types';
import { SessionId, type SessionBudgetState } from '@ptah-extension/shared';
import { FollowUpQueueService } from './chat-store/follow-up-queue.service';
import { MessageDispatchService } from './chat-store/message-dispatch.service';
import { ChatStore } from './chat.store';
import { SessionAutoHandoffService } from './session-auto-handoff.service';
import { SessionAutoHandoffCoordinatorService } from './session-auto-handoff-coordinator.service';
import { SessionHandoffSkillService, type HandoffSkillProbe } from './session-handoff-skill.service';

const TAB = 'tab-1';
const SESSION = '11111111-1111-4111-8111-111111111111';
const OTHER_SESSION = SessionId.from('22222222-2222-4222-8222-222222222222');
const COMMAND = '/session-handoff This session has used 50.0M tokens.';
const BUDGET: SessionBudgetState = {
  sessionId: SESSION, stage: 'limit', unit: 'tokens', measure: 'tokens',
  used: 50_000_000, limit: 50_000_000, percent: 100, lowerBound: false,
  revision: 12, compactions: 0, autoHandoff: true,
};
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function makeTab(id: string, overrides: Partial<TabState> = {}): TabState {
  return {
    id, title: id, status: 'loaded', messages: [], streamingState: null,
    currentMessageId: null, claudeSessionId: SESSION, sessionBudget: { ...BUDGET },
    ...overrides,
  } as unknown as TabState;
}

describe('SessionAutoHandoffCoordinatorService', () => {
  let active: WritableSignal<TabState[]>;
  let background: TabState[];
  let revision: WritableSignal<number>;
  let permission: WritableSignal<boolean>;
  let store: QueuedFollowUpStore;
  let handoff: SessionAutoHandoffService;
  let send: jest.Mock;
  let probe: jest.Mock;
  let withdraw: jest.Mock;
  let statusCall: jest.Mock;
  let compacting: WritableSignal<boolean>;
  let info: jest.Mock;
  let now: number;
  let probeGate: Promise<void> | null;
  let nextId: number;
  const tab = (id: string) => [...active(), ...background].find((t) => t.id === id) as TabState;
  const patch = (id: string, update: Partial<TabState>) => {
    active.update((tabs) => tabs.map((t) => t.id === id ? { ...t, ...update } : t));
    background = background.map((t) => t.id === id ? { ...t, ...update } : t);
    revision.update((n) => n + 1);
  };
  const run = async () => { TestBed.tick(); await settle(); await settle(); };
  const start = (tabs: TabState[] = [], parked: TabState[] = []) => {
    active.set(tabs); background = parked; revision.update((n) => n + 1);
  };
  const queued = () => store.forTab(TAB)[0];
  const holdProbe = () => {
    let release!: () => void;
    probeGate = new Promise<void>((resolve) => { release = resolve; });
    return release;
  };

  beforeEach(() => {
    active = signal<TabState[]>([]);
    background = [];
    revision = signal(0);
    permission = signal(false);
    compacting = signal(false);
    statusCall = jest.fn(async () => ({ success: true, data: { state: 'absent', successorSessionId: null } }));
    now = 1_000_000;
    nextId = 0;
    probeGate = null;
    info = jest.fn();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    probe = jest.fn(async (): Promise<HandoffSkillProbe> => {
      if (probeGate) await probeGate;
      return 'available';
    });
    send = jest.fn(async (content: string, options: { tabId: string }) => {
      if (tab(options.tabId).status !== 'streaming') return { success: true };
      const clientMessageId = `queued-${++nextId}`;
      store.add({
        clientMessageId, tabId: options.tabId, sessionId: SESSION,
        content, isCommand: true, phase: 'held',
      });
      return { success: true, queued: { clientMessageId, tabId: options.tabId, sessionId: SESSION } };
    });
    withdraw = jest.fn(async (ref: { clientMessageId: string }) => {
      store.settle(ref.clientMessageId, 'withdrawn');
      return true;
    });
    TestBed.configureTestingModule({ providers: [
      SessionAutoHandoffCoordinatorService, SessionAutoHandoffService, QueuedFollowUpStore,
      { provide: TabManagerService, useValue: {
        tabs: () => active(),
        backgroundTabsRevision: () => revision(),
        findTabByIdAcrossWorkspaces: (id: string) => {
          const found = [...active(), ...background].find((t) => t.id === id);
          return found ? { tab: found, workspacePath: '/ws' } : null;
        },
      } },
      { provide: TabWorkspacePartitionService, useValue: {
        findBackgroundTabs: (predicate: (t: TabState) => boolean) => background.filter(predicate),
      } },
      { provide: MessageDispatchService, useValue: {
        sendOrQueueMessage: send, hasPendingPermissionForTab: () => permission(),
      } },
      { provide: SessionHandoffSkillService, useValue: { probe: () => probe() } },
      { provide: FollowUpQueueService, useValue: { withdraw } },
      { provide: LoggingService, useValue: { info, warn: jest.fn() } },
      { provide: ClaudeRpcService, useValue: { call: statusCall } },
      { provide: ChatStore, useValue: { isCompactingForTab: () => compacting() } },
    ] });
    store = TestBed.inject(QueuedFollowUpStore);
    handoff = TestBed.inject(SessionAutoHandoffService);
    TestBed.inject(SessionAutoHandoffCoordinatorService);
  });
  afterEach(() => { TestBed.resetTestingModule(); jest.restoreAllMocks(); });

  it('fires once for a hidden tab at its limit', async () => {
    start([makeTab('shown', { claudeSessionId: OTHER_SESSION, sessionBudget: null }), makeTab(TAB)]);
    await run();
    expect(send).toHaveBeenCalledWith(COMMAND, { tabId: TAB });
    expect(info).toHaveBeenCalledWith('[SessionAutoHandoff]', 'automatic hand-off fired', { sessionId: SESSION, tabId: TAB, delivery: 'sent' });
    statusCall.mockResolvedValue({ success: true, data: { state: 'recorded', successorSessionId: null } });
    patch(TAB, { sessionBudget: { ...BUDGET, revision: 13 } });
    await run();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not send when the durable status is starting', async () => {
    statusCall.mockResolvedValue({ success: true, data: { state: 'starting', successorSessionId: null } });
    start([makeTab(TAB)]);
    await run();
    expect(send).not.toHaveBeenCalled();
    expect(handoff.entry(SESSION)?.state).toBe('pending');
  });

  it('does not send to a tab rebound while the pre-send status is pending', async () => {
    let resolve!: (value: { success: true; data: { state: 'absent' } }) => void;
    statusCall.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    start([makeTab(TAB)]);
    TestBed.tick();
    await settle();
    patch(TAB, { claudeSessionId: OTHER_SESSION });
    resolve({ success: true, data: { state: 'absent' } });
    await run();
    expect(send).not.toHaveBeenCalled();
    expect(handoff.entry(SESSION)).toBeNull();
  });

  it('keeps a delivered entry when unavailable status finishes after delivery', async () => {
    start([makeTab(TAB)]);
    await run();
    let resolve!: (value: { success: true; data: { state: 'unavailable' } }) => void;
    statusCall.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const coordinator = TestBed.inject(SessionAutoHandoffCoordinatorService);
    const pending = coordinator['reconcile'](TAB, SESSION, 1);
    handoff.transition(SESSION, 'delivered');
    resolve({ success: true, data: { state: 'unavailable' } });
    await pending;
    expect(handoff.entry(SESSION)?.state).toBe('delivered');
  });

  it('keeps a delivered entry when a stale status request rejects', async () => {
    start([makeTab(TAB)]);
    handoff.claim(SESSION);
    handoff.recordQueued(SESSION, null);
    let reject!: (error: Error) => void;
    statusCall.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const pending = TestBed.inject(SessionAutoHandoffCoordinatorService)['reconcile'](TAB, SESSION, 1);
    handoff.transition(SESSION, 'delivered');
    reject(new Error('status unavailable'));
    await pending;
    expect(handoff.entry(SESSION)?.state).toBe('delivered');
  });

  it('does not release a delivered entry when streaming begins during status lookup', async () => {
    start([makeTab(TAB)]);
    handoff.claim(SESSION);
    handoff.recordQueued(SESSION, null);
    handoff.transition(SESSION, 'delivered');
    let resolve!: (value: { success: true; data: { state: 'absent' } }) => void;
    statusCall.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = TestBed.inject(SessionAutoHandoffCoordinatorService)['reconcile'](TAB, SESSION, 1);
    patch(TAB, { status: 'streaming' });
    resolve({ success: true, data: { state: 'absent' } });
    await pending;
    expect(handoff.entry(SESSION)?.state).toBe('delivered');
  });

  it('reconciles a delivered turn after polling expires and the stream settles', async () => {
    start([makeTab(TAB, { status: 'streaming' })]);
    handoff.claim(SESSION);
    handoff.recordQueued(SESSION, null);
    handoff.transition(SESSION, 'delivered');
    statusCall.mockResolvedValue({ success: true, data: { state: 'absent' } });
    await TestBed.inject(SessionAutoHandoffCoordinatorService)['reconcile'](TAB, SESSION, 12);
    const callsBeforeSettlement = statusCall.mock.calls.length;
    patch(TAB, { status: 'loaded' });
    await run();
    expect(statusCall.mock.calls.length).toBeGreaterThan(callsBeforeSettlement);
  });

  it('keeps a visible status error and does not send when status is unavailable', async () => {
    statusCall.mockResolvedValue({ success: true, data: { state: 'unavailable', successorSessionId: null } });
    start([makeTab(TAB)]);
    await run();
    expect(send).not.toHaveBeenCalled();
    expect(handoff.entry(SESSION)?.state).toBe('pending');
    expect(handoff.entry(SESSION)?.statusError).toBe(true);
  });

  it('releases a never-sent claim after authoritative absent and retries', async () => {
    statusCall.mockResolvedValue({ success: true, data: { state: 'unavailable' } });
    start([makeTab(TAB)]);
    await run();
    expect(handoff.entry(SESSION)?.attempts).toBe(0);
    statusCall.mockResolvedValue({ success: true, data: { state: 'absent' } });
    await TestBed.inject(SessionAutoHandoffCoordinatorService)['reconcile'](TAB, SESSION, 1);
    await run();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('cleans an unsent pending claim when the confirmed stage falls below limit', async () => {
    statusCall.mockResolvedValue({ success: true, data: { state: 'unavailable' } });
    start([makeTab(TAB)]);
    await run();
    patch(TAB, { sessionBudget: { ...BUDGET, stage: 'handoff' } });
    await run();
    expect(handoff.entry(SESSION)).toBeNull();
  });

  it('resends a direct delivered command after authoritative absent', async () => {
    start([makeTab(TAB)]);
    await run();
    expect(handoff.entry(SESSION)?.clientMessageId).toBeNull();
    await run();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('resumes a claimed deferral after compaction finishes', async () => {
    let resolveStatus!: (value: { success: true; data: { state: 'absent' } }) => void;
    statusCall.mockImplementationOnce(() => new Promise((resolve) => { resolveStatus = resolve; }));
    start([makeTab(TAB)]);
    TestBed.tick();
    await Promise.resolve();
    compacting.set(true);
    resolveStatus({ success: true, data: { state: 'absent' } });
    await run();
    expect(send).not.toHaveBeenCalled();
    compacting.set(false);
    await run();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(['recorded', 'closePending', 'closeCompleted'] as const)('does not resend when status is %s', async (state) => {
    statusCall.mockResolvedValue({ success: true, data: { state, successorSessionId: null } });
    start([makeTab(TAB)]);
    await run();
    expect(send).not.toHaveBeenCalled();
    expect(handoff.entry(SESSION)?.state).toBe(state === 'closeCompleted' ? 'completed' : 'recorded');
  });

  it('defers until compaction ends', async () => {
    compacting.set(true);
    start([makeTab(TAB)]);
    await run();
    expect(send).not.toHaveBeenCalled();
    compacting.set(false);
    await run();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('fails a deferral that remains compacting after ten minutes', async () => {
    jest.useFakeTimers();
    compacting.set(true);
    start([makeTab(TAB)]);
    try {
      TestBed.tick();
      jest.advanceTimersByTime(600_000);
      expect(send).not.toHaveBeenCalled();
      expect(handoff.entry(SESSION)?.state).toBe('failed');
    } finally {
      jest.useRealTimers();
    }
  });

  it('drops a deferred intent when its tab changes session', () => {
    jest.useFakeTimers();
    try {
      compacting.set(true);
      start([makeTab(TAB)]);
      TestBed.tick();
      patch(TAB, { claudeSessionId: OTHER_SESSION, sessionBudget: null });
      TestBed.tick();
      jest.advanceTimersByTime(600_000);
      expect(send).not.toHaveBeenCalled();
      expect(handoff.entry(SESSION)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops after five settled deliveries with authoritative absent status', async () => {
    send.mockImplementation(async (_content: string, options: { tabId: string }) => {
      const clientMessageId = `attempt-${++nextId}`;
      store.add({ clientMessageId, tabId: options.tabId, sessionId: SESSION, content: COMMAND, isCommand: true, phase: 'held' });
      return { success: true, queued: { clientMessageId, tabId: options.tabId, sessionId: SESSION } };
    });
    start([makeTab(TAB)]);
    await run();
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(send).toHaveBeenCalledTimes(attempt);
      store.settle(queued().clientMessageId, 'delivered');
      await run();
    }
    expect(handoff.entry(SESSION)?.state).toBe('failed');
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('fires for a background workspace partition', async () => {
    start([makeTab('shown', { claudeSessionId: OTHER_SESSION, sessionBudget: null })], [makeTab(TAB)]);
    await run();
    expect(send).toHaveBeenCalledWith(COMMAND, { tabId: TAB });
  });

  it('holds the slash hand-off behind a running turn until delivery', async () => {
    start([makeTab(TAB, {
      status: 'streaming',
      sessionBudget: { ...BUDGET },
      liveBudgetStage: 'limit',
    })]);
    await run();
    expect(queued()?.content).toBe(COMMAND);
    expect(queued()?.phase).toBe('held');
    expect(handoff.entry(SESSION)?.queued?.clientMessageId).toBe(queued()?.clientMessageId);
    store.settle(queued().clientMessageId, 'delivered');
    await run();
    expect(handoff.entry(SESSION)?.state).toBe('delivered');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not queue a hand-off based only on a live estimate', async () => {
    start([makeTab(TAB, {
      status: 'streaming',
      sessionBudget: { ...BUDGET, stage: 'handoff', percent: 82 },
      liveBudgetStage: 'limit',
    })]);
    await run();
    expect(queued()).toBeUndefined();
    patch(TAB, { liveBudgetStage: null, sessionBudget: { ...BUDGET, stage: 'handoff', percent: 91, revision: 13 } });
    await run();
    expect(withdraw).not.toHaveBeenCalled();
    expect(queued()).toBeUndefined();
    expect(handoff.entry(SESSION)).toBeNull();
    patch(TAB, { status: 'loaded', sessionBudget: { ...BUDGET, revision: 14 } });
    await run();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(['withdrawn', 'failed'] as const)(
    'releases a queued claim on %s and retries after the gate',
    async (outcome) => {
      start([makeTab(TAB, { status: 'streaming' })]);
      await run();
      store.settle(queued().clientMessageId, outcome);
      expect(handoff.entry(SESSION)).toBeNull();
      now += 5_001;
      patch(TAB, { sessionBudget: { ...BUDGET, revision: 13 } });
      await run();
      expect(send).toHaveBeenCalledTimes(2);
    },
  );

  it('keeps a cancelled claim after withdrawal', async () => {
    start([makeTab(TAB, { status: 'streaming' })]);
    await run();
    handoff.cancel(SESSION);
    store.settle(queued().clientMessageId, 'withdrawn');
    now += 5_001;
    patch(TAB, { sessionBudget: { ...BUDGET, revision: 13 } });
    await run();
    expect(handoff.entry(SESSION)?.state).toBe('cancelled');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('waits for resume and pending permission, then fires', async () => {
    permission.set(true);
    start([makeTab(TAB, { status: 'resuming' })]);
    await run();
    expect(send).not.toHaveBeenCalled();
    patch(TAB, { status: 'loaded' });
    await run();
    expect(send).not.toHaveBeenCalled();
    permission.set(false);
    await run();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['setting off', { ...BUDGET, autoHandoff: false }],
    ['below limit', { ...BUDGET, stage: 'handoff' as const, percent: 82 }],
  ])('does not fire with %s', async (_label, budget) => {
    start([makeTab(TAB, { sessionBudget: budget })]);
    await run();
    expect(send).not.toHaveBeenCalled();
  });

  it('logs each limit skip reason once per session across evaluations', async () => {
    start([makeTab(TAB, { sessionBudget: { ...BUDGET, autoHandoff: false } })]);
    await run();
    patch(TAB, { sessionBudget: { ...BUDGET, autoHandoff: false, revision: 13 } });
    await run();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith('[SessionAutoHandoff]', 'automatic hand-off skipped: auto handoff off', { sessionId: SESSION, tabId: TAB });
    patch(TAB, { status: 'resuming', sessionBudget: { ...BUDGET } });
    await run();
    patch(TAB, { sessionBudget: { ...BUDGET, revision: 14 } });
    await run();
    expect(info).toHaveBeenCalledTimes(2);
    expect(info).toHaveBeenCalledWith('[SessionAutoHandoff]', 'automatic hand-off skipped: pending resume', { sessionId: SESSION, tabId: TAB });
  });

  it('does not retry a confirmed missing skill', async () => {
    probe.mockResolvedValue('missing');
    start([makeTab(TAB)]);
    await run();
    patch(TAB, { sessionBudget: { ...BUDGET, revision: 13 } });
    await run();
    expect(probe).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('retries a transient probe failure after its gate', async () => {
    probe.mockResolvedValueOnce('transient');
    start([makeTab(TAB)]);
    await run();
    now += 5_001;
    patch(TAB, { sessionBudget: { ...BUDGET, revision: 13 } });
    await run();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('releases a failed send claim and retries after its gate', async () => {
    send.mockResolvedValueOnce({ success: false, error: 'offline' });
    start([makeTab(TAB)]);
    await run();
    expect(handoff.entry(SESSION)).toBeNull();
    now += 5_001;
    patch(TAB, { sessionBudget: { ...BUDGET, revision: 13 } });
    await run();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not send into a replaced session after an in-flight probe', async () => {
    const release = holdProbe();
    start([makeTab(TAB)]);
    await run();
    patch(TAB, { claudeSessionId: OTHER_SESSION });
    release();
    await run();
    expect(send).not.toHaveBeenCalled();
    expect(handoff.entry(SESSION)).toBeNull();
  });

  it('still sends if another tab becomes visible during the probe', async () => {
    const release = holdProbe();
    const other = makeTab('shown', { claudeSessionId: OTHER_SESSION, sessionBudget: null });
    start([other, makeTab(TAB)]);
    await run();
    active.set([makeTab(TAB), other]);
    release();
    await run();
    expect(send).toHaveBeenCalledWith(COMMAND, { tabId: TAB });
  });

  it('does not add a second hand-off after manual wrap-up', async () => {
    handoff.markManualWrapUp(SESSION);
    start([makeTab(TAB)]);
    await run();
    expect(send).not.toHaveBeenCalled();
  });
});
