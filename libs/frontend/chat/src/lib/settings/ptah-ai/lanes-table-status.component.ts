import {
  computed,
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { PtahStatusComponent } from '@ptah-extension/ui';
import { resolveCliLaneDefaultPair } from '@ptah-extension/shared';
import type { CliLaneDefaults, CliType } from '@ptah-extension/shared';
import type { LaneTableRow } from './lanes-table.component';

/** Status and immediate recovery action for one lane. */
@Component({
  selector: 'ptah-lanes-table-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahStatusComponent],
  template: `
    <ptah-status
      appearance="inline"
      size="sm"
      [status]="status()"
      [label]="label()"
      [attr.title]="row().status.label"
      [attr.data-testid]="
        row().kind === 'instance' ? 'cli-matrix-status' : null
      "
    />
    @if (testing() || testResult()) {
      <span class="sr-only">{{ testing() ? 'Running…' : testResult() }}</span>
    }
    @if (row().kind === 'instance') {
      @if (instanceRow()?.runtimeStatus; as runtimeStatus) {
        <span class="sr-only" data-testid="cli-matrix-runtime-status">{{
          runtimeStatus
        }}</span>
      }
      @if (instanceRow()?.keyStatus?.kind === 'missing') {
        <span class="sr-only" data-testid="cli-matrix-key-status">{{
          instanceRow()?.keyStatus?.label
        }}</span>
      }
    }
  `,
})
export class LanesTableStatusComponent {
  readonly row = input.required<LaneTableRow>();
  readonly collapsed = input(false);
  readonly testing = input(false);
  protected readonly label = computed(() => {
    const status = this.row().status;
    if (this.collapsed()) {
      if (status.kind === 'not-installed') return 'Missing';
      if (status.kind === 'needs-key') return 'Key';
    }
    return status.label;
  });
  readonly testResult = input('');
  readonly installGuide = output<LaneTableRow>();
  readonly signIn = output<LaneTableRow>();

  protected instanceRow() {
    const row = this.row();
    return row.kind === 'instance' ? row : null;
  }

  protected status(): 'online' | 'warning' | 'failed' | 'running' | 'pending' {
    switch (this.row().status.tone) {
      case 'success':
        return 'online';
      case 'warning':
        return 'warning';
      case 'error':
        return 'failed';
      case 'info':
        return 'running';
      default:
        return 'pending';
    }
  }
}

/** Compact unsupported state belongs with the lane identity, never above a select. */
@Component({
  selector: 'ptah-lane-default-warning',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (reason(); as reason) {
    <span
      tabindex="0"
      [title]="'Unsupported combination: ' + reason"
      class="text-xs text-base-content-muted"
      ><span aria-hidden="true">&#9432;</span
      ><span class="sr-only">Unsupported combination: {{ reason }}</span></span
    >
  }`,
})
export class LaneDefaultWarningComponent {
  readonly row = input.required<LaneTableRow>();
  readonly saved = input<CliLaneDefaults[CliType]>();
  protected readonly reason = computed(() => {
    const row = this.row();
    if (row.kind !== 'system' || !row.manifest) return null;
    const pair = resolveCliLaneDefaultPair(row.manifest, this.saved());
    return 'unsupported' in pair ? pair.unsupported : null;
  });
}
