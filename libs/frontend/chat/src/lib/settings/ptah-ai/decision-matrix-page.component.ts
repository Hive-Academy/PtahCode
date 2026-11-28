import { DecimalPipe, NgTemplateOutlet, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, output, signal, type OnInit } from '@angular/core';
import { ArrowLeft, LucideAngularModule, RefreshCw } from 'lucide-angular';
import { OUTCOME_TASK_KINDS, type OutcomeTaskKind } from '@ptah-extension/shared';
import {
  PtahAlertComponent,
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahDonutComponent,
  PtahIconButtonDirective,
  PtahInputDirective,
  PtahMeterComponent,
  PtahRelativeTimeComponent,
  PtahRingComponent,
  PtahSkeletonComponent,
  PtahStackedBarComponent,
  PtahStatComponent,
} from '@ptah-extension/ui';
import { dashboardModel, type DashboardRow } from './decision-matrix-dashboard.model';
import { DecisionMatrixDashboardStore } from './decision-matrix-dashboard.store';
import { HostRoutingSettingComponent } from './host-routing-setting.component';
import { LaneRotationSettingComponent } from './lane-rotation-setting.component';
import { PerformanceRoutingSettingComponent } from './performance-routing-setting.component';
import { RoutingDisplayNamesStore } from './routing-display-names.store';

type ScoreSource = 'measured' | 'ratings';

@Component({
  selector: 'ptah-decision-matrix-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe, NgTemplateOutlet, PercentPipe, LucideAngularModule, PtahAlertComponent,
    PtahBadgeDirective, PtahButtonDirective, PtahDonutComponent, PtahIconButtonDirective,
    PtahInputDirective, PtahMeterComponent, PtahRelativeTimeComponent, PtahRingComponent,
    PtahSkeletonComponent, PtahStackedBarComponent, PtahStatComponent,
    HostRoutingSettingComponent, LaneRotationSettingComponent, PerformanceRoutingSettingComponent,
  ],
  providers: [DecisionMatrixDashboardStore],
  host: { role: 'region', 'aria-label': 'Decision matrix dashboard' },
  templateUrl: './decision-matrix-page.component.html',
  styleUrl: './decision-matrix-page.component.css',
})
export class DecisionMatrixPageComponent implements OnInit {
  readonly back = output<void>();
  protected readonly BackIcon = ArrowLeft;
  protected readonly RefreshIcon = RefreshCw;
  protected readonly tasks = OUTCOME_TASK_KINDS;
  protected readonly effortSourceLabels = {
    native: 'Reported by lane',
    'ptah-fallback': 'Ptah fallback',
    unknown: 'Unknown',
  } as const;
  protected readonly routingModelConfigured = signal<boolean | null>(null);
  protected readonly source = signal<ScoreSource>('measured');
  protected readonly search = signal('');
  protected readonly selection = signal<{ id: string; task: OutcomeTaskKind } | null>(null);
  protected readonly evidence = computed(() => {
    const value = this.store.evidence();
    return typeof value === 'string' ? null : value;
  });
  private readonly ratings = computed(() => {
    const value = this.store.ratings();
    return typeof value === 'string' ? null : value;
  });
  protected readonly busy = computed(() => this.store.evidence() === 'loading' || this.store.ratings() === 'loading');
  protected readonly dashboard = computed(() => dashboardModel(this.evidence(), this.ratings()));
  protected readonly rows = computed(() => {
    const dashboard = this.dashboard();
    const ratingProfiles = new Set(this.ratings()?.profiles.map(({ family, model }) => JSON.stringify([family, model])));
    const rows = this.source() === 'measured'
      ? dashboard.measuredRows
      : dashboard.rows.filter(({ family, model }) => ratingProfiles.has(JSON.stringify([family, model])));
    const search = this.search().trim().toLowerCase();
    return search ? rows.filter((row) =>
      [row.model, row.family, this.laneName(row.laneId, row.family), this.modelName(row.model)]
        .some((value) => value.toLowerCase().includes(search)),
    ) : rows;
  });
  protected readonly detail = computed(() => {
    const selection = this.selection();
    if (!selection) return null;
    const row = this.dashboard().rows.find((candidate) => candidate.id === selection.id);
    if (!row) return null;
    const { task } = selection;
    const measured = row.measured.get(task);
    const rating = row.ratings.get(task);
    const active = this.source() === 'measured' ? measured : rating;
    return active ? { row, task, measured, rating, active } : null;
  });
  protected readonly workloads = computed(() => this.dashboard().workloads.map((workload) => ({
    ...workload,
    label: this.laneName(workload.laneId),
  })));

  /* eslint-disable @angular-eslint/prefer-inject -- This feature uses constructor injection. */
  constructor(
    protected readonly store: DecisionMatrixDashboardStore,
    private readonly names: RoutingDisplayNamesStore,
  ) {}
  /* eslint-enable @angular-eslint/prefer-inject */

  ngOnInit(): void {
    this.store.refresh();
  }

  protected laneName(laneId: string | null, family = ''): string {
    const id = laneId ?? family;
    return id ? this.names.executor(id).text : '';
  }

  protected modelName(model: string): string {
    return model === '*' ? 'Family default' : this.names.model(model).text;
  }

  protected cell(row: DashboardRow, task: OutcomeTaskKind, lane: string, model: string) {
    const measured = this.source() === 'measured' ? row.measured.get(task) : undefined;
    const rating = this.source() === 'ratings' ? row.ratings.get(task) : undefined;
    const cell = measured ?? rating;
    if (!cell) return null;
    const countText = measured ? `${measured.funnel.spawned} runs`
      : rating?.sampleCount == null ? 'Rating' : `${rating.sampleCount} samples`;
    const scoreText = cell.score === null ? 'No score' : `${cell.score} of 100`;
    const staleText = cell.stale ? ', stale' : '';
    return {
      score: cell.score,
      stale: cell.stale,
      countText,
      ariaLabel: `${lane} ${model} ${task}: ${scoreText}, ${countText}${staleText}`,
    };
  }

  protected select(id: string, task: OutcomeTaskKind): void {
    this.selection.set({ id, task });
  }

  protected setSearch(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.search.set(event.target.value);
      this.selection.set(null);
    }
  }
}
