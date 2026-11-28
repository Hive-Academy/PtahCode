/** Enhancement consumer row, assignment, and timeout behavior. */

import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SAVE_REFUSED_MESSAGE, SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { getDebugNode, signal } from '@angular/core';
import { OverlayContainer } from '@angular/cdk/overlay';
import { PROVIDER_MODELS_LOADER, PtahRichSelectComponent } from '@ptah-extension/ui';
import { rpcSuccess } from '@ptah-extension/core/testing';
import {
  ClaudeRpcService,
  ProvidersSettingsStateService,
  type ProvidersConnection,
  WorkspaceScopeService,
  type ProvidersEditContext,
  type ProvidersEffectiveRoute,
  type ProvidersSettingsCommit,
  type ProvidersSettingsPatch,
  type ProvidersSettingsSection,
  type ProvidersSetupCommitState,
  type ProvidersSetupRowState,
  type ProvidersSetupUndoEntry,
} from '@ptah-extension/core';
import type {
  AgentOrchestrationConfig,
  ConfigGetScopesResult,
  DecisionModelStatusDto,
  ModelPair,
  ScopedSettingEntry,
  SetupPairState,
} from '@ptah-extension/shared';

const UNSET_DECISION: DecisionModelStatusDto = {
  selection: { kind: 'unset' },
  locality: null,
  reportsConfidence: false,
  state: 'unset',
  detail: null,
};
import { ProviderConsumerAssignmentsComponent } from './provider-consumer-assignments.component';
import {
  toBackendEnhancementModel,
  toPickerModel,
  type BackgroundConsumerId,
} from './provider-consumer-rows';
import { isDisabledControl } from '../feedback/busy-disabled.testing';

class MockProvidersSettingsStateService {
  readonly connections = signal<ProvidersSettingsSection<readonly ProvidersConnection[]>>({
    status: 'ready',
    data: ([
      { id: 'anthropic', name: 'Claude API', authMode: 'apiKey', hasKey: true },
      { id: 'ollama', name: 'Ollama', authMode: 'local-native', hasKey: false },
      { id: 'claude-cli', name: 'Claude (Subscription)', authMode: 'cli', hasKey: false },
      { id: 'openai-codex', name: 'OpenAI Codex', authMode: 'oauth', hasKey: false },
      { id: 'kimi-code', name: 'Kimi Code', authMode: 'oauth', hasKey: false },
    ] satisfies Pick<ProvidersConnection, 'id' | 'name' | 'authMode' | 'hasKey'>[]).map((connection) => ({
      ...connection,
      configured: true,
      custom: false,
      defaultsResolvable: true,
      accountLabel: null,
      tokenStale: false,
    })),
    error: null,
  });
  readonly workspacePair = { provider: 'anthropic', model: 'claude-3-5-sonnet' };
  readonly setupModel = signal<ProvidersSettingsSection<ProvidersSetupRowState>>({
    status: 'ready',
    data: {
      state: { kind: 'unset', effective: this.workspacePair },
      committed: null,
      commitSeq: 0,
    },
    error: null,
  });
  readonly setupCommit = signal<ProvidersSetupCommitState>({ status: 'idle', message: null });
  readonly setupUndoEntry = signal<ProvidersSetupUndoEntry | null>(null);

  publishSetup(committed: ModelPair | null, state?: SetupPairState): void {
    this.setupModel.set({
      status: 'ready',
      data: {
        committed,
        commitSeq: (this.setupModel().data?.commitSeq ?? 0) + 1,
        state: state ?? (committed
          ? { kind: 'set', pair: committed }
          : { kind: 'unset', effective: this.workspacePair }),
      },
      error: null,
    });
  }

  readonly refreshSetupModel = jest.fn(async () => undefined);
  readonly clearSetupDraftFeedback = jest.fn(() => {
    const status = this.setupCommit().status;
    if (status === 'invalid' || status === 'failed') {
      this.setupCommit.set({ status: 'idle', message: null });
    }
  });
  readonly commitSetupPair = jest.fn(async (pair: ModelPair | null) => {
    const previous = this.setupModel().data?.committed ?? null;
    this.publishSetup(pair);
    this.setupUndoEntry.set({
      targetPair: previous,
      committedReceipt: pair,
      commitSeq: this.setupModel().data?.commitSeq ?? 0,
    });
    this.setupCommit.set({
      status: 'saved',
      message: pair ? 'Setup model saved.' : 'Setup now uses the workspace model.',
    });
    return true;
  });
  readonly undoSetupPair = jest.fn(async () => {
    this.publishSetup(this.setupUndoEntry()?.targetPair ?? null);
    this.setupUndoEntry.set(null);
    this.setupCommit.set({ status: 'saved', message: 'Setup model restored.' });
    return true;
  });
  readonly routeStore = signal<
    ProvidersSettingsSection<ProvidersEffectiveRoute>
  >({
    status: 'ready',
    data: {
      // AuthStrategyType — the backend resolves one of five strategies, never a wire id.
      route: 'api-key',
      ready: true,
      driverProviderId: 'anthropic',
      resolvedAuthModality: 'api-key',
      authMethodIsUnset: false,
      // Real discriminated union from AuthGetEffectiveRouteResult.
      resolvedModel: { kind: 'model', id: 'claude-3-5-sonnet' },
      storedAuthMethodScope: 'global',
      providers: [
        { id: 'anthropic', type: 'apiKey', status: 'connected' },
        { id: 'openai', type: 'apiKey', status: 'unknown' },
        { id: 'ollama', type: 'local-native', status: 'needs-key' },
        { id: 'custom-cli', type: 'cli', status: 'not-installed' },
        { id: 'remote-bedrock', type: 'apiKey', status: 'unreachable' },
        { id: 'expired-auth', type: 'apiKey', status: 'unauthenticated' },
      ],
      lastSuccessfulProbeAt: new Date().toISOString(),
      lastFailedProbeAt: null,
      probedAt: new Date().toISOString(),
      fromCache: false,
      blockers: [],
    },
    error: null,
  });

