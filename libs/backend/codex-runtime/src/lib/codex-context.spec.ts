import { codexRequestSchemas } from './codex-protocol-validator';
import { childEventParent } from './codex-context';
import { RuntimeContext } from './codex-context';
import { CodexRequestRejectedError } from './codex-app-server-process';
import { CodexEventTranslator } from './codex-event-translator';
import type { CodexRuntimeEvent } from './codex-runtime.types';
import { CodexChildBudgetTap } from './codex-child-budget-tap';
import { settleCodexChildBudgetEvent } from './codex-child-budget-observer';
import { DEFAULT_AGENT_BUDGET_SETTINGS } from '@ptah-extension/shared';

describe('native child event admission', () => {
  it('links two children on first notification, charges each terminal once, and accepts a later spawn confirmation', () => {
    const logger = { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn() };
    const context = Object.assign(Object.create(RuntimeContext.prototype), {
      committedIdentity: { contextId: 'context', processGeneration: 1, threadId: 'root' },
      state: 'running', activeTurn: 'root-turn',
      profile: { consumer: 'chat', contextId: 'context' },
      translator: new CodexEventTranslator('context', 1),
      childTools: new Map<string, string>(), childParentThreads: new Map<string, string>(),
      childTurns: new Map<string, string>(), knownChildParents: new Map<string, string>(),
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
    expect(logger.info).toHaveBeenCalledTimes(2);
    feed('turn/started', { threadId: 'child-a', turn: {
      id: 'turn-a-2', status: 'inProgress', items: [],
    } });
    expect(logger.info).toHaveBeenCalledTimes(2);
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
    expect(Reflect.get(context, 'activeTurn')).toBe('root-turn');
    expect(Reflect.get(context, 'state')).toBe('running');
    expect(Reflect.get(context, 'childTools')).toEqual(new Map([
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
    const logger = { error: jest.fn(), debug: jest.fn(), info: jest.fn() };
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
    expect(Reflect.get(context, 'earlyChildCount')).toBe(512);
    feed('turn/completed', { threadId: 'root',
      turn: { id: 'root-turn', status: 'completed', items: [] } });
    expect(Reflect.get(context, 'earlyChildEvents')).toEqual(new Map());
    // The cleared buffer lets a later root turn report its own overflow.
    feedUnlinked(520);
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(Reflect.get(context, 'earlyChildCount')).toBe(512);
  });
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
