import { Directive } from '@angular/core';
import { PtahFieldControlRef } from '../surfaces/field-control-ref';
import { PtahTextControlBase } from './text-control.base';

/**
 * Owner of the native `<textarea>` look. Keeps the native element, value and
 * events. Layout classes (width, margin, padding for an icon) stay with the
 * consumer. Look: ptah-form-controls.css.
 */
@Directive({
  selector: 'textarea[ptahTextarea]',
  standalone: true,
  providers: [{ provide: PtahFieldControlRef, useExisting: PtahTextareaDirective }],
  host: {
    class: 'textarea textarea-bordered',
    // Scopes the token look in ptah-form-controls.css to directive hosts.
    'data-ptah-control': 'textarea',
    '[class.textarea-xs]': "size() === 'xs'",
    '[class.textarea-sm]': "size() === 'sm'",
    '[class.textarea-md]': "size() === 'md'",
    '[attr.data-ptah-tone]': 'toneAttr()',
    '[attr.aria-invalid]': 'ariaInvalid()',
  },
})
export class PtahTextareaDirective extends PtahTextControlBase {}
