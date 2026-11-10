import { ChangeDetectionStrategy, Component, ElementRef, AfterViewInit, OnDestroy, input, output, inject, signal, computed } from '@angular/core';
import type { ReviewFinding, ReviewRun, StageRecord } from '@ptah-extension/review-contracts';
import { ReviewRunsStore } from '../review-runs.store';
import { ReviewConfirmDialogComponent } from './review-confirm-dialog.component';
import { RUN_STATUS_INK, reviewStatusLabel } from './review-runs-list.component';
import { ReviewFindingsTableComponent, reviewFindingRows } from './review-findings-table.component';

@Component({
  selector: 'ptah-review-run-detail', standalone: true, imports: [ReviewFindingsTableComponent, ReviewConfirmDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <aside role="region" aria-labelledby="review-detail-title" (keydown)="onKeydown($event)">
        <header class="flex items-start justify-between gap-4"><div class="min-w-0">
          <button type="button" class="btn btn-ghost btn-sm mb-2 min-[768px]:hidden" aria-label="Close run details" (click)="closed.emit()">All runs</button>
          <h2 id="review-detail-title" class="truncate text-xl font-semibold" tabindex="-1"><span class="sr-only">PR </span>#{{ run().prNumber }} {{ run().prTitle || 'review' }}</h2>
          <p class="text-sm text-base-content-muted" [title]="'Attempt ' + run().attemptId">{{ run().repo.owner }}/{{ run().repo.name }} · <span class="font-mono">{{ run().headSha.slice(0, 10) }}</span> · {{ run().trigger === 'poll' ? 'Poll' : 'Manual' }}</p>
        </div>
          <span class="badge badge-outline shrink-0" data-testid="review-detail-state"><span class="inline-flex items-center gap-1.5" [class]="ink(run().status)"><span class="h-2 w-2 rounded-full bg-current" aria-hidden="true"></span>{{ label(run().status) }}</span></span>
        </header>
        <div class="mt-3 flex flex-wrap gap-2" data-testid="review-detail-rerun">
          <button type="button" class="btn btn-primary btn-sm" title="A dry run creates a local preview. CodeRabbit stays enabled." [disabled]="store.rerunState() === 'running'" (click)="store.rerun(run().attemptId, true)">Rerun dry run</button>
          <button type="button" class="btn btn-ghost btn-sm" title="A live rerun can publish comments. CodeRabbit stays enabled." [disabled]="store.rerunState() === 'running' || !store.hasToken() || store.settings()?.globalPublicationPaused" (click)="confirmLive.set(true)">Rerun live</button>
        </div>
        @if (store.rerunState() === 'error') { <p role="alert" class="mt-2 text-sm text-error">Rerun could not be started.</p> }
        @if (run().failure; as failure) {
          <p class="alert alert-error mt-4 text-sm" role="alert">Failed in {{ failure.stage }}: {{ failure.message }} ({{ failure.code }})</p>
        }
        @if (run().headRetry?.automaticRetriesStopped) { <p class="mt-2 text-sm text-warning">Automatic retries stopped</p> }
        @else if (run().headRetry?.nextEligibleAt; as retryAt) { <p class="mt-2 text-sm text-warning">Retry after {{ retryTime(retryAt) }}</p> }
        @if (loadState() === 'loading') { <p class="mt-5" role="status">Loading run details…</p> }
        @else if (loadState() === 'error') { <div class="alert alert-error mt-5" role="alert">Run details are unavailable. <button type="button" class="btn btn-ghost btn-sm" (click)="retry.emit()">Retry</button></div> }
        @else {
          <section class="surface-2 mt-4 rounded-box p-4" aria-label="Coverage" data-testid="review-detail-coverage">
            <div class="flex items-center justify-between gap-2 text-sm"><span class="font-semibold">Coverage</span><span>{{ run().coverage.length }} of {{ lensTotal() }} lenses</span></div>
            <progress class="progress progress-primary mt-2 h-1 w-full" [value]="run().coverage.length" [max]="lensTotal() || 1" aria-label="Lens coverage"></progress>
            @if (run().status === 'partial') { <p class="mt-2 text-sm text-state-need">Coverage limited. Unchecked paths are not claimed clean.</p> }
          </section>
          <section class="mt-5"><h3 class="font-semibold">Stages</h3>
            @if (run().stages.length === 0) { <p class="text-sm text-base-content-muted">Stage history unavailable.</p> }
            @else { <ol class="mt-2 grid grid-cols-1 gap-2 min-[768px]:grid-cols-2 min-[1400px]:grid-cols-4" data-testid="review-detail-stages">
              @for (stage of run().stages; track stage.name + ':' + (stage.scope ?? '')) { <li class="surface-2 rounded-box px-3 py-2">
                <p class="flex items-center gap-1.5 truncate text-sm" [class]="ink(stage.status)"><span class="h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden="true"></span>{{ stageLabel(stage) }}</p>
                <p class="text-xs text-base-content-muted">{{ label(stage.status) }}{{ stage.durationMs === null ? '' : ' · ' + seconds(stage.durationMs) }}</p>
                @if (stage.error) { <p class="text-xs" role="status">{{ stage.error }}</p> }
              </li> }
            </ol> }
          </section>
          <section class="mt-5"><h3 class="font-semibold">Coverage per lens</h3>
            @if (run().coverage.length) { <ul class="mt-2 grid grid-cols-1 gap-2 min-[1100px]:grid-cols-2" data-testid="review-detail-lenses">@for (item of run().coverage; track item) { <li class="surface-2 rounded-box px-3 py-2">
              <p class="truncate text-sm font-semibold">{{ item }}</p>
              <p class="text-xs text-base-content-muted">Family: {{ family('lenses') ?? 'Unavailable' }} · Verifier family: {{ family('verification') ?? 'Unavailable' }}</p>
            </li> }</ul> }
            @else { <p class="text-sm text-base-content-muted">Lane coverage unavailable.</p> }
            @if (family('lenses') && family('lenses') === family('verification')) { <span class="badge badge-warning mt-2">Weaker evidence · same-family verification</span> }
          </section>
          <section class="mt-6">
          <h3 class="font-semibold">Findings</h3>
            @if (findingsState() === 'loading') { <p class="mt-1 text-sm text-base-content-muted" role="status">Loading findings…</p> }
            @else if (findingsState() === 'error') { <p class="mt-1 text-sm text-base-content-muted" role="alert">Findings are unavailable. <button type="button" class="btn btn-ghost btn-sm" (click)="retryFindings.emit()">Retry</button></p> }
            @else { <ptah-review-findings-table [rows]="findingRows()" /> }
          </section>
          <section class="mt-6"><h3 class="font-semibold">Walkthrough preview</h3><p class="text-sm text-base-content-muted">Walkthrough preview unavailable.</p></section>
          <section class="mt-6"><h3 class="font-semibold">Artifacts</h3><p class="text-sm text-base-content-muted">Artifact list unavailable.</p></section>
        }
      </aside>
      @if (confirmLive()) { <ptah-review-confirm-dialog dialogId="review-live-rerun-confirm" title="Start live rerun?" description="This rerun can publish a new COMMENT review and verified inline comments on the current PR head. CodeRabbit remains enabled." confirmLabel="Start live rerun" [requirePermissions]="true" (cancelled)="confirmLive.set(false)" (confirmed)="startLiveRerun()" /> }
    </div>
  `,
})
export class ReviewRunDetailComponent implements AfterViewInit, OnDestroy {
  retryTime(value: string): string { return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); }
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private returnFocus: HTMLElement | null = null;
  readonly store = inject(ReviewRunsStore);
  readonly confirmLive = signal(false);
  readonly run = input.required<ReviewRun>();
  readonly findings = input<readonly ReviewFinding[]>([]);
  readonly findingsState = input<'loading' | 'ready' | 'error'>('ready');
  readonly findingRows = computed(() => reviewFindingRows(this.findings()));
  readonly loadState = input<'loading' | 'ready' | 'error'>('ready');
  readonly closed = output<void>();
  readonly retry = output<void>();
  readonly retryFindings = output<void>();
  ngAfterViewInit(): void { const doc = this.element.nativeElement.ownerDocument; this.returnFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    // Below 768 px the inbox shows one pane, so the run row is hidden now: move focus into the detail.
    const view = doc.defaultView;
    if (typeof view?.matchMedia === 'function' && view.matchMedia('(max-width: 767.98px)').matches) this.element.nativeElement.querySelector<HTMLElement>('#review-detail-title')?.focus();
  }
  ngOnDestroy(): void { this.returnFocus?.focus(); }
  ink(status: ReviewRun['status']): string { return RUN_STATUS_INK[status]; }
  label(status: ReviewRun['status']): string { return reviewStatusLabel(status); }
  seconds(ms: number): string { return Math.round(ms / 1000) + 's'; }
  /** Lenses of the run: the covered lenses, or more when the run has more lens stages. */
  lensTotal(): number { return Math.max(this.run().coverage.length, this.run().stages.filter(stage => stage.name === 'lenses' && stage.scope).length); }
  startLiveRerun(): void { this.confirmLive.set(false); void this.store.rerun(this.run().attemptId, false); }
  stageLabel(stage: StageRecord): string { return stage.name === 'lenses' && stage.scope ? stage.scope : ({ discovery: 'Discovery', context: 'Context', checks: 'Checks', triage: 'Triage', lenses: 'Lenses', verification: 'Verification', identity: 'Identity', publication: 'Publication' })[stage.name]; }
  family(name: StageRecord['name']): string | null { return this.run().stages.find(stage => stage.name === name)?.family ?? null; }
  onKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.key === 'Escape') { event.preventDefault(); this.closed.emit(); }
  }
}
