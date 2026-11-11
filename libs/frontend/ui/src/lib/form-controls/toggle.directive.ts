import { Directive } from '@angular/core';
import { PtahChoiceControlBase } from './choice-control.base';

/**
 * Owner of the on/off switch: a native checkbox with `role="switch"`. The
 * native `checked` state gives the switch state, so no `aria-checked` is set.
 * Requires a static `type="checkbox"`. Look: ptah-form-controls.css.
 */
@Directive({
  selector: 'input[type=checkbox][ptahToggle]',
  standalone: true,
  host: {
    class: 'toggle toggle-primary',
    role: 'switch',
    'data-ptah-control': 'toggle',
    '[class.toggle-xs]': "size() === 'xs'",
    '[class.toggle-sm]': "size() === 'sm'",
  },
})
export class PtahToggleDirective extends PtahChoiceControlBase {}
