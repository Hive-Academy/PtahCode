import { signal } from '@angular/core';
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
  let feedback: SettingsSaveFeedbackService;
  let accounts: AccountsStub;
  let ambient: AmbientStub;
  let electron: boolean;
  const element = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => element().querySelector(selector) as T | null;
  const card = (id: string) => q(`[data-testid="cli-provider-card-${id}"]`);
  const button = (root: Element | null, label: string) => Array.from(root?.querySelectorAll('button') ?? [])
    .find(candidate => candidate.textContent?.trim().includes(label)) as HTMLButtonElement | undefined;
  const toggle = (id: string) => card(id)?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const openDetail = (id: string) => {
    q<HTMLButtonElement>(`[data-testid="cli-provider-card-${id}"] ptah-table-row-expander button, [data-testid="cli-matrix-row-${id}"] ptah-table-row-expander button`)?.click();
    fixture.detectChanges();
  };
  async function flush() { for (let i = 0; i < 8; i += 1) await Promise.resolve(); fixture.detectChanges(); }
  function _check(id: string, checked: boolean) {
    const input = toggle(id);
    if (!input) throw new Error(`No toggle for ${id}`);
    input.checked = checked;
    input.dispatchEvent(new Event('change'));
  }
  function _showSavedCodexDefault() {
    state.orchestration.set(ready({ ...ORCHESTRATION,
      cliLaneDefaults: { codex: { permission: 'plan', network: 'deny' } },
      detectedClis: ORCHESTRATION.detectedClis.map(cli =>
        cli.cli === 'codex' ? { ...cli, manifest: laneManifest } : cli),
    }));
    fixture.detectChanges();
  }
  function _expandUninstalled() { q<HTMLButtonElement>('[data-testid="cli-matrix-uninstalled-toggle"]')?.click(); fixture.detectChanges(); }
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
  });
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { writable: true, configurable: true, value: jest.fn() });
    state = new StateStub();
    accounts = new AccountsStub(); ambient = new AmbientStub(); electron = true;
    TestBed.configureTestingModule({
      imports: [CliOrchestrationMatrixComponent],
      providers: [
        { provide: ProvidersSettingsStateService, useValue: state },
        { provide: VSCodeService, useValue: { get isElectron() { return electron; } } },
        { provide: ProviderAccountsStateService, useValue: accounts },
        { provide: ClaudeAmbientStatusService, useValue: ambient },
        { provide: PROVIDER_MODELS_LOADER, useValue: { listModels: jest.fn(async () => ({ models: [], totalCount: 0 })) } },
        SettingsSaveFeedbackService,
      ],
    });
    feedback = TestBed.inject(SettingsSaveFeedbackService);
    fixture = TestBed.createComponent(CliOrchestrationMatrixComponent);
    fixture.detectChanges();
  });
  afterEach(() => { feedback.dismiss(); TestBed.resetTestingModule(); });

  it('mounts one Lanes table with installed, instance and uninstalled rows in try order', () => {
    const ids = Array.from(element().querySelectorAll('ptah-lanes-table tbody > tr[data-testid]'))
      .map(row => row.getAttribute('data-testid'));
    expect(ids).toEqual([
      'cli-provider-card-codex', 'cli-provider-card-antigravity',
      'cli-matrix-row-glm-1', 'cli-provider-card-copilot',
      'cli-provider-card-opencode', 'cli-provider-card-cursor', 'cli-provider-card-pi',
    ]);
    expect(element().querySelectorAll('ptah-lanes-table')).toHaveLength(1);
    expect(q('ptah-cli-instances')).not.toBeNull();
  });

  it('keeps row facts, native permission, capabilities and test result in the detail', () => {
    const codex = card('codex');
    expect(codex).not.toBeNull();
    openDetail('codex');
    const detail = q('#lane-detail-codex');
    expect(detail?.hidden).toBe(false);
    expect(detail?.textContent).toContain('Provider');
    expect(detail?.querySelector('[data-popover-kind="permission"]')).not.toBeNull();
    expect(detail?.querySelector('ptah-cli-capability-cells')).not.toBeNull();
    expect(detail?.querySelector('[data-testid="cli-matrix-test-result"]')?.textContent).toContain('Not run yet');
    button(detail, 'Info')?.click(); fixture.detectChanges();
    expect(q('#lane-detail-codex ptah-cli-provider-card-popovers')).not.toBeNull();
  });

  it('reuses the Claude account cell and Cursor credentials in details', () => {
    state.orchestration.set(ready({ ...ORCHESTRATION,
      detectedClis: [...ORCHESTRATION.detectedClis, detected('claude', true)],
    }));
    fixture.detectChanges();
    openDetail('claude');
    expect(q('#lane-detail-claude ptah-claude-lane-account-cell')).not.toBeNull();
    openDetail('cursor');
    const credential = q<HTMLButtonElement>('#lane-detail-cursor [data-popover-kind="credentials"]');
    expect(credential).not.toBeNull();
    credential?.click(); fixture.detectChanges();
    expect(q('#lane-detail-cursor ptah-cursor-credential-popover')).not.toBeNull();
  });

  it('exposes instance tiers, editor and add modal', () => {
    openDetail('glm-1');
    expect(q('#lane-detail-glm-1')?.textContent).toContain('Sonnet');
    button(q('#lane-detail-glm-1'), 'Edit tiers')?.click(); fixture.detectChanges();
    expect(q('[data-testid="cli-tier-mapping-modal"]')?.closest('dialog')?.hasAttribute('open')).toBe(true);
    q<HTMLButtonElement>('[data-testid="cli-matrix-add"]')?.click(); fixture.detectChanges();
    expect(q('[data-testid="add-cli-instance-modal"]')?.closest('dialog')?.hasAttribute('open')).toBe(true);
  });

  it('uses fixed error text and retries without exposing a failed read message', async () => {
    state.orchestration.set({ status: 'error', data: ORCHESTRATION, error: 'secret server trace' });
    fixture.detectChanges();
    expect(q('ptah-lanes-table')?.textContent).toContain('Could not load lanes.');
    expect(q('ptah-lanes-table')?.textContent).not.toContain('secret server trace');
    button(q('ptah-lanes-table'), 'Retry')?.click(); await flush();
    expect(state.refreshOrchestration).toHaveBeenCalledTimes(1);
    expect(state.refreshCliAgents).toHaveBeenCalledTimes(1);
  });

  it('opens the install guide and invokes Re-detect', async () => {
    button(card('pi'), 'Install guide')?.click(); fixture.detectChanges();
    expect(q('#lane-detail-pi ptah-cli-provider-card-popovers')?.textContent).toContain('Re-detect');
    button(q('#lane-detail-pi'), 'Re-detect')?.click(); await flush();
    expect(state.redetectClis).toHaveBeenCalledTimes(1);
  });
});
