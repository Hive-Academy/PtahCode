import 'reflect-metadata';

import { container } from 'tsyringe';
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
  decisionModels: [],
};
const unavailable = {
  errorCode: 'PERSISTENCE_UNAVAILABLE',
  message: 'Routing evidence is unavailable.',
};

function setup(serviceRegistered = true) {
  const runtime = container.createChildContainer();
  const scope = runtime.createChildContainer();
  const registerMethod = jest.fn<
    void,
    [string, (params: unknown) => Promise<AgentGetRoutingEvidenceResult>]
  >();
  const detectAll = jest.fn(async () => rows);
  const read = jest.fn(async (_rows: readonly CliDetectionResult[]) => result);

  scope.registerInstance(TOKENS.LOGGER, { error: jest.fn() });
  scope.registerInstance(TOKENS.RPC_HANDLER, { registerMethod });
  scope.registerInstance(TOKENS.CLI_DETECTION_SERVICE, { detectAll });
  scope.registerInstance(PLATFORM_TOKENS.DI_CONTAINER, scope);
  if (serviceRegistered) {
    runtime.registerInstance(SERVICE_TOKEN, { read });
  }
  scope.resolve(RoutingEvidenceRpcHandlers).register();

  expect(registerMethod).toHaveBeenCalledTimes(1);
  expect(registerMethod).toHaveBeenCalledWith(METHOD, expect.any(Function));
  const call = registerMethod.mock.calls[0][1];
  return { call, detectAll, read, runtime };
}

describe('RoutingEvidenceRpcHandlers', () => {
  it.each([{}, undefined])('returns the evidence when called with %p', async (params) => {
    const { call, detectAll, read } = setup();
    await expect(call(params)).resolves.toEqual(result);
    expect(detectAll).toHaveBeenCalledTimes(1);
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
