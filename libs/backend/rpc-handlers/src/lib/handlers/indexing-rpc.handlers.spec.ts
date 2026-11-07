/**
 * Unit tests for IndexingRpcHandlers.
 *
 * Verifies that each of the 8 RPC methods correctly delegates to
 * IndexingControlService and returns the expected result shape.
 * All dependencies are mocked — no real SQLite or CodeSymbolIndexer.
 */

import 'reflect-metadata';
import { container } from 'tsyringe';
import { TOKENS } from '@ptah-extension/vscode-core';
import { MEMORY_TOKENS } from '@ptah-extension/memory-curator';
import type {
  IndexingRunDeps,
  IndexingStatus,
} from '@ptah-extension/memory-curator';
import type { RpcMethodName } from '@ptah-extension/shared';
import { IndexingRpcHandlers } from './indexing-rpc.handlers';

// ---- Helpers -----------------------------------------------------------------

function makeStatus(overrides: Partial<IndexingStatus> = {}): IndexingStatus {
  return {
    state: 'never-indexed',
    running: null,
    lastRun: null,
    workspaceFingerprint: 'fp-abc',
    gitHeadSha: null,
    currentGitHeadSha: null,
    lastIndexedAt: null,
    symbolsEnabled: true,
    memoryEnabled: true,
    symbolsCursor: null,
    disclosureAcknowledgedAt: null,
    lastDismissedStaleSha: null,
    errorMessage: null,
    codeSymbolCount: 0,
    memoryChunkCount: 0,
    vec: { ok: false, reason: 'binary-missing' },
    embedder: { ready: true },
    ...overrides,
  };
}

function censusPromise<T>(result: Promise<T>, joined: boolean): Promise<T> & {
  joinedActiveCensus: boolean;
} {
  return Object.assign(result, { joinedActiveCensus: joined });
}

// ---- Mock factories ----------------------------------------------------------

function makeLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  };
}

function makeRpcHandler() {
  const methods = new Map<string, (params: unknown) => Promise<unknown>>();
  return {
    registerMethod: jest.fn(
      (name: string, fn: (p: unknown) => Promise<unknown>) => {
        methods.set(name, fn);
      },
    ),
    call: async (name: string, params: unknown) => {
      const fn = methods.get(name);
      if (!fn) throw new Error(`No handler for ${name}`);
      return fn(params);
    },
  };
}

function makeIndexingControlService(statusOverride?: Partial<IndexingStatus>) {
  return {
    getStatus: jest.fn().mockResolvedValue(makeStatus(statusOverride)),
    start: jest.fn().mockResolvedValue(undefined),
    isRunning: jest.fn().mockReturnValue(false),
    pause: jest.fn(),
    resume: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn(),
    setPipelineEnabled: jest.fn().mockResolvedValue(undefined),
    dismissStale: jest.fn().mockResolvedValue(undefined),
    acknowledgeDisclosure: jest.fn().mockResolvedValue(undefined),
    setSymbolWatcher: jest.fn(),
    onProgress: jest.fn().mockReturnValue(() => undefined),
  };
}

// ---- Test setup -------------------------------------------------------------

function buildHandlers() {
  const logger = makeLogger();
  const rpcHandler = makeRpcHandler();
  const indexingControl = makeIndexingControlService();

  const childContainer = container.createChildContainer();
  childContainer.registerInstance(TOKENS.LOGGER, logger);
  childContainer.registerInstance(TOKENS.RPC_HANDLER, rpcHandler);
  childContainer.registerInstance(
    MEMORY_TOKENS.INDEXING_CONTROL,
    indexingControl,
  );
  childContainer.register(IndexingRpcHandlers, {
    useClass: IndexingRpcHandlers,
  });

  const handlers = childContainer.resolve(IndexingRpcHandlers);
  handlers.register();

  return { handlers, rpcHandler, indexingControl, logger };
}

// ---- Tests -------------------------------------------------------------------

