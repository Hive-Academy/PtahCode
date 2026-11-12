import { Directive, ElementRef, inject } from '@angular/core';
import { PtahFieldControlRef } from './field-control-ref';

/** Marks the projected native control that `ptah-field` wires to its hint/error. */
@Directive({
  selector:
    'input[ptahFieldControl], select[ptahFieldControl], textarea[ptahFieldControl]',
  standalone: true,
  providers: [
    { provide: PtahFieldControlRef, useExisting: PtahFieldControlDirective },
  ],
})
export class PtahFieldControlDirective implements PtahFieldControlRef {
  readonly element = inject(ElementRef<HTMLElement>);

  constructor() {
    const control = this.element.nativeElement;
    const type = control.tagName.toLowerCase();
    control.classList.add(type, `${type}-sm`, 'border-surface-border', 'text-sm');
  }

  setFieldInvalid(invalid: boolean): void {
    const control = this.element.nativeElement;
    if (invalid) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
  }
}