  readonly memoryStore = signal<
    ProvidersSettingsSection<{
      curatorProvider?: string;
      curatorModel?: string;
    }>
  >({
    status: 'ready',
    data: {
      curatorProvider: '',
      curatorModel: '',
    },
    error: null,
  });

  readonly enhancementStore = signal<ProvidersSettingsSection<{
    provider: string; model: string; timeoutMs: number;
  }>>({
    status: 'ready',
    data: { provider: '', model: '', timeoutMs: 120000 },
    error: null,
  });

  readonly scopesStore = signal<
    ProvidersSettingsSection<ConfigGetScopesResult>
  >({
    status: 'ready',
    data: {
      activePath: '/workspace',
      entries: [
        {
          key: 'memory.curatorProvider',
          scope: 'global',
          hasOverride: false,
          effectiveKey: 'memory.curatorProvider',
          supportedTargets: ['global'],
          fallbackPreview: null,
          credentialSource: 'not-a-secret',
        },
        {
          key: 'memory.curatorModel',
          scope: 'global',
          hasOverride: false,
          effectiveKey: 'memory.curatorModel',
          supportedTargets: ['global'],
          fallbackPreview: null,
          credentialSource: 'not-a-secret',
        },
        {
          key: 'skills.enhancement.model',
          scope: 'global',
          hasOverride: false,
          effectiveKey: 'skills.enhancement.model',
          supportedTargets: ['global'],
          fallbackPreview: null,
          credentialSource: 'not-a-secret',
        },
      ],
    },
    error: null,
  });

  readonly commitState = signal<ProvidersSettingsCommit>({
    status: 'idle',
    saved: [],
    unsaved: [],
    unconfirmed: [],
    refreshFailed: false,
    message: null,
  });

  readonly route = this.routeStore.asReadonly();
  readonly memory = this.memoryStore.asReadonly();
  readonly enhancement = this.enhancementStore.asReadonly();
  readonly scopes = this.scopesStore.asReadonly();
  readonly commit = this.commitState.asReadonly();

  scopeEntry(key: string): ScopedSettingEntry | null {
    // No fabricated fallback: a key with no entry means unknown provenance,
    // which the component must render honestly.
    return this.scopes().data?.entries.find((e) => e.key === key) ?? null;
  }

  reviewContext(): ProvidersEditContext | null {
    return { scopeKey: 'test-scope', activePath: '/workspace' };
  }

  readonly applySettings = async (patch: ProvidersSettingsPatch) => {
    const enhancement = this.enhancement().data;
    if (patch.enhancement && enhancement) {
      this.enhancementStore.set({
        status: 'ready',
        data: { ...enhancement, ...patch.enhancement },
        error: null,
      });
    }
    this.commitState.set({
      status: 'saved',
      saved: ['test'],
      unsaved: [],
      unconfirmed: [],
      refreshFailed: false,
      message: null,
    });
    return true;
  };

  readonly refreshMemory = jest
    .fn<Promise<void>, []>()
    .mockResolvedValue(undefined);
  readonly refreshEnhancement = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);

  readonly saveSettings = jest
    .fn<Promise<boolean>, [ProvidersSettingsPatch, ProvidersEditContext]>()
    .mockImplementation(this.applySettings);
}

function query(
  fixture: ComponentFixture<unknown>,
  testId: string,
): HTMLElement | null {
  const selector = `[data-testid="${testId}"]`;
  return fixture.nativeElement.querySelector(selector)
    ?? TestBed.inject(OverlayContainer).getContainerElement().querySelector(selector);
}

function button(
  fixture: ComponentFixture<unknown>,
  testId: string,
): HTMLButtonElement | null {
  return query(fixture, testId) as HTMLButtonElement | null;
}

function inputEl(
  fixture: ComponentFixture<unknown>,
  testId: string,
): HTMLInputElement | null {
  return query(fixture, testId) as HTMLInputElement | null;
}

