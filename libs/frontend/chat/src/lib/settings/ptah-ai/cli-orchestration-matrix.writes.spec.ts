import { By } from '@angular/platform-browser';
import { LanesTableComponent } from './lanes-table.component';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  ClaudeAmbientStatusService,
  ProviderAccountsStateService,
  ProvidersSettingsStateService,
  VSCodeService,
  type ClaudeAmbientStatusView,
  type ProviderAccountsView,
  type ProvidersCliModels,
  type ProvidersCliTest,
  type ProvidersOrchestration,
  type ProvidersSettingsCommit,
  type ProvidersSettingsSection,
} from '@ptah-extension/core';
import { PROVIDER_MODELS_LOADER } from '@ptah-extension/ui';
import type {
  CliAdapterManifest,
  CliDetectionResult,
  PtahCliSummary,
} from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import {
  CliOrchestrationMatrixComponent,
} from './cli-orchestration-matrix.component';

const ready = <T>(data: T): ProvidersSettingsSection<T> => ({
  status: 'ready',
  data,
  error: null,
});
const unloaded = <T>(): ProvidersSettingsSection<T> => ({
  status: 'unloaded',
  data: null,
  error: null,
});
const idle: ProvidersSettingsCommit = {
  status: 'idle',
  saved: [],
  unsaved: [],
  unconfirmed: [],
  refreshFailed: false,
  message: null,
};
const CONTEXT = { scopeKey: 'workspace', activePath: '/ws' };
const laneSupported = { state: 'supported' as const };
const laneManifest: CliAdapterManifest = {
  messaging: { steer: laneSupported, interrupt: laneSupported, continuation: laneSupported, resume: laneSupported },
  roleChannel: 'task-prompt',
  permissionModes: {
    plan: { ...laneSupported, networkModes: ['deny'] },
    'auto-edit': { ...laneSupported, networkModes: ['deny', 'allow'] },
    yolo: { ...laneSupported, networkModes: ['allow'] },
  },
  networkModes: { deny: laneSupported, allow: laneSupported },
  mcp: laneSupported,
  limitReader: { state: 'no-reliable-source' },
};

const detected = (
  cli: CliDetectionResult['cli'],
  installed: boolean,
  extra: Partial<CliDetectionResult> = {},
): CliDetectionResult => ({ cli, installed, messagingMode: 'none', ...extra });

/** The prototype data set (BRIEF), minus the quota state (D11). */
const ORCHESTRATION: ProvidersOrchestration = {
  detectedClis: [
    detected('codex', true, { version: '1.4.0' }),
    detected('copilot', true, { version: '0.9.2' }),
    detected('cursor', false),
    detected('antigravity', true, { version: '2.1.0' }),
    detected('opencode', true, { version: '0.6.0' }),
    detected('pi', false),
    detected('ptah-cli', true, { ptahCliId: 'glm-1', ptahCliName: 'Glm' }),
  ],
  disabledClis: ['copilot'],
  preferredAgentOrder: ['codex', 'antigravity', 'glm-1', 'copilot'],
  maxConcurrentAgents: 3,
  copilotAutoApprove: false,
  codexModel: 'gpt-5.5-codex',
  copilotModel: '',
  cursorModel: '',
  antigravityModel: 'claude-sonnet-4-6',
  opencodeModel: 'opencode/nemotron-3-ultra-free',
  piModel: '',
  codexReasoningEffort: 'medium',
  copilotReasoningEffort: '',
  piReasoningEffort: '',
  cursorApiKeyConfigured: false,
  cursorApiKeyStored: false,
  cursorApiKeyEnvSet: false,
};
const GLM: PtahCliSummary = {
  id: 'glm-1',
  name: 'Glm',
  providerName: 'Ollama Cloud',
  providerId: 'ollama-cloud',
  hasApiKey: true,
  hasStoredKey: true,
  status: 'available',
  enabled: true,
  modelCount: 12,
};
const MODELS: ProvidersCliModels = {
  'glm-1': {
    selectedModel: 'glm-5.3:cloud',
    tierMappings: { sonnet: 'glm-5.3', opus: 'glm-4.7', haiku: 'glm-4.5' },
  },
};

