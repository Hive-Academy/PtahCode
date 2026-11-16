import {
  afterNextRender,
  AfterRenderRef,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  output,
} from '@angular/core';
import { PtahIconButtonDirective } from '../../button/icon-button.directive';
import { PTAH_TABLE_CONTEXT } from './table-detail';

/**
 * Order buttons keep focus after a move only when the row component survives the reorder.
 * Track rows by a stable identity (not by index) in the consumer `@for` loop.
 */
@Component({
  selector: 'ptah-table-order-buttons',
  standalone: true,
  imports: [PtahIconButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ptah-table-order-buttons' },
  template: `
    <button
      ptahIconButton
      type="button"
      data-order-up
      [label]="'Move ' + rowLabel() + ' up'"
      [disabled]="index() <= 0"
      (click)="move(-1)"
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="m6 15 6-6 6 6" />
      </svg>
    </button>
    <button
      ptahIconButton
      type="button"
      data-order-down
      [label]="'Move ' + rowLabel() + ' down'"
      [disabled]="index() >= count() - 1"
      (click)="move(1)"
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  `,
})
export class PtahTableOrderButtonsComponent {
  readonly rowLabel = input.required<string>();
  readonly index = input.required<number>();
  readonly count = input.required<number>();
  readonly moveUp = output<void>();
  readonly moveDown = output<void>();

  private readonly context = inject(PTAH_TABLE_CONTEXT, { optional: true });
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private pendingFocus: AfterRenderRef | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.pendingFocus?.destroy());
  }

  protected move(direction: -1 | 1): void {
    const next = this.index() + direction;
    if (next < 0 || next >= this.count()) return;
    if (direction < 0) this.moveUp.emit();
    else this.moveDown.emit();
    this.context?.announce(
      `${this.rowLabel()} moved to position ${next + 1} of ${this.count()}`,
    );
    this.pendingFocus?.destroy();
    this.pendingFocus = afterNextRender(
      () => {
        const selector =
          direction < 0 ? '[data-order-up]' : '[data-order-down]';
        const other = direction < 0 ? '[data-order-down]' : '[data-order-up]';
        const preferred =
          this.element.nativeElement.querySelector<HTMLButtonElement>(selector);
        const fallback =
          this.element.nativeElement.querySelector<HTMLButtonElement>(other);
        (preferred && !preferred.disabled ? preferred : fallback)?.focus();
        this.pendingFocus = null;
      },
      { injector: this.injector },
    );
  }
}
