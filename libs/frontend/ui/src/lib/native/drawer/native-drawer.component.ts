import { Dialog, type DialogRef } from '@angular/cdk/dialog';
import { createGlobalPositionStrategy } from '@angular/cdk/overlay';
import { CdkScrollable } from '@angular/cdk/scrolling';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  output,
  TemplateRef,
  untracked,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { LucideAngularModule, X } from 'lucide-angular';
import { PtahTooltipDirective } from '../../button/tooltip.directive';
import { detachConnectedChildren } from '../../overlays/shared/overlay-positions';
import { openPtahDialog, updatePtahDialogName } from '../modal/native-modal.component';

export type NativeDrawerSide = 'right' | 'left';

/** Side dialog with a scrolling body and pinned header and footer. */
@Component({
  selector: 'ptah-native-drawer',
  standalone: true,
  imports: [CdkScrollable, LucideAngularModule, PtahTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #dialog>
      <div
        #panel
        class="ptah-drawer-panel relative flex h-full w-full flex-col border-base-300 bg-base-100 shadow-2xl"
        [class.ptah-drawer-panel-left]="side() === 'left'"
        [class.border-r]="side() === 'left'"
        [class.border-l]="side() === 'right'"
        data-glass-surface="overlay"
        data-testid="native-drawer-panel"
      >
        <div class="flex flex-shrink-0 items-start gap-2 border-b border-base-300 px-4 py-3">
          <div class="min-w-0 flex-1">
            <ng-content select="[drawer-header]" />
          </div>
          @if (showCloseButton()) {
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-square -mr-1 flex-shrink-0"
              data-testid="native-drawer-close"
              aria-label="Close panel"
              ptahTooltip="Close panel"
              [tooltipOnFocus]="false"
              (click)="closed.emit()"
            >
              <lucide-angular [img]="XIcon" class="size-4" aria-hidden="true" />
            </button>
          }
        </div>

        <div cdkScrollable class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
          data-testid="native-drawer-body">
          <ng-content />
        </div>

        <div class="flex-shrink-0 empty:hidden">
          <ng-content select="[drawer-footer]" />
        </div>
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      display: contents;
    }

    @keyframes ptah-drawer-slide-in-right {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    @keyframes ptah-drawer-slide-in-left {
      from { transform: translateX(-100%); }
      to { transform: translateX(0); }
    }

    .ptah-drawer-panel {
      min-height: 0;
      animation: ptah-drawer-slide-in-right 180ms ease-out;
    }

    .ptah-drawer-panel-left {
      animation-name: ptah-drawer-slide-in-left;
    }

    @media (prefers-reduced-motion: reduce) {
      .ptah-drawer-panel {
        animation: none;
      }
    }
  `,
})
export class NativeDrawerComponent implements OnDestroy {
  protected readonly XIcon = X;
  readonly isOpen = input.required<boolean>();
  readonly side = input<NativeDrawerSide>('right');
  readonly widthClass = input('w-full max-w-2xl');
  readonly ariaLabel = input('Details');
  readonly showCloseButton = input(true);
  readonly closeOnEscape = input(true);
  readonly closeOnBackdrop = input(true);
  readonly opened = output<void>();
  readonly closed = output<void>();

  /** Present while the content is attached to the dialog. */
  readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly template = viewChild.required<TemplateRef<unknown>>('dialog');
  private readonly position = createGlobalPositionStrategy(this.injector).top();
  private widthClasses: string[] = [];
  private ref?: DialogRef;

  constructor() {
    effect(() => {
      const template = this.template();
      if (this.isOpen()) {
        untracked(() => this.open(template));
      } else {
        this.close();
      }
    });

    effect(() => {
      const side = this.side();
      const label = this.ariaLabel();
      const widthClasses = this.widthClass().split(/\s+/).filter(Boolean);
      if (!this.ref) return;
      updatePtahDialogName(this.ref, label);
      this.position[side]();
      this.ref.overlayRef.removePanelClass(this.widthClasses);
      this.ref.overlayRef.addPanelClass(widthClasses);
      this.widthClasses = widthClasses;
      this.ref.overlayRef.updatePosition();
    });
  }

  ngOnDestroy(): void {
    this.close();
  }

  private open(template: TemplateRef<unknown>): void {
    this.position[this.side()]();
    this.widthClasses = this.widthClass().split(/\s+/).filter(Boolean);
    this.ref = openPtahDialog(this.dialog, template, {
      viewContainerRef: this.viewContainerRef,
      ariaLabel: this.ariaLabel(),
      height: '100%',
      positionStrategy: this.position,
      // `self-stretch` gives the pane the overlay wrapper's height. Without a
      // definite height the flex body collapses and its tabs cannot be clicked.
      panelClass: [...this.widthClasses, 'h-full', 'self-stretch'],
      backdropClass: ['cdk-overlay-dark-backdrop', 'ptah-drawer-backdrop'],
    }, () => this.closed.emit(), this.closeOnEscape, this.closeOnBackdrop);

    const ref = this.ref;
    afterNextRender(() => {
      if (this.ref === ref) this.opened.emit();
    }, { injector: this.injector });
  }

  private close(): void {
    if (!this.ref) return;
    detachConnectedChildren(this.ref.overlayRef.overlayElement);
    this.ref.close();
    this.ref = undefined;
  }
}
