/**
 * UsageDashboardComponent
 *
 * Smart container for the Usage tab of the analytics card (TASK_2026_707
 * PR 2, T3-Code-style): range segmented control (7/30/90 days), refresh, the
 * raw-token-cost summary with provider share rows, the daily stacked bar
 * chart with a cost/tokens toggle, the KPI strip, the full-width cost-quality
 * row, the model/day breakdown table and the top sessions table.
 *
 * Data flow: `AnalyticsUsageStore` owns the RPC request, range and
 * loading/error state; this component folds the summary through the pure
 * `buildUsageViewModel` inside a `computed` and hands the pieces to
 * presentational children. An effect reloads when the workspace changes;
 * destroying the component cancels the request in flight.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ModelStateService } from '@ptah-extension/core';
import { AnalyticsUsageStore } from '../../services/analytics-usage.store';
import { dailyTotals, downsample } from './usage-trend';
import { buildUsageViewModel, type UsageViewModel } from './usage-summary.view-model';
import { FolderGit2, LucideAngularModule } from 'lucide-angular';
import {
  formatChartUsd,
  formatCompactTokens,
  formatCount,
  formatShare,
  formatTableUsd,
  providerDisplayName,
} from './usage-formatting';
import {
  StackedBarChartComponent,
  type StackedBarSeries,
} from './stacked-bar-chart.component';
import { UsageCostDonutComponent } from './usage-cost-donut.component';
import { UsageCostSummaryComponent } from './usage-cost-summary.component';
import { UsageKpiStripComponent } from './usage-kpi-strip.component';
import { UsageBreakdownTableComponent } from './usage-breakdown-table.component';
import { UsageCostQualityComponent } from './usage-cost-quality.component';
import { UsageTopSessionsComponent } from './usage-top-sessions.component';
import { PtahBadgeDirective, PtahButtonDirective, PtahSectionHeaderComponent, PtahStatePanelComponent, PtahSurfaceDirective } from '@ptah-extension/ui';

@Component({
  selector: 'ptah-usage-dashboard',
  standalone: true,
  imports: [
    StackedBarChartComponent,
    UsageCostDonutComponent,
    UsageCostSummaryComponent,
    UsageKpiStripComponent,
    UsageBreakdownTableComponent,
    UsageCostQualityComponent,
    UsageTopSessionsComponent,
    LucideAngularModule,
    PtahButtonDirective,
    PtahBadgeDirective,
    PtahSectionHeaderComponent,
    PtahStatePanelComponent,
    PtahSurfaceDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './usage-dashboard.component.html',
  // Rows follow the page width (container), not the viewport. From 960 the
  // chart row is 2fr / at least 20rem; below it the cost share card spans the
  // row and puts the donut beside the provider list from 560. The tables
  // stack until 1400, then split 5fr / 7fr so the session table needs no
  // horizontal scroll. Repositories go two across from 1200 when 2 or more.
  styles: [`
    .usage-dashboard { container-type: inline-size; }
    .usage-chart-fill { flex: 1 1 auto; min-height: 220px; }
    @container (min-width: 560px) and (max-width: 959px) {
      .usage-share-body { flex-direction: row; }
      .usage-share-body > * { flex: 1 1 0; }
    }
    @container (min-width: 960px) {
      .usage-chart-row { grid-template-columns: minmax(0, 2fr) minmax(20rem, 1fr); }
    }
    @container (min-width: 1200px) {
      .usage-repo-grid-multi { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    }
    @container (min-width: 1400px) {
      .usage-table-row { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); }
    }
  `],
})
export class UsageDashboardComponent {
  private readonly usageStore = inject(AnalyticsUsageStore);
  private readonly modelState = inject(ModelStateService);

  protected readonly range = this.usageStore.range;
  protected readonly isLoading = this.usageStore.isLoading;
  protected readonly loadError = this.usageStore.loadError;
  /** True while a same-scope refresh runs and the old summary stays visible. */
  protected readonly isStale = this.usageStore.isSummaryStale;
  protected readonly summaryGeneratedAt = computed(() => this.usageStore.summary()?.generatedAt ?? '');

  /** Folded summary; `null` while nothing has loaded. */
  protected readonly viewModel = computed<UsageViewModel | null>(() =>
    buildUsageViewModel(
      this.usageStore.summary(),
      this.modelState.availableModels(),
    ),
  );

  protected readonly sourceTip = computed(() =>
    (this.viewModel()?.sources ?? [])
      .filter((source) => source.status !== 'complete')
      .map((source) => `${providerDisplayName(source.sourceId)}: ${source.reason ?? source.status}`)
      .join('; '),
  );

  /** KPI change against the previous equal range; null parts hide the line. */
  protected readonly kpiDeltas = this.usageStore.kpiDeltas;

  /** Daily totals for the KPI sparklines, at most 12 points. */
  protected readonly costTrend = computed(() =>
    downsample(dailyTotals((this.viewModel()?.providerSeries ?? []).map((p) => p.costValues))),
  );
  protected readonly tokenTrend = computed(() =>
    downsample(dailyTotals((this.viewModel()?.providerSeries ?? []).map((p) => p.tokenValues))),
  );

  protected readonly partialBadgeFocused = signal(false);

  protected readonly repositoryIcon = FolderGit2;
  protected readonly formatCount = formatCount;
  protected readonly formatCompactTokens = formatCompactTokens;
  protected readonly formatShare = formatShare;
  protected readonly formatTableUsd = formatTableUsd;

  protected readonly chartMode = signal<'cost' | 'tokens'>('cost');

  protected readonly chartSeries = computed<readonly StackedBarSeries[]>(
    () => {
      const vm = this.viewModel();
      if (!vm) return [];
      const mode = this.chartMode();
      return vm.providerSeries.map((provider) => ({
        id: provider.providerId,
        label: provider.displayName,
        color: provider.accent,
        values: mode === 'cost' ? provider.costValues : provider.tokenValues,
      }));
    },
  );

  protected readonly chartValueFormat = computed<(value: number) => string>(
    () => (this.chartMode() === 'cost' ? formatChartUsd : formatCompactTokens),
  );

  /** Precise values for the focused-day readout and per-day labels. */
  protected readonly chartDetailFormat = computed<(value: number) => string>(
    () => (this.chartMode() === 'cost' ? formatTableUsd : formatCount),
  );

  /**
   * Per day: the plotted cost is a lower bound because the day has unpriced
   * facts. Token counts are always known, so token mode passes no flags.
   */
  protected readonly chartUnknownDays = computed<readonly boolean[]>(() => {
    const vm = this.viewModel();
    if (!vm || this.chartMode() === 'tokens') return [];
    return vm.dayCostUnknown;
  });

  constructor() {
    effect(() => {
      this.usageStore.workspacePath();
      untracked(() => void this.usageStore.load());
    });
    inject(DestroyRef).onDestroy(() => this.usageStore.cancelLoad());
  }

  protected retry(): void {
    this.usageStore.refresh();
  }

  protected setChartMode(mode: 'cost' | 'tokens'): void {
    this.chartMode.set(mode);
  }
}
