/**
 * HarnessLlmRunner — provider and model resolve together for the harness's
 * workspace, the way a chat session resolves them.
 *
 * The regression: the one-shot rode the process-wide auth env (the provider
 * configured last) while the model came from the settings, so after a
 * provider + model change the new provider was sent the previous model id.
 */

import 'reflect-metadata';

jest.mock('@ptah-extension/agent-sdk', () => ({
  ...jest.requireActual('@ptah-extension/agent-sdk'),
  SdkStreamProcessor: jest.fn().mockImplementation(() => ({
    process: () => mockProcess(),
  })),
}));

import type { Logger } from '@ptah-extension/vscode-core';
import { InternalQueryQueueTimeoutError } from '@ptah-extension/agent-sdk';
import type {
  InternalQueryConfig,
  InternalQueryHandle,
  InternalQueryService,
  IWorkspaceLlmResolver,
  StreamProcessorResult,
  WorkspaceLlmSnapshot,
} from '@ptah-extension/agent-sdk';
import { HarnessLlmRunner } from './harness-llm-runner.service';
import type {
  HarnessLlmExecuteParams,
  HarnessLlmRunArgs,
} from './harness-llm-runner.service';
import type { HarnessStreamBroadcaster } from '../streaming/harness-stream-broadcaster.service';

const mockProcess = jest.fn<Promise<StreamProcessorResult>, []>();

beforeEach(() => {
  mockProcess.mockReset().mockResolvedValue({
    structuredOutput: { ok: true },
    terminal: { kind: 'success' },
  });
});

function makeRunner(snapshot: WorkspaceLlmSnapshot) {
  const handle: InternalQueryHandle = {
    stream: (async function* () {
      /* no messages */
    })(),
    abort: jest.fn(),
    close: jest.fn(),
  };
  const execute = jest.fn<Promise<InternalQueryHandle>, [InternalQueryConfig]>()
    .mockResolvedValue(handle);
  const resolveForPath = jest.fn(async () => snapshot);
  const broadcaster = {
    createStreamEmitter: jest.fn(() => ({ emitter: {}, operationId: 'op-1' })),
    teeStreamWithFlatEvents: jest.fn((stream: unknown) => stream),
    broadcastComplete: jest.fn(),
    broadcastFlatComplete: jest.fn(),
  };
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const workspaceLlm: IWorkspaceLlmResolver = {
    resolveForPath,
    resolveSetup: jest.fn().mockRejectedValue(new Error('Unexpected Setup resolution')),
  };
  const runner = new HarnessLlmRunner(
    logger as unknown as Logger,
    { execute } as unknown as InternalQueryService,
    broadcaster as unknown as HarnessStreamBroadcaster,
    workspaceLlm,
  );
  return { runner, execute, resolveForPath, broadcaster, logger, handle };
}

const ARGS = {
  operation: 'design-agents',
  serviceTag: '[Test]',
  timeoutMs: 60_000,
  execute: {
    cwd: '/ws/project-a',
    prompt: 'p',
    systemPromptAppend: 's',
    mcpServerRunning: false,
    maxTurns: 1,
  },
} satisfies HarnessLlmRunArgs;

