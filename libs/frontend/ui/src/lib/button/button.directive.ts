import { booleanAttribute, Directive, input } from '@angular/core';
import {
  blockBusyActivation,
  BUTTON_HOST,
  buttonHostType,
  syncBusyAria,
  syncSelectedAria,
} from './button-host';
import {
  PtahButtonAlign,
  PtahButtonDensity,
  PtahButtonSelectedAs,
  PtahButtonShape,
  PtahButtonSize,
  PtahButtonTone,
  PtahButtonVariant,
} from './button.types';
@Directive({
  selector: 'button[ptahButton], a[ptahButton]',
  standalone: true,
  host: {
    ...BUTTON_HOST,
    '[attr.data-align]': "align() === 'center' ? null : align()",
    '[class.btn-pill]': "shape() === 'pill'",
    '[attr.data-density]': "density() === 'compact' ? 'compact' : null",
    '[attr.data-no-padding]': "noPadding() && variant() === 'link' ? '' : null",
  },
})
export class PtahButtonDirective {
  /** DaisyUI color recipe. */
  readonly variant = input<PtahButtonVariant>('secondary');
  /** DaisyUI control size. */
  readonly size = input<PtahButtonSize>('sm');
  readonly density = input<PtahButtonDensity>('default');
  /** Remove inline padding from link actions. */
  readonly noPadding = input(false, { transform: booleanAttribute });
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
    syncBusyAria(this.busy);
    syncSelectedAria(this.selected, this.selectedAs);
  }
}