describe('IndexingRpcHandlers', () => {
  describe('METHODS tuple', () => {
    it('satisfies readonly RpcMethodName[] (compile-time verified by satisfies keyword)', () => {
      // If the satisfies constraint fails the file won't compile. This runtime
      // check is belt-and-suspenders to confirm the tuple is populated.
      expect(IndexingRpcHandlers.METHODS).toHaveLength(8);
      const expected: readonly RpcMethodName[] = [
        'indexing:getStatus',
        'indexing:start',
        'indexing:pause',
        'indexing:resume',
        'indexing:cancel',
        'indexing:setPipelineEnabled',
        'indexing:dismissStale',
        'indexing:acknowledgeDisclosure',
      ];
      expect(IndexingRpcHandlers.METHODS).toEqual(expected);
    });

    it('registers exactly 8 RPC methods', () => {
      const { rpcHandler } = buildHandlers();
      expect(rpcHandler.registerMethod).toHaveBeenCalledTimes(8);
    });
  });

  describe('indexing:getStatus', () => {
    it('returns IndexingStatusWire from IndexingControlService.getStatus', async () => {
      const { rpcHandler, indexingControl } = buildHandlers();
      indexingControl.getStatus.mockResolvedValueOnce(
        makeStatus({ state: 'indexed', lastIndexedAt: 1234567890 }),
      );

      const result = await rpcHandler.call('indexing:getStatus', {
        workspaceRoot: '/workspace',
      });

      expect(indexingControl.getStatus).toHaveBeenCalledWith('/workspace');
      expect(result).toMatchObject({
        status: {
          state: 'indexed',
          lastIndexedAt: 1234567890,
        },
      });
    });

    it('passes fileCount through to the wire status', async () => {
      const { rpcHandler, indexingControl } = buildHandlers();
      indexingControl.getStatus.mockResolvedValueOnce(
        makeStatus({ fileCount: 412 }),
      );

      const result = await rpcHandler.call('indexing:getStatus', {
        workspaceRoot: '/workspace',
      });

      expect(result).toMatchObject({ status: { fileCount: 412 } });
    });

    it('omits fileCount from the wire status when it is unknown', async () => {
      const { rpcHandler } = buildHandlers();

      const result = (await rpcHandler.call('indexing:getStatus', {
        workspaceRoot: '/workspace',
      })) as { status: Record<string, unknown> };

      expect(result.status).not.toHaveProperty('fileCount');
    });

    it('maps running and lastRun onto the wire status', async () => {
      const { rpcHandler, indexingControl } = buildHandlers();
      const running = {
        origin: 'background' as const,
        startedAt: 10,
        force: false,
        joinedBackground: true,
        processed: 3,
        total: 9,
      };
      const lastRun = {
        origin: 'manual' as const,
        outcome: 'succeeded' as const,
        startedAt: 1,
        finishedAt: 5,
        durationMs: 4,
        filesScanned: 9,
        symbolsIndexed: 90,
        errors: 0,
      };
      indexingControl.getStatus.mockResolvedValueOnce(
        makeStatus({ state: 'indexing', running, lastRun }),
      );

      const result = (await rpcHandler.call('indexing:getStatus', {
        workspaceRoot: '/workspace',
      })) as { status: Record<string, unknown> };

      expect(result.status['running']).toEqual(running);
      expect(result.status['lastRun']).toEqual(lastRun);
    });

    it('returns empty status when workspaceRoot is missing', async () => {
      const { rpcHandler } = buildHandlers();
      const result = await rpcHandler.call('indexing:getStatus', {});
      expect(result).toMatchObject({ status: { state: 'never-indexed' } });
    });
  });

  describe('indexing:start', () => {
    it('delegates to IndexingControlService.start and returns accepted:true', async () => {
      const { rpcHandler, indexingControl, handlers } = buildHandlers();
      indexingControl.getStatus.mockResolvedValueOnce(
        makeStatus({ state: 'indexing' }),
      );
      handlers.setRunDeps({
        runSymbols: jest.fn().mockResolvedValue(undefined),
      });

      const result = await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
      });

      expect(result).toMatchObject({ accepted: true, state: 'indexing' });
    });

    it('passes force:true when requested (Re-index button path)', async () => {
      const { rpcHandler, indexingControl, handlers } = buildHandlers();
      indexingControl.getStatus.mockResolvedValueOnce(
        makeStatus({ state: 'indexing' }),
      );
      const runSymbols = jest.fn().mockResolvedValue(undefined);
      handlers.setRunDeps({ runSymbols });

      await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
        force: true,
      });

      // Allow the fire-and-forget promise to settle
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(indexingControl.start).toHaveBeenCalledWith(
        undefined,
        '/workspace',
        expect.anything(),
        { force: true },
      );
    });

    it('passes pipeline filter when provided', async () => {
      const { rpcHandler, indexingControl, handlers } = buildHandlers();
      indexingControl.getStatus.mockResolvedValueOnce(
        makeStatus({ state: 'indexing' }),
      );
      handlers.setRunDeps({
        runSymbols: jest.fn().mockResolvedValue(undefined),
      });

      await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
        pipeline: 'symbols',
      });

      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(indexingControl.start).toHaveBeenCalledWith(
        'symbols',
        '/workspace',
        expect.anything(),
        { force: undefined },
      );
    });

    it('refuses with indexer-not-ready when runDeps not set', async () => {
      const { rpcHandler } = buildHandlers();
      // handlers.setRunDeps is NOT called
      const result = await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
      });
      expect(result).toEqual({
        accepted: false,
        reason: 'indexer-not-ready',
        state: 'never-indexed',
      });
    });

    it('refuses with no-workspace when workspaceRoot is missing', async () => {
      const { rpcHandler } = buildHandlers();
      const result = await rpcHandler.call('indexing:start', {});
      expect(result).toEqual({
        accepted: false,
        reason: 'no-workspace',
        state: 'never-indexed',
      });
    });

    it('refuses with already-running while a manual run is active', async () => {
      const { rpcHandler, indexingControl, handlers } = buildHandlers();
      handlers.setRunDeps({
        runSymbols: jest.fn().mockResolvedValue(undefined),
      });
      indexingControl.isRunning.mockReturnValue(true);

      const result = await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
      });

      expect(result).toEqual({
        accepted: false,
        reason: 'already-running',
        state: 'indexing',
      });
      expect(indexingControl.start).not.toHaveBeenCalled();
    });

    it('accepts a start during a background-only run (it joins the census)', async () => {
      const { rpcHandler, indexingControl, handlers } = buildHandlers();
      const runSymbols = jest.fn().mockResolvedValue(undefined);
      handlers.setRunDeps({
        runSymbols,
      });
      indexingControl.start.mockImplementationOnce(
        async (_pipeline: unknown, root: string, deps: IndexingRunDeps) => {
          await deps.runSymbols(root);
        },
      );
      indexingControl.isRunning.mockReturnValue(false);
      indexingControl.getStatus.mockResolvedValueOnce(
        makeStatus({
          state: 'indexing',
          running: { origin: 'background', startedAt: 1, force: false },
        }),
      );

      const result = await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
      });

      expect(result).toEqual({ accepted: true, state: 'indexing' });
      expect(indexingControl.start).toHaveBeenCalledTimes(1);
      expect(runSymbols).toHaveBeenCalledTimes(1);
    });

    it('runs one forced follow-up after a background join, coalescing further forced starts', async () => {
      const { rpcHandler, indexingControl, handlers } = buildHandlers();
      let finishJoined!: () => void;
      const joined = new Promise<void>((resolve) => {
        finishJoined = resolve;
      });
      const bootStats = {
        filesScanned: 1,
        symbolsIndexed: 1,
        errors: 0,
        durationMs: 1,
      };
      const freshStats = { ...bootStats, filesScanned: 2, symbolsIndexed: 2 };
      const runSymbols = jest
        .fn()
        .mockImplementationOnce(() =>
          censusPromise(joined.then(() => bootStats), true),
        )
        .mockResolvedValue(freshStats);
      let completedStats:
        | Awaited<ReturnType<IndexingRunDeps['runSymbols']>>
        | undefined;
      indexingControl.start.mockImplementationOnce(
        async (_pipeline: unknown, root: string, deps: IndexingRunDeps) => {
          completedStats = await deps.runSymbols(root);
        },
      );
      indexingControl.getStatus.mockResolvedValue(
        makeStatus({
          state: 'indexing',
          running: { origin: 'background', startedAt: 1, force: false },
        }),
      );
      handlers.setRunDeps({
        runSymbols,
      });

      await Promise.all([
        rpcHandler.call('indexing:start', {
          workspaceRoot: '/workspace',
          force: true,
        }),
        rpcHandler.call('indexing:start', {
          workspaceRoot: '/workspace/',
          force: true,
        }),
      ]);
      indexingControl.isRunning.mockReturnValue(true);
      await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace/',
        force: true,
      });
      await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
        force: true,
      });
      expect(indexingControl.start).toHaveBeenCalledTimes(1);
      expect(runSymbols).toHaveBeenCalledTimes(1);

      finishJoined();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(indexingControl.start).toHaveBeenCalledTimes(1);
      expect(runSymbols).toHaveBeenCalledTimes(2);
      expect(completedStats).toEqual(freshStats);
      indexingControl.isRunning.mockReturnValue(false);
      await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
        force: true,
      });
      expect(indexingControl.start).toHaveBeenCalledTimes(2);
    });

    it('does not schedule a follow-up when the forced joiner aborts', async () => {
      const { rpcHandler, indexingControl, handlers } = buildHandlers();
      const controller = new AbortController();
      indexingControl.getStatus.mockResolvedValue(
        makeStatus({
          running: { origin: 'background', startedAt: 1, force: false },
        }),
      );
      indexingControl.start.mockImplementationOnce(
        async (_pipeline: unknown, root: string, deps: IndexingRunDeps) => {
          await deps.runSymbols(root, { signal: controller.signal });
        },
      );
      const runSymbols = jest.fn().mockImplementationOnce(() => {
        controller.abort();
        return censusPromise(
          Promise.reject(new DOMException('Aborted', 'AbortError')),
          true,
        );
      });
      handlers.setRunDeps({ runSymbols });

      await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
        force: true,
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(indexingControl.start).toHaveBeenCalledTimes(1);
      expect(runSymbols).toHaveBeenCalledTimes(1);
    });

    it('does not start fresh when the joined boot census rejects with AbortError', async () => {
      const { rpcHandler, indexingControl, handlers } = buildHandlers();
      const abortError = new Error('boot shutdown');
      abortError.name = 'AbortError';
      const runSymbols = jest.fn().mockImplementationOnce(() =>
        censusPromise(Promise.reject(abortError), true),
      );
      handlers.setRunDeps({ runSymbols });
      indexingControl.start.mockImplementationOnce(
        async (_pipeline: unknown, root: string, deps: IndexingRunDeps) => {
          await deps.runSymbols(root);
        },
      );

      await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
        force: true,
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(runSymbols).toHaveBeenCalledTimes(1);
    });

    it('detects boot joining after the forced start begins', async () => {
      const { rpcHandler, indexingControl, handlers } = buildHandlers();
      let continueSetup!: () => void;
      const setup = new Promise<void>((resolve) => {
        continueSetup = resolve;
      });
      const runSymbols = jest
        .fn()
        .mockImplementationOnce(() =>
          censusPromise(Promise.resolve(undefined), true),
        )
        .mockResolvedValue(undefined);
      handlers.setRunDeps({ runSymbols });
      indexingControl.start.mockImplementationOnce(
        async (_pipeline: unknown, root: string, deps: IndexingRunDeps) => {
          await setup;
          await deps.runSymbols(root);
        },
      );
      indexingControl.getStatus.mockResolvedValue(makeStatus());

      await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
        force: true,
      });
      continueSetup();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(runSymbols).toHaveBeenCalledTimes(2);
    });

    it('runs fresh after a rejected boot join and clears pending after rejection', async () => {
      const { rpcHandler, indexingControl, handlers, logger } = buildHandlers();
      const bootFailure = new Error('boot failed');
      const runSymbols = jest
        .fn()
        .mockImplementationOnce(() =>
          censusPromise(Promise.reject(bootFailure), true),
        )
        .mockResolvedValueOnce(undefined)
        .mockImplementationOnce(() =>
          censusPromise(Promise.reject(new Error('fresh failed')), false),
        )
        .mockResolvedValue(undefined);
      handlers.setRunDeps({ runSymbols });
      indexingControl.start.mockImplementation(
        async (_pipeline: unknown, root: string, deps: IndexingRunDeps) => {
          await deps.runSymbols(root);
        },
      );

      await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
        force: true,
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(runSymbols).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        '[indexing] joined boot census failed; starting fresh census',
        bootFailure,
      );
      await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
        force: true,
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(runSymbols).toHaveBeenCalledTimes(3);
      await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
        force: true,
      });
      expect(runSymbols).toHaveBeenCalledTimes(4);
    });

    it('refuses pipeline mismatch and starts arriving during fresh discovery', async () => {
      const { rpcHandler, indexingControl, handlers } = buildHandlers();
      let finishBoot!: () => void;
      const boot = new Promise<void>((resolve) => {
        finishBoot = resolve;
      });
      let finishFresh!: () => void;
      const fresh = new Promise<void>((resolve) => {
        finishFresh = resolve;
      });
      const runSymbols = jest
        .fn()
        .mockImplementationOnce(() => censusPromise(boot, true))
        .mockImplementationOnce(() => censusPromise(fresh, false));
      handlers.setRunDeps({ runSymbols });
      indexingControl.start.mockImplementationOnce(
        async (_pipeline: unknown, root: string, deps: IndexingRunDeps) => {
          await deps.runSymbols(root);
        },
      );
      await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
        pipeline: 'symbols',
        force: true,
      });
      const mismatch = await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
        pipeline: 'memory',
        force: true,
      });
      expect(mismatch).toMatchObject({ accepted: false, reason: 'already-running' });
      finishBoot();
      await new Promise<void>((resolve) => setImmediate(resolve));
      const late = await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
        pipeline: 'symbols',
        force: true,
      });
      expect(late).toMatchObject({ accepted: false, reason: 'already-running' });
      expect(runSymbols).toHaveBeenCalledTimes(2);
      finishFresh();
    });

    it('refuses with setup-failed when the status read throws', async () => {
      const { rpcHandler, indexingControl, handlers } = buildHandlers();
      handlers.setRunDeps({
        runSymbols: jest.fn().mockResolvedValue(undefined),
      });
      indexingControl.getStatus.mockRejectedValueOnce(
        new Error('sqlite closed at /home/user/.ptah/db'),
      );

      const result = await rpcHandler.call('indexing:start', {
        workspaceRoot: '/workspace',
      });

      expect(result).toEqual({
        accepted: false,
        reason: 'setup-failed',
        state: 'error',
      });
      expect(JSON.stringify(result)).not.toContain('sqlite closed');
    });
  });

  describe('indexing:pause', () => {
    it('calls IndexingControlService.pause and returns accepted:true', async () => {
      const { rpcHandler, indexingControl } = buildHandlers();

      const result = await rpcHandler.call('indexing:pause', {});

      expect(indexingControl.pause).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ accepted: true, state: 'paused' });
    });

    it('returns accepted:false when pause throws', async () => {
      const { rpcHandler, indexingControl } = buildHandlers();
      indexingControl.pause.mockImplementationOnce(() => {
        throw new Error('no active run');
      });

      const result = await rpcHandler.call('indexing:pause', {});
      expect(result).toMatchObject({ accepted: false, state: 'error' });
    });
  });

  describe('indexing:resume', () => {
    it('calls IndexingControlService.resume and returns accepted:true', async () => {
      const { rpcHandler, indexingControl, handlers } = buildHandlers();
      indexingControl.getStatus.mockResolvedValueOnce(
        makeStatus({ state: 'indexing' }),
      );
      handlers.setRunDeps({
        runSymbols: jest.fn().mockResolvedValue(undefined),
      });

      const result = await rpcHandler.call('indexing:resume', {
        workspaceRoot: '/workspace',
      });

      expect(result).toMatchObject({ accepted: true, state: 'indexing' });
    });

    it('refuses with indexer-not-ready when runDeps not set', async () => {
      const { rpcHandler } = buildHandlers();
      const result = await rpcHandler.call('indexing:resume', {
        workspaceRoot: '/workspace',
      });
      expect(result).toEqual({
        accepted: false,
        reason: 'indexer-not-ready',
        state: 'paused',
      });
    });

    it('refuses with no-workspace when workspaceRoot is missing', async () => {
      const { rpcHandler } = buildHandlers();
      const result = await rpcHandler.call('indexing:resume', {});
      expect(result).toEqual({
        accepted: false,
        reason: 'no-workspace',
        state: 'paused',
      });
    });

    it('refuses with already-running while a manual run is active', async () => {
      const { rpcHandler, indexingControl, handlers } = buildHandlers();
      handlers.setRunDeps({
        runSymbols: jest.fn().mockResolvedValue(undefined),
      });
      indexingControl.isRunning.mockReturnValue(true);

      const result = await rpcHandler.call('indexing:resume', {
        workspaceRoot: '/workspace',
      });

      expect(result).toEqual({
        accepted: false,
        reason: 'already-running',
        state: 'indexing',
      });
      expect(indexingControl.resume).not.toHaveBeenCalled();
    });

    it('refuses with setup-failed when the status read throws', async () => {
      const { rpcHandler, indexingControl, handlers } = buildHandlers();
      handlers.setRunDeps({
        runSymbols: jest.fn().mockResolvedValue(undefined),
      });
      indexingControl.getStatus.mockRejectedValueOnce(new Error('boom'));

      const result = await rpcHandler.call('indexing:resume', {
        workspaceRoot: '/workspace',
      });

      expect(result).toEqual({
        accepted: false,
        reason: 'setup-failed',
        state: 'error',
      });
    });
  });

  describe('indexing:cancel', () => {
    it('calls IndexingControlService.cancel and returns accepted:true', async () => {
      const { rpcHandler, indexingControl } = buildHandlers();

      const result = await rpcHandler.call('indexing:cancel', {});

      expect(indexingControl.cancel).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ accepted: true, state: 'never-indexed' });
    });

    it('returns accepted:false when cancel throws', async () => {
      const { rpcHandler, indexingControl } = buildHandlers();
      indexingControl.cancel.mockImplementationOnce(() => {
        throw new Error('unexpected');
      });

      const result = await rpcHandler.call('indexing:cancel', {});
      expect(result).toMatchObject({ accepted: false, state: 'error' });
    });
  });

  describe('indexing:setPipelineEnabled', () => {
    it('calls IndexingControlService.setPipelineEnabled and returns updated flags', async () => {
      const { rpcHandler, indexingControl } = buildHandlers();
      indexingControl.getStatus.mockResolvedValueOnce(
        makeStatus({ symbolsEnabled: false, memoryEnabled: true }),
      );

      const result = await rpcHandler.call('indexing:setPipelineEnabled', {
        workspaceRoot: '/workspace',
        pipeline: 'symbols',
        enabled: false,
      });

      expect(indexingControl.setPipelineEnabled).toHaveBeenCalledWith(
        'symbols',
        false,
        '/workspace',
      );
      expect(result).toMatchObject({
        applied: true,
        symbolsEnabled: false,
        memoryEnabled: true,
      });
    });

    it('returns applied:false when params are missing', async () => {
      const { rpcHandler } = buildHandlers();
      const result = await rpcHandler.call('indexing:setPipelineEnabled', {});
      expect(result).toMatchObject({ applied: false });
    });
  });

  describe('indexing:dismissStale', () => {
    it('calls IndexingControlService.dismissStale and returns dismissed SHA', async () => {
      const { rpcHandler, indexingControl } = buildHandlers();
      indexingControl.getStatus.mockResolvedValueOnce(
        makeStatus({ lastDismissedStaleSha: 'abc123' }),
      );

      const result = await rpcHandler.call('indexing:dismissStale', {
        workspaceRoot: '/workspace',
      });

      expect(indexingControl.dismissStale).toHaveBeenCalledWith('/workspace');
      expect(result).toMatchObject({ accepted: true, dismissedSha: 'abc123' });
    });

    it('returns accepted:false when workspaceRoot is missing', async () => {
      const { rpcHandler } = buildHandlers();
      const result = await rpcHandler.call('indexing:dismissStale', {});
      expect(result).toMatchObject({ accepted: false });
    });
  });

  describe('indexing:acknowledgeDisclosure', () => {
    it('calls IndexingControlService.acknowledgeDisclosure and returns timestamp', async () => {
      const { rpcHandler, indexingControl } = buildHandlers();
      const ts = Date.now();
      indexingControl.getStatus.mockResolvedValueOnce(
        makeStatus({ disclosureAcknowledgedAt: ts }),
      );

      const result = await rpcHandler.call('indexing:acknowledgeDisclosure', {
        workspaceRoot: '/workspace',
      });

      expect(indexingControl.acknowledgeDisclosure).toHaveBeenCalledWith(
        '/workspace',
      );
      expect(result).toMatchObject({ accepted: true, acknowledgedAt: ts });
    });

    it('returns accepted:false when workspaceRoot is missing', async () => {
      const { rpcHandler } = buildHandlers();
      const result = await rpcHandler.call(
        'indexing:acknowledgeDisclosure',
        {},
      );
      expect(result).toMatchObject({ accepted: false });
    });
  });
});