describe('HarnessLlmRunner — workspace provider and model', () => {
  it('runs on the provider and model of ONE snapshot resolved for its cwd', async () => {
    const auth = {
      env: { ANTHROPIC_AUTH_TOKEN: 'kimi-code-key' },
      baseUrl: 'https://api.kimi.ai/coding/',
    };
    const { runner, execute, resolveForPath } = makeRunner({
      providerId: 'kimi-code',
      model: 'kimi-k2.5',
      auth,
    });

    const result = await runner.run(ARGS);

    expect(resolveForPath).toHaveBeenCalledWith('/ws/project-a', {
      requestedModel: undefined,
    });
    const config = execute.mock.calls[0][0];
    expect(config.model).toBe('kimi-k2.5');
    expect(config.auth).toBe(auth);
    expect(config.cwd).toBe('/ws/project-a');
    expect(result.structuredOutput).toEqual({ ok: true });
  });

  it('passes a caller model to the resolver to validate rather than sending it as is', async () => {
    const { runner, execute, resolveForPath } = makeRunner({
      providerId: 'kimi-code',
      model: 'kimi-k2.5',
      auth: { env: {} },
    });

    await runner.run({
      ...ARGS,
      execute: { ...ARGS.execute, model: 'gpt-4o' },
    });

    expect(resolveForPath).toHaveBeenCalledWith('/ws/project-a', {
      requestedModel: 'gpt-4o',
    });
    expect(execute.mock.calls[0][0].model).toBe('kimi-k2.5');
  });

  it('with no isolated snapshot, omits auth and still uses the snapshot model', async () => {
    const { runner, execute } = makeRunner({
      providerId: 'openrouter',
      model: 'saved-model',
    });

    await runner.run(ARGS);

    const config = execute.mock.calls[0][0];
    expect(config.model).toBe('saved-model');
    expect(config).not.toHaveProperty('auth');
  });

  it('when the snapshot cannot be resolved, clears the abort timer and broadcasts failure', async () => {
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    const { runner, execute, resolveForPath, broadcaster } = makeRunner({
      providerId: 'kimi-code',
      model: 'kimi-k2.5',
    });
    resolveForPath.mockRejectedValueOnce(new Error('settings unreadable'));

    await expect(runner.run(ARGS)).rejects.toThrow('settings unreadable');

    expect(execute).not.toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();
    expect(broadcaster.broadcastComplete).toHaveBeenCalledWith(
      'design-agents',
      'op-1',
      false,
      'Could not start the AI request',
    );
    expect(broadcaster.broadcastFlatComplete).toHaveBeenCalledWith(
      'op-1',
      false,
      'Could not start the AI request',
    );
    clearSpy.mockRestore();
  });
});

