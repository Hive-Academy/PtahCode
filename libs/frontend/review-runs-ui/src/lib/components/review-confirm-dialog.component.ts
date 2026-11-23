import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, inject, input, output, signal, viewChild } from '@angular/core';
import { PtahButtonDirective, PtahCheckboxDirective } from '@ptah-extension/ui';

/**
 * Confirmation dialog for review settings actions. The root is a manual popover, so it sits in the
 * top layer above the settings drawer (also a top-layer popover) and no isolated glass pane can
 * paint over it. The panel is opaque `bg-base-100`: glass turns `.surface-1` translucent.
 */
@Component({
  selector: 'ptah-review-confirm-dialog', standalone: true,
  imports: [PtahButtonDirective, PtahCheckboxDirective], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #layer popover="manual" class="review-confirm-layer fixed inset-0 z-[60]">
      <div class="flex h-full w-full items-center justify-center bg-black/60 p-4">
        <section class="w-full max-w-md rounded-box border border-base-300 bg-base-100 p-5 shadow-2xl" role="dialog"
          aria-modal="true" [attr.aria-labelledby]="dialogId()" [attr.aria-describedby]="dialogId() + '-description'"
          (keydown)="onKeydown($event)">
          <h2 class="text-xl font-semibold" [id]="dialogId()" tabindex="-1">{{ title() }}</h2>
          <p class="mt-3 text-sm" [id]="dialogId() + '-description'">{{ description() }}</p>
          @if (requirePermissions()) { <label class="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" ptahCheckbox [checked]="acknowledged()" (change)="acknowledged.set(!acknowledged())" />
            I confirm this bot token has Pull requests: Read and write, Contents: Read, and Metadata: Read for this repository.</label> }
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" ptahButton variant="ghost" size="md" (click)="cancelled.emit()">Cancel</button>
            <button type="button" ptahButton variant="primary" size="md" [disabled]="requirePermissions() && !acknowledged()" (click)="confirmed.emit()">{{ confirmLabel() }}</button>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [
    `
      /* Reset the UA [popover] box (as native-drawer.component.ts) so the layer covers the viewport. */
      .review-confirm-layer {
        width: 100%;
        height: 100%;
        max-width: none;
        max-height: none;
        margin: 0;
        border: 0;
        padding: 0;
        overflow: visible;
        background: transparent;
        color: inherit;
      }

      .review-confirm-layer::backdrop {
        background: transparent;
      }
    `,
  ],
})
export class ReviewConfirmDialogComponent implements AfterViewInit, OnDestroy {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly layer = viewChild.required<ElementRef<HTMLElement>>('layer');
  private returnFocus: HTMLElement | null = null;
  readonly dialogId = input.required<string>();
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly confirmLabel = input('Confirm');
  readonly requirePermissions = input(false);
  readonly acknowledged = signal(false);
  readonly cancelled = output<void>();
  readonly confirmed = output<void>();

  ngAfterViewInit(): void {
    const document = this.element.nativeElement.ownerDocument;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.showLayer();
    this.element.nativeElement.querySelector<HTMLElement>('h2')?.focus();
  }
  ngOnDestroy(): void { this.returnFocus?.focus(); }
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.cancelled.emit(); return; }
    if (event.key !== 'Tab') return;
    const items = Array.from(this.element.nativeElement.querySelectorAll<HTMLElement>('h2, button:not([disabled])'));
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && this.element.nativeElement.ownerDocument.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && this.element.nativeElement.ownerDocument.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  /** Promote the root to the top layer. Without the Popover API it stays in the page layer. */
  private showLayer(): void {
    const layer = this.layer().nativeElement;
    if (typeof layer.showPopover !== 'function') return;
    try {
      if (!layer.matches(':popover-open')) layer.showPopover();
    } catch {
      // Not connected: the dialog stays in the page layer.
    }
  }
}
