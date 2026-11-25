/**
 * AgentMessageRouter unit tests.
 *
 * Drives the router against fake handles and fake tracked records, so every
 * capability shape is exercised without spawning anything. The manager spec
 * covers the same modes end to end through `sendToAgent`.
 */
import 'reflect-metadata';

jest.mock('tsyringe', () => ({
  injectable: () => (target: unknown) => target,
  inject: () => () => undefined,
}));

jest.mock('@ptah-extension/vscode-core', () => ({
  TOKENS: {
    LOGGER: Symbol('LOGGER'),
    CLI_DETECTION_SERVICE: Symbol('CLI_DETECTION_SERVICE'),
  },
  Logger: class {},
}));

import {
  AgentMessageRouter,
  AgentInterruptedDeliveryError,
  MAX_PENDING_MESSAGES,
  type ContinuationDispatcher,
  type MessageRoutableAgent,
} from './agent-message-router.service';
import type { CliDetectionService } from './cli-detection.service';
import type { AgentMessageDispatchJournal } from './messaging/agent-message-dispatch-journal.port';
import type {
  AgentMessagingCapabilities,
  SdkHandle,
} from './cli-adapters/cli-adapter.interface';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  formatBudgetPauseNotice,
  type AgentActionNotice,
  type AgentProcessInfo,
  type CliType,
} from '@ptah-extension/shared';

function createLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as jest.Mocked<Logger>;
}

function createDetection(
  capabilities?: AgentMessagingCapabilities,
): jest.Mocked<CliDetectionService> {
  return {
    getAdapter: jest
      .fn()
      .mockReturnValue(
        capabilities ? { capabilities: () => ({ messaging: {
          steer: { state: capabilities.steer ? 'supported' : 'unsupported' },
          interrupt: { state: capabilities.interrupt ? 'supported' : 'unsupported' },
          continuation: { state: capabilities.continuation ? 'supported' : 'unsupported' },
          resume: { state: 'unsupported' },
        } }) } : undefined,
      ),
  } as unknown as jest.Mocked<CliDetectionService>;
}

function createRecord(
  overrides: Partial<MessageRoutableAgent> & { cli?: CliType } = {},
): MessageRoutableAgent {
  const { cli, ...rest } = overrides;
  return {
    info: {
      agentId: 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001',
      cli: cli ?? 'codex',
      cliSessionId: 'session-1',
      task: 'work',
      workingDirectory: '/workspace/root',
      status: 'running',
      startedAt: new Date().toISOString(),
    } as unknown as AgentProcessInfo,
    subprocessReleased: false,
    pendingMessages: [],
    ...rest,
  };
}

function createDispatcher(
  impl?: (agentId: string, message: string) => Promise<void>,
): jest.Mocked<ContinuationDispatcher> {
  return {
    continueConversation: jest.fn(
      impl ?? (() => Promise.resolve()),
    ) as jest.MockedFunction<ContinuationDispatcher['continueConversation']>,
  };
}

const AGENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001';

