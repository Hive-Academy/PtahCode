import { PtahFieldComponent } from '@ptah-extension/ui';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  viewChild,
  ElementRef,
  Injector,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { X, LucideAngularModule } from 'lucide-angular';
import {
  ClaudeAmbientStatusService,
  ProviderAccountsStateService,
  ProvidersSettingsStateService,
  VSCodeService,
  defaultMainConnectionTarget,
  type ProviderAccountActionOutcome,
  type ProvidersEditContext,
} from '@ptah-extension/core';
import {
  DEFAULT_OVERLAY_OFFSET,
  NativePopoverComponent,
  PROVIDER_MODELS_LOADER,
  ProviderModelSearchFieldComponent,
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahInputDirective,
  PtahRichSelectComponent,
  type ProviderModelSearchOption,
} from '@ptah-extension/ui';
import type { EffortLevel, SettingScope } from '@ptah-extension/shared';
import {
  SAVE_REFUSED_MESSAGE,
  SettingsSaveFeedbackService,
  type SettingsSaveResult,
} from '../feedback/settings-save-feedback.service';
import { commitToast } from '../feedback/settings-commit-toast';
import {
  DRAWER_WRITE_NO_CONTEXT,
  runDrawerWrite,
  type DrawerWriteOutcome,
} from './connection-drawer/drawer-write';
import { injectAppScopeName, saveTargetLabels } from './app-scope-label';
import { capPopoverHeight } from './popover-height-cap';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import { connectionKind } from './connection-drawer/connection-kind';
import {
  ACCOUNT_COPY,
  accountChoiceOf,
  accountSelectorModel,
  selectionFeedback,
  type AccountSelectorValue,
} from './accounts/account-presentation';
import {
  type AccountIntent,
  type MainAgentPatch,
  type ModelCatalogue,
  EFFORT_LEVELS,
  mainAgentModelOptions,
  mainAgentProviderOptions,
} from './main-agent-options';
export { EFFORT_LEVELS } from './main-agent-options';

