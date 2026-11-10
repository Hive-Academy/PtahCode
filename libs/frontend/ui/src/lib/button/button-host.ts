import { DestroyRef, ElementRef, inject } from '@angular/core';
export const BUTTON_HOST = {
    class: 'btn',
    '[class.btn-primary]': "variant() === 'primary'",
    '[class.btn-secondary]': "variant() === 'secondary'",
    '[class.btn-ghost]': "variant() === 'ghost'",
    '[class.btn-error]': "variant() === 'danger'",
    '[class.btn-link]': "variant() === 'link'",
    '[class.btn-xs]': "size() === 'xs'",
    '[class.btn-sm]': "size() === 'sm'",
    '[class.btn-md]': "size() === 'md'",
    '[class.opacity-60]': 'busy()',
    '[class.cursor-wait]': 'busy()',
    '[attr.aria-disabled]': "busy() ? 'true' : null",
    '[attr.aria-busy]': "busy() ? 'true' : null",
};
export function defaultButtonType(): void {
  const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  if (element instanceof HTMLButtonElement && !element.hasAttribute('type')) {
    element.setAttribute('type', 'button');
  }
}
export function blockBusyActivation(busy: () => boolean): void {
  const element =
    inject<ElementRef<HTMLButtonElement | HTMLAnchorElement>>(
      ElementRef,
    ).nativeElement;
  const destroyRef = inject(DestroyRef);
  const block = (event: Event) => {
    if (!busy()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  element.addEventListener('click', block, true);
  element.addEventListener('auxclick', block, true);
  destroyRef.onDestroy(() => {
    element.removeEventListener('click', block, true);
    element.removeEventListener('auxclick', block, true);
  });
}
