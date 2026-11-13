import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import { formatDuration, PtahRingComponent } from '@ptah-extension/ui';

/** The plan-window reading a plan ring draws. `percent` is 0-100. */
export interface PlanRingData {
  readonly percent: number;
  readonly label: string;
  readonly resetsInMs: number | null;
}

const MINUTE_MS = 60_000;

/**
 * The caption a stat cell shows under a plan ring: `"<label> · resets in 2h 14m"`,
 * or just `"<label>"` when the reset time is unknown. The ring itself renders
 * no caption (options.md:279), so consumers pass this to the cell's `caption`.
 */
export function planRingCaption(ring: PlanRingData): string {
  const { label, resetsInMs } = ring;
  if (resetsInMs === null || !Number.isFinite(resetsInMs)) return label;
  if (resetsInMs <= 0) return `${label} · resets now`;
  // The plan clock ticks every 30 s, so show whole minutes only.
  const wholeMinutes = Math.floor(resetsInMs / MINUTE_MS) * MINUTE_MS;
  if (wholeMinutes < MINUTE_MS) return `${label} · resets in <1m`;
  return `${label} · resets in ${formatDuration(wholeMinutes)}`;
}

/**
 * PlanRingComponent — the teal plan-usage ring of the vitals rows. A thin
 * wrapper over `ptah-ring` (`size='row'`, percent as centre text).
 * Renders nothing when `ring` is null or its percent is not a finite number.
 */
@Component({
  selector: 'ptah-plan-ring',
  standalone: true,
  imports: [PtahRingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (percent() !== null) {
      <ptah-ring
        [value]="percent()!"
        [max]="100"
        [label]="ariaLabel()"
        [centerText]="centerText()"
        size="tile"
        tone="accent"
        centerTextWeight="semibold"
        [centerOnly]="true"
        [semanticRole]="'img'"
        [hideZeroArc]="true"
        [fadeArc]="true"
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

  protected readonly centerText = computed(() => `${this.percent() ?? 0}%`);
  protected readonly ariaLabel = computed(() => {
    const ring = this.ring();
    const percent = this.percent();
    if (!ring || percent === null) return '';
    return `${percent}% used. ${planRingCaption(ring)}`;
  });
}
