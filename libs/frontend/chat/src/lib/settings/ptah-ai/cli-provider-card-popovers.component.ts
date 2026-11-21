import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { LucideAngularModule, X } from 'lucide-angular';
import type { SystemCliMatrixRow } from './cli-matrix-rows';
import {
  PtahButtonDirective,
  PtahIconButtonDirective,
} from '@ptah-extension/ui';

/** The one popover kind left (decision 13): facts, permission and capabilities are inline in the detail. */
export type CliProviderInfoKind = 'install';

/**
 * The install guide popover of a CLI that is not installed: the install command, the note and Re-detect (U-6).
 * Callers: the expanded detail (keyless Cursor) and the Add more strip.
 */
@Component({
  selector: 'ptah-cli-provider-card-popovers',
  standalone: true,
  imports: [LucideAngularModule, PtahButtonDirective, PtahIconButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    role="dialog"
    [attr.aria-label]="row().name + ' ' + kind()"
    class="w-[19rem] max-w-[calc(100vw-2rem)] space-y-2 p-3 text-sm text-base-content"
    data-testid="cli-provider-popover-content"
  >
    <div
      class="flex items-center justify-between gap-2 border-b border-base-content/10 pb-2"
    >
      <h3 class="font-semibold">{{ row().name }} · Install guide</h3>
      <button
        type="button"
        ptahIconButton
        label="Close"
        (click)="closed.emit()"
      >
        <lucide-angular
          [img]="CloseIcon"
          class="h-3.5 w-3.5"
          aria-hidden="true"
        />
      </button>
    </div>
    @if (guide()?.command; as command) {
      <code
        class="block select-all break-all rounded bg-base-300 p-2 text-xs"
        >{{ command }}</code
      >
    }
    <p class="break-words">
      {{ guide()?.note ?? 'Install the CLI, then Re-detect.' }}
    </p>
    <button
      type="button"
      ptahButton
      [disabled]="busy()"
      (click)="redetectRequested.emit(row().id)"
    >
      Re-detect
    </button>
  </div>`,
})
export class CliProviderCardPopoversComponent {
  protected readonly CloseIcon = X;
  readonly row = input.required<SystemCliMatrixRow>();
  readonly kind = input.required<CliProviderInfoKind>();
  readonly guide = input<{
    readonly command: string | null;
    readonly note: string;
  }>();
  readonly busy = input(false);
  readonly closed = output<void>();
  readonly redetectRequested = output<string>();
}
