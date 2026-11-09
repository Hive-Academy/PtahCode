import { Directive, ElementRef, inject } from '@angular/core';

/** Marks the projected native control that `ptah-field` wires to its hint/error. */
@Directive({
  selector:
    'input[ptahFieldControl], select[ptahFieldControl], textarea[ptahFieldControl]',
  standalone: true,
})
export class PtahFieldControlDirective {
  readonly element = inject(ElementRef<HTMLElement>);
  readonly originalDescription =
    this.element.nativeElement.getAttribute('aria-describedby');

  constructor() {
    const control = this.element.nativeElement;
    const type = control.tagName.toLowerCase();
    control.classList.add(type, `${type}-sm`, 'border-surface-border', 'text-sm');
  }
}
