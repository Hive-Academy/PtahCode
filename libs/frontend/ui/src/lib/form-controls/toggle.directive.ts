import { booleanAttribute, Directive, input } from '@angular/core';
import { PtahChoiceControlBase } from './choice-control.base';

/**
 * Owner of the on/off switch: a native checkbox with `role="switch"`. The
 * native `checked` state gives the switch state, so no `aria-checked` is set.
 * A switch has no mixed state: while `indeterminate` is true the role is
 * removed, so the native checkbox role reports the mixed state.
 * Requires a static `type="checkbox"`. Look: ptah-form-controls.css.
 */
@Directive({
  selector: 'input[type=checkbox][ptahToggle]',
  standalone: true,
  host: {
    class: 'toggle toggle-primary',
    '[attr.role]': "indeterminate() ? null : 'switch'",
    '[indeterminate]': 'indeterminate()',
    'data-ptah-control': 'toggle',
    '[class.toggle-xs]': "size() === 'xs'",
    '[class.toggle-sm]': "size() === 'sm'",
  },
})
export class PtahToggleDirective extends PtahChoiceControlBase {
  /** Unknown state. Written to the native `indeterminate` property. */
  readonly indeterminate = input(false, { transform: booleanAttribute });
}
