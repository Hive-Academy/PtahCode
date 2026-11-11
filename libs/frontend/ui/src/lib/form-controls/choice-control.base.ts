import { Directive, input } from '@angular/core';
import { bindAccessibleLabel } from './accessible-label';
import { PtahChoiceSize } from './form-control.types';

/** Shared inputs of `ptahCheckbox` and `ptahToggle`. */
@Directive()
export abstract class PtahChoiceControlBase {
  readonly size = input<PtahChoiceSize>('sm');
  /** Accessible name when no visible `<label>` names the control. */
  readonly label = input<string>();

  constructor() {
    bindAccessibleLabel(this.label);
  }
}
