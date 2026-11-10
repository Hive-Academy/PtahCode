import { booleanAttribute, Directive, input } from '@angular/core';
import {
  blockBusyActivation,
  BUTTON_HOST,
  buttonHostType,
} from './button-host';
import { PtahButtonSize, PtahButtonVariant } from './button.types';
@Directive({
  selector: 'button[ptahButton], a[ptahButton]',
  standalone: true,
  host: { ...BUTTON_HOST, '[class.btn-square]': 'iconOnly()' },
})
export class PtahButtonDirective {
  /** DaisyUI color recipe. */
  readonly variant = input<PtahButtonVariant>('secondary');
  /** DaisyUI control size. */
  readonly size = input<PtahButtonSize>('sm');
  /** @deprecated Gallery compatibility; use ptahIconButton with a label for new uses. */
  readonly iconOnly = input(false, { transform: booleanAttribute });
  /** Native `type`. A `button` element defaults to `button`, also after a binding removes it. */
  readonly type = input<string>();
  /** Blocks activation while keeping the control focusable. */
  readonly busy = input(false, { transform: booleanAttribute });
  protected readonly hostType = buttonHostType(this.type);
  constructor() {
    blockBusyActivation(this.busy);
  }
}
