import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  AgentMonitorStore,
  BackgroundAgentStore,
  BatchedUpdateService,
  EventDeduplicationService,
  ExecutionTreeBuilderService,
  HistoryMessageBuilder,
  SessionManager,
  StreamingAccumulatorCore,
  StreamingHandlerService,
  SubagentExecutionStore,
} from '@ptah-extension/chat-streaming';
import { ClaudeRpcService, LoggingService, VSCodeService } from '@ptah-extension/core';
import type { FlatStreamEventUnion, SessionId } from '@ptah-extension/shared';
import { SessionHistoryReplayer } from './session-history-replayer.service';

const SESSION = 'session-native' as SessionId;
const TAB = 'tab-native';

function completedChildEvents(): FlatStreamEventUnion[] {
  return [
    {
      id: JSON.stringify(['thread', 'turn', 'item', 'agent_start', 'item/started', 0]),
      eventType: 'agent_start', source: 'history', timestamp: 1,
      sessionId: SESSION, messageId: 'parent', parentToolUseId: 'spawn-1',
      toolCallId: 'spawn-1', agentId: 'child-1', agentType: 'codex',
    },
    {
      id: 'child-start', eventType: 'message_start', source: 'history',
      timestamp: 2, sessionId: SESSION, messageId: 'child-message',
      parentToolUseId: 'spawn-1', role: 'assistant',
    },
    {
      id: 'child-answer', eventType: 'text_delta', source: 'history',
      timestamp: 3, sessionId: SESSION, messageId: 'child-message',
      parentToolUseId: 'spawn-1', blockIndex: 0, delta: 'PINEAPPLE',
    },
    {
      id: 'child-done', eventType: 'message_complete', source: 'history',
      timestamp: 4, sessionId: SESSION, messageId: 'child-message',
      parentToolUseId: 'spawn-1',
    },
    {
      id: 'spawn-result', eventType: 'tool_result', source: 'history',
      timestamp: 5, sessionId: SESSION, messageId: 'parent',
      toolCallId: 'spawn-1', output: 'PINEAPPLE', isError: false,
    },
  ];
}

function nativeChildEvents(terminal = true): FlatStreamEventUnion[] {
  const events: FlatStreamEventUnion[] = [
    {
      id: JSON.stringify(['thread', 'turn', 'item', 'agent_start', 'item/started', 0]),
      eventType: 'agent_start', source: 'history', timestamp: 1,
      sessionId: SESSION, messageId: 'parent', parentToolUseId: 'spawn-1',
      toolCallId: 'spawn-1', agentId: 'child-1', agentType: 'codex',
    },
    {
      id: 'native-start-1', eventType: 'agent_status', source: 'history',
      timestamp: 2, sessionId: SESSION, parentToolUseId: 'spawn-1',
      agentId: 'child-1', status: 'running',
      native: { provider: 'codex', agentThreadId: 'child-1', activityId: 'activity-1',
        cycleId: 'cycle-1', cycleOrdinal: 1, kind: 'started' },
    },
  ];
  if (!terminal) return events;
  for (let cycle = 1; cycle <= 2; cycle++) {
    events.push({
      id: `child-message-${cycle}-start`, eventType: 'message_start', source: 'history',
      timestamp: events.length + 2, sessionId: SESSION, messageId: `child-message-${cycle}`,
      parentToolUseId: 'spawn-1', role: 'assistant',
    });
    for (let tool = 1; tool <= (cycle === 1 ? 3 : 1); tool++) {
      const toolCallId = `child-tool-${cycle}-${tool}`;
      const messageId = `child-message-${cycle}`;
      events.push({
        id: `${toolCallId}-start`, eventType: 'tool_start', source: 'history',
        timestamp: events.length + 2, sessionId: SESSION, messageId,
        parentToolUseId: 'spawn-1', toolCallId, toolName: 'Bash', isTaskTool: false,
      });
      events.push({
        id: `${toolCallId}-result`, eventType: 'tool_result', source: 'history',
        timestamp: events.length + 2, sessionId: SESSION, messageId,
        parentToolUseId: 'spawn-1', toolCallId, output: 'ok', isError: false,
      });
    }
    events.push({
      id: `native-complete-${cycle}`, eventType: 'agent_status', source: 'history',
      timestamp: events.length + 2, sessionId: SESSION, parentToolUseId: 'spawn-1',
      agentId: 'child-1', status: 'completed',
      native: { provider: 'codex', agentThreadId: 'child-1', activityId: `activity-${cycle}`,
        cycleId: `cycle-${cycle}`, cycleOrdinal: cycle, kind: 'completed' },
    });
    if (cycle === 1) events.push({
      id: 'native-start-2', eventType: 'agent_status', source: 'history',
      timestamp: events.length + 2, sessionId: SESSION, parentToolUseId: 'spawn-1',
      agentId: 'child-1', status: 'running',
      native: { provider: 'codex', agentThreadId: 'child-1', activityId: 'activity-2',
        cycleId: 'cycle-2', cycleOrdinal: 2, kind: 'interacted' },
    });
  }
  return events;
}