describe('AgentMessageRouter', () => {
  let logger: jest.Mocked<Logger>;

  it('refuses to select a delivery for a starting lane', async () => {
    const router = new AgentMessageRouter(
      createLogger(),
      createDetection({ steer: true, interrupt: true, continuation: true }),
    );
    const tracked = createRecord({
      info: { ...createRecord().info, status: 'starting' },
    });
    const dispatcher = createDispatcher();
    const outcome = await router.route(AGENT_ID, tracked, 'hello', dispatcher);
    expect(outcome).toMatchObject({
      mode: 'unsupported',
      reasonCode: 'continuation-unavailable',
    });
    expect(dispatcher.continueConversation).not.toHaveBeenCalled();
    expect(tracked.pendingMessages).toHaveLength(0);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    logger = createLogger();
  });

  it('queues a Codex budget warning after the completed turn rejects steer', async () => {
    const router = new AgentMessageRouter(logger, createDetection({ steer: true, interrupt: false, continuation: true }));
    const tracked = createRecord({ sdkHandle: {
      steer: async () => { throw new Error('Codex active turn unavailable'); },
      supportsContinuation: () => true,
      continue: jest.fn(),
    } as unknown as SdkHandle });
    const steered = await router.route(AGENT_ID, tracked, 'Budget warning', createDispatcher(), 'steer');
    expect(steered).toMatchObject({ mode: 'unsupported', reasonCode: 'steer-rejected' });
    const queued = await router.route(AGENT_ID, tracked, 'Budget warning', createDispatcher(), 'queue');
    expect(queued.mode).toBe('queue-next-turn');
    expect(tracked.pendingMessages).toHaveLength(1);
  });

  it('returns typed queue-full and no-session refusal codes', async () => {
    const router = new AgentMessageRouter(logger, createDetection({ steer: false, interrupt: false, continuation: true }));
    const tracked = createRecord({ pendingMessages: Array.from({ length: MAX_PENDING_MESSAGES }, (_, n) => ({ messageId: String(n), cliSessionId: 'session-1', text: 'queued' })) });
    expect(await router.route(AGENT_ID, tracked, 'next', createDispatcher())).toMatchObject({ mode: 'unsupported', reasonCode: 'queue-full' });
    tracked.pendingMessages.length = 0;
    tracked.info = { ...tracked.info, cliSessionId: undefined };
    expect(await router.route(AGENT_ID, tracked, 'next', createDispatcher())).toMatchObject({ mode: 'unsupported', reasonCode: 'no-session' });
  });

  describe('capability resolution', () => {
    it('reads the live handle in preference to the adapter declaration', async () => {
      // The adapter says "steer"; the handle in hand has no steer channel and
      // can only continue. The handle wins, so nothing is injected mid-turn.
      const detection = createDetection({
        steer: true,
        interrupt: false,
        continuation: true,
      });
      const router = new AgentMessageRouter(logger, detection);
      const handle = {
        supportsContinuation: () => true,
        continue: jest.fn(),
      } as unknown as SdkHandle;
      const tracked = createRecord({ sdkHandle: handle });
      const dispatcher = createDispatcher();

      const outcome = await router.route(
        AGENT_ID,
        tracked,
        'hello',
        dispatcher,
      );

      expect(outcome.mode).toBe('queue-next-turn');
      expect(tracked.pendingMessages.map((entry) => entry.text)).toEqual(['hello']);
    });

    it('falls back to the adapter declaration for a record with no handle', async () => {
      const detection = createDetection({
        steer: false,
        interrupt: false,
        continuation: false,
      });
      const router = new AgentMessageRouter(logger, detection);
      const tracked = createRecord();

      const outcome = await router.route(
        AGENT_ID,
        tracked,
        'hello',
        createDispatcher(),
      );

      expect(outcome.mode).toBe('unsupported');
    });

    it('treats a released subprocess as unable to continue', async () => {
      const router = new AgentMessageRouter(logger, createDetection());
      const handle = {
        supportsContinuation: () => true,
        continue: jest.fn(),
      } as unknown as SdkHandle;
      const tracked = createRecord({
        sdkHandle: handle,
        subprocessReleased: true,
        info: { ...createRecord().info, status: 'completed' },
      });

      const outcome = await router.route(
        AGENT_ID,
        tracked,
        'hello',
        createDispatcher(),
      );

      expect(outcome.mode).toBe('unsupported');
    });
  });

  describe('interrupt-resume', () => {
    it('refuses Send now without loss confirmation before interrupting', async () => {
      const router = new AgentMessageRouter(logger, createDetection());
      const interrupt = jest.fn().mockResolvedValue(undefined);
      const tracked = createRecord({ sdkHandle: {
        supportsInterrupt: () => true, interrupt,
        supportsContinuation: () => true, continue: jest.fn(),
      } as unknown as SdkHandle });
      const outcome = await router.route(AGENT_ID, tracked, 'redirect', createDispatcher(), 'now');
      expect(outcome.mode).toBe('unsupported');
      expect(interrupt).not.toHaveBeenCalled();
    });

    it('awaits the turn settle before resuming', async () => {
      const router = new AgentMessageRouter(logger, createDetection());
      let settleTurn!: (code: number) => void;
      const currentTurnDone = new Promise<number>((resolve) => {
        settleTurn = resolve;
      });
      const tracked = createRecord({ currentTurnDone });
      const interrupt = jest.fn(async () => {
        // The record only leaves `running` when the turn's own settle handling
        // runs — model that as a continuation of currentTurnDone.
        void currentTurnDone.then(() => {
          tracked.info = { ...tracked.info, status: 'completed' };
        });
        settleTurn(1);
      });
      tracked.sdkHandle = {
        supportsInterrupt: () => true,
        interrupt,
        supportsContinuation: () => true,
        continue: jest.fn(),
      } as unknown as SdkHandle;

      const dispatcher = createDispatcher(async () => {
        // Asserted INSIDE the dispatcher: a resume attempted while the record
        // still reads `running` is exactly the race this test exists for.
        expect(tracked.info.status).toBe('completed');
      });

      const outcome = await router.route(
        AGENT_ID,
        tracked,
        'redirect',
        dispatcher,
        'now',
        undefined,
        true,
      );

      expect(outcome.mode).toBe('interrupt-resume');
      expect(dispatcher.continueConversation).toHaveBeenCalledWith(
        AGENT_ID,
        'redirect',
      );
    });

    it('reports lost partial work when the resume itself fails', async () => {
      const router = new AgentMessageRouter(logger, createDetection());
      const tracked = createRecord({ currentTurnDone: Promise.resolve(1) });
      tracked.sdkHandle = {
        supportsInterrupt: () => true,
        interrupt: jest.fn().mockResolvedValue(undefined),
        supportsContinuation: () => true,
        continue: jest.fn(),
      } as unknown as SdkHandle;
      const dispatcher = createDispatcher(() =>
        Promise.reject(new Error('handle is gone')),
      );

      await expect(router.route(
        AGENT_ID,
        tracked,
        'redirect',
        dispatcher,
        'now',
        undefined,
        true,
      )).rejects.toThrow(AgentInterruptedDeliveryError);
    });
  });

  describe('the pending queue', () => {
    const continuableRecord = (): MessageRoutableAgent => {
      const tracked = createRecord();
      tracked.sdkHandle = {
        supportsContinuation: () => true,
        continue: jest.fn(),
      } as unknown as SdkHandle;
      return tracked;
    };

    it('delivers a consented immediate message before flushing a queued turn', async () => {
      const router = new AgentMessageRouter(logger, createDetection());
      const tracked = continuableRecord();
      tracked.sdkHandle = { ...tracked.sdkHandle, supportsInterrupt: () => true,
        interrupt: async () => { tracked.info = { ...tracked.info, status: 'completed' }; await router.flushPending(AGENT_ID, tracked, dispatcher); },
      } as SdkHandle;
      const dispatcher = createDispatcher();
      const queued = await router.route(AGENT_ID, tracked, 'queued', dispatcher);
      await router.route(AGENT_ID, tracked, 'immediate', dispatcher, 'now', undefined, true);
      expect(dispatcher.continueConversation).toHaveBeenCalledWith(AGENT_ID, 'immediate');
      expect(router.messageStatus(AGENT_ID, tracked, queued.messageId ?? '')).toEqual({ status: 'pending' });
      await router.flushPending(AGENT_ID, tracked, dispatcher);
      expect(dispatcher.continueConversation).toHaveBeenCalledWith(AGENT_ID, 'queued', queued.messageId);
    });

    it('flushes a queued turn after the Send-now resubmit fails', async () => {
      const router = new AgentMessageRouter(logger, createDetection());
      const tracked = continuableRecord();
      tracked.sdkHandle = { ...tracked.sdkHandle, supportsInterrupt: () => true,
        interrupt: async () => { tracked.info = { ...tracked.info, status: 'completed' }; await router.flushPending(AGENT_ID, tracked, dispatcher); },
      } as SdkHandle;
      const dispatcher = createDispatcher(async (_id, message) => {
        if (message === 'immediate') throw new Error('submit failed');
      });
      const queued = await router.route(AGENT_ID, tracked, 'queued', dispatcher);
      await expect(router.route(AGENT_ID, tracked, 'immediate', dispatcher, 'now', undefined, true))
        .rejects.toThrow(AgentInterruptedDeliveryError);
      expect(dispatcher.continueConversation).toHaveBeenCalledWith(AGENT_ID, 'queued', queued.messageId);
      expect(router.messageStatus(AGENT_ID, tracked, queued.messageId ?? '')).toEqual({ status: 'delivered' });
    });

    it('tracks pending, delivered, and session mismatch without forwarding to a new session', async () => {
      const router = new AgentMessageRouter(logger, createDetection());
      const tracked = continuableRecord();
      const dispatcher = createDispatcher();
      const first = await router.route(AGENT_ID, tracked, 'first', dispatcher);
      expect(first.messageId).toBeDefined();
      expect(router.messageStatus(AGENT_ID, tracked, first.messageId!)).toEqual({ status: 'pending' });
      await router.flushPending(AGENT_ID, tracked, dispatcher);
      expect(router.messageStatus(AGENT_ID, tracked, first.messageId!)).toEqual({ status: 'delivered' });
      const second = await router.route(AGENT_ID, tracked, 'second', dispatcher);
      tracked.info = { ...tracked.info, cliSessionId: 'session-2' };
      await router.flushPending(AGENT_ID, tracked, dispatcher);
      expect(router.messageStatus(AGENT_ID, tracked, second.messageId!)).toEqual({ status: 'failed', reason: 'session_changed' });
      expect(dispatcher.continueConversation).toHaveBeenCalledTimes(1);
    });

    it('fails every queued message for a superseded session', async () => {
      const router = new AgentMessageRouter(logger, createDetection());
      const tracked = continuableRecord();
      const dispatcher = createDispatcher();
      const first = await router.route(AGENT_ID, tracked, 'first', dispatcher);
      const second = await router.route(AGENT_ID, tracked, 'second', dispatcher);
      tracked.info = { ...tracked.info, cliSessionId: 'session-2' };

      await router.flushPending(AGENT_ID, tracked, dispatcher);

      expect(tracked.pendingMessages).toEqual([]);
      expect(router.messageStatus(AGENT_ID, tracked, first.messageId!)).toEqual({ status: 'failed', reason: 'session_changed' });
      expect(router.messageStatus(AGENT_ID, tracked, second.messageId!)).toEqual({ status: 'failed', reason: 'session_changed' });
      expect(dispatcher.continueConversation).not.toHaveBeenCalled();
    });

    it('settles concurrent flush calls once and marks in-flight teardown failed', async () => {
      const router = new AgentMessageRouter(logger, createDetection());
      const tracked = continuableRecord();
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const dispatcher = createDispatcher(async () => { await gate; });
      const first = await router.route(AGENT_ID, tracked, 'first', dispatcher);
      const second = await router.route(AGENT_ID, tracked, 'second', dispatcher);
      const flushing = router.flushPending(AGENT_ID, tracked, dispatcher);
      await router.flushPending(AGENT_ID, tracked, dispatcher);
      expect(dispatcher.continueConversation).toHaveBeenCalledTimes(1);
      expect(router.messageStatus(AGENT_ID, tracked, first.messageId!)).toEqual({ status: 'pending' });
      router.discardPending(AGENT_ID, tracked);
      release();
      await flushing;
      expect(router.messageStatus(AGENT_ID, tracked, first.messageId!)).toEqual({ status: 'failed', reason: 'agent_stopped' });
      expect(router.messageStatus(AGENT_ID, tracked, second.messageId!)).toEqual({ status: 'failed', reason: 'agent_stopped' });
    });

    it('refuses over the cap rather than dropping the message', async () => {
      const router = new AgentMessageRouter(logger, createDetection());
      const tracked = continuableRecord();
      const dispatcher = createDispatcher();

      for (let i = 0; i < MAX_PENDING_MESSAGES; i++) {
        const queued = await router.route(
          AGENT_ID,
          tracked,
          `m${i}`,
          dispatcher,
        );
        expect(queued.mode).toBe('queue-next-turn');
      }

      const refused = await router.route(
        AGENT_ID,
        tracked,
        'overflow',
        dispatcher,
      );

      expect(refused.mode).toBe('unsupported');
      expect(tracked.pendingMessages).toHaveLength(MAX_PENDING_MESSAGES);
      expect(tracked.pendingMessages).not.toContain('overflow');
    });

    it('flushes exactly one entry per settle, in arrival order', async () => {
      const router = new AgentMessageRouter(logger, createDetection());
      const tracked = continuableRecord();
      tracked.pendingMessages.push({ messageId: 'm1', cliSessionId: 'session-1', text: 'first' }, { messageId: 'm2', cliSessionId: 'session-1', text: 'second' });
      const dispatcher = createDispatcher();

      await router.flushPending(AGENT_ID, tracked, dispatcher);

      expect(dispatcher.continueConversation).toHaveBeenCalledTimes(1);
      expect(dispatcher.continueConversation).toHaveBeenCalledWith(
        AGENT_ID,
        'first',
        'm1',
      );
      expect(tracked.pendingMessages.map((entry) => entry.text)).toEqual(['second']);
    });

    it('is a no-op when nothing is queued', async () => {
      const router = new AgentMessageRouter(logger, createDetection());
      const dispatcher = createDispatcher();

      await router.flushPending(AGENT_ID, continuableRecord(), dispatcher);

      expect(dispatcher.continueConversation).not.toHaveBeenCalled();
    });

    it('drops the queue loudly when the subprocess was released', async () => {
      const router = new AgentMessageRouter(logger, createDetection());
      const tracked = continuableRecord();
      tracked.subprocessReleased = true;
      tracked.pendingMessages.push({ messageId: 'm1', cliSessionId: 'session-1', text: 'first' });
      const dispatcher = createDispatcher();

      await router.flushPending(AGENT_ID, tracked, dispatcher);

      expect(dispatcher.continueConversation).not.toHaveBeenCalled();
      expect(tracked.pendingMessages).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });

    it('logs a failed delivery instead of retrying it forever', async () => {
      const router = new AgentMessageRouter(logger, createDetection());
      const tracked = continuableRecord();
      tracked.pendingMessages.push({ messageId: 'm1', cliSessionId: 'session-1', text: 'first' });
      const dispatcher = createDispatcher(() =>
        Promise.reject(new Error('busy')),
      );

      await router.flushPending(AGENT_ID, tracked, dispatcher);

      expect(logger.error).toHaveBeenCalled();
      expect(tracked.pendingMessages).toEqual([]);
    });

    it('discardPending clears and reports what was still waiting', () => {
      const router = new AgentMessageRouter(logger, createDetection());
      const tracked = continuableRecord();
      tracked.pendingMessages.push({ messageId: 'm1', cliSessionId: 'session-1', text: 'a' }, { messageId: 'm2', cliSessionId: 'session-1', text: 'b' });

      router.discardPending(AGENT_ID, tracked);

      expect(tracked.pendingMessages).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Discarded queued messages'),
        expect.objectContaining({ dropped: 2 }),
      );
    });

    it('evicts terminal thread state when an agent record expires', () => {
      const router = new AgentMessageRouter(logger, createDetection());
      const tracked = continuableRecord();
      tracked.pendingMessages.push({ messageId: 'm1', cliSessionId: 'session-1', text: 'queued' });
      router.discardPending(AGENT_ID, tracked);
      expect(router.messageStatus(AGENT_ID, tracked, 'm1').status).toBe('failed');
      router.forgetAgent(AGENT_ID);
      expect(router.messageStatus(AGENT_ID, tracked, 'm1').status).toBe('unknown');
    });
  });

  it('logs the selected mode with the agent id and the CLI', async () => {
    const router = new AgentMessageRouter(logger, createDetection());
    const tracked = createRecord({ cli: 'cursor' });

    await router.route(AGENT_ID, tracked, 'hello', createDispatcher());

    expect(logger.info).toHaveBeenCalledWith(
      '[AgentMessageRouter] Message routed',
      expect.objectContaining({
        agentId: AGENT_ID,
        cli: 'cursor',
        mode: 'unsupported',
      }),
    );
  });
});

