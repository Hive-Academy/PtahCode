import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CdkConnectedOverlay } from '@angular/cdk/overlay';
import { CdkScrollable } from '@angular/cdk/scrolling';
import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  OnChanges,
  OnDestroy,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import type { Placement } from '@floating-ui/dom';
import { DEFAULT_OVERLAY_OFFSET } from '../shared/floating-offsets';
import {
  registerOwnedOverlay,
  watchAncestorScroll,
  type OwnedOverlayRegistration,
} from '../../overlays/shared/connected-overlay-watch';
import {
  claimOverlayDismissal,
  connectedPopoverPositions,
  CONNECTED_OVERLAY_POLICY,
  detachConnectedChildren,
  registerConnectedChild,
} from '../../overlays/shared/overlay-positions';
import { restorePopoverFocus } from '../../overlays/shared/restore-popover-focus';

/** Controlled popover with projected trigger and content slots. */
@Component({
  selector: 'ptah-native-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkConnectedOverlay, CdkScrollable, CdkTrapFocus],
  template: `
    <div #trigger class="popover-trigger inline-block">
      <ng-content select="[trigger]" />
    </div>

    @if (isOpen()) {
      <ng-template
        [cdkConnectedOverlay]="overlayPolicy"
        [cdkConnectedOverlayOrigin]="connectedAnchor(trigger)"
        [cdkConnectedOverlayOpen]="true"
        [cdkConnectedOverlayPositions]="positions()"
        [cdkConnectedOverlayPush]="keepInViewport() || capActive()"
        [cdkConnectedOverlayMinHeight]="capActive() ? 48 : 0"
        [cdkConnectedOverlayHasBackdrop]="hasBackdrop()"
        [cdkConnectedOverlayBackdropClass]="backdropClass() === 'dark' ? 'cdk-overlay-dark-backdrop' : 'cdk-overlay-transparent-backdrop'"
        (attach)="onAttach(trigger)"
        (overlayKeydown)="onKeydown($event)"
        (backdropClick)="onBackdropClick($event)"
      >
        <div
          #panel
          cdkScrollable
          [cdkTrapFocus]="hasBackdrop()"
          class="popover-panel surface-3 rounded-xl p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(var(--s))]"
          [class.ptah-popover-capped]="capActive()"
          tabindex="-1"
        >
          <ng-content select="[content]" />
        </div>
      </ng-template>
    }
  `,
  styles: `
    :host {
      display: inline-block;
    }

    .popover-panel {
      min-width: 0;
      min-height: 0;
    }

    .ptah-popover-capped {
      max-width: calc(100vw - 16px);
      max-height: var(--ptah-popover-max-h, min(28rem, calc(100dvh - 16px)));
      overflow: auto;
      overscroll-behavior: contain;
    }
  `,
})
export class NativePopoverComponent implements OnChanges, OnDestroy {
  readonly isOpen = input.required<boolean>();
  readonly placement = input<Placement>('bottom');
  /** Optional external positioning anchor. */
  readonly anchor = input<HTMLElement | null>(null);
  readonly offset = input(DEFAULT_OVERLAY_OFFSET);
  readonly hasBackdrop = input(true);
  /** Disable when the caller manages focus after closing. */
  readonly restoreFocus = input(true);
  readonly backdropClass = input<'transparent' | 'dark'>('dark');
  /** Allow the panel to shift over its anchor if neither preferred side fits. */
  readonly keepInViewport = input(true);
  /** Captured on open so a live change applies on the next open. */
  readonly capToViewport = input(true);
  readonly opened = output<void>();
  readonly closed = output<void>();
  readonly backdropClicked = output<void>();

  /** Present while the content is attached to the overlay. */
  readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly overlayPolicy = CONNECTED_OVERLAY_POLICY;
  protected readonly positions = computed(() => connectedPopoverPositions(this.placement(), this.offset()));
  protected readonly capActive = computed(() => {
    this.isOpen();
    return untracked(this.capToViewport);
  });

  private readonly overlay = viewChild(CdkConnectedOverlay);
  private readonly trigger = viewChild<ElementRef<HTMLElement>>('trigger');
  private readonly injector = inject(Injector);
  private returnFocus: HTMLElement | null = null;
  private attachedPanel?: HTMLElement;
  private unregisterChild?: () => void;
  private owned?: OwnedOverlayRegistration;
  private stopScroll?: () => void;

  constructor() {
    afterRenderEffect((onCleanup) => {
      const trigger = this.trigger()?.nativeElement;
      const overlayRef = this.overlay()?.overlayRef;
      if (!this.isOpen() || !trigger || !overlayRef?.hasAttached()) return;
      const stop = watchAncestorScroll(this.connectedAnchor(trigger), () => overlayRef.updatePosition());
      this.stopScroll = stop;
      onCleanup(() => {
        if (this.stopScroll === stop) {
          stop();
          this.stopScroll = undefined;
        }
      });
    });
  }

  ngOnChanges(): void {
    // Release focus before the conditional view detaches the CDK portal.
    if (!this.isOpen()) this.releasePanel();
  }

  protected connectedAnchor(trigger: HTMLElement): HTMLElement {
    const anchor = this.anchor();
    return anchor?.isConnected ? anchor : trigger;
  }

  protected onAttach(trigger: HTMLElement): void {
    const active = trigger.ownerDocument.activeElement;
    this.returnFocus = active instanceof HTMLElement && trigger.contains(active)
      ? active
      : trigger.querySelector<HTMLElement>('button, a[href], [tabindex]') ?? this.connectedAnchor(trigger);
    // Keep ownership tied to the trigger in the composer.
    this.owned?.unregister();
    this.owned = registerOwnedOverlay(trigger);
    afterNextRender(() => {
      const panel = this.panel()?.nativeElement;
      if (!this.isOpen() || !panel?.isConnected) return;
      this.attachedPanel = panel;
      this.owned?.attachPanel(panel);
      this.unregisterChild?.();
      this.unregisterChild = registerConnectedChild(trigger, () => {
        this.releasePanel();
        this.overlay()?.overlayRef.detach();
        this.closed.emit();
      });
      panel.focus({ preventScroll: true });
      this.opened.emit();
    }, { injector: this.injector });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    this.closed.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (!claimOverlayDismissal(event)) return;
    this.backdropClicked.emit();
    this.closed.emit();
  }

  /** Recompute after caller content or anchor geometry changes. */
  reposition(): void {
    afterNextRender(() => this.overlay()?.overlayRef?.updatePosition(), {
      injector: this.injector,
    });
  }

  /** Reposition after the caller moves a row containing the trigger. */
  reattach(): void {
    this.reposition();
  }

  ngOnDestroy(): void {
    this.releasePanel();
  }

  private releasePanel(): void {
    this.stopScroll?.();
    this.stopScroll = undefined;
    this.unregisterChild?.();
    this.unregisterChild = undefined;
    const panel = this.attachedPanel;
    if (panel) detachConnectedChildren(panel);
    this.attachedPanel = undefined;
    // Restore focus while the panel is still owned, so a composer that treats
    // the portaled panel as inside does not see a gap before the trigger.
    const restore = this.returnFocus;
    this.returnFocus = null;
    if (this.restoreFocus()) restorePopoverFocus(restore, panel);
    this.owned?.unregister();
    this.owned = undefined;
  }
}
