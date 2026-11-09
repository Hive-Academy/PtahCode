import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, inject, input, output, signal } from '@angular/core';

type ScreenPoint = { x: number; y: number };
type ScreenBounds = { x: number; y: number; width: number; height: number };

export function draggedOutsideWindow(
  start: ScreenPoint,
  end: ScreenPoint,
  bounds: ScreenBounds,
  threshold = 8,
  margin = 24,
): boolean {
  if (Math.hypot(end.x - start.x, end.y - start.y) < threshold) return false;
  return end.x < bounds.x - margin || end.x > bounds.x + bounds.width + margin ||
    end.y < bounds.y - margin || end.y > bounds.y + bounds.height + margin;
}

@Directive({
  selector: '[ptahDisplayDragOut]',
  standalone: true,
  host: {
    '[class.cursor-grab]': 'enabled() && !dragging()',
    '[class.cursor-grabbing]': 'dragging()',
    '[style.user-select]': "dragging() ? 'none' : null",
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'cancel()',
    '(lostpointercapture)': 'cancel()',
    '(document:keydown.escape)': 'cancel()',
  },
})
export class DisplayDragOutDirective {
  readonly enabled = input(false, { alias: 'ptahDisplayDragOut' });
  readonly draggedOut = output<void>();
  protected readonly dragging = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly view = inject(DOCUMENT).defaultView;
  private start: ScreenPoint | null = null;
  private pointerId: number | null = null;

  protected onPointerDown(event: PointerEvent): void {
    if (!this.enabled() || !event.isPrimary || event.button !== 0 ||
        !(event.target instanceof Element) ||
        event.target.closest('button, a, input, select, textarea, [role="button"]')) return;
    try {
      this.host.setPointerCapture(event.pointerId);
    } catch (error: unknown) {
      if (!(error instanceof DOMException)) throw error;
      return;
    }
    this.start = { x: event.screenX, y: event.screenY };
    this.pointerId = event.pointerId;
  }

  protected onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId || !this.start) return;
    this.dragging.set(Math.hypot(event.screenX - this.start.x, event.screenY - this.start.y) >= 8);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId || !this.start) return;
    const view = this.view;
    const detach = !!view && this.enabled() && draggedOutsideWindow(
      this.start,
      { x: event.screenX, y: event.screenY },
      { x: view.screenX, y: view.screenY, width: view.outerWidth, height: view.outerHeight },
    );
    this.cancel();
    if (detach) this.draggedOut.emit();
  }

  protected cancel(): void {
    if (this.pointerId === null) return;
    const pointerId = this.pointerId;
    this.start = null;
    this.pointerId = null;
    this.dragging.set(false);
    if (this.host.hasPointerCapture(pointerId)) this.host.releasePointerCapture(pointerId);
  }
}
