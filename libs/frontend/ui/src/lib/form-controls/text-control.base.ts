import {
  booleanAttribute,
  computed,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { PtahFieldControlRef } from '../surfaces/field-control-ref';
import { bindAccessibleLabel } from './accessible-label';
import { PtahControlSize, PtahTextTone } from './form-control.types';

/**
 * Shared inputs of `ptahInput`, `ptahTextarea` and `ptahSelect`.
 * `aria-invalid` is `"true"` while `invalid` is set or the wrapping
 * `ptah-field` has an error. It is absent (not `"false"`) when the control is
 * valid. Do not bind `[attr.aria-invalid]` on the host: use `invalid`.
 */
@Directive()
export abstract class PtahTextControlBase implements PtahFieldControlRef {
  /** Control height. The native `size` attribute is not available. */
  readonly size = input<PtahControlSize>('sm');
  readonly tone = input<PtahTextTone>('default');
  readonly invalid = input(false, { transform: booleanAttribute });
  /** Accessible name when no visible label (`ptah-field`, `<label>`) names the control. */
  readonly label = input<string>();

  readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly fieldInvalid = signal(false);
  protected readonly ariaInvalid = computed(() =>
    this.invalid() || this.fieldInvalid() ? 'true' : null,
  );
  protected readonly toneAttr = computed(() =>
    this.tone() === 'default' ? null : this.tone(),
  );

  constructor() {
    bindAccessibleLabel(this.label);
  }

  setFieldInvalid(invalid: boolean): void {
    this.fieldInvalid.set(invalid);
  }
}
