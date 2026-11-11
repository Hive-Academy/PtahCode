import { Directive } from '@angular/core';
import { PtahChoiceControlBase } from './choice-control.base';

/**
 * Owner of the native checkbox look. One tone: primary when checked.
 * Requires a static `type="checkbox"`. Look: ptah-form-controls.css.
 */
@Directive({
  selector: 'input[type=checkbox][ptahCheckbox]',
  standalone: true,
  host: {
    class: 'checkbox checkbox-primary',
    'data-ptah-control': 'checkbox',
    '[class.checkbox-xs]': "size() === 'xs'",
    '[class.checkbox-sm]': "size() === 'sm'",
  },
})
export class PtahCheckboxDirective extends PtahChoiceControlBase {}
