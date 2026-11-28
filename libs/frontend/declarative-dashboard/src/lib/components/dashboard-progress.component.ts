import { ChangeDetectionStrategy, Component, computed, input, type InputSignal } from '@angular/core';
import type { StatusNode } from '../view-model/view-model.types';

export type ProgressNode = Extract<StatusNode, { kind: 'progress' }>;

/**
 * Complete literal class strings, never concatenated, so Tailwind's content
 * scan keeps every tone variant. daisyUI 4 has no `progress-neutral`: the
 * neutral tone maps to the bare `progress` class. The colours resolve from
 * the active theme tokens (anubis / anubis-light); no hard-coded colours.
 */
const PROGRESS_TONE_CLASSES = {
  neutral: 'progress',
  primary: 'progress progress-primary',
  info: 'progress progress-info',
  success: 'progress progress-success',
  warning: 'progress progress-warning',
  error: 'progress progress-error',
} as const;

/**
 * Full-width meter: label left and value right on one line, the track below.
 * Native progress keeps the daisyUI theme-tinted rounded track and tone fill,
 * and sets its width without any inline style.
 */
@Component({
  selector: 'ptah-dashboard-progress',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full min-w-0 flex-col gap-1.5' },
  template: `
    <!-- Label and unrounded percentage on one line, the bar below. The value is renderer-owned. -->
    <div class="flex min-w-0 items-baseline justify-between gap-3">
      <span class="min-w-0 truncate text-sm text-base-content" data-testid="progress-label"
        [attr.title]="node().label.text">{{ node().label.text }}</span>
      <span class="shrink-0 text-sm font-medium tabular-nums text-base-content" data-testid="progress-value">{{ node().value }}%</span>
    </div>
    <progress class="h-2 w-full" [class]="toneClasses()" [value]="node().value" max="100"
      role="progressbar" aria-valuemin="0" aria-valuemax="100"
      [attr.aria-valuenow]="node().value" [attr.aria-label]="node().label.text"></progress>
  `,
})
export class DashboardProgressComponent {
  public readonly node: InputSignal<ProgressNode> = input.required<ProgressNode>();

  public readonly toneClasses = computed(() => PROGRESS_TONE_CLASSES[this.node().tone]);
}
