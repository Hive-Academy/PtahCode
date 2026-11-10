import {
  booleanAttribute,
  Directive,
  input,
} from '@angular/core';
import { blockBusyActivation, BUTTON_HOST, defaultButtonType } from './button-host';
import { PtahButtonSize, PtahButtonVariant } from './button.types';
@Directive({
  selector: 'button[ptahButton], a[ptahButton]',
  standalone: true,
  host: { ...BUTTON_HOST, '[class.btn-square]': 'iconOnly()' },
})
/** A bound type that later becomes null can remove the default button type. */
export class PtahButtonDirective {
  /** DaisyUI color recipe. */
  readonly variant = input<PtahButtonVariant>('secondary');
  /** DaisyUI control size. */
  readonly size = input<PtahButtonSize>('sm');
  /** @deprecated Gallery compatibility; use ptahIconButton with a label for new uses. */
  readonly iconOnly = input(false, { transform: booleanAttribute });
  /** Blocks activation while keeping the control focusable. */
  readonly busy = input(false, { transform: booleanAttribute });
  constructor() {
    blockBusyActivation(this.busy);
    defaultButtonType();
  }
}
