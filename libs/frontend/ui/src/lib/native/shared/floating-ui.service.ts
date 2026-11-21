/**
 * FloatingUIService - Lightweight positioning service using @floating-ui/dom
 *
 * Replaces CDK Overlay positioning which has conflicts with VS Code webview sandboxing.
 * Uses Floating UI for viewport-aware positioning with flip/shift middleware.
 *
 * @example
 * ```typescript
 * @Component({
 *   providers: [FloatingUIService],
 * })
 * export class MyDropdownComponent {
 *   private readonly floatingUI = inject(FloatingUIService);
 *
 *   async position(): Promise<void> {
 *     await this.floatingUI.position(triggerEl, floatingEl, {
 *       placement: 'bottom-start',
 *       offset: 8,
 *     });
 *   }
 *
 *   close(): void {
 *     this.floatingUI.cleanup();
 *   }
 * }
 * ```
 */
import { Injectable, inject, DestroyRef, isDevMode } from '@angular/core';
import {
  computePosition,
  flip,
  shift,
  offset,
  size,
  autoUpdate,
  Placement,
} from '@floating-ui/dom';

/** Smallest height (px, 8rem) that a capped panel keeps when the free space on its side is smaller. */
const CAP_MIN_HEIGHT_PX = 128;

/**
 * Configuration options for positioning floating elements.
 */
export interface FloatingUIOptions {
  /** Element whose visible bounds constrain flip and shift. */
  boundary?: HTMLElement;
  /**
   * Placement of the floating element relative to reference.
   * @default 'bottom-start'
   */
  placement?: Placement;

  /**
   * Offset distance from the reference element in pixels.
   * @default 8
   */
  offset?: number;

  /**
   * Whether to flip placement when there's not enough space.
   * @default true
   */
  flip?: boolean;

  /**
   * Whether to shift along the axis to stay in view.
   * @default true
   */
  shift?: boolean;

  /**
   * Padding for shift middleware to maintain distance from viewport edges.
   * @default 8
   */
  shiftPadding?: number;

  /**
   * Opt-in: shift also moves the element along the placement's own axis (vertically for top/bottom), with the same
   * padding, so a panel taller than either side of its reference stays inside the boundary. It may then overlap
   * the reference. Leave unset for the default, cross-axis-only shift.
   * @default false
   */
  shiftCrossAxis?: boolean;

  /**
   * Cap the panel height to the free space on the chosen side (floating-ui `size()`). Flip then also picks the side
   * with the most space (`fallbackStrategy: 'bestFit'`). The cap is `min(var(--ptah-popover-max-h), <free>px)` and
   * never below 8rem. Leave unset for today's middleware.
   * @default false
   */
  capHeight?: boolean;
}

/**
 * Service for positioning floating elements using Floating UI.
 *
 * Provides lightweight positioning without CDK Overlay portal rendering,
 * avoiding VS Code webview sandboxing conflicts.
 *
 * Key features:
 * - Viewport-aware positioning with flip/shift
 * - Auto-updates on scroll/resize
 * - Automatic cleanup on DestroyRef
 */
@Injectable()
export class FloatingUIService {
  private readonly destroyRef = inject(DestroyRef);
  private cleanupFn: (() => void) | null = null;

  /**
   * Identifies the live position() request. cleanup() bumps it, and every
   * position() starts with cleanup(), so a request whose token is no longer
   * current was cancelled by a close or superseded by a newer request.
   */
  private requestToken = 0;

  /**
   * Numbers each auto-update compute. computePosition is async and a flip
   * re-run makes one compute take longer than another, so an older compute
   * (measured before the panel grew) could resolve after a newer one and put
   * the panel back where the smaller size fitted. Only the latest applies.
   */
  private updateSeq = 0;

  /** Re-runs the live auto-update compute; null while nothing is positioned. */
  private updateFn: (() => void) | null = null;

