import {
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Renderer2,
  Signal,
} from '@angular/core';
import type { PtahButtonSelectedAs } from './button.types';
export const BUTTON_HOST = {
  class: 'btn',
  // Scopes the token look in ptah-button.css to directive hosts. A raw `btn` keeps the old look.
  'data-ptah-button': '',
  '[class.btn-primary]': "variant() === 'primary'",
  '[class.btn-secondary]': "variant() === 'secondary'",
  '[class.btn-outline]': "variant() === 'outline'",
  '[class.btn-ghost]': "variant() === 'ghost'",
  '[class.btn-error]': "variant() === 'danger'",
  '[class.btn-link]': "variant() === 'link'",
  '[class.btn-xs]': "size() === 'xs'",
  '[class.btn-sm]': "size() === 'sm'",
  '[class.btn-md]': "size() === 'md'",
  '[class.btn-lg]': "size() === 'lg'",
  '[attr.data-tone]': "tone() === 'default' ? null : tone()",
  '[attr.data-selected]': "selected() ? '' : null",
  '[class.opacity-60]': 'busy()',
  '[class.cursor-wait]': 'busy()',
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
/** Preserve consumer ARIA values across the owner's busy state. */
export function syncBusyAria(busy: () => boolean): void {
  const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const renderer = inject(Renderer2);
  const previous = new Map<string, string | null>();
  effect(() => {
    for (const name of ['aria-disabled', 'aria-busy']) {
      if (busy()) {
        if (!previous.has(name)) previous.set(name, element.getAttribute(name));
        renderer.setAttribute(element, name, 'true');
      } else if (previous.has(name)) {
        const value = previous.get(name);
        if (element.getAttribute(name) === 'true') {
          if (value === null || value === undefined)
            renderer.removeAttribute(element, name);
          else renderer.setAttribute(element, name, value);
        }
        previous.delete(name);
      }
    }
  });
}
/**
 * Writes `aria-pressed` or `aria-current` from `selected` and `selectedAs`.
 * It is not a host binding: a host binding writes null when `selected` is not set and
 * would erase an attribute that the consumer sets on the same host. This function
 * writes only while `selected` is defined, and removes only what it wrote itself.
 */
export function syncSelectedAria(
  selected: () => boolean | undefined,
  selectedAs: () => PtahButtonSelectedAs,
): void {
  const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const renderer = inject(Renderer2);
  const written = new Map<string, string>();
  const apply = (name: string, value: string | null) => {
    if (value !== null) {
      renderer.setAttribute(element, name, value);
      written.set(name, value);
    } else {
      const owned = written.get(name);
      if (owned !== undefined && element.getAttribute(name) === owned) {
        renderer.removeAttribute(element, name);
      }
      written.delete(name);
    }
  };
  effect(() => {
    const isSelected = selected();
    const as = selectedAs();
    apply(
      'aria-pressed',
      as === 'pressed' && isSelected !== undefined
        ? isSelected
          ? 'true'
          : 'false'
        : null,
    );
    apply('aria-current', as === 'current' && isSelected ? 'page' : null);
  });
}
