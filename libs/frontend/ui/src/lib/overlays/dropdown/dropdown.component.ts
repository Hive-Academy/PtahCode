import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';
import {
  claimOverlayDismissal,
  CONNECTED_OVERLAY_POLICY,
  DROPDOWN_POSITIONS,
} from '../shared/overlay-positions';

/**
 * DropdownComponent - CDK Overlay Dropdown Wrapper
 *
 * Wraps cdkConnectedOverlay for simple dropdown use cases.
 * Renders dropdown in portal at document body level.
 * Supports backdrop click-outside detection.
 *
 * @deprecated Use NativeDropdownComponent from '@ptah-extension/ui' instead.
 * This component uses CDK Overlay which has conflicts with VS Code webview sandboxing.
 * Migration: Replace <ptah-dropdown> with <ptah-native-dropdown>.
 *
 * @example
 * <ptah-dropdown
 *   [isOpen]="isOpen()"
 *   [closeOnBackdropClick]="true"
 *   [positions]="dropdownPositions"
 *   (opened)="onOpen()"
 *   (closed)="onClose()"
 *   (backdropClicked)="onBackdropClick()">
 *
 *   <button trigger (click)="toggleDropdown()">
 *     Open Menu
 *   </button>
 *
 *   <div content class="dropdown-panel">
 *     <ptah-option *ngFor="let item of items" [value]="item">
 *       {{ item.name }}
 *     </ptah-option>
 *   </div>
 * </ptah-dropdown>
 */
@Component({
  selector: 'ptah-dropdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayModule],
  template: `
    <div cdkOverlayOrigin #trigger="cdkOverlayOrigin">
      <ng-content select="[trigger]" />
    </div>

    <ng-template
      [cdkConnectedOverlay]="overlayPolicy"
      [cdkConnectedOverlayOrigin]="trigger"
      [cdkConnectedOverlayOpen]="isOpen()"
      [cdkConnectedOverlayPositions]="positions()"
      [cdkConnectedOverlayHasBackdrop]="hasBackdrop()"
      [cdkConnectedOverlayBackdropClass]="backdropClass()"
      (backdropClick)="handleBackdropClick($event)"
      (overlayKeydown)="handleKeydown($event)"
      (attach)="opened.emit()"
      (detach)="handleDetach()"
    >
      <div
        class="dropdown-panel surface-3 rounded-xl p-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(var(--s))]"
        data-glass-surface="overlay"
      >
        <ng-content select="[content]" />
      </div>
    </ng-template>
  `,
})
export class DropdownComponent {
  protected readonly overlayPolicy = CONNECTED_OVERLAY_POLICY;
  readonly isOpen = input.required<boolean>();
  readonly positions = input<ConnectedPosition[]>(DROPDOWN_POSITIONS);
  readonly hasBackdrop = input(true);
  readonly backdropClass = input('cdk-overlay-transparent-backdrop');
  readonly closeOnBackdropClick = input(true);
  readonly opened = output<void>();
  readonly closed = output<void>();
  readonly backdropClicked = output<void>();

  /**
   * A user dismissal emits `closed` before the caller updates visibility.
   * Suppress the duplicate when that update detaches the panel.
   */
  private closeRequested = false;

  /**
   * Handles backdrop click events.
   * Always emits `backdropClicked`. When `closeOnBackdropClick` is true,
   * also emits `closed` so the parent can close the dropdown (e.g. by
   * setting its `isOpen` signal to `false`). We set an internal flag so
   * the ensuing `cdkConnectedOverlay` detach does not re-emit `closed`.
   */
  handleBackdropClick(event: MouseEvent): void {
    if (!claimOverlayDismissal(event)) return;
    this.backdropClicked.emit();
    if (this.closeOnBackdropClick()) {
      this.requestClose();
    }
  }

  protected handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    this.requestClose();
  }

  private requestClose(): void {
    this.closeRequested = true;
    this.closed.emit();
  }

  /**
   * Handles overlay detach event.
   * Emits `closed` for a programmatic close.
   */
  protected handleDetach(): void {
    if (this.closeRequested) {
      this.closeRequested = false;
      return;
    }
    this.closed.emit();
  }
}