describe('SessionHistoryReplayer native child recovery with real stores', () => {
  const activeTab = signal<{ claudeSessionId: SessionId } | null>({
    claudeSessionId: SESSION,
  });
  const builder = {
    buildTree: jest.fn().mockReturnValue([
      { id: 'child-message', content: 'PINEAPPLE', children: [] },
    ]),
    clearCache: jest.fn(),
  };

  beforeEach(() => {
    activeTab.set({ claudeSessionId: SESSION });
    builder.buildTree.mockClear();
    TestBed.configureTestingModule({
      providers: [
        SessionHistoryReplayer,
        AgentMonitorStore,
        BackgroundAgentStore,
        SubagentExecutionStore,
        StreamingAccumulatorCore,
        EventDeduplicationService,
        { provide: HistoryMessageBuilder, useValue: {} },
        { provide: StreamingHandlerService, useValue: {} },
        { provide: BatchedUpdateService, useValue: {} },
        { provide: ExecutionTreeBuilderService, useValue: builder },
        {
          provide: SessionManager,
          useValue: { registerAgent: jest.fn().mockReturnValue([]), setStatus: jest.fn() },
        },
        {
          provide: TabManagerService,
          useValue: {
            activeTab,
            activeTabSessionId: computed(() => activeTab()?.claudeSessionId ?? null),
            tabs: signal([]),
            findTabByIdAcrossWorkspaces: jest.fn(() => ({
              tab: { id: TAB, claudeSessionId: SESSION, providerId: 'openai-codex' },
              workspacePath: 'D:/repo',
            })),
          },
        },
        { provide: VSCodeService, useValue: { config: signal({ panelId: '' }) } },
        { provide: ClaudeRpcService, useValue: { call: jest.fn() } },
        {
          provide: LoggingService,
          useValue: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('fills the completed child transcript and monitor from a cached resume page once', () => {
    const replayer = TestBed.inject(SessionHistoryReplayer);
    const monitor = TestBed.inject(AgentMonitorStore);
    const execution = TestBed.inject(SubagentExecutionStore);
    const events = completedChildEvents();

    replayer.restoreNativeCompletedChildren(events, TAB, SESSION, 'openai-codex');

    expect(monitor.subagents().get('spawn-1')).toEqual(
      expect.objectContaining({ agentId: 'child-1', status: 'completed' }),
    );
    expect(execution.entries().get('spawn-1')?.agentId).toBe('child-1');
    expect(execution.treeFor('spawn-1')).toEqual([
      expect.objectContaining({ content: 'PINEAPPLE' }),
    ]);

    replayer.restoreNativeCompletedChildren(events, TAB, SESSION, 'openai-codex');
    expect(monitor.subagents().size).toBe(1);
    expect(execution.entries().size).toBe(1);
  });

  it('restores a terminal native card and four child tools without a card result, once', () => {
    TestBed.overrideProvider(ExecutionTreeBuilderService, { useClass: ExecutionTreeBuilderService });
    const replayer = TestBed.inject(SessionHistoryReplayer);
    const monitor = TestBed.inject(AgentMonitorStore);
    const execution = TestBed.inject(SubagentExecutionStore);
    const events = nativeChildEvents();
    replayer.restoreNativeCompletedChildren(events, TAB, SESSION, 'openai-codex');

    expect(monitor.subagents().get('spawn-1')).toEqual(
      expect.objectContaining({ agentId: 'child-1', status: 'completed' }),
    );
    expect(execution.treeFor('spawn-1').flatMap((node) => node.children)
      .filter((node) => node.type === 'tool')).toHaveLength(4);
    expect(execution.entries().get('spawn-1')?.agentId).toBe('child-1');

    replayer.restoreNativeCompletedChildren(events, TAB, SESSION, 'openai-codex');
    expect(monitor.subagents().size).toBe(1);
    expect(execution.entries().size).toBe(1);
    expect(execution.treeFor('spawn-1').flatMap((node) => node.children)
      .filter((node) => node.type === 'tool')).toHaveLength(4);
  });

  it('keeps a native card running when history has only a started status', () => {
    const replayer = TestBed.inject(SessionHistoryReplayer);
    const monitor = TestBed.inject(AgentMonitorStore);

    replayer.restoreNativeCompletedChildren(nativeChildEvents(false), TAB, SESSION, 'openai-codex');

    expect(monitor.subagents().get('spawn-1')).toEqual(
      expect.objectContaining({ status: 'running' }),
    );
  });
});
