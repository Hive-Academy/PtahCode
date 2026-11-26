import { DOCUMENT, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  AppStateManager,
  ClaudeRpcService,
  ClockService,
  type ViewType,
} from '@ptah-extension/core';
import {
  getAnthropicProvider,
  type SetupPairState,
} from '@ptah-extension/shared';
import {
  ArrowUpRight,
  LucideAngularModule,
  Play,
  ScanSearch,
} from 'lucide-angular';
import {
  PtahAlertComponent,
  PtahBadgeDirective,
  PtahButtonDirective,
  SetupActionDirective,
} from '@ptah-extension/ui';
import {
  ConfirmationModalComponent,
  SetupWizardStateService,
  WizardAnalysisRunner,
  WizardRpcService,
  safeFailureCopy,
  type GenerationViewState,
} from '@ptah-extension/setup-wizard';
import { DetailsLogComponent } from '../shared/details-log.component';
import { LiveRunLayoutComponent } from '../shared/live-run-layout.component';
import {
  OnboardingStepperComponent,
  type OnboardingStep,
} from '../shared/onboarding-stepper.component';
import { RunPanelComponent } from '../shared/run-panel.component';
import { onboardingStepLink } from '../shell/onboarding-step-link';
import { OnboardingWorkspaceStore } from '../shell/onboarding-workspace.store';
import { AnalysisStepStore } from './analysis-step.store';
import { PhaseListComponent } from './phase-list.component';

interface SetupCardIssue {
  readonly message: string;
  readonly actionLabel: string;
  readonly action: 'choose-provider' | 'choose-model' | 'sign-in' | 'retry';
  readonly provider: string | null;
  readonly canUseWorkspace: boolean;
}

function formatProviderDisplayName(id: string): string {
  const meta = getAnthropicProvider(id);
  if (meta?.name) return meta.name;
  return id.toLowerCase() === 'openai' ? 'OpenAI' : id;
}

function resolveOptionalAppState(injector: Injector): AppStateManager | null {
  try {
    return injector.get(AppStateManager, null);
  } catch {
    // degradation-audit: optional-capability - Analysis works without host Settings navigation.
    return null;
  }
}

function resolveOptionalWorkspaceStore(
  injector: Injector,
): OnboardingWorkspaceStore | null {
  try {
    return injector.get(OnboardingWorkspaceStore, null);
  } catch {
    // degradation-audit: optional-capability - Analysis works without workspace store in isolated harnesses.
    return null;
  }
}

function describeSetupIssue(
  state: SetupPairState | null,
): SetupCardIssue | null {
  if (!state || state.kind === 'set' || state.kind === 'unset') return null;
  const providerName = state.provider
    ? formatProviderDisplayName(state.provider)
    : 'the selected provider';
  const subject = state.source === 'setup' ? 'Setup' : 'The workspace model';
  const base = {
    provider: state.provider,
    canUseWorkspace: state.source === 'setup',
  };
  if (state.kind === 'unavailable') {
    return {
      ...base,
      message: `${subject} could not reach ${providerName}.`,
      actionLabel: 'Retry',
      action: 'retry',
    };
  }
  if (state.cause === 'not-signed-in') {
    const scope = state.source === 'setup' ? 'Setup' : 'the workspace model';
    return {
      ...base,
      message: `${providerName} is not signed in for ${scope}.`,
      actionLabel: 'Sign in',
      action: 'sign-in',
    };
  }
  if (state.cause === 'model-missing' || state.cause === 'model-stale') {
    const detail =
      state.cause === 'model-missing'
        ? `has no model selected for ${providerName}`
        : `uses ${state.model ?? 'a removed model'}, which ${providerName} no longer offers`;
    return {
      ...base,
      message: `${subject} ${detail}.`,
      actionLabel: 'Choose a model',
      action: 'choose-model',
    };
  }
  const detail =
    state.cause === 'provider-missing'
      ? 'has no provider selected'
      : `uses ${providerName}, which is ${state.cause === 'provider-unknown' ? 'no longer offered' : 'unsupported for Setup'}`;
  return {
    ...base,
    message: `${subject} ${detail}.`,
    actionLabel: 'Choose a provider',
    action: 'choose-provider',
  };
}

