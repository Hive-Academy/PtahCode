import { signal, type Signal } from '@angular/core';

export type LaneOrderDirection = 'up' | 'down';

/** One requested move: the whole new order, the id that moved and the way it went. */
export interface LaneOrderMove {
  readonly order: string[];
  readonly movedId: string;
  readonly direction: LaneOrderDirection;
}

/** The end of a requested move's save: its outcome and the confirmed numbered id order after the read-back. */
export interface LaneOrderSettlement {
  readonly id: string;
  readonly direction: LaneOrderDirection;
  readonly saved: boolean;
  readonly order: readonly string[];
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
  /**
   * The dragged row's id and the id sequence when the drag started. A drop resolves the source by id; when the
   * sequence changed during the drag (a detection refresh inserted or removed a lane), the drag is cancelled.
   */
  private dragged: { id: string; ids: readonly string[] } | null = null;
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
    const ids = [...this.options.ids()];
    const id = ids[index];
    if (id === undefined) {
      event.preventDefault();
      return;
    }
    this.dragged = { id, ids };
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
    }
  }

  dragOver(event: DragEvent, index: number): void {
    const from = this.dragSource();
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
    const from = this.dragSource(),
      target = this.dropIndexState();
    this.endDrag();
    if (from === null || target === null) return;
    this.request(from, target > from ? target - 1 : target);
  }

  endDrag(): void {
    this.dragged = null;
    this.dropIndexState.set(null);
  }

  /**
   * Called once the save of a move ends. `result.order` is the confirmed numbered id order from the read-back
   * (the host passes it, so a child input that has yet to render cannot hide the move). The new position is
   * announced only for a saved move that changed the row's position; a failed or refused save announces
   * nothing. `focus` returns focus to the moved row in both cases; the view owns the DOM, so it supplies it.
   */
  settled(
    result: LaneOrderSettlement,
    focus: (id: string, direction: LaneOrderDirection) => void,
  ): void {
    const pending = this.pending;
    this.pending = null;
    const { id, direction, saved, order } = result;
    const index = order.indexOf(id);
    if (saved && pending?.id === id && index >= 0 && index !== pending.from)
      this.announcementState.set(
        `${this.options.name(id)} moved to position ${index + 1} of ${order.length}`,
      );
    focus(id, direction);
  }

  /** The dragged row's current index, or `null` (and the drag ends) when the id sequence changed. */
  private dragSource(): number | null {
    const dragged = this.dragged;
    if (!dragged) return null;
    const ids = this.options.ids();
    const same =
      ids.length === dragged.ids.length &&
      ids.every((id, index) => id === dragged.ids[index]);
    if (!same) {
      this.endDrag();
      return null;
    }
    return ids.indexOf(dragged.id);
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
