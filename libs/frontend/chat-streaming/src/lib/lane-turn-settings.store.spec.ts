import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService, VSCodeService } from '@ptah-extension/core';
import { createMockRpcService, rpcError, rpcSuccess } from '@ptah-extension/core/testing';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  AgentId,
  type AgentProcessInfo,
  type AgentGetLaneComposerOptionsResult,
  type AgentMessagePreview,
  type LaneTurnInputCapabilities,
} from '@ptah-extension/shared';
import { AgentDeliveryStore } from './agent-delivery.store';
import { AgentMonitorStore } from './agent-monitor.store';
import { BackgroundAgentStore } from './background-agent.store';
import {
  LANE_OPTIONS_UNREPORTED_TEXT,
  LaneTurnSettingsStore,
} from './lane-turn-settings.store';

const lane = AgentId.from('00000000-0000-4000-8000-000000000001');
const other = AgentId.from('00000000-0000-4000-8000-000000000002');

interface FakeRecord {
  model?: string;
  reasoningEffort?: string;
  observedModel?: string;
  effectiveCapabilities?: { turnInput?: LaneTurnInputCapabilities };
}

const supported = { state: 'supported' } as const;
const turnInput: LaneTurnInputCapabilities = {
  model: supported, effort: supported, images: supported, files: supported, commands: supported, skills: supported,
};

function options(overrides: Partial<AgentGetLaneComposerOptionsResult> = {}): AgentGetLaneComposerOptionsResult {
  return {
    models: [{ id: 'gpt-5.5', name: 'GPT-5.5' }], efforts: ['low', 'high'], currentModel: 'gpt-5.5',
    commands: [{ name: 'review', group: 'command' }], ...overrides,
  };
}

function preview(capabilities: Partial<AgentMessagePreview['effectiveCapabilities']>): AgentMessagePreview {
  return {
    agentId: lane, delivery: 'queue', mode: 'queue-next-turn', supported: true, usesResume: false,
    effectiveCapabilities: capabilities as AgentMessagePreview['effectiveCapabilities'],
  };
}

