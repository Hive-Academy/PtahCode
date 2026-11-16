import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { PtahBadgeDirective, PtahButtonDirective } from '@ptah-extension/ui';
import type { LaneTableRow } from './lanes-table.component';

/** Status and immediate recovery action for one lane. */
@Component({
  selector: 'ptah-lanes-table-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahBadgeDirective, PtahButtonDirective],
  template: `
    <span
      ptahBadge
      appearance="outline"
      [tone]="badgeTone()"
      [attr.data-testid]="
        row().kind === 'instance' ? 'cli-matrix-status' : null
      "
      >{{ row().status.label }}</span
    >
    @if (testing() || testResult()) {
      <span class="block text-xs text-base-content-muted">{{
        testing() ? 'Running…' : testResult()
      }}</span>
    }
    @if (row().kind === 'instance') {
      @if (instanceRow()?.runtimeStatus; as runtimeStatus) {
        <span
          ptahBadge
          appearance="outline"
          [tone]="runtimeStatus === 'Error' ? 'err' : 'info'"
          data-testid="cli-matrix-runtime-status"
          >{{ runtimeStatus }}</span
        >
      }
      @if (instanceRow()?.keyStatus?.kind === 'missing') {
        <span
          ptahBadge
          appearance="outline"
          tone="warn"
          data-testid="cli-matrix-key-status"
          >{{ instanceRow()?.keyStatus?.label }}</span
        >
      }
    }
    @if (
      row().status.kind === 'needs-key' || row().status.kind === 'not-installed'
    ) {
      <button
        type="button"
        ptahButton
        variant="ghost"
        size="xs"
        (click)="
          row().status.kind === 'not-installed'
            ? installGuide.emit(row())
            : signIn.emit(row())
        "
      >
        {{
          row().status.kind === 'not-installed' ? 'Install guide' : 'Sign in'
        }}
      </button>
    }
  `,
})
export class LanesTableStatusComponent {
  readonly row = input.required<LaneTableRow>();
  readonly testing = input(false);
  readonly testResult = input('');
  readonly installGuide = output<LaneTableRow>();
  readonly signIn = output<LaneTableRow>();

  protected instanceRow() {
    const row = this.row();
    return row.kind === 'instance' ? row : null;
  }

  protected badgeTone(): 'ok' | 'warn' | 'err' | 'info' | 'neutral' {
    switch (this.row().status.tone) {
      case 'success':
        return 'ok';
      case 'warning':
        return 'warn';
      case 'error':
        return 'err';
      case 'info':
        return 'info';
      default:
        return 'neutral';
    }
  }
}
