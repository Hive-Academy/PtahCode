import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
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
import { ProjectSkillDraftComponent } from './project-skill-draft.component';

@Component({
  selector: 'ptah-analyze-skills-page',
  standalone: true,
  imports: [StackSkillReviewComponent, StackSkillConsentComponent, ProjectSkillDraftComponent, PtahButtonDirective],
  providers: [StackSkillStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-[760px] space-y-5 p-4" aria-labelledby="analyze-skills-title" data-testid="analyze-skills-page">
      <h1 id="analyze-skills-title" class="text-2xl font-semibold">Review skills</h1>
      @if (summary(); as result) {
        <section aria-label="Detected project stack" class="space-y-2">
          <h2 class="font-semibold">Detected in your project</h2>
          @for (item of result.detectedItems; track item.kind + item.name) {
            <p class="rounded-lg border border-base-300 p-3"><strong>{{ item.name }}</strong> · {{ item.kind }}<br /><span class="text-sm">{{ item.evidence }}</span></p>
          }
          @if (result.summarySource === 'none') { <p>No stack summary was found for this analysis.</p> }
          @if (result.warning) { <p role="status">{{ result.warning }}</p> }
        </section>
        @if (result.searchFailures.length) {
          <section aria-label="Skill search failures"><h2 class="font-semibold">Search issues</h2>
            @for (failure of result.searchFailures; track failure.item) { <p>{{ failure.item }}: {{ failure.reason }}</p> }
          </section>
        }
        @if (result.unmatchedItems.length) {
          <section aria-label="Unmatched project stack" class="space-y-3"><h2 class="font-semibold">No matching registry skill</h2>
            @for (item of result.unmatchedItems; track item.kind + item.name) {
              <p>{{ item.name }} · {{ item.kind }}</p>
              @if (item.kind === 'framework' || item.kind === 'pattern') { <ptah-project-skill-draft [item]="item" /> }
            }
          </section>
        }
      }
      <button ptahButton variant="ghost" type="button" [disabled]="state.loading() || !canRetry() || leaving()" (click)="retry()">Re-run skill search</button>
      @if (selectionReset()) { <p role="status">Skill selection was reset to the new recommendations.</p> }
      <ptah-stack-skill-review
        [showOwnerDecision]="false" [busy]="leaving()"
        [recommendations]="state.recommendations()" [searchResults]="state.searchResults()" [guidanceFacts]="[]"
        [selectedIds]="state.selectedIds()" [loading]="state.loading()" [searching]="state.searching()"
        [error]="state.error()" [searchError]="state.searchError()" [query]="state.searchQuery()"
        (selectionToggled)="state.toggle($event)" (queryChange)="state.searchQuery.set($event)"
        (searchRequested)="search($event)" (continueRequested)="preview()" (skip)="continueToGuidance()"
        (back)="back()" />
      <ptah-stack-skill-consent [open]="state.stage() === 'consent' || state.stage() === 'installing'"
        [previews]="state.preview()" [approvedIds]="state.approvedIds()" [busy]="state.stage() === 'installing'"
        [error]="state.error()" (approve)="state.approve($event)" (install)="install()"
        (cancelRequested)="state.stage.set('review')" />
    </section>
  `,
})
export class AnalyzeSkillsPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly rpc = inject(ClaudeRpcService);
  private readonly workspace = inject(VSCodeService);
  private readonly tabs = inject(TabManagerService);
  private readonly analysis = inject(AnalysisStepStore);
  private readonly destroyRef = inject(DestroyRef);
  readonly state = inject(StackSkillStore);
  private readonly wizardRpc = inject(WizardRpcService);
  readonly summary = signal<WizardRecommendAnalysisSkillsResult | null>(null);
  private readonly leavingState = signal(false);
  readonly leaving = this.leavingState.asReadonly();
  readonly canRetry = computed(() => Boolean(this.analysis.loaded()?.manifest.runId));
  private readonly selectionResetState = signal(false);
  readonly selectionReset = this.selectionResetState.asReadonly();
  private version = 0;
  private searchVersion = 0;
  private identity = '\u0000';

  constructor() {
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
      if (!runId) this.state.error.set('Choose a completed analysis first.');
      else if (root) void this.load(runId, this.version);
    });
    this.destroyRef.onDestroy(() => this.version++);
  }

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const slug = params.get('analysis');
      const runId = params.get('run');
      if (slug && this.analysis.selected() !== slug) void this.loadSaved(slug);
      else if (!slug && !this.analysis.loaded() && runId) void this.loadResumed(runId);
      else if (!this.analysis.loaded()) this.state.error.set('Choose a completed analysis first.');
    });
  }

  private async loadResumed(runId: string): Promise<void> {
    const resumable = await this.wizardRpc.getResumableRun();
    if (this.destroyRef.destroyed || this.route.snapshot.queryParamMap.get('run') !== runId) return;
    const directory = resumable.generation?.runId === runId ? resumable.generation.analysisDirectory : null;
    const slug = directory?.split(/[\\/]/).filter(Boolean).at(-1);
    if (slug) await this.loadSaved(slug);
    else this.state.error.set('Choose a completed analysis first.');
  }

  private async loadSaved(slug: string): Promise<void> {
    const root = this.workspace.config().workspaceRoot;
    const routeIdentity = `${this.route.snapshot.queryParamMap.get('analysis') ?? ''}:${this.route.snapshot.queryParamMap.get('run') ?? ''}`;
    const result = await this.analysis.useAnalysis(slug);
    if (result !== 'loaded' && result !== 'superseded' && !this.destroyRef.destroyed &&
        root === this.workspace.config().workspaceRoot &&
        routeIdentity === `${this.route.snapshot.queryParamMap.get('analysis') ?? ''}:${this.route.snapshot.queryParamMap.get('run') ?? ''}`)
      this.state.error.set('That analysis could not be loaded. Choose a completed analysis.');
  }

  private async load(runId: string, version: number, rerun = false): Promise<void> {
    this.state.loading.set(true);
    this.state.error.set(null);
    try {
      const response = await this.rpc.call('wizard:recommend-analysis-skills', { runId }, { timeout: 75_000 });
      if (version !== this.version) return;
      if (!response.isSuccess()) throw new Error('Registry unavailable');
      this.selectionResetState.set(rerun);
      this.summary.set(response.data);
      this.state.recommendations.set(response.data.skills);
      this.state.selectedIds.set(new Set(response.data.skills.map(({ skill }) => `${skill.source}/${skill.skillId}`)));
      this.state.stage.set('review');
    } catch {
      if (version === this.version) this.state.error.set('Could not find skills. Try again or skip this step.');
    } finally {
      if (version === this.version) this.state.loading.set(false);
    }
  }

  retry(): void {
    const runId = this.analysis.loaded()?.manifest.runId;
    if (!runId || this.leaving()) return;
    this.searchVersion++;
    this.state.searching.set(false);
    this.state.searchError.set(null);
    void this.load(runId, ++this.version, true);
  }

  async search(query: string): Promise<void> {
    const version = this.version;
    const searchVersion = ++this.searchVersion;
    this.state.searching.set(true);
    this.state.searchError.set(null);
    try {
      const response = await this.rpc.call('wizard:search-skills', { query });
      if (version !== this.version || searchVersion !== this.searchVersion) return;
      if (!response.isSuccess()) throw new Error('Search failed');
      this.state.searchResults.set(response.data.skills);
    } catch {
      if (version === this.version && searchVersion === this.searchVersion) this.state.searchError.set('Skill search failed. Try again.');
    } finally {
      if (version === this.version && searchVersion === this.searchVersion) this.state.searching.set(false);
    }
  }

  async preview(): Promise<void> {
    if (this.state.loading()) return;
    if (!this.state.selectedIds().size) { await this.continueToGuidance(); return; }
    const version = this.version;
    this.state.loading.set(true);
    this.state.error.set(null);
    try {
      const response = await this.rpc.call('wizard:preview-skills-for-consent', { skills: [...this.state.selectedIds()] });
      if (version !== this.version) return;
      if (!response.isSuccess() || response.data.skills.length !== this.state.selectedIds().size ||
        response.data.skills.some((item) => !this.state.selectedIds().has(item.skillName) || !item.contentHash)) throw new Error('Preview incomplete');
      this.state.preview.set(response.data.skills);
      this.state.approvedIds.set(new Set());
      this.state.stage.set('consent');
    } catch {
      if (version === this.version) this.state.error.set('Could not preview skills. Try again.');
    } finally { if (version === this.version) this.state.loading.set(false); }
  }

  async install(): Promise<void> {
    const previews = this.state.preview();
    if (this.state.stage() === 'installing' || !previews.length || previews.some((item) => item.hasScripts && !this.state.approvedIds().has(item.skillName))) return;
    const version = this.version;
    this.state.stage.set('installing');
    const consentDate = new Date().toISOString();
    try {
      const response = await this.rpc.call('wizard:install-skills-with-consent', {
        skills: previews.map((item) => item.skillName),
        consentRecords: previews.filter((item) => item.hasScripts).map((item) => ({ skillName: item.skillName, contentHash: item.contentHash, consentDate })),
      });
      if (version !== this.version) return;
      if (!response.isSuccess()) throw new Error('Install failed');
      this.state.installed.set(response.data.installed);
      if (!response.data.success) {
        this.state.error.set(`Some skills could not be installed. ${response.data.failedSkill ?? ''}`);
        this.state.stage.set('review');
        return;
      }
      await this.continueToGuidance();
    } catch {
      if (version === this.version) { this.state.error.set('Could not install skills. Try again.'); this.state.stage.set('review'); }
    }
  }

  async continueToGuidance(): Promise<void> {
    if (this.leaving()) return;
    this.leavingState.set(true);
    try {
      const tab = this.tabs.createTab('Project guidance');
      this.tabs.setWorkflow(tab, 'setup-project-prompt');
      await this.router.navigate(['/onboarding/analyze/guidance'], { queryParams: { analysis: this.route.snapshot.queryParamMap.get('analysis'), tab } });
    } finally {
      this.leavingState.set(false);
    }
  }
  async back(): Promise<void> { await this.router.navigate(['/onboarding/analyze']); }
}
