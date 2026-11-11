import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { SystemCliMatrixRow } from './cli-matrix-rows';
import { CliCapabilityDetailComponent } from './cli-capability-detail.component';
import { CopilotAutoApproveToggleComponent } from './copilot-auto-approve-toggle.component';
import {
  PtahButtonDirective,
} from '@ptah-extension/ui';

export type CliProviderInfoKind = 'info' | 'capabilities' | 'permission' | 'install';

@Component({
  selector: 'ptah-cli-provider-card-popovers', standalone: true,
  imports: [CliCapabilityDetailComponent, CopilotAutoApproveToggleComponent, PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div role="dialog" [attr.aria-label]="row().name + ' ' + kind()"
      class="w-[19rem] max-w-[calc(100vw-2rem)] space-y-2 p-3 text-sm text-base-content"
      data-testid="cli-provider-popover-content">
    <div class="flex items-center justify-between gap-2 border-b border-base-content/10 pb-2">
      <h3 class="font-semibold">{{ row().name }} · {{ heading() }}</h3>
      <button type="button" ptahButton variant="ghost" size="xs" aria-label="Close" (click)="closed.emit()">Close</button>
    </div>
    @switch (kind()) {
      @case ('capabilities') { <ptah-cli-capability-detail [manifest]="row().manifest" /> }
      @case ('permission') {
        <p class="break-words" [title]="row().permission.detail">{{ row().permission.detail }}</p>
        @if (row().cli === 'copilot') { <ptah-copilot-auto-approve-toggle /> }
      }
      @case ('install') {
        @if (guide()?.command; as command) { <code class="block select-all break-all rounded bg-base-300 p-2 text-xs">{{ command }}</code> }
        <p class="break-words">{{ guide()?.note ?? 'Install the CLI, then Re-detect.' }}</p>
        <button type="button" ptahButton [disabled]="busy()"
          (click)="redetectRequested.emit(row().id)">Re-detect</button>
      }
      @default {
        <p class="break-words">{{ detail() }}</p>
      }
    }
  </div>`,
})
export class CliProviderCardPopoversComponent {
  readonly row = input.required<SystemCliMatrixRow>();
  readonly kind = input.required<CliProviderInfoKind>();
  readonly guide = input<{ readonly command: string | null; readonly note: string }>();
  readonly detail = input('');
  readonly busy = input(false);
  readonly closed = output<void>();
  readonly redetectRequested = output<string>();
  protected heading(): string {
    return ({ info: 'Status', capabilities: 'Capabilities', permission: 'Permissions & safety', install: 'Install guide' })[this.kind()];
  }
}
