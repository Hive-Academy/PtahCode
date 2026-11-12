import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { LucideAngularModule, Plus } from 'lucide-angular';
import { PtahBadgeDirective, SetupActionDirective } from '@ptah-extension/ui';

/**
 * The Machines page header (approved option A): the page title with its
 * description on the left, and on the right the pending-approval badge and
 * the primary "Add machine" action.
 *
 * The badge shows only while the store already counts pending approvals; the
 * count arrives from opened sessions, no extra call is made. The status dot
 * is built from Tailwind utilities because the app has no `status-dot` class.
 */
@Component({
  selector: 'ptah-machines-page-header',
  standalone: true,
  imports: [LucideAngularModule, PtahBadgeDirective, SetupActionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="flex flex-wrap items-center gap-3">
      <div class="mr-auto min-w-0">
        <h1 class="text-lg font-semibold tracking-tight text-base-content">
          Machines
        </h1>
        <p class="text-xs text-base-content-muted">
          Remote workspaces and sessions
        </p>
      </div>
      @if (pendingApprovals() > 0) {
        <span
          ptahBadge
          tone="warn"
          appearance="outline"
          size="sm"
          class="gap-2"
          data-testid="machines-approvals-badge"
        >
          <span
            class="inline-block h-2 w-2 shrink-0 rounded-full bg-current"
            aria-hidden="true"
          ></span>
          {{ approvalsText() }}
        </span>
      }
      <button
        type="button"
        [ptahSetupAction]="'primaryCompact'"
        class="gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
        data-testid="machines-add"
        (click)="add.emit()"
      >
        <lucide-angular [img]="PlusIcon" class="h-4 w-4" aria-hidden="true" />
        Add machine
      </button>
    </header>
  `,
})
export class MachinesPageHeaderComponent {
  /** Pending tool approvals across opened sessions, from the store. */
  public readonly pendingApprovals = input(0);

  public readonly add = output<void>();

  protected readonly PlusIcon = Plus;

  protected approvalsText(): string {
    const count = this.pendingApprovals();
    return count === 1 ? '1 approval waiting' : `${count} approvals waiting`;
  }
}
