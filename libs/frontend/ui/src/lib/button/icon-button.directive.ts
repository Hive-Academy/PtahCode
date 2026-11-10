import { booleanAttribute, Directive, input } from '@angular/core';
import {
  blockBusyActivation,
  BUTTON_HOST,
  defaultButtonType,
} from './button-host';
import { PtahButtonSize, PtahButtonVariant } from './button.types';
import { PtahTooltipDirective } from './tooltip.directive';
@Directive({
  selector: 'button[ptahIconButton], a[ptahIconButton]',
  standalone: true,
  host: { ...BUTTON_HOST, '[class.btn-square]': 'true', '[attr.aria-label]': 'label()' },
  hostDirectives: [
    { directive: PtahTooltipDirective, inputs: ['ptahTooltip: label'] },
  ],
})
export class PtahIconButtonDirective {
  /** Accessible name and visible tooltip text. */
  readonly label = input.required<string>();
  /** DaisyUI color recipe. */
  readonly variant = input<Exclude<PtahButtonVariant, 'link'>>('ghost');
  /** DaisyUI control size. */
  readonly size = input<PtahButtonSize>('sm');
  /** Blocks activation while keeping the control focusable. */
  readonly busy = input(false, { transform: booleanAttribute });
  constructor() {
    blockBusyActivation(this.busy);
    defaultButtonType();
  }
}
