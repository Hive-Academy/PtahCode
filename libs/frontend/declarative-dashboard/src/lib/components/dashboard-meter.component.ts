import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SurfaceMeterProps } from '@ptah-extension/shared';

const COLOR_COUNT = 8;

@Component({
  selector: 'ptah-dashboard-meter',
  standalone: true,
  imports: [DecimalPipe, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex min-w-0 flex-col gap-2 tabular-nums" [attr.aria-label]="title() ?? 'Meter'">
      @if (title(); as title) {
        <h3 class="text-sm font-semibold">{{ title }}</h3>
      }
      <div class="flex h-2.5 overflow-hidden rounded-full bg-base-content/10"
        role="img" [attr.aria-label]="barLabel()">
        @for (segment of segments(); track $index) {
          <ng-container [ngTemplateOutlet]="fill"
            [ngTemplateOutletContext]="{ color: segment.color, width: segment.width }" />
        }
      </div>
      <ul class="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        @for (segment of segments(); track $index) {
          <li class="flex min-w-0 items-center gap-2" [class.text-base-content-muted]="segment.muted">
            <span class="flex h-2 w-2 shrink-0 overflow-hidden rounded-sm" aria-hidden="true">
              <ng-container [ngTemplateOutlet]="fill"
                [ngTemplateOutletContext]="{ color: segment.color, width: 100 }" />
            </span>
            <span class="min-w-0 flex-1 break-words">{{ segment.label }}</span>
            <span class="shrink-0 font-semibold">{{ segment.value }}</span>
            <span class="shrink-0 text-base-content-muted">{{ segment.width | number: '1.0-1' }}%</span>
          </li>
        }
      </ul>
    </section>
    <ng-template #fill let-color="color" let-width="width">
      <span class="h-full shrink-0" aria-hidden="true" [style.width.%]="width"
        [class.bg-primary]="color === 0"
        [class.bg-secondary]="color === 1"
        [class.bg-accent]="color === 2"
        [class.bg-info]="color === 3"
        [class.bg-success]="color === 4"
        [class.bg-warning]="color === 5"
        [class.bg-error]="color === 6"
        [class.bg-neutral]="color === 7"
        [class.bg-base-content/20]="color === -1"></span>
    </ng-template>
  `,
})
export class DashboardMeterComponent {
  public readonly node = input.required<SurfaceMeterProps>();
  protected readonly title = computed(() => this.node().title?.trim() || undefined);
  protected readonly segments = computed(() => {
    const segments = this.node().segments.map(segment => ({
      ...segment,
      amount: Number.isFinite(segment.amount) && segment.amount > 0 ? segment.amount : 0,
    }));
    const max = Math.max(0, ...segments.map(segment => segment.amount));
    const weights = segments.map(segment => max === 0 ? 0 : segment.amount / max);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    return segments.map((segment, index) => ({
      label: segment.label,
      value: segment.value ?? segment.amount,
      muted: segment.muted,
      width: total === 0 ? 0 : (weights[index] ?? 0) / total * 100,
      color: segment.muted ? -1 : index % COLOR_COUNT,
    }));
  });
  protected readonly barLabel = computed(() => this.segments().map(segment =>
    `${segment.label}: ${segment.value}, ${Number(segment.width.toFixed(1))}%`,
  ).join('; '));
}
