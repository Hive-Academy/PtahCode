jest.mock('@ptah-extension/cli-agent-runtime', () => ({
  CLI_AGENT_RUNTIME_TOKENS: {
    SDK_PTAH_CLI_REGISTRY: Symbol.for('SdkPtahCliRegistry'),
  },
}));

import 'reflect-metadata';

import { container } from 'tsyringe';
import { CLI_AGENT_RUNTIME_TOKENS } from '@ptah-extension/cli-agent-runtime';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import { LANE_ROUTING_TOKENS } from '@ptah-extension/lane-routing';
import { TOKENS, RpcUserError } from '@ptah-extension/vscode-core';
import type {
  AgentGetRoutingEvidenceResult,
  CliDetectionResult,
} from '@ptah-extension/shared';
import { RoutingEvidenceRpcHandlers } from './routing-evidence-rpc.handlers';

const METHOD = 'agent:getRoutingEvidence';
const SERVICE_TOKEN = LANE_ROUTING_TOKENS.ROUTING_EVIDENCE_SERVICE;
const rows: CliDetectionResult[] = [
  { cli: 'codex', installed: true, messagingMode: 'queue' },
];
const result: AgentGetRoutingEvidenceResult = {
  windowDays: 30,
  performanceRouting: true,
  lanes: [
    {
      laneId: 'codex',
      family: 'codex',
      catalog: { status: 'never', fetchedAt: null, lastOkAt: null, modelCount: 0 },
      models: [],
    },
  ],
  laneFunnels: [{
    laneId: 'codex', family: 'codex',
    funnel: {
      spawned: 1, completed: 1, delivered: 1, reviewed: 1, approved: 1,
      capacityDropped: 0, failed: 0, noDeliverable: 0, rejected: 0,
      unverified: 0, unresolvedRevise: 0, reviseRounds: 0,
    },
  }],
  decisionModels: [],
};
const unavailable = {
  errorCode: 'PERSISTENCE_UNAVAILABLE',
  message: 'Routing evidence is unavailable.',
};

function setup(serviceRegistered = true, listAgents?: () => Promise<unknown>) {
  const runtime = container.createChildContainer();
  const scope = runtime.createChildContainer();
  const registerMethod = jest.fn<
    void,
    [string, (params: unknown) => Promise<AgentGetRoutingEvidenceResult>]
  >();
  const detectAll = jest.fn(async () => rows);
  const read = jest.fn(async (_rows: readonly CliDetectionResult[]) => result);
  const getConfiguration = jest.fn<string[] | undefined, [string, string, string[]]>();

  scope.registerInstance(TOKENS.LOGGER, { error: jest.fn(), warn: jest.fn() });
  scope.registerInstance(TOKENS.RPC_HANDLER, { registerMethod });
  scope.registerInstance(TOKENS.CLI_DETECTION_SERVICE, { detectAll });
  scope.registerInstance(PLATFORM_TOKENS.DI_CONTAINER, scope);
  runtime.registerInstance(PLATFORM_TOKENS.WORKSPACE_PROVIDER, { getConfiguration });
  if (listAgents) {
    runtime.registerInstance(CLI_AGENT_RUNTIME_TOKENS.SDK_PTAH_CLI_REGISTRY, { listAgents });
  }
  if (serviceRegistered) {
    runtime.registerInstance(SERVICE_TOKEN, { read });
  }
  scope.resolve(RoutingEvidenceRpcHandlers).register();

  expect(registerMethod).toHaveBeenCalledTimes(1);
  expect(registerMethod).toHaveBeenCalledWith(METHOD, expect.any(Function));
  const call = registerMethod.mock.calls[0][1];
  return { call, detectAll, getConfiguration, read, runtime };
}

describe('RoutingEvidenceRpcHandlers', () => {
  it.each([{}, undefined])('returns the evidence when called with %p', async (params) => {
    const { call, detectAll, read } = setup();
    await expect(call(params)).resolves.toEqual(result);
    expect(detectAll).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(rows);
  });

  it('marks disabled system CLIs without changing the detection rows', async () => {
    const { call, detectAll, getConfiguration, read } = setup();
    const installed: CliDetectionResult[] = [
      { cli: 'codex', installed: true, messagingMode: 'queue' },
      { cli: 'claude', installed: true, messagingMode: 'queue' },
    ];
    detectAll.mockResolvedValueOnce(installed);
    getConfiguration.mockReturnValue(['codex']);

    await call({});

    expect(getConfiguration).toHaveBeenCalledWith('ptah', 'agentOrchestration.disabledClis', []);
    expect(read).toHaveBeenCalledWith([{ ...installed[0], disabled: true }, installed[1]]);
    expect(installed[0]).not.toHaveProperty('disabled');
  });

  it('includes only runnable Ptah CLI lanes from the parent registry', async () => {
    const ready = {
      id: 'ptah-kimi',
      name: 'Kimi',
      providerName: 'Kimi Code',
      providerId: 'kimi-code',
      enabled: true,
      hasApiKey: true,
    };
    const listAgents = jest.fn(async () => [
      ready,
      { ...ready, id: 'disabled', enabled: false },
      { ...ready, id: 'unconfigured', hasApiKey: false },
    ]);
    const { call, read } = setup(true, listAgents);

    await call({});

    expect(listAgents).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith([
      ...rows,
      expect.objectContaining({
        cli: 'ptah-cli',
        installed: true,
        messagingMode: 'queue',
        ptahCliId: ready.id,
        ptahCliName: ready.name,
        providerName: ready.providerName,
        providerId: ready.providerId,
      }),
    ]);
  });

  it('still returns system CLI evidence when the registry list fails', async () => {
    const listAgents = jest.fn().mockRejectedValue(new Error('registry read failed'));
    const { call, read } = setup(true, listAgents);

    await expect(call({})).resolves.toEqual(result);

    expect(listAgents).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(rows);
  });

  it.each([{ refresh: true }, null, 'refresh'])('rejects params %p', async (params) => {
    const { call, detectAll, read } = setup();
    await expect(call(params)).rejects.toMatchObject({ errorCode: 'INVALID_PARAMS' });
    expect(detectAll).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('returns a user error when the service is absent', async () => {
    const { call, detectAll } = setup(false);
    const response = call({});
    await expect(response).rejects.toBeInstanceOf(RpcUserError);
    await expect(response).rejects.toMatchObject(unavailable);
    expect(detectAll).not.toHaveBeenCalled();
  });

  it('returns a user error when resolving the service fails', async () => {
    const { call, detectAll, runtime } = setup(false);
    runtime.register(SERVICE_TOKEN, {
      useFactory: () => {
        throw new Error('service construction failed');
      },
    });
    await expect(call({})).rejects.toMatchObject(unavailable);
    expect(detectAll).not.toHaveBeenCalled();
  });

  it('returns a user error when detection fails', async () => {
    const { call, detectAll, read } = setup();
    detectAll.mockRejectedValueOnce(new Error('detection failed'));
    await expect(call({})).rejects.toMatchObject(unavailable);
    expect(read).not.toHaveBeenCalled();
  });

  it('returns a user error when the service read rejects', async () => {
    const { call, read } = setup();
    read.mockRejectedValueOnce(new Error('workspace outcome store unavailable'));
    await expect(call({})).rejects.toMatchObject(unavailable);
  });
});
