import {
  afterNextRender,
  Injector,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AppStateManager,
  ClaudeRpcService,
  VSCodeService,
} from '@ptah-extension/core';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  getAnthropicProvider,
  type SetupPairState,
  type WizardRecommendAnalysisSkillsResult,
} from '@ptah-extension/shared';
import { PtahAlertComponent, PtahButtonDirective } from '@ptah-extension/ui';
import { WizardRpcService } from '@ptah-extension/setup-wizard';
import { StackSkillStore } from '../proposal/stack-skill.store';
import { StackSkillConsentComponent } from '../proposal/stack-skill-consent.component';
import {
  StackSkillReviewComponent,
  type SkillDraftCreateAction,
  type SkillDraftPreviewAction,
} from '../proposal/stack-skill-review.component';
import { OnboardingRunPillService } from '../shell/onboarding-run-pill.service';
import { AnalysisStepStore } from './analysis-step.store';

type SetupRecoveryAction =
  | 'choose-provider'
  | 'choose-model'
  | 'sign-in'
  | 'retry';

export interface SetupBlockView {
  readonly message: string;
  readonly actionLabel: string;
  readonly action: SetupRecoveryAction;
  readonly provider: string | null;
  readonly source: 'setup' | 'workspace';
  readonly hasPriorResult: boolean;
}

function formatProviderDisplayName(id: string): string {
  const meta = getAnthropicProvider(id);
  if (meta?.name) return meta.name;
  return id.toLowerCase() === 'openai' ? 'OpenAI' : id;
}

