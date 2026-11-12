import {
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Signal,
} from '@angular/core';
export const BUTTON_HOST = {
  class: 'btn',
  // Scopes the token look in ptah-button.css to directive hosts. A raw `btn` keeps the old look.
  'data-ptah-button': '',
  '[class.btn-primary]': "variant() === 'primary'",
  '[class.btn-secondary]': "variant() === 'secondary'",
  '[class.btn-ghost]': "variant() === 'ghost'",
  '[class.btn-error]': "variant() === 'danger'",
  '[class.btn-link]': "variant() === 'link'",
  '[class.btn-xs]': "size() === 'xs'",
  '[class.btn-sm]': "size() === 'sm'",
  '[class.btn-md]': "size() === 'md'",
  '[class.btn-lg]': "size() === 'lg'",
  '[attr.data-tone]': "tone() === 'default' ? null : tone()",
  '[attr.data-selected]': "selected() ? '' : null",
  '[attr.aria-pressed]': "selectedAs() === 'pressed' && selected() !== undefined ? (selected() ? 'true' : 'false') : null",
  '[attr.aria-current]': "selectedAs() === 'current' && selected() ? 'page' : null",
  '[class.opacity-60]': 'busy()',
  '[class.cursor-wait]': 'busy()',
  '[attr.aria-disabled]': "busy() ? 'true' : null",
  '[attr.aria-busy]': "busy() ? 'true' : null",
  '[attr.type]': 'hostType()',
};
/**
 * Value of the host `type` attribute. A `button` element with no explicit type
 * gets `button`, thus it never submits a form by accident. The directive owns
 * the attribute through its `type` input: when a bound `[type]` becomes empty,
 * the value goes back to `button`, not to the `submit` default of the browser.
 * Set the type with `type="..."` or `[type]`. Do not use `[attr.type]` on the
 * host: that binding does not go through the input.
 * An anchor gets no `type` unless the consumer sets one.
 */
export function buttonHostType(
  type: () => string | undefined,
): Signal<string | null> {
  const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const fallback = element instanceof HTMLButtonElement ? 'button' : null;
  return computed(() => type() || fallback);
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