describe('AgentMessageRouter durable flush (dispatch journal)', () => {
  let logger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = createLogger();
  });

  const continuableRecord = (): MessageRoutableAgent => {
    const tracked = createRecord();
    tracked.sdkHandle = {
      supportsContinuation: () => true,
      continue: jest.fn(),
    } as unknown as SdkHandle;
    return tracked;
  };

  function createJournal(
    impl?: (messageId: string) => Promise<void>,
  ): jest.Mocked<AgentMessageDispatchJournal> {
    return {
      markDispatching: jest.fn(impl ?? (() => Promise.resolve())) as
        jest.MockedFunction<AgentMessageDispatchJournal['markDispatching']>,
    };
  }

  async function queue(router: AgentMessageRouter, tracked: MessageRoutableAgent, text: string, id: string): Promise<void> {
    const outcome = await router.route(AGENT_ID, tracked, text, createDispatcher(), 'queue', id);
    expect(outcome).toMatchObject({ mode: 'queue-next-turn', messageId: id });
  }

  it('awaits markDispatching before continueConversation', async () => {
    const order: string[] = [];
    const journal = createJournal(async (id) => {
      await Promise.resolve();
      order.push(`journal:${id}`);
    });
    const router = new AgentMessageRouter(logger, createDetection(), journal);
    const tracked = continuableRecord();
    await queue(router, tracked, 'first', 'env-1');
    const dispatcher = createDispatcher(async () => { order.push('continue'); });

    await router.flushPending(AGENT_ID, tracked, dispatcher);

    expect(order).toEqual(['journal:env-1', 'continue']);
    expect(dispatcher.continueConversation).toHaveBeenCalledWith(AGENT_ID, 'first', 'env-1');
    expect(router.messageStatus(AGENT_ID, tracked, 'env-1')).toEqual({ status: 'delivered' });
  });

  it('never calls continueConversation when the journal write rejects', async () => {
    const journal = createJournal(() => Promise.reject(new Error('storage down')));
    const router = new AgentMessageRouter(logger, createDetection(), journal);
    const tracked = continuableRecord();
    await queue(router, tracked, 'first', 'env-1');
    await queue(router, tracked, 'second', 'env-2');
    const dispatcher = createDispatcher();

    await router.flushPending(AGENT_ID, tracked, dispatcher);

    expect(dispatcher.continueConversation).not.toHaveBeenCalled();
    expect(tracked.pendingMessages.map((entry) => entry.messageId)).toEqual(['env-1', 'env-2']);
    expect(router.messageStatus(AGENT_ID, tracked, 'env-1'))
      .toEqual({ status: 'failed', reason: 'storage-unavailable' });
    expect(router.messageStatus(AGENT_ID, tracked, 'env-2')).toEqual({ status: 'pending' });
    expect(journal.markDispatching).toHaveBeenCalledTimes(1);
  });

  it('retries the held entry on the next settle once storage recovers', async () => {
    let failing = true;
    const journal = createJournal(() => failing ? Promise.reject(new Error('storage down')) : Promise.resolve());
    const router = new AgentMessageRouter(logger, createDetection(), journal);
    const tracked = continuableRecord();
    await queue(router, tracked, 'first', 'env-1');
    const dispatcher = createDispatcher();

    await router.flushPending(AGENT_ID, tracked, dispatcher);
    failing = false;
    await router.flushPending(AGENT_ID, tracked, dispatcher);

    expect(dispatcher.continueConversation).toHaveBeenCalledTimes(1);
    expect(router.messageStatus(AGENT_ID, tracked, 'env-1')).toEqual({ status: 'delivered' });
    expect(tracked.pendingMessages).toEqual([]);
  });

  it('does not journal a router-generated id that has no envelope', async () => {
    const journal = createJournal();
    const router = new AgentMessageRouter(logger, createDetection(), journal);
    const tracked = continuableRecord();
    await router.route(AGENT_ID, tracked, 'legacy', createDispatcher());
    const dispatcher = createDispatcher();

    await router.flushPending(AGENT_ID, tracked, dispatcher);

    expect(journal.markDispatching).not.toHaveBeenCalled();
    expect(dispatcher.continueConversation).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch or re-queue an entry torn down during the journal write', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const journal = createJournal(() => gate);
    const router = new AgentMessageRouter(logger, createDetection(), journal);
    const tracked = continuableRecord();
    await queue(router, tracked, 'first', 'env-1');
    const dispatcher = createDispatcher();

    const flushing = router.flushPending(AGENT_ID, tracked, dispatcher);
    router.discardPending(AGENT_ID, tracked);
    release();
    await flushing;

    expect(dispatcher.continueConversation).not.toHaveBeenCalled();
    expect(router.messageStatus(AGENT_ID, tracked, 'env-1'))
      .toEqual({ status: 'failed', reason: 'agent_stopped' });
  });

  it('fails only the rejected entry and reports the classified reason', async () => {
    const router = new AgentMessageRouter(logger, createDetection(), createJournal());
    const tracked = continuableRecord();
    await queue(router, tracked, 'first', 'env-1');
    await queue(router, tracked, 'second', 'env-2');
    const busy = Object.assign(new Error('The lane is still running.'), { code: 'busy' });
    busy.name = 'AgentContinueError';
    const dispatcher = createDispatcher(() => Promise.reject(busy));

    await router.flushPending(AGENT_ID, tracked, dispatcher);

    expect(router.messageStatus(AGENT_ID, tracked, 'env-1'))
      .toEqual({ status: 'failed', reason: 'continuation_transient' });
    expect(tracked.pendingMessages.map((entry) => entry.messageId)).toEqual(['env-2']);
    expect(router.messageStatus(AGENT_ID, tracked, 'env-2')).toEqual({ status: 'pending' });
  });

  it('reports an unclassified rejection as permanent', async () => {
    const router = new AgentMessageRouter(logger, createDetection());
    const tracked = continuableRecord();
    await queue(router, tracked, 'first', 'env-1');

    await router.flushPending(AGENT_ID, tracked, createDispatcher(() => Promise.reject(new Error('nope'))));

    expect(router.messageStatus(AGENT_ID, tracked, 'env-1'))
      .toEqual({ status: 'failed', reason: 'continuation_rejected' });
  });

  it('offers the next queued entry at once after a permanent rejection', async () => {
    const router = new AgentMessageRouter(logger, createDetection(), createJournal());
    const tracked = continuableRecord();
    await queue(router, tracked, 'first', 'env-1');
    await queue(router, tracked, 'second', 'env-2');
    const dispatcher = createDispatcher();
    dispatcher.continueConversation
      .mockImplementationOnce(() => Promise.reject(new Error('rejected')));

    await router.flushPending(AGENT_ID, tracked, dispatcher);

    expect(dispatcher.continueConversation).toHaveBeenCalledTimes(2);
    expect(router.messageStatus(AGENT_ID, tracked, 'env-1'))
      .toEqual({ status: 'failed', reason: 'continuation_rejected' });
    expect(router.messageStatus(AGENT_ID, tracked, 'env-2')).toEqual({ status: 'delivered' });
    expect(tracked.pendingMessages).toEqual([]);
  });
});

