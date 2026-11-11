import { Directive } from '@angular/core';
import { PtahFieldControlRef } from '../surfaces/field-control-ref';
import { PtahTextControlBase } from './text-control.base';

/**
 * Owner of the native `<input>` look. Keeps the native element, value and
 * events. Layout classes (width, margin, padding for an icon) stay with the
 * consumer. Look: ptah-form-controls.css.
 * `size` is the control height (xs, sm, md), not the native `size` attribute.
 * Set the width with a class. Checkbox and radio inputs use their own owners.
 */
@Directive({
  selector: 'input[ptahInput]:not([type=checkbox]):not([type=radio])',
  standalone: true,
  providers: [{ provide: PtahFieldControlRef, useExisting: PtahInputDirective }],
  host: {
    class: 'input input-bordered',
    // Scopes the token look in ptah-form-controls.css to directive hosts.
    'data-ptah-control': 'input',
    '[class.input-xs]': "size() === 'xs'",
    '[class.input-sm]': "size() === 'sm'",
    '[class.input-md]': "size() === 'md'",
    '[attr.data-ptah-tone]': 'toneAttr()',
    '[attr.aria-invalid]': 'ariaInvalid()',
  },
})
export class PtahInputDirective extends PtahTextControlBase {}
