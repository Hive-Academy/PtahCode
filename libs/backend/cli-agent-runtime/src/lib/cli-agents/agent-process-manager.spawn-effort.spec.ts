import 'reflect-metadata';
import type { CliAdapterManifest, LaneReportedSession, SpawnAgentRequest } from '@ptah-extension/shared';
import { laneTestFreeMemory } from '../__fixtures__/memory-probe';
import { AgentMessageRouter } from './agent-message-router.service';
import { AgentOutputBuffer } from './agent-output-buffer.service';
import { AgentProcessManager } from './agent-process-manager.service';
import { AgentSpawnEnvironment } from './agent-spawn-environment.service';
import type { CliCommandOptions, SdkHandle } from './cli-adapters/cli-adapter.interface';
import { LaneCompletionNotifier } from './lane-completion-notifier.service';

const request = {
  task: 'Implement the change',
  cli: 'codex',
  model: 'test-model',
  effort: 'max',
  attachMcp: false,
  timeout: 0,
  routeFacts: {
    routeId: 'route',
    phaseId: 'phase',
    laneId: 'codex',
    model: 'test-model',
    effort: 'max',
    source: 'ranking',
    decisionModel: null,
    proposalConfidence: null,
  },
} satisfies SpawnAgentRequest;

function fixture() {
  type ManagerArgs = ConstructorParameters<typeof AgentProcessManager>;
  type EnvironmentArgs = ConstructorParameters<typeof AgentSpawnEnvironment>;
  type NotifierArgs = ConstructorParameters<typeof LaneCompletionNotifier>;
  const logger = {
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  } as unknown as ManagerArgs[0];
  const runSdk = jest.fn<Promise<SdkHandle>, [CliCommandOptions]>();
  const recordNativeSession = jest.fn();
  const nativeEfforts = jest.fn(() => ({
    provenance: 'native' as const, supported: ['max'], default: null,
  }));
  const cliDetection = {
    nativeEfforts,
    recordNativeSession,
    getDetection: jest.fn().mockResolvedValue({ cli: 'codex', installed: true }),
    getAdapter: () => ({
      name: 'codex',
      runSdk,
      capabilities: () => ({
        messaging: {
          steer: { state: 'unsupported' },
          interrupt: { state: 'unsupported' },
          continuation: { state: 'unsupported' },
          resume: { state: 'unsupported' },
        },
        roleChannel: 'developer-instructions',
        permissionModes: {
          plan: { state: 'supported', nativeMode: 'plan', networkModes: ['allow'] },
        },
        networkModes: { allow: { state: 'supported' }, deny: { state: 'unsupported' } },
        limitReader: { state: 'no-reliable-source' },
        mcp: { state: 'supported' },
      }) satisfies CliAdapterManifest,
    }),
  } as unknown as ManagerArgs[1];
  const sentry = { captureException: jest.fn() } as unknown as ManagerArgs[3];
  const environment = new AgentSpawnEnvironment(
    logger,
    cliDetection,
    {
      getWorkspaceRoot: () => process.cwd(),
      getConfiguration: <T>(_section: string, _key: string, fallback?: T) => fallback,
    } as EnvironmentArgs[2],
    { effort: { get: () => '' } } as EnvironmentArgs[3],
    sentry,
    null,
    { getPort: () => null },
  );
  jest.spyOn(environment, 'freeMemory').mockImplementation(laneTestFreeMemory);
  const recordLaneCompletion = jest.fn();
  const notifier = new LaneCompletionNotifier(
    logger,
    {} as NotifierArgs[1],
    null,
    () => ({ recordLaneCompletion }),
  );
  const signal = jest.spyOn(notifier, 'signal');
  const manager = new AgentProcessManager(
    logger,
    cliDetection,
    {} as ManagerArgs[2],
    sentry,
    new AgentMessageRouter(logger, cliDetection),
    environment,
    new AgentOutputBuffer(logger),
    notifier,
    {} as ManagerArgs[8],
    { ownerForLane: () => undefined } as unknown as ManagerArgs[9],
    { recordSuccess: jest.fn() } as unknown as ManagerArgs[10],
  );
  return { manager, runSdk, signal, recordLaneCompletion, nativeEfforts, recordNativeSession };
}

