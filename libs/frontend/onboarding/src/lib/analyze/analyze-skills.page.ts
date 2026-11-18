import {
  afterNextRender,
  Injector,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ClaudeRpcService, VSCodeService } from '@ptah-extension/core';
import { TabManagerService } from '@ptah-extension/chat-state';
import type { WizardRecommendAnalysisSkillsResult } from '@ptah-extension/shared';
import { PtahButtonDirective } from '@ptah-extension/ui';
import { WizardRpcService } from '@ptah-extension/setup-wizard';
import { StackSkillStore } from '../proposal/stack-skill.store';
import { StackSkillConsentComponent } from '../proposal/stack-skill-consent.component';
import { StackSkillReviewComponent } from '../proposal/stack-skill-review.component';
import { AnalysisStepStore } from './analysis-step.store';

@Component({
  selector: 'ptah-analyze-skills-page',
  standalone: true,
  imports: [
    StackSkillReviewComponent,
    StackSkillConsentComponent,
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
      } @else {
        <ptah-stack-skill-review
          [headingLevel]="1"
          [showOwnerDecision]="false"
          [busy]="leaving()"
          [recommendations]="state.recommendations()"
          [searchResults]="state.searchResults()"
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
          [backOnLoadError]="!canRetry()"
          [searchError]="state.searchError()"
          [query]="state.searchQuery()"
          (selectionToggled)="toggleSelection($event)"
          (queryChange)="state.setSearchQuery($event)"
          (selectionResetDismissed)="dismissSelectionReset()"
          (retryRequested)="retry()"
          (searchRequested)="search($event)"
          (searchCleared)="clearSearch()"
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
  private readonly loadErrorState = signal(true);
  public readonly loadError = this.loadErrorState.asReadonly();
  private readonly skillsInstalledState = signal(false);
  public readonly skillsInstalled = this.skillsInstalledState.asReadonly();
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly rpc = inject(ClaudeRpcService);
  private readonly workspace = inject(VSCodeService);
  private readonly tabs = inject(TabManagerService);
  private readonly analysis = inject(AnalysisStepStore);
  private readonly destroyRef = inject(DestroyRef);
  public readonly state = inject(StackSkillStore);
  private readonly wizardRpc = inject(WizardRpcService);
  public readonly summary = signal<WizardRecommendAnalysisSkillsResult | null>(
    null,
  );
  private readonly leavingState = signal(false);
  public readonly leaving = this.leavingState.asReadonly();
  public readonly canRetry = computed(() =>
    Boolean(this.analysis.loaded()?.manifest.runId),
  );
  private readonly selectionResetState = signal(false);
  public readonly selectionReset = this.selectionResetState.asReadonly();
  private version = 0;
  private searchVersion = 0;
  private identity = '\u0000';

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
      this.selectionResetState.set(false);
      this.state.reset();
      this.skillsInstalledState.set(false);
      if (!runId) this.state.setError('Choose a completed analysis first.');
      else if (root) void this.load(runId, this.version);
    });
    this.destroyRef.onDestroy(() => this.version++);
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

  private async load(
    runId: string,
    version: number,
    rerun = false,
  ): Promise<void> {
    this.loadErrorState.set(true);
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
      if (version !== this.version) return;
      if (!response.isSuccess()) throw new Error('Registry unavailable');
      this.selectionResetState.set(rerun);
      this.summary.set(response.data);
      this.state.setRecommendations(response.data.skills);
      this.state.setSelectedIds(
        new Set(
          response.data.skills.map(
            ({ skill }) => `${skill.source}/${skill.skillId}`,
          ),
        ),
      );
      this.loadErrorState.set(false);
      this.state.setStage('review');
    } catch {
      if (version === this.version)
        this.state.setError(
          'Could not find skills. Try again or skip this step.',
        );
    } finally {
      if (version === this.version) this.state.setLoading(false);
    }
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
    if (!runId || this.leaving()) return;
    this.searchVersion++;
    this.state.setSearching(false);
    this.state.setSearchError(null);
    void this.load(runId, ++this.version, true);
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

  public async preview(): Promise<void> {
    if (this.skillsInstalled()) {
      await this.continueToGuidance();
      return;
    }
    if (this.state.loading() || this.state.previewing() || this.leaving())
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
      this.state.setPreview(response.data.skills);
      this.state.setApprovedIds(new Set());
      this.state.setStage('consent');
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
    this.state.setStage('review');
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

  public async continueToGuidance(): Promise<void> {
    if (this.leaving()) return;
    this.leavingState.set(true);
    try {
      const tab = this.tabs.createTab('Project guidance');
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
      if (!this.destroyRef.destroyed) {
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
