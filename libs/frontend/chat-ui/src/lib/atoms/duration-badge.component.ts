import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { formatDuration, PtahBadgeDirective } from '@ptah-extension/ui';

/**
 * DurationBadgeComponent - Displays execution duration
 *
 * Complexity Level: 1 (Simple atom)
 * Patterns: Standalone component, OnPush change detection
 *
 * Formatting uses the shared UI duration formatter.
 */
@Component({
  selector: 'ptah-duration-badge',
  standalone: true,
  imports: [PtahBadgeDirective],
  template: `
    <span ptahBadge tone="neutral">
      {{ formatDuration(durationMs()) }}
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DurationBadgeComponent {
  readonly durationMs = input.required<number>();

  protected readonly formatDuration = formatDuration;
}
