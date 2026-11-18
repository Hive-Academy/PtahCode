import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUpNarrowWide,
  LucideAngularModule,
  RefreshCw,
} from 'lucide-angular';
import {
  OUTCOME_TASK_KINDS,
  type AgentGetCapabilityMatrixResult,
  type OutcomeTaskKind,
} from '@ptah-extension/shared';
import {
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahInstrumentBandComponent,
  PtahRichSelectComponent,
  PtahInputDirective,
  PtahFieldComponent,
  PtahFieldGridDirective,
  PtahFormSectionComponent,
  type PtahInstrumentBandSegment,
} from '@ptah-extension/ui';
import { HostRoutingSettingComponent } from './host-routing-setting.component';
import { LaneRotationSettingComponent } from './lane-rotation-setting.component';
import { CapabilityMatrixSettingComponent } from './capability-matrix-setting.component';
import { RoutingDisplayNamesStore } from './routing-display-names.store';

@Component({
  selector: 'ptah-decision-matrix-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CapabilityMatrixSettingComponent,
    LucideAngularModule,
    PtahButtonDirective,
    PtahIconButtonDirective,
    PtahInstrumentBandComponent,
    PtahRichSelectComponent,
    PtahInputDirective,
    PtahFieldComponent,
    PtahFieldGridDirective,
    PtahFormSectionComponent,
    HostRoutingSettingComponent,
    LaneRotationSettingComponent,
  ],
  template: `
    <div
      class="flex flex-wrap items-center justify-between gap-[var(--ptah-gap-controls)]"
    >
      <button
        ptahButton
        variant="ghost"
        type="button"
        (click)="back.emit()"
        aria-label="Context management"
      >
        <lucide-angular [img]="BackIcon" aria-hidden="true" />
        Context management
      </button>
      <div class="flex items-center gap-[var(--ptah-gap-controls)]">
        <span class="text-xs text-base-content-muted">{{ ratedMeta() }}</span>
        <button
          ptahIconButton
          type="button"
          label="Refresh ratings"
          [busy]="busy()"
          (click)="refresh()"
        >
          <lucide-angular [img]="RefreshIcon" aria-hidden="true" />
        </button>
      </div>
    </div>
    <ptah-instrument-band
      [segments]="segments()"
      [loading]="busy()"
      ariaLabel="Decision matrix overview"
    />
    <ptah-host-routing-setting
      (modelConfiguredChange)="routingModelConfigured.set($event)"
    />
    <ptah-lane-rotation-setting />
    <ptah-form-section
      wide
      level="2"
      heading="Model ratings"
      data-glass-surface="content"
      description="Select a score to see where it came from."
    >
      <p
        aside
        class="text-xs tabular-nums text-base-content-muted"
        data-testid="decision-matrix-result-count"
      >
        {{ visibleCount() }}
        {{ visibleCount() === 1 ? 'result' : 'results' }}
      </p>
      <div class="min-w-0 space-y-[var(--ptah-gap-controls)]">
        <div class="flex min-w-0 items-end gap-[var(--ptah-gap-field)]">
          <div ptahFieldGrid class="min-w-0 flex-1">
            <ptah-field label="Family">
              <ptah-select
                label="Filter by family"
                [options]="familyOptions()"
                [value]="family()"
                (valueChange)="family.set($event ?? '')"
              />
            </ptah-field>
            <ptah-field label="Search models">
              <input
                ptahInput
                type="search"
                aria-label="Search models"
                [value]="search()"
                (input)="setSearch($event)"
              />
            </ptah-field>
            <ptah-field label="Sort by">
              <ptah-select
                label="Sort by task kind"
                [options]="taskOptions"
                [value]="sortKind()"
                (valueChange)="setSort($event)"
              />
            </ptah-field>
          </div>
          <button
            ptahIconButton
            type="button"
            class="shrink-0"
            [label]="
              descending()
                ? 'Sort descending; switch to ascending'
                : 'Sort ascending; switch to descending'
            "
            [selected]="descending()"
            (click)="descending.set(!descending())"
          >
            <lucide-angular
              [img]="descending() ? SortDescIcon : SortAscIcon"
              aria-hidden="true"
            />
          </button>
        </div>
        <ptah-capability-matrix-setting
          [headingLevel]="2"
          [familyFilter]="family()"
          [modelSearch]="search()"
          [sortKind]="sortKind()"
          [sortDescending]="descending()"
          (resultChange)="onResult($event)"
          (loadingChange)="busy.set($event)"
          (visibleCountChange)="visibleCount.set($event)"
        />
      </div>
    </ptah-form-section>
  `,
  styles: `
    :host-context([data-glass='on']) [data-glass-surface='content'] {
      padding: 1.25rem;
    }
  `,
})
export class DecisionMatrixPageComponent {
  readonly back = output<void>();
  protected readonly RefreshIcon = RefreshCw;
  protected readonly BackIcon = ArrowLeft;
  protected readonly SortDescIcon = ArrowDownWideNarrow;
  protected readonly SortAscIcon = ArrowUpNarrowWide;
  private readonly names = inject(RoutingDisplayNamesStore);
  private readonly matrix = viewChild(CapabilityMatrixSettingComponent);
  protected readonly tasks = OUTCOME_TASK_KINDS;
  protected readonly labels: Record<OutcomeTaskKind, string> = {
    plan: 'Plan',
    implement: 'Implement',
    review: 'Review',
    research: 'Research',
    tests: 'Tests',
    docs: 'Docs',
  };
  protected readonly routingModelConfigured = signal<boolean | null>(null);
  protected readonly taskOptions = OUTCOME_TASK_KINDS.map((value) => ({
    value,
    label: this.labels[value],
  }));
  protected readonly familyOptions = computed(() => [
    { value: '', label: 'All families' },
    ...this.families().map((value) => ({
      value,
      label: this.names.executor(value).text,
    })),
  ]);
  protected readonly family = signal('');
  protected readonly search = signal('');
  protected readonly sortKind = signal<OutcomeTaskKind>('plan');
  protected readonly descending = signal(true);
  protected readonly busy = signal(true);
  protected readonly result = signal<AgentGetCapabilityMatrixResult | null>(
    null,
  );
  protected readonly families = computed(() => [
    ...new Set((this.result()?.profiles ?? []).map((p) => p.family)),
  ]);
  protected readonly visibleCount = signal(0);
  protected readonly latest = computed(() => {
    let latest: string | null = null;
    for (const profile of this.result()?.profiles ?? [])
      for (const kind of OUTCOME_TASK_KINDS) {
        const cell = profile.cells[kind];
        if (cell.kind === 'value' && (!latest || cell.asOf > latest))
          latest = cell.asOf;
      }
    return latest;
  });
  protected readonly ratedMeta = computed(() => {
    const latest = this.latest();
    return latest ? `Rated ${this.relative(latest)}` : 'No ratings yet';
  });
  protected readonly segments = computed<readonly PtahInstrumentBandSegment[]>(
    () => {
      const profiles = this.result()?.profiles ?? [];
      const stale = profiles.reduce(
        (count, p) =>
          count +
          OUTCOME_TASK_KINDS.filter(
            (kind) => p.cells[kind].kind === 'value' && p.cells[kind].stale,
          ).length,
        0,
      );
      const latest = this.latest();
      return [
        {
          id: 'routing-model',
          label: 'Routing model',
          value: this.routingModelConfigured() ? 'On' : 'Needs a model',
          tone: this.routingModelConfigured() ? 'ok' : 'warn',
        },
        {
          id: 'families',
          label: 'Families',
          value: String(this.families().length),
          tone: 'info',
        },
        {
          id: 'models',
          label: 'Models rated',
          value: String(
            new Set(
              profiles
                .filter(
                  (p) =>
                    p.model !== '*' &&
                    OUTCOME_TASK_KINDS.some(
                      (kind) => p.cells[kind].kind !== 'unknown',
                    ),
                )
                .map((p) => p.model),
            ).size,
          ),
          tone: 'info',
        },
        {
          id: 'last',
          label: 'Last rating',
          value: latest ? this.relative(latest) : 'None',
          meta: latest ?? undefined,
          tone: 'info',
        },
        {
          id: 'stale',
          label: 'Stale ratings',
          value: String(stale),
          tone: stale > 0 ? 'warn' : 'ok',
        },
      ];
    },
  );
  protected onResult(result: AgentGetCapabilityMatrixResult | null): void {
    this.result.set(result);
  }
  protected refresh(): void {
    if (this.busy()) return;
    this.busy.set(true);
    void this.matrix()?.reload();
  }
  protected setSearch(event: Event): void {
    if (event.target instanceof HTMLInputElement)
      this.search.set(event.target.value);
  }
  protected setSort(value: string | null): void {
    const kind = OUTCOME_TASK_KINDS.find((k) => k === value);
    if (kind) this.sortKind.set(kind);
  }
  /** "today", "1 day ago" or "N days ago"; a future or unreadable date reads as today. */
  private relative(date: string): string {
    const elapsed = Date.now() - Date.parse(date);
    const days = Number.isFinite(elapsed)
      ? Math.max(0, Math.floor(elapsed / 86_400_000))
      : 0;
    if (days === 0) return 'today';
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }
}
