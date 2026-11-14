import { codexRequestSchemas } from './codex-protocol-validator';
import { childEventParent } from './codex-context';
import { RuntimeContext } from './codex-context';
import { CodexRequestRejectedError } from './codex-app-server-process';
import { CodexEventTranslator } from './codex-event-translator';
import type {
  CodexApprovalRequest,
  CodexRuntimeEvent,
  CodexUserInputAnswer,
} from './codex-runtime.types';
import { CodexChildBudgetTap } from './codex-child-budget-tap';
import { settleCodexChildBudgetEvent } from './codex-child-budget-observer';
import { DEFAULT_AGENT_BUDGET_SETTINGS } from '@ptah-extension/shared';

describe('native child event admission', () => {
  it('does not seed an unreported child model from the observed root model', () => {
    const translator = new CodexEventTranslator('context', 1);
    translator.setThreadModel('root', 'gpt-4o');
    const context = Object.assign(Object.create(RuntimeContext.prototype), {
      committedIdentity: { contextId: 'context', processGeneration: 1, threadId: 'root' },
      observedModel: 'gpt-4o', translator,
      knownChildParents: new Map<string, string>(),
      childParentThreads: new Map<string, string>(),
      pendingChildParents: new Map<string, string>(),
      childTools: new Map<string, string>(), limitedNativeChildren: new Set<string>(),
      earlyChildEvents: new Map<string, CodexRuntimeEvent[]>(), earlyChildCount: 0,
      options: { logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn() } },
    }) as RuntimeContext;
    Reflect.apply(Reflect.get(context, 'linkChild'), context, ['child', 'spawn']);
    const counts = { inputTokens: 12, cachedInputTokens: 0,
      outputTokens: 4, reasoningOutputTokens: 0, totalTokens: 16 };
    const childUsage = translator.translate({ method: 'thread/tokenUsage/updated',
      params: { threadId: 'child', turnId: 'turn', tokenUsage: { last: counts, total: counts } },
    });
    expect(childUsage[0]).not.toHaveProperty('evidence.modelId');
  });
  it('links two children on first notification, charges each terminal once, and accepts a later spawn confirmation', () => {
    const logger = { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn() };
    const context = Object.assign(Object.create(RuntimeContext.prototype), {
      committedIdentity: { contextId: 'context', processGeneration: 1, threadId: 'root' },
      state: 'running', activeTurn: 'root-turn',
      profile: { consumer: 'chat', contextId: 'context' },
      translator: new CodexEventTranslator('context', 1),
      childTools: new Map<string, string>(), childParentThreads: new Map<string, string>(),
      childTurns: new Map<string, string>(), knownChildParents: new Map<string, string>(),
      nativeChildren: new Map(), limitedNativeChildren: new Set(),
      pendingNativeTerminals: [] as CodexRuntimeEvent[],
      pendingSpawns: new Map<string, Set<string>>(), pendingChildParents: new Map<string, string>(),
      earlyChildEvents: new Map<string, CodexRuntimeEvent[]>(), earlyChildCount: 0,
      unlinkedMethodsLogged: new Set<string>(), rootTerminalPending: false,
      terminalTurns: new Set<string>(), targets: new Map(), asyncQuestionItems: new Set(),
      subscribers: new Set(), turnController: new AbortController(), sequence: 0,
      options: { logger },
      observedModel: 'gpt-4o',
    }) as RuntimeContext;
    const feed = (method: string, params: Record<string, unknown>): void => {
      Reflect.apply(Reflect.get(context, 'onNotification'), context, [{ method, params }]);
    };
    context.events(new AbortController().signal);
    const subscriber = [...(Reflect.get(context, 'subscribers') as Set<{
      queue: CodexRuntimeEvent[];
    }>)][0];
    const events = () => subscriber?.queue ?? [];
    const spawn = (id: string, receivers: string[]) => ({
      type: 'collabAgentToolCall', id, senderThreadId: 'root',
      receiverThreadIds: receivers, status: 'inProgress', tool: 'spawnAgent',
      agentsStates: {}, prompt: 'Inspect',
    });
    const counts = { inputTokens: 30, cachedInputTokens: 0,
      outputTokens: 10, reasoningOutputTokens: 0, totalTokens: 40 };
    // Round 4 wire order: no thread/started. Parent activity is interleaved.
    feed('thread/status/changed', { threadId: 'child-a', status: { type: 'active' } });
    feed('thread/settings/updated', { threadId: 'child-a', threadSettings: { model: 'gpt-5' } });
    feed('mcpServer/startupStatus/updated', { threadId: 'child-a' });
    feed('turn/started', { threadId: 'child-a', turn: {
      id: 'turn-a', status: 'inProgress', items: [],
    } });
    feed('item/started', { threadId: 'root', turnId: 'root-turn',
      startedAtMs: 1, item: spawn('spawn-a', ['child-a']) });
    feed('item/started', { threadId: 'child-a', turnId: 'turn-a',
      startedAtMs: 1, item: { type: 'agentMessage', id: 'msg-a', text: '' } });
    feed('item/completed', { threadId: 'child-a', turnId: 'turn-a',
      completedAtMs: 2, item: { type: 'agentMessage', id: 'msg-a', text: 'done' } });
    feed('item/agentMessage/delta', { threadId: 'child-a', turnId: 'turn-a',
      itemId: 'msg-a', delta: 'done' });
    feed('turn/moderationMetadata', { threadId: 'child-a', turnId: 'turn-a' });
    feed('thread/tokenUsage/updated', { threadId: 'child-a', turnId: 'turn-a',
      tokenUsage: { last: counts, total: counts, modelContextWindow: 200000 } });
    feed('turn/completed', { threadId: 'child-a',
      turn: { id: 'turn-a', status: 'completed', items: [] } });
    feed('item/started', { threadId: 'root', turnId: 'root-turn',
      startedAtMs: 3, item: spawn('spawn-b', ['child-b']) });
    feed('turn/started', { threadId: 'child-b', turn: {
      id: 'turn-b', status: 'inProgress', items: [],
    } });
    feed('thread/tokenUsage/updated', { threadId: 'child-b', turnId: 'turn-b',
      model: 'gpt-4o', tokenUsage: { last: counts, total: counts } });
    feed('turn/completed', { threadId: 'child-b',
      turn: { id: 'turn-b', status: 'completed', items: [] } });
    const tap = new CodexChildBudgetTap(DEFAULT_AGENT_BUDGET_SETTINGS);
    const decisions = events().map((event) =>
      settleCodexChildBudgetEvent(event, tap, logger));
    expect(decisions.filter(Boolean)).toHaveLength(2);
    expect(events().filter((event) => event.type === 'terminal' &&
      event.threadId.startsWith('child-'))).toEqual([
      expect.objectContaining({ threadId: 'child-a', parentThreadId: 'root',
        parentToolUseId: 'spawn-a', evidence: expect.objectContaining({ modelId: 'gpt-5' }) }),
      expect.objectContaining({ threadId: 'child-b', parentThreadId: 'root',
        parentToolUseId: 'spawn-b', evidence: expect.objectContaining({ modelId: 'gpt-4o' }) }),
    ]);
    expect(logger.info.mock.calls.filter(([message]) => message === 'Codex child linked'))
      .toHaveLength(2);
    feed('turn/started', { threadId: 'child-a', turn: {
      id: 'turn-a-2', status: 'inProgress', items: [],
    } });
    expect(logger.info.mock.calls.filter(([message]) => message === 'Codex child linked'))
      .toHaveLength(2);
    expect(logger.debug).toHaveBeenCalledWith('Codex child relinked',
      { childThreadId: 'child-a' });
    expect(logger.debug).toHaveBeenCalledWith('Codex child thread notification',
      expect.objectContaining({ method: 'thread/status/changed', fields: 'status,threadId' }));
  });
  it('routes buffered child frames without settling the root and prunes the child', () => {
    const context = Object.assign(Object.create(RuntimeContext.prototype), {
      committedIdentity: { contextId: 'context', processGeneration: 1,
        threadId: 'root' },
      state: 'running', activeTurn: 'root-turn',
      profile: { consumer: 'chat', contextId: 'context' },
      translator: new CodexEventTranslator('context', 1),
      childTools: new Map<string, string>(),
      childParentThreads: new Map<string, string>(),
      childTurns: new Map<string, string>(),
      knownChildParents: new Map<string, string>(),
      pendingSpawns: new Map<string, Set<string>>(),
      earlyChildEvents: new Map<string, CodexRuntimeEvent[]>(),
      earlyChildCount: 0, rootTerminalPending: false,
      terminalTurns: new Set<string>(), targets: new Map(),
      asyncQuestionItems: new Set<string>(), subscribers: new Set(),
      nativeChildren: new Map(), limitedNativeChildren: new Set(),
      pendingNativeTerminals: [] as CodexRuntimeEvent[],
      turnController: new AbortController(), sequence: 0,
      finishCompact: jest.fn(),
      pendingChildParents: new Map<string, string>(),
      unlinkedMethodsLogged: new Set<string>(),
      options: { logger: { error: jest.fn(), debug: jest.fn(), info: jest.fn() } },
    }) as RuntimeContext;
    const feed = (method: string, params: Record<string, unknown>) => {
      const validParams = method === 'item/started'
        ? { ...params, startedAtMs: 1_000 }
        : method === 'item/completed'
          ? { ...params, completedAtMs: 1_000 }
          : params;
      Reflect.apply(Reflect.get(context, 'onNotification'), context, [
        { method, params: validParams },
      ]);
    };
    const subscription = context.events(new AbortController().signal);
    const subscriber = [...(Reflect.get(context, 'subscribers') as Set<{
      queue: CodexRuntimeEvent[];
    }>)][0];
    const events = () => subscriber?.queue ?? [];
    const spawn = { type: 'collabAgentToolCall', id: 'spawn',
      senderThreadId: 'root', receiverThreadIds: [] as string[],
      status: 'inProgress', tool: 'spawnAgent', agentsStates: {},
      prompt: 'Inspect' };
    // The protocol can announce the thread before the parent spawn item.
    feed('thread/started', { thread: { id: 'prelinked', parentThreadId: 'root' } });
    feed('item/started', { threadId: 'root', turnId: 'root-turn',
      item: { ...spawn, id: 'prelink-spawn' } });
    expect(Reflect.get(context, 'childTools')).toHaveProperty('size', 1);
    expect((Reflect.get(context, 'childTools') as Map<string, string>).get('prelinked'))
      .toBe('prelink-spawn');
    feed('item/completed', { threadId: 'root', turnId: 'root-turn',
      item: { ...spawn, id: 'prelink-spawn', status: 'completed' } });
    (Reflect.get(context, 'childTools') as Map<string, string>).delete('prelinked');
    feed('item/started', { threadId: 'root', turnId: 'root-turn', item: spawn });
    feed('item/completed', { threadId: 'foreign', turnId: 'foreign-turn',
      item: { type: 'agentMessage', id: 'foreign-text', text: 'foreign' } });
    feed('turn/completed', { threadId: 'foreign',
      turn: { id: 'foreign-turn', status: 'completed', items: [] } });
    feed('item/completed', { threadId: 'child', turnId: 'child-turn',
      item: { type: 'agentMessage', id: 'early-text', text: 'early' } });
    for (let index = 0; index < 100; index += 1)
      feed('item/agentMessage/delta', { threadId: 'child', turnId: 'child-turn',
        itemId: 'stream', delta: 'x' });
    expect(Reflect.get(context, 'earlyChildCount')).toBeLessThan(10);
    expect(events().some((event) => event.threadId === 'child')).toBe(true);
    feed('item/started', { threadId: 'root', turnId: 'root-turn', item: {
      type: 'subAgentActivity', id: 'activity', agentPath: '/root/readme_inspection',
      agentThreadId: 'child', kind: 'started',
    } });
    expect(events().filter((event) => event.threadId === 'child' && event.type === 'textFinal')).toHaveLength(1);
    feed('item/completed', { threadId: 'root', turnId: 'root-turn',
      item: { ...spawn, status: 'completed', receiverThreadIds: ['child'] } });
    expect(events().filter((event) => event.threadId === 'child' && event.type === 'textFinal')).toHaveLength(1);
    expect(events()).toContainEqual(expect.objectContaining({
      threadId: 'child', type: 'textFinal', text: 'early',
      parentToolUseId: 'child',
    }));
    expect((Reflect.get(context, 'childTools') as Map<string, string>).get('child'))
      .toBe('spawn');
    expect(events().some((event) => event.threadId === 'foreign')).toBe(true);
    feed('item/started', { threadId: 'root', turnId: 'root-turn',
      item: { ...spawn, id: 'spawn-nested' } });
    feed('thread/started', { thread: {
      id: 'thread-linked', parentThreadId: 'root', cliVersion: '1.0.0',
      createdAt: 1, updatedAt: 1, cwd: '/work', ephemeral: false,
      modelProvider: 'openai', preview: '', projectId: null,
      sessionId: 'session', source: 'appServer', status: { type: 'idle' },
      turns: [],
    } });
    expect(Reflect.get(context, 'childTools')).toEqual(new Map([
      ['child', 'spawn'], ['thread-linked', 'spawn-nested'],
    ]));
    feed('item/started', { threadId: 'child', turnId: 'child-turn',
      item: { type: 'fileChange', id: 'child-edit', status: 'inProgress',
        changes: [{ path: '/work/a.ts', diff: '+a', kind: { type: 'add' } }] } });
    expect(Reflect.get(context, 'targets')).toEqual(new Map([
      ['child-edit', { kind: 'fileChange', paths: ['/work/a.ts'] }],
    ]));
    feed('item/started', { threadId: 'child', turnId: 'child-turn',
      item: { ...spawn, id: 'child-spawn', senderThreadId: 'child',
        receiverThreadIds: ['grandchild'] } });
    feed('item/completed', { threadId: 'grandchild', turnId: 'grandchild-turn',
      item: { type: 'agentMessage', id: 'grandchild-text', text: 'deep' } });
    expect(events()).toContainEqual(expect.objectContaining({
      threadId: 'grandchild', parentToolUseId: 'child-spawn',
    }));
    feed('turn/completed', { threadId: 'grandchild',
      turn: { id: 'grandchild-turn', status: 'completed', items: [] } });
    feed('item/completed', { threadId: 'child', turnId: 'child-turn',
      item: { type: 'contextCompaction', id: 'child-compact' } });
    expect(Reflect.get(context, 'finishCompact')).not.toHaveBeenCalled();
    feed('turn/completed', { threadId: 'child',
      turn: { id: 'child-turn', status: 'completed', items: [] } });
    const trailingCounts = { inputTokens: 1, outputTokens: 1,
      cachedInputTokens: 0, reasoningOutputTokens: 0, totalTokens: 2 };
    feed('thread/tokenUsage/updated', { threadId: 'child', turnId: 'child-turn',
      tokenUsage: { last: trailingCounts, total: trailingCounts, modelContextWindow: 200000 } });
    expect(events()).toContainEqual(expect.objectContaining({
      type: 'usage', threadId: 'child', parentToolUseId: 'spawn',
    }));
    expect(Reflect.get(context, 'activeTurn')).toBe('root-turn');
    expect(Reflect.get(context, 'state')).toBe('running');
    expect(Reflect.get(context, 'childTools')).toEqual(new Map([
      ['child', 'spawn'],
      ['thread-linked', 'spawn-nested'],
    ]));
    feed('turn/completed', { threadId: 'root',
      turn: { id: 'root-turn', status: 'completed', items: [] } });
    expect(Reflect.get(context, 'state')).toBe('running');
    feed('turn/completed', { threadId: 'thread-linked',
      turn: { id: 'linked-turn', status: 'completed', items: [] } });
    expect(Reflect.get(context, 'state')).toBe('idle');
    expect(Reflect.get(context, 'activeTurn')).toBeUndefined();
    expect(Reflect.get(context, 'earlyChildEvents')).toEqual(new Map());
    clearTimeout(Reflect.get(context, 'compactTimer'));
    void subscription;
  });
  it('nests only linked child threads and leaves the root lifecycle separate', () => {
    const linked = new Map([['child', 'spawn-1'], ['grandchild', 'spawn-2']]);
    expect(childEventParent('root', 'root', linked)).toBeUndefined();
    expect(childEventParent('child', 'root', linked)).toBe('spawn-1');
    expect(childEventParent('grandchild', 'root', linked)).toBe('spawn-2');
    expect(childEventParent('foreign', 'root', linked)).toBeNull();
  });

  it('logs the early child buffer overflow once per root turn', () => {
    const logger = { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn() };
    const context = Object.assign(Object.create(RuntimeContext.prototype), {
      committedIdentity: { contextId: 'context', processGeneration: 1,
        threadId: 'root' },
      state: 'running', activeTurn: 'root-turn',
      profile: { consumer: 'chat', contextId: 'context' },
      translator: new CodexEventTranslator('context', 1),
      childTools: new Map<string, string>(), limitedNativeChildren: new Set<string>(),
      childParentThreads: new Map<string, string>(),
      childTurns: new Map<string, string>(),
      knownChildParents: new Map<string, string>(),
      pendingSpawns: new Map<string, Set<string>>(),
      pendingChildParents: new Map<string, string>(),
      unlinkedMethodsLogged: new Set<string>(),
      earlyChildEvents: new Map<string, CodexRuntimeEvent[]>(),
      earlyChildCount: 0, earlyChildOverflowLogged: false,
      rootTerminalPending: false,
      terminalTurns: new Set<string>(), targets: new Map(),
      asyncQuestionItems: new Set<string>(), subscribers: new Set(),
      turnController: new AbortController(), sequence: 0,
      options: { logger },
    }) as RuntimeContext;
    const feed = (method: string, params: Record<string, unknown>) => {
      const validParams = method === 'item/completed'
        ? { ...params, completedAtMs: 1_000 }
        : params;
      Reflect.apply(Reflect.get(context, 'onNotification'), context, [
        { method, params: validParams },
      ]);
    };
    const feedUnlinked = (count: number) => {
      for (let index = 0; index < count; index++)
        Reflect.apply(Reflect.get(context, 'bufferEarlyChild'), context, [{
          type: 'textFinal', contextId: 'context', processGeneration: 1,
          threadId: 'child', turnId: 'child-turn', sequence: index,
          itemId: `child-text-${index}`, text: 'early',
        }]);
    };
    feedUnlinked(520);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(Reflect.get(context, 'earlyChildCount')).toBe(128);
    feed('turn/completed', { threadId: 'root',
      turn: { id: 'root-turn', status: 'completed', items: [] } });
    expect(Reflect.get(context, 'earlyChildEvents')).toEqual(new Map());
    expect(logger.warn).toHaveBeenCalledWith('Codex unlinked child events dropped',
      expect.objectContaining({ threadIds: '["child"]', count: 128 }));
    // The cleared buffer lets a later root turn report its own overflow.
    feedUnlinked(520);
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(Reflect.get(context, 'earlyChildCount')).toBe(128);
  });
});

