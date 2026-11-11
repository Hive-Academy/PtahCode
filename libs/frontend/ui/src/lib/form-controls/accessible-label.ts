import { effect, ElementRef, inject } from '@angular/core';

/**
 * Sets `aria-label` from the `label` input of a control directive. It writes
 * the attribute only while `label` has a value, so a static `aria-label` or an
 * `[attr.aria-label]` binding of the consumer stays when `label` is not set.
 * Use `label` only when no visible label names the control.
 */
export function bindAccessibleLabel(label: () => string | undefined): void {
  const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  // A static aria-label is on the element before the directive starts. It
  // comes back when label loses its value.
  const original = element.getAttribute('aria-label');
  let owned = false;
  effect(() => {
    const value = label();
    if (value) {
      element.setAttribute('aria-label', value);
      owned = true;
    } else if (owned) {
      if (original === null) element.removeAttribute('aria-label');
      else element.setAttribute('aria-label', original);
      owned = false;
    }
  });
}