describe('LaneTurnSettingsStore', () => {
  let store: LaneTurnSettingsStore;
  let rpc: ReturnType<typeof createMockRpcService>;
  const agentsById = signal(new Map<string, FakeRecord>());
  const previews = signal<{ queue?: AgentMessagePreview; now?: AgentMessagePreview }>({});
  const tabs = signal([{ id: 'tab-1', overrideModel: 'claude-opus', overrideEffort: 'medium' }]);
  const tabManager = {
    tabs,
    setOverrideModel: jest.fn(),
    setOverrideEffort: jest.fn(),
    updateTab: jest.fn(),
  };

  beforeEach(() => {
    rpc = createMockRpcService();
    agentsById.set(new Map([[lane, { model: 'gpt-5.4' }], [other, {}]]));
    previews.set({});
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: ClaudeRpcService, useValue: rpc },
        { provide: AgentMonitorStore, useValue: { agentsById } },
        { provide: AgentDeliveryStore, useValue: { composerState: () => previews() } },
        { provide: TabManagerService, useValue: tabManager },
      ],
    });
    store = TestBed.inject(LaneTurnSettingsStore);
  });

  afterEach(() => TestBed.resetTestingModule());

  describe('pending picks', () => {
    it('leaves the tab overrides unchanged when a lane model or effort is picked', () => {
      const before = tabs().map((tab) => ({ ...tab }));
      store.pickModel(lane, 'gpt-5.5');
      store.pickEffort(lane, 'high');
      store.clearPending(lane);
      expect(tabs()).toEqual(before);
      expect(tabManager.setOverrideModel).not.toHaveBeenCalled();
      expect(tabManager.setOverrideEffort).not.toHaveBeenCalled();
      expect(tabManager.updateTab).not.toHaveBeenCalled();
    });

    it('keeps picks per lane and returns them as the next turn settings', () => {
      store.pickModel(lane, 'gpt-5.5');
      store.pickEffort(lane, 'high');
      expect(store.turnSettings(lane)).toEqual({ model: 'gpt-5.5', reasoningEffort: 'high' });
      expect(store.turnSettings(other)).toBeUndefined();
      store.pickModel(lane, null);
      expect(store.pending(lane)).toEqual({ reasoningEffort: 'high' });
    });

    it('drops a pick that equals what the record already runs', () => {
      store.pickModel(lane, 'gpt-5.4');
      expect(store.turnSettings(lane)).toBeUndefined();
    });

    it('clears each pick once the record confirms it', () => {
      store.pickModel(lane, 'gpt-5.5');
      store.pickEffort(lane, 'high');
      agentsById.set(new Map([[lane, { model: 'gpt-5.5', reasoningEffort: 'low' }]]));
      TestBed.tick();
      expect(store.pending(lane)).toEqual({ reasoningEffort: 'high' });
      agentsById.set(new Map([[lane, { model: 'gpt-5.5', reasoningEffort: 'high' }]]));
      TestBed.tick();
      expect(store.pendingByAgent().has(lane)).toBe(false);
    });

    it('compares a model pick with the recorded model, not a lagging observed model', () => {
      // The host applied gpt-5.5; the served model of the last turn still reads gpt-5.4.
      agentsById.set(new Map([[lane, { model: 'gpt-5.5', observedModel: 'gpt-5.4' }]]));
      TestBed.tick();
      store.pickModel(lane, 'gpt-5.4');
      expect(store.turnSettings(lane)).toEqual({ model: 'gpt-5.4' });
      store.pickModel(lane, 'gpt-5.5');
      expect(store.turnSettings(lane)).toBeUndefined();
    });

    it('confirms against the observed model when no model is recorded', () => {
      agentsById.set(new Map([[lane, { observedModel: 'gpt-5.5' }]]));
      TestBed.tick();
      store.pickModel(lane, 'gpt-5.5');
      expect(store.turnSettings(lane)).toBeUndefined();
    });

    it('drops the entries of a lane the monitor no longer tracks', async () => {
      store.pickEffort(other, 'low');
      rpc.call.mockResolvedValueOnce(rpcSuccess(options()));
      await store.loadCatalog(other);
      agentsById.set(new Map([[lane, {}]]));
      TestBed.tick();
      expect(store.pendingByAgent().has(other)).toBe(false);
      expect(store.catalog(other).status).toBe('idle');
    });
  });

  describe('catalog', () => {
    it('moves from idle through loading to ready', async () => {
      expect(store.catalog(lane).status).toBe('idle');
      let resolve!: (value: unknown) => void;
      rpc.call.mockReturnValueOnce(new Promise((done) => (resolve = done)) as never);
      const load = store.loadCatalog(lane);
      expect(store.catalog(lane).status).toBe('loading');
      expect(store.isChecking(lane)).toBe(true);
      expect(store.loadCatalog(lane)).toBe(load);
      resolve(rpcSuccess(options()));
      await load;
      expect(store.catalog(lane)).toEqual({ status: 'ready', options: options(), refreshing: false });
      expect(rpc.call).toHaveBeenCalledTimes(1);
      expect(rpc.call).toHaveBeenCalledWith('agent:getLaneComposerOptions', { agentId: lane }, { timeout: 15_000 });
    });

    it('moves through loading to error, and Retry reaches ready', async () => {
      rpc.call.mockResolvedValueOnce(rpcError('No handler for agent:getLaneComposerOptions'));
      await store.loadCatalog(lane);
      expect(store.catalog(lane)).toEqual({
        status: 'error', refreshing: false, errorDetail: 'No handler for agent:getLaneComposerOptions',
      });
      rpc.call.mockResolvedValueOnce(rpcSuccess(options()));
      const retry = store.loadCatalog(lane);
      expect(store.catalog(lane).status).toBe('loading');
      await retry;
      expect(store.catalog(lane).status).toBe('ready');
    });

    it('treats a lookup that reports an error as the error state', async () => {
      rpc.call.mockResolvedValueOnce(rpcSuccess(options({ models: [], efforts: [], commands: [], error: 'lane busy' })));
      await store.loadCatalog(lane);
      expect(store.catalog(lane)).toEqual({ status: 'error', refreshing: false, errorDetail: 'lane busy' });
      rpc.call.mockRejectedValueOnce(new Error('transport closed'));
      await store.loadCatalog(lane);
      expect(store.catalog(lane).errorDetail).toBe('transport closed');
    });

    it('keeps the cached lists the host sent beside an error, and shows the error (M5)', async () => {
      const partial = options({ efforts: [], commands: [], error: 'Lane options could not be read.' });
      rpc.call.mockResolvedValueOnce(rpcSuccess(partial));
      await store.loadCatalog(lane);
      expect(store.catalog(lane)).toEqual({
        status: 'ready', options: partial, refreshing: false, errorDetail: 'Lane options could not be read.',
      });
      rpc.call.mockResolvedValueOnce(rpcSuccess(options()));
      await store.loadCatalog(lane);
      expect(store.catalog(lane)).toEqual({ status: 'ready', options: options(), refreshing: false });
    });

    it('refreshes a ready catalog without leaving ready, and keeps the old options on failure', async () => {
      rpc.call.mockResolvedValueOnce(rpcSuccess(options()));
      await store.loadCatalog(lane);
      rpc.call.mockResolvedValueOnce(rpcError('timeout'));
      const refresh = store.loadCatalog(lane);
      expect(store.catalog(lane)).toMatchObject({ status: 'ready', refreshing: true });
      await refresh;
      expect(store.catalog(lane)).toEqual({ status: 'ready', options: options(), refreshing: false, errorDetail: 'timeout' });
    });
  });

  describe('turn input (absent sections)', () => {
    it('is checking until the first preview, then unreported when the section is absent', () => {
      expect(store.turnInput(lane)).toEqual({ kind: 'checking' });
      previews.set({ queue: preview({}) });
      expect(store.turnInput(lane)).toEqual({ kind: 'unreported', reason: LANE_OPTIONS_UNREPORTED_TEXT });
    });

    it('reports the preview section, else the record section', () => {
      agentsById.set(new Map([[lane, { effectiveCapabilities: { turnInput } }]]));
      expect(store.turnInput(lane)).toEqual({ kind: 'reported', turnInput });
      const fromPreview = { ...turnInput, images: { state: 'unsupported' as const, reason: 'no images' } };
      previews.set({ now: preview({ turnInput: fromPreview }) });
      expect(store.turnInput(lane)).toEqual({ kind: 'reported', turnInput: fromPreview });
      expect(store.isChecking(lane)).toBe(false);
    });
  });

  describe('confirmation from the real agent monitor record', () => {
    let monitor: AgentMonitorStore;
    let settings: LaneTurnSettingsStore;
    const record = (overrides: Partial<AgentProcessInfo> = {}): AgentProcessInfo => ({
      agentId: lane,
      cli: 'codex',
      task: 'Work',
      workingDirectory: '/workspace/root',
      startedAt: '2026-10-01T10:00:00.000Z',
      status: 'running',
      model: 'gpt-5.4',
      ...overrides,
    });

    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          AgentMonitorStore,
          BackgroundAgentStore,
          { provide: ClaudeRpcService, useValue: createMockRpcService() },
          { provide: VSCodeService, useValue: { config: signal({ panelId: '' }), postMessage: jest.fn() } },
          { provide: AgentDeliveryStore, useValue: { composerState: () => ({}) } },
          {
            provide: TabManagerService,
            useValue: { ...tabManager, activeTab: signal(null), activeTabSessionId: signal(null) },
          },
        ],
      });
      monitor = TestBed.inject(AgentMonitorStore);
      settings = TestBed.inject(LaneTurnSettingsStore);
      monitor.onAgentSpawned(record({ turnSeq: 1 }));
      TestBed.tick();
    });

    it('clears a pending model once a continued turn publishes it as the model', () => {
      settings.pickModel(lane, 'gpt-5.5');
      TestBed.tick();
      expect(settings.pending(lane)).toEqual({ model: 'gpt-5.5' });
      monitor.onAgentSpawned(record({ turnSeq: 2, model: 'gpt-5.5' }));
      TestBed.tick();
      expect(settings.pendingByAgent().has(lane)).toBe(false);
    });

    it('keeps a pick of the spawn model once a continued turn moved the lane off it', () => {
      monitor.onAgentSpawned(record({ turnSeq: 2, model: 'gpt-5.5', observedModel: 'gpt-5.4' }));
      TestBed.tick();
      settings.pickModel(lane, 'gpt-5.4');
      TestBed.tick();
      expect(settings.turnSettings(lane)).toEqual({ model: 'gpt-5.4' });
    });

    it('clears a pending effort once the lane reports it, keeping an unconfirmed model', () => {
      settings.pickModel(lane, 'gpt-5.5');
      settings.pickEffort(lane, 'high');
      TestBed.tick();
      monitor.onAgentSpawned(record({ turnSeq: 2, reasoningEffort: 'high' }));
      TestBed.tick();
      expect(settings.pending(lane)).toEqual({ model: 'gpt-5.5' });
    });

    it('clears a pending effort confirmed by an exit payload', () => {
      settings.pickEffort(lane, 'low');
      TestBed.tick();
      monitor.onAgentExited(record({ turnSeq: 1, status: 'completed', reasoningEffort: 'low' }));
      TestBed.tick();
      expect(settings.pendingByAgent().has(lane)).toBe(false);
    });
  });
});