describe('native activity cycle linkage', () => {
  function harness() {
    const logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const context = Object.assign(Object.create(RuntimeContext.prototype), {
      committedIdentity: { threadId: 'root' }, profile: { contextId: 'ctx' }, generation: 1,
      knownChildParents: new Map<string, string>(), childParentThreads: new Map<string, string>(),
      childTools: new Map<string, string>(), pendingChildParents: new Map<string, string>(),
      earlyChildEvents: new Map<string, CodexRuntimeEvent[]>(), earlyChildCount: 0,
      nativeChildren: new Map(), limitedNativeChildren: new Set(), unlinkedMethodsLogged: new Set<string>(), childTurns: new Map<string, string>(), options: { logger },
      pendingNativeTerminals: [] as CodexRuntimeEvent[],
      subscribers: new Set(), sequence: 0, terminalTurns: new Set<string>(),
    }) as RuntimeContext;
    const activity = (kind: 'started' | 'interacted' | 'completed', turnId: string) =>
      ({ type: 'subagentActivity', contextId: 'ctx', processGeneration: 1,
        threadId: 'root', turnId, sequence: 1, activityId: `call-${turnId}`,
        cardToolCallId: `call-${turnId}`, agentThreadId: 'child',
        agentPath: '/root/native_vortex', kind, cycleOrdinal: 0, cycleId: '' });
    const apply = (kind: 'started' | 'interacted' | 'completed', turnId: string) =>
      Reflect.apply(Reflect.get(context, 'applyNativeActivity'), context, [activity(kind, turnId)]) as CodexRuntimeEvent | undefined;
    return { context, logger, apply };
  }

  it('reuses the first card on a later parent turn and increments the cycle', () => {
    const h = harness();
    const first = h.apply('started', 'turn-1');
    const next = h.apply('interacted', 'turn-2');
    expect(first).toMatchObject({ cardToolCallId: 'call-turn-1', cycleOrdinal: 1,
      cycleId: 'child:1' });
    expect(next).toMatchObject({ cardToolCallId: 'call-turn-1', cycleOrdinal: 2,
      cycleId: 'child:2' });
    expect(h.apply('interacted', 'turn-2')).toBeUndefined();
  });

  it('logs a non-started activity for an unknown child', () => {
    const h = harness();
    expect(h.apply('completed', 'parent')).toBeUndefined();
    expect(h.logger.debug).toHaveBeenCalledWith(
      'Codex native activity for unknown child',
      { agentThreadId: 'child', kind: 'completed' },
    );
  });

  it('flushes pre-activity child events with the canonical card id', () => {
    const h = harness();
    const subscriber = { queue: [] as CodexRuntimeEvent[], wake: jest.fn(),
      closed: false, release: jest.fn() };
    Reflect.get(h.context, 'subscribers').add(subscriber);
    const event: CodexRuntimeEvent = { type: 'textFinal', contextId: 'ctx',
      processGeneration: 1, threadId: 'child', turnId: 'child-turn',
      sequence: 1, itemId: 'message', text: 'answer' };
    Reflect.apply(Reflect.get(h.context, 'bufferEarlyChild'), h.context, [event]);
    h.apply('started', 'turn-1');
    Reflect.apply(Reflect.get(h.context, 'linkChild'), h.context, ['child', 'call-turn-1', 'root']);
    expect(Reflect.get(h.context, 'earlyChildCount')).toBe(0);
    expect(Reflect.get(h.context, 'childTools').get('child')).toBe('call-turn-1');
    expect(subscriber.queue).toContainEqual(expect.objectContaining({
      type: 'textFinal', parentToolUseId: 'call-turn-1', parentThreadId: 'root',
    }));
  });

  it('admits activity before buffered child items and exactly one terminal', () => {
    const h = harness();
    Object.assign(h.context, {
      translator: new CodexEventTranslator('ctx', 1), state: 'running', activeTurn: 'parent',
      pendingSpawns: new Map(), unlinkedMethodsLogged: new Set(), targets: new Map(),
    });
    const queue: CodexRuntimeEvent[] = [];
    Reflect.get(h.context, 'subscribers').add({ queue, wake: jest.fn(), release: jest.fn() });
    const feed = (method: string, params: Record<string, unknown>) =>
      Reflect.apply(Reflect.get(h.context, 'onNotification'), h.context, [{ method,
        params: method === 'item/started' ? { ...params, startedAtMs: 1 } :
          method === 'item/completed' ? { ...params, completedAtMs: 1 } : params }]);
    feed('turn/started', { threadId: 'child', turn: { id: 'child-turn', status: 'inProgress', items: [] } });
    feed('item/completed', { threadId: 'child', turnId: 'child-turn',
      item: { type: 'agentMessage', id: 'msg', text: 'answer' } });
    feed('turn/completed', { threadId: 'child',
      turn: { id: 'child-turn', status: 'completed', items: [] } });
    feed('item/started', { threadId: 'root', turnId: 'parent', item: {
      type: 'subAgentActivity', id: 'card', agentThreadId: 'child',
      agentPath: '/root/child', kind: 'started',
    } });
    expect(queue.map((event) => event.type)).toEqual([
      'subagentActivity', 'textFinal', 'terminal',
    ]);
    expect(queue.filter((event) => event.type === 'terminal')).toEqual([
      expect.objectContaining({ parentToolUseId: 'card', native: expect.objectContaining({ cycleId: 'child:1' }) }),
    ]);
  });

  it('replays a native terminal to the next subscriber once', async () => {
    const h = harness();
    h.apply('started', 'parent');
    Reflect.apply(Reflect.get(h.context, 'linkChild'), h.context, ['child', 'call-parent']);
    Reflect.apply(Reflect.get(h.context, 'bindChildTurn'), h.context, ['child', 'child-turn']);
    const terminal: CodexRuntimeEvent = { type: 'terminal', contextId: 'ctx',
      processGeneration: 1, threadId: 'child', turnId: 'child-turn', sequence: 0, status: 'completed' };
    Reflect.apply(Reflect.get(h.context, 'admitEvent'), h.context, [terminal, 'call-parent']);
    const events = h.context.events(new AbortController().signal)[Symbol.asyncIterator]();
    await expect(events.next()).resolves.toMatchObject({ value: {
      type: 'terminal', parentToolUseId: 'call-parent', native: { cycleId: 'child:1' },
    } });
    await events.return?.();
    expect(Reflect.get(h.context, 'pendingNativeTerminals')).toHaveLength(0);
    h.context.events(new AbortController().signal);
    const later = [...(Reflect.get(h.context, 'subscribers') as Set<{
      queue: CodexRuntimeEvent[];
    }>)][0];
    expect(later?.queue).toEqual([]);
  });

  it('finishes the root after the last non-native child while a native link remains', () => {
    const h = harness();
    h.apply('started', 'parent');
    Object.assign(h.context, { activeTurn: 'parent', state: 'running',
      rootTerminalPending: true, turnController: new AbortController(),
      targets: new Map(), asyncQuestionItems: new Set(), pendingSpawns: new Map(),
      pendingChildParents: new Map(), followUps: new Set() });
    Reflect.get(h.context, 'childTools').set('child', 'card');
    Reflect.get(h.context, 'childTools').set('v1-child', 'spawn');
    Reflect.apply(Reflect.get(h.context, 'admitEvent'), h.context, [{
      type: 'terminal', contextId: 'ctx', processGeneration: 1,
      threadId: 'v1-child', turnId: 'v1-turn', sequence: 1, status: 'completed',
    }, 'spawn']);
    expect(Reflect.get(h.context, 'activeTurn')).toBeUndefined();
    expect(Reflect.get(h.context, 'rootTerminalPending')).toBe(false);
  });

  it('evicts the oldest terminal native child before an active child', () => {
    const h = harness();
    for (let index = 0; index < 256; index++) {
      const id = `child-${index}`;
      const state = { cardToolCallId: id, parentThreadId: 'root', agentPath: id,
        lastActivityKind: 'started', cycleOrdinal: 1, cycleId: `${id}:1`,
        seenActivityKeys: new Set(), turnCycleByTurnId: new Map(),
        ...(index === 1 ? { lastTerminalKey: 'done' } : {}),
      };
      Reflect.get(h.context, 'nativeChildren').set(id, state);
    }
    const event: CodexRuntimeEvent = { type: 'subagentActivity', contextId: 'ctx',
      processGeneration: 1, threadId: 'root', turnId: 'parent', sequence: 0,
      activityId: 'new', cardToolCallId: 'new', agentThreadId: 'new',
      agentPath: '/new', kind: 'started', cycleId: '', cycleOrdinal: 0 };
    const admitted = Reflect.apply(Reflect.get(h.context, 'applyNativeActivity'), h.context, [event]);
    expect(admitted).toMatchObject({ cardToolCallId: 'new', cycleId: 'new:1' });
    expect(admitted).not.toHaveProperty('limitMessage');
    expect(h.logger.warn).not.toHaveBeenCalled();
    const children = Reflect.get(h.context, 'nativeChildren') as Map<string, unknown>;
    expect(children.size).toBe(256);
    expect(children.has('child-0')).toBe(true);
    expect(children.has('child-1')).toBe(false);
    expect(children.has('new')).toBe(true);
  });

  it('shows a 257th child as limited when all 256 have active cycles after earlier terminals', () => {
    const h = harness();
    Object.assign(h.context, { translator: new CodexEventTranslator('ctx', 1),
      state: 'running', activeTurn: 'parent', targets: new Map() });
    const queue: CodexRuntimeEvent[] = [];
    Reflect.get(h.context, 'subscribers').add({ queue, wake: jest.fn(), release: jest.fn() });
    const children = Reflect.get(h.context, 'nativeChildren') as Map<string, unknown>;
    for (let index = 0; index < 256; index++) {
      const id = `old-${index}`;
      children.set(id, {
        cardToolCallId: id, parentThreadId: 'root', agentPath: '/old',
        lastActivityKind: 'completed', lastTerminalKey: JSON.stringify([id, `${id}:1`, 'completed']),
        cycleOrdinal: 1, cycleId: `${id}:1`,
        seenActivityKeys: new Set(), turnCycleByTurnId: new Map(),
      });
      Reflect.apply(Reflect.get(h.context, 'applyNativeActivity'), h.context, [{
        type: 'subagentActivity', contextId: 'ctx', processGeneration: 1,
        threadId: 'root', turnId: 'parent', sequence: 0, activityId: `restart-${index}`,
        cardToolCallId: id, agentThreadId: id, agentPath: '/old',
        kind: 'interacted', cycleId: '', cycleOrdinal: 0,
      }]);
    }
    Reflect.apply(Reflect.get(h.context, 'onNotification'), h.context, [{
      method: 'item/started', params: { threadId: 'root', turnId: 'parent', startedAtMs: 1,
        item: { type: 'subAgentActivity', id: 'new-card', agentThreadId: 'new',
          agentPath: '/root/new', kind: 'started' } },
    }]);
    expect(queue).toContainEqual(expect.objectContaining({ type: 'subagentActivity',
      agentThreadId: 'new', cardToolCallId: 'new-card', kind: 'started',
      limitMessage: 'Not tracked: native child limit (256) reached; the child may still be running.' }));
    expect(children.size).toBe(256);
    expect(children.has('old-0')).toBe(true);
    expect(children.has('old-255')).toBe(true);
    expect(children.has('new')).toBe(false);
    expect(Reflect.get(h.context, 'childTools').has('new')).toBe(false);
    expect(h.logger.warn).toHaveBeenCalledWith('Codex native child cache overflow',
      expect.objectContaining({ agentThreadId: 'new' }));
  });

  it('keeps a limited native child unlinked and settled for later activity and events', () => {
    const h = harness();
    Object.assign(h.context, { translator: new CodexEventTranslator('ctx', 1),
      state: 'running', activeTurn: 'parent', targets: new Map() });
    const queue: CodexRuntimeEvent[] = [];
    Reflect.get(h.context, 'subscribers').add({ queue, wake: jest.fn(), release: jest.fn() });
    const children = Reflect.get(h.context, 'nativeChildren') as Map<string, {
      lastTerminalKey?: string }>;
    for (let index = 0; index < 256; index++) children.set(`old-${index}`, {
      cardToolCallId: `old-${index}`, parentThreadId: 'root', agentPath: '/old',
      lastActivityKind: 'started', cycleOrdinal: 1, cycleId: `old-${index}:1`,
      seenActivityKeys: new Set(), turnCycleByTurnId: new Map(),
    } as never);
    const childTools = Reflect.get(h.context, 'childTools') as Map<string, string>;
    // A spawn hint linked the child before its activity arrived.
    Reflect.apply(Reflect.get(h.context, 'linkChild'), h.context, ['new', 'other-spawn', 'root']);
    expect(childTools.get('new')).toBe('other-spawn');
    const activity = (kind: string, turnId: string) => ({
      method: 'item/started', params: { threadId: 'root', turnId, startedAtMs: 1,
        item: { type: 'subAgentActivity', id: `new-${kind}`, agentThreadId: 'new',
          agentPath: '/root/new', kind } },
    });
    const notify = (frame: unknown) =>
      Reflect.apply(Reflect.get(h.context, 'onNotification'), h.context, [frame]);
    notify(activity('started', 'parent'));
    expect(childTools.has('new')).toBe(false);
    expect(Reflect.get(h.context, 'knownChildParents').has('new')).toBe(false);
    // The child's own events stay unlinked: no self-link, no buffer.
    Object.assign(h.context, { pendingSpawns: new Map([['root', new Set(['other-spawn'])]]) });
    notify({ method: 'item/completed', params: { threadId: 'new', turnId: 'new-turn',
      completedAtMs: 2, item: { type: 'agentMessage', id: 'msg', text: 'hidden' } } });
    expect(childTools.has('new')).toBe(false);
    expect(Reflect.get(h.context, 'earlyChildEvents').has('new')).toBe(false);
    // Room in the cache must not reopen the settled card as a tracked cycle.
    const freed = children.get('old-0');
    if (freed) freed.lastTerminalKey = 'done';
    notify(activity('started', 'parent-2'));
    notify(activity('completed', 'parent-2'));
    expect(children.has('new')).toBe(false);
    expect(children.has('old-0')).toBe(true);
    expect(queue.filter((event) => event.type === 'subagentActivity')).toEqual([
      expect.objectContaining({ agentThreadId: 'new', kind: 'started',
        limitMessage: 'Not tracked: native child limit (256) reached; the child may still be running.' }),
    ]);
    expect(queue.some((event) => event.threadId === 'new')).toBe(false);
    expect(h.logger.warn).toHaveBeenCalledTimes(1);
  });

  it('admits native activity while an unrelated spawn is pending', () => {
    const h = harness();
    Object.assign(h.context, { translator: new CodexEventTranslator('ctx', 1),
      state: 'running', activeTurn: 'parent', targets: new Map(),
      pendingSpawns: new Map([['root', new Set(['other-spawn'])]]) });
    const queue: CodexRuntimeEvent[] = [];
    Reflect.get(h.context, 'subscribers').add({ queue, wake: jest.fn(), release: jest.fn() });
    // A child event that arrives before the activity stays buffered until the link.
    Reflect.apply(Reflect.get(h.context, 'bufferEarlyChild'), h.context, [{
      type: 'textFinal', contextId: 'ctx', processGeneration: 1, threadId: 'child',
      turnId: 'child-turn', sequence: 1, itemId: 'early', text: 'early answer' }]);
    Reflect.apply(Reflect.get(h.context, 'onNotification'), h.context, [{
      method: 'item/started', params: { threadId: 'root', turnId: 'parent', startedAtMs: 1,
        item: { type: 'subAgentActivity', id: 'card', agentThreadId: 'child',
          agentPath: '/root/child', kind: 'started' } },
    }]);
    const activity = queue.findIndex((event) => event.type === 'subagentActivity');
    const early = queue.findIndex((event) => event.type === 'textFinal');
    expect(activity).toBeGreaterThanOrEqual(0);
    expect(early).toBeGreaterThan(activity);
    expect(queue[early]).toMatchObject({ parentToolUseId: 'card' });
    expect(queue.some((event) => event.parentToolUseId === 'other-spawn')).toBe(false);
    expect(Reflect.get(h.context, 'childTools').get('child')).toBe('card');
  });

  it('keeps a resumed active cycle out of eviction after an older terminal turn', () => {
    const h = harness();
    Reflect.apply(Reflect.get(h.context, 'seedSubagentActivity'), h.context, [{
      rootThreadId: 'root', threads: [
        { id: 'root', parentThreadId: null, turns: [
          { id: 'parent-1', status: 'completed', items: [{ type: 'subAgentActivity',
            id: 'card', agentThreadId: 'child', agentPath: '/root/child', kind: 'started' }] },
          { id: 'parent-2', status: 'inProgress', items: [{ type: 'subAgentActivity',
            id: 'again', agentThreadId: 'child', agentPath: '/root/child', kind: 'interacted' }] },
        ] },
        { id: 'child', parentThreadId: 'root', turns: [
          { id: 'child-1', status: 'completed', items: [] },
          { id: 'child-2', status: 'inProgress', items: [] },
        ] },
      ],
    }]);
    const children = Reflect.get(h.context, 'nativeChildren') as Map<string, {
      lastTerminalKey?: string; cycleId: string; turnCycleByTurnId: Map<string, string> }>;
    const child = children.get('child');
    expect(child?.cycleId).toBe('child:2');
    expect(child?.turnCycleByTurnId.get('child-1')).toBe('child:1');
    expect(child?.turnCycleByTurnId.get('child-2')).toBe('child:2');
    expect(child?.lastTerminalKey).toBeUndefined();
    for (let index = 0; index < 255; index++) children.set(`done-${index}`, {
      cardToolCallId: `done-${index}`, parentThreadId: 'root', agentPath: '/done',
      lastActivityKind: 'completed', lastTerminalKey: 'done', cycleOrdinal: 1,
      cycleId: `done-${index}:1`, seenActivityKeys: new Set(), turnCycleByTurnId: new Map(),
    } as never);
    Reflect.apply(Reflect.get(h.context, 'applyNativeActivity'), h.context, [{
      type: 'subagentActivity', contextId: 'ctx', processGeneration: 1,
      threadId: 'root', turnId: 'parent-2', sequence: 0, activityId: 'new',
      cardToolCallId: 'new', agentThreadId: 'new', agentPath: '/new',
      kind: 'started', cycleId: '', cycleOrdinal: 0,
    }]);
    expect(children.has('child')).toBe(true);
    expect(children.has('done-0')).toBe(false);
    expect(children.has('new')).toBe(true);
  });

  it('nests child notifications that arrive after the activity link', () => {
    const h = harness();
    const subscriber = { queue: [] as CodexRuntimeEvent[], wake: jest.fn(),
      closed: false, release: jest.fn() };
    Reflect.get(h.context, 'subscribers').add(subscriber);
    h.apply('started', 'turn-1');
    Reflect.apply(Reflect.get(h.context, 'linkChild'), h.context, ['child', 'call-turn-1', 'root']);
    const event: CodexRuntimeEvent = { type: 'textFinal', contextId: 'ctx',
      processGeneration: 1, threadId: 'child', turnId: 'child-turn',
      sequence: 1, itemId: 'message', text: 'answer' };
    Reflect.apply(Reflect.get(h.context, 'admitEvent'), h.context,
      [event, 'call-turn-1']);
    expect(subscriber.queue).toContainEqual(expect.objectContaining({
      type: 'textFinal', parentToolUseId: 'call-turn-1', parentThreadId: 'root',
    }));
  });

  it('ignores an unbound terminal and a late terminal from an older child turn', () => {
    const h = harness();
    h.apply('started', 'parent-1');
    Reflect.apply(Reflect.get(h.context, 'linkChild'), h.context, ['child', 'call-parent-1', 'root']);
    const terminal = (turnId: string): CodexRuntimeEvent => ({
      type: 'terminal', contextId: 'ctx', processGeneration: 1,
      threadId: 'child', turnId, sequence: 1, status: 'completed',
    });
    Reflect.apply(Reflect.get(h.context, 'admitEvent'), h.context,
      [terminal('unbound'), 'call-parent-1']);
    expect(Reflect.get(h.context, 'terminalTurns').size).toBe(0);
    Reflect.apply(Reflect.get(h.context, 'bindChildTurn'), h.context, ['child', 'old-turn']);
    h.apply('interacted', 'parent-2');
    Reflect.apply(Reflect.get(h.context, 'admitEvent'), h.context,
      [terminal('old-turn'), 'call-parent-1']);
    expect(Reflect.get(h.context, 'terminalTurns').size).toBe(0);
  });

  it('lets structured failure override completed only within its bound cycle', () => {
    const h = harness();
    h.apply('started', 'parent-1');
    Reflect.apply(Reflect.get(h.context, 'linkChild'), h.context, ['child', 'call-parent-1', 'root']);
    Reflect.apply(Reflect.get(h.context, 'bindChildTurn'), h.context, ['child', 'child-1']);
    h.apply('completed', 'parent-1');
    const failure: CodexRuntimeEvent = { type: 'terminal', contextId: 'ctx',
      processGeneration: 1, threadId: 'child', turnId: 'child-1',
      sequence: 1, status: 'failed' };
    Reflect.apply(Reflect.get(h.context, 'admitEvent'), h.context,
      [failure, 'call-parent-1']);
    const native = Reflect.get(h.context, 'nativeChildren').get('child');
    expect(native.lastTerminalKey).toContain('failed');
    h.apply('interacted', 'parent-2');
    const before = native.lastTerminalKey;
    Reflect.apply(Reflect.get(h.context, 'admitEvent'), h.context,
      [{ ...failure, sequence: 2 }, 'call-parent-1']);
    expect(native.lastTerminalKey).toBe(before);
  });

  it('seeds the first card and completed terminal from parent history', () => {
    const h = harness();
    const history = { rootThreadId: 'root', threads: [{ id: 'root', turns: [{
      id: 'parent-turn', items: [
        { type: 'subAgentActivity', id: 'spawn', agentThreadId: 'child',
          agentPath: '/root/native_vortex', kind: 'started' },
        { type: 'subAgentActivity', id: 'done', agentThreadId: 'child',
          agentPath: '/root/native_vortex', kind: 'completed' },
      ],
    }] }] };
    Reflect.apply(Reflect.get(h.context, 'seedSubagentActivity'), h.context, [history]);
    expect(Reflect.get(h.context, 'childTools').get('child')).toBe('spawn');
    expect(Reflect.apply(Reflect.get(h.context, 'applyNativeActivity'), h.context, [{
      type: 'subagentActivity', contextId: 'ctx', processGeneration: 1,
      threadId: 'root', turnId: 'parent-turn', sequence: 1,
      activityId: 'done', cardToolCallId: 'done', agentThreadId: 'child',
      agentPath: '/root/native_vortex', kind: 'completed',
      cycleOrdinal: 0, cycleId: '',
    }])).toBeUndefined();
  });

  it('seeds nested subAgentActivity from child threads', () => {
    const h = harness();
    const history = { rootThreadId: 'root', threads: [
      { id: 'root', parentThreadId: null, turns: [{
        id: 'parent-turn', items: [
          { type: 'subAgentActivity', id: 'spawn-child', agentThreadId: 'child',
            agentPath: '/root/vortex', kind: 'started' },
        ],
      }] },
      { id: 'child', parentThreadId: 'root', turns: [{
        id: 'child-turn', items: [
          { type: 'subAgentActivity', id: 'spawn-grandchild', agentThreadId: 'grandchild',
            agentPath: '/root/vortex/nested', kind: 'started' },
          { type: 'subAgentActivity', id: 'done-grandchild', agentThreadId: 'grandchild',
            agentPath: '/root/vortex/nested', kind: 'completed' },
        ],
      }] },
    ] };
    Reflect.apply(Reflect.get(h.context, 'seedSubagentActivity'), h.context, [history]);
    // Verify root child is linked
    expect(Reflect.get(h.context, 'childTools').get('child')).toBe('spawn-child');
    // Verify grandchild from nested thread is also seeded
    const nativeChildren = Reflect.get(h.context, 'nativeChildren') as Map<string, unknown>;
    expect(nativeChildren.has('grandchild')).toBe(true);
    const grandchildState = nativeChildren.get('grandchild');
    expect(grandchildState).toMatchObject({
      agentPath: '/root/vortex/nested',
      lastActivityKind: 'completed',
    });
  });
});

