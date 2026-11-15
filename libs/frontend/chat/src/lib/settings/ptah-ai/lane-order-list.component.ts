import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  LucideAngularModule,
} from 'lucide-angular';
import { PtahIconButtonDirective } from '@ptah-extension/ui';

/** One entry of the preferred lane order: an installed system CLI or a Ptah CLI instance. */
export interface LaneOrderChip {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export type LaneOrderDirection = 'up' | 'down';

/** One requested move: the whole new order, the id that moved and the way it went. */
export interface LaneOrderMove {
  readonly order: string[];
  readonly movedId: string;
  readonly direction: LaneOrderDirection;
}

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
          (dragstart)="startDrag($event, i)"
          (dragover)="dragOver($event, i)"
          (drop)="drop($event)"
          (dragend)="endDrag()"
        >
          @if (dropIndex() === i) {
            <div
              class="pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded bg-primary"
              aria-hidden="true"
              data-testid="policy-order-drop-indicator"
            ></div>
          }
          @if (last && dropIndex() === chips().length) {
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
            (click)="moveUp(i)"
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
            (click)="moveDown(i)"
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
      {{ announcement() }}
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

  /** The text of the polite live region (set after a move settles). */
  protected readonly announcement = signal('');
  /** Insertion index (0..length) under the dragged row, or `null` when a drop changes nothing. */
  protected readonly dropIndex = signal<number | null>(null);
  private dragFrom: number | null = null;
  /** The row that moved and where it was, so `settled()` can tell whether the order changed. */
  private pending: { id: string; from: number } | null = null;

  protected moveUp(index: number): void {
    if (index <= 0) return;
    this.request(index, index - 1);
  }

  protected moveDown(index: number): void {
    if (index >= this.chips().length - 1) return;
    this.request(index, index + 1);
  }

  protected startDrag(event: DragEvent, index: number): void {
    if (!this.canReorder()) {
      event.preventDefault();
      return;
    }
    this.dragFrom = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', this.chips()[index].id);
    }
  }

  protected dragOver(event: DragEvent, index: number): void {
    const from = this.dragFrom;
    if (from === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const row = event.currentTarget as HTMLElement;
    const rect = row.getBoundingClientRect();
    const target =
      event.clientY < rect.top + rect.height / 2 ? index : index + 1;
    // Before or after the dragged row itself is no move: no indicator.
    this.dropIndex.set(target === from || target === from + 1 ? null : target);
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    const from = this.dragFrom,
      target = this.dropIndex();
    this.endDrag();
    if (from === null || target === null) return;
    this.request(from, target > from ? target - 1 : target);
  }

  protected endDrag(): void {
    this.dragFrom = null;
    this.dropIndex.set(null);
  }

  /**
   * Called by the host once the save of a move ends. The rows show the read-back order: focus returns to the moved
   * row's button used (or its other one at an end), and the new position is announced only when the row moved.
   */
  settled(id: string, direction: LaneOrderDirection): void {
    const pending = this.pending;
    this.pending = null;
    const chips = this.chips();
    const index = chips.findIndex((chip) => chip.id === id);
    if (pending?.id === id && index >= 0 && index !== pending.from)
      this.announcement.set(
        `${chips[index].name} moved to position ${index + 1} of ${chips.length}`,
      );
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
    );
  }

  private request(from: number, to: number): void {
    if (from === to || !this.canReorder()) return;
    const order = this.chips().map((chip) => chip.id);
    const [movedId] = order.splice(from, 1);
    order.splice(to, 0, movedId);
    this.pending = { id: movedId, from };
    this.reorder.emit({
      order,
      movedId,
      direction: to < from ? 'up' : 'down',
    });
  }
}