@Component({
  selector: 'ptah-analyze-workspace-page',
  standalone: true,
  imports: [
    ConfirmationModalComponent,
    DatePipe,
    DetailsLogComponent,
    LiveRunLayoutComponent,
    OnboardingStepperComponent,
    RunPanelComponent,
    PhaseListComponent,
    LucideAngularModule,
    PtahAlertComponent,
    PtahBadgeDirective,
    PtahButtonDirective,
    SetupActionDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="mx-auto space-y-5"
      [class.max-w-[1120px]]="!showSetupSection()"
      [class.max-w-[760px]]="showSetupSection()"
      [class.p-4]="showSetupSection()"
      aria-labelledby="analyze-workspace-title"
      data-testid="analyze-workspace"
    >
      <header class="flex items-center gap-3">
        <span
          class="rounded-xl border border-base-300 p-2"
          data-glass-surface="tile"
          ><lucide-angular [img]="icons.scan" class="size-6" aria-hidden="true"
        /></span>
        <div>
          <h1
            id="analyze-workspace-title"
            tabindex="-1"
            class="text-2xl font-semibold"
          >
            Analyze workspace
          </h1>
          <p class="text-sm text-base-content-muted">
            Understand this project and find relevant skills.
          </p>
        </div>
      </header>
      <ptah-onboarding-stepper [steps]="steps" />

      @if (setupState() && showSetupSection()) {
        <section
          class="space-y-3 rounded-[22px] border border-base-300 p-4"
          data-glass-surface="tile"
          data-testid="setup-model-card"
          aria-labelledby="setup-model-card-title"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <h2 id="setup-model-card-title" class="text-base font-semibold">
                Setup model
              </h2>
              <span
                ptahBadge
                [tone]="setupBadgeTone()"
                data-testid="setup-model-badge"
              >
                {{ setupBadgeLabel() }}
              </span>
            </div>
            <button
              ptahButton
              variant="link"
              size="sm"
              type="button"
              data-testid="setup-model-settings-link"
              (click)="openSetupSettings()"
            >
              Change in Settings
              <lucide-angular
                [img]="icons.external"
                class="size-3.5"
                aria-hidden="true"
              />
            </button>
          </div>
          <div class="space-y-1">
            <p class="text-sm font-semibold" data-testid="setup-model-pair">
              {{ setupPairText() }}
            </p>
            @if (setupHintText(); as hint) {
              <p class="text-xs text-base-content-muted">{{ hint }}</p>
            }
          </div>
          @if (setupIssue(); as issue) {
            <ptah-alert
              tone="error"
              live="assertive"
              data-testid="setup-model-alert"
            >
              {{ issue.message }}
              <div alertAction class="flex flex-wrap items-center gap-2">
                <button
                  ptahButton
                  variant="secondary"
                  size="xs"
                  type="button"
                  data-testid="setup-model-issue-action"
                  (click)="runSetupIssueAction(issue)"
                >
                  {{ issue.actionLabel }}
                </button>
                @if (issue.canUseWorkspace) {
                  <button
                    ptahButton
                    variant="ghost"
                    size="xs"
                    type="button"
                    data-testid="setup-model-use-workspace"
                    [disabled]="setupUpdating()"
                    (click)="useWorkspaceModel()"
                  >
                    Use workspace model
                  </button>
                }
              </div>
            </ptah-alert>
          }
          @if (setupActionError(); as actionError) {
            <p class="text-xs text-state-err" role="alert">{{ actionError }}</p>
          }
        </section>
      }

      @if (setupReadFailed() && showSetupSection()) {
        <ptah-alert
          tone="error"
          live="assertive"
          data-testid="setup-model-read-error"
        >
          Could not check the Setup model. Try again.
          <button
            alertAction
            ptahButton
            variant="secondary"
            size="xs"
            type="button"
            [disabled]="setupRefreshing() || setupUpdating()"
            (click)="refreshSetupModel()"
          >
            Retry
          </button>
        </ptah-alert>
      }

      @if (stopRecovery()) {
        <ptah-run-panel
          state="cancelling"
          [viewState]="viewState()"
          title="Stopping analysis"
          message="The stop could not be confirmed. The analysis may still be running."
          (retry)="retry()"
          (startOver)="startFresh()"
        />
      } @else if (isAnalysisActive()) {
        <ptah-live-run-layout [hasLog]="true">
          <ptah-details-log
            runLog
            variant="pane"
            data-transcript-variant="pane"
            mode="analysis"
            [liveState]="isAnalysisCanceling() ? 'stopped' : 'live'"
            [streamCounts]="store.streamCounts()"
            footerNote="Streaming analysis output. Read-only."
          />
          <ptah-run-panel
            [state]="isAnalysisCanceling() ? 'cancelling' : 'running'"
            [viewState]="viewState()"
            [title]="
              isAnalysisCanceling()
                ? 'Stopping analysis'
                : 'Analyzing workspace'
            "
            [message]="
              isAnalysisCanceling()
                ? 'Waiting for the run to stop.'
                : runner.statusText()
            "
            (stop)="confirmStop()"
          >
            @if (store.phaseHeader(); as header) {
              <p class="mt-3 text-sm" data-testid="phase-header">
                Phase {{ header.current }} of {{ header.total }}
              </p>
            }
            <ptah-phase-list [phases]="store.phaseRows()" />
            @if (elapsedSeconds() !== null) {
              <p class="mt-3 text-xs text-base-content-muted">
                {{ elapsedSeconds() }}s elapsed
              </p>
            }
          </ptah-run-panel>
          <p class="text-sm text-base-content-muted">
            You can leave this page. The analysis keeps running.
          </p>
        </ptah-live-run-layout>
      } @else if (analysisError(); as rawError) {
        <ptah-run-panel
          state="failed"
          [viewState]="viewState()"
          title="Analysis failed"
          [message]="safeError(rawError)"
          (retry)="retry()"
          (startOver)="startFresh()"
        />
        <p class="text-sm text-base-content-muted">
          The analysis may still be running if the connection was lost. Retry
          can continue the saved run.
        </p>
      } @else if (store.loaded(); as result) {
        <ptah-run-panel
          state="done"
          [viewState]="viewState()"
          title="Analysis complete"
          continueLabel="Review skills"
          [message]="
            'Completed in ' + duration(result.manifest.totalDurationMs)
          "
          (continueRun)="reviewSkills()"
        >
          <ptah-phase-list [phases]="store.phaseRows()" />
        </ptah-run-panel>
        <section
          class="space-y-2 rounded-[22px] border border-base-300 p-5"
          data-glass-surface="content"
        >
          <h2 class="font-semibold">Phase details</h2>
          @for (phase of store.phaseRows(); track phase.id) {
            <details
              class="rounded-[10px] border border-base-300 p-3"
              data-glass-surface="tile"
            >
              <summary class="cursor-pointer">
                {{ phase.label }} · {{ phase.status }}
              </summary>
              <pre class="mt-3 whitespace-pre-wrap break-words text-sm">{{
                result.phaseContents[phase.id]
              }}</pre>
            </details>
          }
        </section>
      } @else if (interrupted()) {
        <section
          class="rounded-[22px] border border-base-300 p-5"
          data-glass-surface="content"
        >
          <h2 class="text-lg font-semibold">Interrupted analysis</h2>
          <p class="mt-1 text-sm text-base-content-muted">
            An unfinished run is available.
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              [ptahSetupAction]="setupReady() ? 'primaryCompact' : 'ghost'"
              [disabled]="!setupReady()"
              (click)="continuePrevious()"
            >
              Continue previous run
            </button>
            <button
              type="button"
              [ptahSetupAction]="'ghost'"
              [disabled]="!setupReady()"
              (click)="startFresh()"
            >
              Start fresh
            </button>
          </div>
          @if (setupInvalid()) {
            <p
              class="mt-2 text-sm text-base-content-muted"
              data-testid="setup-start-hint"
            >
              Choose a valid Setup model to start.
            </p>
          }
        </section>
      } @else {
        <section
          class="rounded-[22px] border border-base-300 p-5"
          data-glass-surface="content"
        >
          <h2 class="text-lg font-semibold">Start a workspace analysis</h2>
          <p class="mt-1 text-sm text-base-content-muted">
            Review the project structure, architecture, and quality.
          </p>
          <button
            type="button"
            [ptahSetupAction]="setupReady() ? 'primaryFull' : 'plainFull'"
            [disabled]="!setupReady()"
            data-testid="start-analysis-button"
            (click)="startFresh()"
          >
            <lucide-angular
              [img]="icons.play"
              class="size-4"
              aria-hidden="true"
            />Start analysis
          </button>
          @if (setupInvalid()) {
            <p
              class="mt-2 text-sm text-base-content-muted"
              data-testid="setup-start-hint"
            >
              Choose a valid Setup model to start.
            </p>
          }
        </section>
      }

      @if (savedError() || visibleSaved().length || selectError()) {
        <section
          class="rounded-[22px] border border-base-300 p-5"
          data-glass-surface="content"
        >
          <h2 class="text-lg font-semibold">Saved analyses</h2>
          @if (savedError()) {
            <p class="text-sm text-state-err" role="alert">
              Saved analyses could not be loaded. Try again.
            </p>
            <button
              type="button"
              [ptahSetupAction]="'ghost'"
              (click)="loadSaved()"
            >
              Retry
            </button>
          }
          <ul class="mt-3 space-y-2">
            @for (item of visibleSaved(); track item.filename) {
              <li
                class="flex flex-wrap items-center gap-3 rounded-[10px] border border-base-300 p-3"
                data-glass-surface="tile"
              >
                <div class="min-w-0 w-full min-[720px]:flex-1">
                  <p class="font-medium">{{ item.projectType }}</p>
                  <p class="text-xs text-base-content-muted">
                    {{ item.savedAt | date: 'medium' }} ·
                    {{ duration(item.durationMs) }}
                  </p>
                </div>
                <button
                  type="button"
                  [ptahSetupAction]="'primaryCompact'"
                  [disabled]="isAnalysisActive()"
                  (click)="useSaved(item.filename)"
                >
                  Use
                </button>
                <button
                  type="button"
                  [ptahSetupAction]="'ghost'"
                  (click)="store.hideAnalysis(item.filename)"
                >
                  Hide from list
                </button>
              </li>
            }
          </ul>
          @if (selectError()) {
            <p class="mt-2 text-sm text-state-err" role="alert">
              {{ selectError() }}
            </p>
          }
        </section>
      }
      <ptah-confirmation-modal
        #stopModal
        title="Stop analysis?"
        message="You can continue an unfinished analysis later."
        confirmText="Stop analysis"
        confirmClass="btn-error"
        (confirmed)="stop()"
      />
    </section>
  `,
})
export class AnalyzeWorkspacePage implements OnInit, OnDestroy {
  public readonly analysis = input<string | undefined>();
  public readonly rerun = input<string | undefined>();
  protected readonly store = inject(AnalysisStepStore);
  protected readonly runner = inject(WizardAnalysisRunner);
  private readonly rpc = inject(WizardRpcService);
  private readonly claudeRpc = inject(ClaudeRpcService);
  private readonly injector = inject(Injector);
  private readonly appState = resolveOptionalAppState(this.injector);
  private readonly workspace = resolveOptionalWorkspaceStore(this.injector);
  private readonly ngZone = inject(NgZone);
  private readonly doc = inject(DOCUMENT);
  private readonly wizardState = inject(SetupWizardStateService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private destroyed = false;
  private pendingAnalysis: string | null = null;
  private pendingRerun = false;
  private setupAbort: AbortController | null = null;
  private setupRequestSeq = 0;
  private savedRequestSeq = 0;
  private setupRefreshQueued = false;
  private lastView: ViewType | null = null;
  protected readonly stopModal =
    viewChild.required<ConfirmationModalComponent>('stopModal');
  protected readonly steps: readonly OnboardingStep[] = [
    { id: 'analyze', label: 'Analyze', state: 'current' },
    { id: 'skills', label: 'Review skills', state: 'upcoming' },
    { id: 'guidance', label: 'Project guidance', state: 'upcoming' },
    { id: 'done', label: 'Done', state: 'upcoming' },
  ];
  protected readonly interrupted = signal(false);
  protected readonly savedError = signal(false);
  protected readonly setupState = signal<SetupPairState | null>(null);
  protected readonly setupUpdating = signal(false);
  protected readonly setupRefreshing = signal(false);
  protected readonly setupReadFailed = signal(false);
  protected readonly setupActionError = signal<string | null>(null);
  protected readonly setupIssue = computed(() =>
    describeSetupIssue(this.setupState()),
  );
  protected readonly setupInvalid = computed(() => this.setupIssue() !== null);
  protected readonly setupReady = computed(() => {
    const kind = this.setupState()?.kind;
    return (
      (kind === 'set' || kind === 'unset') &&
      !this.setupRefreshing() &&
      !this.setupUpdating() &&
      !this.setupReadFailed()
    );
  });
  protected readonly setupBadgeLabel = computed(() => {
    const state = this.setupState();
    if (!state) return '';
    return state.kind === 'unset'
      ? 'Default'
      : state.kind === 'set'
        ? 'Set'
        : 'Needs attention';
  });
  protected readonly setupBadgeTone = computed<'neutral' | 'info' | 'err'>(
    () => {
      const state = this.setupState();
      if (state?.kind === 'set') return 'info';
      return state?.kind === 'invalid' || state?.kind === 'unavailable'
        ? 'err'
        : 'neutral';
    },
  );
  protected readonly setupPairText = computed(() => {
    const state = this.setupState();
    if (!state) return '';
    if (state.kind === 'unset') {
      return `${formatProviderDisplayName(state.effective.provider)} / ${state.effective.model}`;
    }
    if (state.kind === 'set') {
      return `${formatProviderDisplayName(state.pair.provider)} / ${state.pair.model}`;
    }
    const providerLabel = state.provider
      ? formatProviderDisplayName(state.provider)
      : 'No provider';
    return `${providerLabel} / ${state.model || 'No model'}`;
  });
  protected readonly setupHintText = computed<string | null>(() => {
    const state = this.setupState();
    if (!state) return null;
    if (state.kind === 'unset') {
      return 'Default: uses the workspace provider and selected model for setup.';
    }
    if (state.kind === 'set') {
      return 'Used for project analysis, skill review, agent generation, and guidance.';
    }
    return state.source === 'setup'
      ? 'Configured Setup model cannot be used until fixed or cleared.'
      : 'Workspace model cannot be used for setup until fixed.';
  });
  protected readonly workspacePath = computed(
    () => this.workspace?.activePath() ?? null,
  );
  protected readonly isAnalysisActive = computed(() => {
    if (typeof this.runner.isRunningForWorkspace === 'function') {
      return this.runner.isRunningForWorkspace(this.workspacePath());
    }
    return this.runner.isRunning() || this.runner.isCanceling();
  });
  protected readonly isAnalysisCanceling = computed(
    () => this.isAnalysisActive() && this.runner.isCanceling(),
  );
  protected readonly isAnalysisRunning = computed(
    () => this.isAnalysisActive() && this.runner.isRunning(),
  );
  protected readonly analysisError = computed<string | null>(() => {
    if (
      typeof this.runner.isResultForWorkspace === 'function' &&
      !this.runner.isResultForWorkspace(this.workspacePath())
    ) {
      return null;
    }
    const runnerError = this.runner.errorMessage();
    if (runnerError) return runnerError;
    if (this.store.selected()) return null;
    const liveResult = this.wizardState.multiPhaseResult?.();
    if (liveResult?.manifest.lifecycle === 'failed') {
      return 'Analysis could not finish. Try again.';
    }
    return null;
  });
  protected readonly visibleSaved = computed(() =>
    this.store
      .saved()
      .filter(
        (item) =>
          !this.store.hidden().has(item.filename) &&
          item.isActive !== true &&
          (item.lifecycle === undefined || item.lifecycle === 'completed'),
      ),
  );
  protected readonly selectError = signal<string | null>(null);
  protected readonly stopRecovery = signal(false);
  protected readonly showSetupSection = computed(
    () => !this.isAnalysisActive() || this.stopRecovery(),
  );
  // Analysis has no workflow view state; map its runner status for RunPanel recovery.
  protected readonly viewState = computed<GenerationViewState>(() =>
    this.stopRecovery()
      ? 'stop-unconfirmed'
      : this.isAnalysisCanceling()
        ? 'cancelling'
        : this.isAnalysisRunning()
          ? 'running'
          : this.analysisError()
            ? 'failed'
            : this.store.loaded()
              ? 'completed'
              : 'idle',
  );
  private readonly openedAt = signal<number | null>(null);
  private readonly clock = inject(ClockService);
  private readonly now = this.clock.now;
  private releaseClock: (() => void) | null = null;
  protected readonly elapsedSeconds = computed(() => {
    const opened = this.openedAt();
    return opened === null
      ? null
      : Math.max(0, Math.floor((this.now() - opened) / 1000));
  });
  protected readonly icons = {
    scan: ScanSearch,
    play: Play,
    external: ArrowUpRight,
  } as const;

  public constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.setupAbort?.abort();
      this.setupAbort = null;
    });
    const win = this.doc.defaultView;
    if (win) {
      const onFocus = (): void => {
        if (!this.destroyed) void this.refreshSetupModel();
      };
      win.addEventListener('focus', onFocus);
      this.destroyRef.onDestroy(() =>
        win.removeEventListener('focus', onFocus),
      );
    }
    if (this.appState) {
      const appState = this.appState;
      effect(() => {
        const view = appState.currentView();
        const prev = this.lastView;
        this.lastView = view;
        if (prev === 'settings' && view === 'onboarding') {
          void this.refreshSetupModel();
        }
      });
    }
    effect(() => {
      const path = this.workspacePath();
      untracked(() => {
        this.store.setWorkspacePath?.(path);
        this.runner.setCurrentWorkspacePath?.(path);
      });
    });
    effect(() => {
      if (this.openedAt() !== null && !this.isAnalysisActive()) {
        this.stopClock();
      }
    });
    let wasRunning = false;
    effect(() => {
      const running = this.isAnalysisRunning();
      if (wasRunning && !running) {
        untracked(() => {
          if (this.store.loaded()) {
            this.interrupted.set(false);
          }
          if (!this.destroyed) {
            void this.loadSaved();
          }
        });
      }
      wasRunning = running;
    });
  }

  public async ngOnInit(): Promise<void> {
    this.runner.setCurrentWorkspacePath?.(this.workspacePath());
    this.pendingRerun = this.rerun() === '1';
    const hadLocalRun = this.isAnalysisActive();
    const initialRunGeneration = this.runner.runGeneration?.() ?? 0;
    const hadResult = this.runner.hasResult?.() ?? false;
    const hadLoaded = this.store.loaded() !== null;
    if (hadLocalRun) {
      this.pendingRerun = false;
      this.interrupted.set(false);
      this.startClock(this.runner.startedAt?.() ?? undefined);
      if (this.rerun() === '1') {
        void this.router.navigate([], {
          queryParams: { rerun: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    }
    const setup = this.refreshSetupModel();
    if (this.pendingRerun) {
      await Promise.all([setup, this.loadSaved()]);
      return;
    }
    this.pendingAnalysis = this.analysis() ?? null;
    await this.loadSaved();
    if (this.destroyed) return;
    const resumable = await this.rpc.getResumableRun();
    if (this.destroyed) return;
    const localRunSettled =
      (this.runner.runGeneration?.() ?? 0) !== initialRunGeneration ||
      (!hadResult && (this.runner.hasResult?.() ?? false)) ||
      (!hadLoaded && this.store.loaded() !== null);
    if (resumable.analysisActive === true) {
      if (!hadLocalRun && !localRunSettled && !this.runner.isRunning()) {
        this.runner.syncBackendActive?.(true, {
          startedAt: resumable.activeAnalysisStartedAt,
          workspacePath: this.workspacePath(),
        });
        const startedAtMs =
          this.runner.startedAt?.() ??
          (resumable.activeAnalysisStartedAt
            ? Date.parse(resumable.activeAnalysisStartedAt)
            : undefined);
        this.startClock(
          typeof startedAtMs === 'number' && Number.isFinite(startedAtMs)
            ? startedAtMs
            : undefined,
        );
        this.interrupted.set(false);
      }
    } else {
      if (
        resumable.analysisActive === false &&
        this.isAnalysisActive() &&
        (this.runner.backendActive?.() === true ||
          this.runner.backendActive === undefined)
      ) {
        this.runner.syncBackendActive?.(false);
      }
      this.interrupted.set(
        !this.isAnalysisActive() &&
          resumable.analysis !== null &&
          resumable.analysis?.manifest.lifecycle !== 'completed',
      );
    }
  }

  public ngOnDestroy(): void {
    this.store.detachStream();
    this.stopClock();
  }

  protected async refreshSetupModel(): Promise<void> {
    if (this.setupUpdating()) {
      this.setupRefreshQueued = true;
      return;
    }
    this.setupAbort?.abort();
    const controller = new AbortController();
    this.setupAbort = controller;
    const seq = ++this.setupRequestSeq;
    this.setupRefreshing.set(true);
    try {
      const response = await this.ngZone.runOutsideAngular(() =>
        this.claudeRpc.call(
          'wizard:get-setup-model',
          {},
          { signal: controller.signal },
        ),
      );
      if (this.destroyed || seq !== this.setupRequestSeq) return;
      this.ngZone.run(() => {
        if (response.isSuccess()) {
          const state = response.data.state;
          this.setupState.set(state);
          this.setupReadFailed.set(false);
          // A failed "Use workspace model" write is stale once Setup is healthy
          // or already follows the workspace model (Settings cleared it).
          if (
            state.kind === 'set' ||
            state.kind === 'unset' ||
            state.source === 'workspace'
          ) {
            this.setupActionError.set(null);
          }
        } else {
          this.setupReadFailed.set(true);
        }
      });
    } catch {
      // degradation-audit: reported - setupReadFailed shows the Setup model retry alert.
      if (this.destroyed || seq !== this.setupRequestSeq) return;
      this.ngZone.run(() => this.setupReadFailed.set(true));
    } finally {
      if (!this.destroyed && seq === this.setupRequestSeq) {
        this.setupAbort = null;
        this.ngZone.run(() => this.setupRefreshing.set(false));
      }
    }
    await this.ngZone.run(() => this.startPendingRerun());
  }

  protected openSetupSettings(providerId?: string): void {
    if (!this.appState) return;
    this.appState.requestSettingsTab({
      tab: 'providers',
      section: 'setup',
      ...(providerId ? { providerId } : {}),
    });
    this.appState.setCurrentView('settings');
  }

  protected runSetupIssueAction(issue: SetupCardIssue): void {
    if (issue.action === 'retry') {
      void this.refreshSetupModel();
      return;
    }
    this.openSetupSettings(
      issue.action === 'sign-in' && issue.provider ? issue.provider : undefined,
    );
  }

  protected async useWorkspaceModel(): Promise<void> {
    if (this.setupUpdating()) return;
    this.setupUpdating.set(true);
    this.setupActionError.set(null);
    this.setupRequestSeq++;
    this.setupAbort?.abort();
    this.setupAbort = null;
    this.setupRefreshing.set(false);
    try {
      const response = await this.claudeRpc.call('wizard:set-setup-model', {
        provider: '',
        model: '',
      });
      if (this.destroyed) return;
      if (!response.isSuccess()) {
        this.setupActionError.set(
          'Could not switch to the workspace model. Try again.',
        );
        return;
      }
      this.setupState.set(response.data.state);
      this.setupReadFailed.set(false);
    } catch {
      if (!this.destroyed) {
        this.setupActionError.set(
          'Could not switch to the workspace model. Try again.',
        );
      }
    } finally {
      if (!this.destroyed) {
        this.setupUpdating.set(false);
        if (this.setupRefreshQueued) {
          this.setupRefreshQueued = false;
          await this.refreshSetupModel();
        } else {
          await this.startPendingRerun();
        }
      }
    }
  }

  protected safeError(raw: string): string {
    return safeFailureCopy(raw, 'Analysis could not finish. Try again.');
  }
  protected duration(ms: number): string {
    return `${Math.round(ms / 1000)}s`;
  }
  protected async loadSaved(): Promise<void> {
    const seq = ++this.savedRequestSeq;
    try {
      await this.store.listAnalyses();
    } catch {
      // degradation-audit: reported - savedError shows the saved analyses retry alert.
      if (!this.destroyed && seq === this.savedRequestSeq) {
        this.savedError.set(true);
      }
      return;
    }
    if (this.destroyed || seq !== this.savedRequestSeq) return;
    this.savedError.set(false);
    const filename = this.pendingAnalysis;
    this.pendingAnalysis = null;
    if (
      filename &&
      !this.isAnalysisActive() &&
      this.store.saved().some((item) => item.filename === filename)
    )
      await this.useSaved(filename);
  }
  protected async useSaved(filename: string): Promise<void> {
    if (this.isAnalysisActive()) return;
    try {
      const [, result] = await Promise.all([
        this.consumePendingRerun(),
        this.store.selectAnalysis(filename),
      ]);
      if (this.destroyed || result === 'superseded') return;
      this.selectError.set(
        result === 'loaded'
          ? null
          : result === 'not-found'
            ? 'That analysis is no longer available.'
            : 'The analysis could not be loaded. Try again.',
      );
      if (result === 'loaded')
        await this.router.navigate([], {
          queryParams: { analysis: filename },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
    } catch {
      if (!this.destroyed)
        this.selectError.set('The analysis could not be loaded. Try again.');
    }
  }
  private async startPendingRerun(): Promise<void> {
    if (!this.pendingRerun || this.destroyed) return;
    if (this.isAnalysisActive()) {
      await this.consumePendingRerun();
      return;
    }
    if (!this.setupReady()) return;
    await this.startFresh();
  }
  private async consumePendingRerun(): Promise<void> {
    if (!this.pendingRerun) return;
    this.pendingRerun = false;
    await this.router.navigate([], {
      queryParams: { rerun: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  protected async startFresh(): Promise<void> {
    if (!this.setupReady()) return;
    const rerunNavigation = this.consumePendingRerun();
    this.pendingAnalysis = null;
    this.wizardState.reset();
    this.runner.reset();
    this.stopRecovery.set(false);
    this.store.clearSelection();
    this.interrupted.set(false);
    this.startClock();
    await Promise.all([
      this.runner.startFreshAnalysis(this.workspacePath()),
      rerunNavigation,
    ]);
    if (this.destroyed) return;
    await this.loadSaved();
  }
  protected async continuePrevious(): Promise<void> {
    if (!this.setupReady()) return;
    const rerunNavigation = this.consumePendingRerun();
    this.pendingAnalysis = null;
    const existingResult = this.wizardState.multiPhaseResult?.();
    if (existingResult && existingResult.manifest.lifecycle !== 'completed') {
      this.wizardState.reset();
    }
    this.store.clearSelection();
    this.interrupted.set(false);
    this.stopRecovery.set(false);
    this.startClock();
    await Promise.all([
      this.runner.resumeAnalysis(this.workspacePath()),
      rerunNavigation,
    ]);
    if (this.destroyed) return;
    await this.loadSaved();
  }
  protected async retry(): Promise<void> {
    await this.continuePrevious();
  }
  protected confirmStop(): void {
    this.stopModal().show();
  }
  protected async stop(): Promise<void> {
    try {
      await this.runner.cancel();
      this.stopRecovery.set(false);
    } catch {
      this.stopRecovery.set(true);
    } finally {
      this.store.detachStream();
      this.stopClock();
    }
  }
  private startClock(startedAt?: number): void {
    if (!this.releaseClock) {
      this.releaseClock = this.clock.acquire();
    }
    this.store.attachStream();
    this.openedAt.set(startedAt ?? this.now());
  }
  private stopClock(): void {
    this.releaseClock?.();
    this.releaseClock = null;
    this.openedAt.set(null);
  }
  protected async reviewSkills(): Promise<void> {
    const identity = {
      analysis: this.store.selected() ?? this.store.loaded()?.manifest.slug,
    };
    const link = onboardingStepLink('analyze', 'skills', identity);
    await this.router.navigate([...link.commands], {
      queryParams: link.queryParams,
      state: { explicitBack: false },
    });
  }
}