function buildSetupBlock(
  state: SetupPairState,
  hasPriorResult: boolean,
): SetupBlockView | null {
  if (state.kind === 'set' || state.kind === 'unset') return null;
  const providerName = state.provider
    ? formatProviderDisplayName(state.provider)
    : 'the selected provider';
  const subject = state.source === 'setup' ? 'Setup' : 'The workspace model';
  const suffix = hasPriorResult
    ? ' Your previous results remain visible below.'
    : '';
  const base = {
    provider: state.provider,
    source: state.source,
    hasPriorResult,
  };
  if (state.kind === 'unavailable') {
    return {
      ...base,
      message: `${subject} could not reach ${providerName}.${suffix}`,
      actionLabel: 'Retry',
      action: 'retry',
    };
  }
  if (state.cause === 'not-signed-in') {
    const scope = state.source === 'setup' ? 'Setup' : 'the workspace model';
    return {
      ...base,
      message: `${providerName} is not signed in for ${scope}.${suffix}`,
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
      message: `${subject} ${detail}.${suffix}`,
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
    message: `${subject} ${detail}.${suffix}`,
    actionLabel: 'Choose a provider',
    action: 'choose-provider',
  };
}

function fallbackSetupBlock(hasPriorResult: boolean): SetupBlockView {
  const suffix = hasPriorResult
    ? ' Your previous results remain visible below.'
    : '';
  return {
    message: `Setup model needs attention before finding skills.${suffix}`,
    actionLabel: 'Choose a model',
    action: 'choose-model',
    provider: null,
    source: 'setup',
    hasPriorResult,
  };
}

@Component({
  selector: 'ptah-analyze-skills-page',
  standalone: true,
  imports: [
    StackSkillReviewComponent,
    StackSkillConsentComponent,
    PtahAlertComponent,
    PtahButtonDirective,
  ],
  providers: [StackSkillStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      aria-labelledby="skill-review-title"
      data-testid="analyze-skills-page"
    >
      @if (skillsInstalled()) {
        <h1 id="skill-review-title" tabindex="-1">Skills installed</h1>
        <p role="alert">{{ state.error() }}</p>
        <button
          ptahButton
          variant="ghost"
          type="button"
          [disabled]="leaving()"
          (click)="back()"
        >
          Back
        </button>
        <button
          ptahButton
          variant="primary"
          type="button"
          [busy]="leaving()"
          data-testid="guidance-continue"
          (click)="continueToGuidance()"
        >
          Continue to Project guidance
        </button>
      } @else if (setupBlock() && !summary()) {
        @if (setupBlock(); as block) {
          <div class="space-y-4 p-4">
            <header class="flex items-start gap-3">
              <button
                ptahButton
                variant="ghost"
                type="button"
                [disabled]="leaving()"
                (click)="back()"
              >
                Back
              </button>
              <div>
                <h1
                  id="skill-review-title"
                  tabindex="-1"
                  class="text-xl font-semibold"
                >
                  Choose skills for your stack
                </h1>
                <p class="text-sm text-base-content-muted">
                  Choose skills for this project. You can continue without
                  installing any.
                </p>
              </div>
            </header>
            <ptah-alert
              tone="error"
              live="assertive"
              data-testid="setup-model-blocked"
            >
              {{ block.message }}
              <button
                alertAction
                ptahButton
                variant="secondary"
                size="sm"
                type="button"
                data-testid="setup-model-recovery-action"
                (click)="runSetupRecovery(block)"
              >
                {{ block.actionLabel }}
              </button>
            </ptah-alert>
            <div class="flex flex-wrap gap-2">
              <button
                ptahButton
                variant="ghost"
                type="button"
                [disabled]="leaving()"
                (click)="continueToGuidance()"
              >
                Skip skills
              </button>
            </div>
          </div>
        }
      } @else {
        @if (setupBlock(); as block) {
          <div class="px-4 pt-4">
            <ptah-alert
              tone="error"
              live="assertive"
              data-testid="setup-model-blocked"
            >
              {{ block.message }}
              <button
                alertAction
                ptahButton
                variant="secondary"
                size="sm"
                type="button"
                data-testid="setup-model-recovery-action"
                (click)="runSetupRecovery(block)"
              >
                {{ block.actionLabel }}
              </button>
            </ptah-alert>
          </div>
        }
        <ptah-stack-skill-review
          [store]="state"
          [runId]="loadedRunId()"
          [headingLevel]="1"
          [showOwnerDecision]="false"
          [busy]="leaving()"
          [recommendations]="state.recommendations()"
          [searchResults]="state.searchResults()"
          [retainedSearchResults]="state.retainedSearchResults()"
          [guidanceFacts]="[]"
          [selectedIds]="state.selectedIds()"
          [loading]="state.loading()"
          [searching]="state.searching()"
          [previewing]="state.previewing()"
          [previewScriptCount]="state.previewScriptCount()"
          [stackLoading]="state.loading() && !summary()"
          [detectedItems]="summary()?.detectedItems ?? []"
          [unmatchedItems]="summary()?.unmatchedItems ?? []"
          [searchFailures]="summary()?.searchFailures ?? []"
          [summarySource]="summary()?.summarySource ?? null"
          [warning]="summary()?.warning ?? null"
          [selectionReset]="selectionReset()"
          [error]="state.error()"
          [loadError]="loadError()"
          [backOnLoadError]="backOnLoadError()"
          [searchError]="state.searchError()"
          [query]="state.searchQuery()"
          (selectionToggled)="toggleSelection($event)"
          (queryChange)="state.setSearchQuery($event)"
          (selectionResetDismissed)="dismissSelectionReset()"
          (retryRequested)="retry()"
          (searchRequested)="search($event)"
          (itemSearchRequested)="searchForItem($event)"
          (searchCleared)="clearSearch()"
          (draftPreviewRequested)="generateDraftPreview($event)"
          (draftCreateRequested)="createDraft($event)"
          (continueRequested)="preview()"
          (skip)="continueToGuidance()"
          (back)="back()"
        >
          <button
            reviewActions
            ptahButton
            variant="secondary"
            type="button"
            [busy]="state.loading()"
            [title]="!canRetry() ? 'Choose a completed analysis first.' : ''"
            [disabled]="
              state.loading() || !canRetry() || leaving() || state.previewing()
            "
            (click)="retry()"
          >
            Re-run skill search
          </button>
        </ptah-stack-skill-review>
      }
      <ptah-stack-skill-consent
        [open]="state.stage() === 'consent' || state.stage() === 'installing'"
        [previews]="state.preview()"
        [approvedIds]="state.approvedIds()"
        [busy]="state.stage() === 'installing'"
        [error]="state.error()"
        (approve)="state.approve($event)"
        (install)="install()"
        (cancelRequested)="closeConsent()"
      />
    </section>
  `,
})
export class AnalyzeSkillsPage implements OnInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly ngZone = inject(NgZone);
  private readonly loadErrorState = signal(true);
  public readonly loadError = this.loadErrorState.asReadonly();
  private readonly backOnLoadErrorState = signal(false);
  private readonly setupBlockState = signal<SetupBlockView | null>(null);
  public readonly setupBlock = this.setupBlockState.asReadonly();
  private readonly skillsInstalledState = signal(false);
  public readonly skillsInstalled = this.skillsInstalledState.asReadonly();
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly rpc = inject(ClaudeRpcService);
  private readonly workspace = inject(VSCodeService);
  private readonly tabs = inject(TabManagerService);
  private readonly analysis = inject(AnalysisStepStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly appState = inject(AppStateManager);
  private readonly runPill = inject(OnboardingRunPillService);
  public readonly state = inject(StackSkillStore);
  private readonly wizardRpc = inject(WizardRpcService);
  public readonly summary = signal<WizardRecommendAnalysisSkillsResult | null>(
    null,
  );
  private readonly leavingState = signal(false);
  public readonly leaving = this.leavingState.asReadonly();
  public readonly loadedRunId = computed(
    () => this.analysis.loaded()?.manifest.runId ?? '',
  );
  public readonly canRetry = computed(() =>
    Boolean(
      this.analysis.loaded()?.manifest.runId &&
      this.workspace.config().workspaceRoot,
    ),
  );
  public readonly backOnLoadError = computed(
    () => !this.canRetry() || this.backOnLoadErrorState(),
  );
  private readonly selectionResetState = signal(false);
  public readonly selectionReset = this.selectionResetState.asReadonly();
  private version = 0;
  private searchVersion = 0;
  private identity = '\u0000';
  private pendingGuidanceTab: { identity: string; tab: string } | null = null;

  public constructor() {
    effect(() => {
      const runId = this.analysis.loaded()?.manifest.runId ?? '';
      const root = this.workspace.config().workspaceRoot ?? '';
      const key = `${root}\u0000${runId}`;
      if (key === this.identity) return;
      this.identity = key;
      this.version++;
      this.searchVersion++;
      this.summary.set(null);
      this.setupBlockState.set(null);
      this.selectionResetState.set(false);
      this.state.reset();
      this.runPill.clear();
      this.loadErrorState.set(true);
      this.backOnLoadErrorState.set(false);
      this.skillsInstalledState.set(false);
      if (!runId) this.state.setError('Choose a completed analysis first.');
      else if (root) void this.load(runId, this.version);
      else this.state.setError('Open a workspace to find skills.');
    });
    this.destroyRef.onDestroy(() => {
      this.version++;
      this.runPill.clear();
    });
  }

  public ngOnInit(): void {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const slug = params.get('analysis');
        const runId = params.get('run');
        if (slug && this.analysis.selected() !== slug)
          void this.loadSaved(slug);
        else if (!slug && !this.analysis.loaded() && runId)
          void this.loadResumed(runId);
        else if (!this.analysis.loaded())
          this.state.setError('Choose a completed analysis first.');
      });
  }

  private async loadResumed(runId: string): Promise<void> {
    const resumable = await this.wizardRpc.getResumableRun();
    if (
      this.destroyRef.destroyed ||
      this.route.snapshot.queryParamMap.get('run') !== runId
    )
      return;
    const directory =
      resumable.generation?.runId === runId
        ? resumable.generation.analysisDirectory
        : null;
    const slug = directory?.split(/[\\/]/).filter(Boolean).at(-1);
    if (slug) await this.loadSaved(slug);
    else this.state.setError('Choose a completed analysis first.');
  }

  private async loadSaved(slug: string): Promise<void> {
    const root = this.workspace.config().workspaceRoot;
    const routeIdentity = `${this.route.snapshot.queryParamMap.get('analysis') ?? ''}:${this.route.snapshot.queryParamMap.get('run') ?? ''}`;
    const result = await this.analysis.useAnalysis(slug);
    if (
      result !== 'loaded' &&
      result !== 'superseded' &&
      !this.destroyRef.destroyed &&
      root === this.workspace.config().workspaceRoot &&
      routeIdentity ===
        `${this.route.snapshot.queryParamMap.get('analysis') ?? ''}:${this.route.snapshot.queryParamMap.get('run') ?? ''}`
    )
      this.state.setError(
        'That analysis could not be loaded. Choose a completed analysis.',
      );
  }

  private applySetupBlock(block: SetupBlockView): void {
    this.setupBlockState.set(block);
    this.state.setLoading(false);
    if (!this.summary()) {
      this.loadErrorState.set(false);
      this.backOnLoadErrorState.set(false);
      this.state.setError(null);
    }
  }

  private applyLoadFailure(message: string): void {
    this.setupBlockState.set(null);
    this.loadErrorState.set(true);
    this.backOnLoadErrorState.set(true);
    this.state.setError(message);
  }

  private async resolveSetupBlockFromRpc(
    version: number,
    hasPriorResult: boolean,
  ): Promise<void> {
    try {
      const setupResp = await this.rpc.call('wizard:get-setup-model', {});
      if (version !== this.version || this.destroyRef.destroyed) return;
      if (setupResp.isSuccess()) {
        const block = buildSetupBlock(setupResp.data.state, hasPriorResult);
        if (block) {
          this.applySetupBlock(block);
          return;
        }
      }
    } catch {
      if (version !== this.version || this.destroyRef.destroyed) return;
    }
    this.applySetupBlock(fallbackSetupBlock(hasPriorResult));
  }

  private async load(
    runId: string,
    version: number,
    rerun = false,
  ): Promise<void> {
    const hasPriorResult = this.summary() !== null;
    try {
      const setupResp = await this.rpc.call('wizard:get-setup-model', {});
      if (version !== this.version || this.destroyRef.destroyed) return;
      if (!setupResp.isSuccess()) {
        if (setupResp.errorCode === 'SETUP_MODEL_INVALID') {
          this.applySetupBlock(fallbackSetupBlock(hasPriorResult));
          return;
        }
        this.applyLoadFailure('Could not load skill recommendations.');
        return;
      }
      const block = buildSetupBlock(setupResp.data.state, hasPriorResult);
      if (block) {
        this.applySetupBlock(block);
        return;
      }
    } catch {
      if (version !== this.version || this.destroyRef.destroyed) return;
      this.applyLoadFailure('Could not load skill recommendations.');
      return;
    }

    this.setupBlockState.set(null);
    this.loadErrorState.set(!hasPriorResult);
    this.backOnLoadErrorState.set(false);
    this.state.setPreviewing(false);
    this.state.setPreview([]);
    this.state.setLoading(true);
    this.state.setError(null);
    try {
      const response = await this.rpc.call(
        'wizard:recommend-analysis-skills',
        { runId },
        { timeout: 75_000 },
      );
      if (version !== this.version || this.destroyRef.destroyed) return;
      if (!response.isSuccess()) {
        if (response.errorCode === 'SETUP_MODEL_INVALID') {
          await this.resolveSetupBlockFromRpc(version, hasPriorResult);
          return;
        }
        const message =
          response.errorCode === 'ANALYSIS_LOAD_FAILED'
            ? 'Could not read the saved analysis.'
            : 'Could not load skill recommendations.';
        this.applyLoadFailure(message);
        return;
      }
      this.selectionResetState.set(rerun);
      this.summary.set(response.data);
      this.state.applyRecommendationResult(response.data);
      this.runPill.recordRun({
        analysisPair: this.state.analysisPair(),
        stages: response.data.judge.stages,
      });
      this.loadErrorState.set(false);
      this.backOnLoadErrorState.set(false);
      this.state.setStage('review');
    } catch {
      if (version === this.version && !this.destroyRef.destroyed) {
        this.applyLoadFailure('Could not load skill recommendations.');
      }
    } finally {
      if (version === this.version && !this.destroyRef.destroyed) {
        this.state.setLoading(false);
      }
    }
  }

  public runSetupRecovery(block: SetupBlockView): void {
    if (block.action === 'retry') {
      this.retry();
      return;
    }
    this.appState.requestSettingsTab({
      tab: 'providers',
      section: 'setup',
      ...(block.action === 'sign-in' && block.provider
        ? { providerId: block.provider }
        : {}),
    });
    this.appState.setCurrentView('settings');
  }

  public dismissSelectionReset(): void {
    this.selectionResetState.set(false);
  }
  public toggleSelection(key: string): void {
    this.state.toggle(key);
    this.dismissSelectionReset();
  }

  public retry(): void {
    const runId = this.analysis.loaded()?.manifest.runId;
    if (!runId || !this.canRetry() || this.leaving()) return;
    this.searchVersion++;
    this.state.setSearching(false);
    this.state.setSearchError(null);
    this.ngZone.run(() => {
      void this.load(runId, ++this.version, this.summary() !== null);
    });
  }

  public clearSearch(): void {
    this.searchVersion++;
    this.state.setSearchQuery('');
    this.state.setSearchResults([]);
    this.state.setSearching(false);
    this.state.setSearchError(null);
  }
  public async search(query: string): Promise<void> {
    const version = this.version;
    const searchVersion = ++this.searchVersion;
    this.state.setSearchResults([]);
    this.state.setSearching(true);
    this.state.setSearchError(null);
    try {
      const response = await this.rpc.call('wizard:search-skills', { query });
      if (version !== this.version || searchVersion !== this.searchVersion)
        return;
      if (!response.isSuccess()) throw new Error('Search failed');
      this.state.setSearchResults(response.data.skills);
    } catch {
      if (version === this.version && searchVersion === this.searchVersion)
        this.state.setSearchError('Skill search failed. Try again.');
    } finally {
      if (version === this.version && searchVersion === this.searchVersion)
        this.state.setSearching(false);
    }
  }

  public async searchForItem(request: {
    readonly itemId: string;
    readonly query: string;
  }): Promise<void> {
    const query = request.query.trim();
    if (!query) return;
    const version = this.version;
    const searchVersion = ++this.searchVersion;
    this.state.setSearching(true);
    this.state.setSearchError(null);
    try {
      const response = await this.rpc.call('wizard:search-skills', { query });
      if (version !== this.version || searchVersion !== this.searchVersion)
        return;
      if (!response.isSuccess()) throw new Error('Search failed');
      this.state.setItemSearchResults(request.itemId, response.data.skills);
    } catch {
      if (version === this.version && searchVersion === this.searchVersion)
        this.state.setSearchError('Skill search failed. Try again.');
    } finally {
      if (version === this.version && searchVersion === this.searchVersion)
        this.state.setSearching(false);
    }
  }

  public async generateDraftPreview(
    action: SkillDraftPreviewAction,
  ): Promise<void> {
    if (this.state.consentOpen()) return;
    const version = this.version;
    const req = {
      revision: action.revision,
      previewRequestSeq: action.previewRequestSeq,
    };
    const fallback =
      'Could not generate a skill draft. You can write it manually below.';
    try {
      const response = await this.rpc.call(
        'wizard:generate-skill-draft',
        action.params,
        { timeout: 60_000 },
      );
      if (version !== this.version || this.destroyRef.destroyed) return;
      if (!response.isSuccess()) {
        this.state.applyDraftPreviewError(req, fallback);
        return;
      }
      this.state.applyDraftPreviewResult(req, response.data);
    } catch {
      if (version === this.version && !this.destroyRef.destroyed) {
        this.state.applyDraftPreviewError(req, fallback);
      }
    }
  }

  public async createDraft(action: SkillDraftCreateAction): Promise<void> {
    if (this.state.consentOpen()) return;
    const version = this.version;
    const fallback = 'Could not create this skill. Your draft is still here.';
    try {
      const response = await this.rpc.call('harness:create-skill', {
        name: action.submitted.name,
        description: action.submitted.description,
        content: action.submitted.body,
      });
      if (version !== this.version || this.destroyRef.destroyed) return;
      if (!response.isSuccess()) {
        this.state.failCreateDraft(action.revision, fallback);
        return;
      }
      this.state.completeCreateDraft(action.revision, response.data.skillPath);
    } catch {
      if (version === this.version && !this.destroyRef.destroyed) {
        this.state.failCreateDraft(action.revision, fallback);
      }
    }
  }

  public async preview(): Promise<void> {
    if (this.skillsInstalled()) {
      await this.continueToGuidance();
      return;
    }
    if (
      this.state.loading() ||
      this.state.previewing() ||
      this.leaving() ||
      this.state.draftOpen()
    )
      return;
    if (!this.state.selectedIds().size) {
      await this.continueToGuidance();
      return;
    }
    const version = this.version;
    this.loadErrorState.set(false);
    this.state.setPreviewing(true);
    this.state.setError(null);
    try {
      const response = await this.rpc.call(
        'wizard:preview-skills-for-consent',
        { skills: [...this.state.selectedIds()] },
      );
      if (version !== this.version) return;
      if (
        !response.isSuccess() ||
        response.data.skills.length !== this.state.selectedIds().size ||
        response.data.skills.some(
          (item) =>
            !this.state.selectedIds().has(item.skillName) || !item.contentHash,
        )
      )
        throw new Error('Preview incomplete');
      this.state.openConsent(response.data.skills);
    } catch {
      if (version === this.version)
        this.state.setError('Could not preview skills. Try again.');
    } finally {
      if (version === this.version) this.state.setPreviewing(false);
    }
  }

  public async install(): Promise<void> {
    if (this.skillsInstalled()) return;
    const previews = this.state.preview();
    if (
      this.state.stage() === 'installing' ||
      !previews.length ||
      previews.some(
        (item) =>
          item.hasScripts && !this.state.approvedIds().has(item.skillName),
      )
    )
      return;
    const version = this.version;
    this.state.setStage('installing');
    const consentDate = new Date().toISOString();
    try {
      const response = await this.rpc.call(
        'wizard:install-skills-with-consent',
        {
          skills: previews.map((item) => item.skillName),
          consentRecords: previews
            .filter((item) => item.hasScripts)
            .map((item) => ({
              skillName: item.skillName,
              contentHash: item.contentHash,
              consentDate,
            })),
        },
      );
      if (version !== this.version) return;
      if (!response.isSuccess()) throw new Error('Install failed');
      this.state.setInstalled(response.data.installed);
      if (!response.data.success) {
        this.state.setError(
          `Some skills could not be installed. ${response.data.failedSkill ?? ''}`,
        );
        this.closeConsent();
        return;
      }
      this.skillsInstalledState.set(true);
      await this.continueToGuidance();
    } catch {
      if (version === this.version) {
        this.state.setError('Could not install skills. Try again.');
        this.closeConsent();
      }
    }
  }

  public closeConsent(): void {
    if (this.state.stage() === 'consent') this.state.closeConsent();
    else if (this.state.stage() === 'installing') this.state.setStage('review');
    afterNextRender(
      () => {
        if (!this.destroyRef.destroyed)
          this.host.nativeElement
            .querySelector<HTMLElement>(
              '[data-testid="skill-install-primary"], [data-testid="guidance-continue"]',
            )
            ?.focus();
      },
      { injector: this.injector },
    );
  }

  private guidanceIdentity(): string {
    return `${this.identity}:${this.route.snapshot.queryParamMap.get('analysis') ?? ''}:${this.route.snapshot.queryParamMap.get('run') ?? ''}`;
  }

  public async continueToGuidance(): Promise<void> {
    if (this.leaving()) return;
    this.leavingState.set(true);
    const identity = this.guidanceIdentity();
    try {
      const tab =
        this.pendingGuidanceTab?.identity === identity
          ? this.pendingGuidanceTab.tab
          : this.tabs.createTab('Project guidance');
      this.pendingGuidanceTab = { identity, tab };
      this.tabs.setWorkflow(tab, 'setup-project-prompt');
      const navigated = await this.router.navigate(
        ['/onboarding/analyze/guidance'],
        {
          queryParams: {
            analysis: this.route.snapshot.queryParamMap.get('analysis'),
            tab,
          },
        },
      );
      if (!navigated) throw new Error('Navigation cancelled');
    } catch {
      if (!this.destroyRef.destroyed && identity === this.guidanceIdentity()) {
        this.loadErrorState.set(false);
        this.state.setError(
          this.skillsInstalled()
            ? 'Skills are installed. Could not open the next step. Try again.'
            : 'Could not open Project guidance. Try again.',
        );
        this.closeConsent();
      }
    } finally {
      this.leavingState.set(false);
    }
  }
  public async back(): Promise<void> {
    await this.router.navigate(['/onboarding/analyze']);
  }
}