describe('ProviderConsumerAssignmentsComponent', () => {
  let fixture: ComponentFixture<ProviderConsumerAssignmentsComponent>;
  let component: ProviderConsumerAssignmentsComponent;
  let mockState: MockProvidersSettingsStateService;
  let mockModelsLoader: { listModels: jest.Mock };
  let mockRpc: { call: jest.Mock };
  let feedback: SettingsSaveFeedbackService;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  /** Opens a row's reassignment popover from its cell. */
  async function openRow(id: BackgroundConsumerId): Promise<void> {
    button(fixture, `consumer-edit-${id}`)?.click();
    await settle();
  }
  const pickerSelect = (id: BackgroundConsumerId, field: 'provider' | 'model') => {
    const select = query(fixture, `picker-${id}`)?.querySelector<HTMLElement>(
      `[data-testid="provider-model-picker-${field}"]`,
    );
    if (!select) throw new Error(`Missing ${id} ${field} picker`);
    return select;
  };
  const providerSelect = (id: BackgroundConsumerId) => pickerSelect(id, 'provider');
  const modelSelect = (id: BackgroundConsumerId) => pickerSelect(id, 'model');
  const selectControl = (select: HTMLElement) => {
    const node = getDebugNode(select);
    if (!node) throw new Error('Missing picker debug node');
    return node.injector.get(PtahRichSelectComponent) as PtahRichSelectComponent<string>;
  };
  const selectValue = (select: HTMLElement) => selectControl(select).value();
  const options = (select: HTMLElement) => selectControl(select).options();
  const trigger = (select: HTMLElement) => {
    const combobox = select.querySelector<HTMLButtonElement>('[role="combobox"]');
    if (!combobox) throw new Error('Missing combobox');
    return combobox;
  };
  /** Microtasks only (a save starts the toast's dismiss timer, which `whenStable()` would wait out). */
  async function flushSave(): Promise<void> {
    for (let i = 0; i < 3; i += 1) {
      fixture.detectChanges();
      for (let j = 0; j < 8; j += 1) await Promise.resolve();
    }
    fixture.detectChanges();
  }
  /** Opens the time-limit editor and types a value. */
  function typeTimeout(value: string): HTMLInputElement | null {
    button(fixture, 'timeout-edit-button')?.click();
    fixture.detectChanges();
    const input = inputEl(fixture, 'timeout-input');
    if (input) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
    return input;
  }
  async function choose(
    select: HTMLElement,
    value: string,
  ): Promise<void> {
    const label = options(select).find((option) => option.value === value)?.label;
    const control = trigger(select);
    control.click();
    fixture.detectChanges();
    const list = document.getElementById(control.getAttribute('aria-controls') ?? '');
    const option = Array.from(list?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
      .find((entry) => entry.textContent?.trim() === label);
    if (!option) throw new Error(`Missing option ${value}`);
    option.click();
    await flushSave();
  }
  beforeEach(async () => {
    mockState = new MockProvidersSettingsStateService();
    mockModelsLoader = {
      listModels: jest.fn().mockResolvedValue({
        models: [
          {
            id: 'claude-3-5-sonnet',
            name: 'Claude 3.5 Sonnet',
            supportsToolUse: true,
          },
          {
            id: 'claude-3-5-haiku',
            name: 'Claude 3.5 Haiku',
            supportsToolUse: true,
          },
        ],
      }),
    };

    // The Decision model card (TASK_2026_646) reads agent:getConfig itself; its own spec covers it.
    mockRpc = {
      call: jest.fn(async () =>
        rpcSuccess({
          decisionModel: UNSET_DECISION,
        } as AgentOrchestrationConfig),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [ProviderConsumerAssignmentsComponent],
      providers: [
        { provide: ProvidersSettingsStateService, useValue: mockState },
        { provide: PROVIDER_MODELS_LOADER, useValue: mockModelsLoader },
        { provide: ClaudeRpcService, useValue: mockRpc },
        SettingsSaveFeedbackService,
      ],
    }).compileComponents();
    feedback = TestBed.inject(SettingsSaveFeedbackService);

    fixture = TestBed.createComponent(ProviderConsumerAssignmentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('offers connected providers and keeps a disconnected saved assignment visible', async () => {
    mockState.memoryStore.set({
      status: 'ready',
      data: { curatorProvider: 'openrouter', curatorModel: 'saved-model' },
      error: null,
    });
    fixture.detectChanges();
    await openRow('memory-curator');
    const select = providerSelect('memory-curator');
    expect(selectValue(select)).toBe('openrouter');
    expect(options(select)).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'anthropic', label: 'Claude API' }),
      expect.objectContaining({ value: 'openrouter', label: 'OpenRouter (unavailable)' }),
    ]));
    expect(options(select).some(({ value }) => value === 'requesty')).toBe(false);
  });

  it('renders Setup first, followed by the other consumer rows and the decision model', async () => {
    await settle();
    const table = query(fixture, 'consumer-table');
    expect(table?.firstElementChild?.getAttribute('data-testid')).toBe('consumer-row-setup');
    expect(query(fixture, 'consumer-row-memory-curator')).toBeTruthy();
    expect(query(fixture, 'consumer-row-enhancement')).toBeTruthy();
    expect(query(fixture, 'consumer-row-judge')).toBeNull();
    expect(query(fixture, 'enhancement-timeout-section')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('ptah-decision-model-row')).toBeTruthy();
  });

  it('opens and focuses the Setup editor when the deep link arrives before the row loads', async () => {
    mockState.setupModel.set({ status: 'loading', data: null, error: null });
    const opened = jest.fn();
    component.deepLinkOpened.subscribe(opened);
    fixture.componentRef.setInput('initialEditingConsumerId', 'setup');
    await settle();
    expect(query(fixture, 'picker-setup')).toBeNull();
    mockState.publishSetup(null);
    await settle();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledWith('setup');
    expect(query(fixture, 'picker-setup')).not.toBeNull();
    expect(query(fixture, 'consumer-row-setup')?.classList.contains('border-primary')).toBe(true);
    expect(document.activeElement?.getAttribute('data-testid')).toBe('consumer-edit-setup');
  });

  it('focuses the model picker in the attached Setup recovery panel', async () => {
    mockState.setupModel.set({
      status: 'ready',
      data: {
        state: { kind: 'invalid', source: 'setup', cause: 'model-missing', provider: 'anthropic', model: null },
        committed: { provider: 'anthropic', model: '' },
        commitSeq: 0,
      },
      error: null,
    });
    await settle();
    const recovery = Array.from(
      query(fixture, 'consumer-row-setup')?.querySelectorAll('button') ?? [],
    ).find((entry) => entry.textContent?.trim() === 'Choose a model');
    if (!recovery) throw new Error('Missing Setup model recovery action');
    recovery.click();
    await settle();
    expect(document.activeElement).toBe(trigger(modelSelect('setup')));
  });

  it('keeps provider and model choices local until Save, then shows the receipt and can Undo to Unset', async () => {
    const originalCalls = mockRpc.call.mock.calls.length;
    await openRow('setup');
    expect(button(fixture, 'setup-save')?.disabled).toBe(true);
    expect(options(providerSelect('setup')).map((option) => option.value))
      .not.toContain('openai-codex');
    await choose(providerSelect('setup'), 'anthropic');
    expect(mockState.commitSetupPair).not.toHaveBeenCalled();
    expect(mockState.saveSettings).not.toHaveBeenCalled();
    expect(mockRpc.call).toHaveBeenCalledTimes(originalCalls);
    expect(button(fixture, 'setup-save')?.disabled).toBe(true);
    await choose(modelSelect('setup'), 'claude-3-5-haiku');
    expect(mockState.commitSetupPair).not.toHaveBeenCalled();
    button(fixture, 'setup-save')?.click();
    await settle();
    expect(mockState.commitSetupPair).toHaveBeenCalledTimes(1);
    expect(mockState.commitSetupPair).toHaveBeenCalledWith({
      provider: 'anthropic',
      model: 'claude-3-5-haiku',
    });
    expect(query(fixture, 'consumer-summary-setup')?.textContent).toContain('anthropic / claude-3-5-haiku');
    expect(query(fixture, 'setup-commit-feedback')?.getAttribute('role')).toBe('status');
    button(fixture, 'setup-undo')?.click();
    await settle();
    expect(mockState.undoSetupPair).toHaveBeenCalledTimes(1);
    expect(mockState.commitSetupPair).toHaveBeenCalledTimes(1);
    expect(query(fixture, 'consumer-summary-setup')?.textContent).toContain('Workspace model: anthropic / claude-3-5-sonnet');
    await openRow('setup');
    expect(selectValue(providerSelect('setup'))).toBe('');
  });

  it('blocks reopening Setup until a pending save settles and then applies the deep link', async () => {
    await openRow('setup');
    mockState.setupCommit.set({ status: 'saving', message: null });
    await settle();
    expect(button(fixture, 'consumer-edit-setup')?.getAttribute('aria-disabled')).toBe('true');
    button(fixture, 'consumer-close-setup')?.click();
    await settle();
    await openRow('setup');
    expect(query(fixture, 'picker-setup')).toBeNull();

    const opened = jest.fn();
    component.deepLinkOpened.subscribe(opened);
    fixture.componentRef.setInput('initialEditingConsumerId', 'setup');
    await settle();
    expect(opened).not.toHaveBeenCalled();
    expect(query(fixture, 'picker-setup')).toBeNull();

    mockState.setupCommit.set({ status: 'saved', message: 'Setup model saved.' });
    await settle();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledWith('setup');
    expect(query(fixture, 'picker-setup')).not.toBeNull();
  });

  it('clears a committed pair through one core call and leaves the workspace pair as read-back', async () => {
    mockState.publishSetup({ provider: 'anthropic', model: 'claude-3-5-haiku' });
    await settle();
    await openRow('setup');
    button(fixture, 'setup-clear')?.click();
    await settle();
    expect(mockState.commitSetupPair).toHaveBeenCalledTimes(1);
    expect(mockState.commitSetupPair).toHaveBeenCalledWith(null);
    expect(mockState.saveSettings).not.toHaveBeenCalled();
    expect(query(fixture, 'consumer-tier-setup')?.textContent).toContain('Following workspace');
  });

  it('uses the workspace model through one core call for a stale override and attributes workspace alerts', async () => {
    const stale = { provider: 'anthropic', model: 'retired' };
    mockState.publishSetup(stale, { ...stale, kind: 'invalid', source: 'setup', cause: 'model-stale' });
    await settle();
    expect(query(fixture, 'consumer-summary-setup')?.textContent).toContain('anthropic / retired');
    expect(query(fixture, 'setup-model-issue')?.textContent).toContain('Setup uses retired');
    button(fixture, 'setup-use-workspace')?.click();
    await settle();
    expect(mockState.commitSetupPair).toHaveBeenCalledTimes(1);
    expect(mockState.commitSetupPair).toHaveBeenCalledWith(null);
    mockState.publishSetup(null, { ...stale, kind: 'invalid', source: 'workspace', cause: 'model-stale' });
    await settle();
    expect(query(fixture, 'setup-model-issue')?.textContent).toContain('The workspace model uses retired');
    expect(button(fixture, 'setup-use-workspace')).toBeNull();
  });

  it('routes the sign-in recovery action without opening the Setup picker', async () => {
    const pair = { provider: 'openrouter', model: 'model-id' };
    mockState.publishSetup(pair, { ...pair, kind: 'invalid', source: 'setup', cause: 'not-signed-in' });
    const requested = jest.fn();
    component.setupProviderRequested.subscribe(requested);
    await settle();
    expect(query(fixture, 'setup-model-issue')?.textContent).toContain('OpenRouter is not signed in');
    button(fixture, 'readiness-setup-setup')?.click();
    await settle();
    expect(requested).toHaveBeenCalledWith('openrouter');
    expect(query(fixture, 'picker-setup')).toBeNull();
  });

  it.each(['invalid', 'failed'] as const)('shows saving and %s feedback without changing the saved pair', async (status) => {
    const message = status === 'invalid' ? 'Choose an available model.' : 'Could not save Setup model.';
    let finish: () => void = () => undefined;
    mockState.commitSetupPair.mockImplementationOnce(() => {
      mockState.setupCommit.set({ status: 'saving', message: null });
      return new Promise<boolean>((resolve) => {
        finish = () => {
          mockState.setupCommit.set({ status, message });
          resolve(false);
        };
      });
    });
    mockState.setupUndoEntry.set({
      targetPair: { provider: 'anthropic', model: 'claude-3-5-sonnet' },
      committedReceipt: null,
      commitSeq: 1,
    });
    await openRow('setup');
    await choose(providerSelect('setup'), 'anthropic');
    await choose(modelSelect('setup'), 'claude-3-5-haiku');
    button(fixture, 'setup-save')?.click();
    fixture.detectChanges();
    expect(query(fixture, 'setup-commit-feedback')?.textContent).toContain('Saving Setup model');
    expect(button(fixture, 'setup-save')?.disabled).toBe(true);
    finish();
    await settle();
    expect(query(fixture, 'setup-commit-feedback')?.getAttribute('role')).toBe('alert');
    expect(query(fixture, 'setup-commit-feedback')?.textContent).toContain(message);
    expect(query(fixture, 'consumer-tier-setup')?.textContent).toContain('Following workspace');
    expect(selectValue(modelSelect('setup'))).toBe('claude-3-5-haiku');
    button(fixture, 'consumer-close-setup')?.click();
    await settle();
    expect(query(fixture, 'setup-commit-feedback')).toBeNull();
    expect(button(fixture, 'setup-undo')).toBeNull();

    mockState.setupCommit.set({ status, message });
    await settle();
    expect(query(fixture, 'setup-commit-feedback')?.getAttribute('role')).toBe('alert');
    expect(button(fixture, 'setup-undo')).toBeNull();
  });

  it('loads the enhancement provider and model from the new section', async () => {
    mockState.enhancementStore.set({
      status: 'ready',
      data: { provider: 'anthropic', model: 'claude-3-5-sonnet', timeoutMs: 60000 },
      error: null,
    });
    await settle();
    expect(query(fixture, 'consumer-summary-enhancement')?.textContent).toContain('anthropic');
    expect(query(fixture, 'consumer-summary-enhancement')?.textContent).toContain('claude-3-5-sonnet');
    expect(query(fixture, 'timeout-effective-display')?.textContent).toContain('60 seconds');
  });

  it('saves an enhancement provider choice with Undo', async () => {
    const saved = jest.fn();
    component.assignmentSaved.subscribe(saved);
    await openRow('enhancement');
    await choose(providerSelect('enhancement'), 'anthropic');
    expect(mockState.saveSettings).toHaveBeenCalledWith(
      { enhancement: { provider: 'anthropic', model: 'inherit' } },
      expect.any(Object),
    );
    expect(saved).toHaveBeenCalledWith({ id: 'enhancement', provider: 'anthropic', model: '' });
    expect(feedback.toast()?.canUndo).toBe(true);
    await feedback.undo();
    expect(mockState.saveSettings).toHaveBeenLastCalledWith(
      { enhancement: { provider: '', model: 'inherit' } }, expect.any(Object),
    );
  });

  it('reads inherit as the picker sentinel and writes an explicit enhancement model', async () => {
    expect(toPickerModel('inherit')).toBe('');
    expect(toBackendEnhancementModel('  ')).toBe('inherit');
    mockState.enhancementStore.set({
      status: 'ready',
      data: { provider: 'anthropic', model: 'inherit', timeoutMs: 120000 },
      error: null,
    });
    await openRow('enhancement');
    expect(selectValue(modelSelect('enhancement'))).toBe('');
    await choose(modelSelect('enhancement'), 'claude-3-5-sonnet');
    expect(mockState.saveSettings).toHaveBeenCalledWith(
      { enhancement: { provider: 'anthropic', model: 'claude-3-5-sonnet' } },
      expect.any(Object),
    );
  });

  it('reverts the picker and alerts when the edit context is still unavailable at save time', async () => {
    const reviewContext = jest
      .spyOn(mockState, 'reviewContext')
      .mockReturnValue(null);
    await openRow('enhancement');
    await choose(providerSelect('enhancement'), 'anthropic');

    expect(reviewContext).toHaveBeenCalledTimes(2);
    expect(mockState.saveSettings).not.toHaveBeenCalled();
    expect(selectValue(providerSelect('enhancement'))).toBe('');
    expect(feedback.toast()).toMatchObject({
      tone: 'alert',
      message: expect.stringContaining('Could not save'),
      canUndo: false,
    });
  });

  it('uses the edit context that becomes available after opening the picker', async () => {
    jest.spyOn(mockState, 'reviewContext').mockReturnValueOnce(null);
    await openRow('enhancement');
    await choose(providerSelect('enhancement'), 'anthropic');

    expect(mockState.saveSettings).toHaveBeenCalledWith(
      { enhancement: { provider: 'anthropic', model: 'inherit' } },
      { scopeKey: 'test-scope', activePath: '/workspace' },
    );
  });

  it('saves only the latest model picked while the provider save is in flight', async () => {
    let finishProviderSave: () => void = () => undefined;
    const providerSave = new Promise<void>((resolve) => {
      finishProviderSave = () => resolve();
    });
    mockState.saveSettings.mockImplementationOnce(async (patch) => {
      mockState.commitState.update((commit) => ({ ...commit, status: 'saving' }));
      await providerSave;
      return mockState.applySettings(patch);
    });
    await openRow('enhancement');
    await choose(providerSelect('enhancement'), 'anthropic');
    expect(feedback.saving()).toBe(true);
    expect(isDisabledControl(trigger(modelSelect('enhancement')))).toBe(false);

    await choose(modelSelect('enhancement'), 'claude-3-5-haiku');
    await choose(modelSelect('enhancement'), 'claude-3-5-sonnet');
    expect(selectValue(modelSelect('enhancement'))).toBe('claude-3-5-sonnet');
    expect(mockState.saveSettings).toHaveBeenCalledTimes(1);

    finishProviderSave();
    await flushSave();

    expect(mockState.saveSettings).toHaveBeenCalledTimes(2);
    expect(mockState.saveSettings).toHaveBeenLastCalledWith(
      { enhancement: { provider: 'anthropic', model: 'claude-3-5-sonnet' } },
      expect.any(Object),
    );
    expect(mockState.enhancement().data).toMatchObject({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
    });
    expect(selectValue(providerSelect('enhancement'))).toBe('anthropic');
    expect(selectValue(modelSelect('enhancement'))).toBe('claude-3-5-sonnet');
    const label = query(fixture, 'consumer-summary-enhancement')?.textContent;
    expect(label).toContain('anthropic');
    expect(label).toContain('claude-3-5-sonnet');
  });

  it('reverts a blocked pick made during a successful save to the refreshed assignment', async () => {
    let finishProviderSave: () => void = () => undefined;
    const providerSave = new Promise<void>((resolve) => {
      finishProviderSave = () => resolve();
    });
    mockState.saveSettings.mockImplementationOnce(async (patch) => {
      mockState.commitState.update((commit) => ({ ...commit, status: 'saving' }));
      await providerSave;
      return mockState.applySettings(patch);
    });

    await openRow('enhancement');
    await choose(providerSelect('enhancement'), 'anthropic');
    await choose(providerSelect('enhancement'), 'ollama');
    expect(selectValue(providerSelect('enhancement'))).toBe('ollama');
    expect(query(fixture, 'readiness-alert-enhancement')).toBeTruthy();

    finishProviderSave();
    await flushSave();

    expect(mockState.saveSettings).toHaveBeenCalledTimes(1);
    expect(mockState.enhancement().data?.provider).toBe('anthropic');
    expect(selectValue(providerSelect('enhancement'))).toBe('anthropic');
    expect(query(fixture, 'readiness-alert-enhancement')).toBeNull();
  });

  it('retries an unloaded enhancement section', async () => {
    mockState.enhancementStore.set({ status: 'unloaded', data: null, error: null });
    await settle();
    expect(query(fixture, 'consumer-notloaded-enhancement')).toBeTruthy();
    expect(query(fixture, 'timeout-effective-display')).toBeNull();
    button(fixture, 'consumer-retry-enhancement')?.click();
    expect(mockState.refreshEnhancement).toHaveBeenCalled();
  });

  it('connects the floating time-limit label to its input and resolves every label', () => {
    button(fixture, 'timeout-edit-button')?.click();
    fixture.detectChanges();

    const control = inputEl(fixture, 'timeout-input');
    expect(control).not.toBeNull();
    const field = control?.closest('ptah-field');
    expect(field).not.toBeNull();
    const label = field?.querySelector('label');
    expect(label).not.toBeNull();
    expect(label?.htmlFor).toBe(control?.id);
    expect(control?.id).toBe('enhance-timeout-input');
    expect(field?.querySelector('[data-ptah-field]')?.getAttribute('data-size')).toBe('sm');

    const linkedLabels = fixture.nativeElement.querySelectorAll('label[for]') as NodeListOf<HTMLLabelElement>;
    for (const linkedLabel of linkedLabels) {
      expect(fixture.nativeElement.querySelector(`#${linkedLabel.htmlFor}`)).not.toBeNull();
    }
  });

  it('saves the timeout through the enhancement patch and supports Undo', async () => {
    const saved = jest.fn();
    component.timeoutSaved.subscribe(saved);
    typeTimeout('180');
    button(fixture, 'timeout-save-button')?.click();
    await flushSave();
    expect(mockState.saveSettings).toHaveBeenCalledWith(
      { enhancement: { timeoutMs: 180000 } }, expect.any(Object),
    );
    expect(saved).toHaveBeenCalledWith(180);
    expect(feedback.toast()?.canUndo).toBe(true);
    await feedback.undo();
    expect(mockState.saveSettings).toHaveBeenLastCalledWith(
      { enhancement: { timeoutMs: 120000 } }, expect.any(Object),
    );
  });

  it('validates the timeout against the registered settings bounds', () => {
    typeTimeout('10');
    expect(query(fixture, 'timeout-validation-error')?.textContent).toContain('15 and 600');
    expect(isDisabledControl(button(fixture, 'timeout-save-button'))).toBe(true);
  });

  it('keeps the saved timeout on a refused write', async () => {
    mockState.saveSettings.mockResolvedValueOnce(false);
    typeTimeout('180');
    button(fixture, 'timeout-save-button')?.click();
    await flushSave();
    expect(inputEl(fixture, 'timeout-input')?.value).toBe('120');
    // The refusal is the page toast's alone; nothing inline repeats it.
    expect(query(fixture, 'timeout-save-error')).toBeNull();
    expect(feedback.toast()).toMatchObject({ tone: 'alert', message: SAVE_REFUSED_MESSAGE });
  });

  it('does not report a failed assignment as saved', async () => {
    const saved = jest.fn();
    component.assignmentSaved.subscribe(saved);
    mockState.saveSettings.mockResolvedValueOnce(false);
    await openRow('enhancement');
    await choose(providerSelect('enhancement'), 'anthropic');
    expect(saved).not.toHaveBeenCalled();
    expect(feedback.toast()?.canUndo).toBe(false);
  });

  it('keeps the memory curator patch', async () => {
    await openRow('memory-curator');
    await choose(providerSelect('memory-curator'), 'anthropic');
    expect(mockState.saveSettings).toHaveBeenCalledWith(
      { memory: { curatorProvider: 'anthropic', curatorModel: '' } },
      expect.any(Object),
    );
  });

  it('loads the active catalog for a saved curator override with a missing key', async () => {
    const initial = mockState.routeStore().data;
    if (!initial) throw new Error('Missing initial route');
    mockState.memoryStore.set({
      status: 'ready',
      data: { curatorProvider: 'openrouter', curatorModel: '' },
      error: null,
    });
    mockState.routeStore.set({
      status: 'ready',
      error: null,
      data: {
        ...initial,
        route: 'cli',
        driverProviderId: 'claude-cli',
        resolvedAuthModality: 'cli',
        providers: [
          { id: 'claude-cli', type: 'cli', status: 'connected' },
          { id: 'openrouter', type: 'apiKey', status: 'needs-key' },
          { id: 'anthropic', type: 'apiKey', status: 'connected' },
        ],
      },
    });

    await openRow('memory-curator');

    expect(mockModelsLoader.listModels.mock.calls).toEqual([['claude-cli']]);
    expect(selectValue(providerSelect('memory-curator'))).toBe('openrouter');
    expect(mockState.memoryStore().data?.curatorProvider).toBe('openrouter');
    expect(query(fixture, 'provider-model-picker-error')).toBeNull();
    expect(query(fixture, 'readiness-alert-memory-curator')).toBeNull();
    expect(query(fixture, 'saved-provider-fallback')?.textContent).toContain('saved OpenRouter override is unavailable');
    expect(query(fixture, 'consumer-summary-memory-curator')?.textContent).toContain('Claude (Subscription)');
    expect(mockState.saveSettings).not.toHaveBeenCalled();

    await choose(providerSelect('memory-curator'), 'anthropic');
    expect(mockModelsLoader.listModels.mock.calls).toEqual([['claude-cli'], ['anthropic']]);
    expect(query(fixture, 'saved-provider-fallback')).toBeNull();
    expect(mockState.saveSettings).toHaveBeenCalledWith(
      { memory: { curatorProvider: 'anthropic', curatorModel: '' } },
      expect.any(Object),
    );
  });

  it('waits for the effective route, then shows the Claude Subscription role default without requesting OpenRouter', async () => {
    const initial = mockState.routeStore().data;
    if (!initial) throw new Error('Missing initial route');
    const subscription: ProvidersEffectiveRoute = {
      ...initial,
      route: 'cli',
      driverProviderId: 'claude-cli',
      resolvedAuthModality: 'cli',
      resolvedModel: { kind: 'model', id: 'claude-sonnet-5-5' },
      providers: [
        { id: 'claude-cli', type: 'cli', status: 'connected' },
        { id: 'openrouter', type: 'apiKey', status: 'needs-key' },
      ],
    };
    mockState.routeStore.set({
      status: 'loading',
      data: { ...initial, driverProviderId: 'openrouter' },
      error: null,
    });
    await openRow('memory-curator');
    expect(query(fixture, 'consumer-editor-memory-curator')?.textContent).toContain('Resolving the active provider');
    expect(mockModelsLoader.listModels).not.toHaveBeenCalled();

    mockState.routeStore.set({ status: 'ready', data: subscription, error: null });
    await settle();
    expect(trigger(providerSelect('memory-curator')).textContent).toContain('Claude (Subscription) (inherited)');
    expect(trigger(modelSelect('memory-curator')).textContent).toContain('haiku tier');
    expect(query(fixture, 'consumer-summary-memory-curator')?.textContent).toContain('Default (haiku tier)');
    expect(mockModelsLoader.listModels.mock.calls).toEqual([['claude-cli']]);
    expect(query(fixture, 'provider-model-picker-error')).toBeNull();
    expect(mockState.saveSettings).not.toHaveBeenCalled();

    await choose(modelSelect('memory-curator'), 'claude-3-5-haiku');
    expect(mockState.saveSettings).toHaveBeenLastCalledWith(
      { memory: { curatorProvider: '', curatorModel: 'claude-3-5-haiku' } },
      expect.any(Object),
    );
  });

  it('clears the old editor on a workspace switch and loads the new route independently', async () => {
    let finishOldRequest!: (value: { models: []; error: string }) => void;
    mockModelsLoader.listModels.mockReturnValueOnce(
      new Promise((resolve) => { finishOldRequest = resolve; }),
    );
    await openRow('memory-curator');
    expect(mockModelsLoader.listModels.mock.calls).toEqual([['anthropic']]);
    const scope = TestBed.inject(WorkspaceScopeService);
    scope.switchTo('/another');
    const route = mockState.routeStore().data;
    if (!route) throw new Error('Missing initial route');
    mockState.routeStore.set({ status: 'ready', data: { ...route, driverProviderId: 'openai' }, error: null });
    await settle();
    expect(query(fixture, 'picker-memory-curator')).toBeNull();

    await openRow('memory-curator');
    finishOldRequest({ models: [], error: 'old workspace error' });
    await settle();
    expect(mockModelsLoader.listModels.mock.calls).toEqual([['anthropic'], ['openai']]);
    expect(query(fixture, 'provider-model-picker-error')).toBeNull();
  });

  describe('curator on an unsupported provider (Codex)', () => {
    const optionValues = (id: BackgroundConsumerId) =>
      options(providerSelect(id)).map((o) => o.value);

    it('does not offer Codex to the curator, but still to Enhancement', async () => {
      await openRow('memory-curator');
      expect(optionValues('memory-curator')).not.toContain('openai-codex');
      expect(query(fixture, 'readiness-alert-memory-curator')).toBeNull();
      component['cancelEdit']();
      await settle();
      await openRow('enhancement');
      expect(optionValues('enhancement')).toContain('openai-codex');
    });

    it('shows the inherited unsupported provider without fetching its catalog', async () => {
      const route = mockState.routeStore().data;
      if (!route) throw new Error('Missing initial route');
      mockState.routeStore.set({
        status: 'ready',
        data: { ...route, driverProviderId: 'openai-codex' },
        error: null,
      });
      await openRow('memory-curator');
      expect(trigger(providerSelect('memory-curator')).textContent).toContain('OpenAI Codex');
      expect(query(fixture, 'readiness-alert-memory-curator')?.getAttribute('role')).toBe('alert');
      expect(mockModelsLoader.listModels).not.toHaveBeenCalled();
    });

    it('keeps a saved Codex value, labels it and blocks it without a setup action', async () => {
      mockState.memoryStore.set({
        status: 'ready',
        data: { curatorProvider: 'openai-codex', curatorModel: '' },
        error: null,
      });
      await openRow('memory-curator');
      const select = providerSelect('memory-curator');
      expect(selectValue(select)).toBe('openai-codex');
      const option = options(select).find((o) => o.value === 'openai-codex');
      expect(option?.label).toBe('OpenAI Codex (not supported here)');
      const alert = query(fixture, 'readiness-alert-memory-curator');
      expect(alert?.getAttribute('role')).toBe('alert');
      expect(query(fixture, 'readiness-message-memory-curator')?.textContent?.trim()).toBe(
        'Memory curation cannot run on OpenAI Codex. Choose another provider. Not saved.',
      );
      expect(query(fixture, 'readiness-setup-memory-curator')).toBeNull();
    });

    it('refuses to save a model change while the curator stays on Codex', async () => {
      mockState.memoryStore.set({
        status: 'ready',
        data: { curatorProvider: 'openai-codex', curatorModel: '' },
        error: null,
      });
      await openRow('memory-curator');
      const input = inputEl(fixture, 'provider-model-picker-manual-input');
      if (!input) throw new Error('Missing manual model field');
      input.value = 'claude-3-5-sonnet';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      button(fixture, 'provider-model-picker-manual-apply')?.click();
      await flushSave();
      expect(mockModelsLoader.listModels).not.toHaveBeenCalled();
      expect(mockState.saveSettings).not.toHaveBeenCalled();
      // Moving off Codex saves as usual.
      await choose(providerSelect('memory-curator'), 'anthropic');
      expect(mockState.saveSettings).toHaveBeenCalledWith(
        { memory: { curatorProvider: 'anthropic', curatorModel: '' } },
        expect.any(Object),
      );
    });
  });
});
