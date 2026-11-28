import {
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import {
  focusInOwnedOverlay,
  ownedOverlayAnchoredIn,
  watchOwnedOverlays,
} from '@ptah-extension/ui';

/** True when a native popover (`popover` attribute) under `root` is shown. */
function hasOpenPopover(root: HTMLElement): boolean {
  try {
    return root.querySelector(':popover-open') !== null;
  } catch {
    // degradation-audit: optional-capability - engines without the
    // `:popover-open` selector (test DOMs) have no popover open, so false.
    return false;
  }
}

/**
 * Reports whether the user is busy inside a composer region: focus within it,
 * and whether one of its menus is open. The streaming composer stays expanded
 * while either is true.
 *
 * A CDK panel is portaled outside this host, so it is not a descendant and it
 * does not emit a native `toggle`. Open overlays register their trigger; this
 * host stays active until the last one whose trigger is inside it closes or
 * is destroyed. Focus inside that panel still counts as inside the composer.
 * Native `popover` toggles do not bubble, so one capture listener on the host
 * still sees every native popover below it.
 */
@Directive({
  selector: '[ptahComposerActivity]',
  host: {
    '(focusin)': 'focusWithin.set(true)',
    '(focusout)': 'onFocusOut()',
  },
})
export class ComposerActivityDirective {
  private readonly host: HTMLElement = inject(ElementRef<HTMLElement>)
    .nativeElement;

  /** Focus is on the host, a descendant, or a panel owned by this host. */
  readonly focusWithin = signal(false);
  /** A native popover or a portaled overlay anchored in this host is open. */
  readonly popoverOpen = signal(false);

  constructor() {
    const refresh = (): void => {
      this.popoverOpen.set(
        hasOpenPopover(this.host) || ownedOverlayAnchoredIn(this.host),
      );
      this.syncFocus();
    };
    const onToggle = (): void => refresh();
    // A portaled panel is outside this host, so moving focus from it to the
    // rest of the page never bubbles `focusout` here. Capture focus moves on
    // the document. A window blur does not fire `focusin`, and `activeElement`
    // stays put, so switching apps does not count as leaving.
    const doc = this.host.ownerDocument;
    const onFocusIn = (): void => this.syncFocus();
    this.host.addEventListener('toggle', onToggle, true);
    doc.addEventListener('focusin', onFocusIn, true);
    const stopWatch = watchOwnedOverlays(refresh);
    inject(DestroyRef).onDestroy(() => {
      this.host.removeEventListener('toggle', onToggle, true);
      doc.removeEventListener('focusin', onFocusIn, true);
      stopWatch();
    });
  }

  /**
   * Re-read the focus after the move settles. A focus move inside the host,
   * or into a panel whose trigger is inside the host, keeps it. A window blur
   * leaves `activeElement` in place, so switching apps does not count as
   * leaving the composer.
   */
  protected onFocusOut(): void {
    queueMicrotask(() => this.syncFocus());
  }

  private syncFocus(): void {
    const active = this.host.ownerDocument.activeElement;
    this.focusWithin.set(
      !!active &&
        (this.host.contains(active) || focusInOwnedOverlay(this.host, active)),
    );
  }
}
