import { signal, type Signal } from '@angular/core';

export type LaneOrderDirection = 'up' | 'down';

/** One requested move: the whole new order, the id that moved and the way it went. */
export interface LaneOrderMove {
  readonly order: string[];
  readonly movedId: string;
  readonly direction: LaneOrderDirection;
}

export interface LaneOrderDragOptions {
  /** The ids in the displayed order, first lane first. */
  readonly ids: () => readonly string[];
  readonly name: (id: string) => string;
  /** `false` while a move cannot run: a drag is refused and the buttons ask for nothing. */
  readonly canReorder: () => boolean;
  /** A move the host is asked to save. */
  readonly move: (move: LaneOrderMove) => void;
}

/**
 * The reorder logic of a lane list, with no template: Move up / Move down (the keyboard path), HTML5 drag and
 * drop with a drop indicator, and the announcement after a move settles. The view binds its rows to these
 * methods; the host saves the requested move and then calls `settled()`.
 */
export class LaneOrderDrag {
  private readonly dropIndexState = signal<number | null>(null);
  private readonly announcementState = signal('');
  /** Insertion index (0..length) under the dragged row, or `null` when a drop changes nothing. */
  readonly dropIndex: Signal<number | null> = this.dropIndexState.asReadonly();
  /** The text of the polite live region (set after a move settles). */
  readonly announcement: Signal<string> = this.announcementState.asReadonly();
  private dragFrom: number | null = null;
  /** The row that moved and where it was, so `settled()` can tell whether the order changed. */
  private pending: { id: string; from: number } | null = null;

  constructor(private readonly options: LaneOrderDragOptions) {}

  moveUp(index: number): void {
    if (index <= 0) return;
    this.request(index, index - 1);
  }

  moveDown(index: number): void {
    if (index >= this.options.ids().length - 1) return;
    this.request(index, index + 1);
  }

  startDrag(event: DragEvent, index: number): void {
    if (!this.options.canReorder()) {
      event.preventDefault();
      return;
    }
    this.dragFrom = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', this.options.ids()[index]);
    }
  }

  dragOver(event: DragEvent, index: number): void {
    const from = this.dragFrom;
    if (from === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const row = event.currentTarget as HTMLElement;
    const rect = row.getBoundingClientRect();
    const target =
      event.clientY < rect.top + rect.height / 2 ? index : index + 1;
    // Before or after the dragged row itself is no move: no indicator.
    this.dropIndexState.set(
      target === from || target === from + 1 ? null : target,
    );
  }

  drop(event: DragEvent): void {
    event.preventDefault();
    const from = this.dragFrom,
      target = this.dropIndexState();
    this.endDrag();
    if (from === null || target === null) return;
    this.request(from, target > from ? target - 1 : target);
  }

  endDrag(): void {
    this.dragFrom = null;
    this.dropIndexState.set(null);
  }

  /**
   * Called once the save of a move ends and `ids()` is the read-back order. The new position is announced only
   * when the row moved. `focus` returns focus to the moved row; the view owns the DOM, so it supplies it.
   */
  settled(
    id: string,
    direction: LaneOrderDirection,
    focus: (id: string, direction: LaneOrderDirection) => void,
  ): void {
    const pending = this.pending;
    this.pending = null;
    const ids = this.options.ids();
    const index = ids.indexOf(id);
    if (pending?.id === id && index >= 0 && index !== pending.from)
      this.announcementState.set(
        `${this.options.name(id)} moved to position ${index + 1} of ${ids.length}`,
      );
    focus(id, direction);
  }

  private request(from: number, to: number): void {
    if (from === to || !this.options.canReorder()) return;
    const order = [...this.options.ids()];
    const [movedId] = order.splice(from, 1);
    order.splice(to, 0, movedId);
    this.pending = { id: movedId, from };
    this.options.move({
      order,
      movedId,
      direction: to < from ? 'up' : 'down',
    });
  }
}