describe('AgentMessageRouter pause hold', () => {
  const PAUSE: AgentActionNotice = {
    actor: 'ptah-budget',
    action: 'paused',
    reason: 'weighted-budget',
    nextStep: 'write-notes-and-return',
    measured: 900,
    limit: 800,
    unit: 'tokens',
  };

  const pausedRecord = (status: AgentProcessInfo['status']): MessageRoutableAgent => {
    const tracked = createRecord({ laneAdmission: { budget: PAUSE } });
    tracked.info = { ...tracked.info, status };
    tracked.sdkHandle = {
      supportsContinuation: () => true,
      supportsInterrupt: () => true,
      interrupt: jest.fn(),
      continue: jest.fn(),
      steer: jest.fn().mockResolvedValue(undefined),
    } as unknown as SdkHandle;
    return tracked;
  };

  it('parks a queued message on an idle paused lane with the Ptah hold text', async () => {
    const router = new AgentMessageRouter(createLogger(), createDetection({ steer: true, interrupt: true, continuation: true }));
    const tracked = pausedRecord('completed');
    const dispatcher = createDispatcher();

    const outcome = await router.route(AGENT_ID, tracked, 'next task', dispatcher);

    expect(outcome.mode).toBe('queue-next-turn');
    expect(outcome.detail?.startsWith(formatBudgetPauseNotice(PAUSE, AGENT_ID))).toBe(true);
    expect(outcome.detail).toContain('It dispatches once the pause clears.');
    expect(tracked.pendingMessages.map((entry) => entry.text)).toEqual(['next task']);
    expect(dispatcher.continueConversation).not.toHaveBeenCalled();
    expect(router.messageStatus(AGENT_ID, tracked, outcome.messageId ?? '')).toEqual({ status: 'pending' });
  });

  it('holds a now message that would interrupt a running paused lane', async () => {
    const router = new AgentMessageRouter(createLogger(), createDetection({ steer: false, interrupt: true, continuation: true }));
    const tracked = pausedRecord('running');
    tracked.sdkHandle = { ...tracked.sdkHandle, steer: undefined } as unknown as SdkHandle;
    const dispatcher = createDispatcher();

    const outcome = await router.route(AGENT_ID, tracked, 'urgent', dispatcher, 'now', undefined, true);

    expect(outcome.mode).toBe('queue-next-turn');
    expect(tracked.sdkHandle?.interrupt).not.toHaveBeenCalled();
    expect(tracked.pendingMessages).toHaveLength(1);
  });

  it.each(['steer', 'now'] as const)('parks caller %s on a steer-capable paused lane', async (delivery) => {
    const router = new AgentMessageRouter(createLogger(), createDetection({ steer: true, interrupt: true, continuation: true }));
    const tracked = pausedRecord('running');

    const outcome = await router.route(AGENT_ID, tracked, 'caller message', createDispatcher(), delivery, 'env-1');

    expect(outcome).toEqual(expect.objectContaining({ mode: 'queue-next-turn', messageId: 'env-1' }));
    expect(tracked.sdkHandle?.steer).not.toHaveBeenCalled();
    expect(tracked.pendingMessages.map((entry) => entry.text)).toEqual(['caller message']);
    expect(router.messageStatus(AGENT_ID, tracked, 'env-1')).toEqual({ status: 'pending' });
  });

  it('retains the same receipt and journal reservation when paused during the journal write', async () => {
    let finishJournal!: () => void;
    const journal = {
      markDispatching: jest.fn(() => new Promise<void>((resolve) => { finishJournal = resolve; })),
    };
    const router = new AgentMessageRouter(createLogger(), createDetection({ steer: false, interrupt: false, continuation: true }), journal);
    const tracked = pausedRecord('running');
    tracked.laneAdmission = {};
    const dispatcher = createDispatcher();
    await router.route(AGENT_ID, tracked, 'first', dispatcher, 'queue', 'env-1');
    tracked.info = { ...tracked.info, status: 'completed' };

    const flush = router.flushPending(AGENT_ID, tracked, dispatcher);
    tracked.laneAdmission = { budget: PAUSE };
    finishJournal();
    await flush;

    expect(dispatcher.continueConversation).not.toHaveBeenCalled();
    expect(router.messageStatus(AGENT_ID, tracked, 'env-1')).toEqual({ status: 'pending' });

    tracked.laneAdmission = {};
    await router.flushPending(AGENT_ID, tracked, dispatcher);
    expect(journal.markDispatching).toHaveBeenCalledTimes(1);
    expect(dispatcher.continueConversation).toHaveBeenCalledWith(AGENT_ID, 'first', 'env-1');
    expect(router.messageStatus(AGENT_ID, tracked, 'env-1')).toEqual({ status: 'delivered' });
  });

  it('holds flushPending while paused without dropping, then flushes after the pause clears', async () => {
    const router = new AgentMessageRouter(createLogger(), createDetection({ steer: true, interrupt: true, continuation: true }));
    const tracked = pausedRecord('completed');
    const dispatcher = createDispatcher();
    const first = await router.route(AGENT_ID, tracked, 'first', dispatcher);
    const second = await router.route(AGENT_ID, tracked, 'second', dispatcher);

    await router.flushPending(AGENT_ID, tracked, dispatcher);

    expect(dispatcher.continueConversation).not.toHaveBeenCalled();
    expect(tracked.pendingMessages.map((entry) => entry.text)).toEqual(['first', 'second']);
    expect(router.messageStatus(AGENT_ID, tracked, first.messageId ?? '')).toEqual({ status: 'pending' });

    tracked.laneAdmission = {};
    await router.flushPending(AGENT_ID, tracked, dispatcher);

    expect(dispatcher.continueConversation).toHaveBeenCalled();
    expect(dispatcher.continueConversation.mock.calls[0]?.[1]).toContain('first');
    expect(router.messageStatus(AGENT_ID, tracked, first.messageId ?? '')).toEqual({ status: 'delivered' });
    expect(tracked.pendingMessages.map((entry) => entry.text)).toEqual(['second']);

    await router.flushPending(AGENT_ID, tracked, dispatcher);
    expect(router.messageStatus(AGENT_ID, tracked, second.messageId ?? '')).toEqual({ status: 'delivered' });
    expect(tracked.pendingMessages).toEqual([]);
  });

  it('does not hold on an ask notice', async () => {
    const router = new AgentMessageRouter(createLogger(), createDetection({ steer: true, interrupt: true, continuation: true }));
    const tracked = pausedRecord('completed');
    tracked.laneAdmission = { budget: { ...PAUSE, action: 'asked-handoff' } };
    const outcome = await router.route(AGENT_ID, tracked, 'go on', createDispatcher());
    expect(outcome.detail ?? '').not.toContain('paused new work');
  });
});