class StateStub {
  readonly commit = signal<ProvidersSettingsCommit>(idle);
  readonly orchestration = signal<
    ProvidersSettingsSection<ProvidersOrchestration>
  >(ready(ORCHESTRATION));
  readonly cliAgents = signal<ProvidersSettingsSection<PtahCliSummary[]>>(
    ready([GLM]),
  );
  readonly cliModels = signal<ProvidersSettingsSection<ProvidersCliModels>>(
    ready(MODELS),
  );
  readonly cliTest =
    signal<ProvidersSettingsSection<ProvidersCliTest>>(unloaded());
  readonly scopes = signal<
    ProvidersSettingsSection<{ activePath: string; entries: unknown[] }>
  >(ready({ activePath: '/ws', entries: [] }));
  readonly delegatedModelOptions = signal(
    ready({
      codex: [],
      copilot: [],
      cursor: [],
      antigravity: [],
      opencode: [],
      pi: [],
    }),
  );
  readonly refreshDelegatedModelOptions = jest.fn(async () => undefined);
  // Read by the Batch 32 modals (always mounted, closed).
  readonly connections = signal(ready([]));
  readonly externalAuth = signal({
    status: 'unloaded',
    data: null,
    error: null,
  });
  readonly tiers = signal({ status: 'unloaded', data: null, error: null });
  readonly refreshTiers = jest.fn(async (_params: unknown) => undefined);
  readonly reviewContext = jest.fn(() =>
    this.scopes().status === 'ready' ? CONTEXT : null,
  );
  readonly saveSettings = jest.fn(
    async (_patch: unknown, _context: unknown) => {
      this.commit.set({ ...idle, status: 'saved' });
      return true;
    },
  );
  /** Resolves with the result `ptahCli:testConnection` would have produced. */
  testResult: ProvidersCliTest = {
    id: 'glm-1',
    success: true,
    latencyMs: 112,
    reason: null,
  };
  readonly testCliConnection = jest.fn(async (_id: string) => {
    this.cliTest.set(ready(this.testResult));
  });
  readonly clearCliTest = jest.fn((_id: string) => undefined);
  readonly cliDetection = signal<
    ProvidersSettingsSection<CliDetectionResult[]>
  >(ready([]));
  /** What the next re-detect does to the state; by default nothing changes (the CLI is still missing). */
  onRedetect: () => void = () => undefined;
  readonly refreshOrchestration = jest.fn(async () => undefined);
  readonly refreshCliAgents = jest.fn(async () => undefined);
  readonly redetectClis = jest.fn(async (): Promise<boolean> => {
    this.onRedetect();
    return this.cliDetection().status === 'ready';
  });
}

/** P6 lane account cell: one signed-in named account makes the cell visible (P6-1). */
class AccountsStub {
  readonly view = signal<ProviderAccountsView>({
    status: 'ready',
    stale: false,
    error: null,
    snapshot: {
      provider: 'claude',
      workspaceRoot: 'workspace',
      revision: 1,
      accounts: [
        {
          profileId: 'p-1',
          label: 'Work',
          provider: 'claude',
          state: 'signed-in',
          owner: 'unknown',
          revision: 1,
          activeRunCount: 0,
        },
      ],
      selections: {
        main: { scope: 'main', selection: { kind: 'omitted' }, revision: 1 },
        lane: { scope: 'lane', selection: { kind: 'omitted' }, revision: 1 },
      },
    },
  });
  readonly state = jest.fn((_provider: 'claude') => this.view.asReadonly());
  readonly open = jest.fn(async (_provider: 'claude') => undefined);
  readonly setSelection = jest.fn(async () => ({
    status: 'unavailable' as const,
  }));
}
class AmbientStub {
  readonly view = signal<ClaudeAmbientStatusView>({
    status: 'idle',
    result: null,
    localFailure: false,
  });
  readonly read = jest.fn(async (_refresh: boolean) => undefined);
}