  /**
   * Flag to track if the service has been destroyed.
   * Used to prevent position updates after component destruction.
   */
  private isDestroyed = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
      this.cleanup();
    });
  }

  /**
   * Position a floating element relative to a reference element.
   * Automatically updates position on scroll/resize.
   *
   * @param referenceEl - The trigger/anchor element
   * @param floatingEl - The floating element to position
   * @param options - Positioning configuration
   *
   * @example
   * ```typescript
   * await this.floatingUI.position(buttonEl, dropdownEl, {
   *   placement: 'bottom-start',
   *   offset: 4,
   * });
   * ```
   */
  async position(
    referenceEl: HTMLElement,
    floatingEl: HTMLElement,
    options: FloatingUIOptions = {},
  ): Promise<void> {
    this.cleanup();
    const request = this.requestToken;

    const {
      placement = 'bottom-start',
      offset: offsetValue = 8,
      flip: enableFlip = true,
      shift: enableShift = true,
      shiftPadding = 8,
      shiftCrossAxis = false,
      capHeight = false,
      boundary,
    } = options;
    // Each compute gets its own middleware list, so the size() write checks the liveness of that compute: a
    // superseded or cancelled compute leaves no stale height on the live panel and writes nothing to a closed one.
    const middlewareFor = (live: () => boolean) => [
      offset(offsetValue),
      ...(enableFlip
        ? [
            flip(
              capHeight
                ? { boundary, fallbackStrategy: 'bestFit' as const }
                : { boundary },
            ),
          ]
        : []),
      ...(enableShift
        ? [
            shift(
              shiftCrossAxis
                ? { boundary, padding: shiftPadding, crossAxis: true }
                : { boundary, padding: shiftPadding },
            ),
          ]
        : []),
      ...(capHeight
        ? [
            size({
              boundary,
              padding: 8,
              apply: ({ availableHeight, elements }) => {
                if (!live()) return;
                const free = Math.max(
                  CAP_MIN_HEIGHT_PX,
                  Math.floor(availableHeight),
                );
                elements.floating.style.maxHeight = `min(var(--ptah-popover-max-h), ${free}px)`;
              },
            }),
          ]
        : []),
    ];
    // `fixed` matches the `position: fixed` that applyPosition writes: with the default `absolute`, `x`/`y` carry
    // the page scroll, and a scrolled page put the CLI matrix Cursor panel hundreds of px off. Set it first:
    // floating-ui resolves a fixed element's offset parent from its containing block (a modal box's transform),
    // any other element's from its offsetParent.
    floatingEl.style.position = 'fixed';
    const configFor = (live: () => boolean) => ({
      placement,
      middleware: middlewareFor(live),
      strategy: 'fixed' as const,
    });
    const { x, y } = await computePosition(
      referenceEl,
      floatingEl,
      configFor(() => this.isCurrent(request)),
    );
    // cleanup() ran or a newer position() started while this one computed: a
    // stale request writes nothing and installs no auto-update, so it can
    // neither leave an observer on a closed panel nor overwrite the live
    // request's cleanup handle.
    if (!this.isCurrent(request)) return;
    this.applyPosition(floatingEl, x, y);
    // A rejected latest compute would leave the panel where an older one put
    // it (the guard drops that older result): it gets one fresh compute, never
    // a loop, and a second failure leaves the position as it is.
    const update = async (retried = false): Promise<void> => {
      const seq = ++this.updateSeq;
      const live = () => this.isCurrent(request) && seq === this.updateSeq;
      try {
        const result = await computePosition(
          referenceEl,
          floatingEl,
          configFor(live),
        );
        if (live()) this.applyPosition(floatingEl, result.x, result.y);
      } catch (error: unknown) {
        if (!live()) return;
        if (isDevMode()) {
          console.error(
            `FloatingUIService: auto-update compute rejected${retried ? ' again; position left as is' : '; retrying once'}:`,
            error,
          );
        }
        if (!retried) await update(true);
      }
    };
    this.updateFn = () => void update();
    this.cleanupFn = autoUpdate(referenceEl, floatingEl, this.updateFn);
  }

  /**
   * Recomputes the live position now (flip, shift) — for a caller whose panel
   * content just changed size. No-op when nothing is positioned.
   */
  update(): void {
    this.updateFn?.();
  }

  private isCurrent(request: number): boolean {
    return !this.isDestroyed && request === this.requestToken;
  }

  /**
   * Apply position styles to the floating element.
   * Uses CSS positioning for better performance.
   */
  private applyPosition(floatingEl: HTMLElement, x: number, y: number): void {
    Object.assign(floatingEl.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      visibility: 'visible',
    });
  }

  /**
   * Cleanup auto-update listeners and cancel a pending position() request.
   * Call this when closing the floating element.
   *
   * Note: Also called automatically on component destroy via DestroyRef.
   */
  cleanup(): void {
    this.requestToken++;
    this.updateFn = null;
    if (this.cleanupFn) {
      this.cleanupFn();
      this.cleanupFn = null;
    }
  }
}