describe('AgentMessageRouter turn input and raw body', () => {
  const turn = { model: 'gpt-5', files: ['src/a.ts'] };
  const rawBody = '/compact';
  const continuable = (): MessageRoutableAgent => {
    const tracked = createRecord();
    tracked.sdkHandle = { supportsContinuation: () => true, continue: jest.fn() } as unknown as SdkHandle;
    return tracked;
  };

  it('keeps turn and rawBody on a parked entry and passes both at flush', async () => {
    const router = new AgentMessageRouter(createLogger(), createDetection());
    const tracked = continuable();
    const dispatcher = createDispatcher();
    const queued = await router.route(AGENT_ID, tracked, '[Ptah message] /compact', dispatcher, 'queue', 'env-1', false, { turn, rawBody });
    expect(queued.mode).toBe('queue-next-turn');
    expect(tracked.pendingMessages[0]).toMatchObject({ turn, rawBody, journaled: true });
    tracked.info = { ...tracked.info, status: 'completed' };
    await router.flushPending(AGENT_ID, tracked, dispatcher);
    expect(dispatcher.continueConversation).toHaveBeenCalledWith(AGENT_ID, '[Ptah message] /compact', 'env-1', turn, rawBody);
  });

  it('passes turn and rawBody on interrupt-resume', async () => {
    const router = new AgentMessageRouter(createLogger(), createDetection());
    const tracked = continuable();
    tracked.sdkHandle = { ...tracked.sdkHandle, supportsInterrupt: () => true,
      interrupt: async () => { tracked.info = { ...tracked.info, status: 'completed' }; },
    } as SdkHandle;
    const dispatcher = createDispatcher();
    const outcome = await router.route(AGENT_ID, tracked, 'formatted', dispatcher, 'now', 'env-2', true, { turn, rawBody });
    expect(outcome.mode).toBe('interrupt-resume');
    expect(dispatcher.continueConversation).toHaveBeenCalledWith(AGENT_ID, 'formatted', undefined, turn, rawBody);
  });

  it('refuses a settings change before interrupting, leaving the running turn alone (M4)', async () => {
    const router = new AgentMessageRouter(createLogger(), createDetection());
    const tracked = continuable();
    const interrupt = jest.fn();
    tracked.sdkHandle = { ...tracked.sdkHandle, supportsInterrupt: () => true, interrupt } as SdkHandle;
    const refusal = Object.assign(new Error('Codex did not accept the model gpt-x.'), { code: 'turn-options-refused' });
    refusal.name = 'AgentContinueError';
    const dispatcher = {
      ...createDispatcher(),
      prepareInterruptTurn: jest.fn().mockRejectedValue(refusal),
    };
    const outcome = await router.route(AGENT_ID, tracked, 'formatted', dispatcher, 'now', 'env-3', true, { turn, rawBody });
    expect(outcome).toMatchObject({
      mode: 'unsupported', reasonCode: 'turn-options-refused', detail: 'Codex did not accept the model gpt-x.',
    });
    expect(dispatcher.prepareInterruptTurn).toHaveBeenCalledWith(AGENT_ID, 'formatted', turn, rawBody);
    expect(interrupt).not.toHaveBeenCalled();
    expect(dispatcher.continueConversation).not.toHaveBeenCalled();
  });

  it('passes images and files as steer content, and text-only steers keep one argument', async () => {
    const router = new AgentMessageRouter(createLogger(), createDetection());
    const tracked = continuable();
    const steer = jest.fn().mockResolvedValue(undefined);
    tracked.sdkHandle = { ...tracked.sdkHandle, steer } as SdkHandle;
    const image = { data: 'aGk=', mediaType: 'image/png' };
    await router.route(AGENT_ID, tracked, 'look', createDispatcher(), 'now', undefined, false, { turn: { images: [image] } });
    expect(steer).toHaveBeenCalledWith('look', { images: [image] });
    await router.route(AGENT_ID, tracked, 'plain', createDispatcher(), 'now');
    expect(steer).toHaveBeenLastCalledWith('plain');
  });

  it('hides steer when the handle reports supportsSteer false (shared resolver)', async () => {
    const router = new AgentMessageRouter(createLogger(), createDetection());
    const tracked = continuable();
    tracked.sdkHandle = { ...tracked.sdkHandle, steer: jest.fn(), supportsSteer: () => false } as SdkHandle;
    const outcome = await router.route(AGENT_ID, tracked, 'now please', createDispatcher(), 'steer');
    expect(outcome).toMatchObject({ mode: 'unsupported', reasonCode: 'steer-unavailable' });
  });

  describe('user echo (L2/M5)', () => {
    const echoDispatcher = (impl?: () => Promise<void>) => {
      const dispatcher = createDispatcher(impl) as jest.Mocked<ContinuationDispatcher> & { recordAgentNote: jest.Mock };
      dispatcher.recordAgentNote = jest.fn();
      return dispatcher;
    };
    const idleRecord = (): MessageRoutableAgent => createRecord({
      info: { ...createRecord().info, status: 'completed' },
      sdkHandle: { supportsContinuation: () => true, continue: jest.fn() } as unknown as SdkHandle,
    });

    it('echoes the body of a delivered new turn as a user segment', async () => {
      const router = new AgentMessageRouter(createLogger(), createDetection());
      const dispatcher = echoDispatcher();
      await router.route(AGENT_ID, idleRecord(), '[Ptah message m1 from the user] hello', dispatcher,
        'queue', undefined, false, { rawBody: 'hello', echo: 'hello' });
      expect(dispatcher.recordAgentNote).toHaveBeenCalledWith(AGENT_ID,
        { type: 'user', content: 'hello', sentAt: expect.any(Number) });
    });

    it("carries the turn's images on the echo for the thumbnail (D5)", async () => {
      const router = new AgentMessageRouter(createLogger(), createDetection());
      const dispatcher = echoDispatcher();
      const images = [{ data: 'aGk=', mediaType: 'image/png' }];
      await router.route(AGENT_ID, idleRecord(), 'what colour?', dispatcher,
        'queue', undefined, false, { rawBody: 'what colour?', echo: 'what colour?', turn: { images } });
      expect(dispatcher.recordAgentNote).toHaveBeenCalledWith(AGENT_ID,
        { type: 'user', content: 'what colour?', sentAt: expect.any(Number), images });
    });

    it('echoes an image-only message: an empty body with its images (CR)', async () => {
      const router = new AgentMessageRouter(createLogger(), createDetection());
      const dispatcher = echoDispatcher();
      const images = [{ data: 'aGk=', mediaType: 'image/png' }];
      await router.route(AGENT_ID, idleRecord(), '[Ptah message m1 from the user]', dispatcher,
        'queue', undefined, false, { rawBody: '', echo: '', turn: { images } });
      expect(dispatcher.recordAgentNote).toHaveBeenCalledWith(AGENT_ID,
        { type: 'user', content: '', sentAt: expect.any(Number), images });
    });

    it('echoes nothing without an echo body, or when the turn was not delivered', async () => {
      const router = new AgentMessageRouter(createLogger(), createDetection());
      const dispatcher = echoDispatcher();
      await router.route(AGENT_ID, idleRecord(), 'from parent', dispatcher);
      const failing = echoDispatcher(() => Promise.reject(new Error('busy')));
      await router.route(AGENT_ID, idleRecord(), 'x', failing, 'queue', undefined, false, { echo: 'x' });
      expect(dispatcher.recordAgentNote).not.toHaveBeenCalled();
      expect(failing.recordAgentNote).not.toHaveBeenCalled();
    });

    it('echoes a queued message when the flush delivers it, not when it is parked', async () => {
      const router = new AgentMessageRouter(createLogger(), createDetection());
      const tracked = createRecord({
        sdkHandle: { supportsContinuation: () => true, continue: jest.fn() } as unknown as SdkHandle,
      });
      const dispatcher = echoDispatcher();
      await router.route(AGENT_ID, tracked, 'queued text', dispatcher, 'queue', undefined, false, { echo: 'queued' });
      expect(dispatcher.recordAgentNote).not.toHaveBeenCalled();
      tracked.info = { ...tracked.info, status: 'completed' };
      await router.flushPending(AGENT_ID, tracked, dispatcher);
      expect(dispatcher.recordAgentNote).toHaveBeenCalledWith(AGENT_ID,
        expect.objectContaining({ type: 'user', content: 'queued' }));
    });

    it('echoes an interrupt-and-send once the message is re-submitted', async () => {
      const router = new AgentMessageRouter(createLogger(), createDetection());
      const tracked = createRecord();
      tracked.sdkHandle = {
        supportsInterrupt: () => true,
        interrupt: jest.fn(async () => { tracked.info = { ...tracked.info, status: 'completed' }; }),
        supportsContinuation: () => true,
        continue: jest.fn(),
      } as unknown as SdkHandle;
      const dispatcher = echoDispatcher();
      const outcome = await router.route(AGENT_ID, tracked, 'redirect', dispatcher, 'now', undefined, true, { echo: 'redirect' });
      expect(outcome.mode).toBe('interrupt-resume');
      expect(dispatcher.recordAgentNote).toHaveBeenCalledWith(AGENT_ID,
        expect.objectContaining({ type: 'user', content: 'redirect' }));
    });
  });
});
