import { booleanAttribute, Directive, input } from '@angular/core';
import {
  blockBusyActivation,
  BUTTON_HOST,
  buttonHostType,
  syncSelectedAria,
} from './button-host';
import { PtahButtonAlign, PtahButtonSelectedAs, PtahButtonShape, PtahButtonSize, PtahButtonTone, PtahButtonVariant } from './button.types';
@Directive({
  selector: 'button[ptahButton], a[ptahButton]',
  standalone: true,
  host: {
    ...BUTTON_HOST,
    '[attr.data-align]': "align() === 'center' ? null : align()",
    '[class.btn-pill]': "shape() === 'pill'",
  },
})
export class PtahButtonDirective {
  /** DaisyUI color recipe. */
  readonly variant = input<PtahButtonVariant>('secondary');
  /** DaisyUI control size. */
  readonly size = input<PtahButtonSize>('sm');
  readonly align = input<PtahButtonAlign>('center');
  readonly shape = input<PtahButtonShape>('default');
  /** Ghost variant ink only; other variants ignore tone. */
  readonly tone = input<PtahButtonTone>('default');
  /**
   * Selected state. Undefined: not a toggle, the owner writes no aria-pressed or aria-current.
   * Do not bind `aria-pressed` by hand together with `selected`.
   */
  readonly selected = input<boolean | undefined>(undefined);
  readonly selectedAs = input<PtahButtonSelectedAs>('pressed');
  /** Native `type`. A `button` element defaults to `button`, also after a binding removes it. */
  readonly type = input<string>();
  /** Blocks activation while keeping the control focusable. */
  readonly busy = input(false, { transform: booleanAttribute });
  protected readonly hostType = buttonHostType(this.type);
  constructor() {
    blockBusyActivation(this.busy);
    syncSelectedAria(this.selected, this.selectedAs);
  }
}
