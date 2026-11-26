import {
  ConfigurableFocusTrap,
  ConfigurableFocusTrapFactory,
} from '@angular/cdk/a11y';
import { Dialog, type DialogConfig, type DialogRef } from '@angular/cdk/dialog';
import { CdkScrollable } from '@angular/cdk/scrolling';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  isDevMode,
  OnDestroy,
  output,
  TemplateRef,
  untracked,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { claimOverlayDismissal, detachConnectedChildren } from '../../overlays/shared/overlay-positions';

/** Modal width preset, mapped to a `modal-box` max-width class. */
export type NativeModalSize = 'sm' | 'md' | 'lg';

/** Controls the Tab wrap moves between (inside the panel). */
const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** 'plain': the slots render straight into the box. 'shell': fixed header and footer, scrolling body. */
export type NativeModalLayout = 'plain' | 'shell';

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


/** Wire dismissal requests while the caller continues to own visibility. */
export function openPtahDialog(
  dialog: Dialog,
  template: TemplateRef<unknown>,
  config: DialogConfig<unknown, DialogRef>,
  requestClose: () => void,
  closeOnEscape: () => boolean,
  closeOnBackdrop: () => boolean,
): DialogRef {
  const ref = dialog.open(template, {
    ...config,
    disableClose: true,
    closeOnNavigation: false,
  });
  ref.keydownEvents.subscribe((event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    if (closeOnEscape()) requestClose();
  });
  ref.backdropClick.subscribe((event) => {
    if (claimOverlayDismissal(event) && closeOnBackdrop()) requestClose();
  });
  return ref;
}

export function updatePtahDialogName(ref: DialogRef, label?: string, labelledBy?: string): void {
  const container = ref.overlayRef.overlayElement.querySelector('cdk-dialog-container');
  if (!container) return;
  if (label) container.setAttribute('aria-label', label);
  else container.removeAttribute('aria-label');
  if (!label && labelledBy) container.setAttribute('aria-labelledby', labelledBy);
  else container.removeAttribute('aria-labelledby');
}

/** Centered dialog with plain and scrolling layouts. The caller owns isOpen. */
@Component({
  selector: 'ptah-native-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkScrollable],
  template: `
    <ng-template #dialog>
      <div #panel cdkScrollable
        class="modal-box ptah-cdk-modal-box"
        data-testid="native-modal-dialog"
        [class]="boxClass()"
        [style.--ptah-modal-size]="shellWidth()"
      >
        <div data-ptah-modal-part="header" [class]="layoutClasses().header"><ng-content select="[modal-header]" /></div>
        <div cdkScrollable data-ptah-modal-part="body" [class]="layoutClasses().body"><ng-content /></div>
        <div data-ptah-modal-part="footer" [class]="layoutClasses().footer"><ng-content select="[modal-footer]" /></div>
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      display: contents;
    }

    .ptah-cdk-modal-box {
      width: min(var(--ptah-modal-size, 100vw), calc(100vw - 2rem));
      max-height: var(--ptah-modal-max-h, calc(100dvh - 2rem));
      transform: none;
      opacity: 1;
    }

    .ptah-modal-part {
      display: contents;
    }

    .ptah-modal-scroll-shadow {
      background:
        linear-gradient(oklch(var(--b1)) 30%, transparent) top / 100% 2.5rem no-repeat local,
        linear-gradient(transparent, oklch(var(--b1)) 70%) bottom / 100% 2.5rem no-repeat local,
        radial-gradient(farthest-side at 50% 0, rgb(0 0 0 / 0.14), transparent) top / 100% 0.75rem no-repeat scroll,
        radial-gradient(farthest-side at 50% 100%, rgb(0 0 0 / 0.14), transparent) bottom / 100% 0.75rem no-repeat scroll;
    }

    :host-context([data-glass='on']) .ptah-modal-scroll-shadow {
      background: none;
    }
  `,
})
export class NativeModalComponent implements OnDestroy {
  readonly isOpen = input.required<boolean>();
  readonly ariaLabel = input<string>();
  readonly ariaLabelledby = input<string>();
  readonly size = input<NativeModalSize>('md');
  readonly layout = input<NativeModalLayout>('plain');
  readonly closed = output<void>();

  /** Present while the content is attached to the dialog. */
  readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  private readonly dialog = inject(Dialog);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly template = viewChild.required<TemplateRef<unknown>>('dialog');
  private readonly focusTrapFactory = inject(ConfigurableFocusTrapFactory);
  private ref?: DialogRef;
  private focusTrap?: ConfigurableFocusTrap;

  constructor() {
    // Attach a real focus trap to the portaled panel. The CDK dialog traps the
    // container; this trap gives the panel explicit first/last moves for the
    // Tab wrap. It releases when the dialog closes or the view is destroyed.
    afterRenderEffect((onCleanup) => {
      const panel = this.panel()?.nativeElement;
      if (!panel) return;
      const trap = this.focusTrapFactory.create(panel);
      this.focusTrap = trap;
      const onKeydown = (event: KeyboardEvent): void => this.onKeydown(event);
      panel.addEventListener('keydown', onKeydown);
      onCleanup(() => {
        panel.removeEventListener('keydown', onKeydown);
        trap.destroy();
        if (this.focusTrap === trap) this.focusTrap = undefined;
      });
    });

    effect(() => {
      const template = this.template();
      if (this.isOpen()) {
        untracked(() => {
          this.ref = openPtahDialog(this.dialog, template, {
            viewContainerRef: this.viewContainerRef,
            ariaLabel: this.ariaLabel(),
            ariaLabelledBy: this.ariaLabelledby(),
          }, () => this.closed.emit(), () => true, () => true);
        });
      } else {
        this.close();
      }
    });

    effect(() => {
      const label = this.ariaLabel();
      const labelledBy = this.ariaLabelledby();
      if (this.ref) updatePtahDialogName(this.ref, label, labelledBy);
      if (!label && !labelledBy && isDevMode()) {
        console.error(
          'ptah-native-modal requires an accessible name: pass ariaLabel or ariaLabelledby.',
        );
      }
    });
  }

  protected boxClass(): string {
    if (this.layout() === 'shell') return LAYOUT_CLASSES.shell.box;
    return SIZE_CLASSES[this.size()] ?? '';
  }

  protected shellWidth(): string | null {
    if (this.layout() !== 'shell') return null;
    return SHELL_SIZE_WIDTHS[this.size()] ?? SHELL_SIZE_WIDTHS.md;
  }

  protected layoutClasses(): (typeof LAYOUT_CLASSES)[NativeModalLayout] {
    return LAYOUT_CLASSES[this.layout()] ?? LAYOUT_CLASSES.plain;
  }

  ngOnDestroy(): void {
    if (!this.ref) return;
    this.close();
    this.closed.emit();
  }

  /**
   * Tab from the last control goes to the first, Shift+Tab from the first to the last, so keyboard focus never leaves
   * the open dialog. Keys from the projected controls bubble to the panel.
   */
  private onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const panel = this.panel()?.nativeElement;
    if (!panel) return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (node) => !node.hasAttribute('disabled') && node.tabIndex >= 0 && node.getClientRects().length > 0,
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = panel.ownerDocument.activeElement;
    const outside = !panel.contains(active);
    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      if (!this.focusTrap?.focusLastTabbableElement()) last.focus();
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      if (!this.focusTrap?.focusFirstTabbableElement()) first.focus();
    }
  }

  private close(): void {
    if (!this.ref) return;
    detachConnectedChildren(this.ref.overlayRef.overlayElement);
    this.ref.close();
    this.ref = undefined;
  }
}
