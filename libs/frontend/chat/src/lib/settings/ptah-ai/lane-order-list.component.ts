import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
} from '@angular/core';
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  LucideAngularModule,
} from 'lucide-angular';
import { PtahIconButtonDirective } from '@ptah-extension/ui';
import {
  LaneOrderDrag,
  type LaneOrderDirection,
  type LaneOrderMove,
} from './lane-order-drag';

/** One entry of the preferred lane order: an installed system CLI or a Ptah CLI instance. */
export interface LaneOrderChip {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

// Re-exported for the callers of this file until the list is deleted (B3.10).
export type { LaneOrderDirection, LaneOrderMove } from './lane-order-drag';

/**
 * The editable preferred lane order (inside the order popover of `ptah-agent-orchestration-config`).
 * One row per agent: a grip for drag and drop (HTML5, with a drop indicator), and Move up / Move down buttons,
 * which are the keyboard path. The list only asks for a move (`reorder`); the host saves it and then calls
 * `settled()`, which returns focus to the moved row and announces its new position through a polite live region.
 */
@Component({
  selector: 'ptah-lane-order-list',
  standalone: true,
  imports: [LucideAngularModule, PtahIconButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ol
      class="flex flex-col gap-[var(--ptah-gap-label)]"
      aria-describedby="policy-order-hint"
      data-testid="policy-order-list"
    >
      @for (
        chip of chips();
        track chip.id;
        let i = $index, first = $first, last = $last
      ) {
        <li
          class="relative flex items-center gap-[var(--ptah-gap-label)] text-xs"
          [attr.draggable]="canReorder() ? 'true' : 'false'"
          [attr.data-testid]="'policy-order-row-' + chip.id"
          (dragstart)="drag.startDrag($event, i)"
          (dragover)="drag.dragOver($event, i)"
          (drop)="drag.drop($event)"
          (dragend)="drag.endDrag()"
        >
          @if (drag.dropIndex() === i) {
            <div
              class="pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded bg-primary"
              aria-hidden="true"
              data-testid="policy-order-drop-indicator"
            ></div>
          }
          @if (last && drag.dropIndex() === chips().length) {
            <div
              class="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded bg-primary"
              aria-hidden="true"
              data-testid="policy-order-drop-indicator"
            ></div>
          }
          <lucide-angular
            [img]="GripIcon"
            class="h-3.5 w-3.5 shrink-0 cursor-grab text-base-content-muted"
            aria-hidden="true"
            [attr.data-testid]="'policy-order-grip-' + chip.id"
          />
          <span
            class="min-w-0 flex-1 truncate font-bold"
            [class.text-base-content]="chip.enabled"
            [class.text-base-content-muted]="!chip.enabled"
            >{{ i + 1 }}. {{ chip.name }}</span
          >
          @if (!chip.enabled) {
            <span class="text-xs text-base-content-muted">off</span>
          }
          <!-- Native disabled only at the ends; while a move cannot run (saving, not read) the buttons are
               aria-disabled and ignore clicks, so the focused one keeps focus and Esc closes the popover. -->
          <button
            type="button"
            ptahIconButton
            [disabled]="first"
            [busy]="!canReorder()"
            [label]="'Move ' + chip.name + ' up'"
            [attr.data-testid]="'policy-order-up-' + chip.id"
            (click)="drag.moveUp(i)"
          >
            <lucide-angular
              [img]="UpIcon"
              class="h-3.5 w-3.5"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            ptahIconButton
            [disabled]="last"
            [busy]="!canReorder()"
            [label]="'Move ' + chip.name + ' down'"
            [attr.data-testid]="'policy-order-down-' + chip.id"
            (click)="drag.moveDown(i)"
          >
            <lucide-angular
              [img]="DownIcon"
              class="h-3.5 w-3.5"
              aria-hidden="true"
            />
          </button>
        </li>
      }
    </ol>
    <p
      id="policy-order-hint"
      class="mt-[var(--ptah-gap-controls)] text-xs text-base-content-muted"
      data-testid="policy-order-hint"
    >
      The first available agent is used when no CLI is specified.
    </p>
    <p
      class="sr-only"
      aria-live="polite"
      aria-atomic="true"
      data-testid="policy-order-live"
    >
      {{ drag.announcement() }}
    </p>
  `,
})
export class LaneOrderListComponent {
  protected readonly UpIcon = ChevronUp;
  protected readonly DownIcon = ChevronDown;
  protected readonly GripIcon = GripVertical;

  /** The order to show, first lane first. */
  readonly chips = input.required<readonly LaneOrderChip[]>();
  /** `false` while a move cannot run: the buttons are aria-disabled and a drag is refused. */
  readonly canReorder = input(false);
  /** A move the host is asked to save. */
  readonly reorder = output<LaneOrderMove>();

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** The move and drag logic; the template binds its rows to it. */
  protected readonly drag = new LaneOrderDrag({
    ids: () => this.chips().map((chip) => chip.id),
    name: (id) => this.chips().find((chip) => chip.id === id)?.name ?? id,
    canReorder: () => this.canReorder(),
    move: (move) => this.reorder.emit(move),
  });

  /**
   * Called by the host once the save of a move ends. The rows show the read-back order: focus returns to the moved
   * row's button used (or its other one at an end), and the new position is announced only when the row moved.
   */
  settled(id: string, direction: LaneOrderDirection): void {
    this.drag.settled(id, direction, () =>
      afterNextRender(
        () => {
          const other = direction === 'up' ? 'down' : 'up';
          const host = this.element.nativeElement;
          [direction, other]
            .map((which) =>
              host.querySelector<HTMLButtonElement>(
                `[data-testid="policy-order-${which}-${id}"]`,
              ),
            )
            .find((button) => button && !button.disabled)
            ?.focus();
        },
        { injector: this.injector },
      ),
    );
  }
}
