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
      childTools: new Map<string, string>(),
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
      childTools: new Map<string, string>(),
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
