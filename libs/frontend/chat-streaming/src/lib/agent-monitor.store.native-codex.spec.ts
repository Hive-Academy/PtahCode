import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabManagerService } from '@ptah-extension/chat-state';
import { ClaudeRpcService, VSCodeService } from '@ptah-extension/core';
import { createMockRpcService } from '@ptah-extension/core/testing';
import type {
  AgentStartEvent,
  NativeCodexAgentStatusEvent,
  SdkAgentStatusEvent,
} from '@ptah-extension/shared';
import { AgentMonitorStore } from './agent-monitor.store';
import { BackgroundAgentStore } from './background-agent.store';

const parentSessionId = 'parent-thread';
const cardId = 'spawn-card';
const childThreadId = 'child-thread';
const activeTab = signal<{ claudeSessionId?: string } | null>(null);
const tabManager = {
  activeTab,
  activeTabSessionId: computed(() => activeTab()?.claudeSessionId ?? null),
  tabs: signal([]),
};

function nativeStatus(
  cycleOrdinal: number,
  status: NativeCodexAgentStatusEvent['status'],
  kind: NativeCodexAgentStatusEvent['native']['kind'],
  timestamp = cycleOrdinal + 2,
): NativeCodexAgentStatusEvent {
  return {
    id: `status-${cycleOrdinal}-${status}-${timestamp}`,
    eventType: 'agent_status',
    timestamp,
    sessionId: parentSessionId,
    parentToolUseId: cardId,
    agentId: childThreadId,
    status,
    native: {
      provider: 'codex',
      agentThreadId: childThreadId,
      activityId: `activity-${cycleOrdinal}`,
      cycleId: `cycle-${cycleOrdinal}`,
      cycleOrdinal,
      kind,
    },
  };
}

function start(agentType = 'codex', taskId?: string): AgentStartEvent {
  return {
    id: 'start',
    eventType: 'agent_start',
    timestamp: 1,
    sessionId: parentSessionId,
    toolCallId: cardId,
    agentId: childThreadId,
    agentType,
    agentDescription: 'Investigate issue',
    taskId,
  };
}

