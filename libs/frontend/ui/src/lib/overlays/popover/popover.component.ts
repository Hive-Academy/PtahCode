import { A11yModule, FocusTrap, FocusTrapFactory } from '@angular/cdk/a11y';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  output,
  viewChild,
} from '@angular/core';
import {
  claimOverlayDismissal,
  CONNECTED_OVERLAY_POLICY,
  POPOVER_POSITION_MAP,
} from '../shared/overlay-positions';

/**
 * PopoverComponent - Modal-like Popover with Focus Trap
 *
 * Similar to DropdownComponent but with modal behavior:
 * - Dark/transparent backdrop blocks background interaction
 * - Focus trapped within popover content
 * - Escape key closes and returns focus to trigger
 *
 * @deprecated Use NativePopoverComponent from '@ptah-extension/ui' instead.
 * This component uses CDK Overlay/A11y which has conflicts with VS Code webview sandboxing.
 * Migration: Replace <ptah-popover> with <ptah-native-popover>.
 *
 * @example
 * <ptah-popover
 *   [isOpen]="isOpen()"
 *   [position]="'below'"
 *   [hasBackdrop]="true"
 *   [backdropClass]="'cdk-overlay-dark-backdrop'"
 *   (closed)="onClose()">
 *
 *   <button trigger (click)="togglePopover()">
 *     Open Settings
 *   </button>
 *
 *   <div content class="popover-panel">
 *     <h3>Settings</h3>
 *     <button (click)="save()">Save</button>
 *     <button (click)="cancel()">Cancel</button>
 *   </div>
 * </ptah-popover>
 */
@Component({
  selector: 'ptah-popover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayModule, A11yModule],
  template: `
    <div cdkOverlayOrigin #trigger="cdkOverlayOrigin">
      <ng-content select="[trigger]" />
    </div>

    <ng-template
      [cdkConnectedOverlay]="overlayPolicy"
      [cdkConnectedOverlayOrigin]="trigger"
      [cdkConnectedOverlayOpen]="isOpen()"
      [cdkConnectedOverlayPositions]="getPositions()"
      [cdkConnectedOverlayHasBackdrop]="hasBackdrop()"
      [cdkConnectedOverlayBackdropClass]="backdropClass()"
      (backdropClick)="handleBackdropClick($event)"
      (overlayKeydown)="handleKeydown($event)"
      (attach)="handleAttach()"
      (detach)="handleDetach()"
    >
      <div
        data-glass-surface="overlay"
        #popoverContent
        class="popover-panel surface-3 rounded-xl p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(var(--s))]"
        tabindex="-1"
      >
        <ng-content select="[content]" />
      </div>
    </ng-template>
  `,
})
export class PopoverComponent implements OnDestroy {
  protected readonly overlayPolicy = CONNECTED_OVERLAY_POLICY;
  private readonly focusTrapFactory = inject(FocusTrapFactory);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private focusTrap: FocusTrap | null = null;
  private previousFocus: HTMLElement | null = null;
  private closeRequested = false;

  readonly popoverContent =
    viewChild<ElementRef<HTMLElement>>('popoverContent');
  readonly isOpen = input.required<boolean>();
  readonly position = input<'above' | 'below' | 'before' | 'after'>('below');
  readonly positions = input<ConnectedPosition[]>(); // Custom positions override
  readonly hasBackdrop = input(true);
  readonly backdropClass = input('cdk-overlay-transparent-backdrop');
  readonly opened = output<void>();
  readonly closed = output<void>();
  readonly backdropClicked = output<void>();

  ngOnDestroy(): void {
    this.releaseFocus();
  }

  /**
   * Returns position configurations for the popover based on the selected position input.
   * If custom positions are provided via input, uses those instead.
   * Defaults to 'below' position if invalid position provided and no custom positions.
   */
  getPositions(): ConnectedPosition[] {
    const customPositions = this.positions();
    if (customPositions && customPositions.length > 0) {
      return customPositions;
    }
    const position = this.position();
    return POPOVER_POSITION_MAP[position] || POPOVER_POSITION_MAP['below'];
  }

  /**
   * Handles overlay attach event - creates focus trap and focuses first element.
   * Called automatically when cdkConnectedOverlay opens.
   */
  handleAttach(): void {
    this.closeRequested = false;
    const active = this.host.nativeElement.ownerDocument.activeElement;
    this.previousFocus = active instanceof HTMLElement ? active : null;
    afterNextRender(() => {
      const content = this.popoverContent()?.nativeElement;
      if (!this.isOpen() || !content?.isConnected) return;
      this.focusTrap = this.focusTrapFactory.create(content);
      if (!this.focusTrap.focusInitialElement()) content.focus();
    }, { injector: this.injector });
    this.opened.emit();
  }

  /**
   * Handles overlay detach event - destroys focus trap and returns focus to trigger.
   * Called automatically when cdkConnectedOverlay closes.
   */
  handleDetach(): void {
    this.releaseFocus();
    if (!this.closeRequested) this.closed.emit();
  }

  /**
   * Handles backdrop click event.
   * Emits backdropClicked event and signals parent to close popover.
   */
  handleBackdropClick(event: MouseEvent): void {
    if (!claimOverlayDismissal(event)) return;
    this.backdropClicked.emit();
    this.handleEscape();
  }

  protected handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    this.handleEscape();
  }

  /**
   * Handles Escape key press when popover is open.
   * Signals parent to close popover.
   */
  handleEscape(): void {
    this.closeRequested = true;
    this.closed.emit();
  }

  private releaseFocus(): void {
    this.focusTrap?.destroy();
    this.focusTrap = null;
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    this.previousFocus = null;
  }
}
