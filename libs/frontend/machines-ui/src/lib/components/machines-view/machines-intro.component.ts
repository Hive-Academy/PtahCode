import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { LucideAngularModule, Plus } from 'lucide-angular';
import { PtahButtonDirective } from '@ptah-extension/ui';

/** The worker's Phase 1 checks, named for the empty state's "What is checked?". */
const CHECKED_ITEMS: readonly string[] = [
  'Operating system',
  'Node 22 or newer, and the session database loads',
  'Ptah and protocol versions are compatible',
  'The worker service listens on loopback only',
  'At least one workspace folder is registered and readable',
  'At least one provider is signed in',
  'The session driver lock works and none is stranded',
];

/**
 * The Machines page's detail pane with no machine yet (design 4.1): the
 * empty-state copy of the approved option A, "Add machine", and the list of
 * checks a machine must pass.
 */
@Component({
  selector: 'ptah-machines-intro',
  standalone: true,
  imports: [PtahButtonDirective, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mx-auto flex max-w-[52ch] flex-col items-center gap-3 p-8 text-center"
      data-testid="machines-empty"
    >
      <h2 class="text-lg font-semibold tracking-tight text-base-content">
        No machines yet
      </h2>
      <p class="text-sm text-base-content-muted">
        Add a machine to run sessions on a remote workspace. Ptah reaches each
        machine through your own SSH login, so nothing is opened on your
        network.
      </p>
      <button
        type="button"
        ptahButton
        variant="primary"
        data-testid="machines-empty-add"
        (click)="add.emit()"
      >
        <lucide-angular [img]="PlusIcon" class="h-4 w-4" aria-hidden="true" />
        Add machine
      </button>
      <details class="text-left text-xs text-base-content-muted">
        <summary
          class="cursor-pointer text-center underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
        >
          What is checked?
        </summary>
        <ol class="mt-2 list-decimal pl-5" data-testid="machines-checked">
          @for (item of checkedItems; track item) {
            <li>{{ item }}</li>
          }
        </ol>
      </details>
    </div>
  `,
})
export class MachinesIntroComponent {
  public readonly add = output<void>();

  protected readonly checkedItems = CHECKED_ITEMS;
  protected readonly PlusIcon = Plus;
}
