/**
 * NativeModalComponent - Centered modal dialog on the native `<dialog>` API.
 *
 * A domain-free, centered modal for card-driven views. Unlike the drawer and
 * popover, which are plain `<div>`s and therefore hand-write their Tab-trap,
 * Escape handling and focus-restore in TypeScript, this component is a real
 * `<dialog>` element opened with `showModal()`:
 * - `showModal()` makes the rest of the page inert and, on `close()`, returns
 *   focus to the element that had focus before it opened — both per the HTML
 *   Living Standard, with no extra code
 * - Tab and Shift+Tab wrap at the dialog's first and last control. Inert alone
 *   is not a trap: Chromium moves focus from the last control to the browser's
 *   own UI (TASK_2026_555 Batch 32, found by the Batch 14 finding 3 scene)
 * - Escape fires a native `cancel` event, which the component only forwards
 *   to the parent; the Escape keydown itself does not bubble past the modal,
 *   so an enclosing drawer stays open
 * - a backdrop click requests closure
 *
 * Visibility is driven entirely by `showModal()`/`close()` — never by the
 * daisyUI `modal-open` class toggle, which gives none of the above for free.
 *
 * Follows the same control contract as the other `Native*` overlays: the
 * PARENT owns visibility (`isOpen`) and the modal only ever *requests*
 * closure via {@link closed}.
 *
 * Three projection slots: `[modal-header]`, default (body) and
 * `[modal-footer]`. Each slot sits in a wrapper. With `layout="plain"` (the
 * default) the wrappers are `display: contents`, so the box renders as before.
 * With `layout="shell"` the header and footer stay fixed, the body scrolls,
 * and the box is capped to `--ptah-modal-max-h`.
 *
 * @example
 * ```html
 * <ptah-native-modal
 *   [isOpen]="isOpen()"
 *   ariaLabel="Connect a provider"
 *   size="lg"
 *   (closed)="isOpen.set(false)"
 * >
 *   <h3 modal-header>Connect a provider</h3>
 *   <div>…body…</div>
 *   <div modal-footer><button class="btn btn-ghost" (click)="close()">Cancel</button></div>
 * </ptah-native-modal>
 * ```
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  isDevMode,
  output,
  viewChild,
} from '@angular/core';

/** Modal width preset, mapped to a `modal-box` max-width class. */
export type NativeModalSize = 'sm' | 'md' | 'lg';

/** 'plain': the slots render straight into the box. 'shell': fixed header and footer, scrolling body. */
export type NativeModalLayout = 'plain' | 'shell';

/** Controls the Tab wrap moves between (inside the panel). */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

const SIZE_CLASSES: Record<NativeModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

/**
 * `shell` width of each preset, the same values as the `plain` classes above. The shell box has one max-width:
 * the smaller of this preset and the viewport less 2rem.
 */
const SHELL_SIZE_WIDTHS: Record<NativeModalSize, string> = {
  sm: '24rem',
  md: '32rem',
  lg: '42rem',
};

/** Box and slot-wrapper classes of each layout. `plain` keeps today's box: every wrapper is `display: contents`. */
const LAYOUT_CLASSES: Record<
  NativeModalLayout,
  { box: string; header: string; body: string; footer: string }
> = {
  plain: {
    box: '',
    header: 'ptah-modal-part',
    body: 'ptah-modal-part',
    footer: 'ptah-modal-part',
  },
  shell: {
    box: 'flex flex-col overflow-hidden p-0 max-h-[var(--ptah-modal-max-h)] max-w-[min(var(--ptah-modal-size),calc(100vw-2rem))]',
    header: 'shrink-0 border-b border-base-300 px-5 py-3 empty:hidden',
    body: 'ptah-modal-scroll-shadow min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4',
    footer: 'shrink-0 border-t border-base-300 px-5 py-3 empty:hidden',
  },
};

@Component({
  selector: 'ptah-native-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Keys from inside the dialog bubble to the host (the top layer changes rendering, not the DOM tree).
  host: { '(keydown)': 'onKeydown($event)' },
  template: `
    <dialog
      #dialog
      class="modal"
      data-testid="native-modal-dialog"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-labelledby]="ariaLabelledby()"
      (cancel)="onCancel()"
    >
      <div class="modal-box" [class]="boxClass()" [style.--ptah-modal-size]="shellWidth()">
        <div data-ptah-modal-part="header" [class]="layoutClasses().header"><ng-content select="[modal-header]" /></div>
        <div data-ptah-modal-part="body" [class]="layoutClasses().body"><ng-content /></div>
        <div data-ptah-modal-part="footer" [class]="layoutClasses().footer"><ng-content select="[modal-footer]" /></div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button (click)="requestClose()">close</button>
      </form>
    </dialog>
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      /*
       * V36-1: daisyUI's .modal sets display:grid with opacity:0, which overrides the UA
       * dialog:not([open]) { display: none }, so a closed dialog's controls stayed focusable.
       * Not visibility: .modal transitions it, so showModal() would focus while still hidden.
       */
      dialog.modal:not([open]) {
        display: none;
      }
      /* layout="plain": the slot wrappers add no box, so the projected nodes stay direct children of .modal-box. */
      .ptah-modal-part {
        display: contents;
      }
      /*
       * layout="shell": scroll shadow without JS. The 'local' covers move with the content and hide the 'scroll'
       * shadows at the top and bottom ends. Glass on: the box fill is a blurred ::after layer that a solid cover
       * cannot match, so the shadow is off there and the header and footer borders mark the edges.
       */
      .ptah-modal-scroll-shadow {
        background:
          linear-gradient(oklch(var(--b1)) 30%, transparent) top / 100% 2.5rem no-repeat local,
          linear-gradient(transparent, oklch(var(--b1)) 70%) bottom / 100% 2.5rem no-repeat local,
          radial-gradient(farthest-side at 50% 0, rgb(0 0 0 / 0.14), transparent) top / 100% 0.75rem no-repeat scroll,
          radial-gradient(farthest-side at 50% 100%, rgb(0 0 0 / 0.14), transparent) bottom / 100% 0.75rem no-repeat
            scroll;
      }
      :host-context([data-glass='on']) .ptah-modal-scroll-shadow {
        background: none;
      }
    `,
  ],
})
export class NativeModalComponent implements OnDestroy {
  /** Whether the modal is open. Owned by the parent. */
  readonly isOpen = input.required<boolean>();