describe('spawn failure after admission (V4)', () => {
  it('drops an unreplied spawn failure without signalling or writing an outcome', async () => {
    const f = fixture();
    const error = new Error('SDK rejected the model');
    f.runSdk.mockRejectedValue(error);
    const ticket = f.manager.beginSpawn(request);

    await expect(f.manager.executeSpawn(ticket, request)).rejects.toBe(error);
    expect(f.runSdk).toHaveBeenCalledTimes(1);
    expect(() => f.manager.getStatus(ticket.agentId)).toThrow('Agent not found');
    expect(f.signal).not.toHaveBeenCalled();
    expect(f.recordLaneCompletion).not.toHaveBeenCalled();
    await f.manager.disposeAll();
  });

  it('signals and writes a failed outcome after the spawn has replied', async () => {
    const f = fixture();
    const error = new Error('SDK rejected the model');
    f.runSdk.mockRejectedValue(error);
    const ticket = f.manager.beginSpawn(request);
    expect(f.manager.markSpawnReplied(ticket)).toBe(true);

    await expect(f.manager.executeSpawn(ticket, request)).rejects.toBe(error);
    expect(f.runSdk).toHaveBeenCalledTimes(1);
    expect(f.manager.getStatus(ticket.agentId)).toMatchObject({ status: 'failed' });
    expect(f.signal).toHaveBeenCalledTimes(1);
    await f.signal.mock.results[0].value;
    expect(f.recordLaneCompletion).toHaveBeenCalledTimes(1);
    expect(f.recordLaneCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: ticket.agentId, status: 'failed', verdict: 'failed',
        model: request.model, modelSource: 'request', routedModel: request.routeFacts.model,
      }),
      { brief: request.task },
    );
    await f.manager.disposeAll();
  });
});

describe('native spawn effort and session evidence', () => {
  it.each(['completed', 'stopped'] as const)('captures the session when the turn is %s', async (status) => {
    const f = fixture();
    const abort = new AbortController();
    let finish!: (code: number) => void;
    const done = new Promise<number>((resolve) => { finish = resolve; });
    abort.signal.addEventListener('abort', () => finish(1), { once: true });
    const reported = {
      model: 'actual-model',
      effort: 'high',
      efforts: { provenance: 'native', supported: ['max', 'high'], default: 'high' },
    } satisfies LaneReportedSession;
    const reportedSession = jest.fn(() => reported);
    f.runSdk.mockResolvedValue({
      abort, done, onOutput: jest.fn(), reportedSession,
      effortDelivery: { sent: null, disposition: 'lane-refused' },
    });
    const settled = jest.fn();
    f.manager.events.on('agent:turn-settled', settled);

    const { agentId } = await f.manager.spawn(request);
    expect(f.nativeEfforts).toHaveBeenCalledWith('codex', request.model);
    expect(f.runSdk).toHaveBeenCalledWith(expect.objectContaining({ reasoningEffort: 'max' }));
    expect(f.manager.getStatus(agentId)).toMatchObject({
      modelSource: 'request',
      routeFacts: request.routeFacts,
      spawnEffort: {
        requested: 'max', sent: null, source: 'request',
        provenance: 'native', disposition: 'lane-refused',
      },
    });

    if (status === 'stopped') await f.manager.stop(agentId);
    else {
      finish(0);
      await done;
    }
    expect(reportedSession).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ status, reportedSession: reported }));
    expect(f.recordNativeSession).toHaveBeenCalledWith('codex', reported.model, reported.efforts);
    await f.signal.mock.results[0].value;
    expect(f.recordLaneCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        resolvedModel: 'actual-model', resolvedEffort: 'high',
        effort: null, effortDisposition: 'lane-refused',
      }),
      { brief: request.task },
    );
    await f.manager.disposeAll();
  });
});
