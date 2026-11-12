import {
  Component,
  input,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ExecutionStatus } from '@ptah-extension/shared';
import { PtahBadgeDirective } from '@ptah-extension/ui';
import type { PtahBadgeTone } from '@ptah-extension/ui';

/**
 * StatusBadgeComponent - Shows execution status with colored badge
 *
 * Complexity Level: 1 (Simple atom)
 * Patterns: Standalone component, OnPush change detection
 *
 * Maps ExecutionStatus to DaisyUI badge classes:
 * - pending → badge-ghost
 * - streaming → badge-info + loading spinner
 * - complete → badge-success
 * - interrupted → badge-warning
 * - error → badge-error
 */
@Component({
  selector: 'ptah-status-badge',
  standalone: true,
  imports: [PtahBadgeDirective],
  template: `
    <span
      ptahBadge
      [tone]="tone()"
    >
      @if (status() === 'streaming') {
        <span class="loading loading-spinner loading-xs mr-1"></span>
      }
      {{ getLabel() }}
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  readonly status = input.required<ExecutionStatus>();

  protected readonly tone = computed<PtahBadgeTone>(() => {
    switch (this.status()) {
      case 'streaming':
        return 'info';
      case 'complete':
      case 'resumed':
        return 'ok';
      case 'interrupted':
        return 'warn';
      case 'error':
        return 'err';
      default:
        return 'neutral';
    }
  });

  protected getLabel(): string {
    switch (this.status()) {
      case 'pending':
        return 'Pending';
      case 'streaming':
        return 'Streaming';
      case 'complete':
        return 'Done';
      case 'interrupted':
        return 'Stopped';
      case 'resumed':
        return 'Resumed';
      case 'error':
        return 'Error';
    }
  }
}