  /** Accessible name of the dialog (a `<dialog>` has no implicit name). */
  readonly ariaLabel = input<string>();

  /**
   * `id` of the visible dialog title to name the dialog via
   * `aria-labelledby`. Exactly one of this and {@link ariaLabel} must be
   * passed; an unnamed dialog is unusable for assistive tech, so dev mode
   * reports the omission.
   */
  readonly ariaLabelledby = input<string>();

  /** Width preset of the `modal-box`. @default 'md' */
  readonly size = input<NativeModalSize>('md');

  /** 'shell': fixed header and footer, scrolling body, viewport height cap. @default 'plain' */
  readonly layout = input<NativeModalLayout>('plain');

  /**
   * The modal is asking to be closed (Escape via `cancel`, backdrop click).
   * The parent must flip `isOpen` — the modal never closes itself.
   */
  readonly closed = output<void>();

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.isOpen()) {
        dialog.inert = false;
        dialog.showModal();
      } else {
        dialog.close();
        // V36-1: a closed dialog is neither a Tab stop nor in the accessibility tree (see the style below).
        dialog.inert = true;
      }
    });

    // A dialog must always carry an accessible name. The siblings get this
    // for free (the drawer defaults its label), so the modal only reports
    // the omission in dev mode instead of throwing.
    effect(() => {
      if (!this.ariaLabel() && !this.ariaLabelledby() && isDevMode()) {
        console.error(
          'ptah-native-modal requires an accessible name: pass ariaLabel or ariaLabelledby.',
        );
      }
    });
  }

  /** `plain`: the size class only. `shell`: the layout classes, whose one max-width reads `--ptah-modal-size`. */
  protected boxClass(): string {
    if (this.layout() === 'shell') return LAYOUT_CLASSES.shell.box;
    return SIZE_CLASSES[this.size()] ?? '';
  }

  /** `--ptah-modal-size` of the shell box. Null in `plain`, so that box gets no style. */
  protected shellWidth(): string | null {
    if (this.layout() !== 'shell') return null;
    return SHELL_SIZE_WIDTHS[this.size()] ?? SHELL_SIZE_WIDTHS.md;
  }

  protected layoutClasses(): (typeof LAYOUT_CLASSES)[NativeModalLayout] {
    return LAYOUT_CLASSES[this.layout()] ?? LAYOUT_CLASSES.plain;
  }

  /**
   * Escape: the browser fires `cancel` on a dialog opened with `showModal()`.
   * Forward the request only — the parent's `isOpen` drives the actual
   * `close()` through the effect above, and the native Esc path may also have
   * closed the dialog itself already.
   */
  protected onCancel(): void {
    this.closed.emit();
  }

  /**
   * Escape inside the open dialog belongs to this modal alone: it stops here so an ancestor overlay (for example a
   * `ptah-native-drawer` that closes on Escape) never sees it. Only propagation stops; the default action stays, so
   * the browser still fires the native `cancel` that {@link onCancel} forwards.
   *
   * Tab from the last control goes to the first, Shift+Tab from the first to the last, so keyboard focus never leaves
   * the open dialog. The backdrop's close button is not a stop: it is the pointer path, outside the panel.
   */
  protected onKeydown(event: KeyboardEvent): void {
    const dialog = this.dialog()?.nativeElement;
    if (!dialog?.open) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      return;
    }
    if (event.key !== 'Tab') return;
    const panel = dialog.querySelector<HTMLElement>('.modal-box');
    const focusables = Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      .filter((node) => !node.hasAttribute('disabled') && node.tabIndex >= 0 && node.getClientRects().length > 0);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    const active = dialog.ownerDocument.activeElement;
    const outside = !panel?.contains(active);
    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Backdrop click requests closure. */
  protected requestClose(): void {
    this.closed.emit();
  }

  ngOnDestroy(): void {
    const dialog = this.dialog()?.nativeElement;
    if (dialog?.open) {
      dialog.close();
      // The dialog just closed, so the parent's `isOpen` must not stay
      // stale. Emitting during teardown is safe: if the subscriber is
      // already gone, Angular drops the event silently.
      this.closed.emit();
    }
  }
}