it('flushes v1 child notifications once toolStarted supplies agentThreadIds', () => {
  const logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const context = Object.assign(Object.create(RuntimeContext.prototype), {
    committedIdentity: { contextId: 'ctx', processGeneration: 1, threadId: 'root' },
    state: 'running', activeTurn: 'parent', translator: new CodexEventTranslator('ctx', 1),
    childTools: new Map(), childParentThreads: new Map(), knownChildParents: new Map(),
    pendingChildParents: new Map(), pendingSpawns: new Map(), nativeChildren: new Map(), limitedNativeChildren: new Set(),
    earlyChildEvents: new Map(), earlyChildCount: 0, childTurns: new Map(),
    terminalTurns: new Set(), unlinkedMethodsLogged: new Set(), targets: new Map(),
    subscribers: new Set(), sequence: 0, options: { logger },
  }) as RuntimeContext;
  const queue: CodexRuntimeEvent[] = [];
  Reflect.get(context, 'subscribers').add({ queue, wake: jest.fn(), release: jest.fn() });
  const feed = (method: string, params: Record<string, unknown>) =>
    Reflect.apply(Reflect.get(context, 'onNotification'), context, [{ method,
      params: method === 'item/started' ? { ...params, startedAtMs: 1 } :
        method === 'item/completed' ? { ...params, completedAtMs: 1 } : params }]);
  feed('item/completed', { threadId: 'child', turnId: 'child-turn',
    item: { type: 'agentMessage', id: 'msg', text: 'early' } });
  feed('item/started', { threadId: 'root', turnId: 'parent', item: {
    type: 'collabAgentToolCall', id: 'spawn', senderThreadId: 'root',
    receiverThreadIds: ['child'], status: 'inProgress', tool: 'spawnAgent',
    agentsStates: {}, prompt: 'Inspect',
  } });
  expect(queue.filter((event) => event.type === 'textFinal' && event.threadId === 'child'))
    .toEqual([expect.objectContaining({ parentToolUseId: 'spawn', text: 'early' })]);
});