describe('HarnessLlmRunner SDK outcomes and attribution', () => {
  const snapshot = { providerId: 'kimi-code', model: 'configured-model' };
  const configured = { provider: snapshot.providerId, model: snapshot.model };
  const submitted = { provider: 'kimi-code', model: 'effective-model' };

  it('uses the supplied snapshot and returns raw result text and the SDK success terminal', async () => {
    const { runner, execute, resolveForPath, handle, broadcaster } = makeRunner(snapshot);
    const resolved = { ...snapshot, auth: { env: {} } };
    const stageTrace: NonNullable<HarnessLlmExecuteParams['stageTrace']> = {};
    const resultText = ' ```json\n{"items":[]}\n``` ';
    mockProcess.mockResolvedValueOnce({
      resultText,
      structuredOutput: null,
      terminal: { kind: 'success' },
    });
    execute.mockImplementationOnce(async (config) => {
      expect(stageTrace).toEqual({ pairConfigured: configured });
      expect(config.auth).toBe(resolved.auth);
      expect(config.model).toBe(resolved.model);
      config.onProviderSubmit?.(submitted);
      expect(stageTrace).toEqual({ pairConfigured: configured, pairAttempted: submitted });
      return handle;
    });

    expect(await runner.run({
      ...ARGS,
      execute: { ...ARGS.execute, resolved, stageTrace },
    })).toEqual({
      structuredOutput: null,
      postProcessed: undefined,
      resultText,
      terminal: { kind: 'success' },
    });

    expect(resolveForPath).not.toHaveBeenCalled();
    expect(stageTrace).toEqual({
      pairConfigured: configured,
      pairAttempted: submitted,
      pairUsed: submitted,
    });
    expect(broadcaster.broadcastFlatComplete).toHaveBeenCalledWith('op-1', true);
    expect(handle.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    { kind: 'provider-error', subtype: 'private provider detail' },
    undefined,
  ] satisfies StreamProcessorResult['terminal'][])(
    'reports failure and leaves pairUsed unset for terminal %p',
    async (terminal) => {
      const { runner, execute, handle, broadcaster, logger } = makeRunner(snapshot);
      const stageTrace = {};
      const postProcess = jest.fn(() => 'processed');
      mockProcess.mockResolvedValueOnce({ structuredOutput: null, terminal });
      execute.mockImplementationOnce(async ({ onProviderSubmit }) => {
        onProviderSubmit?.(submitted);
        return handle;
      });

      const result = await runner.run({
        ...ARGS,
        execute: { ...ARGS.execute, stageTrace },
        postProcess,
      });

      expect(result.terminal).toEqual(terminal);
      expect(postProcess).toHaveBeenCalledWith(null);
      expect(result.postProcessed).toBe('processed');
      expect(stageTrace).toEqual({ pairConfigured: configured, pairAttempted: submitted });
      expect(broadcaster.broadcastComplete.mock.calls).toEqual([
        ['design-agents', 'op-1', false, 'The AI request did not complete successfully'],
      ]);
      expect(broadcaster.broadcastFlatComplete.mock.calls).toEqual([
        ['op-1', false, 'The AI request did not complete successfully'],
      ]);
      expect(logger.warn.mock.calls).toEqual([
        ['[Test] The AI request did not complete successfully', { category: 'provider-error' }],
      ]);
    },
  );

  it.each([
    [new InternalQueryQueueTimeoutError(50), 'queue-timed-out', 'Timed out waiting for an AI provider slot'],
    [new Error('private startup error'), 'pre-dispatch-error', 'Could not start the AI request'],
  ])('classifies %p before submission and rethrows it to the caller', async (error, category, message) => {
    const { runner, execute, broadcaster, logger } = makeRunner(snapshot);
    const stageTrace = {};
    execute.mockRejectedValueOnce(error);

    await expect(runner.run({
      ...ARGS,
      execute: { ...ARGS.execute, stageTrace },
    })).rejects.toBe(error);

    expect(stageTrace).toEqual({ pairConfigured: configured });
    expect(broadcaster.broadcastFlatComplete.mock.calls).toEqual([['op-1', false, message]]);
    expect(logger.warn.mock.calls).toEqual([[`[Test] ${message}`, { category }]]);
  });

  it.each([false, true])('classifies the deadline as timed-out with submission %p', async (didSubmit) => {
    jest.useFakeTimers();
    try {
      const { runner, execute, handle, broadcaster, logger } = makeRunner(snapshot);
      const stageTrace = {};
      execute.mockImplementationOnce(({ abortController, onProviderSubmit }) => {
        if (didSubmit) onProviderSubmit?.(submitted);
        // After cancellation, a late success from the SDK cannot mark the pair used.
        return new Promise((resolve) => {
          abortController?.signal.addEventListener('abort', () => resolve(handle), { once: true });
        });
      });

      const run = runner.run({
        ...ARGS,
        timeoutMs: 50,
        execute: { ...ARGS.execute, stageTrace },
      });
      const expectedTrace = {
        pairConfigured: configured,
        ...(didSubmit ? { pairAttempted: submitted } : {}),
      };
      const rejection = expect(run).rejects.toMatchObject({ name: 'AbortError' });
      await Promise.resolve();
      expect(stageTrace).toEqual(expectedTrace);
      await jest.advanceTimersByTimeAsync(50);
      await rejection;

      expect(stageTrace).toEqual(expectedTrace);
      expect(logger.warn.mock.calls).toEqual([
        ['[Test] The AI request timed out', { category: 'timed-out' }],
      ]);
      expect(broadcaster.broadcastFlatComplete.mock.calls).toEqual([
        ['op-1', false, 'The AI request timed out'],
      ]);
      expect(handle.close).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('HarnessLlmRunner isolated skill ranking execution', () => {
  it('resolves workspace credentials while forwarding scratch cwd, tool prohibition, schema and turn budget', async () => {
    const { runner, execute, resolveForPath } = makeRunner({
      providerId: 'fake',
      model: 'workspace-model',
      auth: { env: {} },
    });
    const schema = {
      type: 'object',
      properties: { items: { type: 'object' } },
    };
    await runner.run({
      ...ARGS,
      operation: 'generate-skills',
      timeoutMs: 15000,
      execute: {
        ...ARGS.execute,
        cwd: 'D:\\fake-scratch',
        workspaceRoot: 'D:\\fake-workspace',
        toolAccess: 'none',
        maxTurns: 2,
        outputFormat: { type: 'json_schema', schema },
      },
    });
    expect(resolveForPath).toHaveBeenCalledWith('D:\\fake-workspace', {
      requestedModel: undefined,
    });
    const config = execute.mock.calls[0][0];
    expect(config.cwd).toBe('D:\\fake-scratch');
    expect(config.model).toBe('workspace-model');
    expect(config.toolAccess).toBe('none');
    expect(config.maxTurns).toBe(2);
    expect(config.outputFormat).toEqual({ type: 'json_schema', schema });
    expect(config.mcpServerRunning).toBe(false);
  });
});