describe('AgentMonitorStore native Codex lifecycle', () => {
  let store: AgentMonitorStore;

  beforeEach(() => {
    activeTab.set({ claudeSessionId: parentSessionId });
    TestBed.configureTestingModule({
      providers: [
        AgentMonitorStore,
        BackgroundAgentStore,
        { provide: TabManagerService, useValue: tabManager },
        { provide: VSCodeService, useValue: { config: signal({ panelId: '' }), postMessage: jest.fn() } },
        { provide: ClaudeRpcService, useValue: createMockRpcService() },
      ],
    });
    store = TestBed.inject(AgentMonitorStore);
  });

  it('shows the native child in its parent tab and reopens the same card in a later cycle', () => {
    store.onAgentStart(start());
    store.onAgentStatus(nativeStatus(1, 'running', 'started'));
    expect(store.getSubagent(cardId)?.parentSessionId).toBe(parentSessionId);
    expect(store.getSubagent(cardId)?.parentSessionId).toBe(activeTab()?.claudeSessionId);
    expect(store.getSubagent(cardId)?.totalTokens).toBeUndefined();
    store.onAgentStatus(nativeStatus(1, 'completed', 'completed', 4));
    expect(store.getSubagent(cardId)?.status).toBe('completed');
    store.onAgentStatus(nativeStatus(2, 'running', 'interacted', 5));
    expect(store.subagents().size).toBe(1);
    expect(store.getSubagent(cardId)).toMatchObject({
      parentToolUseId: cardId,
      agentId: childThreadId,
      taskDescription: 'Investigate issue',
      status: 'running',
      nativeCycleOrdinal: 2,
    });
    expect(store.getSubagent(cardId)?.completedAt).toBeUndefined();
  });

  it('keeps one card when a second parent turn projects the same child again', () => {
    store.onAgentStart({ ...start(), messageId: 'parent-turn-1' });
    store.onAgentStatus({ ...nativeStatus(1, 'completed', 'completed', 4), messageId: 'parent-turn-1' });
    const original = store.getSubagent(cardId);

    // The Task tool_start is consumed upstream; this is the store's projected agent_start.
    store.onAgentStart({ ...start(), id: 'start-turn-2', messageId: 'parent-turn-2', timestamp: 10 });
    expect(store.getSubagent(cardId)?.status).toBe('completed');
    store.onAgentStatus({ ...nativeStatus(2, 'running', 'interacted', 11), messageId: 'parent-turn-2' });

    expect(store.subagents().size).toBe(1);
    expect(store.getSubagent(cardId)?.parentToolUseId).toBe(original?.parentToolUseId);
    expect(store.getSubagent(cardId)?.agentId).toBe(original?.agentId);
    expect(store.getSubagent(cardId)?.parentSessionId).toBe(parentSessionId);
    expect(store.getSubagent(cardId)?.status).toBe('running');
  });

  it.each(['completed', 'failed'] as const)(
    'keeps a %s card terminal through an unrelated later parent turn',
    (terminal) => {
      store.onAgentStart(start());
      store.onAgentStatus(nativeStatus(1, terminal, 'completed', 4));
      const settled = store.getSubagent(cardId);

      // Parent text and turn completion have no store handler. Other projected
      // agent events in that turn must not change this card without its status.
      store.onAgentStart({
        ...start(),
        id: 'other-agent-start',
        messageId: 'parent-turn-2',
        timestamp: 10,
        toolCallId: 'unrelated-card',
        agentId: 'other-child',
      });
      store.onAgentStatus({
        ...nativeStatus(1, 'running', 'started', 11),
        id: 'other-agent-status',
        messageId: 'parent-turn-2',
        parentToolUseId: 'unrelated-card',
        agentId: 'other-child',
        native: {
          ...nativeStatus(1, 'running', 'started', 11).native,
          agentThreadId: 'other-child',
        },
      });

      expect(store.getSubagent(cardId)).toBe(settled);
      expect(store.getSubagent(cardId)?.status).toBe(terminal);
      expect([...store.subagents().keys()].filter((key) => key === cardId)).toHaveLength(1);
    },
  );

  it('links replayed history to live status without reopening an old cycle', () => {
    // A fresh TestBed store replays the history-shaped start/status pair.
    store.onAgentStart({ ...start(), source: 'history', messageId: 'history-turn' });
    store.onAgentStatus({ ...nativeStatus(3, 'completed', 'completed', 4), messageId: 'history-turn' });
    const replayed = store.getSubagent(cardId);

    store.onAgentStatus({ ...nativeStatus(3, 'running', 'interacted', 12), messageId: 'live-turn' });
    store.onAgentStatus({ ...nativeStatus(2, 'failed', 'completed', 13), messageId: 'live-turn' });

    expect(store.getSubagent(cardId)).toBe(replayed);
    expect(store.subagents().size).toBe(1);
    expect(store.getSubagent(cardId)).toMatchObject({
      parentToolUseId: cardId,
      agentId: childThreadId,
      parentSessionId,
      status: 'completed',
      nativeCycleOrdinal: 3,
    });
  });

  it('keeps a history-settled card without native ordinal terminal on stale live running', () => {
    store.onAgentStart({ ...start(), source: 'history', messageId: 'history-turn' });
    store.onAgentStatus({
      id: 'history-terminal',
      eventType: 'agent_status',
      timestamp: 4,
      sessionId: parentSessionId,
      parentToolUseId: cardId,
      taskId: 'history-task',
      status: 'completed',
    });
    const replayed = store.getSubagent(cardId);
    expect(replayed?.nativeCycleOrdinal).toBeUndefined();

    store.onAgentStatus({ ...nativeStatus(1, 'running', 'interacted', 10), messageId: 'live-turn' });
    expect(store.getSubagent(cardId)).toBe(replayed);
    expect(store.getSubagent(cardId)?.status).toBe('completed');
    expect(store.subagents().size).toBe(1);
  });

  it('ignores equal running, older cycles, and duplicate completion', () => {
    store.onAgentStart(start());
    store.onAgentStatus(nativeStatus(1, 'running', 'started'));
    const running = store.getSubagent(cardId);
    store.onAgentStatus(nativeStatus(1, 'running', 'interacted', 10));
    expect(store.getSubagent(cardId)).toBe(running);
    store.onAgentStatus(nativeStatus(1, 'completed', 'completed', 11));
    const completed = store.getSubagent(cardId);
    store.onAgentStatus(nativeStatus(1, 'completed', 'completed', 20));
    expect(store.getSubagent(cardId)).toBe(completed);
    store.onAgentStatus(nativeStatus(0, 'failed', 'completed', 21));
    expect(store.getSubagent(cardId)).toBe(completed);
  });

  it('lets a same-cycle failure override completion but rejects later completion and stale failure', () => {
    store.onAgentStart(start());
    store.onAgentStatus(nativeStatus(1, 'completed', 'completed', 4));
    store.onAgentStatus({ ...nativeStatus(1, 'failed', 'completed', 5), errorMessage: 'turn failed' });
    expect(store.getSubagent(cardId)?.status).toBe('failed');
    store.onAgentStatus(nativeStatus(1, 'completed', 'completed', 6));
    expect(store.getSubagent(cardId)?.status).toBe('failed');
    store.onAgentStatus(nativeStatus(2, 'running', 'interacted', 7));
    store.onAgentStatus(nativeStatus(1, 'failed', 'completed', 8));
    expect(store.getSubagent(cardId)?.status).toBe('running');
    expect(store.getSubagent(cardId)?.errorMessage).toBeUndefined();
  });

  it('applies an interruption within the same cycle and ignores its duplicate', () => {
    store.onAgentStart(start());
    store.onAgentStatus(nativeStatus(1, 'running', 'started'));
    store.onAgentStatus(nativeStatus(1, 'paused', 'interrupted', 4));
    const paused = store.getSubagent(cardId);
    expect(paused?.status).toBe('paused');
    store.onAgentStatus(nativeStatus(1, 'paused', 'interrupted', 5));
    expect(store.getSubagent(cardId)).toBe(paused);
  });

  it('keeps Claude and SDK status events on the existing terminal rules', () => {
    store.onAgentStart(start('Explore', 'sdk-task'));
    const sdk = (status: SdkAgentStatusEvent['status'], timestamp: number): SdkAgentStatusEvent => ({
      id: `sdk-${timestamp}`,
      eventType: 'agent_status',
      timestamp,
      sessionId: parentSessionId,
      parentToolUseId: cardId,
      taskId: 'sdk-task',
      status,
    });
    store.onAgentStatus(sdk('completed', 4));
    store.onAgentStatus(sdk('running', 5));
    expect(store.getSubagent(cardId)?.status).toBe('completed');
    expect(store.getSubagent(cardId)?.nativeCycleId).toBeUndefined();
    store.onAgentStatus(nativeStatus(2, 'running', 'interacted', 6));
    expect(store.getSubagent(cardId)?.status).toBe('completed');
  });

  it('does not route an SDK event for a Codex card through native cycle handling', () => {
    store.onAgentStart(start());
    store.onAgentStatus(nativeStatus(1, 'completed', 'completed', 4));
    store.onAgentStatus({
      id: 'sdk-status',
      eventType: 'agent_status',
      timestamp: 5,
      sessionId: parentSessionId,
      parentToolUseId: cardId,
      taskId: 'sdk-task',
      status: 'running',
    });
    expect(store.getSubagent(cardId)?.status).toBe('completed');
    expect(store.getSubagent(cardId)?.nativeCycleOrdinal).toBe(1);
  });
});

// @ts-expect-error SDK status events require a taskId.
const sdkWithoutTask: SdkAgentStatusEvent = { eventType: 'agent_status', id: 'x', timestamp: 1, parentToolUseId: 'x', status: 'running' };
// @ts-expect-error Native status events require native metadata and agentId.
const nativeWithoutMetadata: NativeCodexAgentStatusEvent = { eventType: 'agent_status', id: 'x', timestamp: 1, parentToolUseId: 'x', status: 'running' };
void sdkWithoutTask;
void nativeWithoutMetadata;