describe('CodexContext thread frame boundary', () => {
  it('refuses a changed turn before sending a steer request', async () => {
    const request = jest.fn();
    const context = Object.assign(Object.create(RuntimeContext.prototype), {
      state: 'idle', activeTurn: undefined,
      serialize: (operation: () => Promise<unknown>) => operation(),
      process: { request },
    }) as RuntimeContext;
    await expect(context.steer({ text: 'follow-up' }, 'old-turn')).rejects.toMatchObject({
      method: 'turn/steer', code: 'codexTurnNoLongerActive',
    } satisfies Partial<CodexRequestRejectedError>);
    expect(request).not.toHaveBeenCalled();
  });
  it('keeps nested lane config on both parsed thread methods', () => {
    const config = {
      agents: { enabled: false },
      features: { plugins: false, apps: false },
      skills: { include_instructions: false },
      web_search: 'disabled',
      approval_policy: 'never',
      mcp_servers: { ptah: { url: 'http://localhost:4823', tool_timeout_sec: 960 } },
    };
    const start = codexRequestSchemas['thread/start'].params.parse({
      cwd: '/work', model: 'model', approvalPolicy: 'never',
      approvalsReviewer: 'user', sandbox: 'workspace-write', config,
    });
    const resume = codexRequestSchemas['thread/resume'].params.parse({
      ...start, threadId: 'thread-1',
    });
    expect(start.config).toEqual(config);
    expect(resume.config).toEqual(config);
    expect(start.config).not.toHaveProperty(['mcp_servers.ptah']);
  });
});

