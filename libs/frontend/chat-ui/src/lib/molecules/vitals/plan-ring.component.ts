import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import { formatDuration } from '@ptah-extension/ui';

import { ProgressRingComponent } from './progress-ring.component';

/** The plan-window reading a plan ring draws. `percent` is 0-100. */
export interface PlanRingData {
  readonly percent: number;
  readonly label: string;
  readonly resetsInMs: number | null;
}

/**
 * The caption a stat cell shows under a plan ring: `"<label> · resets in 2h 14m"`,
 * or just `"<label>"` when the reset time is unknown. The ring itself renders
 * no caption (options.md:279), so consumers pass this to the cell's `caption`.
 */
export function planRingCaption(ring: PlanRingData): string {
  const { label, resetsInMs } = ring;
  if (resetsInMs === null || !Number.isFinite(resetsInMs)) return label;
  if (resetsInMs < 1000) return `${label} · resets now`;
  return `${label} · resets in ${formatDuration(resetsInMs)}`;
}

/**
 * PlanRingComponent — the teal plan-usage ring of the vitals rows. A thin
 * wrapper over `ptah-progress-ring` (`size='value'`, percent as centre text).
 * Renders nothing when `ring` is null or its percent is not a finite number.
 */
@Component({
  selector: 'ptah-plan-ring',
  standalone: true,
  imports: [ProgressRingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (percent() !== null) {
      <ptah-progress-ring
        [value]="fraction()"
        [centerText]="centerText()"
        tone="teal"
        size="value"
        [ariaLabel]="ariaLabel()"
      />
    }
  `,
})
export class PlanRingComponent {
  readonly ring = input.required<PlanRingData | null>();

  /** Percent clamped to 0-100 and rounded; `null` = nothing to draw. */
  protected readonly percent = computed(() => {
    const ring = this.ring();
    if (!ring || !Number.isFinite(ring.percent)) return null;
    return Math.round(Math.min(100, Math.max(0, ring.percent)));
  });

  protected readonly fraction = computed(() => (this.percent() ?? 0) / 100);
  protected readonly centerText = computed(() => `${this.percent() ?? 0}%`);
  protected readonly ariaLabel = computed(() => {
    const ring = this.ring();
    const percent = this.percent();
    if (!ring || percent === null) return '';
    return `${percent}% used. ${planRingCaption(ring)}`;
  });
}
