import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { AuthStateService, PlanLimitsStore } from '@ptah-extension/core';
import { type UsageRangeDays } from '@ptah-extension/shared';
import { formatElapsed } from '../plan-limits/format-elapsed';
import { PtahButtonDirective } from '@ptah-extension/ui';
import { LucideAngularModule, RefreshCw } from 'lucide-angular';
import {
  AnalyticsUsageStore,
  USAGE_RANGE_OPTIONS,
} from '../../services/analytics-usage.store';

/**
 * The one page toolbar: the range drives only the usage panels; Refresh
 * reloads usage and plan limits together.
 */
@Component({
  selector: 'ptah-dashboard-toolbar',
  standalone: true,
  imports: [LucideAngularModule, PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-wrap items-center gap-[var(--ptah-gap-controls)]"
      data-testid="dashboard-toolbar"
    >
      @if (updatedText(); as updated) {
        <span
          class="text-xs text-base-content-muted"
          data-testid="dashboard-updated"
          >{{ updated }}</span
        >
      }
      <div
        class="flex gap-[var(--ptah-gap-controls)]"
        role="group"
        aria-label="Usage range in days"
      >
        @for (option of rangeOptions; track option.value) {
          <button
            type="button"
            ptahButton
            size="xs"
            [variant]="range() === option.value ? 'primary' : 'ghost'"
            [selected]="range() === option.value"
            [disabled]="usageLoading()"
            (click)="setRange(option.value)"
          >
            {{ option.label }}
          </button>
        }
      </div>
      <button
        type="button"
        ptahButton
        variant="secondary"
        size="xs"
        [busy]="busy()"
        aria-label="Refresh usage and plan limits"
        data-testid="dashboard-refresh"
        (click)="refresh()"
      >
        <lucide-angular
          [img]="RefreshCwIcon"
          class="h-3.5 w-3.5"
          aria-hidden="true"
        />
        Refresh
      </button>
    </div>
  `,
})
export class DashboardToolbarComponent {
  private readonly usage = inject(AnalyticsUsageStore);
  private readonly planLimits = inject(PlanLimitsStore);
  private readonly auth = inject(AuthStateService);

  protected readonly RefreshCwIcon = RefreshCw;
  protected readonly rangeOptions = USAGE_RANGE_OPTIONS;
  protected readonly range = this.usage.range;
  protected readonly usageLoading = this.usage.isLoading;
  protected readonly busy = computed(
    () => this.usage.isLoading() || this.planLimits.loading(),
  );

  /** "Updated 4m ago" from the plan-limits snapshot; never a raw date. */
  protected readonly updatedText = computed(() => {
    const generatedAt = this.planLimits.snapshot()?.generatedAt;
    return generatedAt === undefined || !Number.isFinite(generatedAt)
      ? null
      : `Updated ${formatElapsed(generatedAt, this.planLimits.now())}`;
  });

  protected setRange(range: UsageRangeDays): void {
    this.usage.setRange(range);
  }

  refresh(): void {
    this.usage.refresh();
    void this.planLimits.load({
      providerId: this.auth.activeProviderId(),
      refresh: true,
    });
  }
}
