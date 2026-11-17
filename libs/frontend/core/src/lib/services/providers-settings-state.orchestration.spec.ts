import { TestBed } from '@angular/core/testing';
import type { RpcMethodName, PtahCliSummary } from '@ptah-extension/shared';
import { ProvidersSettingsStateService } from './providers-settings-state.service';
import { ClaudeRpcService, RpcResult } from './claude-rpc.service';
import { AuthStateService } from './auth-state.service';
import { ModelStateService } from './model-state.service';
import { CodexSignInService } from './codex-sign-in.service';
import { WorkspaceScopeService } from './workspace-scope.service';

const validAgent: PtahCliSummary = {
  id: 'instance', name: 'Instance', providerId: 'ollama', providerName: 'Ollama',
  enabled: true, hasApiKey: true, hasStoredKey: false, status: 'available', modelCount: 1,
};
const validConfig = {
  detectedClis: [{ cli: 'codex', installed: true, messagingMode: 'none' }],
  disabledClis: [], preferredAgentOrder: [], cliLaneDefaults: {},
  codexModel: '', copilotModel: '', cursorModel: '', codexReasoningEffort: '', copilotReasoningEffort: '',
  maxConcurrentAgents: 3, copilotAutoApprove: true, cursorApiKeyConfigured: false,
  cursorApiKeyStored: false, cursorApiKeyEnvSet: false,
};
const validLane = { cli: 'codex', installed: true, messagingMode: 'none' };

describe('ProvidersSettingsStateService orchestration boundary', () => {
  let service: ProvidersSettingsStateService;
  let config: unknown;
  let detected: unknown;
  let agents: unknown;
  beforeEach(() => {
    config = { detectedClis: [validLane, null, { cli: 'copilot' }], disabledClis: 'codex', preferredAgentOrder: ['codex', 3] };
    detected = [validLane, null];
    agents = [];
    const call = jest.fn(async (method: RpcMethodName) => new RpcResult(true,
      method === 'agent:getConfig' ? config : method === 'agent:detectClis' ? { clis: detected } : { agents },
    ));
    TestBed.configureTestingModule({ providers: [
      ProvidersSettingsStateService, WorkspaceScopeService,
      { provide: ClaudeRpcService, useValue: { call } },
      { provide: ModelStateService, useValue: { refreshModels: jest.fn() } },
      { provide: AuthStateService, useValue: { refreshAuthStatus: jest.fn(), persistedAuthMethod: () => 'claudeCli' } },
      { provide: CodexSignInService, useValue: { start: jest.fn(), cancel: jest.fn(), state: () => null } },
    ] });
    TestBed.inject(WorkspaceScopeService).switchTo('/workspace');
    service = TestBed.inject(ProvidersSettingsStateService);
  });
  afterEach(() => TestBed.resetTestingModule());

  it('retains valid array elements and records invalid top-level fields', async () => {
    await service.refreshOrchestration();
    expect(service.orchestration().status).toBe('ready');
    expect(service.orchestration().data).toMatchObject({
      detectedClis: [validLane], disabledClis: [], preferredAgentOrder: ['codex'],
      missingFields: expect.arrayContaining(['detectedClis', 'disabledClis', 'preferredAgentOrder', 'codexModel']),
    });
  });
  it.each([undefined, null, {}, 'codex'])('normalizes non-array detection %p', async value => {
    config = { detectedClis: value };
    await service.refreshOrchestration();
    expect(service.orchestration().data).toMatchObject({ detectedClis: [], disabledClis: [], preferredAgentOrder: [] });
    expect(service.orchestration().data?.missingFields).toEqual(expect.arrayContaining(['detectedClis', 'disabledClis', 'preferredAgentOrder']));
  });
  it('normalizes redetection independently', async () => {
    jest.spyOn(service, 'refreshCliAgents').mockResolvedValue();
    jest.spyOn(service, 'refreshCliModels').mockResolvedValue();
    await service.redetectClis();
    expect(service.cliDetection().data).toEqual([validLane]);
    detected = {};
    await service.redetectClis();
    expect(service.cliDetection().data).toEqual([]);
    expect(service.orchestration().data?.missingFields).toContain('detectedClis');
  });

  it.each([{}, [null, validAgent]])('normalizes partial CLI summaries %p beside system lanes', async value => {
    config = validConfig;
    agents = value;
    await service.refreshOrchestration();
    await service.refreshCliAgents();
    expect(service.orchestration().data?.detectedClis).toEqual([validLane]);
    expect(service.cliAgents().data?.map(agent => agent.id)).toEqual(Array.isArray(value) ? ['instance'] : []);
    expect(service.cliAgents().data?.missingFields).toEqual(['cliAgents']);
    agents = [validAgent];
    await service.refreshCliAgents();
    expect(service.cliAgents().data?.missingFields).toBeUndefined();
  });
  it('preserves unknown summary fields at the boundary', async () => {
    agents = [{ ...validAgent, futureField: 'kept' }];
    await service.refreshCliAgents();
    expect(service.cliAgents().data).toEqual([{ ...validAgent, futureField: 'kept' }]);
  });
  it.each(['manifest', 'version', 'path', 'roleChannel'] as const)('salvages malformed optional %s metadata in config and redetection', async field => {
    const lane = { ...validLane, [field]: {} };
    config = { ...validConfig, detectedClis: [lane] };
    detected = [lane];
    await service.refreshOrchestration();
    expect(service.orchestration().data?.detectedClis).toEqual([validLane]);
    expect(service.orchestration().data?.missingFields).toEqual(['detectedClis']);
    await service.redetectClis();
    expect(service.cliDetection().data).toEqual([validLane]);
    expect(service.orchestration().data?.missingFields).toEqual(['detectedClis']);
  });
  it('clears invalid redetection fields after a fully valid refresh', async () => {
    config = validConfig;
    detected = {};
    await service.redetectClis();
    expect(service.orchestration().data?.missingFields).toEqual(['detectedClis']);
    await service.refreshOrchestration();
    expect(service.orchestration().data?.missingFields).toEqual([]);
    expect(service.orchestration().data?.detectedClis).toEqual([validLane]);
  });
});