describe('RuntimeContext userInputAsync lifecycle', () => {
  function createAsyncQuestionHarness() {
    const logger = {
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    };
    let resolveAnswer:
      | ((value: Record<string, { answers: string[] }>) => void)
      | undefined;
    let observedSignal: AbortSignal | undefined;
    const pendingQuestions: {
      request: CodexApprovalRequest;
      signal: AbortSignal;
      resolve: (value: Record<string, { answers: string[] }>) => void;
    }[] = [];
    const requestUserInput = jest.fn(
      (request: CodexApprovalRequest, signal: AbortSignal) => {
        observedSignal = signal;
        return new Promise<Record<string, { answers: string[] }>>((resolve) => {
          resolveAnswer = resolve;
          pendingQuestions.push({ request, signal, resolve });
        });
      },
    );
    let nextTurnNumber = 2;
    const request = jest.fn(async (method: string) => {
      if (method === 'turn/start') {
        const id = `turn-${nextTurnNumber++}`;
        return { turn: { id, status: 'inProgress', items: [] } };
      }
      if (method === 'turn/steer') {
        return { turnId: `turn-${nextTurnNumber - 1}` };
      }
      return {};
    });
    const context = Object.assign(Object.create(RuntimeContext.prototype), {
      committedIdentity: {
        contextId: 'context',
        processGeneration: 1,
        threadId: 'root',
        normalizedHome: '/home',
        workspaceId: '/work',
        providerId: 'openai-codex',
        profileFingerprint: 'fp',
      },
      state: 'running',
      activeTurn: 'turn-1',
      profile: {
        consumer: 'chat',
        contextId: 'context',
        normalizedHome: '/home',
        workspaceId: '/work',
        cwd: '/work',
        providerId: 'openai-codex',
        permissionLevel: 'ask',
        attachments: [],
      },
      settings: { permissionLevel: 'ask' },
      levelPolicy: {
        approvalPolicy: 'never',
        sandboxPolicy: {
          mode: 'read-only',
          networkAccess: false,
          writableRoots: [],
        },
      },
      wirePermissionLevel: 'ask',
      operation: Promise.resolve(),
      revision: 0,
      turnRevision: 0,
      sentInitialInput: true,
      turnHistory: true,
      onFailure: jest.fn(),
      translator: new CodexEventTranslator('context', 1),
      childTools: new Map<string, string>(), limitedNativeChildren: new Set<string>(),
      childParentThreads: new Map<string, string>(),
      childTurns: new Map<string, string>(),
      knownChildParents: new Map<string, string>(),
      pendingSpawns: new Map<string, Set<string>>(),
      pendingChildParents: new Map<string, string>(),
      unlinkedMethodsLogged: new Set<string>(),
      earlyChildEvents: new Map<string, CodexRuntimeEvent[]>(),
      earlyChildCount: 0,
      earlyChildOverflowLogged: false,
      rootTerminalPending: false,
      terminalTurns: new Set<string>(),
      targets: new Map(),
      asyncQuestionItems: new Set<string>(),
      subscribers: new Set(),
      followUps: new Set(),
      turnController: new AbortController(),
      contextController: new AbortController(),
      asyncInputController: new AbortController(),
      sequence: 0,
      process: {
        close: jest.fn(async () => undefined),
        request,
      },
      release: jest.fn(),
      options: {
        logger,
        requestUserInput,
        store: { markInactive: jest.fn(async () => undefined) },
      },
    }) as RuntimeContext;
    const feed = (method: string, params: Record<string, unknown>): void => {
      Reflect.apply(Reflect.get(context, 'onNotification'), context, [
        { method, params },
      ]);
    };
    return {
      context,
      logger,
      request,
      requestUserInput,
      pendingQuestions,
      feed,
      signal: () => observedSignal,
      answer: (value: Record<string, { answers: string[] }>) =>
        resolveAnswer?.(value),
    };
  }

  it('keeps userInputAsync pending after finishActiveTurn and routes post-turn answers to the handler', async () => {
    const h = createAsyncQuestionHarness();
    const delivered: CodexUserInputAnswer[] = [];
    h.context.setUserInputAnswerHandler(async (answer) => {
      delivered.push(answer);
    });
    h.feed('item/completed', {
      threadId: 'root',
      turnId: 'turn-1',
      completedAtMs: 2,
      item: {
        type: 'agentMessage',
        id: 'q-item',
        text: 'Pick one',
        delivery: 'async',
        questions: [{ title: 'Deploy?', options: ['Yes', 'No'] }],
      },
    });
    expect(h.requestUserInput).toHaveBeenCalledTimes(1);
    expect(h.signal()?.aborted).toBe(false);

    h.feed('turn/completed', {
      threadId: 'root',
      turn: { id: 'turn-1', status: 'completed', items: [] },
    });
    expect(Reflect.get(h.context, 'state')).toBe('idle');
    expect(h.signal()?.aborted).toBe(false);

    h.answer({ 'q-item:0': { answers: ['Yes'] } });
    await Promise.resolve();
    await Promise.resolve();
    expect(delivered).toEqual([
      {
        threadId: 'root',
        turnId: 'turn-1',
        itemId: 'q-item',
        text: 'User has answered your questions: "Deploy?"="Yes". You can now continue with the user\'s answers in mind.',
      },
    ]);
  });

  it('aborts pending userInputAsync on close() and cancelPendingUserInput()', async () => {
    const first = createAsyncQuestionHarness();
    const handler = jest.fn(async () => undefined);
    first.context.setUserInputAnswerHandler(handler);
    first.feed('item/completed', {
      threadId: 'root',
      turnId: 'turn-1',
      completedAtMs: 2,
      item: {
        type: 'agentMessage',
        id: 'q-close',
        text: 'Pick one',
        delivery: 'async',
        questions: [{ title: 'Deploy?' }],
      },
    });
    first.feed('turn/completed', {
      threadId: 'root',
      turn: { id: 'turn-1', status: 'completed', items: [] },
    });
    expect(first.signal()?.aborted).toBe(false);
    await first.context.close();
    expect(first.signal()?.aborted).toBe(true);
    first.answer({ 'q-close:0': { answers: ['Yes'] } });
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    const second = createAsyncQuestionHarness();
    second.feed('item/completed', {
      threadId: 'root',
      turnId: 'turn-1',
      completedAtMs: 2,
      item: {
        type: 'agentMessage',
        id: 'q-stop',
        text: 'Pick one',
        delivery: 'async',
        questions: [{ title: 'Stop?' }],
      },
    });
    second.feed('turn/completed', {
      threadId: 'root',
      turn: { id: 'turn-1', status: 'completed', items: [] },
    });
    expect(second.signal()?.aborted).toBe(false);
    second.context.cancelPendingUserInput();
    expect(second.signal()?.aborted).toBe(true);
  });

  it('preserves pending questions when a replacement turn is aborted before admission', async () => {
    const h = createAsyncQuestionHarness();
    h.feed('item/completed', { threadId: 'root', turnId: 'turn-1', completedAtMs: 2,
      item: { type: 'agentMessage', id: 'q-abort', text: 'Pick one', delivery: 'async',
        questions: [{ title: 'Choice?' }] } });
    h.feed('turn/completed', { threadId: 'root',
      turn: { id: 'turn-1', status: 'completed', items: [] } });
    const controller = new AbortController();
    controller.abort();
    await expect(h.context.startTurn({ text: 'replacement', signal: controller.signal }))
      .rejects.toThrow('Codex turn aborted');
    expect(h.signal()?.aborted).toBe(false);
    expect(h.request).not.toHaveBeenCalled();
  });

  it('starts a follow-up when the selected turn ends before an async answer can steer', async () => {
    const h = createAsyncQuestionHarness();
    h.feed('item/completed', { threadId: 'root', turnId: 'turn-1', completedAtMs: 2,
      item: { type: 'agentMessage', id: 'q-late', text: 'Pick one', delivery: 'async',
        questions: [{ title: 'Choice?' }] } });
    let release: (() => void) | undefined;
    Reflect.set(h.context, 'operation', new Promise<void>((resolve) => { release = resolve; }));
    h.answer({ 'q-late:0': { answers: ['Yes'] } });
    await Promise.resolve();
    h.feed('turn/completed', { threadId: 'root',
      turn: { id: 'turn-1', status: 'completed', items: [] } });
    release?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(h.request).toHaveBeenCalledWith('turn/start', expect.objectContaining({
      input: [expect.objectContaining({ type: 'text', text: expect.stringContaining('Choice?') })],
    }));
  });

  it('keeps a second pending userInputAsync question answerable after the first starts an answer-delivery turn, while a user turn cancels pending questions', async () => {
    const h = createAsyncQuestionHarness();
    h.feed('item/completed', {
      threadId: 'root',
      turnId: 'turn-1',
      completedAtMs: 2,
      item: {
        type: 'agentMessage',
        id: 'q-1',
        text: 'First question',
        delivery: 'async',
        questions: [{ title: 'Database?', options: ['Postgres', 'SQLite'] }],
      },
    });
    h.feed('item/completed', {
      threadId: 'root',
      turnId: 'turn-1',
      completedAtMs: 3,
      item: {
        type: 'agentMessage',
        id: 'q-2',
        text: 'Second question',
        delivery: 'async',
        questions: [{ title: 'Deploy target?', options: ['Fly', 'AWS'] }],
      },
    });
    h.feed('item/completed', {
      threadId: 'root',
      turnId: 'turn-1',
      completedAtMs: 4,
      item: {
        type: 'agentMessage',
        id: 'q-3',
        text: 'Third question',
        delivery: 'async',
        questions: [{ title: 'CI?', options: ['GitHub', 'GitLab'] }],
      },
    });
    expect(h.pendingQuestions).toHaveLength(3);

    h.feed('turn/completed', {
      threadId: 'root',
      turn: { id: 'turn-1', status: 'completed', items: [] },
    });
    expect(Reflect.get(h.context, 'state')).toBe('idle');

    h.pendingQuestions[0].resolve({ 'q-1:0': { answers: ['Postgres'] } });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(h.request).toHaveBeenCalledTimes(1);
    expect(h.request).toHaveBeenNthCalledWith(
      1,
      'turn/start',
      expect.objectContaining({
        threadId: 'root',
        input: [
          {
            type: 'text',
            text: 'User has answered your questions: "Database?"="Postgres". You can now continue with the user\'s answers in mind.',
          },
        ],
      }),
    );
    expect(h.pendingQuestions[1].signal.aborted).toBe(false);
    expect(h.pendingQuestions[2].signal.aborted).toBe(false);

    h.feed('turn/completed', {
      threadId: 'root',
      turn: { id: 'turn-2', status: 'completed', items: [] },
    });

    h.pendingQuestions[1].resolve({ 'q-2:0': { answers: ['Fly'] } });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(h.request).toHaveBeenCalledTimes(2);
    expect(h.request).toHaveBeenNthCalledWith(
      2,
      'turn/start',
      expect.objectContaining({
        threadId: 'root',
        input: [
          {
            type: 'text',
            text: 'User has answered your questions: "Deploy target?"="Fly". You can now continue with the user\'s answers in mind.',
          },
        ],
      }),
    );
    expect(h.pendingQuestions[2].signal.aborted).toBe(false);

    h.feed('turn/completed', {
      threadId: 'root',
      turn: { id: 'turn-3', status: 'completed', items: [] },
    });

    await h.context.startTurn({ text: 'User starts a new turn' });
    expect(h.pendingQuestions[2].signal.aborted).toBe(true);
  });

  it('still aborts turnController on finishActiveTurn for synchronous server requests', () => {
    const h = createAsyncQuestionHarness();
    const turnSignal = (
      Reflect.get(h.context, 'turnController') as AbortController
    ).signal;
    expect(turnSignal.aborted).toBe(false);
    h.feed('turn/completed', {
      threadId: 'root',
      turn: { id: 'turn-1', status: 'completed', items: [] },
    });
    expect(turnSignal.aborted).toBe(true);
  });
});
