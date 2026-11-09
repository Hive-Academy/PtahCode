import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';

@Directive({
  selector: 'button[ptahButton]',
  standalone: true,
  host: {
    class: 'btn',
    '[class.btn-primary]': "variant() === 'primary'",
    '[class.btn-secondary]': "variant() === 'secondary'",
    '[class.btn-ghost]': "variant() === 'ghost'",
    '[class.btn-error]': "variant() === 'danger'",
    '[class.btn-xs]': "size() === 'xs'",
    '[class.btn-sm]': "size() === 'sm'",
    '[class.btn-square]': 'iconOnly()',
    '[class.opacity-60]': 'busy()',
    '[class.cursor-wait]': 'busy()',
    '[attr.aria-disabled]': "busy() ? 'true' : null",
    '[attr.aria-busy]': "busy() ? 'true' : null",
  },
})
export class PtahButtonDirective {
  private readonly element = inject<ElementRef<HTMLButtonElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  readonly variant = input<'primary' | 'secondary' | 'ghost' | 'danger'>('secondary');
  readonly size = input<'xs' | 'sm'>('sm');
  readonly iconOnly = input(false);
  readonly busy = input(false);

  constructor() {
    const block = (event: Event) => {
      if (!this.busy()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    this.element.addEventListener('click', block, true);
    this.destroyRef.onDestroy(() => this.element.removeEventListener('click', block, true));
  }
}