export type MainAgentFocus = 'main-agent' | 'main-model' | 'main-effort';
const MANUAL = '__manual__';
const PROVIDER_SAVED = 'Main agent provider saved.';
const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content';
const LABEL = 'block text-xs font-semibold text-base-content-muted';
@Component({
  selector: 'ptah-main-agent-reassign-popover',
  standalone: true,
  imports: [
    PtahFieldComponent,
    PtahButtonDirective,
    PtahIconButtonDirective,
    PtahInputDirective,
    PtahRichSelectComponent,
    SettingsBusyDisabledDirective,
    LucideAngularModule,
    NativePopoverComponent,
    ProviderModelSearchFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Angular owns (and removes) this listener with the component.
  host: { '(window:resize)': 'open() && fitToViewport()' },
  templateUrl: './main-agent-reassign-popover.component.html',
})
export class MainAgentReassignPopoverComponent {
  protected readonly CloseIcon = X;
  protected readonly state = inject(ProvidersSettingsStateService);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly loader = inject(PROVIDER_MODELS_LOADER);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly changeDetector = inject(ChangeDetectorRef);

  /** Commit the child select's open state in the activating event, including its options. */
  protected renderSelectOptions(): void {
    this.changeDetector.detectChanges();
  }

  private readonly scopeLabels = saveTargetLabels(injectAppScopeName());
  protected readonly providerSelectOptions = computed(() =>
    this.providers().map((option) => ({
      value: option.id,
      label: option.label,
    })),
  );
  protected readonly targetSelectOptions = computed(() =>
    this.targets().map((scope) => ({
      value: scope,
      label: this.scopeLabel(scope),
    })),
  );
  private readonly accountSelect =
    viewChild<PtahRichSelectComponent<AccountSelectorValue>>('accountSelect');
  protected readonly label = LABEL;
  protected readonly focusRing = FOCUS;
  protected readonly manualOption: ProviderModelSearchOption = {
    id: MANUAL,
    name: 'Enter a model ID…',
    supportsToolUse: null,
  };
  protected readonly efforts: readonly {
    value: EffortLevel | '';
    label: string;
  }[] = [
    { value: '', label: 'default' },
    ...EFFORT_LEVELS.map((value) => ({ value, label: value })),
  ];
  readonly open = input(false);
  readonly initialFocus = input<MainAgentFocus | null>(null);
  readonly closed = output<void>();
  readonly accountSignInRequested = output<void>();
  // The draft: nothing below is written before Save.
  protected readonly providerChoice = signal<string | null>(null);
  protected readonly rescope = signal(false);
  protected readonly providerConfirmed = signal(false);
  protected readonly targetChoice = signal<SettingScope | null>(null);
  protected readonly modelDraft = signal<string | null>(null);
  protected readonly effortDraft = signal<EffortLevel | '' | null>(null);
  protected readonly manual = signal(false);
  protected readonly manualDraft = signal('');
  protected readonly catalogue = signal<ModelCatalogue>({
    status: 'loading',
    models: [],
  });
  private readonly outcome = signal<DrawerWriteOutcome | null>(null);
  protected readonly saving = signal(false);
  protected readonly maxHeight = signal<number | null>(null);
  // Account (P6 MP). Electron only, like the Providers page (D34): elsewhere the services are never injected.
  private readonly accountsAvailable = inject(VSCodeService).isElectron;
  private readonly accounts = this.accountsAvailable
    ? inject(ProviderAccountsStateService)
    : null;
  private readonly ambient = this.accountsAvailable
    ? inject(ClaudeAmbientStatusService)
    : null;
  protected readonly copy = ACCOUNT_COPY;
  protected readonly accountDraft = signal<AccountSelectorValue | null>(null);
  protected readonly accountRefused = signal(false);
  private draftBase: string | null = null;
  private elsewhereAnnounced = false;
  private context: ProvidersEditContext | null = null;
  private session = 0;
  private catalogueRequest = 0;
  protected readonly driverId = computed(() => {
    const route = this.state.route().data;
    return route && route.route !== 'unresolved'
      ? (route.driverProviderId ?? '')
      : '';
  });
  protected readonly providers = computed(() =>
    mainAgentProviderOptions(
      this.state.connections().data ?? [],
      this.state.route().data?.providers ?? [],
      this.driverId(),
    ),
  );
  protected readonly providerId = computed(
    () => this.providerChoice() ?? this.driverId(),
  );
  private readonly providerTargets = computed(() =>
    this.state.writeScopes('authMethod'),
  );
  private readonly providerSource = computed(
    () => this.state.scopeEntry('authMethod')?.scope ?? null,
  );
  protected readonly targets = computed(() => {
    const sources = this.state.mainSources().data;
    if (
      this.state.mainSources().status !== 'ready' ||
      !sources?.model ||
      !sources.effort
    )
      return [] as readonly SettingScope[];
    const effort = this.state.writeScopes(sources.effort.key);
    return this.state
      .writeScopes(sources.model.key)
      .filter((target) => effort.includes(target));
  });
  protected readonly target = computed<SettingScope | null>(() => {
    return defaultMainConnectionTarget(this.state, this.targetChoice());
  });
  protected readonly targetReady = computed(() => this.target() !== null);
  protected readonly rescopeOffer = computed(() => {
    const target = this.target();
    return target &&
      this.driverId() &&
      !this.providerChoice() &&
      !this.rescope() &&
      this.providerSource() !== target &&
      this.providerTargets().includes(target)
      ? this.scopeLabels[target]
      : null;
  });
  protected readonly pendingProvider = computed(() => {
    const id = this.providerId();
    const changing = !!id && id !== this.driverId();
    if (!changing && !(this.rescope() && id)) return null;
    const option = this.providers().find((entry) => entry.id === id);
    const name = option?.name ?? id,
      target = this.target();
    const ends =
      target === 'workspace'
        ? 'ends running chat sessions in this workspace.'
        : 'ends running chat sessions in every workspace.';
    return {
      id,
      name,
      uncheckable: option?.uncheckable ?? false,
      scope: target ? this.scopeLabels[target] : null,
      writable: target !== null && this.providerTargets().includes(target),
      copy: changing
        ? `New main-agent requests use ${name}. Changing the provider ${ends}`
        : `New main-agent requests keep using ${name}. Saving the provider ${ends}`,
    };
  });
  protected readonly currentModel = computed(
    () => this.state.model().data?.model ?? '',
  );
  protected readonly selectedModel = computed(
    () => this.modelDraft() ?? this.currentModel(),
  );
  protected readonly defaultModelLabel = computed(() =>
    this.providerId() === this.driverId() &&
    this.state.route().data?.resolvedModel.kind === 'unresolved'
      ? 'Default (chosen by Claude)'
      : 'Provider default',
  );
  protected readonly modelOptions = computed(() =>
    mainAgentModelOptions(this.catalogue().models, this.selectedModel()),
  );
  protected readonly searchOptions = computed<
    readonly ProviderModelSearchOption[]
  >(() =>
    this.modelOptions().map((option) => ({
      id: option.id,
      name: option.label,
      supportsToolUse: null,
    })),
  );
  protected readonly currentEffort = computed<EffortLevel | ''>(
    () => (this.state.effort().data?.effort as EffortLevel | undefined) ?? '',
  );
  protected readonly selectedEffort = computed<EffortLevel | ''>(
    () => this.effortDraft() ?? this.currentEffort(),
  );
  private readonly modelChanged = computed(
    () => this.selectedModel() !== this.currentModel(),
  );
  private readonly effortChanged = computed(
    () => this.selectedEffort() !== this.currentEffort(),
  );
  protected readonly awaitingConfirm = computed(
    () => this.pendingProvider() !== null && !this.providerConfirmed(),
  );
  protected readonly busy = computed(
    () =>
      this.saving() ||
      this.feedback.saving() ||
      this.outcome()?.status === 'saving',
  );
  private readonly claudeCliDraft = computed(() => {
    const entry = (this.state.connections().data ?? []).find(
      (connection) => connection.id === this.providerId(),
    );
    return !!entry && connectionKind(entry) === 'claude-cli';
  });
  private readonly accountModel = computed(() =>
    this.accounts && this.ambient
      ? accountSelectorModel(
          this.accounts.state('claude')(),
          this.ambient.view(),
          'main',
        )
      : null,
  );
  protected readonly accountField = computed(() => {
    if (!this.claudeCliDraft()) return null;
    const model = this.accountModel();
    return model?.visible ? model : null;
  });
  protected readonly accountValue = computed<AccountSelectorValue | null>(
    () => {
      const model = this.accountModel(),
        draft = this.accountDraft();
      if (!model) return null;
      return draft !== null && this.enabledOption(draft) ? draft : model.value;
    },
  );
  protected readonly accountText = computed(() => {
    const value = this.accountValue();
    return (
      this.accountField()?.options.find((option) => option.value === value)
        ?.label ?? ''
    );
  });
  protected readonly accountRemoved = computed(
    () =>
      this.accountField()?.stored.kind === 'removed' &&
      this.accountValue() === 'stored',
  );
  private readonly storedKey = computed(() => {
    const stored = this.accountModel()?.stored;
    return !stored
      ? null
      : stored.kind === 'ambient'
        ? 'ambient'
        : `named:${stored.profileId}`;
  });
  protected readonly accountChanged = computed(() => {
    const draft = this.accountDraft();
    return (
      this.accountField() !== null &&
      draft !== null &&
      draft !== this.accountModel()?.value &&
      this.enabledOption(draft) &&
      accountChoiceOf(draft) !== null
    );
  });
  protected readonly saveReady = computed(() => {
    if (this.accountRefused()) return false;
    const pending = this.pendingProvider();
    const dirty =
      pending !== null || this.modelChanged() || this.effortChanged();
    if (dirty)
      return (
        this.targetReady() &&
        !this.awaitingConfirm() &&
        (pending?.writable ?? true)
      );
    return this.accountChanged() && !this.awaitingConfirm();
  });
  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.session += 1;
        this.context = this.state.reviewContext();
        this.discardDraft();
        this.accountRefused.set(false);
        this.manual.set(false);
        this.outcome.set(null);
        // One list read and one cached ambient read per open (no forced probe).
        void this.accounts?.open('claude');
        void this.ambient?.read(false);
      });
    });
    // Contract 3: a stored account pushed while a draft is held keeps the draft and is said once per draft. Not while a
    // Save runs: its own outcome (or the P6-A12 refusal) speaks for that write.
    effect(() => {
      const key = this.storedKey(),
        draft = this.accountDraft();
      if (this.saving()) return;
      untracked(() => {
        if (
          draft === null ||
          key === null ||
          this.elsewhereAnnounced ||
          key === this.draftBase
        )
          return;
        this.elsewhereAnnounced = true;
        this.feedback.announce(ACCOUNT_COPY.accountChangedElsewhere, 'status');
      });
    });
    // DOM re-assert (B-1): the select's value is always the shown value, never a disabled or `stored` pick.
    afterRenderEffect(() => {
      const value = this.accountValue();
      if (!this.accountField() || value === null) return;
      untracked(() => this.reassertAccount(value));
    });
    // The draft provider's catalogue, while open; a newer request supersedes an older one.
    effect(() => {
      if (this.open() && this.providerId()) untracked(() => this.loadModels());
    });
    // Re-fit after every state that changes the popover's height (Gate V 28: the confirm ran off screen).
    afterRenderEffect(() => {
      if (!this.open()) return;
      this.pendingProvider();
      this.providerConfirmed();
      this.manual();
      this.catalogue();
      this.targetReady();
      untracked(() => this.fitToViewport());
    });
  }
  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }
  protected asScope(value: string): SettingScope | null {
    return value === 'global' || value === 'app' || value === 'workspace'
      ? value
      : null;
  }
  protected scopeLabel(scope: SettingScope): string {
    return this.scopeLabels[scope];
  }
  protected effortClass(value: EffortLevel | ''): string {
    const selected = this.selectedEffort() === value;
    return `btn btn-sm w-full px-1 text-xs font-medium ${selected ? 'btn-primary' : 'btn-outline border-base-content-muted text-base-content'} ${FOCUS}`;
  }
  async loadModels(): Promise<void> {
    const request = ++this.catalogueRequest,
      provider = this.providerId();
    this.catalogue.set({ status: 'loading', models: [] });
    try {
      const result = await this.loader.listModels(provider);
      if (request !== this.catalogueRequest) return;
      this.catalogue.set({
        status: result.error ? 'error' : 'ready',
        models: result.models ?? [],
      });
    } catch {
      if (request === this.catalogueRequest)
        this.catalogue.set({ status: 'error', models: [] });
    }
  }
  protected onProvider(id: string): void {
    if (id !== this.providerId()) {
      this.modelDraft.set(!id || id === this.driverId() ? null : '');
      this.manual.set(false);
    }
    this.providerChoice.set(id || null);
    this.providerConfirmed.set(false);
  }
  protected requestRescope(): void {
    this.rescope.set(true);
    this.providerConfirmed.set(false);
  }
  protected onTarget(scope: SettingScope | null): void {
    this.targetChoice.set(scope);
    this.providerConfirmed.set(false);
  }
  protected confirmProvider(): void {
    const pending = this.pendingProvider();
    if (!pending || !pending.writable || this.busy()) return;
    this.providerConfirmed.set(true);
    afterNextRender(
      () =>
        this.element.nativeElement
          .querySelector<HTMLButtonElement>('[data-testid="main-agent-save"]')
          ?.focus(),
      { injector: this.injector },
    );
  }
  protected resetProvider(): void {
    if (
      this.providerChoice() !== null &&
      this.providerChoice() !== this.driverId()
    ) {
      this.modelDraft.set(null);
      this.manual.set(false);
    }
    this.providerChoice.set(null);
    this.rescope.set(false);
    this.providerConfirmed.set(false);
    this.element.nativeElement
      .querySelector<HTMLElement>('#main-agent-provider')
      ?.focus();
  }
  protected onModel(value: string): void {
    if (value === MANUAL) {
      this.manualDraft.set('');
      this.manual.set(true);
      // The select leaves the DOM; focus the field once it has rendered, so focus (and Esc) stay in the popover.
      afterNextRender(
        () =>
          this.element.nativeElement
            .querySelector<HTMLInputElement>('input#main-agent-model')
            ?.focus(),
        { injector: this.injector },
      );
      return;
    }
    this.modelDraft.set(value || (this.providerId() === this.driverId() ? null : ''));
  }
  protected applyManual(): void {
    const model = this.manualDraft().trim();
    if (!model || this.busy()) return;
    this.modelDraft.set(model);
    this.closeManual();
  }
  protected closeManual(): void {
    this.manual.set(false);
    afterNextRender(
      () =>
        this.element.nativeElement
          .querySelector<HTMLInputElement>('input#main-agent-model')
          ?.focus(),
      { injector: this.injector },
    );
  }
  protected onAccount(value: AccountSelectorValue | null): void {
    if (value === null) return;
    const model = this.accountModel();
    if (
      !model ||
      this.busy() ||
      !this.enabledOption(value) ||
      accountChoiceOf(value) === null
    ) {
      const shown = this.accountValue();
      if (shown !== null) this.reassertAccount(shown);
      return;
    }
    if (value === model.value) {
      this.accountDraft.set(null);
      return;
    }
    this.accountDraft.set(value);
    this.draftBase = this.storedKey();
    this.elsewhereAnnounced = false;
    this.accountRefused.set(false);
  }
  protected onEffort(effort: EffortLevel | ''): void {
    if (this.busy() || !this.targetReady()) return;
    this.effortDraft.set(effort);
  }
  protected async save(): Promise<void> {
    const target = this.target(),
      pending = this.pendingProvider(),
      session = this.session;
    const writesSettings =
      pending !== null || this.modelChanged() || this.effortChanged();
    if (!this.saveReady() || this.busy() || (writesSettings && !target)) return;
    const intent = this.captureAccountIntent();
    const saveButton = this.saveButton();
    const followUp =
      intent !== null ||
      (target !== null && (this.modelChanged() || this.effortChanged()));
    this.saving.set(true);
    try {
      if (pending && target) {
        await runDrawerWrite(
          this.contextSource(),
          (context) =>
            this.state
              .activateConnection(pending.id, target, context)
              .then((result) => result.started),
          (outcome) => {
            if (session === this.session) this.outcome.set(outcome);
            // The toast outlives the popover. A saved provider is said by the write that follows it, when one does.
            const said = commitToast(outcome, PROVIDER_SAVED);
            if (said && (said.tone === 'alert' || !followUp))
              this.feedback.announce(said.message, said.tone);
          },
        );
        this.refreshContextIfBlocked();
        if (session !== this.session || this.outcome()?.status !== 'saved')
          return;
        this.providerChoice.set(null);
        this.rescope.set(false);
        this.providerConfirmed.set(false);
      }
      let accountSaved: string | null = null;
      const accounts = this.accounts;
      if (intent && accounts) {
        // A closed or reopened popover drops the intent: nothing more is written.
        const providerSaved = pending !== null;
        if (session !== this.session || !this.open()) {
          if (providerSaved) this.feedback.announce(PROVIDER_SAVED, 'status');
          return;
        }
        // No await between the check and the call: the service's call-time snapshot read is the checked one.
        const outcome: ProviderAccountActionOutcome =
          !providerSaved || this.intentHolds(intent)
            ? await accounts.setSelection('claude', 'main', intent.choice)
            : { status: 'unavailable' };
        const feedback = selectionFeedback(outcome, 'main', { providerSaved });
        const live = session === this.session && this.open();
        if (outcome.status !== 'saved') {
          // D60: a null feedback shows no toast. The toast outlives the popover, so it announces even when closed.
          if (feedback) this.feedback.announce(feedback.message, feedback.tone);
          if (!live) return;
          this.accountDraft.set(null);
          if (outcome.status === 'unconfirmed') return;
          // Confirmed refusal: P6-A13 lock; P6-A3 focus only when focus is still on Save (the B-2 waiting target).
          const focusWasOnSave =
            !!saveButton &&
            saveButton.ownerDocument.activeElement === saveButton;
          this.accountRefused.set(true);
          if (focusWasOnSave) {
            afterNextRender(
              () =>
                this.element.nativeElement
                  .querySelector<HTMLElement>('#main-agent-account')
                  ?.focus(),
              { injector: this.injector },
            );
          }
          return;
        }
        if (live) this.accountDraft.set(null);
        if (!live || !(this.modelChanged() || this.effortChanged())) {
          if (feedback)
            this.feedback.announce(
              providerSaved
                ? `${PROVIDER_SAVED} ${feedback.message}`
                : feedback.message,
              feedback.tone,
            );
          else if (providerSaved)
            this.feedback.announce(PROVIDER_SAVED, 'status');
          if (!live) return;
        } else {
          accountSaved = feedback?.message ?? null;
        }
      }
      if (target && (this.modelChanged() || this.effortChanged())) {
        const result = await this.saveModelAndEffort(
          target,
          accountSaved,
          pending !== null,
        );
        if (session !== this.session || result !== 'saved') return;
        this.modelDraft.set(null);
        this.effortDraft.set(null);
      }
      if (session === this.session) this.closed.emit();
    } finally {
      this.saving.set(false);
    }
  }
  protected cancel(): void {
    this.discardDraft();
    this.closed.emit();
  }
  protected focusRequested(): void {
    this.fitToViewport();
    const target = this.initialFocus();
    if (target) {
      const field = this.element.nativeElement.querySelector<HTMLElement>(
        `[data-focus="${target}"]`,
      );
      (
        field?.querySelector<HTMLElement>('[role="combobox"]') ?? field
      )?.focus();
    }
  }
  protected fitToViewport(): void {
    const host = this.element.nativeElement;
    const trigger = host.querySelector<HTMLElement>('.popover-trigger');
    const panel = host.querySelector<HTMLElement>(
      '[data-testid="main-agent-popover"]',
    );
    const view = host.ownerDocument.defaultView;
    if (!trigger || !panel || !view) return;
    const { top, bottom } = trigger.getBoundingClientRect();
    const frame = panel.closest<HTMLElement>('.popover-panel');
    const chrome = frame ? frame.offsetHeight - panel.offsetHeight : 0;
    const reserve = DEFAULT_OVERLAY_OFFSET + chrome + 8;
    this.maxHeight.set(
      capPopoverHeight(
        Math.max(view.innerHeight - bottom, top) - reserve,
        view.innerHeight - chrome - 16,
      ),
    );
  }
  private async saveModelAndEffort(
    applyTo: SettingScope,
    accountSaved: string | null,
    providerSaved: boolean,
  ): Promise<SettingsSaveResult | null> {
    const context = this.context;
    const model = this.modelChanged() ? this.selectedModel() : null;
    const effort = this.effortChanged() ? this.selectedEffort() : null;
    // Undoing a provider switch's default would restore the old provider's model ID.
    const undoModel = model ? this.currentModel() : null;
    const previousEffort = this.currentEffort();
    const label =
      model !== null && effort !== null
        ? 'main agent model and reasoning effort'
        : model !== null
          ? 'main agent model'
          : 'reasoning effort';
    if (!context) {
      if (providerSaved)
        this.announceProviderSavedWith(
          `Could not save ${label}. ${DRAWER_WRITE_NO_CONTEXT}`,
        );
      return null;
    }
    const result = await this.feedback.save({
      label,
      scope: applyTo,
      // P6-A2: a saved account rides on this toast, so its Undo (model and effort only) survives.
      // A provider saved just before rides on it too (its own inline outcome moved to the toast).
      ...(accountSaved || providerSaved
        ? {
            successMessage: [
              providerSaved ? PROVIDER_SAVED : '',
              `Saved ${label} to ${this.scopeLabels[applyTo]}.`,
              accountSaved ? `${accountSaved}.` : '',
            ]
              .filter(Boolean)
              .join(' '),
          }
        : {}),
      write: () =>
        this.state.saveSettings(this.patch(model, effort, applyTo), context),
      undo:
        undoModel === '' || (undoModel === null && effort === null)
          ? null
          : () =>
              this.state.saveSettings(
                this.patch(
                  undoModel,
                  effort !== null ? previousEffort : null,
                  applyTo,
                ),
                context,
              ),
    });
    this.refreshContextIfBlocked();
    if (providerSaved && result === 'failed')
      this.announceProviderSavedWith(
        this.feedback.toast()?.message ?? `Could not save ${label}.`,
      );
    else if (providerSaved && result === 'refused')
      this.announceProviderSavedWith(
        `Could not save ${label}. ${SAVE_REFUSED_MESSAGE}`,
      );
    return result;
  }
  private announceProviderSavedWith(failure: string): void {
    this.feedback.announce(`${PROVIDER_SAVED} ${failure}`, 'alert');
  }
  private patch(
    model: string | null,
    effort: EffortLevel | '' | null,
    applyTo: SettingScope,
  ): MainAgentPatch {
    return {
      ...(model !== null ? { model: { model, applyTo } } : {}),
      ...(effort !== null
        ? { effort: { effort: effort || undefined, applyTo } }
        : {}),
    };
  }
  private discardDraft(): void {
    this.providerChoice.set(null);
    this.rescope.set(false);
    this.providerConfirmed.set(false);
    this.targetChoice.set(null);
    this.modelDraft.set(null);
    this.effortDraft.set(null);
    this.accountDraft.set(null);
    this.draftBase = null;
    this.elsewhereAnnounced = false;
  }
  private enabledOption(value: AccountSelectorValue): boolean {
    return (
      this.accountModel()?.options.some(
        (option) => option.value === value && !option.disabled,
      ) ?? false
    );
  }
  private reassertAccount(value: AccountSelectorValue): void {
    this.accountSelect()?.value.set(value);
  }
  private saveButton(): HTMLButtonElement | null {
    return this.element.nativeElement.querySelector<HTMLButtonElement>(
      '[data-testid="main-agent-save"]',
    );
  }
  private captureAccountIntent(): AccountIntent | null {
    const value = this.accountDraft();
    if (!this.accounts || value === null || !this.accountChanged()) return null;
    const choice = accountChoiceOf(value),
      snapshot = this.accounts.state('claude')().snapshot;
    if (!choice || !snapshot) return null;
    const profile =
      choice.kind === 'named'
        ? snapshot.accounts.find(
            (account) => account.profileId === choice.profileId,
          )
        : null;
    if (choice.kind === 'named' && !profile) return null;
    return {
      value,
      choice,
      selectionRevision: snapshot.selections.main.revision,
      profileRevision: profile?.revision ?? null,
    };
  }
  private intentHolds(intent: AccountIntent): boolean {
    const snapshot = this.accounts?.state('claude')().snapshot;
    if (
      !snapshot ||
      snapshot.selections.main.revision !== intent.selectionRevision
    )
      return false;
    if (intent.choice.kind === 'named') {
      const profileId = intent.choice.profileId;
      const profile = snapshot.accounts.find(
        (account) => account.profileId === profileId,
      );
      if (!profile || profile.revision !== intent.profileRevision) return false;
    }
    return this.enabledOption(intent.value);
  }
  private contextSource() {
    return { reviewContext: () => this.context, commit: this.state.commit };
  }
  private refreshContextIfBlocked(): void {
    if (this.state.commit().status === 'blocked')
      this.context = this.state.reviewContext();
  }
}
