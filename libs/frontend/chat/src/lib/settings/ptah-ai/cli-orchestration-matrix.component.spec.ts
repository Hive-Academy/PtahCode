import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
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
import { CliOrchestrationMatrixComponent } from './cli-orchestration-matrix.component';

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
  messaging: {
    steer: laneSupported,
    interrupt: laneSupported,
    continuation: laneSupported,
    resume: laneSupported,
  },
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
  readonly testSystemLane = jest.fn(async (cli: string) => {
    this.cliTest.set(ready({ ...this.testResult, id: cli }));
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

@Component({
  selector: 'ptah-read-states-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CliOrchestrationMatrixComponent],
  template: `
    <ptah-cli-orchestration-matrix hostReadStates>
      <p read-states role="alert" data-testid="projected-read-state">
        Could not load CLI agents.
      </p>
    </ptah-cli-orchestration-matrix>
  `,
})
class ReadStatesHostComponent {}

describe('CliOrchestrationMatrixComponent', () => {
  let fixture: ComponentFixture<CliOrchestrationMatrixComponent>;
  let state: StateStub;
  let feedback: SettingsSaveFeedbackService;
  let accounts: AccountsStub;
  let ambient: AmbientStub;
  let electron: boolean;
  const element = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
    element().querySelector(selector) as T | null;
  const card = (id: string) => q(`[data-testid="cli-provider-card-${id}"]`);
  const button = (root: Element | null, label: string) =>
    Array.from(root?.querySelectorAll('button') ?? []).find((candidate) =>
      candidate.textContent?.trim().includes(label),
    ) as HTMLButtonElement | undefined;
  const toggle = (id: string) =>
    card(id)?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const openDetail = (id: string) => {
    q<HTMLButtonElement>(
      `[data-testid="cli-provider-card-${id}"] ptah-table-row-expander button, [data-testid="cli-matrix-row-${id}"] ptah-table-row-expander button`,
    )?.click();
    fixture.detectChanges();
  };
  async function flush() {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    fixture.detectChanges();
  }
  function _check(id: string, checked: boolean) {
    const input = toggle(id);
    if (!input) throw new Error(`No toggle for ${id}`);
    input.checked = checked;
    input.dispatchEvent(new Event('change'));
  }
  function _showSavedCodexDefault() {
    state.orchestration.set(
      ready({
        ...ORCHESTRATION,
        cliLaneDefaults: { codex: { permission: 'plan', network: 'deny' } },
        detectedClis: ORCHESTRATION.detectedClis.map((cli) =>
          cli.cli === 'codex' ? { ...cli, manifest: laneManifest } : cli,
        ),
      }),
    );
    fixture.detectChanges();
  }
  beforeAll(() => {
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

  it('routes a system row Test to detection and shows its named result', async () => {
    const announce = jest.spyOn(feedback, 'announce');
    openDetail('codex');
    const test = button(q('#lane-detail-codex'), 'Test');
    expect(test).toBeDefined();
    test?.click();
    await flush();
    expect(state.testSystemLane).toHaveBeenCalledWith('codex');
    expect(state.testCliConnection).not.toHaveBeenCalled();
    expect(
      q('#lane-detail-codex [data-testid="cli-matrix-test-result"]')
        ?.textContent,
    ).toBe('Passed in 112ms.');
    expect(announce).toHaveBeenCalledWith(
      expect.stringMatching(/^Codex: Test passed/),
      'status',
    );
  });

  it('routes an instance row Test to the instance RPC', async () => {
    openDetail('glm-1');
    const test = button(q('#lane-detail-glm-1'), 'Test');
    expect(test).toBeDefined();
    test?.click();
    await flush();
    expect(state.testCliConnection).toHaveBeenCalledWith('glm-1');
    expect(state.testSystemLane).not.toHaveBeenCalled();
  });

  it('keeps a system failure short in the table and names it in the toast', async () => {
    const announce = jest.spyOn(feedback, 'announce');
    state.testResult = {
      id: 'codex',
      success: false,
      latencyMs: 10,
      reason: 'Not detected.',
    };
    openDetail('codex');
    button(q('#lane-detail-codex'), 'Test')?.click();
    await flush();
    expect(
      q('#lane-detail-codex [data-testid="cli-matrix-test-result"]')
        ?.textContent,
    ).toBe('Not detected.');
    expect(announce).toHaveBeenCalledWith(
      'Codex: The connection test failed. Not detected.',
      'alert',
    );
  });

  it('mounts one Lanes table: CLI agents and Ptah CLI groups, the keyless Cursor as recovery row, the strip for the rest', () => {
    const ids = (selector: string) =>
      Array.from(element().querySelectorAll(selector)).map((row) =>
        row.getAttribute('data-testid'),
      );
    expect(
      ids('ptah-lanes-table tbody[data-lanes-group="cli"] > tr[data-lane-kind]'),
    ).toEqual([
      'cli-provider-card-codex',
      'cli-provider-card-antigravity',
      'cli-provider-card-copilot',
      'cli-provider-card-opencode',
      'cli-provider-card-cursor',
    ]);
    expect(
      ids('ptah-lanes-table tbody[data-lanes-group="ptah"] > tr[data-lane-kind]'),
    ).toEqual(['cli-matrix-row-glm-1']);
    // Global numbers run across both groups; the recovery row has none.
    const number = (testId: string) =>
      q(`[data-testid="${testId}"] td`)?.textContent?.trim();
    expect(number('cli-provider-card-codex')).toBe('1');
    expect(number('cli-matrix-row-glm-1')).toBe('3');
    expect(number('cli-provider-card-cursor')).toBe('—');
    // Not-installed CLIs leave the table for the strip; the keyless Cursor is not in the strip.
    expect(ids('[data-testid="lanes-strip"] [data-testid^="cli-provider-card-"]')).toEqual([
      'cli-provider-card-pi',
    ]);
    expect(element().querySelectorAll('ptah-lanes-table')).toHaveLength(1);
    expect(q('ptah-cli-instances')).toBeNull();
    expect(q('ptah-cli-shared-defaults')).toBeNull();
  });

  it('counts table rows only: the badge = installed + recovery rows = the sum of the group counts', () => {
    expect(q('[data-testid="lanes-group-cli-count"]')?.textContent).toBe('5');
    expect(q('[data-testid="lanes-group-ptah-count"]')?.textContent).toBe('1');
    const header = fixture.debugElement.query(
      By.css('ptah-lanes-section-header'),
    ).componentInstance as { total: () => number; enabled: () => number };
    expect(header.total()).toBe(6);
    // Strip CLIs are not counted.
    expect(q('[data-testid="lanes-strip-count"]')?.textContent).toBe('1');
  });

  it('hides the strip in Reorder mode', () => {
    fixture.componentInstance['orderMode'].set(true);
    fixture.detectChanges();
    expect(q('[data-testid="lanes-strip"]')).toBeNull();
    expect(q('[data-testid="lanes-group-cli"]')).toBeNull();
  });

  it('keeps row facts, native behavior, capabilities and test result in the detail', () => {
    const codex = card('codex');
    expect(codex).not.toBeNull();
    openDetail('codex');
    const detail = q('#lane-detail-codex');
    expect(detail?.hidden).toBe(false);
    expect(detail?.textContent).toContain('Provider');
    // Decision 13: native behavior and the capability facts are inline text, not popover buttons.
    expect(detail?.textContent).toContain('Native behavior');
    expect(
      detail?.querySelector('[data-popover-kind="permission"]'),
    ).toBeNull();
    expect(
      detail?.querySelector(
        '[data-testid="cli-capability-summary"] [data-capability]',
      ),
    ).not.toBeNull();
    expect(
      detail?.querySelector(
        '[data-testid="cli-matrix-test-result"]',
      )?.textContent,
    ).toContain('Not run yet');
    expect(button(detail, 'Info')).toBeFalsy();
    expect(
      q('#lane-detail-codex ptah-cli-provider-card-popovers'),
    ).toBeNull();
    expect(
      detail?.querySelector('[data-lane-capabilities] button'),
    ).not.toBeNull();
  });

  it('reuses the Claude account cell and Cursor credentials in details', () => {
    state.orchestration.set(
      ready({
        ...ORCHESTRATION,
        detectedClis: [...ORCHESTRATION.detectedClis, detected('claude', true)],
      }),
    );
    fixture.detectChanges();
    openDetail('claude');
    expect(
      q('#lane-detail-claude ptah-claude-lane-account-cell'),
    ).not.toBeNull();
    openDetail('cursor');
    const credential = q<HTMLButtonElement>(
      '#lane-detail-cursor [data-popover-kind="credentials"]',
    );
    expect(credential).not.toBeNull();
    credential?.click();
    fixture.detectChanges();
    expect(
      q('#lane-detail-cursor ptah-cursor-credential-popover'),
    ).not.toBeNull();
  });

  it('exposes instance tiers, editor and add modal', () => {
    openDetail('glm-1');
    expect(q('#lane-detail-glm-1')?.textContent).toContain('Sonnet');
    button(q('#lane-detail-glm-1'), 'Edit tiers')?.click();
    fixture.detectChanges();
    expect(
      q('[data-testid="cli-tier-mapping-modal"]')
        ?.closest('dialog')
        ?.hasAttribute('open'),
    ).toBe(true);
    q<HTMLButtonElement>('[data-testid="cli-matrix-add"]')?.click();
    fixture.detectChanges();
    expect(
      q('[data-testid="add-cli-instance-modal"]')
        ?.closest('dialog')
        ?.hasAttribute('open'),
    ).toBe(true);
  });

  it('uses fixed error text and retries without exposing a failed read message', async () => {
    state.orchestration.set({
      status: 'error',
      data: ORCHESTRATION,
      error: 'secret server trace',
    });
    fixture.detectChanges();
    expect(q('ptah-lanes-table')?.textContent).toContain(
      'Could not load lanes.',
    );
    expect(q('ptah-lanes-table')?.textContent).not.toContain(
      'secret server trace',
    );
    button(q('ptah-lanes-table'), 'Retry')?.click();
    await flush();
    expect(state.refreshOrchestration).toHaveBeenCalledTimes(1);
    expect(state.refreshCliAgents).toHaveBeenCalledTimes(1);
  });

  it('hides its own loading line when the host shows the read states', () => {
    state.orchestration.set({ status: 'loading', data: null, error: null });
    state.cliAgents.set({ status: 'loading', data: null, error: null });
    fixture.detectChanges();
    expect(q('[data-testid="cli-matrix"]')?.textContent).toContain(
      'Loading CLI agents…',
    );
    fixture.componentRef.setInput('hostReadStates', true);
    fixture.detectChanges();
    expect(q('[data-testid="cli-matrix"]')?.textContent).not.toContain(
      'Loading CLI agents…',
    );
  });

  it('projects the host read states into the card, outside any busy region', () => {
    state.orchestration.set({ status: 'error', data: null, error: 'x' });
    state.cliAgents.set({ status: 'error', data: null, error: 'x' });
    const host = TestBed.createComponent(ReadStatesHostComponent);
    host.detectChanges();
    const root = host.nativeElement as HTMLElement;
    const projected = root.querySelector(
      '[data-testid="projected-read-state"]',
    );
    expect(
      root
        .querySelector('[data-testid="cli-matrix"]')
        ?.getAttribute('aria-busy'),
    ).toBe('true');
    expect(
      projected?.closest('[data-testid="settings-cli-matrix"]'),
    ).not.toBeNull();
    expect(projected?.closest('[aria-busy="true"]')).toBeNull();
    host.destroy();
  });

  it('opens the install guide from the strip card and invokes Re-detect; the new row takes focus (U-7)', async () => {
    q<HTMLButtonElement>('[data-testid="lanes-strip-install-pi"]')?.click();
    fixture.detectChanges();
    expect(
      q('[data-testid="cli-provider-card-pi"] ptah-cli-provider-card-popovers')
        ?.textContent,
    ).toContain('Re-detect');
    state.onRedetect = () =>
      state.orchestration.update((section) => ({
        ...section,
        data: {
          ...ORCHESTRATION,
          detectedClis: ORCHESTRATION.detectedClis.map((cli) =>
            cli.cli === 'pi' ? detected('pi', true) : cli,
          ),
        },
      }));
    button(q('[data-testid="cli-provider-card-pi"]'), 'Re-detect')?.click();
    await flush();
    await fixture.whenStable();
    expect(state.redetectClis).toHaveBeenCalledTimes(1);
    expect(q('[data-testid="lanes-strip"]')).toBeNull();
    expect(q('ptah-lanes-table tr[data-testid="cli-provider-card-pi"]')).not.toBeNull();
    expect(document.activeElement).toBe(
      q('[data-testid="cli-provider-card-pi"] input[type="checkbox"]'),
    );
  });

  it('keeps the strip install popover open when the CLI is still missing', async () => {
    const announce = jest.spyOn(feedback, 'announce');
    q<HTMLButtonElement>('[data-testid="lanes-strip-install-pi"]')?.click();
    fixture.detectChanges();
    button(q('[data-testid="cli-provider-card-pi"]'), 'Re-detect')?.click();
    await flush();
    expect(state.redetectClis).toHaveBeenCalledTimes(1);
    expect(
      q('[data-testid="cli-provider-card-pi"] ptah-cli-provider-card-popovers'),
    ).not.toBeNull();
    expect(announce).toHaveBeenCalledWith(
      'Still not found. Check the step above, then try again.',
      'status',
    );
  });

  it('opens the keyless Cursor detail from Sign in with Credentials and the Install guide in the footer', () => {
    button(card('cursor'), 'Sign in')?.click();
    fixture.detectChanges();
    const detail = q('#lane-detail-cursor');
    expect(detail?.hidden).toBe(false);
    expect(detail?.querySelector('[data-popover-kind="credentials"]')).not.toBeNull();
    expect(detail?.querySelector('[data-popover-kind="install"]')).not.toBeNull();
  });

  it('opens the add modal from the Ptah group header Add, the only Add control', () => {
    expect(element().querySelectorAll('[data-testid="cli-matrix-add"]')).toHaveLength(1);
    expect(q('[data-testid="lanes-group-ptah"] [data-testid="cli-matrix-add"]')).not.toBeNull();
    q<HTMLButtonElement>('[data-testid="cli-matrix-add"]')?.click();
    fixture.detectChanges();
    expect(
      q('[data-testid="add-cli-instance-modal"]')
        ?.closest('dialog')
        ?.hasAttribute('open'),
    ).toBe(true);
  });

  it('points the empty text to the strip', () => {
    state.orchestration.set(ready({ ...ORCHESTRATION, detectedClis: [] }));
    state.cliAgents.set(ready([]));
    fixture.detectChanges();
    expect(q('[data-testid="cli-matrix-empty"]')?.textContent?.trim()).toBe(
      'No CLI agent installed yet. Use Add more below.',
    );
  });
});
