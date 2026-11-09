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
  CLI_INSTALL_GUIDES,
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
  async function flush() { for (let i = 0; i < 8; i += 1) await Promise.resolve(); fixture.detectChanges(); }
  function check(id: string, checked: boolean) {
    const input = toggle(id);
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
  function expandUninstalled() { q<HTMLButtonElement>('[data-testid="cli-matrix-uninstalled-toggle"]')?.click(); fixture.detectChanges(); }
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

  it('mounts installed cards in preferred order, then uninstalled cards, with instances and shared defaults below', () => {
    state.orchestration.set(ready({ ...ORCHESTRATION,
      detectedClis: ORCHESTRATION.detectedClis.map(cli =>
        cli.cli === 'ptah-cli' ? { ...cli, manifest: laneManifest } : cli),
    }));
    fixture.detectChanges();
    expect(Array.from(q('[data-testid="cli-matrix"]')?.querySelectorAll('ptah-cli-provider-grid:first-child ptah-cli-provider-card article') ?? [])
      .map(node => node.getAttribute('data-testid'))).toEqual([
        'cli-provider-card-codex', 'cli-provider-card-antigravity', 'cli-provider-card-copilot', 'cli-provider-card-opencode',
      ]);
    expect(card('cursor')).toBeNull();
    expandUninstalled();
    expect(card('cursor')).not.toBeNull();
    expect(card('pi')).not.toBeNull();
    expect(q('ptah-cli-shared-defaults')).not.toBeNull();
    expect(q('ptah-cli-instances')).not.toBeNull();
    expect(card('glm-1')).toBeNull();
  });
  it('keeps the Uninstalled disclosure collapsed with its count and omits it when all CLIs are installed', () => {
    const disclosure = q<HTMLButtonElement>('[data-testid="cli-matrix-uninstalled-toggle"]');
    expect(disclosure?.textContent).toContain('Uninstalled CLI agents (2)');
    expect(disclosure?.getAttribute('aria-expanded')).toBe('false');
    expect(q('[data-testid="cli-matrix-uninstalled"]')).toBeNull();
    disclosure?.click(); fixture.detectChanges();
    expect(q('[data-testid="cli-matrix-uninstalled"]')?.querySelectorAll('ptah-cli-provider-card')).toHaveLength(2);
    state.orchestration.set(ready({ ...ORCHESTRATION, detectedClis: [detected('codex', true)] }));
    fixture.detectChanges();
    expect(q('[data-testid="cli-matrix-uninstalled-toggle"]')).toBeNull();
  });
  it('shows loading and empty states', () => {
    state.orchestration.set(unloaded()); state.cliAgents.set(unloaded()); fixture.detectChanges();
    expect(q('[data-testid="cli-matrix"]')?.getAttribute('aria-busy')).toBe('true');
    expect(q('[data-testid="cli-matrix-empty"]')?.textContent).toContain('Loading CLI agents');
    state.orchestration.set(ready({ ...ORCHESTRATION, detectedClis: [detected('pi', false)] }));
    state.cliAgents.set(ready([])); fixture.detectChanges();
    expect(q('[data-testid="cli-matrix-empty"]')?.textContent).toContain('No CLI agent is installed');
  });
  it('keeps installed toggles focusable but aria-disabled while a save runs', () => {
    expandUninstalled();
    expect(toggle('cursor')?.disabled).toBe(true);
    state.commit.set({ ...idle, status: 'saving' }); fixture.detectChanges();
    expect(toggle('codex')?.disabled).toBe(false);
    expect(toggle('codex')?.getAttribute('aria-disabled')).toBe('true');
    check('codex', false);
    expect(state.saveSettings).not.toHaveBeenCalled();
    expect(toggle('codex')?.checked).toBe(true);
  });
  it('renders normalized versions, a single model id and the Codex executable line', () => {
    state.orchestration.set(ready({ ...ORCHESTRATION,
      detectedClis: ORCHESTRATION.detectedClis.map(cli => cli.cli === 'codex'
        ? { ...cli, version: 'codex-cli 0.155.1', codexSource: 'system' }
        : cli),
      antigravityModel: 'claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)',
    })); fixture.detectChanges();
    expect(card('codex')?.querySelector('[data-testid="cli-matrix-version"]')?.textContent?.trim()).toBe('v0.155.1');
    expect(card('codex')?.querySelector('[data-testid="cli-matrix-version"]')?.getAttribute('title')).toBe('codex-cli 0.155.1');
    expect(card('antigravity')?.querySelector('button[title*="Claude Sonnet 4.6"]')?.textContent?.trim()).toBe('claude-sonnet-4-6');
    expect(card('codex')?.textContent).toContain('codex-cli');
  });
  it('shows model and effort actions only for enabled installed cards', () => {
    expandUninstalled();
    expect(button(card('codex'), 'gpt-5.5-codex')?.disabled).toBe(false);
    expect(button(card('copilot'), 'CLI default')?.disabled).toBe(true);
    expect(button(card('cursor'), 'CLI default')?.disabled).toBe(true);
  });
  it('preserves matrix concurrency changes and preferred order edits', async () => {
    const concurrency = q<HTMLInputElement>('[data-testid="policy-max-concurrent-input"]');
    expect(concurrency?.value).toBe('3');
    if (!concurrency) throw new Error('Missing concurrency input');
    concurrency.value = '4'; concurrency.dispatchEvent(new Event('change'));
    await flush();
    expect(state.saveSettings).toHaveBeenCalledWith(
      { orchestration: { maxConcurrentAgents: 4 } }, CONTEXT);
    q<HTMLButtonElement>('[data-testid="policy-order-edit"]')?.click(); fixture.detectChanges();
    q<HTMLButtonElement>('[data-testid="policy-order-up-antigravity"]')?.click(); await flush();
    expect(state.saveSettings).toHaveBeenCalledWith(
      { orchestration: { preferredAgentOrder: ['antigravity', 'codex', 'glm-1', 'copilot', 'opencode'] } }, CONTEXT);
  });
  it('renders card status and a live test slot', () => {
    expect(card('codex')?.querySelector('.status-slot')?.textContent?.trim()).toBeTruthy();
    expect(card('codex')?.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
  it('keeps Credentials on Cursor only and Install guide on uninstalled cards', () => {
    expandUninstalled();
    expect(button(card('cursor'), 'Credentials')).toBeDefined();
    expect(button(card('codex'), 'Credentials')).toBeUndefined();
    expect(button(card('pi'), 'Install guide')).toBeDefined();
    button(card('pi'), 'Install guide')?.click(); fixture.detectChanges();
    expect(element().textContent).toContain(CLI_INSTALL_GUIDES.pi.note);
  });
  it('forwards Codex settings request through the public output', () => {
    const requested = jest.fn();
    fixture.componentInstance.codexSettingsRequested.subscribe(requested);
    button(card('codex'), 'Codex settings')?.click();
    expect(requested).toHaveBeenCalledTimes(1);
  });
  it('saves a lane default and Undo restores the previous choice', async () => {
    showSavedCodexDefault();
    const select = card('codex')?.querySelector('select') as HTMLSelectElement;
    select.value = 'auto-edit'; select.dispatchEvent(new Event('change'));
    await flush();
    expect(state.saveSettings).toHaveBeenCalledWith(
      { orchestration: { cliLaneDefaults: { codex: { permission: 'auto-edit', network: 'deny' } } } }, CONTEXT);
    await feedback.undo();
    expect(state.saveSettings).toHaveBeenLastCalledWith(
      { orchestration: { cliLaneDefaults: { codex: { permission: 'plan', network: 'deny' } } } }, CONTEXT);
  });
  it('opens lane default actions before Reset and restores the saved choice on Undo', async () => {
    showSavedCodexDefault();
    button(card('codex'), 'More default actions')?.click(); fixture.detectChanges();
    button(element(), 'Reset to default')?.click(); await flush();
    expect(state.saveSettings).not.toHaveBeenCalled();
    button(card('codex'), 'Confirm')?.click(); await flush();
    expect(state.saveSettings).toHaveBeenCalledWith({ orchestration: { cliLaneDefaults: { codex: null } } }, CONTEXT);
    await feedback.undo();
    expect(state.saveSettings).toHaveBeenLastCalledWith(
      { orchestration: { cliLaneDefaults: { codex: { permission: 'plan', network: 'deny' } } } }, CONTEXT);
  });
  it('requires confirmation before saving full access', async () => {
    showSavedCodexDefault();
    const select = card('codex')?.querySelector('select') as HTMLSelectElement;
    select.value = 'yolo'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(state.saveSettings).not.toHaveBeenCalled();
    expect(card('codex')?.querySelector('dialog[open]')).not.toBeNull();
    button(card('codex'), 'Confirm')?.click(); await flush();
    expect(state.saveSettings).toHaveBeenCalled();
  });
  it('toggles system CLI through disabledClis with Undo and preserves the saved checkbox until readback', async () => {
    check('codex', false); await flush();
    expect(state.saveSettings).toHaveBeenCalledWith({ orchestration: { disabledClis: ['copilot', 'codex'] } }, CONTEXT);
    expect(toggle('codex')?.checked).toBe(true);
    await feedback.undo();
    expect(state.saveSettings).toHaveBeenLastCalledWith({ orchestration: { disabledClis: ['copilot'] } }, CONTEXT);
  });
  it('disables uninstalled toggles and marks installed toggles aria-disabled when writing is unavailable', () => {
    expandUninstalled();
    expect(toggle('pi')?.disabled).toBe(true);
    state.scopes.set(unloaded()); fixture.detectChanges();
    expect(toggle('codex')?.disabled).toBe(false);
    expect(toggle('codex')?.getAttribute('aria-disabled')).toBe('true');
  });
  it('mounts the Claude lane account cell only for installed Claude on Electron', () => {
    expect(q('ptah-claude-lane-account-cell')).toBeNull();
    expect(accounts.open).not.toHaveBeenCalled();
    state.orchestration.set(ready({ ...ORCHESTRATION,
      detectedClis: [...ORCHESTRATION.detectedClis, detected('claude', true, { version: '2.1.0' })],
    })); fixture.detectChanges();
    expect(card('claude')?.querySelector('ptah-claude-lane-account-cell')).not.toBeNull();
    expect(accounts.open).toHaveBeenCalledWith('claude');
    expect(ambient.read).toHaveBeenCalledWith(false);
    state.orchestration.set(ready({ ...ORCHESTRATION,
      detectedClis: [...ORCHESTRATION.detectedClis, detected('claude', false)],
    })); fixture.detectChanges(); expandUninstalled();
    expect(card('claude')?.querySelector('ptah-claude-lane-account-cell')).toBeNull();
  });
  it('renders and reads no Claude account off Electron', () => {
    electron = false;
    state.orchestration.set(ready({ ...ORCHESTRATION,
      detectedClis: [...ORCHESTRATION.detectedClis, detected('claude', true)],
    })); fixture.detectChanges();
    expect(card('claude')?.querySelector('[data-testid="cli-matrix-account-trigger"]')).toBeNull();
    expect(accounts.open).not.toHaveBeenCalled();
    expect(accounts.state).not.toHaveBeenCalled();
    expect(ambient.read).not.toHaveBeenCalled();
  });
  it('owns one provider popover across installed and uninstalled grids', () => {
    expandUninstalled();
    button(card('codex'), 'Info')?.click(); fixture.detectChanges();
    expect(card('codex')?.querySelector('[data-testid="cli-provider-popover-content"]')).not.toBeNull();
    button(card('cursor'), 'Install guide')?.click(); fixture.detectChanges();
    expect(card('codex')?.querySelector('[data-testid="cli-provider-popover-content"]')).toBeNull();
    expect(card('cursor')?.querySelector('[data-testid="cli-provider-popover-content"]')).not.toBeNull();
  });
  it('keeps a moved Cursor popover open and returns focus to its new trigger', async () => {
    document.body.appendChild(fixture.nativeElement);
    try {
      expandUninstalled();
      button(card('cursor'), 'Credentials')?.click(); fixture.detectChanges();
      state.orchestration.set(ready({ ...ORCHESTRATION,
        detectedClis: ORCHESTRATION.detectedClis.map(cli => cli.cli === 'cursor' ? { ...cli, installed: true } : cli),
      })); fixture.detectChanges();
      expect(card('cursor')?.querySelector('[data-testid="cursor-credential-popover"]')).not.toBeNull();
      card('cursor')?.querySelector<HTMLButtonElement>('[data-testid="cursor-credential-popover"] button[aria-label="Close"]')?.click();
      fixture.detectChanges(); await flush();
      expect(document.activeElement).toBe(card('cursor')?.querySelector('[data-popover-kind="credentials"]'));
    } finally { fixture.nativeElement.remove(); }
  });
  it('opens a collapsed Uninstalled group for a moved popover, then focuses its disclosure on close', async () => {
    document.body.appendChild(fixture.nativeElement);
    try {
      state.orchestration.set(ready({ ...ORCHESTRATION,
        detectedClis: ORCHESTRATION.detectedClis.map(cli => cli.cli === 'cursor' ? { ...cli, installed: true } : cli),
      })); fixture.detectChanges();
      button(card('cursor'), 'Credentials')?.click(); fixture.detectChanges();
      state.orchestration.set(ready(ORCHESTRATION)); fixture.detectChanges();
      expect(q('[data-testid="cli-matrix-uninstalled-toggle"]')?.getAttribute('aria-expanded')).toBe('true');
      expect(card('cursor')?.querySelector('[data-testid="cursor-credential-popover"]')).not.toBeNull();
      card('cursor')?.querySelector<HTMLButtonElement>('[data-testid="cursor-credential-popover"] button[aria-label="Close"]')?.click();
      fixture.detectChanges(); await flush();
      expect(q('[data-testid="cli-matrix-uninstalled"]')).toBeNull();
      expect(document.activeElement).toBe(q('[data-testid="cli-matrix-uninstalled-toggle"]'));
    } finally { fixture.nativeElement.remove(); }
  });
  it('opens and closes a model popover in one click', async () => {
    const trigger = card('codex')?.querySelector<HTMLButtonElement>('[data-popover-kind="model"]');
    trigger?.click(); fixture.detectChanges(); await flush();
    expect(card('codex')?.querySelector('[data-testid="cli-matrix-popover"]')?.getAttribute('data-field')).toBe('model');
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    card('codex')?.querySelector<HTMLButtonElement>('[data-testid="cli-matrix-popover"] button[aria-label="Close"]')?.click();
    fixture.detectChanges();
    expect(card('codex')?.querySelector('[data-testid="cli-matrix-popover"]')).toBeNull();
  });
  it('saves an effort in two clicks', async () => {
    card('codex')?.querySelector<HTMLButtonElement>('[data-popover-kind="effort"]')?.click(); fixture.detectChanges();
    card('codex')?.querySelector<HTMLButtonElement>('[data-testid="cli-matrix-popover"] [data-effort="high"]')?.click();
    await flush();
    expect(state.saveSettings).toHaveBeenCalledWith({ orchestration: { codexReasoningEffort: 'high' } }, CONTEXT);
  });
  it('Escape closes the effort popover and returns focus during a save', async () => {
    document.body.appendChild(fixture.nativeElement);
    try {
      let release: (saved: boolean) => void = () => undefined;
      state.saveSettings.mockImplementationOnce(() => {
        state.commit.set({ ...idle, status: 'saving' });
        return new Promise<boolean>(resolve => {
          release = saved => { state.commit.set({ ...idle, status: 'saved' }); resolve(saved); };
        });
      });
      const trigger = card('codex')?.querySelector<HTMLButtonElement>('[data-popover-kind="effort"]');
      trigger?.focus(); trigger?.click(); fixture.detectChanges(); await flush();
      const high = card('codex')?.querySelector<HTMLButtonElement>('[data-testid="cli-matrix-popover"] [data-effort="high"]');
      high?.focus(); high?.click(); await flush();
      expect(feedback.saving()).toBe(true);
      expect(trigger?.disabled).toBe(false);
      expect(trigger?.getAttribute('aria-disabled')).toBe('true');
      high?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      fixture.detectChanges(); await flush();
      expect(card('codex')?.querySelector('[data-testid="cli-matrix-popover"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      release(true); await flush();
    } finally { fixture.nativeElement.remove(); }
  });
  it('shows instance key status, tier models, and unset tiers in the instance section', () => {
    const instance = q('[data-testid="cli-matrix-row-glm-1"]');
    expect(instance?.querySelector('[data-testid="cli-matrix-key-status"]')?.textContent).toContain('Key');
    expect(Array.from(instance?.querySelectorAll('[data-tier]') ?? []).map(tier => tier.textContent?.replace(/\s+/g, '')))
      .toEqual(['Sonnet:glm-5.3', 'Opus:glm-4.7', 'Haiku:glm-4.5']);
    const summary = instance?.querySelector('[data-testid="cli-matrix-tier-summary"]');
    expect(summary?.getAttribute('title')).toBe('Sonnet: glm-5.3, Opus: glm-4.7, Haiku: glm-4.5');
    state.cliModels.set(ready({ 'glm-1': { selectedModel: '', tierMappings: { sonnet: 'glm-5.3' } } }));
    fixture.detectChanges();
    expect(q('[data-testid="cli-matrix-tier-summary"]')?.textContent).toContain('1 of 3 set');
    expect(Array.from(q('[data-testid="cli-matrix-row-glm-1"]')?.querySelectorAll('[data-tier]') ?? [])
      .map(tier => tier.textContent?.replace(/\s+/g, '')))
      .toEqual(['Sonnet:glm-5.3', 'Opus:Notset', 'Haiku:Notset']);
  });
  it('opens add empty, edit populated, and tier modals through the instance section', () => {
    const dialogOpen = (id: string) => q(`[data-testid="${id}"]`)?.closest('dialog')?.hasAttribute('open');
    q<HTMLButtonElement>('[data-testid="cli-matrix-add"]')?.click(); fixture.detectChanges();
    expect(dialogOpen('add-cli-instance-modal')).toBe(true);
    expect(q<HTMLInputElement>('[data-testid="add-cli-instance-name"]')?.value).toBe('');
    q<HTMLButtonElement>('[data-testid="add-cli-instance-modal"] button[aria-label="Close"]')?.click(); fixture.detectChanges();
    q<HTMLButtonElement>('[data-testid="cli-matrix-more-glm-1"]')?.click(); fixture.detectChanges();
    q<HTMLButtonElement>('[data-testid="cli-matrix-edit-glm-1"]')?.click(); fixture.detectChanges();
    expect(dialogOpen('add-cli-instance-modal')).toBe(true);
    expect(q<HTMLInputElement>('[data-testid="add-cli-instance-name"]')?.value).toBe('Glm');
    q<HTMLButtonElement>('[data-testid="add-cli-instance-modal"] button[aria-label="Close"]')?.click(); fixture.detectChanges();
    q<HTMLButtonElement>('[data-testid="cli-matrix-tiers-glm-1"]')?.click(); fixture.detectChanges();
    expect(dialogOpen('cli-tier-mapping-modal')).toBe(true);
  });
  it('offers Add from the instance empty state', () => {
    state.cliAgents.set(ready([])); fixture.detectChanges();
    expect(q('[data-testid="cli-matrix-no-instances"]')?.textContent).toContain('No Ptah CLI instance yet.');
    button(q('[data-testid="cli-matrix-no-instances"]'), 'Add Ptah CLI Instance')?.click(); fixture.detectChanges();
    expect(q('[data-testid="add-cli-instance-modal"]')?.closest('dialog')?.hasAttribute('open')).toBe(true);
  });
  it('shows each permission note and Copilot auto approve only for Copilot', () => {
    button(card('copilot'), 'Auto-approve: Off')?.click(); fixture.detectChanges();
    expect(card('copilot')?.querySelector('ptah-cli-provider-card-popovers')).not.toBeNull();
    expect(card('copilot')?.querySelector('ptah-copilot-auto-approve-toggle')).not.toBeNull();
    button(card('codex'), 'Ask')?.click(); fixture.detectChanges();
    expect(card('codex')?.querySelector('ptah-copilot-auto-approve-toggle')).toBeNull();
  });
  it('tests a system CLI and displays its latest result in the card', async () => {
    state.testResult = { id: 'codex', success: true, latencyMs: 112, reason: null };
    button(card('codex'), 'Test')?.click(); await flush();
    expect(state.testCliConnection).toHaveBeenCalledWith('codex');
    expect(card('codex')?.querySelector('.test-status')?.textContent).toContain('112ms');
  });
  it('re-detects from an install guide and moves a found card into the installed grid', async () => {
    expandUninstalled();
    state.onRedetect = () => state.orchestration.set(ready({ ...ORCHESTRATION,
      detectedClis: ORCHESTRATION.detectedClis.map(cli => cli.cli === 'pi' ? { ...cli, installed: true } : cli),
    }));
    button(card('pi'), 'Install guide')?.click(); fixture.detectChanges();
    button(card('pi'), 'Re-detect')?.click(); await flush();
    expect(state.redetectClis).toHaveBeenCalledTimes(1);
    expect(q('[data-testid="cli-matrix-uninstalled"] [data-testid="cli-provider-card-pi"]')).toBeNull();
    expect(card('pi')).not.toBeNull();
  });
});
