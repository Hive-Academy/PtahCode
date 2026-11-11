import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { InboxLayoutComponent, InboxRowDirective } from '@ptah-extension/ui';

/**
 * Demo of the shared inbox shell (TASK_2026_913). Kept in its own component
 * scope: the gallery also demos the foundation `ptah-list-detail`, and two
 * components with the same tag cannot share one template scope (Angular throws
 * "Multiple components match node with tagname").
 */
@Component({
  selector: 'ptah-inbox-layout-demo',
  standalone: true,
  imports: [InboxLayoutComponent, InboxRowDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-inbox-layout
    listLabel="Sample machines"
    detailLabel="Machine detail"
    [listWidth]="280"
  >
    <div
      inboxList
      role="listbox"
      aria-label="Sample machines"
      class="grid content-start gap-ptah-controls"
    >
      @for (row of rows; track row) {
        <button
          ptahInboxRow
          [selected]="selected() === row"
          (click)="selected.set(row)"
        >
          {{ row }}
        </button>
      }
    </div>
    <h3 class="text-ptah-group-title">{{ selected() }}</h3>
    <p class="mt-ptah-label text-ptah-hint text-base-content-muted">
      Sessions, approvals and the machine clock appear here. Pick another
      machine in the list.
    </p>
  </ptah-inbox-layout>`,
})
export class InboxLayoutDemoComponent {
  public readonly rows = ['Atlas', 'Nimbus', 'Zephyr'];
  public readonly selected = signal('Atlas');
}
