/**
 * The executor carries the watchdog's overdue report to the host UI and withdraws it when
 * the session shows activity again (TASK_2026_2310). The notice informs only: the session is
 * never aborted for it.
 */
import 'reflect-metadata';
import type { Logger } from '@ptah-extension/vscode-core';
import type {
  AISessionConfig,
  AgentNoticeEvent,
  AuthEnv,
  ISdkPermissionHandler,
} from '@ptah-extension/shared';
import { NO_ACTIVITY_TIMEOUT_MS, NoActivityWatchdog } from '../no-activity-watchdog';
import { SessionQueryExecutor } from './session-query-executor.service';
import { SessionRegistry } from './session-registry.service';
import { SessionStreamPump } from './session-stream-pump.service';
import type { SdkModuleLoader } from '../sdk-module-loader';
import type { SdkQueryOptionsBuilder } from '../sdk-query-options-builder';
import type { SdkMessageFactory } from '../sdk-message-factory';
import type { SdkQueryRunner } from '../sdk-query-runner.service';
import type { ExecuteQueryConfig, Query, SDKUserMessage } from '../session-lifecycle-manager';

function makeLogger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as Logger;
}

function makeHarness(notifyAll: jest.Mock) {
  const logger = makeLogger();
  const registry = new SessionRegistry(logger);
  const messageFactory = {
    createUserMessage: jest.fn().mockResolvedValue({
      type: 'user',
      session_id: 's',
      message: { role: 'user', content: 'hi' },
      parent_tool_use_id: null,
    }),
  } as unknown as SdkMessageFactory;
  const streamPump = new SessionStreamPump(logger, registry, messageFactory);
  const permissionHandler = {
    getPermissionLevel: jest.fn().mockReturnValue('yolo'),
    cleanupPendingPermissions: jest.fn(),
  } as unknown as ISdkPermissionHandler;
  const moduleLoader = {
    getQueryFunction: jest.fn().mockResolvedValue(jest.fn()),
  } as unknown as SdkModuleLoader;
  const queryOptionsBuilder = {
    build: jest.fn().mockImplementation(async (input: { userMessageStream: AsyncIterable<SDKUserMessage> }) => ({
      options: { model: 'test-model', cwd: '/tmp/test' },
      prompt: input.userMessageStream,
    })),
  } as unknown as SdkQueryOptionsBuilder;
  const sdkQuery = {
    streamInput: jest.fn().mockResolvedValue(undefined),
    interrupt: async () => undefined,
  } as unknown as Query;
  const queryRunner = {
    invokeWithLoadedQuery: jest.fn().mockReturnValue({ sdkQuery }),
  } as unknown as SdkQueryRunner;
  const executor = new SessionQueryExecutor(
    logger,
    registry,
    streamPump,
    permissionHandler,
    moduleLoader,
    queryOptionsBuilder,
    messageFactory,
    {} as AuthEnv,
    queryRunner,
    null,
    null,
    null,
    null,
    null,
    null,
    { notifyAll },
  );
  return { executor, registry, logger };
}

const CONFIG: ExecuteQueryConfig = {
  sessionId: 'tab-overdue' as ExecuteQueryConfig['sessionId'],
  sessionConfig: { model: 'test-model', projectPath: '/tmp/test', tabId: 'tab-overdue' } as AISessionConfig,
  initialPrompt: { content: 'hi', files: [], images: [] },
};

async function hook(wd: NoActivityWatchdog, input: Record<string, unknown>): Promise<void> {
  const event = input['hook_event_name'] as 'PreToolUse' | 'PostToolUse';
  await wd.lifecycleHooks()[event]?.[0]?.hooks[0](
    input as never,
    undefined,
    { signal: new AbortController().signal },
  );
}

describe('SessionQueryExecutor — overdue session notice (TASK_2026_2310)', () => {
  afterEach(() => jest.useRealTimers());

  async function startWatchdog(notifyAll: jest.Mock) {
    const h = makeHarness(notifyAll);
    const result = await h.executor.executeQuery(CONFIG);
    const rec = h.registry.find('tab-overdue');
    const wd = rec?.activityHold as NoActivityWatchdog;
    jest.useFakeTimers();
    wd.beginTurn();
    wd.start();
    return { ...h, result, rec, wd };
  }

  it('announces an overdue wait with the session and tab ids, without aborting', async () => {
    const notifyAll = jest.fn();
    const { wd, result, rec } = await startWatchdog(notifyAll);
    await hook(wd, { hook_event_name: 'PreToolUse', tool_use_id: 't1', tool_name: 'Bash' });

    jest.advanceTimersByTime(NO_ACTIVITY_TIMEOUT_MS);

    expect(notifyAll).toHaveBeenCalledTimes(1);
    const event = notifyAll.mock.calls[0][0] as Extract<AgentNoticeEvent, { kind: 'session-overdue' }>;
    expect(event).toMatchObject({
      kind: 'session-overdue',
      sessionId: rec?.realSessionId ?? 'tab-overdue',
      tabId: 'tab-overdue',
      overdue: true,
      operations: ['Bash'],
    });
    expect(event.text).toContain('still waiting for Bash');
    expect(result.abortController.signal.aborted).toBe(false);
  });

  it('withdraws the notice when activity resumes', async () => {
    const notifyAll = jest.fn();
    const { wd } = await startWatchdog(notifyAll);
    await hook(wd, { hook_event_name: 'PreToolUse', tool_use_id: 't1', tool_name: 'Bash' });
    jest.advanceTimersByTime(NO_ACTIVITY_TIMEOUT_MS);
    await hook(wd, { hook_event_name: 'PostToolUse', tool_use_id: 't1', tool_name: 'Bash' });

    expect(notifyAll).toHaveBeenCalledTimes(2);
    expect(notifyAll.mock.calls[1][0]).toMatchObject({
      kind: 'session-overdue',
      tabId: 'tab-overdue',
      overdue: false,
      operations: [],
      text: '',
    });
  });

  it('keeps the session running when the notice sink throws', async () => {
    const notifyAll = jest.fn(() => {
      throw new Error('sink down');
    });
    const { wd, result, logger } = await startWatchdog(notifyAll);
    await hook(wd, { hook_event_name: 'PreToolUse', tool_use_id: 't1', tool_name: 'Bash' });

    expect(() => jest.advanceTimersByTime(NO_ACTIVITY_TIMEOUT_MS)).not.toThrow();
    expect(result.abortController.signal.aborted).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });
});
