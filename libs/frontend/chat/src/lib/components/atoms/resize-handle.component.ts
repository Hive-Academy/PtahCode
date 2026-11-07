/**
 * Resize Handle Component
 *
 * Self-contained, pluggable drag handle for resizing an adjacent panel.
 * Uses Angular CDK Drag with horizontal axis lock.
 *
 * Usage:
 *   <ptah-resize-handle />
 *
 * Place as a flex sibling between the content area and the panel to resize.
 * Injects PanelResizeService to update width state.
 *
 * Features:
 *   - CDK drag with x-axis lock
 *   - col-resize cursor, grip indicator, hover highlight
 *   - Double-click to reset to responsive defaults
 *   - Disables text selection during drag
 *   - Sets body cursor during drag for seamless feel
 */

import { Component, ChangeDetectionStrategy, inject, input } from '@angular/core';
import { CdkDrag, CdkDragMove } from '@angular/cdk/drag-drop';
import { PanelResizeService } from '../../services/panel-resize.service';
import { RESIZE_HANDLE_STYLES } from '@ptah-extension/chat-ui';

@Component({
  selector: 'ptah-resize-handle',
  standalone: true,
  imports: [CdkDrag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: RESIZE_HANDLE_STYLES,
  template: `
    <div
      class="resize-handle"
      role="separator"
      aria-orientation="vertical"
      cdkDrag
      cdkDragLockAxis="x"
      (cdkDragStarted)="onDragStarted()"
      (cdkDragMoved)="onDragMoved($event)"
      (cdkDragEnded)="onDragEnded()"
      (dblclick)="onDoubleClick()"
    ></div>
  `,
})
export class ResizeHandleComponent {
  private readonly resizeService = inject(PanelResizeService);
  readonly container = input<HTMLElement | null>(null);

  onDragStarted(): void {
    this.resizeService.setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  onDragMoved(event: CdkDragMove): void {
    event.source.element.nativeElement.style.transform = 'none';
    const container = this.container();
    if (!container) {
      this.resizeService.setCustomWidth(
        window.innerWidth - event.pointerPosition.x,
      );
      return;
    }
    // The panel ends at the container's content edge, and CSS percentages
    // resolve against the content box, so measure both without padding.
    const style = getComputedStyle(container);
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const contentRight = container.getBoundingClientRect().right - paddingRight;
    this.resizeService.setCustomWidth(
      contentRight - event.pointerPosition.x,
      container.clientWidth - paddingLeft - paddingRight,
    );
  }

  onDragEnded(): void {
    this.resizeService.setDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  onDoubleClick(): void {
    this.resizeService.resetWidth();
  }
}
