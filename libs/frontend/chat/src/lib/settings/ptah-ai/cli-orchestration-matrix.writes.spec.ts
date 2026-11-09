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
  CLI_INSTALL_GUIDES,
  CliOrchestrationMatrixComponent,
} from './cli-orchestration-matrix.component';
import { isDisabledControl } from '../feedback/busy-disabled.testing';

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
  let accounts: AccountsStub;
  let ambient: AmbientStub;
  /** Read when a cell is created; the matrix itself never injects the account services. */
  let electron = true;
  let feedback: SettingsSaveFeedbackService;
  const element = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
    (element().querySelector(selector) ?? document.querySelector(selector)) as T | null;
  const row = (id: string) => q(`[data-testid="cli-matrix-row-${id}"], [data-testid="cli-provider-card-${id}"]`);
  const rowIds = (selector: string) =>
    Array.from(
      element().querySelectorAll(
        `${selector} [data-testid^="cli-provider-card-"]`,
      ),
    ).map((node) =>
      node.getAttribute('data-testid')?.replace('cli-provider-card-', ''),
    );
  const statusOf = (id: string) => row(id)?.querySelector('[data-testid="cli-matrix-status"], .status-slot')?.textContent?.trim();
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
  /** Decision 1: the Uninstalled group starts collapsed; most cases look inside it. */
  function expandUninstalled() {
    q<HTMLButtonElement>(
      '[data-testid="cli-matrix-uninstalled-toggle"]',
    )?.click();
    fixture.detectChanges();
  }
  /** V36-7: Edit and Delete live in the row's "More actions" popover. */
  function more(id: string) {
    q<HTMLButtonElement>(`[data-testid="cli-matrix-more-${id}"]`)?.click();
    fixture.detectChanges();
  }
  function clickNamed(root: Element | null, name: string): void {
    const button = Array.from(root?.querySelectorAll('button') ?? [])
      .find((candidate) => candidate.textContent?.trim() === name);
    if (!button) throw new Error(`No ${name} button`);
    button.click();
  }
  /** Runs afterNextRender callbacks (focus moves). */
  function render() {
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
    expandUninstalled();
  });
  afterEach(() => {
    feedback.dismiss();
    TestBed.resetTestingModule();
  });

    describe('install guide Re-detect', () => {
      function openPiGuide() {
        clickNamed(row('pi'), 'Install guide');
        fixture.detectChanges();
      }
      /** The guide's outcome is announced through the page toast, never inline. */
      const note = () => {
        expect(q('[data-testid="cli-install-redetect-note"]')).toBeNull();
        return feedback.toast()?.message;
      };

      it('closes the guide and focuses the row once the CLI is found', async () => {
        state.onRedetect = () =>
          state.orchestration.set(
            ready({
              ...ORCHESTRATION,
              detectedClis: ORCHESTRATION.detectedClis.map((cli) =>
                cli.cli === 'pi'
                  ? detected('pi', true, { version: '0.80.3' })
                  : cli,
              ),
            }),
          );
        openPiGuide();
        clickNamed(q('[data-testid="cli-provider-popover-content"]'), 'Re-detect');
        await flush();
        render();
        expect(state.redetectClis).toHaveBeenCalledTimes(1);
        expect(q('[data-testid="cli-provider-popover-content"]')).toBeNull();
        expect(rowIds('[data-testid="cli-matrix-uninstalled"]')).not.toContain(
          'pi',
        );
        expect(document.activeElement).toBe(row('pi')?.querySelector('input[type="checkbox"]'));
      });

      it('says the CLI is still missing when detection does not find it', async () => {
        openPiGuide();
        clickNamed(q('[data-testid="cli-provider-popover-content"]'), 'Re-detect');
        await flush();
        expect(q('[data-testid="cli-provider-popover-content"]')).not.toBeNull();
        expect(note()).toBe(
          'Still not found. Check the step above, then try again.',
        );
        expect(feedback.toast()?.tone).toBe('status');
      });

      it('says detection failed when the re-read fails', async () => {
        state.onRedetect = () =>
          state.cliDetection.set({
            status: 'error',
            data: null,
            error: 'Could not load this section. Retry.',
          });
        openPiGuide();
        clickNamed(q('[data-testid="cli-provider-popover-content"]'), 'Re-detect');
        await flush();
        expect(note()).toBe('Detection failed. Try again.');
        expect(feedback.toast()?.tone).toBe('alert');
      });

      it('decides on its own detection result, not the shared section an overlapping re-detect replaced', async () => {
        // This call failed, but a later policy-bar re-detect already left the shared section ready.
        state.redetectClis.mockResolvedValueOnce(false);
        openPiGuide();
        clickNamed(q('[data-testid="cli-provider-popover-content"]'), 'Re-detect');
        await flush();
        expect(state.cliDetection().status).toBe('ready');
        expect(note()).toBe('Detection failed. Try again.');
      });
    });

    it('has install copy for every system CLI, Codex and Copilot as before (#77)', () => {
      expect(CLI_INSTALL_GUIDES.codex.command).toBe(
        'npm install -g @openai/codex',
      );
      expect(CLI_INSTALL_GUIDES.copilot.command).toBe(
        'npm install -g @github/copilot',
      );
      for (const guide of Object.values(CLI_INSTALL_GUIDES))
        expect(guide.note).toContain('Re-detect');
      clickNamed(row('cursor'), 'Install guide');
      fixture.detectChanges();
      expect(q('[data-testid="cli-provider-popover-content"] code')).toBeNull();
      expect(q('[data-testid="cli-provider-popover-content"]')?.textContent).toContain(
        'CURSOR_API_KEY',
      );
    });
  describe('writes (every write is state.saveSettings through the feedback service)', () => {
    it('saves a lane default and Undo restores the previous row', async () => {
      showSavedCodexDefault();
      const select = row('codex')?.querySelector('select[aria-label="Codex permission default"]') as HTMLSelectElement;
      select.value = 'auto-edit';
      select.dispatchEvent(new Event('change'));
      expect(select.value).toBe('plan');
      await flush();
      expect(state.saveSettings).toHaveBeenCalledWith(
        { orchestration: { cliLaneDefaults: { codex: { permission: 'auto-edit', network: 'deny' } } } }, CONTEXT,
      );
      await feedback.undo();
      expect(state.saveSettings).toHaveBeenLastCalledWith(
        { orchestration: { cliLaneDefaults: { codex: { permission: 'plan', network: 'deny' } } } }, CONTEXT,
      );
    });

    it('resets a saved default with a null row and Undo restores it', async () => {
      showSavedCodexDefault();
      clickNamed(row('codex'), 'More default actions'); fixture.detectChanges();
       const reset = Array.from(row('codex')?.querySelectorAll('button') ?? [])
        .find(button => button.textContent?.includes('Reset to default'));
      reset?.click();
      fixture.detectChanges();
      expect(state.saveSettings).not.toHaveBeenCalled();
      const confirm = Array.from(row('codex')?.querySelectorAll('button') ?? [])
        .find(button => button.textContent?.trim() === 'Confirm');
      confirm?.click();
      await flush();
      expect(state.saveSettings).toHaveBeenCalledWith(
        { orchestration: { cliLaneDefaults: { codex: null } } }, CONTEXT,
      );
      await feedback.undo();
      expect(state.saveSettings).toHaveBeenLastCalledWith(
        { orchestration: { cliLaneDefaults: { codex: { permission: 'plan', network: 'deny' } } } }, CONTEXT,
      );
    });

    it('keeps the prior selection when a write is rejected', async () => {
      showSavedCodexDefault();
      state.saveSettings.mockImplementationOnce(async () => {
        state.commit.set({ ...idle, status: 'failed', unsaved: ['agentOrchestration.cliLaneDefaults.codex'], message: 'Unsupported choice.' });
        return true;
      });
      const select = row('codex')?.querySelector('select[aria-label="Codex permission default"]') as HTMLSelectElement;
      select.value = 'auto-edit';
      select.dispatchEvent(new Event('change'));
      await flush();
      expect(select.value).toBe('plan');
      expect(feedback.toast()?.tone).toBe('alert');
      expect(feedback.toast()?.message).toContain('Unsupported choice.');
    });
    it('switches a system CLI off through disabledClis, with Undo', async () => {
      check('codex', false);
      await flush();
      expect(state.saveSettings).toHaveBeenCalledWith(
        { orchestration: { disabledClis: ['copilot', 'codex'] } },
        CONTEXT,
      );
      expect(feedback.toast()).toEqual({
        tone: 'status',
        message: 'Saved Codex off to All Ptah apps.',
        canUndo: true,
      });
      await feedback.undo();
      expect(state.saveSettings).toHaveBeenLastCalledWith(
        { orchestration: { disabledClis: ['copilot'] } },
        CONTEXT,
      );
    });

    it('switches a system CLI on by removing it from disabledClis', async () => {
      check('copilot', true);
      await flush();
      expect(state.saveSettings).toHaveBeenCalledWith(
        { orchestration: { disabledClis: [] } },
        CONTEXT,
      );
    });

    it('switches an instance through ptahCli:update.enabled, with Undo', async () => {
      check('glm-1', false);
      await flush();
      expect(state.saveSettings).toHaveBeenCalledWith(
        {
          cli: [{ action: 'update', params: { id: 'glm-1', enabled: false } }],
        },
        CONTEXT,
      );
      await feedback.undo();
      expect(state.saveSettings).toHaveBeenLastCalledWith(
        { cli: [{ action: 'update', params: { id: 'glm-1', enabled: true } }] },
        CONTEXT,
      );
    });

    it('keeps the checkbox on the saved value until the read-back moves it', async () => {
      check('codex', false);
      expect(
        q<HTMLInputElement>('[data-testid="cli-provider-card-codex"] input[type="checkbox"]')?.checked,
      ).toBe(true);
      await flush();
    });

    it('disables uninstalled toggles, and every toggle while a save runs or the scopes are not loaded', () => {
      expect(
        isDisabledControl(
          q<HTMLInputElement>('[data-testid="cli-provider-card-pi"] input[type="checkbox"]'),
        ),
      ).toBe(true);
      expect(
        q<HTMLInputElement>('[data-testid="cli-provider-card-pi"] input[type="checkbox"]')?.checked,
      ).toBe(false);
      state.commit.set({ ...idle, status: 'saving' });
      fixture.detectChanges();
      expect(
        isDisabledControl(
          q<HTMLInputElement>('[data-testid="cli-provider-card-codex"] input[type="checkbox"]'),
        ),
      ).toBe(true);
      state.commit.set(idle);
      state.scopes.set({ status: 'loading', data: null, error: null });
      fixture.detectChanges();
      expect(
        isDisabledControl(
          q<HTMLInputElement>('[data-testid="cli-matrix-toggle-glm-1"]'),
        ),
      ).toBe(true);
    });

    it('deletes an instance after the inline confirm, with no Undo', async () => {
      more('glm-1');
      q<HTMLButtonElement>('[data-testid="cli-matrix-delete-glm-1"]')?.click();
      fixture.detectChanges();
      expect(state.saveSettings).not.toHaveBeenCalled();
      expect(row('glm-1')?.textContent).toContain('Delete Glm?');
      q<HTMLButtonElement>('button[aria-label="Confirm delete Glm"]')?.click();
      await flush();
      expect(state.saveSettings).toHaveBeenCalledWith(
        { cli: [{ action: 'delete', params: { id: 'glm-1' } }] },
        CONTEXT,
      );
      expect(feedback.toast()?.canUndo).toBe(false);
    });

    it('cancels a delete without writing; focus moves to the confirm, then back to More', () => {
      more('glm-1');
      q<HTMLButtonElement>('[data-testid="cli-matrix-delete-glm-1"]')?.click();
      render();
      const cancel = Array.from(
        row('glm-1')?.querySelectorAll('button') ?? [],
      ).find((button) => button.textContent?.trim() === 'Cancel');
      expect(document.activeElement).toBe(cancel);
      cancel?.click();
      render();
      expect(q('[data-testid="cli-matrix-more-glm-1"]')).not.toBeNull();
      expect(document.activeElement).toBe(
        q('[data-testid="cli-matrix-more-glm-1"]'),
      );
      expect(state.saveSettings).not.toHaveBeenCalled();
    });

    it('M2: a refused delete keeps the confirm even when commit() still says an earlier save landed', async () => {
      state.commit.set({ ...idle, status: 'saved' });
      state.saveSettings.mockImplementationOnce(async () => false);
      more('glm-1');
      q<HTMLButtonElement>('[data-testid="cli-matrix-delete-glm-1"]')?.click();
      fixture.detectChanges();
      q<HTMLButtonElement>('button[aria-label="Confirm delete Glm"]')?.click();
      await flush();
      expect(row('glm-1')?.textContent).toContain('Delete Glm?');
    });

    it('Minor 4: Undo of a system on/off restores only that CLI, against the list as it is at Undo time', async () => {
      check('codex', false);
      await flush();
      // Another path disables opencode meanwhile; Undo must keep that change.
      state.orchestration.set(
        ready({
          ...ORCHESTRATION,
          disabledClis: ['copilot', 'codex', 'opencode'],
        }),
      );
      await feedback.undo();
      expect(state.saveSettings).toHaveBeenLastCalledWith(
        { orchestration: { disabledClis: ['copilot', 'opencode'] } },
        CONTEXT,
      );
    });
  });
  describe('Test (#52, RUX-11)', () => {
    const inlineResult = () =>
      row('glm-1')?.querySelector('[data-testid="cli-matrix-test-result"]') ??
      null;

    it('tests the instance, announces the latency in the toast, and keeps it as the card last test', async () => {
      expect(inlineResult()?.textContent?.trim()).toBe('Not run yet');
      q<HTMLButtonElement>('[data-testid="cli-matrix-test-glm-1"]')?.click();
      await flush();
      expect(state.testCliConnection).toHaveBeenCalledWith('glm-1');
      expect(feedback.toast()).toEqual({
        tone: 'status',
        message: 'Glm: Test passed in 112ms.',
        canUndo: false,
      });
      expect(inlineResult()?.textContent?.trim()).toBe('Passed in 112ms');
      expect(statusOf('glm-1')).toBe('Installed');
    });

    it("M1: a failure is a fixed sentence, followed only by the state's own fixed reason", async () => {
      state.testResult = {
        id: 'glm-1',
        success: false,
        latencyMs: null,
        reason: null,
      };
      q<HTMLButtonElement>('[data-testid="cli-matrix-test-glm-1"]')?.click();
      await flush();
      expect(inlineResult()?.textContent?.trim()).toBe(
        'The connection test failed.',
      );
      expect(feedback.toast()).toEqual({
        tone: 'alert',
        message: 'Glm: The connection test failed.',
        canUndo: false,
      });
      expect(statusOf('glm-1')).toBe('Installed');
      state.testResult = {
        id: 'glm-1',
        success: false,
        latencyMs: null,
        reason: 'The provider did not respond.',
      };
      q<HTMLButtonElement>('[data-testid="cli-matrix-test-glm-1"]')?.click();
      await flush();
      expect(feedback.toast()?.message).toBe(
        'Glm: The connection test failed. The provider did not respond.',
      );
    });

    it('S1: a failed or timed-out run never reports the earlier pass', async () => {
      q<HTMLButtonElement>('[data-testid="cli-matrix-test-glm-1"]')?.click();
      await flush();
      expect(feedback.toast()?.message).toBe('Glm: Test passed in 112ms.');
      let fail: () => void = () => undefined;
      state.testCliConnection.mockImplementationOnce(async () => {
        // The real state drops the previous result when a run starts.
        state.cliTest.set({ status: 'loading', data: null, error: null });
        await new Promise<void>((resolve) => {
          fail = resolve;
        });
        state.cliTest.set({
          status: 'error',
          data: null,
          error: 'Could not load this section. Retry.',
        });
      });
      q<HTMLButtonElement>('[data-testid="cli-matrix-test-glm-1"]')?.click();
      fixture.detectChanges();
      expect(statusOf('glm-1')).toBe('Installed');
      fail();
      await flush();
      expect(feedback.toast()).toEqual({
        tone: 'alert',
        message: 'Glm: The test could not run. Try again.',
        canUndo: false,
      });
      expect(row('glm-1')?.textContent).not.toContain('112ms');
    });

    it('says when the test itself could not run', async () => {
      state.testCliConnection.mockImplementationOnce(async () => {
        state.cliTest.set({
          status: 'error',
          data: null,
          error: 'Could not load this section. Retry.',
        });
      });
      q<HTMLButtonElement>('[data-testid="cli-matrix-test-glm-1"]')?.click();
      await flush();
      expect(inlineResult()?.textContent?.trim()).toBe('Not run yet');
      expect(feedback.toast()?.message).toContain('could not run');
    });

    it("M4 / Minor 2: a create runs the new instance's Test; from the empty-state button focus moves to its first action", async () => {
      state.cliAgents.set(ready([]));
      fixture.detectChanges();
      Array.from(
        q('[data-testid="cli-matrix-no-instances"]')?.querySelectorAll(
          'button',
        ) ?? [],
      )[0]?.click();
      fixture.detectChanges();
      state.cliAgents.set(ready([{ ...GLM, id: 'kimi-9', name: 'Kimi' }]));
      state.cliModels.set(
        ready({ 'kimi-9': { selectedModel: '', tierMappings: {} } }),
      );
      fixture.debugElement
        .query((node) => node.name === 'ptah-add-cli-instance-modal')
        ?.triggerEventHandler('created', 'kimi');
      fixture.debugElement
        .query((node) => node.name === 'ptah-add-cli-instance-modal')
        ?.triggerEventHandler('closed');
      render();
      expect(state.testCliConnection).toHaveBeenCalledWith('kimi-9');
      expect(document.activeElement).toBe(
        q('[data-testid="cli-matrix-tiers-kimi-9"]'),
      );
    });

    it('re-check N-1: a create the refreshed list does not hold runs no Test and says so in a fixed toast', () => {
      fixture.debugElement
        .query((node) => node.name === 'ptah-add-cli-instance-modal')
        ?.triggerEventHandler('created', 'Kimi');
      expect(state.testCliConnection).not.toHaveBeenCalled();
      expect(feedback.toast()).toEqual({
        tone: 'alert',
        canUndo: false,
        message:
          'Created Kimi. Its connection test did not start. Use Test on its row once it shows.',
      });
    });

    it('renders Test for installed system CLIs (design-spec.md section 3.5)', () => { expect(Array.from(row('codex')?.querySelectorAll('button') ?? []).some(button => button.textContent?.trim() === 'Test')).toBe(true); });
  });
});