describe('CliOrchestrationMatrixComponent', () => {
  let fixture: ComponentFixture<CliOrchestrationMatrixComponent>;
  let state: StateStub;
  let accounts: AccountsStub;
  let ambient: AmbientStub;
  /** Read when a cell is created; the matrix itself never injects the account services. */
  let electron = true;
  let feedback: SettingsSaveFeedbackService;
  const element = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
    (element().querySelector(selector) ?? document.querySelector(selector)) as T | null;
  const row = (id: string) => q(`[data-testid="cli-matrix-row-${id}"], [data-testid="cli-provider-card-${id}"]`);
  const _rowIds = (selector: string) =>
    Array.from(
      element().querySelectorAll(
        `${selector} [data-testid^="cli-provider-card-"]`,
      ),
    ).map((node) =>
      node.getAttribute('data-testid')?.replace('cli-provider-card-', ''),
    );
  const _statusOf = (id: string) => row(id)?.querySelector('[data-testid="cli-matrix-status"], .status-slot')?.textContent?.trim();
  async function flush() {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    fixture.detectChanges();
  }
  function check(id: string, checked: boolean) {
    const input = row(id)?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!input) throw new Error(`No toggle for ${id}`);
    input.checked = checked;
    input.dispatchEvent(new Event('change'));
  }
  function showSavedCodexDefault() {
    state.orchestration.set(ready({ ...ORCHESTRATION,
      cliLaneDefaults: { codex: { permission: 'plan', network: 'deny' } },
      detectedClis: ORCHESTRATION.detectedClis.map(cli =>
        cli.cli === 'codex' ? { ...cli, manifest: laneManifest } : cli),
    }));
    fixture.detectChanges();
  }
  function _clickNamed(root: Element | null, name: string): void {
    const button = Array.from(root?.querySelectorAll('button') ?? [])
      .find((candidate) => candidate.textContent?.trim() === name);
    if (!button) throw new Error(`No ${name} button`);
    button.click();
  }
  /** Runs afterNextRender callbacks (focus moves). */
  function _render() {
    TestBed.inject(ApplicationRef).tick();
    fixture.detectChanges();
  }

  beforeAll(() => {
    // jsdom has no <dialog> API; the Batch 32 modals use showModal()/close().
    HTMLDialogElement.prototype.showModal ??= function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });

  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      writable: true,
      configurable: true,
      value: jest.fn(),
    });
    state = new StateStub();
    accounts = new AccountsStub();
    ambient = new AmbientStub();
    electron = true;
    TestBed.configureTestingModule({
      imports: [CliOrchestrationMatrixComponent],
      providers: [
        { provide: ProvidersSettingsStateService, useValue: state },
        {
          // A getter: other children inject this service when the matrix is created, before a test flips `electron`.
          provide: VSCodeService,
          useValue: {
            get isElectron() {
              return electron;
            },
          },
        },
        { provide: ProviderAccountsStateService, useValue: accounts },
        { provide: ClaudeAmbientStatusService, useValue: ambient },
        {
          provide: PROVIDER_MODELS_LOADER,
          useValue: {
            listModels: jest.fn(async () => ({ models: [], totalCount: 0 })),
          },
        },
        SettingsSaveFeedbackService,
      ],
    });
    feedback = TestBed.inject(SettingsSaveFeedbackService);
    fixture = TestBed.createComponent(CliOrchestrationMatrixComponent);
    fixture.detectChanges();
  });
  afterEach(() => {
    feedback.dismiss();
    TestBed.resetTestingModule();
  });

  function table() {
    const component = fixture.debugElement.query(By.directive(LanesTableComponent))
      ?.componentInstance as LanesTableComponent | undefined;
    if (!component) throw new Error('Lanes table not mounted');
    return component;
  }
  function lane(id: string) {
    const found = table().rows().find(item => item.id === id);
    if (!found) throw new Error('Missing lane ' + id);
    return found;
  }

  it('routes system and instance toggles through the existing settings write', async () => {
    check('codex', false); await flush();
    expect(state.saveSettings).toHaveBeenCalledWith(
      { orchestration: { disabledClis: ['copilot', 'codex'] } }, CONTEXT,
    );
    check('glm-1', false); await flush();
    expect(state.saveSettings).toHaveBeenCalledWith(
      { cli: [{ action: 'update', params: { id: 'glm-1', enabled: false } }] }, CONTEXT,
    );
  });

  it('routes table default selection and reset through CliLaneDefaultsStore', async () => {
    showSavedCodexDefault();
    const codex = lane('codex');
    if (codex.kind !== 'system') throw new Error('Expected system lane');
    table().defaultSelected.emit({ row: codex, choice: { permission: 'ask', network: 'deny' } });
    await flush();
    expect(state.saveSettings).toHaveBeenCalledWith(
      { orchestration: { cliLaneDefaults: expect.objectContaining({ codex: { permission: 'ask', network: 'deny' } }) } },
      CONTEXT,
    );
    table().defaultResetRequested.emit(codex);
    await flush();
    expect(state.saveSettings).toHaveBeenCalledTimes(2);
  });

  it('writes a permission selection from the table control', async () => {
    showSavedCodexDefault();
    const select = row('codex')?.querySelector<HTMLSelectElement>('select[aria-label="Codex permission default"]');
    expect(select).not.toBeNull();
    if (!select) throw new Error('Missing Codex permission select');
    select.value = 'auto-edit';
    select.dispatchEvent(new Event('change'));
    await flush();
    expect(state.saveSettings).toHaveBeenCalledWith(
      { orchestration: { cliLaneDefaults: expect.objectContaining({ codex: { permission: 'auto-edit', network: 'deny' } }) } },
      CONTEXT,
    );
  });

  it('resets a saved default from the table control', async () => {
    showSavedCodexDefault();
    const cell = row('codex')?.querySelector('ptah-cli-lane-default-cell');
    _clickNamed(cell ?? null, 'More default actions');
    fixture.detectChanges();
    const reset = Array.from(cell?.querySelectorAll('button') ?? []).find(button => button.textContent?.includes('Reset to default'));
    expect(reset).toBeDefined();
    reset?.click();
    await flush();
    expect(state.saveSettings).toHaveBeenCalledWith(
      { orchestration: { cliLaneDefaults: { codex: null } } },
      CONTEXT,
    );
  });

  it('writes a toggle and Test from the table controls', async () => {
    check('codex', false);
    await flush();
    expect(state.saveSettings).toHaveBeenCalledWith(
      { orchestration: { disabledClis: ['copilot', 'codex'] } }, CONTEXT,
    );
    const actions = row('glm-1')?.querySelector<HTMLButtonElement>('ptah-table-row-actions button[aria-haspopup="menu"]');
    actions?.click();
    fixture.detectChanges();
    _clickNamed(row('glm-1'), 'Test');
    await flush();
    expect(state.testCliConnection).toHaveBeenCalledWith('glm-1');
  });

  it('routes order moves through preferredAgentOrder with undo', async () => {
    const originalOrder = ['codex', 'cursor', 'antigravity', 'glm-1', 'copilot'];
    state.orchestration.set(ready({ ...ORCHESTRATION, preferredAgentOrder: originalOrder }));
    fixture.detectChanges();
    table().moved.emit({ row: lane('codex'), direction: 1 }); await flush();
    expect(state.saveSettings).toHaveBeenCalledWith(
      { orchestration: { preferredAgentOrder: ['antigravity', 'cursor', 'codex', 'glm-1', 'copilot', 'opencode'] } },
      CONTEXT,
    );
    expect(feedback.toast()?.canUndo).toBe(true);
    await feedback.undo();
    await flush();
    expect(state.saveSettings).toHaveBeenCalledTimes(2);
    expect(state.saveSettings).toHaveBeenLastCalledWith(
      { orchestration: { preferredAgentOrder: originalOrder } }, CONTEXT,
    );
  });

  it('saves the full order including uninstalled IDs', async () => {
    state.orchestration.set(ready({ ...ORCHESTRATION, preferredAgentOrder: ['codex', 'cursor', 'antigravity', 'glm-1', 'copilot'] }));
    fixture.detectChanges();
    table().moved.emit({ row: lane('codex'), direction: 1 }); await flush();
    expect(state.saveSettings).toHaveBeenCalledWith(
      { orchestration: { preferredAgentOrder: ['antigravity', 'cursor', 'codex', 'glm-1', 'copilot', 'opencode'] } }, CONTEXT,
    );
  });

  it('shows one partial-data table message alongside readable lanes', () => {
    const malformed = { ...ORCHESTRATION };
    Object.defineProperty(malformed, 'detectedClis', { value: null });
    state.orchestration.set(ready(malformed));
    fixture.detectChanges();
    const messages = element().querySelectorAll('.ptah-table-message-cell');
    expect(messages).toHaveLength(1);
    expect(messages[0].textContent).toContain('Some lane data could not be loaded. Showing the lanes that could be read.');
    expect(q('[data-testid="cli-matrix-row-glm-1"]')).not.toBeNull();
  });

  it('shows one partial-data message for salvaged CLI summaries alongside all readable lanes', () => {
    state.cliAgents.set(ready(Object.assign([GLM], { missingFields: ['cliAgents'] })));
    fixture.detectChanges();
    const messages = element().querySelectorAll('.ptah-table-message-cell');
    expect(messages).toHaveLength(1);
    expect(messages[0].textContent).toContain('Some lane data could not be loaded. Showing the lanes that could be read.');
    expect(row('codex')).not.toBeNull();
    expect(q('[data-testid="cli-matrix-row-glm-1"]')).not.toBeNull();
  });

  it('routes test and last result to the existing connection test', async () => {
    table().test.emit(lane('glm-1')); await flush();
    expect(state.testCliConnection).toHaveBeenCalledWith('glm-1');
    expect(q('[data-testid="cli-matrix-row-glm-1"]')?.textContent).toContain('112ms');
  });

  it('routes edit and tier editor outputs to existing modals', () => {
    table().edit.emit(lane('glm-1')); fixture.detectChanges();
    expect(q('[data-testid="add-cli-instance-modal"]')?.closest('dialog')?.hasAttribute('open')).toBe(true);
    table().tiers.emit(lane('glm-1')); fixture.detectChanges();
    expect(q('[data-testid="cli-tier-mapping-modal"]')?.closest('dialog')?.hasAttribute('open')).toBe(true);
  });

  it('routes confirmed delete to the existing delete write', async () => {
    table().delete.emit(lane('glm-1')); await flush();
    expect(state.saveSettings).toHaveBeenCalledWith(
      { cli: [{ action: 'delete', params: { id: 'glm-1' } }] }, CONTEXT,
    );
  });

  it('routes install Re-detect and retry to existing state reads', async () => {
    table().redetect.emit('pi'); await flush();
    expect(state.redetectClis).toHaveBeenCalledTimes(1);
    table().retry.emit(); await flush();
    expect(state.refreshOrchestration).toHaveBeenCalledTimes(1);
    expect(state.refreshCliAgents).toHaveBeenCalledTimes(1);
  });
});
