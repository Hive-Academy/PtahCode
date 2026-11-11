import { Directive } from '@angular/core';
import { PtahFieldControlRef } from '../surfaces/field-control-ref';
import { PtahTextControlBase } from './text-control.base';

/**
 * Owner of the native `<select>` look. Keeps the native element, value and
 * events. Layout classes (width, margin, padding for an icon) stay with the
 * consumer. Look: ptah-form-controls.css.
 * `size` is the control height (xs, sm, md), not the native `size` attribute.
 */
@Directive({
  selector: 'select[ptahSelect]',
  standalone: true,
  providers: [{ provide: PtahFieldControlRef, useExisting: PtahSelectDirective }],
  host: {
    class: 'select select-bordered',
    // Scopes the token look in ptah-form-controls.css to directive hosts.
    'data-ptah-control': 'select',
    '[class.select-xs]': "size() === 'xs'",
    '[class.select-sm]': "size() === 'sm'",
    '[class.select-md]': "size() === 'md'",
    '[attr.data-ptah-tone]': 'toneAttr()',
    '[attr.aria-invalid]': 'ariaInvalid()',
  },
})
export class PtahSelectDirective extends PtahTextControlBase {}
